import CandidateHistoryModel from "../models/candidate-history.model";
import { QueryTypes, Sequelize } from 'sequelize';
import { databaseConfig } from "../config/db";
import { getEntityMap, getJobTemplateMap } from "./candidate_history_queries";
import { candidateHistoryExcludeFields, createActions, updateActions } from "./candidate-history-actions";

const config_db = databaseConfig.config.database_config;

export class CandidateHistoryService {
    constructor(private sequelize: Sequelize) { }

    async generateRevision(program_id: string, candidate_id: string) {
        const latestRecord = await CandidateHistoryModel.findOne({
            where: { program_id, candidate_id },
            attributes: ['revision'],
            order: [['revision', 'DESC']],
        });
        const latestRevision = latestRecord?.revision ?? -1;
        return latestRevision + 1;
    }

    generateCompareMetaData(oldData: any, newData: any): Record<string, any> {
        const result: Record<string, any> = {};

        const formatKey = (slug: string): string => {
            return slug
                .split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        };

        const deepEqual = (a: any, b: any): boolean => {
            if (a === b) return true;
            if (typeof a !== typeof b) return false;

            if (typeof a === 'object' && a !== null && b !== null) {
                if (Array.isArray(a) && Array.isArray(b)) {
                    if (a.length !== b.length) return false;
                    for (let i = 0; i < a.length; i++) {
                        if (!deepEqual(a[i], b[i])) return false;
                    }
                    return true;
                } else if (!Array.isArray(a) && !Array.isArray(b)) {
                    const keysA = Object.keys(a);
                    const keysB = Object.keys(b);
                    if (keysA.length !== keysB.length) return false;
                    for (const key of keysA) {
                        if (!deepEqual(a[key], b[key])) return false;
                    }
                    return true;
                }
                return false;
            }

            return false;
        };

        const deepCompare = (path: string[], oldVal: any, newVal: any) => {
            const slug = path.length > 0 ? path.join('_') : 'checklist_data';

            if (candidateHistoryExcludeFields.includes(slug)) return;

            if (
                typeof oldVal === 'object' && oldVal !== null &&
                typeof newVal === 'object' && newVal !== null &&
                !Array.isArray(oldVal) && !Array.isArray(newVal)
            ) {
                for (const key of new Set([...Object.keys(oldVal), ...Object.keys(newVal)])) {
                    deepCompare([...path, key], oldVal[key], newVal[key]);
                }
            } else {
                const isOldEmpty = oldVal === undefined || oldVal === null || oldVal === '' || (Array.isArray(oldVal) && oldVal.length === 0);
                const isNewEmpty = newVal === undefined || newVal === null || newVal === '' || (Array.isArray(newVal) && newVal.length === 0);

                const normalizedOldVal = this.stripNestedExcludedFields(this.normalizeDate(oldVal));
                const normalizedNewVal = this.stripNestedExcludedFields(this.normalizeDate(newVal));

                if (!deepEqual(normalizedOldVal, normalizedNewVal) && !(isOldEmpty && isNewEmpty)) {
                    result[slug] = {
                        key: formatKey(slug),
                        slug,
                        old_value: normalizedOldVal ?? null,
                        new_value: normalizedNewVal ?? null,
                    };
                }
            }
        };

        deepCompare([], oldData, newData);
        return result;
    }

    async populateNewMetaData(compareMetaData: any) {
        if (!compareMetaData || typeof compareMetaData !== "object") {
            console.warn("Invalid compareMetaData received");
            return {};
        }

        const result = { ...compareMetaData };
        const idMap: Record<string, Set<string>> = {
            candidate_id: new Set(),
            country_id: new Set(),
            job_category: new Set(),
            interviewers: new Set(),
            user_id: new Set(),
            job_id: new Set(),
            vendor_id: new Set(),
        };

        for (const key of Object.keys(idMap)) {
            const field = compareMetaData[key];
            if (!field || typeof field !== "object") continue;

            const addToSet = (val: any) => {
                if (Array.isArray(val)) val.forEach(v => idMap[key].add(v));
                else if (val) idMap[key].add(val);
            };

            const { new_value, old_value } = field;
            addToSet(new_value);
            addToSet(old_value);
        }

        const [
            candidateMap,
            countryMap,
            jobCategoryMap,
            interviewersMap,
            userMap,
            vendorMap,
            jobTemplateMap,
        ] = await Promise.all([
            getEntityMap(this.sequelize, 'candidates', 'id', ['first_name', 'last_name'], Array.from(idMap.candidate_id)),
            getEntityMap(this.sequelize, 'countries', 'id', ['name'], Array.from(idMap.country_id)),
            getEntityMap(this.sequelize, 'job_category', 'id', ['title'], Array.from(idMap.job_category)),
            getEntityMap(this.sequelize, 'user', 'user_id', ['first_name', 'last_name'], Array.from(idMap.interviewers)),
            getEntityMap(this.sequelize, 'user', 'user_id', ['first_name', 'last_name'], Array.from(idMap.user_id)),
            getEntityMap(this.sequelize, 'program_vendors', 'id', ['display_name'], Array.from(idMap.vendor_id)),
            getJobTemplateMap(this.sequelize, Array.from(idMap.job_id)),
        ]);

        for (const key of Object.keys(idMap)) {
            const field = compareMetaData[key];
            if (!field || typeof field !== "object") continue;

            const { new_value, old_value } = field;

            const map = key === "candidate_id" ? candidateMap :
                key === "country_id" ? countryMap :
                    key === "job_category" ? jobCategoryMap :
                        key === "interviewers" ? interviewersMap :
                            key === "user_id" ? userMap :
                                key === "job_id" ? jobTemplateMap :
                                    key === "vendor_id" ? vendorMap : {};

            const formatValue = (val: any) => {
                if (Array.isArray(val)) return val.map(id => map[id]).filter(Boolean);
                return map[val] ?? null;
            };

            result[key] = {
                ...field,
                new_value: formatValue(new_value),
                old_value: formatValue(old_value),
            };
        }

        return result;
    }

    async handleCandidateHistory({
        program_id,
        oldData,
        newData,
        action,
    }: {
        program_id: string;
        oldData: any;
        newData: any;
        action: string;
    }) {
        console.log("OLD data ::", oldData);
        console.log("New DATa ::", newData)
        let new_meta_data = null;
        let compare_meta_data = null;

        const normalizedAction = action?.toLowerCase();
        console.log("normalizedAction->", normalizedAction)
        if (createActions.map(a => a.toLowerCase()).includes(normalizedAction)) {
            new_meta_data = this.removeCircularReferences(oldData);
        } else if (updateActions.map(a => a.toLowerCase()).includes(normalizedAction)) {
            compare_meta_data = this.removeCircularReferences(
                this.generateCompareMetaData(oldData, newData)
            );
        } else {
            console.warn(`Unrecognized action type: ${action}`);
        }

        const candidate_id = await this.fetchCandidateId(oldData, newData);
        const revision = await this.generateRevision(program_id, candidate_id);

        const newRecord = await CandidateHistoryModel.create({
            program_id,
            candidate_id,
            job_id: newData?.job_id ?? oldData?.job_id ?? null,
            vendor_id: newData?.vendor_id ?? oldData?.vendor_id ?? null,
            revision,
            reason: newData?.reason ?? oldData?.reason ?? null,
            note: newData?.notes ?? oldData?.notes ?? null,
            action,
            new_meta_data,
            compare_meta_data,
            created_by: newData?.created_by ?? oldData?.created_by ?? null,
            updated_by: newData?.updated_by ?? oldData?.updated_by ?? null,
            status: newData?.status ?? oldData?.status ?? 'active',
            is_active: newData?.is_active ?? oldData?.is_active ?? true,
            is_deleted: newData?.is_deleted ?? oldData?.is_deleted ?? 0,
            created_on: Date.now(),
            updated_on: Date.now(),
        });

        return newRecord;
    }

    async fetchCandidateId(oldData: any, newData: any): Promise<string> {
        let candidate_id;
        if (oldData?.id) {
            candidate_id = oldData?.id ?? newData?.id;
        } else {
            candidate_id = oldData?.candidate_id ?? newData?.candidate_id;
        }

        if (!candidate_id) {
            candidate_id = oldData?.id ?? newData?.id;
            console.log("No candidate_id found, falling back to id: ", candidate_id);
        }

        if (!candidate_id) {
            throw new Error('Candidate ID or ID is required for revision tracking');
        }

        return candidate_id;
    }

    normalizeDate(value: any): any {
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                return date.toISOString();
            }
        }

        if (value instanceof Date) {
            return value.toISOString().split('T')[0];
        }

        return value;
    }

    removeCircularReferences(obj: any, seen = new WeakSet()): any {
        if (obj && typeof obj === "object") {
            if (seen.has(obj)) {
                return undefined;
            }
            seen.add(obj);

            const cleanObj: Record<string, any> | any[] = Array.isArray(obj) ? [] : {};

            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    const value = obj[key];
                    (cleanObj as any)[key] = this.removeCircularReferences(value, seen);
                }
            }
            return cleanObj;
        }
        return obj;
    }

    static toReadableKey(slug: string): string {
        return slug
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }


    private stripNestedExcludedFields(value: any): any {
        const excludedKeys = ['max_phone_length', 'min_phone_length'];

        if (Array.isArray(value)) {
            return value.map(item => this.stripNestedExcludedFields(item));
        }

        if (value && typeof value === 'object') {
            const result: Record<string, any> = {};
            for (const key in value) {
                if (!excludedKeys.includes(key)) {
                    result[key] = this.stripNestedExcludedFields(value[key]);
                }
            }
            return result;
        }

        return value;
    }


}
