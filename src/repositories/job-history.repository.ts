import jobCandidateModel from "../models/job-candidate.model";
import jobCustomfieldsModel from "../models/job-custom-fields.model";
import jobFoundationDataTypeModel from "../models/job-foundation-data-type.model";
import JobQulificationType from "../models/job-qulification-type.model";
import jobRateModel from "../models/job-rate.model";
import JobModel from "../models/job.model";
import { FieldChange } from "../interfaces/job-histroy.interface";
import { isEqual } from "../utility/job-history";

export type UpdatedFields = Record<string, FieldChange>;

export class JobComparisonService {
  async getJobSnapshot(program_id: string, job_id: string): Promise<any> {
    const job = await JobModel.findOne({
      where: { program_id, id: job_id },
      include: [
        { model: jobCandidateModel, required: false },
        { model: jobCustomfieldsModel, required: false },
        { model: jobFoundationDataTypeModel, required: false },
        { model: JobQulificationType, required: false },
        { model: jobRateModel, required: false },
      ],
    });

    if (!job) throw new Error("Job not found");

    return {
      ...job.toJSON(),
      candidates: job.candidates || [],
      customFields: job.customFields || [],
      foundationDataTypes: job.foundationDataTypes || [],
      qualifications: job.qualifications || [],
      rates: job.rates || [],
    };
  }

  async compareJobPayload(oldData: any, newData: any): Promise<UpdatedFields> {
    const changes: UpdatedFields = {};
    this.deepCompare(oldData, newData, changes);
    return this.filterRealChanges(changes);
  }

  private deepCompare(
    oldVal: any,
    newVal: any,
    changes: UpdatedFields,
    path = ""
  ) {
    const fieldName = path.split(".").pop() || "";
    if (this.shouldSkipField(fieldName)) return;

    const normalizedOld = this.normalizeValue(oldVal);
    const normalizedNew = this.normalizeValue(newVal);

    if (this.isPrimitive(normalizedOld) || this.isPrimitive(normalizedNew)) {
      if (!this.valuesEqual(normalizedOld, normalizedNew)) {
        changes[path] = { newValue: newVal, oldValue: oldVal };
      }
      return;
    }

    if (
      path.includes("rate") ||
      path.includes("bill_rate") ||
      path.includes("pay_rate")
    ) {
      this.compareRateStructure(oldVal, newVal, changes, path);
      return;
    }

    if (Array.isArray(oldVal) || Array.isArray(newVal)) {
      this.compareArrays(oldVal, newVal, changes, path);
      return;
    }
    const oldKeys = Object.keys(oldVal || {});
    const newKeys = Object.keys(newVal || {});
    const commonKeys = oldKeys.filter((key) => newKeys.includes(key));

    for (const key of commonKeys) {
      if (this.shouldSkipField(key)) continue;
      const currentPath = path ? `${path}.${key}` : key;
      this.deepCompare(oldVal[key], newVal[key], changes, currentPath);
    }
  }

  private filterRealChanges(changes: UpdatedFields): UpdatedFields {
    const filtered: UpdatedFields = {};

    for (const [path, change] of Object.entries(changes)) {
      if (this.valuesEqual(change.oldValue, change.newValue)) continue;

      if (this.isSystemField(path.split(".").pop() || "")) continue;

      filtered[path] = change;
    }

    return filtered;
  }

  private valuesEqual(a: any, b: any): boolean {
    const numA =
      typeof a === "string"
        ? parseFloat(a.replace(/[^0-9.-]/g, ""))
        : Number(a);
    const numB =
      typeof b === "string"
        ? parseFloat(b.replace(/[^0-9.-]/g, ""))
        : Number(b);

    if (!isNaN(numA) && !isNaN(numB)) {
      return Math.abs(numA - numB) < 0.000001;
    }

    if (typeof a === "boolean" && typeof b === "boolean") {
      return a === b;
    }
    if (a instanceof Date || b instanceof Date) {
      return new Date(a).getTime() === new Date(b).getTime();
    }

    return isEqual(a, b);
  }

  private isSystemField(fieldName: string): boolean {
    const systemFields = [
      "created_by",
      "created_on",
      "updated_by",
      "updated_on",
      "is_deleted",
      "program_id",
      "job_id",
      "event_slug",
      "userType",
      "userId",
    ];
    return systemFields.includes(fieldName);
  }

  private isEmptyAddition(
    path: string,
    change: FieldChange,
    oldData: any,
    newData: any
  ): boolean {
    if (change.oldValue === undefined) {
      const newValue = this.getValueFromPath(newData, path);
      return this.isEmptyValue(newValue);
    }
    return false;
  }

  private isEmptyValue(value: any): boolean {
    if (value === null || value === undefined) return true;
    if (value === "") return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "object") return Object.keys(value).length === 0;
    return false;
  }

  private getValueFromPath(obj: any, path: string): any {
    return path.split(".").reduce((o, p) => o?.[p], obj);
  }

  private normalizeValue(value: any): any {
    if (value instanceof Date) return value.toISOString();
    if (value === null) return undefined;

    // Handle all numeric values consistently
    if (typeof value === "string") {
      // Check if string is a numeric value (including currency strings)
      const numericString = value.replace(/[^0-9.-]/g, "");
      if (!isNaN(Number(numericString)) && numericString !== "") {
        return parseFloat(Number(numericString).toFixed(8));
      }
    }

    // Convert all numbers to fixed decimal places
    if (typeof value === "number") {
      return parseFloat(value.toFixed(8));
    }

    return value;
  }

  private compareRateStructure(
    oldVal: any,
    newVal: any,
    changes: UpdatedFields,
    path: string
  ) {
    if (this.isPrimitive(oldVal) || this.isPrimitive(newVal)) {
      if (newVal !== oldVal) {
        changes[path] = {
          newValue: newVal,
          oldValue: oldVal,
        };
      }
      return;
    }

    for (const key in newVal) {
      if (this.shouldSkipField(key)) continue;
      const currentPath = path ? `${path}.${key}` : key;

      if (Array.isArray(newVal[key])) {
        this.compareRateArrays(
          oldVal?.[key] || [],
          newVal[key],
          changes,
          currentPath
        );
      } else {
        this.compareRateStructure(
          oldVal?.[key],
          newVal[key],
          changes,
          currentPath
        );
      }
    }
  }

  private compareRateArrays(
    oldArray: any[],
    newArray: any[],
    changes: UpdatedFields,
    path: string
  ) {
    if (isEqual(oldArray, newArray)) return;

    const maxLength = Math.max(oldArray.length, newArray.length);

    for (let i = 0; i < maxLength; i++) {
      const elementPath = `${path}[${i}]`;

      if (i >= oldArray.length) {
        changes[elementPath] = {
          newValue: newArray[i],
          oldValue: undefined,
        };
        continue;
      }

      if (i >= newArray.length) {
        changes[elementPath] = {
          newValue: undefined,
          oldValue: oldArray[i],
        };
        continue;
      }

      if (!isEqual(oldArray[i], newArray[i])) {
        this.compareRateStructure(
          oldArray[i],
          newArray[i],
          changes,
          elementPath
        );
      }
    }
  }

  private compareArrays(
    oldArray: any[],
    newArray: any[],
    changes: UpdatedFields,
    path: string
  ) {
    if (isEqual(oldArray, newArray)) return;

    changes[path] = {
      oldValue: oldArray,
      newValue: newArray,
    };
  }

  private isPrimitive(value: any): boolean {
    return value === null || typeof value !== "object";
  }

  private shouldSkipField(key: string): boolean {
    return (
      key.startsWith("_") ||
      [
        "userType",
        "userId",
        "updated_on",
        "created_on",
        "updated_by",
        "created_by",
      ].includes(key)
    );
  }
}
