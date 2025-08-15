import { FastifyRequest, FastifyReply } from "fastify";
import OfferRepository from "../repositories/offer.repository";
import { Status } from "../utility/enum/status_enum";
import JobRepository from "../repositories/job.repository"; // Fixed import
import { sequelize } from "../config/instance";
import { QueryTypes } from "sequelize";
import generateCustomUUID from "../utility/genrateTraceId"; // Added missing import

// Create instance with proper class name
const jobRepository = new JobRepository();
const offerRepository = new OfferRepository(); // Added missing instance

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
}

// Export single instance
export const offerService = new OfferService();