import { FastifyRequest, FastifyReply } from "fastify";
import OfferRepository from "../repositories/offer.repository";
import { Status } from "../utility/enum/status_enum";
import JobRepository from "../repositories/job.repository"; // Fixed import
import { sequelize } from "../config/instance";
import { QueryTypes, Transaction } from "sequelize";
import generateCustomUUID from "../utility/genrateTraceId"; // Added missing import
import { OfferInterface } from "../interfaces/offer.interface";
import OfferModel from "../models/offer.model";
import { Op } from "sequelize";
import SubmissionCandidateModel from "../models/submission-candidate.model";
import OfferHierachy from "../models/offer-hierarchy.model";
import OfferCustomFieldModel from "../models/offer-custom-fields.model";
import OfferMasterDataModel from "../models/offer-master-data.model";
import { ApprovalworkflowQuery, jobWorkflowQuery } from "../utility/queries";
import { createWorkflowStepsByChecklistTaskMapping, getSubsequentTrigger, getChecklistTaskMappings, OFFER_CREATION, getBaseTriggersStepCounts } from '../utility/onboarding-util';
import { credentialingService } from "../external-services/credentialing-service";
import { fetchManagerIds, workflowTriggering } from "../utility/job_workflow";
import JobModel from "../models/job.model";
import { databaseConfig } from '../config/db';
import { CandidateHistoryService } from "../utility/candidate_history_helper";
import OfferNotificationService from "../notification/offer-notification-service";
import { NotificationEventCode } from "../utility/notification-event-code";
import JobDistributionModel from "../models/job-distribution.model";

// Create instance with proper class name
const jobRepository = new JobRepository();
const offerRepository = new OfferRepository(); // Added missing instance
const config_db = databaseConfig.config.database_config;
const candidateHistoryService = new CandidateHistoryService(sequelize);
const offerNotificationService = new OfferNotificationService();

// Added missing interface
export interface GetOfferByIdResult {
  status_code: number;
  trace_id: string;
  message: string;
  offer: any;
}

export class OfferService {
  private offerRepository: OfferRepository;

  constructor() {
    this.offerRepository = new OfferRepository();
  }

  private isUser(userType: string, type: string) {
    return userType?.trim()?.toLowerCase() === type;
  }

  public getOfferActionFlags(status: string, userType: string, parent_offer_id: string): Record<string, boolean> {
    const actionFlags: Record<string, boolean> = {
      schedule_another_interview: false,
      create_offer: false,
      accept_offer: false,
      reject_offer: false,
      counter_offer: false,
      edit_offer: false,
      withdraw: false,
      withdraw_candidate: false,
      reject_candidate: false,
      withdraw_counter_offer: false,
      edit_counter_offer: false,
    };

    const ut = userType?.trim()?.toLowerCase();
    const isSuperUser = ut === "super_user";
    const isClient = ut === "client";
    const isMSP = ut === "msp";
    const isVendor = ut === "vendor";
    const isClientOrMSP = isClient || isMSP;

    switch (status) {
      case Status.INTERVIEW_COMPLETED:
        if (isClient || isSuperUser) {
          actionFlags.schedule_another_interview = true;
          actionFlags.create_offer = true;
        }
        break;

      case Status.WITHDRAWN_COUNTER_OFFER:
      case Status.COUNTER_OFFER:
        if (isClientOrMSP || isSuperUser) {
          actionFlags.withdraw = true;
        }
        if (isVendor || isSuperUser) {
          actionFlags.accept_offer = true;
          actionFlags.reject_offer = true;
          actionFlags.counter_offer = true;
        }
        break;

      case Status.PENDING_ACCEPTANCE:
        if (parent_offer_id) {
          if (isClientOrMSP || isSuperUser) {
            actionFlags.accept_offer = true;
            actionFlags.reject_offer = true;
          }
          if (isVendor || isSuperUser) {
            actionFlags.withdraw_counter_offer = true;
          }
        } else {
          if (isClientOrMSP || isSuperUser) {
            actionFlags.withdraw = true;
          }
          if (isVendor || isSuperUser) {
            actionFlags.accept_offer = true;
            actionFlags.reject_offer = true;
            actionFlags.counter_offer = true;
          }
        }
        break;

      case Status.ACCEPTED:
        // All user types: No actions
        break;

      case Status.REJECTED:
        if (parent_offer_id) {
          if (isClientOrMSP || isSuperUser) {
            actionFlags.reject_candidate = true;
          }
          if (isVendor || isSuperUser) {
            actionFlags.withdraw_candidate = true;
            actionFlags.edit_counter_offer = true;
            actionFlags.withdraw_counter_offer = true;
          }
        } else {
          if (isClientOrMSP || isSuperUser) {
            actionFlags.edit_offer = true;
            actionFlags.reject_candidate = true;
          }
          if (isVendor || isSuperUser) {
            actionFlags.withdraw_candidate = true;
          }
        }
        break;

      case Status.WITHDRAWN:
        if (parent_offer_id) {
          if (isClientOrMSP || isSuperUser) {
            actionFlags.edit_offer = false;
            actionFlags.reject_candidate = false;
          }
          if (isVendor || isSuperUser) {
            actionFlags.withdraw_candidate = false;
          }
        } else {
          if (isClientOrMSP || isSuperUser) {
            actionFlags.edit_offer = true;
            actionFlags.reject_candidate = true;
          }
          if (isVendor || isSuperUser) {
            actionFlags.withdraw_candidate = true;
          }
        }
        break;

      default:
        break;
    }

    return actionFlags;
  }

  async getAllOffers(request: any): Promise<{
    status_code: number;
    offers?: any[];
    total_records?: number;
    total_pages?: number;
    current_page?: number;
    page_size?: number;
    items_per_page?: number;
    error?: string;
  }> {
    try {
      const { program_id } = request.params;
      const query = request.query || {};
      const user = request?.user;
      const userId = user?.sub;

      const userData = await this.offerRepository.findUser(program_id, userId);
      const userType = user?.userType ?? userData?.[0]?.user_type ?? "";
      const tenantId = userData?.[0]?.tenant_id;
      const isVendorUser = this.isUser(userType, "vendor");
      const isMSPUser = this.isUser(userType, "msp");
      const isHierarchyAssociated = !!userData?.[0]?.is_all_hierarchy_associate;

      let vendorId = null;
      let mspHierarchyIds: string[] = [];

      if (isVendorUser) {
        const vendor = await this.offerRepository.findVendor(program_id, tenantId);
        vendorId = vendor?.[0]?.id;
      }

      if (isMSPUser && isHierarchyAssociated) {
        mspHierarchyIds = await this.offerRepository.findHierarchyIdsByManagedBy(program_id, tenantId);
      }

      const page = parseInt(query.page ?? "1", 10);
      const limit = parseInt(query.limit ?? "10", 10);
      const offset = (page - 1) * limit;
      delete query.page;
      delete query.limit;

      const jobIds = await this.getJobIdsForUserType(program_id, userId, userType);

      const { filters, replacements } = this.offerRepository.buildOfferFilters(
        query,
        {
          program_id,
          job_ids: jobIds,
          vendor_id: tenantId,
          vendorId,
          user_id: userId,
          isValidStatus: false,
          mspHierarchyIds: mspHierarchyIds.length > 0 ? mspHierarchyIds : null,
        },
        isVendorUser,
        isMSPUser,
        isHierarchyAssociated
      );

      const totalRecords = await this.offerRepository.getOfferCount(
        filters,
        replacements,
        jobIds.length > 0,
        isMSPUser && isHierarchyAssociated && mspHierarchyIds.length > 0
      );
      const totalPages = Math.ceil(totalRecords / limit);

      if (!totalRecords) {
        return {
          status_code: 200,
          offers: [],
          total_records: 0,
          total_pages: 0,
          current_page: page,
          page_size: limit,
          items_per_page: limit
        };
      }

      const offers = await this.offerRepository.getOffers(filters, replacements, {
        limit,
        offset,
        useHierarchy: jobIds.length > 0,
        useHierarchyFilter: isMSPUser && isHierarchyAssociated && mspHierarchyIds.length > 0,
      });

      const offersWithActions = offers.map((offer: any) => ({
        ...offer,
        actions: this.getOfferActionFlags(offer.status ?? null, userType, offer.parent_offer_id),
      }));

      return {
        status_code: 200,
        offers: offersWithActions,
        total_records: totalRecords,
        total_pages: totalPages,
        current_page: page,
        page_size: limit,
        items_per_page: limit
      };
    } catch (error: any) {
      console.error('Error in getAllOffers:', error);
      return {
        status_code: 400,
        error: error.message || "Failed to fetch offers"
      };
    }
  }

  /**
   * Advanced filter for offers, matching the logic of the offerAdvanceFilter controller.
   */
  async offerAdvanceFilter({ body, user, params }: { body: any, user: any, params: any }): Promise<any> {
    const { program_id } = params;
    let filterBody = { ...body };
    
    try {
      const userId = user?.sub;
      const userType = user?.userType || undefined;
      const userData = await this.offerRepository.findUser(program_id, userId);
      
      // Safe array access
      const hierarchyIdsArray = userData?.[0]?.associate_hierarchy_ids || [];
      let isVendorUser = false;
      const user_type = userData?.[0]?.user_type?.toUpperCase();
      const user_id = user_type === 'CLIENT' || user_type === 'MSP' ? userId : null;
      const tenantId = userData?.[0]?.tenant_id;
      let vendor_id = null;

      if (userType === undefined && user_type?.toLowerCase() === "vendor") {
        isVendorUser = true;
        const vendor = await this.offerRepository.findVendor(program_id, tenantId);
        vendor_id = vendor?.[0]?.id;
      }

      const page = parseInt(filterBody.page ?? "1", 10);
      const limit = parseInt(filterBody.limit ?? "10", 10);
      const offset = (page - 1) * limit;
      delete filterBody.page;
      delete filterBody.limit;
      
      const jobIds = await this.getJobIdsForUserType(program_id, userId, userType);

      // Status workflow mapping
      const splitQueryParam = (param: string | string[] | undefined) => {
        if (!param) return null;
        if (Array.isArray(param)) return param;
        return param.split(',').map(item => item.trim());
      };

      const filters: string[] = [];
      const isValidStatus = Array.isArray(filterBody.status) &&
        (
          filterBody.status.includes("PENDING_REVIEW_WORKFLOW") ||
          filterBody.status.includes("PENDING_APPROVAL_WORKFLOW") ||
          filterBody.status.includes("REJECTED_WORKFLOW") ||
          filterBody.status.includes("COUNTER_PENDING_REVIEW_WORKFLOW") ||
          filterBody.status.includes("COUNTER_PENDING_APPROVAL_WORKFLOW")
        );

      if (Array.isArray(filterBody.status) && filterBody.status.length) {
        if (filterBody.status.includes("PENDING_REVIEW_WORKFLOW")) {
          filterBody.status = ["Pending Review"];
          filterBody.parent_offer_type = "PARENT";
        } else if (filterBody.status.includes("PENDING_APPROVAL_WORKFLOW")) {
          filterBody.status = ["Pending Approval"];
          filterBody.parent_offer_type = "PARENT";
        } else if (filterBody.status.includes("REJECTED_WORKFLOW")) {
          filterBody.status = ["Rejected"];
          filterBody.parent_offer_type = "PARENT";
        } else if (filterBody.status.includes("COUNTER_PENDING_REVIEW_WORKFLOW")) {
          filterBody.status = ["Pending Review"];
          filterBody.parent_offer_type = "COUNTER";
        } else if (filterBody.status.includes("COUNTER_PENDING_APPROVAL_WORKFLOW")) {
          filterBody.status = ["Pending Approval"];
          filterBody.parent_offer_type = "COUNTER";
        }
      }

      const replacements: any = { 
        program_id, 
        limit, 
        offset, 
        job_ids: jobIds, 
        vendor_id: tenantId, 
        vendorId: vendor_id, 
        user_id, 
        hierarchyIdsArray, 
        isValidStatus: !!isValidStatus 
      };

      Object.keys(filterBody).forEach((key) => {
        if (filterBody[key] !== undefined && filterBody[key] !== null) {
          if (key === "updated_on" || key === "created_on") {
            const date = new Date(filterBody[key]);
            const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            filters.push(`DATE(FROM_UNIXTIME(jo.${key} / 1000)) = :${key}`);
            replacements[key] = formattedDate;
          }
          else if (key === "job_name") {
            filters.push(`jt.template_name LIKE :job_name`);
            replacements.job_name = `%${filterBody[key].trim()}%`;
          }
          else if (key === "submission_unique_id") {
            filters.push(`os.unique_id LIKE :submission_unique_id`);
            replacements.submission_unique_id = `%${filterBody[key].trim()}%`;
          }
          else if (key === "job_unique_id") {
            filters.push(`oj.job_id LIKE :job_unique_id`);
            replacements.job_unique_id = `%${filterBody[key].trim()}%`;
          }
          else if (key === "offer_code") {
            filters.push(`jo.offer_code LIKE :offer_code`);
            replacements.offer_code = `%${filterBody[key].trim()}%`;
          }
          else if (key === "candidate_name") {
            filters.push(
              `(jc.first_name LIKE :candidate_name
                OR jc.last_name LIKE :candidate_name
                OR jc.middle_name LIKE :candidate_name
                OR CONCAT_WS(' ', TRIM(jc.first_name), TRIM(jc.last_name)) LIKE :candidate_name)`
            );
            replacements.candidate_name = `%${filterBody[key].trim()}%`;
          }
          else if (key === "status") {
            const statusArray = splitQueryParam(filterBody[key]);
            if (statusArray && statusArray.length > 0) {
              filters.push(`jo.status IN (:status)`);
              replacements.status = statusArray;
            }
          } else if (key === "candidate_unique_id") {
            filters.push(`jc.candidate_id = :candidate_unique_id`);
            replacements.candidate_unique_id = filterBody[key];
          } else if (key === "parent_offer_type") {
            if (filterBody[key] === "PARENT") {
              filters.push(`jo.parent_offer_id IS NULL`);
            } else if (filterBody[key] === "COUNTER") {
              filters.push(`jo.parent_offer_id IS NOT NULL`);
            }
          } else if (key === "job_ids") {
            filters.push(`jo.job_id IN (:job_ids)`);
            replacements.job_ids = filterBody[key];
          } else if (key === "is_parent_offer" && body[key] === false) {
            filters.push(`jo.parent_offer_id IS NULL`);
          } else {
            const adjustedKey = key === "job_id" ? "jo.job_id" : key;
            filters.push(`${adjustedKey} = :${key}`);
            replacements[key] = filterBody[key];
          }
        }
      });

      if (isVendorUser) {
        filters.push(`(jo.status IS NULL OR jo.status NOT IN ('Pending Review','Pending Approval')) AND jo.vendor_id =:vendorId`);
      }

      let filterString = filters.length > 0 ? ` AND ${filters.join(" AND ")}` : "";
      const hierarchyFilter = jobIds.length > 0;
      let baseSql = await this.offerRepository.getAllOffersQuery(filterString, hierarchyFilter);

      if (user_id !== null && hierarchyIdsArray && hierarchyIdsArray.length > 0) {
        filterString += `\n          AND EXISTS (\n            SELECT 1 FROM offers_hierarchy oh\n            WHERE oh.offer_id = jo.id\n            AND oh.hierarchy IN (:hierarchyIdsArray)\n          )\n        `;
      }

      let sql_query = `\n        WITH filtered_offers AS (\n          ${baseSql.replace(/;$/, "")}\n        )\n        SELECT\n          *,\n          (SELECT COUNT(*) FROM filtered_offers) AS total_count\n        FROM filtered_offers\n        ORDER BY offer_code DESC, created_on DESC\n        LIMIT :limit\n        OFFSET :offset\n      `;

      const offers = await sequelize.query(sql_query, {
        replacements,
        type: QueryTypes.SELECT,
      }) as Array<{ total_count?: number }>;

      const totalRecords = offers.length > 0 ? offers[0].total_count : 0;

      return {
        status_code: 200,
        message: offers.length === 0 ? "Offers not found" : "Offers fetched successfully!",
        items_per_page: limit,
        total_records: totalRecords,
        offers,
      };
    } catch (error: any) {
      console.error('Error in offerAdvanceFilter:', error);
      return {
        status_code: 500,
        message: "Internal Server Error",
        error: error.message,
      };
    }
  }

  async getJobIdsForUserType(program_id: string, userId: string, userType?: string): Promise<string[]> {
    try {
      if (userType === 'super_user') return [];

      const userData = await jobRepository.findUser(program_id, userId);
      const user_type = userData?.[0]?.user_type?.toUpperCase();
      const hierarchyIds = userData?.[0]?.associate_hierarchy_ids ?? [];

      switch (user_type) {
        case "CLIENT":
        case "MSP":
          return hierarchyIds.length
            ? await jobRepository.getJobIdsWithHierarchies(program_id, hierarchyIds)
            : await jobRepository.getAllJobIds(program_id);
        case "VENDOR":
          return await jobRepository.getVendorJobIds({ program_id, userId, isOptOut: true });
        default:
          return await jobRepository.getAllJobIds(program_id);
      }
    } catch (error) {
      console.error('Error in getJobIdsForUserType:', error);
      return [];
    }
  }

  async getOfferById(request: FastifyRequest, reply: FastifyReply): Promise<GetOfferByIdResult> {
    const { id, program_id } = request.params as { id: string, program_id: string };
    const traceId = generateCustomUUID();
    const user = request.user;
    const userId = user?.sub;
    const userData = await offerRepository.findUser(program_id, userId);
    let userType = user?.userType ?? userData?.[0]?.user_type ?? "";

    try {
      const [
        baseData,
        hierarchies,
        managers,
        customFields,
        foundationalData,
      ] = await Promise.all([
        offerRepository.getOfferBaseData(id),
        offerRepository.getHierarchies(id),
        offerRepository.getManagers(id, program_id),
        offerRepository.getCustomFields(id),
        offerRepository.getFoundationalData(id),
      ]);

      if (!baseData) {
        return {
          status_code: 200,
          trace_id: traceId,
          message: "Offer Not Found",
          offer: [],
        };
      }

      const status = (baseData as any).status ?? null;
      const parent_offer_id = (baseData as any).parent_offer_id ?? null;
      const actions = this.getOfferActionFlags(
        status,
        userType,
        parent_offer_id
      );

      return {
        status_code: 200,
        trace_id: traceId,
        message: "Offer Data Found Successfully",
        offer: {
          ...baseData,
          hierarchies,
          expense_manager: managers.expenseManagers,
          timesheet_manager: managers.timesheetManagers,
          custom_fields: customFields,
          foundational_data: foundationalData,
          actions: actions
        },
      };
    } catch (error: any) {
      console.error(`trace_id: ${traceId}, Error:`, error);
      throw {
        status_code: 500,
        trace_id: traceId,
        message: error.message,
        error: error,
      };
    }
  }

  async getCounterOffer(request: FastifyRequest, reply: FastifyReply): Promise<{
    status_code: number;
    trace_id: string;
    message: string;
    counter_offer?: any;
    error?: any;
  }> {
    const { program_id } = request.params as { program_id: string };
    const { parent_offer } = request.query as { parent_offer?: string };
    const traceId = generateCustomUUID();

    if (!parent_offer) {
      return {
        status_code: 400,
        trace_id: traceId,
        message: "parent offer id is required query parameters.",
      };
    }

    const user = request.user;
    const userId = user?.sub;
    const userData = await offerRepository.findUser(program_id, userId);
    let userType = user.userType ?? userData[0]?.user_type ?? "";

    try {
      const [baseOffer] = await offerRepository.getBaseCounterOffer(program_id, parent_offer);

      if (!baseOffer) {
        return {
          status_code: 200,
          trace_id: traceId,
          message: "No counter offer found for the specified candidate and job.",
          counter_offer: [],
        };
      }

      // Ensure baseOffer has offer_id property
      if (!('offer_id' in baseOffer)) {
        return {
          status_code: 500,
          trace_id: traceId,
          message: "Invalid counter offer data structure.",
          error: "Missing offer_id in counter offer data",
        };
      }

      const offerId = baseOffer.offer_id;

      const [
        hierarchies,
        managers,
        customFields,
        foundationalData,
      ] = await Promise.all([
        offerRepository.getHierarchies(offerId as string),
        offerRepository.getManagers(offerId as string, program_id as string),
        offerRepository.getCustomFields(offerId as string),
        offerRepository.getFoundationalData(offerId as string)
      ]);

      const status = (baseOffer as any).status ?? null;
      const parent_offer_id = (baseOffer as any).parent_offer_id ?? null;
      const actions = this.getOfferActionFlags(
        status,
        userType,
        parent_offer_id
      );

      return {
        status_code: 200,
        trace_id: traceId,
        message: "Counter offer found for the specified candidate and job.",
        counter_offer: {
          ...baseOffer,
          hierarchies,
          expense_manager: managers.expenseManagers,
          timesheet_manager: managers.timesheetManagers,
          custom_fields: customFields,
          foundational_data: foundationalData,
          actions: actions
        },
      };
    } catch (error: any) {
      console.error(`trace_id: ${traceId}, Error:`, error);
      throw {
        status_code: 500,
        trace_id: traceId,
        message: error.message,
        error: error,
      };
    }
  }

  async createOffer(request: FastifyRequest, reply: FastifyReply): Promise<{
    status_code: number;
    trace_id: string;
    message: string;
    id?: string;
    error?: string;
  }> {
    const { program_id } = request.params as { program_id: string };
    const offer = request.body as OfferInterface;
    const traceId = generateCustomUUID();
    const authHeader = request.headers.authorization;
    const transaction: Transaction = await sequelize.transaction();
    const user = request.user;
    const user_id = user?.sub;
    const userData = await offerRepository.findUser(program_id, user_id);

    try {
      if (user?.userType !== "super_user" && (!userData || userData.length === 0)) {
        await transaction?.rollback();
        return {
          status_code: 400,
          trace_id: traceId,
          message: "User not found",
        };
      }

      let userTypes = user?.userType ?? userData[0]?.user_type ?? "";
      let jobs = await JobModel.findOne({ where: { id: offer.job_id }, transaction });

      if (!jobs) {
        await transaction.rollback();
        return {
          status_code: 400,
          message: "Job not found",
          trace_id: traceId,
        };
      }

      const holdStatuses = ["HOLD", "PENDING_REVIEW", "DRAFT", "FILLED", "CLOSED", "PENDING_APPROVAL", "REJECTED"];
      const jobId = jobs.id;

      if (userTypes === "vendor") {
        const result = await this.checkDistributionStatusForVendor(program_id, userTypes, jobId, userData, traceId);
        if (result.status_code !== 200) {
          await transaction.rollback();
          return result;
        }
      }

      if (holdStatuses.includes(jobs?.status)) {
        await transaction.rollback();
        return {
          status_code: 400,
          message: `Job is currently on ${jobs?.status} offer cannot be created.`,
          trace_id: traceId,
        };
      }

      if (!authHeader?.startsWith('Bearer ')) {
        await transaction.rollback();
        return {
          status_code: 401,
          message: 'Unauthorized - Token not found',
          trace_id: traceId,
        };
      }

      const token = authHeader.split(' ')[1];
      const userId = user.sub;
      const userType = user.userType;
      const offerData: any = request.body as OfferInterface;

      const offerStartDate = new Date(offer.start_date);
      const offerEndDate = new Date(offer.end_date);

      if (offerStartDate > offerEndDate) {
        await transaction.rollback();
        return {
          status_code: 400,
          message: `Offer end date must be greater than the offer start date.`,
          trace_id: traceId,
        };
      }

      if (!offerData.financial_details?.rates) {
        await transaction.rollback();
        return {
          status_code: 400,
          message: "Financial details cannot be null",
          trace_id: traceId,
        };
      }

      if (!offerData.financial_details?.fee_details) {
        await transaction.rollback();
        return {
          status_code: 400,
          message: "Fee details cannot be null",
          trace_id: traceId,
        };
      }

      const submission = await SubmissionCandidateModel.findOne({
        where: {
          candidate_id: offerData.candidate_id,
          program_id: program_id,
          job_id: offerData.job_id
        },
        transaction
      });

      const validStatuses = [
        Status.PENDING_REHIRE_APPROVAL,
        Status.PENDING_REHIRE_REVIEW,
        Status.PENDING_SHORTLIST_REVIEW,
        Status.WITHDRAW,
        Status.WITHDRAWN
      ];
      const submissionStatus = submission?.dataValues?.status?.toUpperCase() ?? "";

      if (validStatuses.includes(submissionStatus)) {
        await transaction.rollback();
        return {
          status_code: 400,
          message: `Cannot create offer. Submission is currently in '${submissionStatus}' status.`,
          trace_id: traceId,
        };
      }

      const query = `SELECT * FROM jobs WHERE id = :jobId LIMIT 1;`;
      const jobRequest: any = await sequelize.query(query, {
        type: QueryTypes.SELECT,
        replacements: { jobId: offerData.job_id },
      });

      let jobDatas = jobRequest[0];
      if (!jobDatas) {
        await transaction.rollback();
        return {
          status_code: 400,
          message: "Job not found for the provided job ID.",
          trace_id: traceId,
        };
      }

      // Workflow setup
      const workflow_job_id = offerData.job_id;
      const event_slug_base = "create_offer";
      const module_name_base = "Offers";
      const type = "workflow";
      const placement_order = "0";
      const is_updated = false;

      const parent_offer_id = offerData?.parent_offer_id;
      const event_slug = parent_offer_id ? "counter_offer" : event_slug_base;
      const module_name = module_name_base;
      let moduleId: any;

      if (module_name) {
        const query = `SELECT id FROM ${config_db}.module WHERE name = :module_name AND is_workflow = true LIMIT 1`;
        let moduleIds = await sequelize.query(query, {
          type: QueryTypes.SELECT,
          replacements: { module_name },
        });
        moduleId = moduleIds[0];
      }

      const module_ids = moduleId?.id ?? "";
      let eventId: any;
      if (module_ids && event_slug) {
        const query = `SELECT id FROM ${config_db}.event WHERE module_id = :module_ids AND slug = :event_slug AND is_enabled = true AND type = :type LIMIT 1`;
        const eventIdData = await sequelize.query(query, {
          type: QueryTypes.SELECT,
          replacements: {
            module_ids,
            event_slug,
            type
          },
        });
        eventId = eventIdData[0];
      }

      const module_id = module_ids ?? jobDatas.module_id;
      const event_id = eventId?.id ?? "";
      const workflowQuery2 = jobWorkflowQuery(jobDatas.hierarchy_ids);
      const rows: any[] = await sequelize.query(workflowQuery2, {
        replacements: { module_id, event_id, program_id, placement_order },
        type: QueryTypes.SELECT,
      });

      if (offerData.status?.toLocaleUpperCase() !== 'DRAFT') {
        if (rows.length > 0 || rows[0]?.levels > 0) {
          const hasReviewFlow = rows.some(row => row.flow_type.trim() === 'Review');
          if (offerData.parent_offer_id) {
            offerData.status = hasReviewFlow ? "Pending Review" : "Pending Approval";
            const parentOffer = await OfferModel.findByPk(offerData.parent_offer_id);
            if (parentOffer) {
              await parentOffer.update({ status: "CLOSED" }, { transaction });
              await submission?.update({ status: `Counter Offer ${offerData.status}` });
            }
          } else {
            offerData.status = hasReviewFlow ? "Pending Review" : "Pending Approval";
            await submission?.update({ status: `Offer ${offerData.status}` });
          }
        } else {
          if (offerData.parent_offer_id) {
            const parentOffer = await OfferModel.findByPk(offerData.parent_offer_id);
            const oldStatus = parentOffer?.dataValues.status;
            if (parentOffer) {
              await parentOffer.update({ status: "CLOSED" }, { transaction });
              await submission?.update({ status: `Counter Offer Pending Approval` });
              offerData.status = "Pending Approval";
              offerData.is_workflow = true;
              const newStatus = `Counter Offer ${offerData.status}`;
              const oldData = { status: oldStatus, candidate_id: submission?.dataValues.candidate_id, job_id: submission?.dataValues.job_id, updated_by: userId };
              const newData = { status: newStatus, candidate_id: submission?.dataValues.candidate_id, job_id: submission?.dataValues.job_id, updated_by: userId };
              const action = offerData.parent_offer_id ? 'Counter Offer Created' : 'Offer Created';
              await candidateHistoryService.handleCandidateHistory({ program_id, oldData, newData, action });
            }
          } else {
            offerData.status = "Pending Acceptance";
            await submission?.update({ status: `Offer ${offerData.status}` });
          }
        }
      }

      const isUpdate = !!offerData.id;
      const existingOffer = await this.validateExistingOffer(offerData);
      if (!isUpdate || (isUpdate && !existingOffer)) {
        if (existingOffer) {
          await transaction.rollback();
          return {
            status_code: 400,
            trace_id: traceId,
            message: existingOffer.message,
            id: existingOffer.id,
          };
        }
      }

      const [newItem] = await OfferModel.upsert(
        {
          ...offerData, program_id, vendor_id: submission?.vendor_id, updated_by: userId, created_by: userId, created_on: Date.now(), updated_on: Date.now(),
          checklist_entity_id: offerData.checklist_entity_id ?? submission?.checklist_entity_id ?? null,
          checklist_version: offerData.checklist_version ?? submission?.checklist_version ?? null,
          onboarding_flow_id: submission?.onboarding_flow_id ?? null,
        },
        { transaction }
      );

      const oldData = {
        status: null,
        candidate_id: newItem?.dataValues.candidate_id,
        job_id: newItem?.dataValues.job_id,
        updated_by: userId,
      };

      if (newItem.dataValues.status?.toUpperCase() === "PENDING ACCEPTANCE") {
        const newData = {
          candidate_id: newItem?.dataValues.candidate_id,
          status: newItem?.dataValues.status,
          job_id: newItem?.dataValues?.job_id,
          updated_by: newItem?.dataValues.updated_by
        };
        await candidateHistoryService.handleCandidateHistory({ program_id, oldData, newData, action: 'Offer Created', });
        offerNotificationService.processAndSendOfferNotification(
          token, reply, program_id, newItem, jobDatas, sequelize, user, traceId, offerData, NotificationEventCode.OFFER_RELEASED
        );
      } else {
        offerNotificationService.processAndSendOfferNotification(token, reply, program_id, newItem, jobDatas, sequelize, user, traceId, offerData, NotificationEventCode.OFFER_CREATE);
        const newData = {
          candidate_id: newItem?.dataValues.candidate_id,
          status: newItem?.dataValues.status,
          job_id: newItem?.dataValues?.job_id,
          updated_by: newItem?.dataValues.updated_by
        };
        await candidateHistoryService.handleCandidateHistory({ program_id, oldData, newData, action: 'Offer Created', });
      }

      const hierarchyIds = jobs.hierarchy_ids ?? [];

      if (newItem?.onboarding_flow_id) {
        await this.processOnboardingFlow(jobDatas, newItem, program_id, request, transaction, traceId, hierarchyIds);
      }

      let jobData = offerData;
      jobData.userId = userId;
      jobData.userType = userType;

      let job = { event_title: jobDatas.job_id, job_id: newItem.dataValues.job_id, id: newItem.dataValues.id };

      await sequelize.query(`SELECT job_id FROM jobs WHERE id = :job_id;`, {
        replacements: { job_id: newItem.dataValues.job_id },
        type: QueryTypes.SELECT
      }) as [{ job_id: string }];

      if (offerData.hierarchy && Array.isArray(offerData.hierarchy)) {
        for (const hierarchyId of offerData.hierarchy) {
          await OfferHierachy.create(
            {
              offer_id: newItem.id,
              hierarchy: hierarchyId,
            },
            { transaction }
          );
        }
      }

      try {
        await this.processCustomFields(newItem.id, offerData.custom_fields, transaction);
        await this.processFoundationalData(newItem.id, offerData.foundational_data, transaction);
        const job_max_bill_rate = jobData.financial_details?.rates[0]?.rate_configuration[0]?.base_rate?.clientBillRate?.max_rate;
        const offer_max_bill_rate = jobData.financial_details?.rates[0]?.rate_configuration[0]?.base_rate?.client_bill_rate;
        let is_offer_rate_greater = false;

        if (Number(offer_max_bill_rate) > Number(job_max_bill_rate)) {
          is_offer_rate_greater = true;
        }

        const managers = await fetchManagerIds(offerData);

        jobData.is_offer_rate_greater = is_offer_rate_greater;
        jobData.job_managers = managers?.job_manager_id;
        jobData.timesheet_manager_id = managers?.timesheet_manager_id;
        jobData.expense_manager_id = managers?.expense_manager_id;
        jobData.duration = jobData?.financial_details?.billRateValue?.duration_in_days;
        jobData.offer_budget = jobData?.financial_details?.billRateValue?.budget;
        jobDatas.is_offer_rate_greater = is_offer_rate_greater;
        const weekCount = parseInt(offerData?.financial_details?.billRateValue?.formatted_weeks_days?.match(/(\d+)\s+Weeks?/)?.[1] || "0");
        jobData.duration = weekCount;
        jobDatas.duration = weekCount;
        const workflow = await workflowTriggering(request, reply, program_id, rows, job, jobData, jobDatas, module_name, is_updated, workflow_job_id, event_slug);
        const offers = await OfferModel.findOne({
          where: {
            id: newItem.id,
          },
          transaction
        });

        if (!workflow) {
          const workflowQuery2 = ApprovalworkflowQuery(jobDatas.hierarchy_ids);
          const rows: any[] = await sequelize.query(workflowQuery2, {
            replacements: { module_id, event_id, program_id, placement_order },
            type: QueryTypes.SELECT,
            transaction
          });

          const workflow = await workflowTriggering(request, reply, program_id, rows, job, jobData, jobDatas, module_name, is_updated, workflow_job_id, event_slug);

          if (!workflow) {
            if (!offerData.parent_offer_id) {
              await submission?.update({ status: "Offer Pending Acceptance" }, { transaction });
              await offers?.update({ status: "Pending Acceptance" }, { transaction });
            } else {
              await submission?.update({ status: "Counter Offer Pending Approval" }, { transaction });
              await offers?.update({ status: "Pending Approval" }, { transaction });
            }
          } else {
            await submission?.update({ status: "Offer Pending Approval" }, { transaction });
            await offers?.update({ status: "Pending Approval" }, { transaction });
          }
        }

        if (workflow?.workflow?.workflow_status === "completed") {
          await submission?.update({ status: "Offer Pending Acceptance" }, { transaction });
          await offers?.update({ status: "Pending Acceptance" }, { transaction });
        }

      } catch (error) {
        console.log('error is mwww', error);
      }

      await transaction.commit();

      return {
        status_code: 201,
        trace_id: traceId,
        message: "Offer created successfully.",
        id: newItem?.id,
      };

    } catch (error: any) {
      if (transaction) {
        await transaction.rollback();
      }

      return {
        status_code: 500,
        trace_id: traceId,
        message: error.message,
        error: error.message,
      };
    }
  }

  private async checkDistributionStatusForVendor(program_id: string, userType: string, jobId: any, userData: any[], traceId: string): Promise<{
    status_code: number;
    message?: string;
    trace_id?: string;
  }> {
    const tenantId = userData?.[0]?.tenant_id;
    let vendorId: string | undefined;
    const vendor = await jobRepository.findVendor(program_id, tenantId);
    vendorId = vendor?.[0]?.id;
    if (!vendorId) {
      return {
        status_code: 400,
        message: "Vendor not found.",
        trace_id: traceId,
      };
    }

    const distribution = await JobDistributionModel.findOne({
      where: {
        job_id: jobId,
        vendor_id: vendorId,
        program_id,
      },
    });

    const distributionStatus = distribution?.status?.toUpperCase() ?? "";

    if (["HOLD", "HALT"].includes(distributionStatus)) {
      return {
        status_code: 400,
        message: `Job is currently on '${distributionStatus}', offer cannot be created or updated.`,
        trace_id: traceId,
      };
    }

    return { status_code: 200 };
  }

  private async validateExistingOffer(offerData: OfferInterface) {
    let offer;
    if (offerData.parent_offer_id == null) {
      const offer = await OfferModel.findOne({
        where: {
          job_id: offerData.job_id,
          candidate_id: offerData.candidate_id,
          status: {
            [Op.ne]: "Withdraw",
          },
        },
      });
      if (offer) {
        return {
          message: "Offer already exists for this candidate and job!",
          id: offer.id,
        };
      }
    } else {
      offer = await OfferModel.findOne({
        where: {
          job_id: offerData.job_id,
          candidate_id: offerData.candidate_id,
          parent_offer_id: offerData.parent_offer_id,
          status: {
            [Op.notIn]: ["Withdraw", "CLOSED"],
          }
        },
      });
      if (offer) {
        return {
          message: "Counter offer already exists for this candidate and job!",
          id: offer.id,
        };
      }
    }
    return null;
  }

  private async processCustomFields(
    offerId: string,
    customFields: any[],
    transaction: Transaction
  ) {
    if (Array.isArray(customFields) && customFields.length > 0) {
      await Promise.all(
        customFields.map(async (customField) => {
          await OfferCustomFieldModel.create(
            {
              offer_id: offerId,
              custom_field_id: customField.id,
              value: customField.value,
            },
            { transaction }
          );
        })
      );
    }
  }

  private async processFoundationalData(offerId: string, foundationalData: any[] | undefined, transaction: Transaction) {
    if (Array.isArray(foundationalData) && foundationalData.length > 0) {

      await OfferMasterDataModel.destroy({
        where: { offer_id: offerId },
        transaction,
      });

      await Promise.all(
        foundationalData.map(async (data) => {
          await OfferMasterDataModel.create(
            {
              offer_id: offerId,
              foundation_data_type_id: data.foundation_data_type_id,
              foundation_data_ids: data.foundation_data_ids,
            },
            { transaction }
          );
        })
      );
    }
  }

  private async processOnboardingFlow(job: { job_id: any; id: any; job_template_id: string; }, offer: OfferModel, program_id: string, request: FastifyRequest, transaction: Transaction, traceId: string, hierarchy_ids: string[]) {
    const onboarding_flow_id = offer.onboarding_flow_id;
    const jobTemplateQuery = `
      SELECT template_name, id, job_id
      FROM ${config_db}.job_templates
      WHERE id = :job_template_id
      LIMIT 1;
    `;
    const jobTemplateResult = await sequelize.query(jobTemplateQuery, {
      replacements: { job_template_id: job.job_template_id },
      type: QueryTypes.SELECT,

    });

    const jobTemplate: any = jobTemplateResult[0];

    const vendorQuery = `
            SELECT id, vendor_name, tenant_id
            FROM ${config_db}.program_vendors
            WHERE id = :vendor_id
            `;

    const [vendor]: any = await sequelize.query(vendorQuery, {
      replacements: { vendor_id: offer.vendor_id },
      type: QueryTypes.SELECT
    });

    try {
      let triggers = [OFFER_CREATION, ...getSubsequentTrigger(OFFER_CREATION)];

      const checklistTaskMappings = await getChecklistTaskMappings({ checklist_entity_id: offer.checklist_entity_id, checklist_version: offer.checklist_version, triggers });

      const triggerStepCounts = checklistTaskMappings.reduce((acc: Record<string, number>, ctm: any) => {
        acc[`${ctm.trigger}_steps_count`]++;
        return acc;
      }, getBaseTriggersStepCounts(triggers));

      const workflowUpdates = {
        associations: {
          offer_id: offer.id,
          offer_code: offer.offer_code
        },
        attributes: {
          ...triggerStepCounts
        }
      };

      // Call to create workflow steps by checklist task mapping
      const workflowSteps = await createWorkflowStepsByChecklistTaskMapping(
        checklistTaskMappings.filter((mapping: any) => mapping.trigger == OFFER_CREATION),
        program_id,
        offer.candidate_id,
        hierarchy_ids,
        vendor.tenant_id,
        {
          job_template_id: jobTemplate.id,
          job_template_code: jobTemplate.job_id,
          job_id: job.id,
          job_code: job.job_id,
          offer_id: offer.id,
          offer_code: offer.offer_code,
        }
      );

      const onboarding_flow_updates = {
        workflow: workflowUpdates,
        steps: workflowSteps
      };

      try {
        const credentialing_result = await credentialingService.pushWorkflowUpdatesAndAppendSteps(
          onboarding_flow_id,
          onboarding_flow_updates,
          program_id,
          request.headers?.authorization!
        );

        console.log("Workflow updated and possible workflow steps appended successfully in credentialing:", credentialing_result);
      } catch (error: any) {
        console.error("Error updating workflow  or appending steps in credentialing service:", error);
        throw new Error("Failed to add onboarding steps");
      }
    } catch (error: any) {
      console.error("Error creating workflow steps:", error);
      throw new Error("Failed to create workflow steps.");
    }
  }
}

// Export single instance
export const offerService = new OfferService();