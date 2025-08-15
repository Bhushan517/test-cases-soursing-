import { JobInterface } from "../interfaces/job.interface";
import JobRepository from "../repositories/job.repository";
import generateCustomUUID from "../utility/genrateTraceId";

export interface GetJobParams {
  program_id: string;
  page?: number | string;
  limit?: number | string;
  is_new_request?: boolean | string;
  user?: any;
}

export interface JobData extends Omit<JobInterface, 'total_count'> {
  total_count?: number;
}

export interface GetJobResult {
  jobs: JobData[];
  pagination: {
    total: number;
    pages: number;
    page: number;
    limit: number;
  };
}

export class JobService {
  private jobRepository: JobRepository;

  constructor() {
    this.jobRepository = new JobRepository();
  }

  async getJobs(params: GetJobParams): Promise<GetJobResult> {
    const traceId = generateCustomUUID();
    
    try {
      const {
        program_id,
        page = 1,
        limit = 10,
        is_new_request = false,
        user
      } = params;

      const userId = user?.sub;
      const userType = user?.userType;

      const parsedPage = parseInt(page as string, 10) || 1;
      const parsedLimit = parseInt(limit as string, 10) || 10;
      const offset = (parsedPage - 1) * parsedLimit;

      const isNewRequest = typeof is_new_request === 'string'
        ? is_new_request.toLowerCase() === 'true'
        : Boolean(is_new_request);

      let data: JobData[] | null = null;

      // Handle super user
      if (userType === 'super_user') {
        data = await this.jobRepository.getAllJob(program_id, parsedLimit, offset);
      }

      // Get user data if userType is not provided
      const userData = await this.jobRepository.findUser(program_id, userId);
      
      if (userData && userData.length > 0) {
        const user_type = userData[0]?.user_type;
        const hierarchyIdsArray = userData[0]?.associate_hierarchy_ids || [];
        const tenantId = userData[0]?.tenant_id;
        const isAllHierarchy = userData[0]?.is_all_hierarchy_associate;

        if (user_type) {
          if (user_type.toUpperCase() === "CLIENT") {
            // Check if hierarchyIdsArray is empty or null and is_all_hierarchy is true
            if ((hierarchyIdsArray.length === 0 || !hierarchyIdsArray) && isAllHierarchy) {
              data = await this.jobRepository.getAllJob(program_id, parsedLimit, offset);
            } else {
              data = await this.jobRepository.getAllJobWithHierarchies(program_id, hierarchyIdsArray, parsedLimit, offset);
            }
          } else if (user_type.toUpperCase() === "VENDOR") {
            data = await this.jobRepository.getVendorJobs(program_id, tenantId, parsedLimit, offset, isNewRequest);
          } else if (user_type.toUpperCase() === "MSP") {
            let isMsp = true;
            if (isAllHierarchy) {
              if ((hierarchyIdsArray.length === 0 || !hierarchyIdsArray) && tenantId) {
                data = await this.jobRepository.getAllJobWithHierarchies(program_id, [], parsedLimit, offset, isMsp, tenantId);
              } else {
                data = await this.jobRepository.getAllJobWithHierarchies(program_id, hierarchyIdsArray, parsedLimit, offset, isMsp, tenantId);
              }
            } else {
              data = await this.jobRepository.getAllJobWithHierarchies(program_id, hierarchyIdsArray, parsedLimit, offset, isMsp);
            }
          }
        }
      }

      // Handle case when no data is found
      if (!data) {
        return {
          jobs: [],
          pagination: {
            total: 0,
            pages: 0,
            page: parsedPage,
            limit: parsedLimit,
          }
        };
      }

      const totalRecords = data.length > 0 ? (data[0].total_count || 0) : 0;
      const totalPages = Math.ceil(totalRecords / parsedLimit);
      const jobs = data.map(({ total_count, ...job }) => job);

      return {
        jobs,
        pagination: {
          total: totalRecords,
          pages: totalPages,
          page: parsedPage,
          limit: parsedLimit,
        }
      };

    } catch (error: any) {
      throw error; 
    }
  }
} 