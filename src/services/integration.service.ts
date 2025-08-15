import { FastifyRequest } from "fastify";
import { QueryTypes } from "sequelize";
import { sequelize } from "../config/instance";
import JobRepository from "../repositories/job.repository";
import { getCustomsField } from "../utility/custom-field";
import { parseValue } from "../utility/parseValue";
import { WORKFLOW_STATUS, JOB_STATUS } from "../utility/enum/workflow_enum";

export class IntegrationService {
    private jobRepository: JobRepository;

    constructor() {
        this.jobRepository = new JobRepository();
    }

    async getAllJobsByProgramId(
        request: FastifyRequest<{
            Params: { program_id: string };
            Querystring: { page?: string; limit?: string };
        }>,
        trace_id: string
    ) {
        const transaction = await sequelize.transaction();
        let isTransactionCommitted = false;

        try {
            const { program_id } = request.params;
            const user = request?.user;
            const userId = user?.sub;
            let userType = user?.userType;

            const page = parseInt(request.query.page || "1");
            const limit = parseInt(request.query.limit || "10");
            const offset = (page - 1) * limit;

            if (!userType) {
                const userData = await this.jobRepository.findUser(program_id, userId);
                if (userData?.length > 0) {
                    userType = userData[0]?.user_type;
                }
            }

            const totalJobsCount = await this.jobRepository.getJobsCountByProgramId(program_id);

            if (!totalJobsCount || totalJobsCount === 0) {
                await transaction.commit();
                isTransactionCommitted = true;
                return {
                    status_code: 200,
                    message: "No jobs found.",
                    jobs: [],
                    pagination: { page, limit, total: 0, total_pages: 0 },
                    trace_id
                };
            }

            const paginatedJobIds = await this.jobRepository.getPaginatedJobIds(program_id, limit, offset);

            if (!paginatedJobIds || paginatedJobIds.length === 0) {
                await transaction.commit();
                isTransactionCommitted = true;
                return {
                    status_code: 200,
                    message: "No jobs found for this page.",
                    jobs: [],
                    pagination: {
                        page,
                        limit,
                        total: totalJobsCount,
                        total_pages: Math.ceil(totalJobsCount / limit)
                    },
                    trace_id
                };
            }

            const allJobDataPromises = paginatedJobIds.map(jobId =>
                this.jobRepository.getJobByJobIdAndProgramIdOptimized(jobId, program_id, userType || "default", transaction)
            );
            const allJobDataResults = await Promise.all(allJobDataPromises);

            const jobDataMap = new Map();
            const validJobIds: any[] = [];
            allJobDataResults.forEach((jobData, index) => {
                if (jobData && jobData.length > 0) {
                    const jobId = paginatedJobIds[index];
                    jobDataMap.set(jobId, jobData[0]);
                    validJobIds.push(jobId);
                }
            });

            if (validJobIds.length === 0) {
                await transaction.commit();
                isTransactionCommitted = true;
                return {
                    status_code: 200,
                    message: "No valid jobs found.",
                    jobs: [],
                    pagination: {
                        page,
                        limit,
                        total: totalJobsCount,
                        total_pages: Math.ceil(totalJobsCount / limit)
                    },
                    trace_id
                };
            }

           const batchJobHistory = validJobIds.length > 0 ? await this.jobRepository.getBatchJobHistoryRevisions(validJobIds, transaction) : [];

            const jobHistoryMap = new Map();
            (batchJobHistory as any[]).forEach((history: any) => {
                jobHistoryMap.set(history.job_id, history.revision);
            });

            const vendorDistributionPromises = validJobIds.map(jobId =>
                this.jobRepository.getVendorDistributionData(program_id, jobId, userId, transaction)
            );

            const workflowPromises = validJobIds.map(jobId =>
                this.jobRepository.getWorkflowData(jobId)
            );

            const [vendorDistributionResults, workflowResults] = await Promise.all([
                Promise.all(vendorDistributionPromises),
                Promise.all(workflowPromises)
            ]);

            const vendorDistributionMap = new Map();
            const workflowMap = new Map();

            vendorDistributionResults.forEach((result, index) => {
                vendorDistributionMap.set(validJobIds[index], result);
            });

            workflowResults.forEach((result, index) => {
                workflowMap.set(validJobIds[index], result);
            });

            const checklistEntityIds = Array.from(new Set(
                validJobIds
                    .map(jobId => jobDataMap.get(jobId)?.checklist_entity_id)
                    .filter(entityId => entityId)
            ));

            const checklistPromises = checklistEntityIds.map(entityId =>
                this.jobRepository.getJobChecklistData(entityId, transaction)
            );
            const batchChecklistResults = checklistEntityIds.length > 0 ? await Promise.all(checklistPromises) : [];

            const checklistDataMap = new Map();
            batchChecklistResults.forEach((checklistResults: any, index: number) => {
                if (checklistResults && checklistResults.length > 0) {
                    const entityId = checklistEntityIds[index];
                    checklistDataMap.set(entityId, checklistResults);
                }
            });

            const processedJobs = await Promise.all(
                validJobIds.map(async (jobId) => {
                    let jobResult = jobDataMap.get(jobId);
                    if (!jobResult) return null;

                    if (jobResult?.start_date) {
                        jobResult.start_date = new Date(jobResult.start_date).toISOString().split("T")[0];
                    }
                    if (jobResult?.end_date) {
                        jobResult.end_date = new Date(jobResult.end_date).toISOString().split("T")[0];
                    }

                    const [getCustomsFields] = await sequelize.query(
                        getCustomsField(jobResult.id, "job_custom_fields", "job_id", "custom_field_id"),
                        { replacements: { id: jobResult.id }, transaction }
                    ) as any;

                    let customFields = [];
                    if (getCustomsFields[0]?.custom_fields) {
                        customFields = getCustomsFields[0]?.custom_fields
                            .map((field: any) => ({
                                ...field,
                                value: parseValue(field.value)
                            }))
                            .filter((field: any) => {
                                if (userType?.toLowerCase() === "vendor") {
                                    const canView = Array.isArray(field.can_view) &&
                                        field.can_view.map((val: string) => val.toLowerCase()).includes("vendor");
                                    const canEdit = Array.isArray(field.can_edit) &&
                                        field.can_edit.map((val: string) => val.toLowerCase()).includes("vendor");
                                    return canView || canEdit;
                                }
                                return true;
                            });
                    }

                    if (jobResult?.checklist_entity_id) {
                        const checklistResults = checklistDataMap.get(jobResult.checklist_entity_id);
                        if (checklistResults && checklistResults.length > 0) {
                            jobResult.checklist = checklistResults[0];
                            jobResult.checklist.mappings = checklistResults.reduce((map: Record<string, any>, item: any) => {
                                map[item.trigger] = item.mappings;
                                return map;
                            }, {});
                        }
                    }

                    const vendorDistribution = vendorDistributionMap.get(jobId);
                    const revision = jobHistoryMap.get(jobId);

                    const jobResponse: any = {
                        ...jobResult,
                        status: jobResult.status,
                        submission_limit: vendorDistribution.submissionLimit ?? null,
                        custom_fields: customFields,
                        job_history_revision: revision
                    };

                    if (userType?.toLowerCase() === "vendor") {
                        jobResponse.opt_status = vendorDistribution.optStatus;
                        jobResponse.opt_in = vendorDistribution.optIn;

                        if (vendorDistribution.status?.toLowerCase() === WORKFLOW_STATUS.HALT) {
                            jobResponse.status = JOB_STATUS.HALTED;
                        } else if (vendorDistribution.status?.toLowerCase() === WORKFLOW_STATUS.HOLD) {
                            jobResponse.status = JOB_STATUS.HOLD;
                        } else if (jobResponse.status === JOB_STATUS.PENDING_APPROVAL_SOURCING) {
                            jobResponse.status = JOB_STATUS.SOURCING;
                        }
                    }

                    return jobResponse;
                })
            );

            const total_pages = Math.ceil(totalJobsCount / limit);

            await transaction.commit();
            isTransactionCommitted = true;

            return {
                status_code: 200,
                message: "Jobs fetched successfully.",
                trace_id,
                jobs: processedJobs,
                pagination: { page, limit, total: totalJobsCount, total_pages }
            };

        } catch (error: any) {
            if (!isTransactionCommitted) {
                await transaction.rollback();
            }
            throw error;
        }
    }
}