import JobDistributionRepository from "../repositories/job-distridution.repository";
import { sequelize } from "../config/instance";
import { QueryTypes, Transaction } from "sequelize";
import JobModel from "../models/job.model";
import JobDistributionModel from "../models/job-distribution.model";
import { buildMinimalChanges, createJobHistoryRecord } from "../controllers/job-history.controller";
import { getVendorDistributionScheduleByIds } from "../controllers/job.controller";
import JobDistributionNotificationService from "../notification/job-distribution-notification-service";
import { sendNotification } from "../utility/notificationService";
import { databaseConfig } from '../config/db';
import { getActiveVendors } from "../controllers/job-distribution.controller";
const jobDistributionRepository = new JobDistributionRepository();
const jobDistributionNotificationService = new JobDistributionNotificationService();
const config_db = databaseConfig.config.database_config;

interface ServiceResponse {
  success: boolean;
  message: string;
  trace_id: string;
  data?: any;
}

interface VendorDistribution {
  vendor_id: string;
  vendor_group_id: string | null;
  duration: string;
  measure_unit: string;
}

interface TemplateResult {
  is_manual_distribute_submit: boolean;
  is_review_configured_or_submit: boolean;
  is_distribute_final_approval: boolean;
  template_name: string;
  submission_limit_vendor: number;
}

export class JobDistributionService {
  private jobDistributionRepo: JobDistributionRepository;
  private readonly HOLD_STATUSES = ["HOLD", "PENDING_REVIEW", "DRAFT", "FILLED", "CLOSED", "REJECTED"];

  constructor() {
    this.jobDistributionRepo = new JobDistributionRepository();
  }

  async createJobDistribution(program_id:string,jobDistributionData:any,token:any,userFromToken:any,traceId:any): Promise<ServiceResponse> {
    const transaction = await sequelize.transaction();

    try {
      const { distribute_method, schedules, status, job_id } = jobDistributionData;

      const { job, templateResult } = await this.fetchJobAndTemplateData(job_id, transaction);
      const jobDetails = job.dataValues;
      const result = templateResult[0];

      await this.validateJobForDistribution(job, result);

      const { allVendorIds, vendorDistributions } = await this.processVendorDistributions(
        schedules, 
        transaction
      );

      const distributionsToCreate = await this.prepareDistributionsToCreate(
        allVendorIds,
        vendorDistributions,
        program_id,
        jobDetails,
        job_id,
        distribute_method,
        status,
        result,
        userFromToken?.sub,
        transaction
      );

      const newJobStatus = await this.createDistributionsAndUpdateJob(
        distributionsToCreate,
        job,
        job_id,
        program_id,
        transaction
      );

      await transaction.commit();

      this.handleBackgroundTasks(
        job,
        job_id,
        program_id,
        newJobStatus,
        userFromToken,
        token,
        traceId,
        schedules,
        result?.template_name
      );

      return {
        success: true,
        message: "Job distribution created successfully",
        trace_id: traceId
      };

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  private async fetchJobAndTemplateData(job_id: string, transaction: Transaction) {
    const [job, templateResult] = await Promise.all([
      JobModel.findOne({ where: { id: job_id }, transaction }),
      sequelize.query<TemplateResult>(
        `SELECT
          jt.is_manual_distribute_submit,
          jt.is_review_configured_or_submit,
          jt.is_distribute_final_approval,
          jt.template_name,
          jt.submission_limit_vendor
        FROM jobs j
        JOIN ${config_db}.job_templates jt ON j.job_template_id = jt.id
        WHERE j.id = :job_id`,
        { replacements: { job_id }, type: QueryTypes.SELECT, transaction }
      )
    ]);

    if (!job) {
      throw new Error("Job not found");
    }

    if (!templateResult.length) {
      throw new Error("Job template not found");
    }

    return { job, templateResult };
  }

  private async validateJobForDistribution(job: any, templateResult: TemplateResult): Promise<void> {
    const jobStatus = job?.status;

    if (jobStatus === "PENDING_APPROVAL" || jobStatus === "PENDING_APPROVAL_SOURCING") {
      const isDistributable = templateResult?.is_manual_distribute_submit && 
                            templateResult?.is_review_configured_or_submit;

      if (!isDistributable) {
        throw new Error("Job can be distributed once Approval is completed.");
      }
    } else if (this.HOLD_STATUSES.includes(jobStatus)) {
      let message = `Job is currently on ${jobStatus} job cannot be distributed.`;
      
      if (jobStatus === "PENDING_REVIEW") {
        message = "Job can be distributed once Review is completed.";
      } else if (jobStatus === "REJECTED") {
        message = "Job distribution is not allowed for rejected jobs.";
      }
      
      throw new Error(message);
    }
  }

  private async processVendorDistributions(
    schedules: any[], 
    transaction: Transaction
  ): Promise<{ allVendorIds: Set<string>; vendorDistributions: VendorDistribution[] }> {
    const allVendorIds = new Set<string>();
    const vendorDistributions: VendorDistribution[] = [];

    for (const schedule of schedules) {
      const { duration, measure_unit, vendor_id, vendor_group_id } = schedule;

      if (vendor_id && vendor_id.length > 0) {
        vendor_id.forEach((id: string) => {
          allVendorIds.add(id);
          vendorDistributions.push({
            vendor_id: id,
            vendor_group_id: null,
            duration,
            measure_unit
          });
        });
      }

      if (vendor_group_id && vendor_group_id.length > 0) {
        const groupVendors = await this.getVendorsFromGroups(vendor_group_id, transaction);
        
        groupVendors.forEach(({ vendors, groupId }) => {
          vendors.forEach((vendorId: string) => {
            allVendorIds.add(vendorId);
            vendorDistributions.push({
              vendor_id: vendorId,
              vendor_group_id: groupId,
              duration,
              measure_unit
            });
          });
        });
      }
    }

    return { allVendorIds, vendorDistributions };
  }

  private async getVendorsFromGroups(
    vendor_group_id: string[], 
    transaction: Transaction
  ): Promise<Array<{ vendors: string[]; groupId: string }>> {
    const vendorGroupQueries = vendor_group_id.map((groupId: string) =>
      sequelize.query<{ vendors: string }>(
        `SELECT vendors FROM ${config_db}.vendor_groups WHERE id = :groupId`,
        { type: QueryTypes.SELECT, replacements: { groupId }, transaction }
      )
    );

    const vendorGroupResults = await Promise.all(vendorGroupQueries);
    const groupVendors: Array<{ vendors: string[]; groupId: string }> = [];

    vendorGroupResults.forEach((groupResult, index) => {
      const vendorGroup = groupResult[0];
      if (vendorGroup && vendorGroup.vendors) {
        const vendorIds = Array.isArray(vendorGroup.vendors)
          ? vendorGroup.vendors
          : JSON.parse(vendorGroup.vendors);

        if (Array.isArray(vendorIds)) {
          groupVendors.push({
            vendors: vendorIds,
            groupId: vendor_group_id[index]
          });
        }
      }
    });

    return groupVendors;
  }

  private async prepareDistributionsToCreate(
    allVendorIds: Set<string>,
    vendorDistributions: VendorDistribution[],
    program_id: string,
    jobDetails: any,
    job_id: string,
    distribute_method: any,
    status: string,
    templateResult: TemplateResult,
    userId: string,
    transaction: Transaction
  ): Promise<any[]> {
    const [activeVendors, existingDistributions] = await Promise.all([
      getActiveVendors(allVendorIds, program_id, jobDetails, transaction),
      JobDistributionModel.findAll({
        where: {
          job_id,
          vendor_id: Array.from(allVendorIds)
        },
        transaction,
      })
    ]);

    const activeVendorMap = new Map(
      activeVendors.map(v => [v.vendor_id, v.is_job_auto_opt_in])
    );

    const existingDistributionMap = new Map(
      existingDistributions.map(d => [d.vendor_id, d])
    );

    const toDestroy = existingDistributions.filter(d => d.status === "scheduled");
    if (toDestroy.length > 0) {
      await Promise.all(toDestroy.map(d => d.destroy({ transaction })));
    }

    const distributionsToCreate: any[] = [];
    const currentDate = Date.now();

    vendorDistributions.forEach(({ vendor_id, vendor_group_id, duration, measure_unit }) => {
      const isActive = activeVendorMap.has(vendor_id);
      const existingRecord = existingDistributionMap.get(vendor_id);

      if (isActive && (!existingRecord || existingRecord.status === "scheduled")) {
        const optStatus = activeVendorMap.get(vendor_id) ? "OPT_IN" : null;

        distributionsToCreate.push({
          distribute_method,
          program_id,
          duration,
          measure_unit,
          vendor_id,
          vendor_group_id,
          status,
          job_id,
          submission_limit: templateResult?.submission_limit_vendor,
          opt_status: optStatus,
          distribution_date: currentDate,
          opt_status_date: optStatus ? currentDate : null,
          created_by: userId,
          updated_by: userId,
          distributed_by: userId
        });
      }
    });

    return distributionsToCreate;
  }

  private async createDistributionsAndUpdateJob(
    distributionsToCreate: any[],
    job: any,
    job_id: string,
    program_id: string,
    transaction: Transaction
  ): Promise<string> {
    const promises = [];

    if (distributionsToCreate.length > 0) {
      promises.push(
        JobDistributionModel.bulkCreate(distributionsToCreate, { transaction })
      );
    }

    const newJobStatus = (job?.status === "PENDING_APPROVAL" || job?.status === "PENDING_APPROVAL_SOURCING")
      ? "PENDING_APPROVAL_SOURCING"
      : "SOURCING";

    promises.push(
      JobModel.update(
        { status: newJobStatus },
        {
          where: { id: job_id, program_id },
          transaction
        }
      )
    );

    await Promise.all(promises);
    return newJobStatus;
  }

  private handleBackgroundTasks(
    job: any,
    job_id: string,
    program_id: string,
    newJobStatus: string,
    userFromToken: any,
    token: string,
    traceId: string,
    schedules: any[],
    templateName: string
  ): void {
    setImmediate(async () => {
      try {
        const matchedVendors = await getVendorDistributionScheduleByIds({
          hierarchy_ids: job.dataValues.hierarchy_ids,
          labor_category_id: job.dataValues.labor_category_id,
          program_id,
        });

        const compareMetaData = {
          ...buildMinimalChanges({
            status: { newValue: newJobStatus, oldValue: job.status },
          }),
          distributed_vendors: matchedVendors,
        };

        await createJobHistoryRecord(
          { id: job_id, program_id },
          { status: newJobStatus },
          userFromToken?.sub ?? "",
          null,
          "Job Distributed",
          compareMetaData
        );

        console.log("Job history record created successfully in background.");
      } catch (error) {
        console.error(`Error creating job history record:`, error);
      }
    });

    setImmediate(async () => {
      try {
        console.log('Inside Job Distribution Notification');
        await jobDistributionNotificationService.handleJobDistributionNotification(
          userFromToken,
          job,
          program_id,
          traceId,
          token,
          schedules,
          templateName,
          sequelize,
          null, 
          sendNotification
        );
      } catch (error) {
        console.error('Error sending notification:', error);
      }
    });
  }

}