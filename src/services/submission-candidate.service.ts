import SubmissionCandidateRepository from "../repositories/submission-candidate.repository";
import jobRepository from "../repositories/job.repository";
import { getJobIdsForUserType } from "../controllers/job.controller";
import { getWorkflowData } from "../utility/job_workflow";
import { getOfferActionFlags } from "../controllers/submission-candidate.controller";
import { getWorkerAssignmentCount } from '../utility/worker_assignment_count';

export class SubmissionCandidateService {
  private submissionRepo: SubmissionCandidateRepository;

  constructor() {
    this.submissionRepo = new SubmissionCandidateRepository();
  }

  public async getAllSubmissionCandidates(
    request: any,
    user: any,
    userId: any,
    userType: any,
    tenantId: any
  ) {
    let {
      page: pageParam,
      limit: limitParam,
      employment_status,
      updated_on,
      worker_type_id,
      unique_id,
      job_id,
      job_ids,
      search,
      available_start_date,
      preferred_location,
      status,
      first_name,
      job_title,
      job_code,
      created_on,
    } = request.query;
    const token = request.headers.authorization?.split(" ")[1] || "";
    const program_id = request.params.program_id;

    const page = parseInt(pageParam ?? "1");
    const limit = parseInt(limitParam ?? "10");
    const offset = (page - 1) * limit;

    const dynamicJobIds = await getJobIdsForUserType(program_id, userId, userType);
    let statusArray: string[] | null = null;
    if (status) {
      if (Array.isArray(status)) {
        statusArray = status;
      } else {
        statusArray = status.includes(",") ? status.split(",") : [status];
      }
    }
    const isValidStatus =
      Array.isArray(statusArray) &&
      (statusArray.includes("PENDING_SHORTLIST_REVIEW_WORKFLOW") ||
        statusArray.includes("PENDING_REHIRE_APPROVAL_WORKFLOW") ||
        statusArray.includes("PENDING_REHIRE_REVIEW_WORKFLOW"));
    if (Array.isArray(statusArray) && statusArray.length) {
      if (statusArray.includes("PENDING_SHORTLIST_REVIEW_WORKFLOW")) {
        statusArray = ["PENDING_SHORTLIST_REVIEW"];
      } else if (statusArray.includes("PENDING_REHIRE_APPROVAL_WORKFLOW")) {
        statusArray = ["PENDING_REHIRE_APPROVAL"];
      } else if (statusArray.includes("PENDING_REHIRE_REVIEW_WORKFLOW")) {
        statusArray = ["PENDING_REHIRE_REVIEW"];
      }
    }

    const replacements: any = {
      program_id,
      vendor_id: tenantId,
      employment_status: employment_status ? `%${employment_status}%` : null,
      updated_on,
      worker_type_id,
      unique_id,
      job_id: job_id ?? null,
      job_ids: job_ids || (dynamicJobIds.length > 0 ? dynamicJobIds : null),
      limit: limit,
      offset,
      search: search ? `%${search}%` : null,
      available_start_date: available_start_date
        ? `%${available_start_date}%`
        : null,
      preferred_location: preferred_location ? `%${preferred_location}%` : null,
      status: statusArray,
      first_name: first_name ? `%${first_name}%` : null,
      job_title: job_title ? `%${job_title}%` : null,
      job_code: job_code ? `%${job_code}%` : null,
      user_id: userType === "super_user" ? null : userId ? userId : null,
      isValidStatus,
      created_on,
    };

    let result;
    let totalRecords;
    if (userType === "vendor") {
      result = await this.submissionRepo.submiteCandidatesGetAllForVendor(replacements);
      totalRecords = result.length > 0 ? result[0].total_count : 0;
    } else {
      result = await this.submissionRepo.submiteCandidatesGetAll(replacements);
      totalRecords = result.length > 0 ? result[0].total_count : 0;
    }

    let workflowData: any[] = [];
    let matchedCandidateIds: any[] = [];
    let filteredCandidates: any[] = [];
    const isSuperUser = userType?.toLowerCase?.() === "super_user";

    if (!isSuperUser && userType?.toLowerCase?.() !== "msp" && userType?.toLowerCase?.() !== "client") {
      const candidateIds = result.map((candidate: any) => candidate.id);
      workflowData = await getWorkflowData(
        candidateIds,
        program_id,
        userId
      );
      matchedCandidateIds = workflowData.map(
        (item: any) => item.match_candidate_id
      );
      const allowedStatuses = [
        "PENDING_REHIRE_REVIEW",
        "PENDING_REHIRE_APPROVAL",
        "PENDING_SHORTLIST_REVIEW",
      ];
      filteredCandidates = result.filter((candidate: any) => {
        const isMatched =
          isSuperUser || matchedCandidateIds.includes(candidate.id);
        const shouldShowCandidate =
          !isMatched && allowedStatuses.includes(candidate.status);
        return !shouldShowCandidate;
      });
      totalRecords = filteredCandidates.length > 0 ? filteredCandidates[0].total_count : 0;
    } else {
      filteredCandidates = result;
    }

    const candidateIds = filteredCandidates.map((c: any) => c.candidate_id);

    // Fetch assignment counts once
    const workerAssignmentCountData = candidateIds.length
      ? await getWorkerAssignmentCount(program_id, candidateIds, token)
      : null;

    // Prepare assignment count map
    const assignmentCountMap = new Map<string, { current_count: number; previous_count: number }>();
    if (workerAssignmentCountData && Array.isArray(workerAssignmentCountData.data)) {
      for (const item of workerAssignmentCountData.data) {
        assignmentCountMap.set(item.candidate_id, {
          current_count: Number(item.current_count) || 0,
          previous_count: Number(item.previous_count) || 0,
        });
      }
    } else {
      console.warn("Worker assignment count data is invalid or empty", workerAssignmentCountData);
    }

    const formattedCandidates = await Promise.all(
      filteredCandidates.map(async (candidate: any) => {
        const actions = await getOfferActionFlags({
          status: candidate.status,
          userType,
          jobId: candidate.job_id,
        });

        const key = (candidate.candidate_id || '').toString();
        const assignmentCount = assignmentCountMap.get(key) || {
          current_count: 0,
          previous_count: 0,
        };

        return {
          id: candidate.id,
          program_id: candidate.program_id,
          job_code: candidate.job_code,
          job_id: candidate.job_id,
          job_title: candidate.job_title,
          is_submission_exceed_max_bill_rate:
          !!candidate.is_submission_exceed_max_bill_rate,
          unique_id: candidate.unique_id,
          candidate_id: candidate.candidate_id,
          first_name: candidate.first_name,
          last_name: candidate.last_name,
          middle_name: candidate.middle_name,
          worker_type_id: candidate.worker_type_id,
          do_not_rehire: candidate.do_not_rehire,
          do_not_rehire_notes: candidate.do_not_rehire_notes,
          do_not_rehire_reason: candidate.do_not_rehire_reason,
          resume_url: candidate.resume_url,
          available_start_date: candidate.available_start_date,
          available_end_date: candidate.available_end_date,
          is_candidate_work_before: !!candidate.is_candidate_work_before,
          is_remote_worker: !!candidate.is_remote_worker,
          candidate_source: candidate.candidate_source,
          addresses: candidate.is_remote_worker
            ? {
              zip: candidate.address_zip,
              city: candidate.address_city,
              state: candidate.address_state,
              street: candidate.address_street,
              country: candidate.country_id,
              work_location: candidate.country_name,
            }
            : {
              id: candidate.work_location_id,
              work_location: candidate.work_location_name,
            },
          employment_status: candidate.employment_status,
          status: candidate.status,
          description: candidate.description,
          documents: candidate.documents,
          financial_detail: candidate.financial_detail,
          worker_classification: candidate.worker_classification,
          created_on: candidate.created_on,
          updated_on: candidate.updated_on,
          is_deleted: !!candidate.is_deleted,
          is_enabled: !!candidate.is_enabled,
          offer_flag: candidate.offer_flag === 1,
          interview_flag: candidate.interview_flag === 1,
          is_duplicate_submission: candidate.is_duplicate_submission === 1,
          is_rate_above_max_limit: candidate.is_rate_above_max_limit === 1,
          scores: candidate.scores,
          assignment_count: assignmentCount,
          submitted_jobs_count: candidate.submitted_jobs_count || 0,
          actions: actions,
        };
      })
    );

    const totalPages = Math.ceil(totalRecords / limit);
    const itemsPerPage = limit;

    return {
      totalRecords,
      page,
      limit,
      totalPages,
      itemsPerPage,
      formattedCandidates,
    };
  }
}
