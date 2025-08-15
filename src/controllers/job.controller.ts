import { FastifyRequest, FastifyReply, FastifyBaseLogger, FastifySchema, FastifyTypeProviderDefault, RawServerDefault, RouteGenericInterface } from "fastify";
import { JobInterface, JobCandidateDataInterface, JobCustomfieldDataInterface, JobRateTypeDataInterface, JobFoundationDataTypeDataInterface, JobQualificationDataTypeDataInterface, JobValidationInterface, FeeConfig, JobStatistics, MarkupDataInterface, FundingModelParams, JobRateDataInterface, accuracyType, VendorMarkupDataInterface, JobTemplate } from "../interfaces/job.interface";
import generateCustomUUID from "../utility/genrateTraceId";
import jobCandidateModel from "../models/job-candidate.model";
import jobCustomfieldsModel from "../models/job-custom-fields.model";
import jobFoundationDataTypeModel from "../models/job-foundation-data-type.model";
import jobQulificationType from "../models/job-qulification-type.model";
import jobRateModel from "../models/job-rate.model";
import { QueryTypes } from "sequelize";
import { jobTemplateQuery, jobWorkflowQuery } from "../utility/queries";
import { sequelize } from "../config/instance";
import { validateJobRequest } from "../utility/ValidationSchema";
import JobDistributionModel from "../models/job-distribution.model";
import { decodeToken } from "../middlewares/verifyToken";
import { logger } from "../utility/loggerServices";
import JobRepository from "../repositories/job.repository";
import { NotificationDataPayload } from '../interfaces/noifications-data-payload.interface';
import { EmailRecipient } from '../interfaces/email-recipient';
import { sendNotification } from "../utility/notificationService";
import { getJobManagerEmail, notifyJobManager, fetchUsersBasedOnHierarchy } from '../utility/notification-helper'; // Adjust the path accordingly
const jobRepository = new JobRepository();
import incrementJobSubmittedCount from "../utility/updateCount";
import OfferRepository from "../repositories/offer.repository";
const offersRepository = new OfferRepository();
import Hierarchy from "../utility/hierarchy";
import JobHistoryModel from "../models/job-history.model";
import generateSlug from "../plugins/slugGenerate";
import { databaseConfig } from '../config/db';
import JobModel from "../models/job.model";
import SubmissionCandidateRepository from '../repositories/submission-candidate.repository';
import { NotificationEventCode } from "../utility/notification-event-code";
import GlobalRepository from "../repositories/global.repository";
import InterviewRepository from "../repositories/interview.repository";
import { determinetWorkflowStatus, getEventIdFromModule, getWorkflowData, workflowTriggering } from "../utility/job_workflow";
import { buildMinimalChanges, buildStructuredChanges, createJobHistoryRecord } from "./job-history.controller";
import { JobComparisonService } from "../repositories/job-history.repository";
const interviewRepository = new InterviewRepository()
const comparisonService = new JobComparisonService();
const submissionCandidateRepository = new SubmissionCandidateRepository();
const config_db = databaseConfig.config.database_config;
import JobDistributionNotificationService from "../notification/job-distribution-notification-service";
import JobNotificationService from "../notification/job-notification-service";
import { getCustomsField } from "../utility/custom-field";
import JobHistory from "../models/job-history.model";
import { JobService } from "../services/job.service";
import { handleError } from "../utility/errorHandler";
const jobDistributionNotificationService = new JobDistributionNotificationService();
const jobNotificationService = new JobNotificationService();
export function configBaseUrl(): string | undefined {
    return databaseConfig.config.config_url;
}

let rootTenantId = databaseConfig.config.root_tenant_id;

interface VendorDistributionParams {
    hierarchy_ids: string[];
    // work_location_id: string;
    labor_category_id: string;
    program_id: string;
}
interface ProgramVendor {
    tenant_id: any;
    is_job_auto_opt_in: any;
    vendor_id: any;
    id: string;
    program_industry: string[];
    work_locations: string[];
    hierarchies: string[];
    labor_category_id: string;
    vendors: string[];
    vendor_group_ids: any;
    duration: number;
    measure_unit: string;
}

export const getJob = async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateCustomUUID();
    try {
        const user = request?.user;
        const { program_id } = request.params as { program_id: string };
        const { page, limit, is_new_request } = request.query as {
            page?: number | string;
            limit?: number | string;
            is_new_request?: boolean | string;
        };

        const jobService = new JobService();
        const result = await jobService.getJobs({
            program_id,
            page,
            limit,
            is_new_request,
            user,
        });

        if (result.jobs.length === 0) {
            return reply.status(200).send({
                message: "No jobs found",
                trace_id: traceId,
                jobs: [],
            });
        }

        reply.status(200).send({
            message: "Job fetched successfully",
            trace_id: traceId,
            jobs: result.jobs,
            pagination: result.pagination,
        });
    } catch (error: any) {
        const errorResponse = handleError(error, traceId);
        return reply.status(errorResponse.status_code).send(errorResponse);
    }
};

export async function getJobById(request: FastifyRequest, reply: FastifyReply) {
    const trace_id = generateCustomUUID();
    const jobRepository = new JobRepository();

    const transaction = await sequelize.transaction();
    let isTransactionCommitted = false;

    try {
        const { program_id, id } = request.params as { program_id: string, id: string };
        const user = request?.user;
        const userId = user?.sub;
        let userType = user?.userType;

        const [userData, jobData] = await Promise.all([
            !userType ? jobRepository.findUser(program_id, userId) : Promise.resolve([{ user_type: userType }]),
            jobRepository.getJobByJobIdAndProgramIdOptimized(id, program_id, userType || 'default', transaction)
        ]);

        if (!userType && userData.length > 0) {
            userType = userData[0]?.user_type;
        }

        if (!jobData || jobData.length === 0) {
            await transaction.commit();
            isTransactionCommitted = true;
            return reply.status(200).send({
                status_code: 200,
                message: 'Job not found.',
                job: [],
                trace_id: trace_id
            });
        }

        let jobResult = jobData[0];

        if (jobResult?.start_date) {
            jobResult.start_date = new Date(jobResult.start_date).toISOString().split('T')[0];
        }
        if (jobResult?.end_date) {
            jobResult.end_date = new Date(jobResult.end_date).toISOString().split('T')[0];
        }
        const [getCustomsFields] = await sequelize.query(
            getCustomsField(jobResult.id, 'job_custom_fields', 'job_id', 'custom_field_id'),
            {
                replacements: {
                    id: jobResult.id
                }
            }

        ) as any
        let customFields = []
        if (getCustomsFields[0]?.custom_fields) {
            customFields = getCustomsFields[0]?.custom_fields
                .sort((a: any, b: any) => a.seq_number - b.seq_number)
                .map((field: any) => ({
                    ...field,
                    value: parseValue(field.value),
                }))
                .filter((field: any) => {
                    if (userType?.toLowerCase() === 'vendor') {
                        const canView = Array.isArray(field.can_view) &&
                            field.can_view.map((val: string) => val.toLowerCase()).includes('vendor');
                        const canEdit = Array.isArray(field.can_edit) &&
                            field.can_edit.map((val: string) => val.toLowerCase()).includes('vendor');
                        return canView || canEdit;
                    }
                    return true;
                });
        }

        const parallelQueries: any = [];

        if (jobResult?.checklist_entity_id) {
            parallelQueries.push(
                jobRepository.getJobChecklistData(jobResult.checklist_entity_id, transaction)
            );
        } else {
            parallelQueries.push(Promise.resolve(null));
        }

        parallelQueries.push(
            jobRepository.getVendorDistributionData(program_id, id, userId, transaction)
        );

        parallelQueries.push(
            workflowData(request, reply, id)
        );

        const [checklistResults, vendorDistribution, flowTypes] = await Promise.all(parallelQueries);

        if (checklistResults && checklistResults.length > 0) {
            jobResult.checklist = checklistResults[0];
            jobResult.checklist.mappings = checklistResults.reduce((map: Record<string, any>, item: any) => {
                map[item.trigger] = item.mappings;
                return map;
            }, {} as Record<string, any>);
        }

        const jobHistoryRecords = await JobHistory.findOne({
            where: { job_id: id },
            attributes: ['revision'],
            order: [['revision', 'DESC']],
            raw: true,
        });

        const revision = jobHistoryRecords?.revision;

        const jobResponse: any = {
            ...jobResult,
            status: jobResult.status,
            submission_limit: vendorDistribution.submissionLimit,
            custom_fields: customFields,
            job_history_revision: revision
        };

        if (userType?.toLowerCase() === 'vendor') {
            jobResponse.opt_status = vendorDistribution.optStatus;
            jobResponse.opt_in = vendorDistribution.optIn;

            if (vendorDistribution.status?.toLowerCase() === 'halt') {
                jobResponse.status = 'HALTED';
            } else if (vendorDistribution.status?.toLowerCase() === 'hold') {
                jobResponse.status = 'HOLD';
            } else if (jobResponse.status === 'PENDING_APPROVAL_SOURCING') {
                jobResponse.status = 'SOURCING';
            }
        }

        await transaction.commit();
        isTransactionCommitted = true;

        return reply.status(200).send({
            status_code: 200,
            message: 'Job fetched successfully.',
            trace_id: trace_id,
            flowTypes: flowTypes,
            job: jobResponse
        });

    } catch (error: any) {
        if (!isTransactionCommitted) {
            await transaction.rollback();
        }
        console.error('Error in getJobByIdOptimized:', error);
        reply.status(500).send({
            message: 'Internal Server Error',
            trace_id: trace_id,
            error: error.message
        });
    }
}

export function parseValue(value: string | null): any {
    if (!value) return null;

    try {
        const parsed = JSON.parse(value);
        return parsed;
    } catch {
        if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
            return value.slice(1, -1);
        }
        return value;
    }
}

async function workflowData(request: FastifyRequest, reply: FastifyReply, id: any) {
    try {
        let programData = await sequelize.query(
            `SELECT * FROM ${config_db}.workflow WHERE workflow_trigger_id = :workflow_trigger_id AND (status = "pending" OR status = "completed")`,
            {
                replacements: { workflow_trigger_id: id },
                type: QueryTypes.SELECT
            }
        );
        // Create a map to store the latest status for each flow_type
        const flowTypeStatusMap = new Map<string, boolean>();
        for (const program of programData) {
            const { flow_type, status } = program as { flow_type: string; status: string };
            // If the flow_type is already in the map, prioritize "completed" status
            if (!flowTypeStatusMap.has(flow_type) || status === "completed") {
                flowTypeStatusMap.set(flow_type, status === "completed");
            }
        }
        const flowTypes = Array.from(flowTypeStatusMap.entries())
            .map(([flow_type, is_completed]) => ({ flow_type, is_completed }))
            .sort((a, b) => {
                if (a.flow_type === "Review") return -1;
                if (b.flow_type === "Review") return 1;
                return 0;
            });
        console.log(flowTypes);

        return flowTypes
    } catch (error) {
        console.error("Error fetching job creator:", error);
        throw error;
    }
}

export async function createJob(request: FastifyRequest, reply: FastifyReply) {
    const { program_id } = request.params as { program_id: string };
    let currentStep = "Initializing";
    const traceId = generateCustomUUID();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ message: 'Unauthorized - Token not found' });
    }

    currentStep = "Decoding Token";
    const token = authHeader.split(' ')[1];
    const user = await decodeToken(token);

    if (!user) {
        return reply.status(401).send({ message: 'Unauthorized - Invalid token' });
    }
    const userId = user?.sub;
    const userType = user?.userType;
    const initialJobData = request.body as JobInterface;

    logger({
        traceId,
        actor: {
            user_name: user?.preferred_username,
            user_id: userId,
        },
        data: initialJobData,
        eventname: "creating job",
        status: "info",
        description: `Creating job for ${program_id}`,
        level: 'info',
        action: request.method,
        url: request.url,
        entity_id: program_id,
        is_deleted: false
    }, JobModel);

    const transaction = await sequelize.transaction();

    try {
        const jobData = request.body as {
            hierarchy_ids: any;
            job_template_id: any;
            candidates?: JobCandidateDataInterface[];
            custom_fields?: JobCustomfieldDataInterface[];
            foundationDataTypes?: JobFoundationDataTypeDataInterface[];
            qualifications?: JobQualificationDataTypeDataInterface[];
            rates?: JobRateTypeDataInterface[];
            module_id?: string;
            status?: string;
            job_manager_id: string;
            budgets?: any
            userType?: any
            userId?: any
            duration?: number
        };

        const event_slug = "create_job";
        const module_name = "Job";
        const type = "workflow"
        const placement_order = "0"
        let is_updated = false
        const { program_id } = request.params as { program_id: string };

        currentStep = "Fetching Module ID OR Module ID";
        const { moduleId, eventId } = await getEventIdFromModule(module_name, event_slug, type);
        const weekCount = parseInt(jobData.budgets?.formatted_weeks_days?.match(/(\d+)\s+Weeks?/)?.[1] || "0");

        const jobDatas = request.body as JobInterface;

        jobDatas.userType = userType || ""
        jobData.userType = userType || ""
        jobDatas.userId = userId
        jobData.userId = userId
        jobDatas.duration = weekCount
        jobData.duration = weekCount

        const module_id: any = moduleId;
        const event_id = eventId || "";
        currentStep = "Querying Workflow";
        const workflowQuery2 = jobWorkflowQuery(jobDatas.hierarchy_ids);
        const rows: any = await sequelize.query(workflowQuery2, {
            replacements: { module_id, event_id, program_id, placement_order },
            type: QueryTypes.SELECT,
            transaction
        });
        console.log('rows is now', JSON.stringify(rows));

        if (jobData.status?.toUpperCase() === "DRAFT") {
        } else if (rows.length === 0) {
            jobData.status = "OPEN";
        } else {
            let hasReviewFlow = rows.some((row: any) => row.flow_type.trim() === 'Review');
            let hasEmptyLevels = rows.some((row: any) =>
                !row.levels ||
                row?.levels?.length === 0 ||
                row.levels?.every((level: any) => !level?.recipient_types || level?.recipient_types?.length === 0)
            );

            if (hasEmptyLevels) {
                jobData.status = "OPEN";
            } else {
                jobData.status = hasReviewFlow ? "PENDING_REVIEW" : "PENDING_APPROVAL";
            }
        }
        console.log('JobData for update:', jobData);

        currentStep = "Fetching Job Template";
        const job_template_id = jobData.job_template_id
        const jobTemplate = await jobTemplateQuery(job_template_id, program_id);
        if (jobTemplate) {
            const count = jobTemplate.job_submitted_count;
            currentStep = "Incrementing job submitted count";
            await incrementJobSubmittedCount(job_template_id, program_id, count, token);
        }
        currentStep = "Creating Job";
        const [job] = await JobModel.upsert({
            ...jobDatas,
            checklist_entity_id: jobDatas.checklist_entity_id ?? jobTemplate?.checklist_entity_id ?? null,
            checklist_version: jobDatas.checklist_version ?? jobTemplate?.checklist_version ?? null,
            program_id,
            created_by: userId,
            updated_by: userId,
            created_on: Date.now(),
            updated_on: Date.now(),
            submission_limit_vendor: jobTemplate?.submission_limit_vendor ?? null
        }, { transaction });

        currentStep = "Logging job creation";
        logger(
            {
                traceId,
                actor: {
                    user_name: user?.preferred_username,
                    user_id: userId,
                },
                data: request.body,
                eventname: "create program vendor",
                status: "success",
                description: `create job for ${program_id} successfully: ${job.id}`,
                level: 'success',
                action: request.method,
                url: request.url,
                entity_id: program_id,
                is_deleted: false
            },
            JobModel
        );

        let workflow_job_id = job.id

        const hierarchyIds = jobData.hierarchy_ids;
        currentStep = "Updating hierarchies";
        if (hierarchyIds && Array.isArray(hierarchyIds)) {
            try {
                await Promise.all(
                    hierarchyIds.map(async (id: string) => {
                        const result = await Hierarchy.updateHierarchy(id, program_id, token);
                        console.log(`Hierarchy updated: ID ${id}, Result:`, result);
                    })
                );
            } catch (error: any) {
                throw error;
            }
        } else {
            console.warn("No hierarchies to update.");
        }

        currentStep = "Creating related job data";
        await Promise.all([
            ...(jobData.candidates || []).map(candidate =>
                jobCandidateModel.create({ ...candidate, job_id: job.id, program_id }, { transaction })
            ),
            ...(jobData.custom_fields || []).map(field =>
                jobCustomfieldsModel.create({ ...field, job_id: job.id, program_id }, { transaction })
            ),
            ...(jobData.foundationDataTypes || []).map(dataType =>
                jobFoundationDataTypeModel.create({ ...dataType, job_id: job.id, program_id }, { transaction })
            ),
            ...(jobData.qualifications || []).map(qualification =>
                jobQulificationType.create({ ...qualification, job_id: job.id, program_id }, { transaction })
            ),
            ...(jobData.rates || []).map(rate =>
                jobRateModel.create({ ...rate, job_id: job.id, program_id }, { transaction })
            )
        ]);
        currentStep = "Handling Workflow Trigger";
        let status;
        if (jobData.status !== "DRAFT") {
            let workflow = await workflowTriggering(request, reply, program_id, rows, job, jobData, jobDatas, module_name, is_updated, workflow_job_id, event_slug);
            status = await determinetWorkflowStatus({
                workflow,
                jobTemplate,
                jobDatas,
                request,
                reply,
                program_id,
                module_id,
                event_id,
                placement_order,
                job,
                jobData,
                module_name,
                is_updated,
                workflow_job_id,
                event_slug,
                transaction
            });

            await JobModel.update({ status }, { where: { id: job.id, program_id }, transaction });
        }

        currentStep = "Creating job history";

        const historyStatus = status || "OPEN";
        let distributedVendorsData = null;
        if (jobTemplate?.is_automatic_distribution) {
            const matchedVendors = await getVendorDistributionScheduleByIds({
                hierarchy_ids: job.hierarchy_ids,
                // work_location_id: job.work_location_id,
                labor_category_id: jobTemplate.labour_category,
                program_id
            });

            distributedVendorsData = {
                distributed_vendors: matchedVendors
            };
        }

        const allJobData = distributedVendorsData
            ? { ...jobData, ...distributedVendorsData }
            : jobData;
        if (jobData?.status !== "DRAFT") {
            await createJobHistoryRecord(
                {
                    id: job.id,
                    program_id: job.program_id,
                    allow_per_identified_s: job.allow_per_identified_s
                },
                allJobData,
                user?.sub ?? "",
                transaction,
                "Job Created",
                null,
                historyStatus
            );
        }

        currentStep = "Handling automatic distribution";
        job.status = status
        if (jobTemplate && jobData.status?.toUpperCase() != "DRAFT" && job.allow_per_identified_s !== true) {
            console.log('Automatic Job distribution');
            if (jobTemplate.is_automatic_distribution) {

                if (rows.length !== 0 && rows?.[0].flow_type.toLowerCase() === "approval" && jobTemplate?.is_review_configured_or_submit == true) {
                    distributeAutomatically({ jobTemplate, job, program_id, userId });
                    jobDistributionNotificationService.distributeAutomaticallyNotification({ user, job, program_id, traceId, token, sequelize, reply, sendNotification, jobTemplate });
                } else if (rows.length !== 0) {
                    console.log("Job distribute after workflow approval");
                } else {
                    distributeAutomatically({ jobTemplate, job, program_id, userId });
                    jobDistributionNotificationService.distributeAutomaticallyNotification({ user, job, program_id, traceId, token, sequelize, reply, sendNotification, jobTemplate });
                }
            }
        }


        if (jobTemplate && job.allow_per_identified_s === true && jobData.status?.toUpperCase() !== "DRAFT") {
            const candidates = jobData.candidates;
            const jobId = job.id;
            const programId = job.program_id;

            if (jobTemplate.is_automatic_distribution) {
                if (rows.length !== 0 && rows[0].flow_type?.toLowerCase() === "approval" && jobTemplate.is_review_configured_or_submit) {
                    const vendor_submission_limit = 1
                    for (const candidate of candidates ?? []) {
                        distributeJob(candidate, programId, jobId, userId, vendor_submission_limit, "PENDING_APPROVAL_SOURCING");
                    }
                }
                else if (rows.length !== 0 && rows[0].flow_type?.toLowerCase() === "approval" && jobTemplate.is_distribute_final_approval) {
                    console.log("distribute job final approval");
                } else if (rows.length !== 0 && rows[0].flow_type?.toLowerCase() === "review") {
                    console.log("distribute job final approval");
                } else {
                    const vendor_submission_limit = 1
                    for (const candidate of candidates ?? []) {
                        distributeJob(candidate, programId, jobId, userId, vendor_submission_limit, "sourcing");
                    }
                }
            }

        }

        if (jobTemplate && jobData.status?.toUpperCase() != "DRAFT" && job.allow_per_identified_s !== true) {
            if (jobTemplate.is_tiered_distribute_submit) {
                if (rows.length !== 0) {
                    console.log("Job distribute after workflow approval");
                } else {
                    const distributionTransaction = await sequelize.transaction();
                    console.log("teired distribution");
                    const distributionPromise = tieredDistributeWrapper({
                        jobTemplate,
                        job,
                        program_id,
                        transaction: distributionTransaction,
                        userId,
                        traceId
                    }).catch(error => {
                        console.error('Async distribution failed:', error);
                    });
                }
            }
        }

        currentStep = "Sending job notifications";
        if (jobData.status?.toUpperCase() != "DRAFT") {
            jobNotificationService.handleJobNotification(token, sequelize, program_id, job, user, traceId, NotificationEventCode.JOB_CREATED);
        }
        await transaction.commit();
        reply.status(201).send({
            status_code: 201,
            message: 'Job created successfully.',
            id: job.id,
            trace_id: traceId,
        });
    } catch (error: any) {
        console.error(`Error at step: ${currentStep}`, error);
        await transaction.rollback();
        logger(
            {
                traceId,
                actor: {
                    user_name: user?.preferred_username,
                    user_id: userId,
                },
                data: request.body,
                eventname: "create job",
                status: "failed",
                description: `create job for ${program_id} failed`,
                level: 'error',
                action: request.method,
                url: request.url,
                error: `Failed at ${currentStep}: ${error.message}`,
                entity_id: program_id,
                is_deleted: false
            },
            JobModel
        );
        reply.status(500).send({
            status_code: 500,
            message: 'An error occurred while creating the job.',
            trace_id: traceId,
            error: error.message,
            failed_at: currentStep
        });
    }
}

async function tieredDistributeWrapper({ jobTemplate, job, program_id, transaction, userId, traceId }:
    { jobTemplate: any; job: any; program_id: any; transaction: any; userId: any; traceId: string }) {
    try {
        const status = "SOURCING";
        const result = await tieredDistributeSchedule({ jobTemplate, job, program_id, userId, status });

        if (!result.success) {
            throw new Error(result.message ?? 'Distribution failed');
        }

        await transaction.commit();

        logger({
            traceId,
            actor: { user_id: userId },
            eventname: "tiered_distribution_complete",
            status: "success",
            description: `Tiered distribution completed for job ${job.id}`,
            level: 'info',
            entity_id: job.id
        }, JobModel);

    } catch (error) {
        await transaction.rollback();
        logger({
            traceId,
            actor: { user_id: userId },
            eventname: "tiered_distribution_failed",
            status: "failed",
            description: `Tiered distribution failed for job ${job.id}`,
            level: 'error',
            error: error,
            entity_id: job.id
        }, JobModel);
    }
}

export async function distributeAutomatically({ jobTemplate, job, program_id, userId, matchedVendors: inputMatchedVendors, }:
    { jobTemplate: any; job: any; program_id: any; userId: any; matchedVendors?: any; }) {
    try {
        const jobId = job.id ?? job.updates?.job_id;
        const jobStatus = job?.dataValues?.status || job?.status

        let currentStatus;

        if (jobStatus?.toUpperCase() === "PENDING_APPROVAL" || jobStatus?.toUpperCase() === "PENDING_APPROVAL_SOURCING") {
            currentStatus = "PENDING_APPROVAL_SOURCING";
        } else {
            currentStatus = "SOURCING";
        }

        if (!jobId) {
            console.error("Error: Job ID not found for distribution.");
            return { success: false, message: "Job ID not found" };
        }

        let matchedVendors = inputMatchedVendors;
        if (!matchedVendors) {
            matchedVendors = await getVendorDistributionScheduleByIds({
                hierarchy_ids: job.hierarchy_ids,
                labor_category_id: jobTemplate.labour_category,
                program_id,
            });
        }

        let existingDistribution;
        if (matchedVendors && matchedVendors.length > 0) {
            const jobDistributionPromises = (matchedVendors ?? []).map(async (vendor: any) => {
                existingDistribution = await JobDistributionModel.findOne({
                    where: {
                        program_id,
                        job_id: jobId,
                        vendor_id: vendor.id,
                    },
                });

                const currentDate = Date.now();

                if (!existingDistribution) {
                    const optStatus = vendor?.is_job_auto_opt_in ? "OPT_IN" : null;
                    await JobDistributionModel.create({
                        program_id,
                        job_id: jobId,
                        distribute_method: "Distribute Automatically",
                        status: "distributed",
                        vendor_id: vendor.id,
                        submission_limit: jobTemplate.submission_limit_vendor,
                        opt_status: optStatus,
                        distributed_by: userId,
                        created_by: userId,
                        updated_by: userId,
                        opt_status_date: optStatus ? currentDate : null,
                        distribution_date: currentDate,
                        duration: 0,
                    });
                }
            });

            await Promise.all(jobDistributionPromises);
            await JobModel.update({ status: currentStatus }, { where: { id: jobId, program_id } });

            if (!existingDistribution) {
                console.log("Distribute automatically history");
                const compareMetaData = {
                    status: {
                        key: "Status",
                        slug: "status",
                        old_value: jobStatus,
                        new_value: currentStatus
                    }
                };

                try {
                    await createJobHistoryRecord(
                        { id: jobId, program_id },
                        { status: currentStatus },
                        userId,
                        null,
                        "Job Distributed",
                        compareMetaData
                    );
                } catch (error) {
                    console.error("Error in distributeAutomatically history:", error);
                }
            }
            return { success: true, message: "Job distribution completed successfully." };
        } else {
            return { success: false, message: "No matched vendors found for distribution." };
        }
    } catch (error: any) {
        console.log(error.message);
        console.error("Error during vendor distribution:", error);
        return { success: false, message: `Error during vendor distribution: ${error.message}` };
    }
}

export async function distributeJob(candidate: any, programId: any, jobId: any, userId: any, vendor_submission_limit: any, status: any) {
    const vendorId = candidate.vendor
    const vendorData = await jobRepository.getVendorIsJobAutoOptIn(programId, vendorId)
    const optStatus = vendorData?.[0]?.is_job_auto_opt_in ? "OPT_IN" : null;

    const distribution = await JobDistributionModel.create({
        program_id: programId,
        job_id: jobId,
        distribute_method: "Distribute Automatically",
        status: "distributed",
        vendor_id: candidate.vendor,
        submission_limit: vendor_submission_limit,
        opt_status: optStatus,
        distributed_by: userId,
        created_by: userId,
        updated_by: userId,
        opt_status_date: optStatus ? Date.now() : null,
        distribution_date: Date.now(),
        duration: 0,
    },);

    if (distribution?.job_id) {
        await JobModel.update({ status: status }, { where: { id: jobId } });
        console.log("Job distribution completed successfully.");
    }
}

export async function tieredDistributeSchedule({ jobTemplate, job, program_id, userId, status }: {
    jobTemplate: any; job: any; program_id: any; userId: any; status: string
}): Promise<{ success: boolean; message?: string }> {
    try {
        if (!jobTemplate.distribution_schedule) {
            return { success: false, message: "No distribution schedule specified" };
        }

        const jobId = job.id ?? job.updates?.job_id;
        const currentStatus = status ?? "SOURCING";

        const vendorRecords = await getVendorDistributionRecords(
            jobTemplate.distribution_schedule,
            program_id
        );

        if (!vendorRecords.length) {
            return { success: false, message: "No vendor records found for this schedule" };
        }

        const { vendorToGroupMap, allVendorIds } = await enrichVendorsWithGroups(vendorRecords, program_id);

        if (!allVendorIds.length) {
            return {
                success: false,
                message: "No vendor IDs found in distribution records or vendor groups"
            };
        }

        const programVendors = await getVendorDistributionScheduleByIds({
            hierarchy_ids: job.hierarchy_ids,
            // work_location_id: job.work_location_id,
            labor_category_id: jobTemplate.labour_category,
            program_id
        });

        if (!programVendors.length) {
            return { success: false, message: "No matching program vendors found" };
        }

        const existingDistributions = await getExistingDistributions(job.id);
        const vendorMap = new Map(programVendors.map((v) => [v.id, v]));

        const jobDistributions = buildJobDistributions(
            vendorRecords,
            vendorMap,
            vendorToGroupMap,
            existingDistributions,
            program_id,
            job.id,
            jobTemplate.submission_limit_vendor,
            userId
        );

        if (!jobDistributions.length) {
            return { success: true, message: "No new vendors to distribute to" };
        }

        await JobDistributionModel.bulkCreate(jobDistributions);
        await JobModel.update(
            { status: currentStatus },
            { where: { id: jobId, program_id } }
        );

        return {
            success: true,
            message: `Successfully distributed job to ${jobDistributions.length} vendors`
        };
    } catch (error: any) {
        console.error("Error during vendor tiered distribution:", error);
        return { success: false, message: error.message ?? "Distribution failed" };
    }
}

async function getVendorDistributionRecords(distribution_schedule_id: string, program_id: string) {
    const query = `
      SELECT vdssd.vendors, vdssd.vendor_group_ids, vdssd.duration, vdssd.measure_unit
      FROM ${config_db}.vendor_distribution_schedules vds
      JOIN ${config_db}.vendor_dist_schedule_details vdssd ON vdssd.distribution_id = vds.id
      WHERE vds.id = :distribution_schedule_id
        AND vds.program_id = :program_id
        AND vds.is_enabled = true
        AND vds.is_deleted = false;
    `;

    return await sequelize.query<ProgramVendor>(query, {
        replacements: { distribution_schedule_id, program_id },
        type: QueryTypes.SELECT
    });
}

async function enrichVendorsWithGroups(vendorRecords: any[], program_id: string) {
    const vendorToGroupMap = new Map<string, string>();

    for (const record of vendorRecords) {
        const { vendors, vendor_group_ids } = record;
        const vendorSet = new Set<string>();

        vendors?.forEach((v: string) => vendorSet.add(v));

        if (vendor_group_ids?.length) {
            const groups = await getVendorGroups(vendor_group_ids, program_id);
            groups.forEach((group) => {
                group.vendors.forEach((v) => {
                    vendorSet.add(v);
                    vendorToGroupMap.set(v, group.id);
                });
            });
        }

        record.allVendorIds = Array.from(vendorSet);
    }

    const allVendorIds = [...new Set(vendorRecords.flatMap((r: any) => r.allVendorIds))];

    return { vendorToGroupMap, allVendorIds };
}

async function getVendorGroups(groupIds: string[], program_id: string) {
    const query = `
      SELECT id, vendors
      FROM ${config_db}.vendor_groups
      WHERE id IN (:groupIds)
        AND program_id = :program_id
        AND is_deleted = false
        AND is_enabled = true;
    `;

    return await sequelize.query<ProgramVendor>(query, {
        replacements: { groupIds, program_id },
        type: QueryTypes.SELECT
    });
}

async function getExistingDistributions(jobId: string) {
    const distributions = await JobDistributionModel.findAll({
        where: { job_id: jobId },
        attributes: ["vendor_id"]
    });
    return new Set(distributions.map((d: any) => d.vendor_id));
}

function buildJobDistributions(
    vendorRecords: any[],
    vendorMap: Map<string, any>,
    vendorToGroupMap: Map<string, string>,
    existingDistributions: Set<string>,
    program_id: string,
    job_id: string,
    submission_limit_vendor: number,
    userId: string
) {
    const distributedVendors = new Set();
    const jobDistributions = [];

    for (const record of vendorRecords) {
        const { duration, measure_unit } = record;
        const eligibleVendors = (record.allVendorIds as string[])
            .map((vendorId) => vendorMap.get(vendorId))
            .filter(
                (vendor) =>
                    vendor && !distributedVendors.has(vendor.id) && !existingDistributions.has(vendor.id)
            );

        for (const vendor of eligibleVendors) {
            distributedVendors.add(vendor.id);
            const vendorGroupId = vendorToGroupMap.get(vendor.id) || null;
            const optStatus = vendor?.is_job_auto_opt_in ? "OPT_IN" : null;
            jobDistributions.push({
                program_id,
                job_id,
                distribute_method: "Distribute Tirederly",
                status: duration === 0 ? "distributed" : "scheduled",
                vendor_id: vendor.id,
                vendor_group_id: vendorGroupId,
                submission_limit: submission_limit_vendor,
                opt_status: optStatus,
                distributed_by: userId,
                created_by: userId,
                updated_by: userId,
                opt_status_date: (duration === 0 && optStatus) ? Date.now() : null,
                distribution_date: duration === 0 ? Date.now() : null,
                duration,
                measure_unit,
                created_on: Date.now(),
                updated_on: Date.now()
            });
        }
    }

    return jobDistributions;
}

export async function getVendorDistributionScheduleByIds({
    hierarchy_ids,
    labor_category_id,
    program_id,
}: VendorDistributionParams): Promise<ProgramVendor[]> {
    let query = `
      SELECT id, program_industry, work_locations, hierarchies, vendor_name, is_job_auto_opt_in, tenant_id
      FROM ${config_db}.program_vendors
      WHERE program_id = :program_id
        AND status = 'Active'
    `;

    if (hierarchy_ids.length > 0) {
        const hierarchyFilter = hierarchy_ids
            .map(id => `JSON_CONTAINS(program_vendors.hierarchies, JSON_QUOTE('${id}'), '$')`)
            .join(" OR ");
        query += ` AND ((${hierarchyFilter}) OR program_vendors.all_hierarchy = true)`;
    }

    if (labor_category_id) {
        const laborFilter = `JSON_CONTAINS(program_vendors.program_industry, JSON_QUOTE(:labor_category_id), '$') OR program_vendors.is_labour_category = true`;
        query += ` AND (${laborFilter})`;
    }

    const replacements: any = {
        program_id,
        hierarchy_ids,
        labor_category_id,
    };

    const allProgramVendors = await sequelize?.query(query, {
        replacements,
        type: QueryTypes.SELECT
    });
    console.log("allProgramVendors: ", allProgramVendors);
    return allProgramVendors as ProgramVendor[];
}

export const updateJob = async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ message: 'Unauthorized - Token not found' });
    }
    const token = authHeader.split(' ')[1];
    const user = await decodeToken(token);

    if (!user) {
        return reply.status(401).send({ message: 'Unauthorized - Invalid token' });
    }
    const userId = user?.sub;
    const userType = user?.userType;
    const { program_id, id } = request.params as { program_id: string, id: string };
    const jobData = request.body as {
        id: string;
        hierarchy_ids: any;
        job_template_id: any;
        work_location_id: any;
        labor_category_id: any;
        allow_per_identified_s: boolean;
        candidates?: JobCandidateDataInterface[];
        custom_fields?: JobCustomfieldDataInterface[];
        foundationDataTypes?: JobFoundationDataTypeDataInterface[];
        qualifications?: JobQualificationDataTypeDataInterface[];
        rates?: JobRateTypeDataInterface[];
        module_id?: string;
        status?: string;
        job_manager_id: string;
        userType?: any
        userId?: any
        budgets?: any
        duration?: number
    };

    jobData.userType = userType ?? "";
    jobData.userId = userId;
    jobData.id = id;

    let workflow_job_id = id
    let job = { job_id: id, id: id }
    const traceId = generateCustomUUID();
    const transaction = await sequelize.transaction();
    let result: any = jobData.status;
    let event_slug = "create_job";
    const module_name = "Job";
    const type = "workflow"
    const placement_order = "0"
    let is_updated = false

    const { moduleId, eventId } = await getEventIdFromModule(module_name, event_slug, type);

    const jobDatas = request.body as JobInterface;
    jobDatas.userType = userType ?? ""
    jobDatas.userId = userId
    const weekCount = parseInt(jobData.budgets?.formatted_weeks_days?.match(/(\d+)\s+Weeks?/)?.[1] || "0");
    jobDatas.duration = weekCount
    jobData.duration = weekCount
    const module_id = moduleId ?? "";
    const event_id = eventId ?? "";
    const workflowQuery2 = jobWorkflowQuery(jobDatas.hierarchy_ids);
    const rows: any[] = await sequelize.query(workflowQuery2, {
        replacements: { module_id, event_id, program_id, placement_order },
        type: QueryTypes.SELECT,
    });
    console.log('rows is now:', JSON.stringify(rows))
    try {
        const existingJob = await JobModel.findOne({ where: { program_id, id }, transaction });

        if (!existingJob) {
            return reply.status(404).send({
                status_code: 404,
                message: 'Job not found.',
                trace_id: traceId,
            });
        }
        const oldCandidates = await jobCandidateModel.findAll({ where: { job_id: id, program_id }, transaction }) as any;
        const oldCustomFields = await jobCustomfieldsModel.findAll({ where: { job_id: id, program_id }, transaction }) as any;
        const oldFoundationDataTypes = await jobFoundationDataTypeModel.findAll({ where: { job_id: id, program_id }, transaction }) as any;
        const oldQualifications = await jobQulificationType.findAll({ where: { job_id: id, program_id }, transaction }) as any;
        const oldRates = await jobRateModel.findAll({ where: { job_id: id, program_id }, transaction }) as any;
        const existingData = {
            ...existingJob.dataValues,
            candidates: oldCandidates.map((c: any) => c.dataValues),
            custom_fields: oldCustomFields.map((c: any) => c.dataValues),
            foundationDataTypes: oldFoundationDataTypes.map((c: any) => c.dataValues),
            qualifications: oldQualifications.map((c: any) => c.dataValues),
            rates: oldRates.map((c: any) => c.dataValues),
        };
        const updatedFields = await getUpdatedFields(existingData, jobData);

        const query = ` SELECT * FROM ${config_db}.workflow WHERE program_id = :program_id
            AND workflow_trigger_id = :job_workflow_id LIMIT 1`;

        try {
            const workflowData: any[] = await sequelize.query(query, {
                type: QueryTypes.SELECT,
                replacements: {
                    job_workflow_id: id,
                    program_id,
                },
            });
            console.log('wrkflow data is noowwww', workflowData);
            if (workflowData && workflowData.length > 0) {
                console.log('Here now  continue call to worfkflooowww ')

                if (existingJob.status == "REJECTED") {
                    console.log('Inside the rejected in')
                    const jobs = await workflowTriggering(
                        request,
                        reply,
                        program_id,
                        rows,
                        job,
                        jobData,
                        jobDatas,
                        module_name,
                        is_updated,
                        workflow_job_id,
                        event_slug
                    );
                    const status = await determinetWorkflowStatus({
                        workflow: jobs,
                        jobTemplate: workflowQuery2,
                        jobDatas,
                        request,
                        reply,
                        program_id,
                        module_id,
                        event_id,
                        placement_order,
                        job,
                        jobData,
                        module_name,
                        is_updated,
                        workflow_job_id,
                        event_slug,
                        transaction
                    });
                    result = status
                    console.log('result is now:', result);
                }
            } else if (!result) {
                console.log('Inside the emty status')
                const jobs = await workflowTriggering(
                    request,
                    reply,
                    program_id,
                    rows,
                    job,
                    jobData,
                    jobDatas,
                    module_name,
                    is_updated,
                    workflow_job_id,
                    event_slug
                );
                const status = await determinetWorkflowStatus({
                    workflow: jobs,
                    jobTemplate: workflowQuery2,
                    jobDatas,
                    request,
                    reply,
                    program_id,
                    module_id,
                    event_id,
                    placement_order,
                    job,
                    jobData,
                    module_name,
                    is_updated,
                    workflow_job_id,
                    event_slug,
                    transaction
                });
                result = status
                console.log('result is now:', result);
            }
        } catch (error) {
            console.error("Error while fetching or processing workflow data:", error);
            reply.status(500).send({ error: "Failed to process workflow data." });
        }
        console.log('end status result', result);
        const job_template_id = existingJob.job_template_id
        const jobTemplate = await jobTemplateQuery(job_template_id, program_id);
        if (existingData.allow_per_identified_s === true && jobTemplate?.is_automatic_distribution && jobData.status?.toUpperCase() !== "DRAFT") {
            const candidates = jobData.candidates;
            const jobId = existingJob?.dataValues?.id;
            const programId = program_id;
            const vendor_submission_limit = 1;
            const existingDistributions = await jobRepository.getDistributionData(programId, jobId);
            for (const candidate of candidates ?? []) {
                const candidateId = candidate?.id;
                const jobCandidate = await jobRepository.getJobCandidate(candidateId, jobId, programId);
                const existingVendor = jobCandidate?.vendor;
                const newVendor = candidate?.vendor;
                if (existingVendor && existingVendor !== newVendor) {
                    await jobRepository.updateJobDistributionStatus(programId, jobId, existingVendor);
                    console.log(`Marked distribution for old vendor ${existingVendor} as HOLD for job ${jobId}`);
                }
                const isNewVendorAlreadyDistributed = existingDistributions?.some(
                    (distribution: any) => distribution.vendor_id === newVendor
                );

                if (!isNewVendorAlreadyDistributed) {
                    console.log(`Distributing to vendor ${existingVendor}...`);
                    await distributeJob(candidate, programId, jobId, userId, vendor_submission_limit, "sourcing");
                } else {
                    console.log(`Vendor ${existingVendor} already distributed for job ${jobId}, skipping.`);
                }
            }
        }

        if (jobTemplate && jobData.status?.toUpperCase() != "DRAFT" && jobData.allow_per_identified_s !== true) {
            if (jobTemplate.is_automatic_distribution) {

                if (rows.length !== 0) {
                    console.log("Job distribute after workflow approval");
                } else {
                    distributeAutomatically({ jobTemplate, job: jobData, program_id, userId });
                    jobDistributionNotificationService.distributeAutomaticallyNotification({ user, job: jobData, program_id, traceId, token, sequelize, reply, sendNotification, jobTemplate });
                }
            }
        }

        if (jobTemplate && jobData.status?.toUpperCase() != "DRAFT" && jobData.allow_per_identified_s !== true) {
            if (jobTemplate.is_tiered_distribute_submit) {
                if (rows.length !== 0) {
                    console.log("Job distribute after workflow approval");
                } else {
                    console.log("teired distribution");
                    tieredDistributeSchedule({ jobTemplate, job: jobData, program_id, userId, status });
                }
            }
        }
        const [updatedCount] = await JobModel.update(
            { ...jobData, status: result, updated_on: Date.now(), updated_by: userId },
            { where: { program_id, id }, transaction }
        );
        if (updatedCount > 0) {


            const changes = await comparisonService.compareJobPayload(
                existingJob.toJSON(),
                jobData
            );
            const eventType = existingJob?.status === "DRAFT" ? "Job Created" : "Job Updated";

            try {
                await createJobHistoryRecord(
                    { id, program_id },
                    jobData,
                    userId || "",
                    transaction,
                    eventType,
                    buildStructuredChanges(changes)
                );
            } catch (error) {
                console.error("Error creating job history (comparison):", error);

            }


            if (jobData.candidates) {
                await jobCandidateModel.destroy({ where: { job_id: id, program_id }, transaction });
                await Promise.all(
                    jobData.candidates.map(candidate =>
                        jobCandidateModel.upsert({
                            ...candidate,
                            job_id: id,
                            program_id,
                            updated_by: userId
                        }, { transaction })
                    )
                );
            }
            if (jobData.custom_fields) {
                await jobCustomfieldsModel.destroy({ where: { job_id: id, program_id }, transaction });
                await Promise.all(
                    jobData.custom_fields.map(field =>
                        jobCustomfieldsModel.upsert({ ...field, job_id: id, program_id }, { transaction })
                    )
                );
            }

            if (jobData.foundationDataTypes) {
                await jobFoundationDataTypeModel.destroy({ where: { job_id: id, program_id }, transaction });
                await Promise.all(
                    jobData.foundationDataTypes.map(dataType =>
                        jobFoundationDataTypeModel.upsert({ ...dataType, job_id: id, program_id }, { transaction })
                    )
                );
            }

            if (jobData.qualifications) {
                await jobQulificationType.destroy({ where: { job_id: id, program_id }, transaction });
                await Promise.all(
                    jobData.qualifications.map(qualification =>
                        jobQulificationType.upsert({ ...qualification, job_id: id, program_id }, { transaction })
                    )
                );
            }

            if (jobData.rates) {
                await jobRateModel.destroy({ where: { job_id: id, program_id }, transaction });
                await Promise.all(
                    jobData.rates.map(rate =>
                        jobRateModel.upsert({ ...rate, job_id: id, program_id }, { transaction })
                    )
                );
            }

            await transaction.commit();

            (async () => {
                jobNotificationService.handleEditJobNotification(token, sequelize, program_id, job, user, traceId, NotificationEventCode.JOB_EDITED);
            })()
            const distrubutequery = `
            SELECT *
            FROM job_distributions
            WHERE job_id = :id
            AND program_id = :program_id
            LIMIT 1;
        `;
            const distrubutionData: any[] = await sequelize.query(distrubutequery, {
                type: QueryTypes.SELECT,
                replacements: {
                    id: id,
                    program_id,
                },
            });
            if (distrubutionData && distrubutionData.length > 0) {
                (async () => {

                    jobNotificationService.handleEditJobNotification(token, sequelize, program_id, job, user, traceId, NotificationEventCode.JOB_EDITED);

                })();
            } else {
                console.log("No distribution data found for the given job_id and program_id.");
            }
            reply.send({
                status_code: 200,
                message: 'Job updated successfully.',
                id: id,
                trace_id: traceId,
            });
        } else {
            await transaction.rollback();
            reply.status(404).send({
                status_code: 404,
                message: 'Job not found.',
                trace_id: traceId,
            });
        }
    } catch (error) {
        await transaction.rollback();
        console.error('Error updating job:', error);
        reply.status(500).send({
            status_code: 500,
            message: 'Internal Server Error',
            trace_id: traceId,
            error: (error as Error).message,
        });
    }
};


const transformFoundationDataTypes = (data: any[]) => {
    return (data || [])
        .map(item => ({
            foundation_data_type_id: item.foundation_data_type_id,
            foundation_data_ids: [...(item.foundation_data_ids ?? [])].sort(),
        }))
        .sort((a, b) => a.foundation_data_type_id.localeCompare(b.foundation_data_type_id));
};

const transformQualifications = (data: any[]) => {
    return (data || [])
        .map(item => ({
            qulification_type_id: item.qulification_type_id,
            qulification: [...(item.qulification ?? [])].sort(),
            is_required: item.is_required !== undefined ? item.is_required : false,
        }))
        .sort((a, b) => a.qulification_type_id.localeCompare(b.qulification_type_id));
};

const transformCandidates = (data: any[]) => {
    return (data || [])
        .map(({ middle_name, first_name, last_name, email, phone_number, country, vendor, notes }) => ({
            middle_name,
            first_name,
            last_name,
            email,
            phone_number,
            country,
            vendor,
            notes
        }))
        .sort((a, b) => a.email.localeCompare(b.email));
};
const transformCustomFields = (data: any[]) => {
    return (data || [])
        .map(({ custom_field_id, value }) => ({
            custom_field_id,
            value: typeof value === 'string' ? value.replace(/^"(.*)"$/, '$1') : value
        }))
        .sort((a, b) => a.custom_field_id.localeCompare(b.custom_field_id));
};

interface UpdatedField {
    before: any;
    after: any;
    [key: string]: any;
}

interface UpdatedFields {
    [key: string]: UpdatedField;
}


const isEmptyValue = (value: any): boolean => {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    if (typeof value === 'object' && Object.keys(value).length === 0) return true;
    return false;
};

const deepEqual = (a: any, b: any): boolean => {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object' || a === null || b === null) return a === b;

    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;

    for (const key of aKeys) {
        if (!bKeys.includes(key)) return false;
        if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
};

const handleNestedBudget = (existing: any, current: any) => {
    let hasChange = false;
    const before: any = {};
    const after: any = {};

    const allKeys = new Set([...Object.keys(existing ?? {}), ...Object.keys(current ?? {})]);

    allKeys.forEach((key) => {
        const existingVal = existing?.[key] ?? null;
        const currentVal = current?.[key] ?? null;

        if (typeof currentVal === 'object' && !Array.isArray(currentVal) && currentVal !== null) {
            const nested = handleNestedBudget(existingVal, currentVal);
            if (nested && Object.keys(nested.before).length > 0) {
                before[key] = nested.before;
                after[key] = nested.after;
                hasChange = true;
            }
        } else {
            if (!deepEqual(existingVal, currentVal)) {
                before[key] = existingVal;
                after[key] = currentVal;
                hasChange = true;
            }
        }
    });

    return hasChange ? { before, after } : undefined;
};

const compareArrays = (existingArr: any[], currentArr: any[], parentKey: string) => {
    let arrChanges = false;
    const beforeArr: any[] = [];
    const afterArr: any[] = [];
    const getId = (item: any) => item?.rate_type?.id ?? item?.id ?? null;
    const existingMap = new Map(existingArr.map(item => [getId(item), item]));

    currentArr.forEach(currentItem => {
        const id = getId(currentItem);
        const existingItem = existingMap.get(id);

        if (!existingItem) {
            beforeArr.push(null);
            afterArr.push(currentItem);
            arrChanges = true;
        } else {
            const nestedChange = handleNestedRate(existingItem, currentItem);
            if (nestedChange && Object.keys(nestedChange.before).length > 0) {
                beforeArr.push(nestedChange.before);
                afterArr.push(nestedChange.after);
                arrChanges = true;
            }
            existingMap.delete(id);
        }
    });

    existingMap.forEach((deletedItem) => {
        beforeArr.push(deletedItem);
        afterArr.push(null);
        arrChanges = true;
    });

    if (arrChanges) {
        return { before: beforeArr, after: afterArr };
    }
    return undefined;
};
const handleNestedRate = (existing: any, current: any) => {
    let hasChange = false;
    const before: any = {};
    const after: any = {};

    const allKeys = new Set([...Object.keys(existing ?? {}), ...Object.keys(current ?? {})]);

    allKeys.forEach((key) => {
        const existingVal = existing?.[key] ?? null;
        const currentVal = current?.[key] ?? null;

        if (Array.isArray(currentVal)) {
            const changes = compareArrays(existingVal ?? [], currentVal || [], key);
            if (changes) {
                before[key] = changes.before;
                after[key] = changes.after;
                hasChange = true;
            }
        } else if (typeof currentVal === 'object' && currentVal !== null) {
            const nested = handleNestedRate(existingVal, currentVal);
            if (nested && Object.keys(nested.before).length > 0) {
                before[key] = nested.before;
                after[key] = nested.after;
                hasChange = true;
            }
        } else {
            if (!deepEqual(existingVal, currentVal)) {
                before[key] = existingVal;
                after[key] = currentVal;
                hasChange = true;
            }
        }
    });

    return hasChange ? { before, after } : undefined;
};

const unwrapNumericKeyOrArray = (obj: any) => {
    if (Array.isArray(obj) && obj.length === 1) {
        return obj[0];
    }
    if (typeof obj === 'object' && obj !== null && '0' in obj && Object.keys(obj).length === 1) {
        return obj['0'];
    }
    return obj;
};

const getUpdatedFields = (existingData: any, newData: any): UpdatedFields => {
    const updatedFields: UpdatedFields = {};
    const excludedKeys = new Set([
        'rateType', 'shiftType', 'event_slug', 'budgetvalue',
        'is_expense_allowed', 'ratesToggle', 'updated_on',
        'created_on', 'is_shift_type', 'userId', 'userType', 'net_budget', 'updates'
    ]);

    const keysToCheck = Object.keys(newData);

    keysToCheck.forEach((key) => {
        if (excludedKeys.has(key)) return;

        const newValue = newData[key];
        const existingValue = existingData?.[key];

        const normalizedExisting = existingValue ?? null;
        const normalizedNew = newValue ?? null;

        if (isEmptyValue(normalizedExisting) && isEmptyValue(normalizedNew)) return;
        if (key === 'start_date' || key === 'end_date') {
            if (
                normalizedExisting &&
                normalizedNew &&
                new Date(normalizedExisting).toISOString() !== new Date(normalizedNew).toISOString()
            ) {
                updatedFields[key] = { before: normalizedExisting, after: normalizedNew };
            }
            return;
        }

        if (key === 'foundationDataTypes') {
            const transformedBefore = transformFoundationDataTypes(existingValue ?? []);
            const transformedAfter = transformFoundationDataTypes(newValue ?? []);

            if (!deepEqual(transformedBefore, transformedAfter)) {
                updatedFields[key] = { before: transformedBefore, after: transformedAfter };
            }
        }

        else if (key === 'qualifications') {
            const transformedBefore = transformQualifications(existingValue ?? []);
            const transformedAfter = transformQualifications(newValue ?? []);

            if (!deepEqual(transformedBefore, transformedAfter)) {
                updatedFields[key] = { before: transformedBefore, after: transformedAfter };
            }
        }

        else if (key === 'candidates') {
            const transformedBefore = transformCandidates(existingValue ?? []);
            const transformedAfter = transformCandidates(newValue ?? []);

            if (!deepEqual(transformedBefore, transformedAfter)) {
                updatedFields[key] = { before: transformedBefore, after: transformedAfter };
            }
        }

        else if (key === 'customFields') {
            const transformedBefore = transformCustomFields(existingValue ?? []);
            const transformedAfter = transformCustomFields(newValue ?? []);

            if (!deepEqual(transformedBefore, transformedAfter)) {
                updatedFields[key] = { before: transformedBefore, after: transformedAfter };
            }
        }

        else if (key === 'budgets') {
            const budgetChanges = handleNestedBudget(normalizedExisting, normalizedNew);
            if (budgetChanges) {
                updatedFields[key] = budgetChanges;
            }
        }

        else if (key === 'rate') {
            const cleanedExisting = unwrapNumericKeyOrArray(normalizedExisting);
            const cleanedNew = unwrapNumericKeyOrArray(normalizedNew);

            const rateChanges = handleNestedRate(cleanedExisting, cleanedNew);
            if (rateChanges) {
                updatedFields[key] = rateChanges;
            }
        }

        else if (Array.isArray(normalizedExisting) && Array.isArray(normalizedNew)) {
            const sortedExisting = [...normalizedExisting].sort();
            const sortedNew = [...normalizedNew].sort();

            if (!deepEqual(sortedExisting, sortedNew)) {
                updatedFields[key] = { before: normalizedExisting, after: normalizedNew };
            }
        }

        else {
            if (!deepEqual(normalizedExisting, normalizedNew)) {
                updatedFields[key] = { before: normalizedExisting, after: normalizedNew };
            }
        }
    });

    return updatedFields;
};


export async function sendNotificationsForUserType(request: FastifyRequest,
    reply: FastifyReply, program_id: string, id: string, eventCode: any, payload: any, allPayload: any, updates: any) {
    const traceId = generateCustomUUID();
    try {

        const authHeader = request.headers.authorization;

        if (!authHeader?.startsWith('Bearer ')) {
            return reply.status(401).send({ message: 'Unauthorized - Token not found' });
        }
        const token = authHeader.split(' ')[1];
        const user = await decodeToken(token);

        if (!user) {
            return reply.status(401).send({ message: 'Unauthorized - Invalid token' });
        }
        const userQuery = `
        SELECT id, user_type,email
        FROM ${config_db}.user
        WHERE user_id = :user_id
        AND is_enabled = true
        LIMIT 1
    `;

        const userData: any = await sequelize.query(userQuery, {
            type: QueryTypes.SELECT,
            replacements: { user_id: user.sub },
        });
        let userType = userData[0]
        if (userType?.user_type.toLowerCase() == "msp".toLowerCase() || userType?.user_type.toLowerCase() == "client".toLowerCase() || user.userType.toLowerCase() == "super_user".toLowerCase()) {
            (async () => {
                if (user?.userType) {
                    console.log("Inside super user....")
                    return;
                }
                console.log("outside super user...");
                try {

                    const managerData = await getJobManagerEmail(sequelize, id);


                    const recipientEmailList: EmailRecipient[] = [];
                    if (managerData) recipientEmailList.push(managerData)
                    const emailList = await fetchUsersBasedOnHierarchy(
                        sequelize,
                        allPayload
                    );
                    if (emailList) {
                        recipientEmailList.push(...emailList);
                    }


                    const notificationPayload: NotificationDataPayload = {
                        program_id,
                        traceId,
                        eventCode,
                        recipientEmail: recipientEmailList,
                        payload,
                        token,
                        userId: user?.sub ?? "",
                        roleRecipient: null,
                        entityRefId: rootTenantId,
                        role: userType
                    };

                    await notifyJobManager(sendNotification, notificationPayload, recipientEmailList);
                } catch (notificationError) {
                    console.error("Error in notification logic:", notificationError);
                }
            })();

        }
    } catch (error: any) {

        reply.status(500).send({
            status_code: 500,
            message: 'Internal Server Error.',
            trace_id: traceId,
            error: error.message,
        });
    }
}

export async function getManagerDetails(program_id: any, job_id: any) {
    try {

        const workflowQuery = `
            SELECT id, job_manager_id
            FROM jobs
            WHERE id = :id
            AND is_enabled = true
            LIMIT 1
        `;

        const workflowResult: any = await sequelize.query(workflowQuery, {
            type: QueryTypes.SELECT,
            replacements: { id: job_id },
        });

        if (workflowResult.length === 0) {
            return { status: 'Error', message: 'Workflow not found or disabled' };
        }

        const managerId = workflowResult[0].job_manager_id;


        const userQuery = `
            SELECT id,email,role_id,user_type
            FROM ${config_db}.user
            WHERE user_id = :managerId
            LIMIT 1
        `;

        const userResult = await sequelize.query(userQuery, {
            type: QueryTypes.SELECT,
            replacements: { managerId },
        });

        if (userResult.length === 0) {
            return { status: 'Error', message: 'Manager not found' };
        }

        return { status: 'Success', data: userResult[0] };
    } catch (error) {
        console.error('Error fetching manager details:', error);
        return { status: 'Error', message: 'An error occurred while fetching manager details', error };
    }
}

export async function fetchUserById(user_id: any) {
    const userQuery = `
        SELECT id, first_name, last_name, avatar, role_id,email,user_type
        FROM ${config_db}.user
        WHERE user_id = :user_id
          AND is_enabled = true
        LIMIT 1;
    `;
    try {
        const userResult = await sequelize.query(userQuery, {
            type: QueryTypes.SELECT,
            replacements: { user_id },
        });

        if (userResult.length > 0) {
            return userResult[0];
        } else {
            console.warn(`User with ID ${user_id} not found.`);
            return null;
        }
    } catch (error) {
        console.error(`Error fetching user with ID ${user_id}:`, error);
        throw new Error("Failed to fetch user details.");
    }
}

export async function deleteJob(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const traceId = generateCustomUUID();
    const user = request?.user;
    const userId = user?.sub;
    try {
        const { program_id, id } = request.params as { program_id: string, id: string };
        const jobData = await JobModel.findOne({ where: { program_id, id } });
        if (jobData) {
            await JobModel.update({ is_deleted: true, is_enabled: false }, { where: { program_id, id, updated_by: userId, } });
            reply.status(204).send({
                status_code: 204,
                message: 'job deleted successfully.',
                id: id,
                trace_id: traceId,
            });
        } else {
            reply.status(200).send({
                status_code: 200,
                message: 'job not found.',
                trace_id: traceId,
            });
        }
    } catch (error) {
        reply.status(500).send({
            message: 'An error occurred while deleting job.',
            trace_id: traceId,
            error: error,
        });
    }
}

export async function jobBudgetCalculation(request: FastifyRequest, reply: FastifyReply) {
    const trace_id = generateCustomUUID();

    try {
        const { program_id } = request.params as { program_id: string };

        const validationResult = validateJobRequest(request.body);

        if (!validationResult.isValid) {
            const formattedErrors = validationResult.errors.join(', ');
            return reply.status(400).send({
                trace_id,
                code: 400,
                message: "Validation Error",
                errors: formattedErrors
            });
        }

        const { program_industry, hierarchy, min_rate, max_rate, rate_model, hours_per_day, week_working_days, num_resources, additional_type, additional_value, start_date, end_date, vendor_id, unit_of_measure, rate_type } = request.body as JobValidationInterface;

        const startDate = new Date(start_date);
        const endDate = new Date(end_date);

        const { totalWeeks, remainingDays } = calculateWorkingDaysWithHolidays(startDate, endDate);

        const totalDays = Math.floor((totalWeeks * week_working_days) + remainingDays);
        const daysSuffix = totalWeeks === 1 ? '' : 's';
        const hoursSuffix = totalWeeks === 1 ? '' : 's';
        const totalHours = totalDays * hours_per_day;

        let workingUnits = unit_of_measure?.toLowerCase() === 'daily'
            ? `${totalDays} Day${daysSuffix}`
            : `${totalHours} Hour${hoursSuffix}`;

        const formatted_weeks_days = `${totalWeeks} Week${totalWeeks === 1 ? '' : 's'} ${remainingDays} Day${remainingDays === 1 ? '' : 's'}`;

        const markupDataPromise = GlobalRepository.findVendorMarkups({ program_id, program_industry, hierarchy, rate_model, vendor_id, rate_type });

        const markupData = await markupDataPromise;

        if (!markupData.length) {
            return reply.status(200).send({
                status_code: 200,
                trace_id: generateCustomUUID(),
                markup_aggregate: {},
                message: 'No markups found for vendors.',
            });
        }

        const { sourced_markup_min, sourced_markup_max, payrolled_markup_min, payrolled_markup_max } = markupData[0] as {
            sourced_markup_min: number;
            sourced_markup_max: number;
            payrolled_markup_min: number;
            payrolled_markup_max: number;
        };

        const { avg_markup, min_markup, max_markup } = calculateMarkups(sourced_markup_min, sourced_markup_max, payrolled_markup_min, payrolled_markup_max);
        const average_rate = (min_rate + max_rate) / 2;

        const configData = await GlobalRepository.accuracyConfiguration(program_id, accuracyType.CONFIG_MODEL);
        const minBudget = calculateBudget(min_rate, min_markup, rate_model, hours_per_day, week_working_days, totalWeeks, remainingDays, num_resources, additional_type, additional_value, unit_of_measure, configData);
        const maxBudget = calculateBudget(max_rate, max_markup, rate_model, hours_per_day, week_working_days, totalWeeks, remainingDays, num_resources, additional_type, additional_value, unit_of_measure, configData);
        const avgBudget = calculateBudget(average_rate, avg_markup, rate_model, hours_per_day, week_working_days, totalWeeks, remainingDays, num_resources, additional_type, additional_value, unit_of_measure, configData);

        reply.status(200).send({
            trace_id,
            code: 200,
            message: "success",
            data: {
                formatted_weeks_days,
                working_units: workingUnits,
                min: minBudget,
                max: maxBudget,
                avg: avgBudget
            }
        });
    } catch (error) {
        reply.status(500).send({
            trace_id,
            code: 500,
            message: (error as Error).message
        });
    }
}

export function calculateWorkingDaysWithHolidays(startDate: Date, endDate: Date): { totalWorkingDays: number; totalWeeks: number; remainingDays: number } {
    let totalWorkingDays = 0;
    const week_working_days = 5;

    // Special case: If both dates are the same and fall on a weekend
    if (startDate.getTime() === endDate.getTime() &&
        (startDate.getDay() === 0 || startDate.getDay() === 6)) {
        totalWorkingDays++;
        return { totalWorkingDays, totalWeeks: 0, remainingDays: 1 };
    }

    // Normal calculation for other cases
    for (let currentDate = new Date(startDate); currentDate <= endDate; currentDate.setDate(currentDate.getDate() + 1)) {
        const dayOfWeek = currentDate.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            totalWorkingDays++;
        }
    }

    let totalWeeks = Math.floor(totalWorkingDays / week_working_days);
    let remainingDays = totalWorkingDays % week_working_days;

    if (startDate.getDay() === 0 || startDate.getDay() === 6) {
        remainingDays++;
    }

    if (endDate.getDay() === 0 || endDate.getDay() === 6) {
        remainingDays++;
    }

    if (remainingDays >= week_working_days) {
        totalWeeks++;
        remainingDays = remainingDays % week_working_days;
    }

    return { totalWorkingDays, totalWeeks, remainingDays };
}

function calculateMarkups(sourced_markup_min: number, sourced_markup_max: number, payrolled_markup_min: number, payrolled_markup_max: number) {
    let avg_markup, min_markup, max_markup;

    if (sourced_markup_min !== undefined && sourced_markup_max !== undefined) {
        const sourced_markup_avg = (sourced_markup_min + sourced_markup_max) / 2;
        avg_markup = sourced_markup_avg || 0;
        min_markup = sourced_markup_min || 0;
        max_markup = sourced_markup_max || 0;
    } else {
        const payrolled_markup_avg = (payrolled_markup_min + payrolled_markup_max) / 2;
        avg_markup = payrolled_markup_avg || 0;
        min_markup = payrolled_markup_min || 0;
        max_markup = payrolled_markup_max || 0;
    }

    return { avg_markup, min_markup, max_markup };
}

export function calculateBudget(rate: number, markup: number, rate_model: string, hours_per_day: number, week_working_days: number, total_weeks: number, formattedDays: number, num_resources: number, additional_type: string, additional_value: number, unit_of_measure: any, configData: any) {
    let total_working_hours;

    if (unit_of_measure.toLowerCase() == 'hourly') {
        total_working_hours = (Math.floor(total_weeks * week_working_days) + formattedDays) * hours_per_day;
    } else {
        total_working_hours = (Math.floor(total_weeks * week_working_days) + formattedDays);
    }

    let pay_rate;
    let vendor_markup;
    let bill_rate = rate;

    if (rate_model === "pay_rate") {
        vendor_markup = Number(markup);
        bill_rate = (rate * (1 + markup / 100));
        pay_rate = rate;
    }

    if (rate_model === "markup") {
        vendor_markup = Number(markup);
    }

    const ratex = bill_rate * total_working_hours;

    let additionalAmount: number;
    if (additional_type === 'percentage') {
        additionalAmount = (ratex * additional_value) / 100;
    } else {
        additionalAmount = additional_value;
    }

    additionalAmount = Number(additionalAmount) || 0;


    let singleInitialBudget = ratex + additionalAmount;
    if (singleInitialBudget === undefined) {
        throw new Error("Invalid unit_of_measure provided. Budget calculation could not be completed.");
    }

    const netBudget = singleInitialBudget * num_resources;

    return {
        bill_rate: Number(bill_rate).toFixed(8),
        pay_rate: Number(pay_rate)?.toFixed(8),
        markup: Number(vendor_markup)?.toFixed(8),
        additional_amount: Number(additionalAmount).toFixed(8),
        single_net_budget: Number(singleInitialBudget).toFixed(8),
        net_budget: Number(netBudget).toFixed(8)
    };
}

function adjustRateWithMarkup(rate: number, markup: number): number {
    const numericRate = Number(rate);
    const numericMarkup = Number(markup);
    return numericRate + (numericRate * numericMarkup) / 100;;
}

function adjustRateCPRWithMarkup(rate: number, markup: number): number {
    return (rate * 100) / (100 + markup);
}

function adjustRateWithFeeForPayRate(rate: number, fee: number, feeType: string): number {
    if (feeType === 'percentage') {
        return rate - (rate * fee) / 100;
    } else {
        return rate - fee;
    }
}

function adjustRateWithFeeForBillRate(rate: number, fee: number, feeType: string): number {
    if (feeType === 'percentage') {
        return rate + (rate * fee) / 100;
    } else {
        return rate + fee;
    }
}

function adjustRateWithFee(rate: number, fee: number): number {
    return (rate * 100) / (100 + fee);
}

function applyDifferential(rate: number, differential: string, differentialType: string): number {
    const differentialValue = parseFloat(differential);
    if (isNaN(differentialValue)) {
        throw new Error("Differential value is not a valid number.");
    }

    if (differentialType === "Factor Differential") {
        return rate * differentialValue;
    } else {
        return rate + differentialValue;
    }
}

function adjustRatesForPayRate(rateDetails: any, rate_model: string, minRate: number, maxRate: number, min_markup: number, max_markup: number, msp_fee: number, feeType: string, STminRate: number, STmaxRate: number, ot_exempt: boolean) {
    const isBaseRate = rateDetails.rate_type.is_base_rate;
    const rateTypeCategory = rateDetails.rate_type.rate_type_category?.value;
    let clientBillRateMin, clientBillRateMax, vendorBillRateMin, vendorBillRateMax, candidateBillRateMin, candidateBillRateMax;
    if (isBaseRate === true) {
        clientBillRateMin = adjustRateWithMarkup(STminRate, min_markup);
        clientBillRateMax = adjustRateWithMarkup(STmaxRate, max_markup);
        vendorBillRateMin = adjustRateWithFeeForPayRate(clientBillRateMin, msp_fee, feeType);
        vendorBillRateMax = adjustRateWithFeeForPayRate(clientBillRateMax, msp_fee, feeType);
        return { minRate, maxRate, vendorBillRateMin, vendorBillRateMax };
    } else {
        let differentialValue = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_value : rateDetails.bill_rate[0].differential_value;
        let differentialType = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_type : rateDetails.bill_rate[0].differential_type;
        minRate = applyDifferentials(STminRate, differentialValue, differentialType, rateTypeCategory, ot_exempt);
        maxRate = applyDifferentials(STmaxRate, differentialValue, differentialType, rateTypeCategory, ot_exempt);
        clientBillRateMin = adjustRateWithMarkup(minRate, min_markup);
        clientBillRateMax = adjustRateWithMarkup(maxRate, max_markup);
        vendorBillRateMin = adjustRateWithFeeForPayRate(clientBillRateMin, msp_fee, feeType);
        vendorBillRateMax = adjustRateWithFeeForPayRate(clientBillRateMax, msp_fee, feeType);
        return { minRate, maxRate, vendorBillRateMin, vendorBillRateMax };
    }
}

function calculateRatesForPayRate(rateDetails: any, rate_model: string, minRate: number, maxRate: number, min_markup: number, max_markup: number, STminRate: number, STmaxRate: number, ot_exempt: boolean) {
    const isBaseRate = rateDetails.rate_type.is_base_rate;
    const rateTypeCategory = rateDetails.rate_type.rate_type_category?.value;
    let clientBillRateMin, clientBillRateMax, candidateBillRateMin, candidateBillRateMax;
    if (isBaseRate === true) {
        clientBillRateMin = adjustRateWithMarkup(Number(minRate), min_markup);
        clientBillRateMax = adjustRateWithMarkup(Number(maxRate), max_markup);
        return { minRate, maxRate, clientBillRateMin, clientBillRateMax };
    } else {
        let differentialValue = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_value : rateDetails.bill_rate[0].differential_value;
        let differentialType = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_type : rateDetails.bill_rate[0].differential_type;
        candidateBillRateMin = applyDifferentials(STminRate, differentialValue, differentialType, rateTypeCategory, ot_exempt);
        candidateBillRateMax = applyDifferentials(STmaxRate, differentialValue, differentialType, rateTypeCategory, ot_exempt);
        clientBillRateMin = adjustRateWithMarkup(candidateBillRateMin, min_markup);
        clientBillRateMax = adjustRateWithMarkup(candidateBillRateMax, max_markup);
        return { minRate, maxRate, candidateBillRateMin, candidateBillRateMax, clientBillRateMin, clientBillRateMax };
    }
}

function applyDifferentials(rate: number, differential: string, differentialType: string, rateTypeCategory: string, ot_exempt: boolean): number {
    const differentials = parseFloat(differential);
    let differentialValue
    if (ot_exempt && rateTypeCategory === "other") {
        differentialValue = differentials;
    } else if (ot_exempt && rateTypeCategory === "shift") {
        differentialValue = differentials;
    } else if (differentialType === "Factor Differential") {
        differentialValue = ot_exempt ? 1 : differentials;
    } else {
        differentialValue = ot_exempt ? 0 : differentials;
    }

    if (isNaN(differentialValue)) {
        throw new Error("Differential value is not a valid number.");
    }

    if (differentialType === "Factor Differential") {
        return rate * differentialValue;
    } else {
        return Number(rate) + Number(differentialValue);
    }
}

function calculateRatesBillRate(rateDetails: any, rate_model: string, minRate: number, maxRate: number, STminRate: number, STmaxRate: number, ot_exempt: boolean) {
    let clientBillRateMin, clientBillRateMax;
    const rateTypeCategory = rateDetails.rate_type.rate_type_category?.value;
    const isBaseRate = rateDetails.rate_type.is_base_rate;
    if (isBaseRate === true) {
        clientBillRateMin = minRate;
        clientBillRateMax = maxRate;
    } else {
        let differentialValue = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_value : rateDetails.bill_rate[0].differential_value;
        let differentialType = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_type : rateDetails.bill_rate[0].differential_type;
        clientBillRateMin = applyDifferentials(STminRate, differentialValue, differentialType, rateTypeCategory, ot_exempt);
        clientBillRateMax = applyDifferentials(STmaxRate, differentialValue, differentialType, rateTypeCategory, ot_exempt);
    }
    return { minRate, maxRate, clientBillRateMin, clientBillRateMax };
}

function adjustRatesBillRate(rateDetails: any, rate_model: string, minRate: number, maxRate: number, min_markup: number, max_markup: number, msp_fee: number, feeType: string, STminRate: number, STmaxRate: number, ot_exempt: boolean) {
    const isBaseRate = rateDetails.rate_type.is_base_rate;
    const rateTypeCategory = rateDetails.rate_type.rate_type_category?.value;
    let clientBillRateMin, clientBillRateMax, vendorBillRateMin, vendorBillRateMax;
    if (isBaseRate === true) {
        clientBillRateMin = STminRate;
        clientBillRateMax = STmaxRate;
        minRate = adjustRateCPRWithMarkup(clientBillRateMin, min_markup);
        maxRate = adjustRateCPRWithMarkup(clientBillRateMax, max_markup);
        vendorBillRateMin = adjustRateWithFeeForPayRate(clientBillRateMin, msp_fee, feeType);
        vendorBillRateMax = adjustRateWithFeeForPayRate(clientBillRateMax, msp_fee, feeType);
        return { minRate, maxRate, vendorBillRateMin, vendorBillRateMax };
    } else {
        let differentialValue = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_value : rateDetails.bill_rate[0].differential_value;
        let differentialType = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_type : rateDetails.bill_rate[0].differential_type;
        minRate = applyDifferentials(STminRate, differentialValue, differentialType, rateTypeCategory, ot_exempt);
        maxRate = applyDifferentials(STmaxRate, differentialValue, differentialType, rateTypeCategory, ot_exempt);
        clientBillRateMin = adjustRateWithMarkup(minRate, min_markup);
        clientBillRateMax = adjustRateWithMarkup(maxRate, max_markup);
        vendorBillRateMin = adjustRateWithFeeForPayRate(clientBillRateMin, msp_fee, feeType);
        vendorBillRateMax = adjustRateWithFeeForPayRate(clientBillRateMax, msp_fee, feeType);
        return { minRate, maxRate, vendorBillRateMin, vendorBillRateMax };
    }
}

function clientAdjustRatesForPayRate(rateDetails: any, rate_model: string, minRate: number, maxRate: number, min_markup: number, max_markup: number, msp_fee: number, feeType: string, STminRate: number, STmaxRate: number, ot_exempt: boolean) {
    const isBaseRate = rateDetails.rate_type.is_base_rate;
    const rateTypeCategory = rateDetails.rate_type.rate_type_category?.value;
    let vendorBillRateMin, vendorBillRateMax;
    if (isBaseRate === true) {
        vendorBillRateMin = adjustRateWithMarkup(minRate, min_markup);
        vendorBillRateMax = adjustRateWithMarkup(maxRate, max_markup);
    } else {
        let differentialValue = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_value : rateDetails.bill_rate[0].differential_value;
        let differentialType = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_type : rateDetails.bill_rate[0].differential_type;
        minRate = applyDifferentials(STminRate, differentialValue, differentialType, rateTypeCategory, ot_exempt);
        maxRate = applyDifferentials(STmaxRate, differentialValue, differentialType, rateTypeCategory, ot_exempt);
        vendorBillRateMin = adjustRateWithMarkup(minRate, min_markup);
        vendorBillRateMax = adjustRateWithMarkup(maxRate, max_markup);
    }
    return { minRate, maxRate, vendorBillRateMin, vendorBillRateMax, min_markup, max_markup };
}

function clientAdjustRatesForBillRate(rateDetails: any, rate_model: string, minRate: number, maxRate: number, min_markup: number, max_markup: number, msp_fee: number, feeType: string, STminRate: number, STmaxRate: number, ot_exempt: boolean) {
    const isBaseRate = rateDetails.rate_type.is_base_rate;
    const rateTypeCategory = rateDetails.rate_type.rate_type_category?.value;
    let clientBillRateMin, clientBillRateMax, vendorBillRateMin, vendorBillRateMax;
    if (isBaseRate === true) {
        clientBillRateMin = STminRate;
        clientBillRateMax = STmaxRate;
        minRate = adjustRateCPRWithMarkup(clientBillRateMin, min_markup);
        maxRate = adjustRateCPRWithMarkup(clientBillRateMax, max_markup);
        vendorBillRateMin = adjustRateWithFee(clientBillRateMin, msp_fee);
        vendorBillRateMax = adjustRateWithFee(clientBillRateMin, msp_fee);
        return { minRate, maxRate, vendorBillRateMin, vendorBillRateMax };
    } else {
        let differentialValue = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_value : rateDetails.bill_rate[0].differential_value;
        let differentialType = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_type : rateDetails.bill_rate[0].differential_type;
        minRate = applyDifferentials(STminRate, differentialValue, differentialType, rateTypeCategory, ot_exempt);
        maxRate = applyDifferentials(STmaxRate, differentialValue, differentialType, rateTypeCategory, ot_exempt);
        clientBillRateMin = adjustRateWithMarkup(minRate, min_markup);
        clientBillRateMax = adjustRateWithMarkup(maxRate, max_markup);
        vendorBillRateMin = adjustRateWithFee(clientBillRateMin, msp_fee);
        vendorBillRateMax = adjustRateWithFee(clientBillRateMax, msp_fee);
        return { minRate, maxRate, vendorBillRateMin, vendorBillRateMax };
    }
}

function hybridAdjustRatesPayRate(minRate: number, maxRate: number, min_markup: number, max_markup: number, vmsFee: number, mspPartnerFee: number, feeType: string) {
    let clientBillRateMin, clientBillRateMax, vendorBillRateMin, vendorBillRateMax;
    const minVBRx = minRate + ((minRate * min_markup) / 100);
    const maxVBRx = maxRate + ((maxRate * max_markup) / 100);
    if (feeType === 'percentage') {
        vendorBillRateMin = minVBRx - ((minVBRx * vmsFee) / 100);
        vendorBillRateMax = maxVBRx - ((maxVBRx * vmsFee) / 100);
        clientBillRateMin = minVBRx + ((minVBRx * mspPartnerFee) / 100);
        clientBillRateMax = maxVBRx + ((maxVBRx * mspPartnerFee) / 100);
    } else {
        vendorBillRateMin = minVBRx - vmsFee;
        vendorBillRateMax = maxVBRx - vmsFee;
        clientBillRateMin = minVBRx + mspPartnerFee;
        clientBillRateMax = maxVBRx + mspPartnerFee;
    }
    return { minRate, maxRate, clientBillRateMin, clientBillRateMax, vendorBillRateMin, vendorBillRateMax };
}

function hybridAdjustRatesForBillRate(minRate: number, maxRate: number, min_markup: number, max_markup: number, vmsFee: number, mspPartnerFee: number, feeType: string) {
    let clientBillRateMin, clientBillRateMax, vendorBillRateMin, vendorBillRateMax;
    const minVBRx = minRate + ((minRate * min_markup) / 100);
    const maxVBRx = maxRate + ((maxRate * max_markup) / 100);
    if (feeType === 'percentage') {
        vendorBillRateMin = minVBRx - ((minVBRx * vmsFee) / 100);
        vendorBillRateMax = maxVBRx - ((maxVBRx * vmsFee) / 100);
        clientBillRateMin = minVBRx + ((minVBRx * mspPartnerFee) / 100);
        clientBillRateMax = maxVBRx + ((maxVBRx * mspPartnerFee) / 100);
    } else {
        vendorBillRateMin = minVBRx - vmsFee;
        vendorBillRateMax = maxVBRx - vmsFee;
        clientBillRateMin = minVBRx + mspPartnerFee;
        clientBillRateMax = maxVBRx + mspPartnerFee;
    }
    return { minRate, maxRate, clientBillRateMin, clientBillRateMax, vendorBillRateMin, vendorBillRateMax };
}

function calculateRateWithFee(rate: number, fee: number, feeType: string): number {
    return feeType === 'percentage' ? rate + (rate * fee) / 100 : rate + fee;
}

function clientBillRateWithNoMarkupForBillRate(rate: number, fee: number, feeType: string): number {
    return feeType === 'percentage' ? (rate * 100) / (100 + fee) : rate - fee;
}

function clientBillRateNoMarkup(rateDetails: any, rate_model: string, minRate: number, maxRate: number, msp_fee: number, mspFeeType: string, ot_exempt: boolean) {
    let clientBillRateMin, clientBillRateMax, vendorBillRateMin, vendorBillRateMax;
    const isBaseRate = rateDetails.rate_type.is_base_rate;
    if (isBaseRate === true) {
        clientBillRateMin ??= calculateRateWithFee(minRate, msp_fee, mspFeeType);
        clientBillRateMax ??= calculateRateWithFee(maxRate, msp_fee, mspFeeType);
        vendorBillRateMin ??= clientBillRateWithNoMarkupForBillRate(minRate, msp_fee, mspFeeType);
        vendorBillRateMax ??= clientBillRateWithNoMarkupForBillRate(maxRate, msp_fee, mspFeeType);
    } else {
        let differentialValue = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_value : rateDetails.bill_rate[0].differential_value;
        let differentialType = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_type : rateDetails.bill_rate[0].differential_type;
        clientBillRateMin ??= applyDifferential(minRate, differentialValue, differentialType);
        clientBillRateMax ??= applyDifferential(maxRate, differentialValue, differentialType);
        vendorBillRateMin ??= applyDifferential(minRate, differentialValue, differentialType);
        vendorBillRateMax ??= applyDifferential(maxRate, differentialValue, differentialType);
    }
    return { minRate, maxRate, vendorBillRateMin, vendorBillRateMax };
}

function vendorBillRateWithFee(rate: number, fee: number, feeType: string): number {
    if (feeType === 'percentage') {
        return rate - (rate * fee) / 100;
    } else {
        return rate - fee;
    }
}

function vendorBillRateNoMarkup(rateDetails: any, rate_model: string, minRate: number, maxRate: number, STvendorBillRateMin: number, STvendorBillRateMax: number, msp_fee: number, mspFeeType: string, ot_exempt: boolean) {
    let clientBillRateMin, clientBillRateMax, vendorBillRateMin, vendorBillRateMax;
    const rateTypeCategory = rateDetails.rate_type.rate_type_category?.value;
    const baseRate = rateDetails.rate_type.is_base_rate;
    if (baseRate === true) {
        vendorBillRateMin = vendorBillRateWithFee(minRate, msp_fee, mspFeeType);
        vendorBillRateMax = vendorBillRateWithFee(maxRate, msp_fee, mspFeeType);
    } else {
        let differentialValue = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_value : rateDetails.bill_rate[0].differential_value;
        let differentialType = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_type : rateDetails.bill_rate[0].differential_type;
        vendorBillRateMin = applyDifferentials(STvendorBillRateMin, differentialValue, differentialType, rateTypeCategory, ot_exempt);
        vendorBillRateMax = applyDifferentials(STvendorBillRateMax, differentialValue, differentialType, rateTypeCategory, ot_exempt);
    }
    return { minRate, maxRate, clientBillRateMin, clientBillRateMax, vendorBillRateMin, vendorBillRateMax };
}

function calculateRatesBasedOnFundingModel(params: FundingModelParams) {
    let { rateDetails, fundingModel, rate_model, minRate, maxRate, STvendorBillRateMin, STvendorBillRateMax, min_markup, max_markup, msp_fee, feeType, vmsFee, mspPartnerFee, STminRate, STmaxRate, ot_exempt } = params;
    let clientBillRateMin, clientBillRateMax, vendorBillRateMin, vendorBillRateMax;

    if (fundingModel == 'VENDOR') {
        if (rate_model === "pay_rate") {
            ({ minRate, maxRate, vendorBillRateMin, vendorBillRateMax } = adjustRatesForPayRate(rateDetails, rate_model, minRate, maxRate, min_markup, max_markup, msp_fee, feeType, STminRate, STmaxRate, ot_exempt));
        } else if (rate_model === "markup") {
            ({ minRate, maxRate, vendorBillRateMin, vendorBillRateMax } = adjustRatesBillRate(rateDetails, rate_model, minRate, maxRate, min_markup, max_markup, msp_fee, feeType, STminRate, STmaxRate, ot_exempt));
        } else {
            ({ minRate, maxRate, vendorBillRateMin, vendorBillRateMax } = vendorBillRateNoMarkup(rateDetails, rate_model, minRate, maxRate, STvendorBillRateMin, STvendorBillRateMax, msp_fee, feeType, ot_exempt));
        }
    } else if (fundingModel == 'CLIENT') {
        if (rate_model === "pay_rate") {
            ({ minRate, maxRate, vendorBillRateMin, vendorBillRateMax } = clientAdjustRatesForPayRate(rateDetails, rate_model, minRate, maxRate, min_markup, max_markup, msp_fee, feeType, STminRate, STmaxRate, ot_exempt));
        } else if (rate_model === "markup") {
            ({ minRate, maxRate, vendorBillRateMin, vendorBillRateMax } = clientAdjustRatesForBillRate(rateDetails, rate_model, minRate, maxRate, min_markup, max_markup, msp_fee, feeType, STminRate, STmaxRate, ot_exempt));
        } else {
            ({ minRate, maxRate, vendorBillRateMin, vendorBillRateMax } = clientBillRateNoMarkup(rateDetails, rate_model, minRate, maxRate, msp_fee, feeType, ot_exempt));
        }
    } else {
        if (rate_model === "pay_rate") {
            ({ minRate, maxRate, clientBillRateMin, clientBillRateMax, vendorBillRateMin, vendorBillRateMax } = hybridAdjustRatesPayRate(minRate, maxRate, min_markup, max_markup, vmsFee, mspPartnerFee, feeType));
        } else if (rate_model === "markup") {
            ({ minRate, maxRate, clientBillRateMin, clientBillRateMax, vendorBillRateMin, vendorBillRateMax } = hybridAdjustRatesForBillRate(minRate, maxRate, min_markup, max_markup, vmsFee, mspPartnerFee, feeType));
        } else {
            ({ minRate, maxRate, vendorBillRateMin, vendorBillRateMax } = clientBillRateNoMarkup(rateDetails, rate_model, minRate, maxRate, msp_fee, feeType, ot_exempt));
        }
    }

    return { minRate, maxRate, clientBillRateMin, clientBillRateMax, vendorBillRateMin, vendorBillRateMax };
}

function calculateRatesWithoutFundingModel(params: JobRateDataInterface) {
    let { rateDetails, rate_model, minRate, maxRate, min_markup, max_markup, STminRate, STmaxRate, ot_exempt } = params;
    let clientBillRateMin, clientBillRateMax, candidateBillRateMin, candidateBillRateMax;
    if (rate_model === "pay_rate") {
        ({ minRate, maxRate, candidateBillRateMin, candidateBillRateMax, clientBillRateMin, clientBillRateMax } = calculateRatesForPayRate(rateDetails, rate_model, minRate, maxRate, min_markup, max_markup, STminRate, STmaxRate, ot_exempt));
    } else {
        ({ minRate, maxRate, clientBillRateMin, clientBillRateMax } = calculateRatesBillRate(rateDetails, rate_model, minRate, maxRate, STminRate, STmaxRate, ot_exempt));
    }
    return { minRate, maxRate, candidateBillRateMin, candidateBillRateMax, clientBillRateMin, clientBillRateMax };
}

export async function financialDetailsCalculation(request: FastifyRequest, reply: FastifyReply) {
    const trace_id = generateCustomUUID();

    try {
        const user = request?.user;
        const userId = user?.sub;

        if (!userId) {
            return reply.status(401).send({
                status_code: 401,
                message: 'User ID not found',
                trace_id
            });
        }

        const { program_id } = request.params as { program_id: string };
        const { labor_category_id, work_location_id, rate_model, rate, ot_exempt, job_type, job_template_id, vendor_id } = request.body as JobInterface;
        const program_industry = labor_category_id;
        const work_locations = work_location_id;

        let program_vendor_id = null;
        if (user?.userType !== 'super_user') {
            const userData = await GlobalRepository.findProgramVendorUser(program_id, userId);
            if (!userData.length) {
                return sendErrorResponse(reply, trace_id, 400, 'user data not found.');
            }
            program_vendor_id = (userData[0] as { program_vendor_id: string })?.program_vendor_id;
        }

        if (vendor_id) {
            if (!program_vendor_id) {
                return sendErrorResponse(reply, trace_id, 400, 'vendor not found.');
            }
            const response = await Promise.all((rate as unknown as any[]).map(async (rateItem: any) => {
                const hierarchyIds = Array.isArray(rateItem.hierarchies)
                    ? rateItem.hierarchies.map((h: any) => h.id ?? h)
                    : rateItem.hierarchies;

                const feesConfig = await GlobalRepository.findFeesConfig(program_id, program_industry, hierarchyIds, program_vendor_id);

                if (!feesConfig.length) {
                    return sendErrorResponse(reply, trace_id, 400, 'No fee configuration found.');
                }

                const feesConfigData = feesConfig[0] as FeeConfig;
                const { funding_model, categorical_fees } = feesConfigData;
                const feeType = categorical_fees[0]?.fee_type?.toLowerCase();
                const mspPartnerFee = getFeeAmount(categorical_fees, 'MSP_PARTNER');
                const vmsFee = getFeeAmount(categorical_fees, 'VMS');
                const msp_fee = mspPartnerFee + vmsFee;
                const fundingModel = funding_model.toUpperCase();

                const financialDetails = await Promise.all(
                    rateItem.rate_configuration.map(async (config: any) => {
                        const standardRateConfig = config.base_rate.rate_type;

                        const calculateBaseRates = async () => {
                            const rateDetails = config.base_rate;
                            const rateType = rateDetails.rate_type.id;

                            const markupData = await getVendorMarkups({ program_id, program_industry, hierarchyIds, rate_model, program_vendor_id, work_locations, job_type, job_template_id, rateType });

                            if (shouldValidateMarkups(rate_model, markupData[0] as MarkupDataInterface)) {
                                return sendErrorResponse(reply, trace_id, 400, 'No markups found for vendors.');
                            }

                            const markupDataItem = markupData[0] as MarkupDataInterface;
                            const { min_markup, max_markup } = calculateMarkups(
                                markupDataItem.sourced_markup_min,
                                markupDataItem.sourced_markup_max,
                                markupDataItem.payrolled_markup_min,
                                markupDataItem.payrolled_markup_max
                            );

                            let minRate = standardRateConfig.min_rate.amount;
                            let maxRate = standardRateConfig.max_rate.amount;
                            let vendorBillRateMin, vendorBillRateMax;
                            const STvendorBillRateMin = 0;
                            const STvendorBillRateMax = 0;
                            const STminRate = minRate;
                            const STmaxRate = maxRate;

                            const rateResults = calculateRatesBasedOnFundingModel({ rateDetails, fundingModel, rate_model, minRate, maxRate, min_markup, STvendorBillRateMin, STvendorBillRateMax, max_markup, msp_fee, feeType, vmsFee, mspPartnerFee, STminRate, STmaxRate, ot_exempt });

                            minRate = rateResults.minRate;
                            maxRate = rateResults.maxRate;
                            vendorBillRateMin = rateResults.vendorBillRateMin;
                            vendorBillRateMax = rateResults.vendorBillRateMax;

                            if (rate_model !== "bill_rate") {
                                return {
                                    rate_type: rateDetails.rate_type,
                                    bill_rate: rateDetails.bill_rate,
                                    pay_rate: rateDetails.pay_rate,
                                    candidatePayRate: {
                                        min_rate: Number(minRate).toFixed(8),
                                        max_rate: Number(maxRate).toFixed(8)
                                    },
                                    vendorBillRate: {
                                        min_rate: Number(vendorBillRateMin).toFixed(8),
                                        max_rate: Number(vendorBillRateMax).toFixed(8)
                                    },
                                    markup: Number(max_markup).toFixed(8)
                                };
                            } else {
                                return {
                                    rate_type: rateDetails.rate_type,
                                    bill_rate: rateDetails.bill_rate,
                                    pay_rate: rateDetails.pay_rate,
                                    vendorBillRate: {
                                        min_rate: Number(vendorBillRateMin).toFixed(8),
                                        max_rate: Number(vendorBillRateMax).toFixed(8)
                                    },
                                    markup: Number(max_markup).toFixed(8)
                                };
                            }
                        };

                        const processRateDetails = async (rateDetails: any, baseRateCalc: any) => {
                            let minRate = rate_model === "pay_rate"
                                ? rateDetails.pay_rate[0].min_rate
                                : rateDetails.bill_rate[0].min_rate;

                            let maxRate = rate_model === "pay_rate"
                                ? rateDetails.pay_rate[0].max_rate
                                : rateDetails.bill_rate[0].max_rate;

                            let vendorBillRateMin, vendorBillRateMax;
                            const STvendorBillRateMin = baseRateCalc?.vendorBillRate?.min_rate;
                            const STvendorBillRateMax = baseRateCalc?.vendorBillRate?.max_rate;
                            const STminRate = baseRateCalc.candidatePayRate?.min_rate;
                            const STmaxRate = baseRateCalc.candidatePayRate?.max_rate;

                            const rateType = rateDetails?.rate_type?.id;

                            const markupData = await getVendorMarkups({ program_id, program_industry, hierarchyIds, rate_model, program_vendor_id, work_locations, job_type, job_template_id, rateType });

                            const markupDataItem = markupData[0] as MarkupDataInterface;
                            let { min_markup, max_markup } = calculateMarkups(
                                markupDataItem.sourced_markup_min,
                                markupDataItem.sourced_markup_max,
                                markupDataItem.payrolled_markup_min,
                                markupDataItem.payrolled_markup_max
                            );

                            min_markup = min_markup || Number((await calculateBaseRates()).markup);
                            max_markup = max_markup || Number((await calculateBaseRates()).markup);

                            const rateResults = calculateRatesBasedOnFundingModel({ rateDetails, fundingModel, rate_model, minRate, maxRate, min_markup, STvendorBillRateMin, STvendorBillRateMax, max_markup, msp_fee, feeType, vmsFee, mspPartnerFee, STminRate, STmaxRate, ot_exempt });

                            minRate = rateResults.minRate;
                            maxRate = rateResults.maxRate;
                            vendorBillRateMin = rateResults.vendorBillRateMin;
                            vendorBillRateMax = rateResults.vendorBillRateMax;

                            if (rate_model === "bill_rate") {
                                return {
                                    ...rateDetails,
                                    vendorBillRate: {
                                        min_rate: Number(vendorBillRateMin).toFixed(8),
                                        max_rate: Number(vendorBillRateMax).toFixed(8)
                                    }
                                };
                            } else {
                                return {
                                    ...rateDetails,
                                    candidatePayRate: {
                                        min_rate: Number(minRate).toFixed(8),
                                        max_rate: Number(maxRate).toFixed(8)
                                    },
                                    vendorBillRate: {
                                        min_rate: Number(vendorBillRateMin).toFixed(8),
                                        max_rate: Number(vendorBillRateMax).toFixed(8)
                                    },
                                    markup: Number(max_markup).toFixed(8)
                                };
                            }
                        };

                        const baseRateCalc = await calculateBaseRates();
                        if (!baseRateCalc) return null;

                        const rateCalculations = await Promise.all(
                            config.base_rate.rates.map(async (rateDetails: any) => {
                                return processRateDetails(rateDetails, baseRateCalc);
                            })
                        );

                        const configRates = await Promise.all(
                            config.rate.map(async (rateDetails: any) => {
                                const processedRate = await processRateDetails(rateDetails, baseRateCalc);
                                if (!processedRate) return null;
                                const ratesCalculations = await Promise.all(
                                    rateDetails.rates.map(async (rateDetails: any) => {
                                        return processRateDetails(rateDetails, processedRate);
                                    })
                                );

                                return {
                                    ...processedRate,
                                    rates: ratesCalculations
                                };
                            })
                        );

                        const validConfigRates = configRates.filter(rate => rate !== null);

                        return {
                            base_rate: {
                                rate_type: standardRateConfig,
                                pay_rate: config.base_rate.pay_rate,
                                bill_rate: config.base_rate.bill_rate,
                                vendorBillRate: {
                                    min_rate: baseRateCalc?.vendorBillRate?.min_rate,
                                    max_rate: baseRateCalc?.vendorBillRate?.max_rate,
                                },
                                markup: baseRateCalc?.markup,
                                ...(rate_model !== "bill_rate" && {
                                    candidatePayRate: {
                                        min_rate: baseRateCalc?.candidatePayRate?.min_rate,
                                        max_rate: baseRateCalc?.candidatePayRate?.max_rate
                                    }
                                }),
                                rates: rateCalculations,
                            },
                            rate: validConfigRates,
                        };
                    })
                );

                return {
                    hierarchies: rateItem.hierarchies,
                    financial_details: financialDetails.filter(detail => detail !== null),
                };
            }));
            return response;
        } else {
            const response = await Promise.all((rate as unknown as any[]).map(async (rateItem: any) => {
                const hierarchyIds = Array.isArray(rateItem.hierarchies)
                    ? rateItem.hierarchies.map((h: any) => h.id || h)
                    : rateItem.hierarchies;

                const financialDetails = await Promise.all(rateItem.rate_configuration.map(async (config: any) => {
                    const standardRateConfig = config.base_rate.rate_type;

                    const calculateBaseRates = async () => {
                        const rateDetails = config.base_rate;
                        const rateType = rateDetails?.rate_type?.id;

                        const markupData = await getVendorMarkups({ program_id, program_industry, hierarchyIds, rate_model, work_locations, job_type, job_template_id, rateType });

                        if (shouldValidateMarkups(rate_model, markupData[0] as MarkupDataInterface)) {
                            return sendErrorResponse(reply, trace_id, 400, 'No markups found for vendors.');
                        }

                        const markupDataItem = markupData[0] as MarkupDataInterface;
                        let { min_markup, max_markup } = calculateMarkups(
                            markupDataItem.sourced_markup_min,
                            markupDataItem.sourced_markup_max,
                            markupDataItem.payrolled_markup_min,
                            markupDataItem.payrolled_markup_max
                        );

                        let minRate = standardRateConfig.min_rate.amount;
                        let maxRate = standardRateConfig.max_rate.amount;
                        let clientBillRateMin, clientBillRateMax;
                        const STminRate = minRate;
                        const STmaxRate = maxRate;


                        const rateResults = calculateRatesWithoutFundingModel({ rateDetails, rate_model, minRate, maxRate, min_markup, max_markup, ot_exempt, STminRate, STmaxRate });

                        minRate = rateResults.minRate;
                        maxRate = rateResults.maxRate;
                        clientBillRateMin = rateResults.clientBillRateMin;
                        clientBillRateMax = rateResults.clientBillRateMax;

                        if (rate_model !== "bill_rate") {
                            return {
                                rate_type: rateDetails.rate_type,
                                bill_type: rateDetails.bill_type,
                                pay_type: rateDetails.pay_type,
                                candidatePayRate: {
                                    min_rate: Number(minRate).toFixed(8),
                                    max_rate: Number(maxRate).toFixed(8)
                                },
                                clientBillRate: {
                                    min_rate: Number(clientBillRateMin).toFixed(8),
                                    max_rate: Number(clientBillRateMax).toFixed(8)
                                },
                                minMarkup: Number(min_markup).toFixed(8),
                                maxMarkup: Number(max_markup).toFixed(8)
                            };
                        } else {
                            return {
                                rate_type: rateDetails.rate_type,
                                pay_type: rateDetails.pay_type,
                                bill_type: rateDetails.bill_type,
                                clientBillRate: {
                                    min_rate: Number(clientBillRateMin).toFixed(8),
                                    max_rate: Number(clientBillRateMax).toFixed(8)
                                },
                                minMarkup: Number(min_markup).toFixed(8),
                                maxMarkup: Number(max_markup).toFixed(8)
                            };
                        }
                    };

                    const processRateDetails = async (rateDetails: any, baseRateCalc: any, isShiftRate: boolean) => {
                        let minRate = rate_model === "pay_rate" ? rateDetails.pay_rate[0].min_rate : rateDetails.bill_rate[0].min_rate;
                        let maxRate = rate_model === "pay_rate" ? rateDetails.pay_rate[0].max_rate : rateDetails.bill_rate[0].max_rate;

                        let clientBillRateMin, clientBillRateMax, candidateBillRateMin, candidateBillRateMax;

                        let STminRate, STmaxRate;
                        if (isShiftRate) {
                            STminRate = baseRateCalc.candidatePayRate.min_rate;
                            STmaxRate = baseRateCalc.candidatePayRate.max_rate;
                        } else {
                            STminRate = baseRateCalc.rate_type.min_rate.amount;
                            STmaxRate = baseRateCalc.rate_type.max_rate.amount;
                        }

                        const rateType = rateDetails?.rate_type?.id;

                        const markupData = await getVendorMarkups({ program_id, program_industry, hierarchyIds, rate_model, work_locations, job_type, job_template_id, rateType });

                        const markupDataItem = markupData[0] as MarkupDataInterface;
                        let { min_markup, max_markup } = calculateMarkups(
                            markupDataItem.sourced_markup_min,
                            markupDataItem.sourced_markup_max,
                            markupDataItem.payrolled_markup_min,
                            markupDataItem.payrolled_markup_max
                        );

                        min_markup = min_markup || Number(baseRateCalc.minMarkup);
                        max_markup = max_markup || Number(baseRateCalc.maxMarkup);

                        const rateResults = calculateRatesWithoutFundingModel({ rateDetails, rate_model, minRate, maxRate, STminRate, STmaxRate, min_markup, max_markup, ot_exempt });

                        candidateBillRateMin = rateResults.minRate;
                        candidateBillRateMax = rateResults.maxRate;
                        clientBillRateMin = rateResults.clientBillRateMin;
                        clientBillRateMax = rateResults.clientBillRateMax;

                        if (rate_model === "bill_rate") {
                            return {
                                ...rateDetails,
                                clientBillRate: {
                                    min_rate: Number(clientBillRateMin).toFixed(8),
                                    max_rate: Number(clientBillRateMax).toFixed(8)
                                }
                            };
                        } else {
                            return {
                                ...rateDetails,
                                candidatePayRate: {
                                    min_rate: Number(candidateBillRateMin).toFixed(8),
                                    max_rate: Number(candidateBillRateMax).toFixed(8)
                                },
                                clientBillRate: {
                                    min_rate: Number(clientBillRateMin).toFixed(8),
                                    max_rate: Number(clientBillRateMax).toFixed(8)
                                },
                                minMarkup: Number(min_markup).toFixed(8),
                                maxMarkup: Number(max_markup).toFixed(8)
                            };
                        }
                    };

                    const baseRateCalc = await calculateBaseRates();
                    if (!baseRateCalc) return null;

                    const rateCalculations = await Promise.all(
                        config.base_rate.rates.map(async (rateDetails: any) => {
                            return processRateDetails(rateDetails, baseRateCalc, false);
                        })
                    );

                    const configRates = await Promise.all(
                        config.rate.map(async (rateDetails: any) => {
                            const processedRate = await processRateDetails(rateDetails, baseRateCalc, false);
                            if (!processedRate) return null;
                            const ratesCalculations = await Promise.all(
                                rateDetails.rates.map(async (rateDetails: any) => {
                                    return processRateDetails(rateDetails, processedRate, true);
                                })
                            );
                            return {
                                ...processedRate,
                                rates: ratesCalculations
                            };
                        })
                    );

                    const validConfigRates = configRates.filter(rate => rate !== null);

                    return {
                        base_rate: {
                            rate_type: standardRateConfig,
                            pay_rate: config.base_rate.pay_rate,
                            bill_rate: config.base_rate.bill_rate,
                            clientBillRate: {
                                min_rate: baseRateCalc?.clientBillRate?.min_rate,
                                max_rate: baseRateCalc?.clientBillRate?.max_rate,
                            },
                            minMarkup: baseRateCalc?.minMarkup,
                            maxMarkup: baseRateCalc?.maxMarkup,
                            ...(rate_model !== "bill_rate" && {
                                candidatePayRate: {
                                    min_rate: baseRateCalc?.candidatePayRate?.min_rate,
                                    max_rate: baseRateCalc?.candidatePayRate?.max_rate
                                }
                            }),
                            rates: rateCalculations,
                        },
                        rate: validConfigRates,
                    };
                }));

                return {
                    hierarchies: rateItem.hierarchies,
                    financial_details: financialDetails
                };
            }));

            return response;

        }
    } catch (error: any) {
        console.error('Error calculating financial details:', error);
        return reply.status(500).send({
            status_code: 500,
            trace_id: trace_id,
            message: 'An error occurred while calculating financial details.',
            error: error.message
        });
    }
}

async function getVendorMarkups(managerData: VendorMarkupDataInterface) {
    return GlobalRepository.findVendorMarkups({
        program_id: managerData.program_id,
        program_industry: managerData.program_industry,
        hierarchy: managerData.hierarchyIds,
        rate_model: managerData.rate_model,
        vendor_id: managerData.program_vendor_id,
        work_location: managerData.work_locations,
        job_type: managerData.job_type,
        rate_type: managerData.rateType,
        job_template_id: managerData.job_template_id,
        worker_classification: managerData.worker_classification
    });
}

function shouldValidateMarkups(rate_model: string, markupData: MarkupDataInterface) {
    if (rate_model === 'bill_rate') return false;

    if (!markupData || (
        markupData.sourced_markup_min === null &&
        markupData.sourced_markup_max === null &&
        markupData.payrolled_markup_min === null &&
        markupData.payrolled_markup_max === null
    )) {
        return true;
    }

    return false;
}

function getPayRateConfig(rate_model: string, standardRateConfig: any, formatWithAccuracy: Function) {
    if (rate_model === "pay_rate") {
        return {
            candidatePayRate: {
                min_rate: Number(standardRateConfig.min_rate.amount).toFixed(8) || 0,
                max_rate: Number(standardRateConfig.max_rate.amount).toFixed(8) || 0,
            }
        };
    } else if (rate_model === "markup") {
        return {
            candidatePayRate: {
                min_rate: Number(standardRateConfig.min_rate).toFixed(8) || 0,
                max_rate: Number(standardRateConfig.max_rate).toFixed(8) || 0,
            }
        };
    }

    return {};
}

function getFeeAmount(categorical_fees: any[], feeCategory: string): number {
    return Number(
        categorical_fees
            ?.find((fee) => fee.fee_category === feeCategory)
            ?.applicable_config?.find((config: any) => config.entity_ref === 'ASSIGNMENT')?.fee ?? 0
    );
}

function sendErrorResponse(reply: FastifyReply, trace_id: string, status_code: number, message: string) {
    return reply.status(status_code).send({ status_code, trace_id, message });
}

export async function advancedSearchJob(
    request: FastifyRequest<{
        Params: { program_id: string };
        Body: {
            job_id?: string;
            name?: string;
            template_name?: string;
            unit_of_measure?: string;
            first_name?: string;
            hierarchy_ids?: string[];
            status?: string[]; // Comma-separated statuses
            exclude_status?: string[]; // Exclude specific statuses
            min_bill_rate?: number;
            max_bill_rate?: number;
            no_positions?: string;
            primary_hierarchy?: string;
            job_submitted_candidate?: number;
            start_date?: string;
            end_date?: string;
            estimated_budget?: string;
            is_shift_rate?: string;
            page?: string;
            limit?: string;
        };
    }>,
    reply: FastifyReply
) {
    const trace_id = generateCustomUUID();
    const jobRepository = new JobRepository();

    try {
        const user = request?.user;
        const userId = user?.sub;
        const userType = user?.userType;

        const { program_id } = request.params;
        const {
            page = "1",
            limit = "10",
            job_id,
            name,
            template_name,
            unit_of_measure,
            first_name,
            hierarchy_ids = [],
            status = [],
            exclude_status = [],
            min_bill_rate,
            max_bill_rate,
            no_positions,
            primary_hierarchy,
            job_submitted_candidate,
            start_date,
            end_date,
            estimated_budget,
            is_shift_rate,
        } = request.body;

        const parsedPage = parseInt(page, 10) || 1;
        const parsedLimit = parseInt(limit, 10) || 10;
        const offset = (parsedPage - 1) * parsedLimit;

        let jobsData: any[] | null = null;

        if (userType === "super_user") {
            jobsData = await jobRepository.getAllJob(program_id, parsedLimit, offset);
        } else {
            const userData = await jobRepository.findUser(program_id, userId);

            if (userData && userData.length > 0) {
                const user_type = userData[0]?.user_type;
                const hierarchyIdsArray = userData[0]?.associate_hierarchy_ids ?? [];
                const tenantId = userData[0]?.tenant_id;

                if (user_type?.toUpperCase() === "CLIENT" || user_type?.toUpperCase() === "MSP") {
                    jobsData = await jobRepository.getAllJobWithHierarchies(
                        program_id,
                        hierarchyIdsArray,
                        parsedLimit,
                        offset
                    );
                } else if (user_type?.toUpperCase() === "VENDOR") {
                    jobsData = await jobRepository.getVendorJobs(program_id, tenantId, parsedLimit, offset);
                }
            }
        }

        if (!jobsData || jobsData.length === 0) {
            return reply.status(200).send({
                message: "No jobs found",
                jobs: [],
                trace_id,
            });
        }

        const filteredJobs = jobsData.filter((job) => {
            const hierarchyFilter = hierarchy_ids.length
                ? hierarchy_ids.every((hierarchyId) =>
                    job.hierarchies?.some((hierarchy: any) => hierarchy?.id === hierarchyId)
                )
                : true;

            // Handle multiple statuses
            const statusFilter = status.length ? status.includes(job.status) : true;
            const excludeStatusFilter = exclude_status.length
                ? !exclude_status.includes(job.status)
                : true;

            // Date filtering with valid date parsing
            const startDateFilter = start_date
                ? new Date(job.start_date) >= new Date(start_date)
                : true;
            const endDateFilter = end_date
                ? new Date(job.end_date) <= new Date(end_date)
                : true;

            return (
                hierarchyFilter &&
                statusFilter &&
                excludeStatusFilter &&
                (!job_id || job.job_id?.toLowerCase()?.includes(job_id.toLowerCase())) &&
                (!name || job.work_location?.name?.toLowerCase()?.includes(name.toLowerCase())) &&
                (!template_name || job.job_template?.id === template_name) &&
                (!first_name || job.jobManager?.first_name?.toLowerCase()?.includes(first_name.toLowerCase())) &&
                (!unit_of_measure || job.unit_of_measure === unit_of_measure) &&
                (!min_bill_rate || job.min_bill_rate >= min_bill_rate) &&
                (!max_bill_rate || job.max_bill_rate <= max_bill_rate) &&
                (!no_positions || job.no_positions === no_positions) &&
                (!primary_hierarchy || job.primary_hierarchy?.id === primary_hierarchy) &&
                (!job_submitted_candidate || job.job_submitted_candidate === job_submitted_candidate) &&
                startDateFilter &&
                endDateFilter &&
                (!estimated_budget || job.net_budget?.toLowerCase()?.includes(estimated_budget.toLowerCase())) &&
                (!is_shift_rate || job.job_template?.is_shift_rate === is_shift_rate)
            );
        });

        const paginatedJobs = filteredJobs.slice(offset, offset + parsedLimit);

        return reply.status(200).send({
            status_code: 200,
            total_records: filteredJobs.length,
            items: paginatedJobs,
            trace_id,
            pagination: {
                page: parsedPage,
                limit: parsedLimit,
                total_pages: Math.ceil(filteredJobs.length / parsedLimit),
            },
        });
    } catch (error: any) {
        return reply.status(500).send({
            message: "Internal Server Error",
            trace_id,
            error: error.stack,
        });
    }
}

export const getAll = async (
    request: FastifyRequest,
    reply: FastifyReply
) => {
    const traceId = generateCustomUUID();
    const jobRepository = new JobRepository();
    const user = request?.user;
    const user_id = user?.sub;
    const userType = user?.userType?.toLocaleUpperCase()

    try {
        const { program_id } = request.params as { program_id: string };
        const userData = await jobRepository.findUser(program_id, user_id);
        const tenantId = userData?.[0]?.tenant_id
        const user_type = userData?.[0]?.user_type?.toLocaleUpperCase()
        const hierarchyIdsArray = userData[0]?.associate_hierarchy_ids || [];
        let vendor_id;
        if (user_type === "VENDOR") {
            const vendor = await jobRepository.findVendor(program_id, tenantId);
            vendor_id = vendor?.[0]?.id;
        }
        let jobs;
        if (userType === "SUPER_USER") {
            jobs = await jobRepository.getAllJobDetails(program_id);
        } else if (user_type === "VENDOR") {
            jobs = await jobRepository.getAllJobDetailsForVendor(program_id, vendor_id);
        } else if (user_type === "CLIENT" || "MSP") {
            jobs = await jobRepository.getAllJobDetailsForClient(program_id, hierarchyIdsArray);
        } else {
            return reply.status(403).send({
                status_code: 403,
                message: "Forbidden - Invalid user type",
                trace_id: traceId,
            });
        }

        if (!jobs.length) {
            return reply.status(200).send({
                message: "No job details available",
                trace_id: traceId,
                data: [],
            });
        }

        return reply.status(200).send({
            message: "Job details fetched successfully",
            trace_id: traceId,
            data: jobs,
        });

    } catch (error: any) {
        console.error(`Error fetching job details: ${error.message}`);
        return reply.status(500).send({
            status_code: 500,
            message: "Internal Server Error",
            trace_id: traceId,
            error: error.message,
        });
    }
};

export const getJobCount = async (request: FastifyRequest, reply: FastifyReply) => {
    const { program_id, id: job_id } = request.params as { program_id: string; id: string };
    const { candidate_id, workflow_trigger_id, module_name } = request.query as { candidate_id: string; workflow_trigger_id: string, module_name: string };
    const trace_id = generateCustomUUID();
    const user = request?.user;
    const userType = user?.userType || undefined;
    console.log("userType is ", userType);

    const user_id = user?.sub;

    try {
        const userData = await jobRepository.findUser(program_id, user_id);
        let isVendorUser = false;
        let vendor_id = null;

        if (userData && userData.length > 0) {
            const user_type = userData[0]?.user_type;
            if (user_type?.toUpperCase() === "VENDOR") {
                isVendorUser = true;
                vendor_id = userData[0]?.tenant_id;
            }
        }

        const result: any = await jobRepository.getJobCounts(user_id, program_id, job_id, isVendorUser, vendor_id, candidate_id, workflow_trigger_id, module_name);
        const submitedCandidate = result.submittedCandidates ?? [];

        let workflowData: any[] = [];
        let matchedCandidateIds: any[] = [];
        let filteredCandidates: any[] = [];

        const isSuperUser = userType?.toLowerCase?.() === "super_user";
        const user_type = userData[0]?.user_type;

        if (!isSuperUser && user_type?.toLowerCase?.() !== "msp") {
            const candidateIds = submitedCandidate.map((candidate: any) => candidate.id);

            workflowData = await getWorkflowData(candidateIds, program_id, user_id);
            console.log("workflowDataBatch", workflowData);
            matchedCandidateIds = workflowData.map((item: any) => item.match_candidate_id)
            const allowedStatuses = [
                "PENDING_REHIRE_REVIEW",
                "PENDING_REHIRE_APPROVAL",
                "PENDING_SHORTLIST_REVIEW",
            ];
            filteredCandidates = submitedCandidate.filter((candidate: any) => {
                console.log("Candidate ID is:", candidate);
                const isMatched = isSuperUser || matchedCandidateIds.includes(candidate.id);
                const shouldShowCandidate = !isMatched && allowedStatuses.includes(candidate.status);
                return !shouldShowCandidate;
            });
        } else {
            filteredCandidates = submitedCandidate;
        }

        const filteredCandidateCount = filteredCandidates.length;
        console.log("filteredCandidateCount is ", filteredCandidateCount);

        return reply.status(200).send({
            message: 'Count details fetched successfully',
            trace_id: trace_id,
            count: {
                job_detail: { status: "completed" },
                job_distribution: {
                    count: result.jobDistributionCount ?? 0,
                    status: result.jobDistributionCount > 0 ? "completed" : "in-progress",
                },
                workflow: {
                    count: result.activeWorkflowConfigCount ?? 0,
                    status: result.activeWorkflowConfigCondition ?? "pending"
                },
                talent_pool: {
                    count: result.availableCandidateCount ?? 0,
                    status: result.availableCandidateCount > 0 ? "completed" : "pending",
                },
                submitted_candidate: {
                    count: isVendorUser ? result.submittedCandidateCount : filteredCandidateCount ?? 0,
                    status: result.submittedCandidateCondition ?? "pending"
                },
                interview: {
                    count: result.interviewCandidateCount ?? 0,
                    status: result.interviewCandidateCondition ?? "pending"
                },
                offer: {
                    count: result.offerCandidateCount ?? 0,
                    status: result.offerCandidateCondition ?? "pending"
                },
                job_history: result.job_history
            },
        });
    } catch (error: any) {
        return reply.status(500).send({
            status_code: 500,
            message: 'Internal Server Error',
            trace_id: trace_id,
            error: error.message
        });
    }
};

export const updateJobStatus = async (request: FastifyRequest, reply: FastifyReply) => {
    const { program_id, id } = request.params as { program_id: string; id: string };
    const { status } = request.body as { status: string };
    const trace_id = generateCustomUUID();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ message: 'Unauthorized - Token not found' });
    }
    const token = authHeader.split(' ')[1];
    const user = await decodeToken(token);

    if (!user) {
        return reply.status(401).send({ message: 'Unauthorized - Invalid token' });
    }

    try {
        const currentJob = await JobModel.findOne({
            where: { program_id, id },
            attributes: ["id", "job_id", "status", "job_manager_id", "hierarchy_ids"],
        });

        if (!currentJob) {
            return reply.status(200).send({
                status_code: 200,
                message: "Job not found.",
                trace_id: trace_id,
            });
        }

        const payload: any = {
            job_id: currentJob.dataValues.job_id
        };

        let updates = payload
        const currentStatus = currentJob.dataValues.status;

        if (status === "RELEASE") {
            console.log('Inside release API')
            const jobHistoryRecords = await JobHistoryModel.findAll({
                where: { program_id, job_id: id },
                order: [["updated_on", "DESC"]],
                raw: true
            });

            if (jobHistoryRecords.length == 0) {
                return reply.status(404).send({
                    status_code: 400,
                    message: "Not enough job history records to determine the previous status.",
                    trace_id: trace_id,
                });
            }

            let latestJobHistory = null;
            for (const record of jobHistoryRecords) {
                if (record?.compare_meta_data?.status.slug == "status" && record.compare_meta_data.status.old_value !== "HALTED") {
                    latestJobHistory = record;
                    break;
                }
            }

            if (!latestJobHistory) {
                return reply.status(400).send({
                    status_code: 400,
                    message: "No valid job history record found for determining the previous status (all records show HALTED status).",
                    trace_id: trace_id,
                });
            }

            const newStatus = latestJobHistory?.compare_meta_data.status.old_value;

            const [updatedJobCount] = await JobModel.update(
                { status: newStatus },
                { where: { id } }
            );


            if (updatedJobCount > 0) {
                const updatedFields = {
                    status: {
                        newValue: newStatus,
                        oldValue: currentStatus,
                    },
                };
                const statusEventMap: Record<string, string> = {
                    HOLD: "Job Released from Hold",
                    HALTED: "Job Released from Halt",
                };
                const jobEventType = statusEventMap[latestJobHistory?.status] || undefined;
                const compareMetaData = buildMinimalChanges(updatedFields);

                try {
                    await createJobHistoryRecord(
                        { id, program_id },
                        { status: newStatus },
                        user?.sub ?? "",
                        null,
                        jobEventType,
                        compareMetaData
                    );
                } catch (error) {
                    console.error("Error in updatedJobStatus history:", error);
                }
            }

            if (updatedJobCount === 0) {
                return reply.status(400).send({
                    status_code: 400,
                    message: "Job not found or status not updated.",
                    trace_id: trace_id,
                });
            }

            let event_type = "Job Released";
            if (currentStatus === "HALTED") {
                event_type = "Job Released from Halt";
            } else if (currentStatus === "HOLD") {
                event_type = "Job Released from Hold";
            }

            return reply.status(200).send({
                status_code: 200,
                message: "Job status updated successfully.",
                trace_id: trace_id,
                new_status: newStatus,
            });
        }

        if (status === "REMOVE") {
            const [updatedJobCount] = await JobModel.update(
                { is_deleted: true },
                { where: { id } }
            );

            if (updatedJobCount > 0) {
                const updatedFields = {
                    status: {
                        newValue: status,
                        oldValue: currentStatus,
                    },
                };
                const compareMetaData = buildMinimalChanges(updatedFields);

                try {
                    await createJobHistoryRecord(
                        { id, program_id },
                        { status: status },
                        user?.sub ?? "",
                        null,
                        "Job Removed",
                        compareMetaData
                    );
                } catch (error) {
                    console.error("Error in updatedJobStatus history:", error);
                }
            }

            if (updatedJobCount === 0) {
                return reply.status(400).send({
                    status_code: 400,
                    message: "Job not found.",
                    trace_id: trace_id,
                });
            }

            return reply.status(200).send({
                status_code: 200,
                message: "Job remove successfully.",
                trace_id: trace_id
            });
        }
        if (status === "OPEN") {
            const jobHistoryRecords = await JobHistoryModel.findAll({
                where: { program_id, job_id: id },
                order: [["updated_on", "DESC"]],
            });

            const updatedRecords = jobHistoryRecords.filter(
                (record) => record.event_type === "Job Updated" || record.event_type === "Job Created"
            );


            const latestUpdatedRecord = updatedRecords.length > 0 ? updatedRecords[0] : null;
            if (!latestUpdatedRecord?.status) {
                return reply.status(400).send({
                    status_code: 400,
                    message: "Invalid job history record for determining the previous status.",
                    trace_id: trace_id,
                });
            }

            const newStatus = latestUpdatedRecord?.status;

            if (newStatus == 'HOLD') {
                const dynamicEventCodeCallback = (userEmail: any): string => {

                    if (userEmail.userType === "vendor") {
                        return "JOB_RELEASE_FROM_HOLD_GLOBAL1";
                    }

                    return "JOB_RELEASE_FROM_HOLD_GLOBAL";
                };

                jobNotificationService.sendDynamicJobNotification(
                    token,
                    sequelize,
                    user,
                    program_id,
                    updates,
                    currentJob.dataValues,
                    trace_id,
                    dynamicEventCodeCallback
                );
            } else if (newStatus == 'HALTED') {
                const dynamicEventCodeCallback = (userEmail: any): string => {
                    if (userEmail.userType === "vendor") {
                        return "JOB_RELEASE_FROM_HALT_GLOBAL1";
                    }
                    return 'JOB_RELEASE_FROM_HALT_GLOBAL';
                };
                jobNotificationService.sendDynamicJobNotification(
                    token,
                    sequelize,
                    user,
                    program_id,
                    updates,
                    currentJob.dataValues,
                    trace_id,
                    dynamicEventCodeCallback
                );
            }
        } else
            if (status === "CLOSED") {
                const dynamicEventCodeCallback = (userEmail: any): string => {
                    if (userEmail.userType === "vendor") {
                        return "JOB_CLOSED_VENDOR";
                    }
                    return 'JOB_CLOSED_MSP';
                };
                jobNotificationService.sendDynamicJobNotification(
                    token,
                    sequelize,
                    user,
                    program_id,
                    updates,
                    currentJob.dataValues,
                    trace_id,
                    dynamicEventCodeCallback
                );
                const [updatedJobCount] = await JobModel.update(
                    { status: "CLOSED" },
                    { where: { id } }
                );

                if (updatedJobCount > 0) {
                    const updatedFields = {
                        status: {
                            newValue: status,
                            oldValue: currentStatus,
                        },
                    };
                    const compareMetaData = buildMinimalChanges(updatedFields);

                    try {
                        await createJobHistoryRecord(
                            { id, program_id },
                            { status: status },
                            user?.sub ?? "",
                            null,
                            "Job Closed",
                            compareMetaData
                        );
                    } catch (error) {
                        console.error("Error in updatedJobStatus history:", error);
                    }
                }

                if (updatedJobCount === 0) {
                    return reply.status(400).send({
                        status_code: 400,
                        message: "Job not found or status not updated.",
                        trace_id: trace_id,
                    });
                }
            } else
                if (status === "FILLED") {
                    jobNotificationService.jobFilledNotification(token, sequelize, user, program_id, currentJob, trace_id, NotificationEventCode.JOB_FILLED)
                }
                else if (status === "HALTED") {

                    const dynamicEventCodeCallback = (userEmail: any): string => {
                        if (userEmail.userType === "vendor") {
                            return "JOB_HALT_GLOBAL1";
                        }
                        return 'JOB_HALT_GLOBAL';
                    };
                    jobNotificationService.sendDynamicJobNotification(
                        token,
                        sequelize,
                        user,
                        program_id,
                        updates,
                        currentJob.dataValues,
                        trace_id,
                        dynamicEventCodeCallback
                    );

                    const [updatedJobCount] = await JobModel.update(
                        { status: "HALTED" },
                        { where: { id } }
                    );

                    if (updatedJobCount > 0) {
                        const updatedFields = {
                            status: {
                                newValue: status,
                                oldValue: currentStatus,
                            },
                        };
                        const compareMetaData = buildMinimalChanges(updatedFields);

                        try {
                            await createJobHistoryRecord(
                                { id, program_id },
                                { status: status },
                                user?.sub ?? "",
                                null,
                                "Job Halted",
                                compareMetaData
                            );
                        } catch (error) {
                            console.error("Error in updatedJobStatus history:", error);
                        }
                    }

                    if (updatedJobCount === 0) {
                        return reply.status(400).send({
                            status_code: 400,
                            message: "Job not found or status not updated.",
                            trace_id: trace_id,
                        });
                    }
                } else if (status === "HOLD") {
                    const dynamicEventCodeCallback = (userEmail: any): string => {
                        if (userEmail.userType === "vendor") {
                            return "JOB_HOLD_GLOBAL1";
                        }
                        return 'JOB_HOLD_GLOBAL';
                    };
                    jobNotificationService.sendDynamicJobNotification(
                        token,
                        sequelize,
                        user,
                        program_id,
                        updates,
                        currentJob.dataValues,
                        trace_id,
                        dynamicEventCodeCallback
                    );
                    const [updatedJobCount] = await JobModel.update(
                        { status: "HOLD" },
                        { where: { id } }
                    );

                    if (updatedJobCount > 0) {
                        const updatedFields = {
                            status: {
                                newValue: status,
                                oldValue: currentStatus,
                            },
                        };
                        const compareMetaData = buildMinimalChanges(updatedFields);

                        try {
                            await createJobHistoryRecord(
                                { id, program_id },
                                { status: status },
                                user?.sub ?? "",
                                null,
                                "Job on Hold",
                                compareMetaData
                            );
                        } catch (error) {
                            console.error("Error in updatedJobStatus history:", error);
                        }
                    }

                    if (updatedJobCount === 0) {
                        return reply.status(400).send({
                            status_code: 400,
                            message: "Job not found or status not updated.",
                            trace_id: trace_id,
                        });
                    }
                }

        const newStatus = currentJob.dataValues.status?.toUpperCase();
        let event_type = "Job Updated";
        switch (status?.toUpperCase()) {
            case "OPEN":
                event_type = "Job Created";
                break;
            case "HOLD":
                event_type = "Job Hold";
                break;
            case "HALTED":
                event_type = "Job Halted";
                break;
            case "FILLED":
                event_type = "Job Filled";
                break;
            case "CLOSED":
                event_type = "Job Closed";
                break;
            case "RELEASE":
                event_type = "Job Released";
                break;
        }

        return reply.status(200).send({
            status_code: 200,
            message: "Job status updated successfully.",
            trace_id: trace_id,
            new_status: status,
        });
    } catch (error: any) {
        console.error("Error updating job status:", error);
        return reply.status(500).send({
            status_code: 500,
            message: "Internal Server Error",
            trace_id: trace_id,
            error: error.message,
        });
    }
};


const getUserSetup = async (program_id: string, user_id: string) => {
    const userData = await jobRepository.findUser(program_id, user_id);
    const user_type = userData[0]?.user_type?.toUpperCase();
    const hierarchyIdsArray = userData[0]?.associate_hierarchy_ids ?? [];
    const tenantId = userData[0]?.tenant_id;
    const job_ids = await jobRepository.getJobIdsWithHierarchies(program_id, hierarchyIdsArray);

    let vendor_id;
    if (user_type === "VENDOR") {
        const vendor = await jobRepository.findVendor(program_id, tenantId);
        vendor_id = vendor?.[0]?.id;
    }

    return { user_type, hierarchyIdsArray, tenantId, job_ids, vendor_id };
};

const getJobStatusCounts = async (
    program_id: string,
    user: any,
    user_type: string,
    user_id: string,
    hierarchyIdsArray: string[],
    vendor_id?: string
) => {
    let jobCount = 0;
    let jobCountReview = 0;
    let jobToDistributeCount = 0;
    let jobPendingApprovalSourcingCount = 0;

    if (user.userType === 'super_user') {
        const [approvalResult, reviewResult] = await Promise.all([
            jobRepository.getSuperUserJobPendingCount(program_id),
            jobRepository.getSuperUserJobPendingCountReview(program_id)
        ]);
        jobCount = approvalResult?.job_pending_approval_count || 0;
        jobCountReview = reviewResult?.job_pending_review_count || 0;
    } else if (user_type === 'CLIENT' || user_type === 'MSP') {
        const result = await jobRepository.getJobPendingCountWithHierarchiesReview(program_id, user_id, hierarchyIdsArray);
        jobCount = result?.job_pending_approval_count ?? 0;
        jobCountReview = result?.job_pending_review_count ?? 0;
        jobToDistributeCount = result?.jobs_to_distribute_count ?? 0;
        jobPendingApprovalSourcingCount = result?.job_pending_approval_sourcing_count ?? 0;
    } else if (user_type === 'VENDOR') {
        const [approvalResult, reviewResult] = await Promise.all([
            jobRepository.getVendorJobPendingCount(program_id, vendor_id),
            jobRepository.getVendorJobPendingCountReview(program_id, vendor_id)
        ]);
        jobCount = approvalResult?.job_pending_approval_count || 0;
        jobCountReview = reviewResult?.job_pending_review_count || 0;
    }

    const statusCountJob = [
        {
            count: jobCount,
            status: "Job Pending Approval",
            icon: { icon_name: "bag-simple", icon_bgColor: '#0071E3' },
        },
        {
            count: jobPendingApprovalSourcingCount,
            status: "Job Pending Approval Sourcing",
            icon: { icon_name: "user-circle-dashed", icon_bgColor: '#0071E3' },
        }
    ];

    const statusCountJobReview = [
        {
            count: jobCountReview,
            status: "Job Pending Review",
            icon: { icon_name: "user-circle-dashed", icon_bgColor: '#0071E3' },
        },
        {
            count: jobToDistributeCount,
            status: "Jobs To Distribute",
            icon: { icon_name: "user-circle-dashed", icon_bgColor: '#0071E3' },
        }
    ];

    return { statusCountJob, statusCountJobReview };
};

const getSubmissionCounts = async (
    program_id: string,
    user: any,
    user_type: string,
    user_id: string,
    job_ids: string[]
) => {
    let jobSubmissionResumeToReviewCount = 0;
    let pendingRehireCheckApprovalCount = 0;
    let pendingRehireCheckReviewCount = 0;

    if (user.userType === 'super_user') {
        const result = await submissionCandidateRepository.getPendingShortlistCountForSuperAdmin(program_id);
        jobSubmissionResumeToReviewCount = parseInt(result?.resume_to_review_count) || 0;
        pendingRehireCheckApprovalCount = parseInt(result?.Pending_Rehire_Check_Approval_count) || 0;
        pendingRehireCheckReviewCount = parseInt(result?.Pending_Rehire_Check_Review_count) || 0;
    } else if (user_type === 'CLIENT' || user_type === 'MSP') {
        const result = await submissionCandidateRepository.getPendingShortlistCountForClient(program_id, user_id, job_ids);
        jobSubmissionResumeToReviewCount = parseInt(result?.resume_to_review_count) || 0;
        pendingRehireCheckApprovalCount = parseInt(result?.pending_rehire_check_approval_count) || 0;
        pendingRehireCheckReviewCount = parseInt(result?.pending_rehire_check_review_count) || 0;

    }

    return [
        {
            count: jobSubmissionResumeToReviewCount,
            status: "Shortlist Pending Review",
            icon: { icon_name: "files", icon_bgColor: '#BF83FF' },
        },
        {
            count: pendingRehireCheckApprovalCount,
            status: "Pending Rehire Approval",
            icon: { icon_name: "repeat", icon_bgColor: '#00B578' },
        },
        {
            count: pendingRehireCheckReviewCount,
            status: "Pending Rehire Review",
            icon: { icon_name: "repeat", icon_bgColor: '#00B578' },
        }
    ];
};

const getOfferCounts = async (
    program_id: string,
    user: any,
    user_type: string,
    user_id: string,
    hierarchyIdsArray: string[],
    vendor_id?: string | undefined
) => {
    let offerPendingApprovalCount = 0;
    let offerPendingReviewCount = 0;
    let offerRejectedCount = 0;
    let offerReleasedCount = 0;
    let counterOfferPendingApprovalCount = 0;
    let counterOfferPendingReviewCount = 0;

    if (user_type === 'CLIENT' || user_type === "MSP") {
        const result = await offersRepository.getStatusCountOfferForClient(program_id, user_id, hierarchyIdsArray);
        offerPendingApprovalCount = result?.pending_approval_count ?? 0;
        offerPendingReviewCount = result?.pending_review_count ?? 0;
        offerRejectedCount = result?.rejected_offers_count ?? 0;
        counterOfferPendingApprovalCount = result?.counter_offer_pending_approval_count ?? 0;
        counterOfferPendingReviewCount = result?.counter_offer_pending_review_count ?? 0;
    } else if (user_type === 'VENDOR') {
        const result = await offersRepository.getStatusCountOffers(vendor_id, program_id);
        offerPendingApprovalCount = result?.pending_approval_count ?? 0;
        offerPendingReviewCount = result?.pending_review_count ?? 0;
        offerReleasedCount = result?.released_offers_count ?? 0;
        counterOfferPendingApprovalCount = result?.counter_offer_pending_approval_count ?? 0;
        counterOfferPendingReviewCount = result?.counter_offer_pending_review_count ?? 0;
    } else if (user.userType === 'super_user') {
        const result = await offersRepository.getStatusCountForSuperAdmin(program_id);
        offerPendingApprovalCount = result?.pending_approval_count ?? 0;
        offerPendingReviewCount = result?.pending_review_count ?? 0;
        offerRejectedCount = result?.rejected_offers_count ?? 0;
        counterOfferPendingApprovalCount = result?.counter_offer_pending_approval_count ?? 0;
        counterOfferPendingReviewCount = result?.counter_offer_pending_review_count ?? 0;
    }

    return [
        {
            count: offerPendingApprovalCount,
            status: "Offer Pending Approval",
            icon: { icon_name: "envelope", icon_bgColor: '#FA5A7D' },
        },
        {
            count: offerPendingReviewCount,
            status: "Offer Pending Review",
            icon: { icon_name: "envelope", icon_bgColor: '#FA5A7D' },
        },
        {
            count: offerRejectedCount,
            status: "Rejected Offers",
            icon: { icon_name: "envelope", icon_bgColor: '#FA5A7D' },
        },
        {
            count: offerReleasedCount,
            status: " Offer Pending Acceptance",
            icon: { icon_name: "envelope", icon_bgColor: '#FA5A7D' },
        },
        {
            count: counterOfferPendingApprovalCount,
            status: "Counter Offer Pending Approval",
            icon: { icon_name: "envelope", icon_bgColor: '#FA5A7D' },
        },
        {
            count: counterOfferPendingReviewCount,
            status: "Counter Offer Pending Review",
            icon: { icon_name: "envelope", icon_bgColor: '#FA5A7D' },
        }
    ];
};

const getInterviewCounts = async (
    program_id: string,
    user: any,
    user_type: string,
    job_ids: string[],
    vendor_id?: string | undefined
) => {
    let interviewPendingConfirmationCount = 0;
    let interviewAcceptedCount = 0;
    let interviewPendingAcceptanceCount = 0;

    if (user_type === 'CLIENT' || user_type === "MSP") {
        const result = await interviewRepository.getStatusCountClientInterview(program_id, job_ids);
        interviewPendingConfirmationCount = result?.pending_confirmation_count ?? 0;
        interviewAcceptedCount = result?.accepted_count ?? 0;
    } else if (user_type === 'VENDOR') {
        const result = await interviewRepository.getStatusCountInterviews(vendor_id, program_id);
        interviewPendingAcceptanceCount = result?.pending_acceptance_count ?? 0;
        interviewAcceptedCount = result?.accepted_count ?? 0;
    } else if (user.userType === 'super_user') {
        const result = await interviewRepository.getStatusCountForSuperAdmin(program_id);
        interviewPendingConfirmationCount = result?.pending_confirmation_count ?? 0;
        interviewAcceptedCount = result?.accepted_count ?? 0;
    }

    return [
        {
            count: interviewPendingConfirmationCount,
            status: "Interview pending confirmation",
            icon: { icon_name: "hourglass-low", icon_bgColor: '#FF9F18' },
        },
        {
            count: interviewAcceptedCount,
            status: "Interview accepted",
            icon: { icon_name: "hourglass-low", icon_bgColor: '#FF9F18' },
        },
        {
            count: interviewPendingAcceptanceCount,
            status: "Interview pending acceptance",
            icon: { icon_name: "hourglass-low", icon_bgColor: '#FF9F18' },
        },
    ];
};


export const getStatusCount = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
        const { program_id } = request.params as { program_id: string };
        const user = request?.user;
        const user_id = user?.sub;

        const { user_type, hierarchyIdsArray, job_ids, vendor_id } = await getUserSetup(program_id, user_id);
        const [
            { statusCountJob, statusCountJobReview },
            statusCountJobResumeToReview,
            statusCountOffers,
            statusCountInterviews,
            statusCountNewJobRequests
        ] = await Promise.all([
            getJobStatusCounts(program_id, user, user_type, user_id, hierarchyIdsArray, vendor_id),
            getSubmissionCounts(program_id, user, user_type, user_id, job_ids),
            getOfferCounts(program_id, user, user_type, user_id, hierarchyIdsArray, vendor_id),
            getInterviewCounts(program_id, user, user_type, job_ids, vendor_id),
            getNewJobCounts(program_id, user, user_type, hierarchyIdsArray, vendor_id)
        ]);

        const card = [
            ...statusCountJob,
            ...statusCountJobReview,
            ...statusCountJobResumeToReview,
            ...statusCountNewJobRequests,
            ...statusCountOffers,
            ...statusCountInterviews
        ];

        return reply.status(200).send({
            status_code: 200,
            message: "Pending Actions Fetched successfully",
            card,
        });
    } catch (error: any) {
        return reply.status(500).send({
            message: 'An error occurred while fetching status count',
            error: error.message
        });
    }
};

export const getJobStatistics = async (request: FastifyRequest, reply: FastifyReply) => {
    const { program_id } = request.params as { user_id: string, program_id: string };
    const { name } = request.query as { name?: string };
    try {

        const user = request?.user;
        const userId = user?.sub;
        const userType = user?.userType;
        const userData = await jobRepository.findUser(program_id, userId);
        const user_type = userData[0]?.user_type?.toUpperCase();
        const hierarchyIdsArray = userData[0]?.associate_hierarchy_ids ?? 0;
        const job_ids = await jobRepository.getJobIdsWithHierarchies(program_id, hierarchyIdsArray);
        let resume_to_review_count = 0;
        if (userType === "super_user") {
            resume_to_review_count = await submissionCandidateRepository.getPendingShortlistReviewCountForSuperAdmin(program_id);
        } else if (user_type === "CLIENT") {
            const result = await submissionCandidateRepository.getPendingShortlistCountForClient(program_id, userId, job_ids);
            resume_to_review_count = result?.resume_to_review_count ?? 0;

        } else if (user_type === "MSP") {
            const result = await submissionCandidateRepository.getPendingShortlistCountReviewForClient(program_id, job_ids);
            resume_to_review_count = typeof result === 'number' ? result : result?.resume_to_review_count ?? 0;
        }
        let jobCount: { active_jobs_count: number; current_openings_count: number; contract_ending_count: number } = {
            active_jobs_count: 0,
            current_openings_count: 0,
            contract_ending_count: 0
        };

        if (userType === 'super_user') {
            jobCount = await jobRepository.getSuperUserJobCount(program_id) || jobCount;

        } else {
            const userData = await jobRepository.findUser(program_id, userId);

            if (userData?.length > 0) {
                const user_type = userData[0]?.user_type?.toUpperCase();
                const hierarchyIdsArray = userData[0]?.associate_hierarchy_ids ?? [];
                const tenantId = userData[0]?.tenant_id;
                let vendor_id;
                if (user_type === "VENDOR") {
                    const vendor = await jobRepository.findVendor(program_id, tenantId);
                    vendor_id = vendor?.[0]?.id;
                }

                if (user_type) {
                    if (user_type === "CLIENT" || user_type === "MSP") {
                        const isMsp = user_type === "MSP";
                        const result = await jobRepository.getJobCountWithHierarchies(program_id, hierarchyIdsArray, userId, isMsp);
                        jobCount = typeof result === 'object' ? result : jobCount;
                    } else if (user_type === "VENDOR") {
                        const result = await jobRepository.getVendorJobCount(program_id, vendor_id);
                        jobCount = typeof result === 'object' ? result : jobCount;
                    }
                }
            }
        }

        const colors = ['#E9F4FF', '#F3E8FF', '#FFE2E5', '#F3E8FF'];
        const dataConfig = ['Active Jobs', 'Current Openings', 'Contract Ending', 'Shortlist Pending Review'];
        const icons = [
            { icon_name: 'suitcase', backgroundColor: '#0071E3' },
            { icon_name: 'office-chair', backgroundColor: '#BF83FF' },
            { icon_name: 'file-text', backgroundColor: '#FA5A7D' },
            { icon_name: 'files', backgroundColor: '#BF83FF' }
        ];

        let statisticsWithIcons = dataConfig.map((name, index) => ({
            name,
            count: index < 3
                ? jobCount?.[Object.keys(jobCount)[index] as keyof typeof jobCount] ?? 0
                : resume_to_review_count,
            backgroundColor: colors[index],
            slug: generateSlug(name, { lowercase: true }),
            icon: icons[index]
        }));

        statisticsWithIcons = statisticsWithIcons.filter(item => item.name !== "Contract Ending");

        if (name) {
            statisticsWithIcons = statisticsWithIcons.filter(item => item.name === name);
        }

        return reply.status(200).send({
            message: 'Job Statistics fetched successfully.',
            data: statisticsWithIcons,
        });

    } catch (error: any) {
        console.error('Error fetching job statistics:', error);
        return reply.status(500).send({ message: 'An error occurred while fetching statistics.', error: error.message });
    }
};

const getNewJobCounts = async (
    program_id: string,
    user: any,
    user_type: string,
    hierarchyIdsArray: string[],
    vendor_id?: string
) => {
    let newJobCount = 0;

    try {
        if (user?.userType === 'super_user') {
            newJobCount = await jobRepository.GetJobCount(program_id) ?? 0;
        } else if (user_type === "CLIENT" || user_type === "MSP") {
            newJobCount = await jobRepository.countClientJobs(program_id, hierarchyIdsArray) ?? 0;
        } else if (user_type === "VENDOR" && vendor_id) {
            newJobCount = await jobRepository.countVendorJobs(program_id, vendor_id) ?? 0;
        }
    } catch (error: any) {
        console.error(`Error fetching new job count: ${error.message}`);
        newJobCount = 0;
    }

    return [
        {
            count: newJobCount,
            status: "New Job Requests",
            icon: { icon_name: "suitcase", icon_bgColor: '#0071E3' },
        }
    ];
};



export const updateJobDistribution = async (
    request: FastifyRequest,
    reply: FastifyReply
) => {


    const { job_id, vendor_id } = request.query as { job_id: string; vendor_id: string };
    const { program_id } = request.params as { program_id: string };
    const updatePayload = request.body as Record<string, any>;
    const traceId = generateCustomUUID();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ message: 'Unauthorized - Token not found' });
    }
    const token = authHeader.split(' ')[1];
    const user = await decodeToken(token);

    if (!user) {
        return reply.status(401).send({ message: 'Unauthorized - Invalid token' });
    }
    const userId = user?.sub;
    if (!job_id || !vendor_id) {
        return reply.status(200).send({
            status_code: 200,
            message: "job_id and vendor_id are required.",
            trace_id: traceId
        });
    }
    try {
        const jobDistribution = await JobDistributionModel.findOne({
            where: { job_id, vendor_id },
        });
        if (!jobDistribution) {
            return reply.status(200).send({
                status_code: 200,
                message: "Job distribution not found.",
                trace_id: traceId
            });
        }
        if (!updatePayload || Object.keys(updatePayload).length === 0) {
            return reply.status(200).send({
                status_code: 200,
                message: "No fields provided to update.",
                trace_id: traceId
            });
        }
        await JobDistributionModel.update(updatePayload, {
            where: { job_id, vendor_id, updated_by: userId, },
        });
        const query = `SELECT * FROM jobs WHERE id = :jobId LIMIT 1;`;
        const jobRequest: any = await sequelize.query(query, {
            type: QueryTypes.SELECT,
            replacements: { jobId: job_id },
        });

        let jobDatas = jobRequest[0];

        jobNotificationService.handleJobOptOut(user, token, sequelize, NotificationEventCode.JOB_OPT_OUT, program_id, jobDatas, traceId);

        return reply.status(200).send({
            status_code: 200,
            message: "Job distribution updated successfully.",
            trace_id: traceId,
            updated_fields: updatePayload,
        });
    } catch (error: any) {
        console.error("Error updating job distribution:", error);
        return reply.status(500).send({
            status_code: 500,
            message: "Internal Server Error",
            trace_id: traceId,
            error: error.message,
        });
    }
};

export async function getJobIdsForUserType(program_id: string, userId: string, userType: string | undefined): Promise<string[]> {
    if (userType === 'super_user') {
        return [];
    }

    const userData = await jobRepository.findUser(program_id, userId);

    if (userData && userData.length > 0) {
        const user_type = userData[0]?.user_type;
        const hierarchyIdsArray = userData[0]?.associate_hierarchy_ids ?? [];

        if (user_type) {
            if (user_type.toUpperCase() === "CLIENT" || user_type.toUpperCase() === "MSP") {
                if ((hierarchyIdsArray.length === 0 || !hierarchyIdsArray)) {
                    return await jobRepository.getAllJobIds(program_id);
                } else {
                    return await jobRepository.getJobIdsWithHierarchies(program_id, hierarchyIdsArray);
                }
            } else if (user_type.toUpperCase() === "VENDOR") {
                return await jobRepository.getVendorJobIds({ program_id, userId, isOptOut: false });
            } else {
                return await jobRepository.getAllJobIds(program_id);
            }
        }
    }

    return [];
}


export async function advancedSearchJobs(
    request: FastifyRequest<{
        Params: { program_id: string };
        Body: {
            job_id?: string;
            name?: string;
            template_name?: string[];
            first_name?: string[];
            hierarchy_ids?: string[];
            hierarchies?: string[];
            user_hierarhy_ids?: string[];
            status?: string[];
            exclude_status?: string[];
            min_bill_rate?: number;
            max_bill_rate?: number;
            no_positions?: string;
            primary_hierarchy?: string[];
            job_submitted_candidate?: number;
            start_date?: string;
            end_date?: string;
            estimated_budget?: string;
            is_shift_rate?: boolean;
            unit_of_measure?: string;
            page?: string;
            limit?: string;
            created_on?: string;
            search?: string;
        };
    }>,
    reply: FastifyReply
) {
    const trace_id = generateCustomUUID();
    const jobRepository = new JobRepository();

    try {
        const { program_id } = request.params;
        const user = request?.user;
        const userId = user?.sub;
        const userType = user?.userType;
        const {
            job_id,
            name,
            template_name = [],
            first_name = [],
            hierarchy_ids = [],
            hierarchies = [],
            user_hierarhy_ids = [],
            status,
            exclude_status,
            min_bill_rate,
            max_bill_rate,
            no_positions,
            primary_hierarchy = [],
            job_submitted_candidate,
            start_date,
            end_date,
            estimated_budget,
            is_shift_rate,
            unit_of_measure,
            page,
            limit,
            created_on,
            search
        } = request.body;

        // Pagination settings
        const pageNumber = parseInt(page ?? "1", 10);
        const limitNumber = parseInt(limit ?? "10", 10);
        const offset = (pageNumber - 1) * limitNumber;
        const hasJobSubmittedCandidate =
            request.body.hasOwnProperty('job_submitted_candidate') &&
            request.body.job_submitted_candidate !== null &&
            request.body.job_submitted_candidate !== undefined;

        const hasIsShiftRate =
            request.body.hasOwnProperty('is_shift_rate') &&
            request.body.is_shift_rate !== null &&
            request.body.is_shift_rate !== undefined;
        let data;

        if (userType === "super_user") {
            // Super User logic
            data = await jobRepository.jobAdvancedFilter(
                !!job_id,
                !!name,
                Array.isArray(template_name) && template_name.length > 0,
                Array.isArray(first_name) && first_name.length > 0,
                hasJobSubmittedCandidate,
                Array.isArray(status) && status.length > 0,
                Array.isArray(exclude_status) && exclude_status.length > 0,
                !!min_bill_rate,
                !!max_bill_rate,
                !!no_positions,
                Array.isArray(primary_hierarchy) && primary_hierarchy.length > 0,
                !!start_date,
                !!end_date,
                !!estimated_budget,
                hasIsShiftRate,
                !!unit_of_measure,
                false, // hasVendor
                hierarchy_ids,
                hierarchies,
                false, // hierarchyIdsArray
                user_hierarhy_ids,
                program_id,
                job_id,
                name,
                template_name,
                first_name,
                status,
                exclude_status,
                min_bill_rate,
                max_bill_rate,
                no_positions,
                primary_hierarchy,
                job_submitted_candidate,
                start_date,
                end_date,
                estimated_budget,
                is_shift_rate,
                unit_of_measure,
                limitNumber,
                offset,
                !!created_on,
                created_on,
                undefined, // vendor_id
                null, // user_id
                undefined,
                search,
                false,
            );
        } else {
            const userData = await jobRepository.findUser(program_id, userId);
            if (!userData || userData.length === 0) {
                return reply.status(404).send({
                    message: "User not found for the given program ID.",
                    trace_id,
                });
            }

            const user_type = userData[0]?.user_type?.toUpperCase();
            const tenantId = userData[0]?.tenant_id;
            let vendor_id;

            if (user_type === "VENDOR") {
                const vendor = await jobRepository.findVendor(program_id, tenantId);
                vendor_id = vendor?.[0]?.id;
            }

            if (user_type === "CLIENT" || user_type === "MSP") {
                const user_hierarhy_ids = userData[0]?.associate_hierarchy_ids ?? [];
                const isAllHierarchy = userData[0]?.is_all_hierarchy_associate;
                const tenantId = userData[0]?.tenant_id;

                const isMsp = user_type === "MSP";

                data = await jobRepository.jobAdvancedFilter(
                    !!job_id,
                    !!name,
                    Array.isArray(template_name) && template_name.length > 0,
                    Array.isArray(first_name) && first_name.length > 0,
                    hasJobSubmittedCandidate,
                    Array.isArray(status) && status.length > 0,
                    Array.isArray(exclude_status) && exclude_status.length > 0,
                    !!min_bill_rate,
                    !!max_bill_rate,
                    !!no_positions,
                    Array.isArray(primary_hierarchy) && primary_hierarchy.length > 0,
                    !!start_date,
                    !!end_date,
                    !!estimated_budget,
                    hasIsShiftRate,
                    !!unit_of_measure,
                    false,
                    hierarchy_ids,
                    hierarchies,
                    isAllHierarchy,
                    user_hierarhy_ids,
                    program_id,
                    job_id,
                    name,
                    template_name,
                    first_name,
                    status,
                    exclude_status,
                    min_bill_rate,
                    max_bill_rate,
                    no_positions,
                    primary_hierarchy,
                    job_submitted_candidate,
                    start_date,
                    end_date,
                    estimated_budget,
                    is_shift_rate,
                    unit_of_measure,
                    limitNumber,
                    offset,
                    !!created_on,
                    created_on,
                    undefined,
                    userId,
                    user_type,
                    search,
                    isMsp,
                );
            }
            else if (user_type === "VENDOR") {
                data = await jobRepository.jobAdvancedFilter(
                    !!job_id,
                    !!name,
                    Array.isArray(template_name) && template_name.length > 0,
                    Array.isArray(first_name) && first_name.length > 0,
                    hasJobSubmittedCandidate,
                    Array.isArray(status) && status.length > 0,
                    Array.isArray(exclude_status) && exclude_status.length > 0,
                    !!min_bill_rate,
                    !!max_bill_rate,
                    !!no_positions,
                    Array.isArray(primary_hierarchy) && primary_hierarchy.length > 0,
                    !!start_date,
                    !!end_date,
                    !!estimated_budget,
                    hasIsShiftRate,
                    !!unit_of_measure,
                    true,
                    hierarchy_ids,
                    hierarchies,
                    false,
                    user_hierarhy_ids,
                    program_id,
                    job_id,
                    name,
                    template_name,
                    first_name,
                    status,
                    exclude_status,
                    min_bill_rate,
                    max_bill_rate,
                    no_positions,
                    primary_hierarchy,
                    job_submitted_candidate,
                    start_date,
                    end_date,
                    estimated_budget,
                    is_shift_rate,
                    unit_of_measure,
                    limitNumber,
                    offset,
                    !!created_on,
                    created_on,
                    vendor_id,
                    "",
                    user_type,
                    search,
                    false,
                );
            }
        }
        if (data && Array.isArray(data)) {
            await Promise.all(
                data.map(async (job) => {
                    const jobId = job.id;

                    const [customFieldResults] = await sequelize.query(
                        getCustomsField(jobId, 'job_custom_fields', 'job_id', 'custom_field_id'),
                        {
                            replacements: { id: jobId }
                        }
                    ) as any;

                    let customFields = [];

                    if (customFieldResults?.[0]?.custom_fields) {
                        customFields = customFieldResults[0].custom_fields
                            .map((field: any) => ({
                                ...field,
                                value: parseValue(field.value),
                            }))
                            .filter((field: any) => {
                                if (userType?.toLowerCase() === 'vendor') {
                                    const canView = Array.isArray(field.can_view) &&
                                        field.can_view.map((val: string) => val.toLowerCase()).includes('vendor');
                                    const canEdit = Array.isArray(field.can_edit) &&
                                        field.can_edit.map((val: string) => val.toLowerCase()).includes('vendor');
                                    return canView || canEdit;
                                }
                                return true;
                            });
                    }

                    job.custom_fields = customFields;
                })
            );
        }
        if (data && data.length > 0) {
            const totalRecords = data.length > 0 ? data[0].totalRecords : 0;
            return reply.status(200).send({
                status_code: 200,
                total_records: totalRecords,
                items: data,
                trace_id,
                pagination: {
                    page: pageNumber,
                    limit: limitNumber,
                    total_pages: Math.ceil(totalRecords / limitNumber),
                },
            });
        } else {
            return reply.status(200).send({
                message: "No records found",
                items: [],
                trace_id,
            });
        }
    } catch (error: any) {
        return reply.status(500).send({
            message: "Internal Server Error",
            trace_id,
            error: error.message,
        });
    }
}

export const updateJobStatusNew = async (
    request: FastifyRequest,
    reply: FastifyReply
) => {
    const { program_id, id } = request.params as { program_id: string, id: string };
    const { status } = request.body as { status: string };
    const traceId = generateCustomUUID();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ message: 'Unauthorized - Token not found' });
    }
    const token = authHeader.split(' ')[1];
    const user = request?.user;
    const userId = user?.sub;

    logger({
        trace_id: traceId,
        eventname: "updateJobStatus",
        status: "info",
        description: `Request received to update job status for ID: ${id}`,
        data: { program_id, id, status },
        action: request.method,
        url: request.url,
    });

    try {
        const job: any = await sequelize.query(
            `SELECT
                 jb.id, jb.status, jb.program_id, jb.hierarchy_ids, jb.labor_category_id,
                 jb.allow_per_identified_s, jc.vendor,
                 jt.is_automatic_distribution,
                 jt.is_distribute_final_approval,
                 jt.is_tiered_distribute_submit,
                 jt.submission_limit_vendor,
                 jt.labour_category,
                 jt.distribution_schedule
                 FROM jobs jb
                 LEFT JOIN ${config_db}.job_templates jt ON jb.job_template_id = jt.id
                 LEFT JOIN job_candidate jc ON jb.id = jc.job_id
                 WHERE jb.program_id = :program_id
                 AND jb.id = :id
                `,
            {
                replacements: { program_id, id },
                type: QueryTypes.SELECT,
            }
        );

        const jobData = job?.[0];
        const matchedVendors = await getVendorDistributionScheduleByIds({
            hierarchy_ids: jobData.hierarchy_ids,
            labor_category_id: jobData.labor_category_id,
            program_id
        });

        const isAutoDistribute = jobData.is_automatic_distribution && jobData.is_distribute_final_approval;
        const isTiered = jobData.is_tiered_distribute_submit && jobData.is_distribute_final_approval;

        const normalizedStatus = status?.toLowerCase();
        const shouldSetSourcing = matchedVendors?.length > 0 && isAutoDistribute && ["open", "sourcing"].includes(normalizedStatus);
        const newStatus = shouldSetSourcing ? "SOURCING" : status;

        const [updatedCount] = await JobModel.update(
            { status: newStatus },
            { where: { program_id, id } }
        );
        if (updatedCount > 0) {
            const updatedFields = {
                status: {
                    newValue: status,
                    oldValue: jobData.status,
                },
            };
            const compareMetaData = buildMinimalChanges(updatedFields);

            (async () => {
                try {
                    await createJobHistoryRecord(
                        { id, program_id },
                        { status },
                        userId,
                        null,
                        "Job Status Update",
                        compareMetaData
                    );
                } catch (error) {
                    console.error("Async history log failed:", error);
                }
            })();
        }

        if (["open", "sourcing"].includes(normalizedStatus)) {
            let jobTemplate = {
                submission_limit_vendor: jobData.submission_limit_vendor,
                labour_category: jobData.labour_category,
                distribution_schedule: jobData.distribution_schedule
            }
            jobData.status = newStatus
            if (!jobData.allow_per_identified_s && isAutoDistribute) {
                distributeAutomatically({ jobTemplate, job: jobData, program_id, userId })
                jobDistributionNotificationService.distributeAutomaticallyNotification({ user, job: job[0], program_id, traceId, token, sequelize, reply, sendNotification, jobTemplate });
            }
            else if (jobData.allow_per_identified_s && isAutoDistribute) {
                distributeJob({ vendor: jobData.vendor }, program_id, jobData.id, userId, 1, "SOURCING");
            }
            else if (!jobData.allow_per_identified_s && isTiered) {
                tieredDistributeSchedule({ jobTemplate, job: jobData, program_id, userId, status: "SOURCING" })
            }
        }

        if (updatedCount > 0) {
            logger({
                trace_id: traceId,
                eventname: "updateJobStatus",
                status: "success",
                description: `Job status updated successfully for ID: ${id}`,
                data: { program_id, id, status },
                action: request.method,
                url: request.url,
            });

            return reply.send({
                status_code: 200,
                message: 'Job status updated successfully.',
                id: id,
                trace_id: traceId,
            });

        } else {
            logger({
                trace_id: traceId,
                eventname: "updateJobStatus",
                status: "warning",
                description: `Job with ID: ${id} not found or status unchanged.`,
                data: { program_id, id },
                action: request.method,
                url: request.url,
            });

            return reply.status(404).send({
                status_code: 404,
                message: 'Job not found or status unchanged.',
            });
        }
    } catch (error: any) {
        logger({
            trace_id: traceId,
            eventname: "updateJobStatus",
            status: "error",
            description: `Error updating job status for ID: ${id}`,
            data: { program_id, id, status },
            action: request.method,
            url: request.url,
            error: error.message,
        });

        return reply.status(500).send({
            message: 'Internal Server Error',
            trace_id: traceId,
            error: error.message,
        });
    }
};

export const updateJobClosedStatus = async (
    request: FastifyRequest,
    reply: FastifyReply
) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ message: 'Unauthorized - Token not found' });
    }
    const token = authHeader.split(' ')[1];
    const { program_id, id } = request.params as { program_id: string; id: string };
    const { closed_note, closed_reason } = request.body as {
        closed_note: string;
        closed_reason: string;
    };
    const user = request?.user;
    const userId = user?.sub;
    const traceId = generateCustomUUID();

    logger({
        trace_id: traceId,
        eventname: "closed job",
        status: "info",
        description: `Request received to update job status for ID: ${id}`,
        data: { program_id, id },
        action: request.method,
        url: request.url,
    });

    try {
        const job = await JobModel.findOne({
            where: { program_id, id },
        });
        if (!job) {
            logger({
                trace_id: traceId,
                eventname: "closed job",
                status: "warning",
                description: `Job with ID: ${id} not found.`,
                data: { program_id, id },
                action: request.method,
                url: request.url,
            });

            return reply.status(404).send({
                status_code: 404,
                message: "Job not found",
            });
        }
        const currentStatus = job.status;
        const [updatedCount] = await JobModel.update(
            {
                status: 'CLOSED',
                closed_note,
                closed_reason,
                closed_at: new Date(),
            },
            { where: { program_id, id } }
        );
        if (updatedCount > 0) {
            logger({
                trace_id: traceId,
                eventname: "closed job",
                status: "success",
                description: `Job status updated successfully for ID: ${id}`,
                data: { program_id, id },
                action: request.method,
                url: request.url,
            });



            const currentStatus = job?.status;
            const currentClosedNote = job?.dataValues?.closed_note;
            const currentClosedReason = job?.dataValues?.closed_reason;

            const updatedFields = {
                status: {
                    newValue: "CLOSED",
                    oldValue: currentStatus
                },
                closed_note: {
                    newValue: closed_note || "",
                    oldValue: currentClosedNote
                },
                closed_reason: {
                    newValue: closed_reason || "",
                    oldValue: currentClosedReason
                }
            };
            const compareMetaData = buildMinimalChanges(updatedFields);

            try {
                await createJobHistoryRecord(
                    { id, program_id },
                    {
                        status: "CLOSED",
                        closed_note,
                        closed_reason
                    },
                    user?.sub ?? "",
                    null,
                    "Job Closed", // changed
                    compareMetaData
                );

                const dynamicEventCodeCallback = (userEmail: any): string => {

                    if (userEmail.userType === "vendor") {
                        return "JOB_CLOSED_VENDOR";
                    }

                    return "JOB_CLOSED_MSP";
                };

                jobNotificationService.sendDynamicJobNotification(
                    token,
                    sequelize,
                    user,
                    program_id,
                    job,
                    job.dataValues,
                    traceId,
                    dynamicEventCodeCallback
                );
            } catch (error) {
                console.error("Error in updatedJobClosedStatus history:", error);
            }

            return reply.send({
                status_code: 200,
                message: "Job closed successfully.",
                id,
                trace_id: traceId,
            });
        } else {
            logger({
                trace_id: traceId,
                eventname: "closed job",
                status: "warning",
                description: `Job with ID: ${id} not found or status unchanged.`,
                data: { program_id, id },
                action: request.method,
                url: request.url,
            });

            return reply.status(400).send({
                status_code: 400,
                message: "Job not found",
            });
        }
    } catch (error: any) {
        logger({
            trace_id: traceId,
            eventname: "closed job",
            status: "error",
            description: `Error updating job status for ID: ${id}`,
            data: { program_id, id },
            action: request.method,
            url: request.url,
            error: error.message,
        });

        return reply.status(500).send({
            message: "Internal Server Error",
            trace_id: traceId,
            error: error.message,
        });
    }
};

export async function updateJobStatusIfFilled(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const traceId = generateCustomUUID();
    const user = request?.user;
    const userId = user?.sub;
    try {
        const { program_id, id } = request.params as { program_id: string; id: string };
        const { assignment_count } = request.body as { assignment_count: number };
        const jobData = await JobModel.findOne({ where: { program_id, id } });
        if (!jobData) {
            return reply.status(404).send({
                status_code: 404,
                message: 'Job not found.',
                trace_id: traceId,
                data: [],
            });
        }
        const currentStatus = jobData.status;
        if (assignment_count === jobData.no_positions) {
            const transaction = await sequelize.transaction();
            try {
                await JobModel.update(
                    { status: "FILLED", updated_by: userId, updated_on: new Date() },
                    { where: { program_id, id }, transaction }
                );

                await JobDistributionModel.update(
                    { status: "cancelled", updated_by: userId, updated_on: new Date() },
                    { where: { program_id, job_id: id, status: "scheduled" }, transaction }
                );

                await transaction.commit();

                const updatedFields = {
                    status: {
                        newValue: "FILLED",
                        oldValue: currentStatus
                    }
                };

                const compareMetaData = buildMinimalChanges(updatedFields);

                createJobHistoryRecord(
                    { id, program_id },
                    { status: "FILLED" },
                    userId ?? "",
                    null,
                    "Job Filled",
                    compareMetaData
                ).catch(err => {
                    console.error("Error logging job history:", err);
                });

                return reply.status(200).send({
                    status_code: 200,
                    message: "Job status updated to FILLED.",
                    data: id,
                    trace_id: traceId,
                });

            } catch (updateError) {
                await transaction.rollback();
                throw updateError;
            }
        } else {
            return reply.status(200).send({
                status_code: 200,
                message: 'Assignment count does not match the number of positions.',
                data: id,
                trace_id: traceId,
            });
        }
    } catch (error: any) {
        return reply.status(500).send({
            status_code: 500,
            message: 'Internal Server Error',
            trace_id: traceId,
            error: error.message,
        });
    }
}
