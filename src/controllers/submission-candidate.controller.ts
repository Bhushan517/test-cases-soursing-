import { FastifyRequest, FastifyReply } from 'fastify';
import submissionCandidateModel from '../models/submission-candidate.model';
import { CandidateBudget, ChecklistAndData, SubmissionCandidateInterface, SubmissionCandidateCustomFieldInterface, FundingModelParams, SubmissionCandidateQualificationsInterface } from '../interfaces/submission-candidate.interface';
import generateCustomUUID from '../utility/genrateTraceId';
import { QueryTypes, Transaction } from 'sequelize';
import SubmissionCandidateCustomfieldsModel from '../models/submission-candidate-customfields.model';
import { sequelize } from '../config/instance';
import { ApprovalworkflowQuery, jobWorkflowQuery } from '../utility/queries';
import generatedCandidateSubmissionCode from '../plugins/submission-candidate-code';
import JobModel from '../models/job.model';
import { sendNotificationsForUserType, configBaseUrl, getJobIdsForUserType } from './job.controller';
import { credentialingService } from '../external-services/credentialing-service';
import SubmissionCandidateRepository from '../repositories/submission-candidate.repository';
import { decodeToken } from '../middlewares/verifyToken';
import { sendNotification } from '../utility/notificationService';
import { EmailRecipient } from '../interfaces/email-recipient';
import { NotificationDataPayload } from '../interfaces/noifications-data-payload.interface';
import { getUsersWithHierarchy, getProgramType, getJobManagerEmail, notifyJobManager, fetchUsersBasedOnHierarchy, getJobDetails, getCandidateBySubmissionID, getSubmissionData, getJobData, getJobCreator, determineUserType, fetchUserDetils } from '../utility/notification-helper'; // Adjust the path accordingly
import { SUBMISSION_CREATION, PRE_ONBOARDING, getMillisecondsFromDays, getChecklistTaskMappings, getBaseTriggersStepCounts, getSubsequentTrigger } from '../utility/onboarding-util';
import { databaseConfig } from '../config/db';
import JobRepository from "../repositories/job.repository";
import OfferModel from '../models/offer.model';
import { NotificationEventCode } from "../utility/notification-event-code";
import { TenantConstant } from "../utility/tenant-constant";
import { getCandidateDetails } from '../utility/notification-helper-interview';
import SubmissionCandidateQualifications from '../models/submission-candidate-qualifications.model';
import { fetchWorkflow, getPendingWorkflow, getUsersStatus, getWorkflowData, updateExternalWorkflow, updateWorkflowLevels, workflowTriggering } from '../utility/job_workflow';
import JobDistributionRepository from "../repositories/job-distridution.repository";
const jobDistributionRepository = new JobDistributionRepository();
import GlobalRepository from "../repositories/global.repository";
import { FeeConfig, MarkupDataInterface } from '../interfaces/job.interface';
import { handleShortlistWorkflowUpdate } from '../utility/submission_shortlist_workflow';
import JobDistributionModel from '../models/job-distribution.model';
import { createMtp, getSubmissionCandidateScoringDetails } from '../utility/create-mtp'
import { SubmissionCandidateService } from '../services/submission-candidate.service';
import Reply from '../utility/response.utility';
import Messages from '../language/en/messages.language';
export function uiBaseUrl(): string | undefined {
    return process.env.UI_BASE_URL ?? 'https://dev-hiring.simplifysandbox.net';
}
import { getWorkerAssignmentCount } from '../utility/worker_assignment_count';
import { Status } from "../utility/enum/status_enum";
import { CandidateHistoryService } from '../utility/candidate_history_helper';
let ui_base_url = databaseConfig.config.ui_base_url;
const jobRepository = new JobRepository();
const config_db = databaseConfig.config.database_config;
const submissionRepo = new SubmissionCandidateRepository();
const candidateHistoryService = new CandidateHistoryService(sequelize);
const submissionCandidateService = new SubmissionCandidateService();

interface HierarchyRecord {
    rate_model: string;
    markups: any;
}
interface Candidate {
    _id?: string;
    id?: string;
    [key: string]: any;
}
let config_base_url = configBaseUrl();
let rootTenantId = databaseConfig.config.root_tenant_id;

export const createSubmissionCandidate = async (
    request: FastifyRequest<{ Params: { program_id: string } }>,
    reply: FastifyReply
) => {
    const traceId = generateCustomUUID();

    try {
        const { token, user, userId, userType } = await authenticateRequest(request, reply);

        const { program_id } = request.params;
        const requestBody = request.body as SubmissionCandidateInterface & {
            custom_fields?: SubmissionCandidateCustomFieldInterface[];
            qualifications?: SubmissionCandidateQualificationsInterface[];
            checklist_data?: ChecklistAndData;
        };
        requestBody.checklist_data = request.body as ChecklistAndData;
        let job_id = requestBody.job_id;
        let job = await JobModel.findOne({
            where: { id: requestBody.job_id },
            attributes: ['id', 'status', 'job_id', 'hierarchy_ids', 'job_template_id', 'labor_category_id', 'start_date', 'end_date']
        });

        const query = `SELECT * FROM jobs WHERE id = :jobId LIMIT 1;`;
        const jobRequest: any = await sequelize.query(query, {
            type: QueryTypes.SELECT,
            replacements: { jobId: requestBody.job_id },
        });
        const jobDatas = jobRequest[0];

        const transaction = await sequelize.transaction({
            isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
        });

        try {
            const holdStatuses = ["HOLD", "HALTED", "PENDING_REVIEW", "DRAFT", "FILLED", "CLOSED", "PENDING_APPROVAL", "REJECTED", "HALT"];

            if (holdStatuses.includes(job?.status)) {
                await transaction.rollback();
                return reply.status(400).send({
                    status_code: 400,
                    message: `Job is ${job?.status},cannot submit candidate.`,
                    trace_id: traceId,
                });
            }

            const jobDistributionRecord = await JobDistributionModel.findOne({
                where: {
                    job_id: requestBody.job_id,
                    vendor_id: requestBody.vendor_id,
                },
                transaction
            });

            if (holdStatuses.includes(jobDistributionRecord?.status?.toUpperCase())) {
                await transaction.rollback();
                return reply.status(400).send({
                    status_code: 400,
                    message: `Job distribution is ${jobDistributionRecord?.status}, cannot submit candidate.`,
                    trace_id: traceId,
                });
            }
            let existingCandidate: any = null;
            if (!requestBody.id) {
                console.log('Checking for existing candidate...');
                existingCandidate = await submissionCandidateModel.findOne({
                    where: {
                        job_id: requestBody.job_id,
                        candidate_id: requestBody.candidate_id
                    }, transaction
                });

                if (existingCandidate) {
                    await transaction.rollback();
                    return reply.status(400).send({
                        status_code: 400,
                        trace_id: traceId,
                        message: "This candidate has already been submitted.",
                    });
                }
            }
            const userData = await jobDistributionRepository.findProgramVendorUser(program_id, userId);
            let vendor_id = userData.length ? (userData[0] as { program_vendor_id: string })?.program_vendor_id : null;
            console.log("vendor_id", vendor_id);

            const submissionDataQuery = `
            SELECT
                jd.submission_limit,
                (SELECT COUNT(*)
                FROM submission_candidate sc
                WHERE sc.program_id = jd.program_id
                AND sc.vendor_id = jd.vendor_id
                AND sc.job_id = jd.job_id
                AND sc.status <> "Withdrawn"
                AND sc.is_deleted = false) AS submission_count
            FROM job_distributions jd
            WHERE jd.program_id = :program_id
            AND jd.vendor_id = :vendor_id
            AND jd.job_id = :job_id
            LIMIT 1
            `;

            const submissionDataResult: any = await sequelize.query(submissionDataQuery, {
                type: QueryTypes.SELECT,
                replacements: { program_id, vendor_id, job_id },
            });

            const submissionLimit = submissionDataResult[0]?.submission_limit;
            const submissionCount = submissionDataResult[0]?.submission_count ?? 0;

            if (submissionLimit !== undefined && submissionCount >= submissionLimit) {
                await transaction.rollback();
                return reply.status(400).send({
                    status_code: 400,
                    message: `Submission limit reached for this vendor. Cannot submit more candidates.`,
                    trace_id: traceId,
                });
            }

            const unique_id = await generatedCandidateSubmissionCode(program_id);

            const jobStartDate = new Date(job?.start_date);
            const jobEndDate = new Date(job?.end_date);
            const availableStartDate = new Date(requestBody.available_start_date);
            const jobWorkingDays = calculateWorkingDaysBetween(jobStartDate, jobEndDate);
            const availableEndDate = addWorkingDays(availableStartDate, jobWorkingDays);
            const formattedAvailableEndDate = availableEndDate.toISOString().split('T')[0];

            const candidateData = {
                ...requestBody,
                program_id,
                unique_id,
                available_end_date: formattedAvailableEndDate
            };

            const [createdCandidate] = await submissionCandidateModel.upsert({
                ...candidateData,
                created_by: userId,
                updated_by: userId,
                created_on: Date.now()
            }, { transaction });

            const oldData = { candidate_id: candidateData.candidate_id };
            const newData = createdCandidate.dataValues
            await candidateHistoryService.handleCandidateHistory({ program_id, oldData, newData, action: 'candidate submitted' });
            const programId = program_id;
            const mtpCandidateId = createdCandidate.candidate_id;
            const jobId = createdCandidate?.job_id

            let jobDetails = await submissionRepo.getSubmissionCandidateDetails(programId, jobId);
            const candidates = jobDetails.map((item: { candidate_id: any; }) => item.candidate_id);
            const candidateIds = [...candidates, mtpCandidateId].flat()

            createMasterTalentProfile(programId, mtpCandidateId, token, userId, candidateIds, jobDetails);
            await Promise.all([
                SubmissionCandidateCustomfieldsModel.destroy({
                    where: { submission_candidate_id: createdCandidate.id },
                    transaction
                }),
                SubmissionCandidateQualifications.destroy({
                    where: { submission_candidate_id: createdCandidate.id },
                    transaction
                })
            ]);

            const candidatesPromises = (requestBody.custom_fields ?? []).map(customField =>
                SubmissionCandidateCustomfieldsModel.create({
                    custom_field_id: customField.id,
                    value: customField.value,
                    program_id,
                    job_id: createdCandidate.job_id,
                    candidate_id: createdCandidate.candidate_id,
                    submission_candidate_id: createdCandidate.id,
                    created_by: userId,
                    updated_by: userId,
                }, { transaction })
            );

            const qualificationPromises = (requestBody.qualifications ?? []).map(customField =>
                SubmissionCandidateQualifications.create({
                    qualification_type_id: customField.qualification_type_id,
                    qualifications: customField.qualifications,
                    program_id,
                    job_id: createdCandidate.job_id,
                    candidate_id: createdCandidate.candidate_id,
                    submission_candidate_id: createdCandidate.id,
                    created_by: userId,
                    updated_by: userId,
                }, { transaction })
            );

            try {
                await Promise.all([...candidatesPromises, ...qualificationPromises]);
            } catch (error) {
                console.error('Error in Promise.all:', error);
                await transaction.rollback();
                throw error;
            }

            let onboarding_flow_response: {
                onboardingFlowId: string,
                checklist_entity_id: string,
                checklist_version: number
            } | undefined;

            if (requestBody.checklist_data) {
                console.log('Processing the onboarding workflow...');
                const job_job_id = job?.job_id;
                onboarding_flow_response = await processOnboardingFlow(
                    requestBody.checklist_data,
                    createdCandidate.id,
                    createdCandidate.unique_id,
                    requestBody,
                    userId,
                    {
                        id: jobDatas.id,
                        job_id: job_job_id,
                        job_template_id: jobDatas.job_template_id,
                        hierarchy_ids: jobDatas?.hierarchy_ids || []
                    },
                    program_id,
                    request,
                    reply
                ) as {
                    onboardingFlowId: string,
                    checklist_entity_id: string,
                    checklist_version: number
                } | undefined;
            }

            if (onboarding_flow_response) {
                console.log('Updating the onboarding workflow...');
                createdCandidate.onboarding_flow_id = onboarding_flow_response.onboardingFlowId;
                createdCandidate.checklist_entity_id = onboarding_flow_response.checklist_entity_id;
                createdCandidate.checklist_version = onboarding_flow_response.checklist_version;

                await submissionCandidateModel.update(
                    { ...createdCandidate.dataValues },
                    { where: { id: createdCandidate.id }, transaction }
                );
            }

            console.log('All processes completed.');
            await transaction.commit();
            reply.status(201).send({
                status_code: 201,
                trace_id: traceId,
                id: createdCandidate.id,
                message: "Candidate submitted successfully.",
            });

            const eventSlugShortlist = "submit_candidate_shortlist";
            const eventSlugRehireCheck = "submit_candidate_rehire_check";
            let event_slug = "";
            const moduleName = "Submissions";
            const type = "workflow";
            const placementOrder = "0";
            let is_updated = false;
            let moduleId: any;

            if (moduleName) {
                const query = `SELECT id FROM ${config_db}.module WHERE name = :moduleName AND is_workflow = true LIMIT 1;`;
                let moduleIds = await sequelize.query(query, { type: QueryTypes.SELECT, replacements: { moduleName } });
                moduleId = moduleIds[0];
            }

            const moduleIds = moduleId?.id || "";
            let eventIdShortlist: any, eventIdRehireCheck: any;
            if (moduleIds) {
                const query = `SELECT id FROM ${config_db}.event WHERE module_id = :moduleIds AND slug = :eventSlugShortlist AND is_enabled = true AND type = :type LIMIT 1;`;
                const eventIdShortlistData = await sequelize.query(query, {
                    type: QueryTypes.SELECT,
                    replacements: { moduleIds, eventSlugShortlist, type },
                });
                eventIdShortlist = eventIdShortlistData[0];

                const query1 = `SELECT id FROM ${config_db}.event WHERE module_id = :moduleIds AND slug = :eventSlugRehireCheck AND is_enabled = true AND type = :type LIMIT 1;`;
                const eventIdRehireCheckData = await sequelize.query(query1, {
                    type: QueryTypes.SELECT,
                    replacements: { moduleIds, eventSlugRehireCheck, type },
                });
                eventIdRehireCheck = eventIdRehireCheckData[0];
            }

            const workflow_job_id = requestBody.job_id;
            const jobData: any = {
                ...requestBody,
                job_template_id: job?.dataValues.job_template_id,
                labor_category_id: job?.dataValues.labor_category_id
            };
            jobData.userId = userId;
            jobData.userType = userType;
            jobData.worker_classification = requestBody.worker_classification
            jobData.vendor_bill_rate = requestBody.financial_detail?.rates[0]?.rate_configuration[0]?.vendor_bill_rate
            const moduleIdValue = moduleIds;
            const eventIdShortlistValue = eventIdShortlist?.id || "";
            const eventIdRehireCheckValue = eventIdRehireCheck?.id || "";
            let shouldTriggerRehire = true
            let rows: any[] = [];
            if (jobDatas && jobDatas.hierarchy_ids) {
                const workflowQuery2 = jobWorkflowQuery(jobDatas.hierarchy_ids);
                shouldTriggerRehire = requestBody.is_candidate_work_before === true || requestBody.do_not_rehire === true;

                let rowsRehireCheckWithSlug: any = [];
                if (shouldTriggerRehire) {
                    const rowsRehireCheck = await sequelize.query(workflowQuery2, {
                        replacements: {
                            module_id: moduleIdValue,
                            event_id: eventIdRehireCheckValue,
                            program_id,
                            placement_order: placementOrder,
                        },
                        type: QueryTypes.SELECT,
                    });
                    rowsRehireCheckWithSlug = rowsRehireCheck.map((row: any) => ({
                        ...row,
                        event_slug: eventSlugRehireCheck,
                    }));
                    rows = [...rows, ...rowsRehireCheckWithSlug];
                }

                if (rowsRehireCheckWithSlug.length === 0) {
                    const rowsShortlist = await sequelize.query(workflowQuery2, {
                        replacements: {
                            module_id: moduleIdValue,
                            event_id: eventIdShortlistValue,
                            program_id,
                            placement_order: placementOrder,
                        },
                        type: QueryTypes.SELECT,
                    });
                    const rowsShortlistWithSlug = rowsShortlist.map((row: any) => ({
                        ...row,
                        event_slug: eventSlugShortlist,
                    }));
                    rows = [...rowsShortlistWithSlug];
                }
            }
            job = {
                event_title: job?.dataValues.job_id,
                job_id: requestBody.job_id,
                id: createdCandidate.id,
            } as any;

            let workflow = await workflowTriggering(
                request,
                reply,
                program_id,
                rows,
                job,
                jobData,
                jobDatas,
                moduleName,
                is_updated,
                workflow_job_id,
                event_slug
            );
            if (!workflow) {
                const workflowCheck = async (eventId: string, queryFunc: (hierarchyIds: any) => string) => {
                    const query = queryFunc(jobDatas.hierarchy_ids);
                    const rows = await sequelize.query(query, {
                        replacements: {
                            module_id: moduleIdValue,
                            event_id: eventId,
                            program_id,
                            placement_order: placementOrder,
                        },
                        type: QueryTypes.SELECT,
                    });
                    console.log(`Rows for event ID ${eventId}:`, rows);

                    return await workflowTriggering(
                        request,
                        reply,
                        program_id,
                        rows,
                        job,
                        jobData,
                        jobDatas,
                        moduleName,
                        is_updated,
                        workflow_job_id,
                        event_slug
                    );
                };

                let rehireWorkflow: any
                if (shouldTriggerRehire) {
                    rehireWorkflow = await workflowCheck(eventIdRehireCheckValue, ApprovalworkflowQuery);
                }

                let status = "shortlisted";

                if (rehireWorkflow && rehireWorkflow.workflow_status !== "completed") {
                    status = "PENDING_REHIRE_APPROVAL";
                } else {
                    const shortlistWorkflow = await workflowCheck(eventIdShortlistValue, jobWorkflowQuery);
                    if (shortlistWorkflow) {
                        if (shortlistWorkflow.workflow_status !== "completed") {
                            status = "PENDING_SHORTLIST_REVIEW";
                        } else {
                            status = "shortlisted";
                        }
                    }
                }

                await submissionCandidateModel.update(
                    { status },
                    { where: { candidate_id: createdCandidate.candidate_id, job_id: createdCandidate.job_id } }
                );

                console.log(`Final status is ${status}`);

            } else {
                updateCandidateStatus(requestBody, rows);
            }

            (async () => {
                console.log('Inside Notification');
                handleSubmissionNotification(
                    sequelize,
                    user,
                    program_id,
                    jobDatas,
                    requestBody,
                    unique_id,
                    traceId,
                    token,
                    sendNotification
                );
            })();



        } catch (error: any) {
            console.error('Error in processing:', error);
            await transaction.rollback();
            throw error;
        }

    } catch (error: any) {
        reply.status(500).send({
            status_code: 500,
            message: "An error occurred while creating the submission candidate.",
            trace_id: traceId,
            error: error.message
        });
    }
};

function calculateWorkingDaysBetween(startDate: Date, endDate: Date): number {
    let totalWorkingDays = 0;
    for (let currentDate = new Date(startDate); currentDate <= endDate; currentDate.setDate(currentDate.getDate() + 1)) {
        const day = currentDate.getDay();
        if (day !== 0 && day !== 6) {
            totalWorkingDays++;
        }
    }
    return totalWorkingDays;
}

function addWorkingDays(startDate: Date, workingDaysToAdd: number): Date {
    const result = new Date(startDate);
    let addedDays = 1;
    let isFirstDay = true;

    while (addedDays < workingDaysToAdd) {
        if (isFirstDay) {
            isFirstDay = false;
        } else {
            result.setDate(result.getDate() + 1);
            const day = result.getDay();
            if (day !== 0 && day !== 6) {
                addedDays++;
            }
        }

        if (isFirstDay) {
            continue;
        }
    }

    return result;
}

function createMasterTalentProfile(programId: any, mtpCandidateId: any, authHeader: string, userId: any, candidateIds: any, jobDetails: any) {
    const jobDiscription = jobDetails?.[0]?.job_description;
    const jobTitle = jobDetails?.[0]?.job_title;

    createMtp(programId, mtpCandidateId, authHeader, userId);
    getSubmissionCandidateScoringDetails(jobDiscription, candidateIds, authHeader, jobTitle);

}

async function authenticateRequest(request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        reply.status(401).send({ message: 'Unauthorized - Token not found' });
        throw new Error('Authentication failed');
    }

    const token = authHeader.split(' ')[1];
    const user = await decodeToken(token);
    const userId = user?.sub;
    const userType = user?.userType;
    if (!user) {
        reply.status(401).send({ message: 'Unauthorized - Invalid token' });
        throw new Error('Invalid token');
    }

    return { authHeader, token, user, userId, userType };
}
async function processOnboardingFlow(checklistAndData: ChecklistAndData, submission_id: string, submission_code: string, candidate: SubmissionCandidateInterface, userId: string | undefined, job: { id: string, job_id: string, job_template_id: string, hierarchy_ids: string[] }, program_id: string, request: FastifyRequest, reply: FastifyReply) {
    if (checklistAndData && checklistAndData.checklist) {
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
            replacements: { vendor_id: candidate.vendor_id },
            type: QueryTypes.SELECT
        });

        const triggers: string[] = [SUBMISSION_CREATION, ...getSubsequentTrigger(SUBMISSION_CREATION)];

        let checklistTaskMappings = await getChecklistTaskMappings({ checklist_version_id: checklistAndData.checklist?.version_id, triggers });

        const triggerStepCounts = checklistTaskMappings.reduce((acc: Record<string, number>, ctm: any) => {
            acc[`${ctm.trigger}_steps_count`]++;
            return acc;
        }, getBaseTriggersStepCounts(triggers));

        const onboardingFlowPayload = {
            workflow: {
                description: checklistAndData.checklist.description || "Default Workflow Description",
                status: "Active",
                associations: {
                    usage: "onboarding",
                    job_template_id: jobTemplate.id,
                    job_template_code: jobTemplate.job_id,
                    job_id: job.id ?? null,
                    job_code: job.job_id ?? null,
                    submission_id: submission_id,
                    submission_code: submission_code,
                    candidate_id: candidate.candidate_id,
                    vendor_id: vendor.tenant_id
                },
                attributes: {
                    pre_onboarding_status: "Not Started",
                    post_onboarding_status: "Not Started",
                    offboarding_status: "Not Started",
                    ...triggerStepCounts
                },
                hierarchy_ids: job.hierarchy_ids || [],
                tenant_id: program_id,
                is_enabled: true,
                is_deleted: false,
            },
            steps: [] as any,
        };

        checklistTaskMappings = checklistTaskMappings.filter((mapping: any) => mapping.trigger == SUBMISSION_CREATION);

        if (checklistAndData.checklist_mappings_and_data && checklistAndData.checklist_mappings_and_data.length != 0) {
            onboardingFlowPayload.steps = await Promise.all(
                checklistAndData.checklist_mappings_and_data.map(async (mappingAndData, index) => {
                    const taskData = mappingAndData.task_data;
                    const task = mappingAndData.task;
                    const mapping = checklistTaskMappings.find(mapping => mapping.id === mappingAndData.mapping.id)!;

                    if (mapping.is_mandatory && !taskData) {
                        throw new Error("Please provide task-data for mandatory tasks");
                    }

                    return {
                        category_id: mapping.category_id,
                        task_entity_id: task.entity_id,
                        task_version_id: task.version_id,
                        task_version: task.version,
                        task_data: taskData ?? null,
                        status: taskData ? "Pending Review" : "Pending Upload",
                        seq_no: index + 1,
                        is_mandatory: mapping.is_mandatory,
                        has_dependency: mapping.has_dependency,
                        dependency_task_entity_id: mapping.dependency_task_entity_id ?? null,
                        dependency_category_id: mapping.dependency_category_id ?? null,
                        meta_data: {
                            reviewer: {
                                role_id: mapping.reviewer_role_id ?? null,
                                role_name: mapping.reviewer_role_name ?? null,
                                org_type: mapping.reviewer_org_type ?? null,
                            },
                            actor: {
                                role_id: mapping.actor_role_id ?? null,
                                role_name: mapping.actor_role_name ?? null,
                                org_type: mapping.actor_org_type ?? null,
                            },
                            start_date_rule: mapping.start_date ? {
                                days: mapping.start_date.days ?? null,
                                case: mapping.start_date.case ?? null,
                                event: mapping.start_date.event ?? null,
                            } : {},
                            start_date: getMillisecondsFromDays(mapping?.start_date?.days),
                            due_date_rule: mapping.due_date ? {
                                days: mapping.due_date.days ?? null,
                                case: mapping.due_date.case ?? null,
                                event: mapping.due_date.event ?? null,
                            } : {},
                            due_date: getMillisecondsFromDays(mapping?.due_date?.days),
                        },
                        associations: {
                            usage: "onboarding",
                            trigger: SUBMISSION_CREATION,
                            onboarding_category: PRE_ONBOARDING,
                            job_template_id: jobTemplate.id,
                            job_template_code: jobTemplate.job_id,
                            job_id: job.id ?? null,
                            job_code: job.job_id ?? null,
                            submission_id: submission_id,
                            submission_code: submission_code,
                            candidate_id: candidate.candidate_id,
                            vendor_id: vendor.tenant_id
                        },
                        hierarchy_ids: job.hierarchy_ids ?? [],
                        submitter_user_id: userId,
                        submitter_user_mapping_id: taskData?.submitter_user_mapping_id ?? null,
                        submitter_tenant_id: taskData?.submitter_tenant_id ?? null,
                        subject_user_id: candidate.candidate_id,
                        subject_user_mapping_id: taskData?.subject_user_mapping_id,
                        submitted_to_user_id: taskData?.submitted_to_user_id ?? null,
                        submitted_to_user_mapping_id: taskData?.submitted_to_user_mapping_id ?? null,
                        submitted_to_tenant_id: program_id,
                        is_submitted_to_tenant: true,
                        tenant_id: program_id,
                        created_by: userId,
                        updated_by: userId,
                        is_enabled: true,
                        is_deleted: false,
                    };
                })
            );
        }

        const onboardingFlowResponse = await credentialingService.createWorkflow(
            onboardingFlowPayload,
            program_id,
            request.headers?.authorization!
        );

        const onboardingFlowId = onboardingFlowResponse?.data?.workflow?.id;

        if (onboardingFlowId) {
            return { onboardingFlowId, checklist_entity_id: checklistAndData.checklist.entity_id, checklist_version: checklistAndData.checklist.version };
        } else {
            console.log(`Error while creating onboarding flow- ${onboardingFlowId}`);
            throw new Error("Failed to create onboarding flow");
        }
    }
}

const updateCandidateStatus = async (candidate: any, rows: any) => {
    try {
        if (rows.length > 0) {
            const hasReviewFlow = rows.some((row: any) => row.flow_type.trim() === 'Review');
            const hasRehireEvent = rows.some((row: any) => row.event_slug?.trim() === 'submit_candidate_rehire_check');
            const hasShortlistEvent = rows.some((row: any) => row.event_slug?.trim() === 'submit_candidate_shortlist');

            if (hasReviewFlow && hasRehireEvent) {
                candidate.status = "PENDING_REHIRE_REVIEW";
            } else if (hasReviewFlow && hasShortlistEvent) {
                candidate.status = "PENDING_SHORTLIST_REVIEW";
            } else if (hasRehireEvent) {
                candidate.status = "PENDING_REHIRE_APPROVAL";
            } else {
                candidate.status = "shortlisted";
            }

            const updated = await submissionCandidateModel.update(
                { status: candidate.status },
                { where: { candidate_id: candidate.candidate_id, job_id: candidate?.job_id } }
            );
        }
    } catch (error) {
        console.error("Error updating candidate status:", error);
    }
};

export const updateWorkflowReview = async (
    request: FastifyRequest<{
        Params: { program_id: string; id: string };
        Body: Partial<SubmissionCandidateInterface>;
    }>,
    reply: FastifyReply
) => {
    const { program_id, id, job_workflow_id } = request.params as { program_id: string, id: string, job_workflow_id: string };
    const traceId = generateCustomUUID();
    const authHeader = request.headers.authorization;
    console.log('program_id:', program_id);
    console.log(' job id:', id)
    console.log('job_workflow_id:', job_workflow_id)
    if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ message: 'Unauthorized - Token not found' });
    }
    const token = authHeader.split(' ')[1];

    const user = await decodeToken(token);
    const userId: any = user?.sub;
    const userType: any = user.userType

    if (!user) {
        return reply.status(401).send({ message: 'Unauthorized - Invalid token' });
    }
    const updateData = request.body;
    const transaction = await sequelize.transaction();
    try {
        const userResult = await getUsersStatus(sequelize, userId);
        let userData = userResult[0] as any
        const submissionCandidate: any = await submissionCandidateModel.findOne({ where: { id, program_id } });
        const candidateDatas = submissionCandidate?.dataValues
        if (!submissionCandidate) {
            return reply.status(404).send({
                status_code: 404,
                message: 'Submission candidate locum not found',
                trace_id: traceId,
            });
        }

        const query = `SELECT * FROM jobs WHERE id = :jobId LIMIT 1;`;
        const jobRequest: any = await sequelize.query(query, {
            type: QueryTypes.SELECT,
            replacements: { jobId: updateData?.updates.job_id },
        });
        const jobDatas = jobRequest[0];

        let result
        const updates = updateData.updates; // Single object
        if (updates) {
            const query = `
            SELECT *
            FROM ${config_db}.workflow
            WHERE id = :job_workflow_id
            AND program_id = :program_id
            LIMIT 1;
        `;
            console.log(query);

            const workflowData = await sequelize.query(query, {
                type: QueryTypes.SELECT,
                replacements: {
                    job_workflow_id, program_id,
                },
            });
            const isSuperUser = user?.userType === "super_user";

            let workflow: any = workflowData[0];
            const jobData = await JobModel.findOne({ where: { id: updateData.updates.job_id, program_id: program_id } });


            if (!workflow) {
                return reply.status(404).send({
                    status_code: 404,
                    message: "Workflow data not found!",
                    trace_id: traceId,
                });
            }
            let impersonator_id: any
            if (user.impersonator) {
                impersonator_id = user.impersonator.id || null
            }
            let levels = workflow.levels || [];
            const updatedLevels = await updateWorkflowLevels(
                workflow,
                updates,
                userData,
                impersonator_id,
                isSuperUser,
                sequelize
            );
            let allLevelsAfterFirstCompleted = true;
            let workflowStatus = "completed";

            for (const level of levels) {
                if (level.status === "pending") {
                    allLevelsAfterFirstCompleted = false;
                    break;
                }
            }


            workflowStatus = allLevelsAfterFirstCompleted ? "completed" : "pending";
            workflow.status = workflowStatus;
            console.log("workflowStatus", workflowStatus);

            if (updatedLevels) {
                const workflow_update = await updateExternalWorkflow(
                    workflow,
                    workflowStatus,
                    program_id,
                    job_workflow_id,
                    authHeader
                );
                console.log('workflow_update', workflow_update);
            }

            let allPayload = {
                program_id: program_id,
                hierarchy_ids: jobData?.dataValues.hierarchy_ids,
                user_type: ['msp']
            }
            const candidateData = await getCandidateBySubmissionID(id);
            console.log('candidateData', candidateData)
            const submissionData = await getSubmissionData(sequelize, job_workflow_id)
            console.log('submissionData', submissionData)
            const jobID = await getJobData(sequelize, submissionData[0]?.job_id)

            const payload: any = {

                job_id: jobID?.[0]?.job_id || "NA",
                candidate_first_name: candidateData?.first_name || "NA",
                candidate_last_name: candidateData?.last_name || "NA",
                submission_id: submissionData?.[0]?.unique_key || "NA",
                created_by_first_name: submissionData?.[0]?.first_name || "NA",
                created_by_last_name: submissionData?.[0]?.last_name || "NA"

            };
            const handleWorkflowCompletion = async (workflow: any, request: FastifyRequest, reply: FastifyReply, submissionCandidate: any, sequelize: any, program_id: string, user: any, traceId: string, token: string) => {
                let result: any;
                if (workflow.events === "submit_candidate_shortlist") {
                    console.log('Updating the status:')
                    // result = await updateJobStatusForSubmissionWorkflow(request, reply, submissionCandidate, sequelize);
                    const eventCode = "CANDIDATE_SHORTLIST"
                    sendNotificationsForUserType(request, reply, program_id, jobData?.dataValues.job_manager_id, eventCode, payload, allPayload, updates)
                } else if (workflow.events === "submit_candidate_rehire_check") {

                    const oldData = {
                        program_id,
                        candidate_id: submissionCandidate.dataValues.candidate_id,
                        vendor_id: submissionCandidate.dataValues.vendor_id,
                        status: submissionCandidate.dataValues.status,
                        job_id: submissionCandidate?.dataValues.job_id,
                        updated_by: userId
                    };

                    const newData = {
                        program_id,
                        candidate_id: submissionCandidate.dataValues.candidate_id,
                        vendor_id: submissionCandidate.dataValues.vendor_id,
                        status: "reviewed",
                        job_id: submissionCandidate?.dataValues.job_id,
                        updated_by: userId
                    };

                    await candidateHistoryService.handleCandidateHistory({ program_id, oldData, newData, action: "Candidate Re-Hire Check Review" });

                    // result = await updateJobStatusForSubmissionWorkflow(request, reply, submissionCandidate, sequelize);
                    const eventCode = "REHIRE_REVIEW_COMPLETE"
                    sendNotificationsForUserType(request, reply, program_id, jobData?.dataValues.job_manager_id, eventCode, payload, allPayload, updates)
                }
                return result;
            };


            let [job] = await sequelize.query(`
                     SELECT id, status, job_id, hierarchy_ids, job_template_id, labor_category_id
                      FROM jobs
                      WHERE id = :job_id
                         LIMIT 1;
            `, {
                replacements: { job_id: updateData?.updates.job_id },
                type: QueryTypes.SELECT,
            }) as any;

            job = {
                event_title: job?.job_id,
                job_id: updateData?.updates.job_id,
                job_template_id: job?.job_template_id,
                labor_category_id: job?.labor_category_id,
                worker_classification: submissionCandidate?.worker_classification,
                id: submissionCandidate.id,
            } as any;
            const candidateDatas = {
                ...submissionCandidate?.dataValues,
                job_template_id: job?.job_template_id,
                labor_category_id: job?.labor_category_id,
                worker_classification: submissionCandidate?.worker_classification,
                vendor_bill_rate: submissionCandidate.financial_detail?.rates[0]?.rate_configuration[0]?.vendor_bill_rate
            }
            if (updates) {
                const workflow = await fetchWorkflow(sequelize, program_id, job_workflow_id);
                if (!workflow) {
                    return reply.status(404).send({
                        status_code: 404,
                        message: "Workflow data not found!",
                        trace_id: traceId,
                    });
                }

                const event = await fetchEvent(sequelize, workflow?.event_id)
                if (!event) {
                    return reply.status(404).send({
                        status_code: 404,
                        message: "event data not found!",
                        trace_id: traceId,
                    });
                }

                const ShortlistSlug = event?.slug

                const impersonator_id = user.impersonator?.id || null;

                if (updatedLevels) {
                    if (ShortlistSlug !== "submit_candidate_shortlist" && workflowStatus === "completed") {
                        const requestBody = updateData?.updates;
                        const eventSlugRehireCheck = "submit_candidate_rehire_check";
                        const moduleName = "Submissions";
                        const type = "workflow";
                        const placementOrder = "0";
                        const approval_method = "approval";
                        let moduleId: any;

                        if (moduleName) {
                            const query = `
                                            SELECT id FROM ${config_db}.module
                                             WHERE name = :moduleName AND is_workflow = true
                                             LIMIT 1;
                                                `;
                            const moduleIds = await sequelize.query(query, {
                                type: QueryTypes.SELECT,
                                replacements: { moduleName },
                            });
                            moduleId = moduleIds[0];
                        }

                        const moduleIds = moduleId?.id || "";
                        let eventIdRehireCheck: any;

                        if (moduleIds) {
                            const query1 = `
                                                SELECT id, slug FROM ${config_db}.event
                                                WHERE module_id = :moduleIds AND slug = :eventSlugRehireCheck
                                                AND is_enabled = true AND type = :type
                                                LIMIT 1;
                                               `;
                            const eventIdRehireCheckData = await sequelize.query(query1, {
                                type: QueryTypes.SELECT,
                                replacements: { moduleIds, eventSlugRehireCheck, type },
                            });
                            eventIdRehireCheck = eventIdRehireCheckData[0];
                        }

                        const workflow_job_id = updateData?.updates?.job_id;
                        const jobData = updateData?.updates;
                        jobData.userId = userId;
                        jobData.userType = userType;
                        jobData.job_template_id = job?.job_template_id
                        jobData.labor_category_id = job?.labor_category_id
                        jobData.worker_classification = submissionCandidate?.worker_classification
                        jobData.vendor_bill_rate = submissionCandidate?.financial_detail?.rates[0]?.rate_configuration[0]?.vendor_bill_rate

                        const moduleIdValue = moduleIds;
                        const eventIdRehireCheckValue = eventIdRehireCheck?.id || "";

                        const workflow: any = await getPendingWorkflow(
                            updateData,
                            moduleIdValue,
                            eventIdRehireCheckValue,
                            program_id,
                            placementOrder,
                            approval_method
                        );

                        const hasEmptyLevels = workflow?.rows.some((row: any) =>
                            !row.levels ||
                            row?.levels?.length === 0 ||
                            row.levels?.every(
                                (level: any) =>
                                    !level?.recipient_types || level?.recipient_types?.length === 0
                            )
                        );

                        if (!hasEmptyLevels) {
                            const workflow_slug = eventSlugRehireCheck;
                            const jobs = await workflowTriggering(
                                request,
                                reply,
                                program_id,
                                workflow?.rows,
                                job,
                                jobData,
                                jobDatas,
                                moduleName,
                                false,
                                updateData?.updates?.job_id,
                                workflow_slug
                            );

                            if (jobs) {
                                await submissionCandidate.update({ status: "PENDING_REHIRE_APPROVAL" });
                            } else {
                                const updates = updateData?.updates
                                const update = { updates, userData, user }
                                const workflowDatas = await handleShortlistWorkflowUpdate(
                                    sequelize, program_id, job_workflow_id, update, submissionCandidate, id, traceId, isSuperUser, userId, userType,
                                    authHeader, request, reply, job, candidateDatas, jobDatas, token,
                                );
                            }
                        }
                    }
                }

                if (ShortlistSlug === "submit_candidate_shortlist" && workflowStatus === "completed") {
                    const oldData = {
                        program_id,
                        candidate_id: submissionCandidate.dataValues.candidate_id,
                        status: submissionCandidate.dataValues.status,
                        job_id: submissionCandidate?.dataValues.job_id,
                        updated_by: userId
                    };

                    await submissionCandidate.update({ status: "shortlisted" });
                    const newData = {
                        program_id,
                        candidate_id: submissionCandidate.dataValues.candidate_id,
                        status: "shortlisted",
                        job_id: submissionCandidate?.dataValues.job_id,
                        updated_by: userId
                    };
                    await candidateHistoryService.handleCandidateHistory({ program_id, oldData, newData, action: "Candidate Shortlisted" });

                }
                result = await handleWorkflowCompletion(
                    workflow,
                    request,
                    reply,
                    submissionCandidate,
                    sequelize,
                    program_id,
                    user,
                    traceId,
                    token
                );

            }
        }

        await submissionCandidate.update({ ...updateData, status: result?.status, updated_on: Date.now() });
        await transaction.commit();

        reply.status(200).send({
            status_code: 200,
            message: 'Submission candidate updated successfully',
            trace_id: traceId,
        });
    } catch (error: any) {
        await transaction.rollback();
        reply.status(500).send({
            status_code: 500,
            message: 'Failed to update submission candidate',
            trace_id: traceId,
            error: error.message
        });
    }
};

export const fetchEvent = async (sequelize: any, event_id: string) => {
    console.log("event_id", event_id);

    const query = `
        SELECT  slug
        FROM ${config_db}.event
        WHERE id = :event_id
        LIMIT 1;
    `;

    const eventData = await sequelize.query(query, {
        type: QueryTypes.SELECT,
        replacements: { event_id },
    });
    return eventData[0];
};
export async function updateJobStatusForSubmissionWorkflow(request: FastifyRequest, reply: FastifyReply, submissionCandidate: any, sequelize: any) {
    try {
        const workflowQuery = `
            SELECT id, workflow_trigger_id, flow_type,events,levels,status
            FROM ${config_db}.workflow
            WHERE workflow_trigger_id = :workflow_trigger_id
            AND is_updated=false
             AND is_deleted=false
             AND is_enabled=true
        `;

        const workflows = await sequelize.query(workflowQuery, {
            type: QueryTypes.SELECT,
            replacements: { workflow_trigger_id: submissionCandidate.id },
        });
        console.log('WOrkflows ', workflows)

        let updatedStatus = null;
        if (workflows.length === 0) {
            updatedStatus = "shortlisted"
            await submissionCandidate.update({ status: "shortlisted" });
        } else {
            for (const workflow of workflows) {
                if (workflow.flow_type?.toLowerCase() == "review" && workflow.events === 'submit_candidate_shortlist' && workflow.status == "pending") {
                    const levels = workflow.levels || []; // Ensure levels exist


                    const hasNonEmptyRecipients = levels
                        .slice(1)
                        .every((level: any) => {
                            return level.recipient_types && level.recipient_types.length > 0;
                        });
                    console.log('hasNonEmptyRecipients', hasNonEmptyRecipients)
                    if (!hasNonEmptyRecipients) {
                        await submissionCandidate.update({ status: "shortlisted" });
                        updatedStatus = "shortlisted";
                        break;
                    } else {
                        console.log('else executed:')
                        await submissionCandidate.update({ status: "PENDING_SHORTLIST_REVIEW" });
                    }


                    updatedStatus = "PENDING_SHORTLIST_REVIEW";
                    break;
                } else
                    if (workflow.flow_type?.toLowerCase() == "approval" && workflow.events === 'submit_candidate_rehire_check' && workflow.status == "pending") { // Replace 'some_other_event' with the actual event name
                        const levels = workflow.levels || []; // Ensure levels exist
                        const hasNonEmptyRecipients = levels
                            .slice(1)
                            .every((level: any) => {

                                return level.recipient_types && level.recipient_types.length > 0;
                            });
                        if (!hasNonEmptyRecipients) {
                            await submissionCandidate.update({ status: "shortlisted" });
                            updatedStatus = "shortlisted";
                            break;
                        }

                        updatedStatus = "PENDING_REHIRE_APPROVAL"
                        await submissionCandidate.update({ status: "PENDING_REHIRE_APPROVAL" });
                    } else {
                        updatedStatus = "shortlisted"
                        await submissionCandidate.update({ status: "shortlisted" });
                    }
            }
        }

        if (updatedStatus) {
            return {
                status: updatedStatus,
                updated: true,
            };
        }

        return {
            message: 'No updates were made as the flow_type is not Approval',
            updated: false,
        };
    } catch (error) {
        console.error('Error updating job status:', error);
        return { message: 'Error updating job status', error, updated: false };
    }
}
export const getAllSubmissionCandidate = async (
    request: FastifyRequest<{
        Querystring: {
            job_id?: string;
            job_ids?: string[];
            search?: string;
            employment_status?: string;
            updated_on?: any;
            worker_type_id?: string;
            unique_id?: string;
            page?: string;
            limit?: string;
            available_start_date?: string;
            preferred_location?: string;
            status?: string | string[];
            first_name?: string;
            job_title?: string;
            job_code?: string;
            created_on?: any;
        };
        Params: {
            program_id: string;
        };
    }>,
    reply: FastifyReply
) => {
    const response = new Reply('submission_candidate');
    const traceId = generateCustomUUID();
    const { program_id } = request.params;
    const user = request?.user;
    const userId: any = user?.sub;
    const userData = await jobRepository.findUser(program_id, userId);
    const userType = user.userType ?? userData[0]?.user_type;
    const tenantId = userData[0]?.tenant_id;

    try {
        const serviceResult = await submissionCandidateService.getAllSubmissionCandidates(request, user, userId, userType, tenantId);
        response.statusCode = 200;
        response.message = Messages.SUBMISSION_CANDIDATE_FETCHED_SUCCESSFULLY;
        response.setMainData(serviceResult.formattedCandidates);
        response.total_records = serviceResult.totalRecords;
        response.current_page = serviceResult.page;
        response.page_size = serviceResult.limit;
        response.total_pages = serviceResult.totalPages;
        response.items_per_page = serviceResult.itemsPerPage;
        response.traceId = traceId;

        return response.sendResponse(reply);
    } catch (error: any) {
        console.error(`trace_id: ${traceId}, Error:`, error);
        response.statusCode = 500;
        response.message = Messages.SUBMISSION_CANDIDATE_FETCH_FAILED;
        response.error = (error.message || error).replace('Error: ', '');
        response.traceId = traceId;
        return response.sendResponse(reply);
    }
}

export async function getOfferActionFlags(candidateData: any) {
    const actionFlags: Record<string, boolean> = {
        schedule_interview: false,
        resubmit_candidate: false,
        withdraw_candidate: false,
        create_offer: false,
        reject_candidate: false,
        shortlist: false,
        reject: false,
        approve: false,
        review: false
    };

    const ut = candidateData.userType?.trim().toLowerCase();
    const isSuperUser = ut === "super_user";
    const isClient = ut === "client";
    const isMSP = ut === "msp";
    const isVendor = ut === "vendor";
    const isClientOrMSP = isClient || isMSP;

    const jobData = await jobRepository.findJobById(candidateData.jobId);
    const isPendingApprovalSourcing = (jobData as any)?.status?.toUpperCase() === 'PENDING_APPROVAL_SOURCING';

    const { status } = candidateData;

    const applyCommonFlags = () => {
        switch (status) {
            case Status.PENDING_REHIRE_REVIEW:
                if (isClientOrMSP || isSuperUser) {
                    actionFlags.review = true;
                    actionFlags.reject = true;
                }
                break;

            case Status.PENDING_REHIRE_APPROVAL:
                if (isClientOrMSP || isSuperUser) {
                    actionFlags.approve = true;
                    actionFlags.reject = true;
                }
                break;

            case Status.PENDING_SHORTLIST_REVIEW:
                if (isClientOrMSP || isSuperUser) {
                    actionFlags.shortlist = true;
                    actionFlags.reject = true;
                }
                if (isVendor || isSuperUser) {
                    actionFlags.withdraw_candidate = true;
                }
                break;

            case Status.REJECTED:
            case Status.WITHDRAW:
                if (isVendor || isSuperUser) {
                    actionFlags.resubmit_candidate = true;
                }
                break;

            case Status.SUBMITTED:
            case Status.SHORTLISTED:
                if (!isPendingApprovalSourcing && (isClientOrMSP || isSuperUser)) {
                    actionFlags.schedule_interview = true;
                    actionFlags.create_offer = true;
                }
                if (isClientOrMSP || isSuperUser) {
                    actionFlags.reject_candidate = true;
                }
                if (isVendor || isSuperUser) {
                    actionFlags.withdraw_candidate = true;
                }
                break;

            default:
                break;
        }
    };

    applyCommonFlags();
    return actionFlags;
}


export const getSubmissionCandidateById = async (
    request: FastifyRequest<{ Params: { program_id: string; id: string } }>,
    reply: FastifyReply
) => {
    const traceId = generateCustomUUID();
    const { program_id, id } = request.params;

    try {
        const replacements: any = {
            program_id,
            id,
        };
        const candidates = await submissionRepo.submiteCandidatesGetById(replacements);
        if (!candidates.length) {
            return reply.status(200).send({
                status_code: 200,
                trace_id: traceId,
                message: 'Submission candidate not found',
                submission_candidate: [],
            });
        }
        const candidate = candidates[0];
        const formattedCandidate = {
            id: candidate.id,
            program_id: candidate.program_id,
            job_id: {
                id: candidate.job_id,
                job_name: candidate.job_template_name,
            },
            unique_id: candidate.unique_id,
            candidate_id: candidate.candidate_id,
            worker_classification: candidate.worker_classification,
            first_name: candidate.first_name,
            last_name: candidate.last_name,
            middle_name: candidate.middle_name,
            worker_type_id: candidate.worker_type_id,
            vendor_id: candidate.vendor_id,
            tenant_id: candidate.tenant_id,
            worker_email: candidate.email,
            resume_url: candidate.resume_url,
            available_start_date: candidate.available_start_date,
            available_end_date: candidate.available_end_date,
            is_candidate_work_before: !!candidate.is_candidate_work_before,
            is_remote_worker: !!candidate.is_remote_worker,
            candidate_source: candidate.candidate_source,
            avatar: candidate.avatar,
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
            created_on: candidate.created_on,
            updated_on: candidate.updated_on,
            is_deleted: !!candidate.is_deleted,
            is_enabled: !!candidate.is_enabled,
            custom_fields: candidate.custom_fields,
        };

        return reply.status(200).send({
            status_code: 200,
            trace_id: traceId,
            message: 'Submission candidate retrieved successfully',
            submission_candidate: formattedCandidate,
        });
    } catch (error: any) {
        return reply.status(500).send({
            status_code: 500,
            message: 'Internal Server Error',
            trace_id: traceId,
            error: error.message,
        });
    }
};
export async function updateSubmissionStatus(request: FastifyRequest, reply: FastifyReply) {
    const traceId = generateCustomUUID();
    const { program_id, id } = request.params as { program_id: string; id: string };
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ message: 'Unauthorized - Token not found' });
    }

    const token = authHeader.split(' ')[1];
    const user = await decodeToken(token);
    const userId: any = user?.sub;
    const userType: any = user.userType;
    const isSuperUser = user?.userType === "super_user";

    if (!user) {
        return reply.status(401).send({ message: 'Unauthorized - Invalid token' });
    }

    const update = request.body as any;
    const workflowID = update?.workflowID;

    try {
        const currentJob = await submissionCandidateModel.findOne({
            where: { program_id, id },
            attributes: ["id", "status", "candidate_id", 'updated_by'],
        }) as any;

        let [job] = await sequelize.query(`
            SELECT id, status, job_id, hierarchy_ids, job_template_id, labor_category_id
            FROM jobs
            WHERE id = :job_id
            LIMIT 1;
        `, {
            replacements: { job_id: update?.updates[0].job_id },
            type: QueryTypes.SELECT,
        }) as any;

        job = {
            event_title: job?.job_id,
            job_id: update?.updates[0].job_id,
            job_template_id: job?.job_template_id,
            labor_category_id: job?.labor_category_id,
            id: currentJob.id,
        } as any;

        const candidateDatas = {
            ...currentJob?.dataValues,
            job_template_id: job?.job_template_id,
            labor_category_id: job?.labor_category_id,
            worker_classification: currentJob?.worker_classification
        }

        const jobRequest: any = await sequelize.query(
            `SELECT * FROM jobs WHERE id = :jobId LIMIT 1;`,
            {
                type: QueryTypes.SELECT,
                replacements: { jobId: update?.updates[0].job_id },
            }
        );
        const jobDatas = jobRequest[0];

        const jobData = await JobModel.findOne({
            where: { id: update.updates[0].job_id, program_id: program_id },
        });

        const allPayload = {
            program_id: program_id,
            hierarchy_ids: jobData?.dataValues.hierarchy_ids,
            user_type: ['msp'],
        };

        const candidateData = await getCandidateBySubmissionID(id);
        const submissionData = await getSubmissionData(sequelize, workflowID);
        const jobID = await getJobData(sequelize, submissionData[0]?.job_id);

        const payload: any = {
            job_id: jobID?.[0]?.job_id || "NA",
            candidate_first_name: candidateData?.first_name ?? "NA",
            candidate_last_name: candidateData?.last_name ?? "NA",
            submission_id: submissionData?.[0]?.unique_key || "NA",
            created_by_first_name: submissionData?.[0]?.first_name || "NA",
            created_by_last_name: submissionData?.[0]?.last_name || "NA",
        };

        const handleWorkflowCompletion = async (
            workflow: any,
            request: FastifyRequest,
            reply: FastifyReply,
            currentJob: any,
            sequelize: any,
            program_id: string,
            user: any,
            traceId: string,
            token: string
        ) => {
            let result: any;
            if (workflow.events === "submit_candidate_shortlist") {
                const eventCode = "CANDIDATE_SHORTLIST";
                await sendNotificationsForUserType(
                    request, reply, program_id, jobData?.dataValues.job_manager_id,
                    eventCode, payload, allPayload, update?.updates[0]
                );
            } else if (workflow.events === "submit_candidate_rehire_check") {
                const eventCode = "REHIRE_REVIEW_COMPLETE";
                await sendNotificationsForUserType(
                    request, reply, program_id, jobData?.dataValues.job_manager_id,
                    eventCode, payload, allPayload, update?.updates[0]
                );
            }
            return result;
        };

        const workflow = await fetchWorkflow(sequelize, program_id, workflowID);


        const workflowDatas = await handleShortlistWorkflowUpdate(
            sequelize, program_id, workflowID, update, currentJob, id, traceId, isSuperUser, userId, userType,
            authHeader, request, reply, job, candidateDatas, jobDatas, token,
        );

        await handleWorkflowCompletion(
            workflow,
            request,
            reply,
            currentJob,
            sequelize,
            program_id,
            update?.user,
            traceId,
            token
        );
    } catch (error) {
        console.error(error);
        reply.status(500).send({ status_code: 500, message: 'Internal Server Error' });
    }
}
export const updateSubmissionCandidate = async (
    request: FastifyRequest<{
        Params: { program_id: string; id: string };
        Body: Partial<SubmissionCandidateInterface>;
    }>,
    reply: FastifyReply
) => {
    const traceId = generateCustomUUID();
    const { program_id, id } = request.params;
    const updateData = request.body as any;
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ status_code: 401, message: 'Unauthorized - Token not found' });
    }
    const token = authHeader.split(' ')[1];
    let user: any = await decodeToken(token);
    if (!user) {
        return reply.status(401).send({ status_code: 401, message: 'Unauthorized - Invalid token' });
    }
    const userId = user?.sub
    try {
        const candidate = await submissionCandidateModel.findOne({ where: { id, program_id } });

        if (!candidate) {
            return reply.status(404).send({
                status_code: 404,
                message: 'Submission candidate locum not found',
                trace_id: traceId,
            });
        }

        if (updateData.status?.toUpperCase() == "WITHDRAWN") {
            const offer = await OfferModel.findAll({ where: { submission_id: id, program_id, status: "Accepted" } })
            if (offer.length > 0) {
                reply.status(400).send({
                    status_code: 400,
                    message: "The candidate can't be withdrawn because an offer has been created for them.",
                    trace_id: traceId,
                });
            }
        }


        const oldData = {
            status: candidate?.dataValues?.status,
            reason: candidate?.dataValues?.reason,
            notes: candidate?.dataValues?.notes,
            candidate_id: candidate?.dataValues?.candidate_id,
            job_id: candidate?.dataValues.job_id,
            updated_by: candidate?.dataValues?.updated_by
        };


        const updates = Array.isArray(updateData.update) ? updateData.update[0] : null;

        await candidate.update({ ...updateData, updated_on: Date.now(), updated_by: userId });
        const newData = {
            status: candidate?.dataValues?.status,
            reason: updateData?.update?.[0]?.reason ?? updateData?.reason,
            notes: candidate?.dataValues?.notes,
            candidate_id: candidate?.dataValues?.candidate_id,
            job_id: candidate?.dataValues.job_id,
            updated_by: candidate?.dataValues?.updated_by
        };

        const oldStatus = oldData.status?.toLowerCase();
        const newStatus = newData.status?.toLowerCase();
        let action = "Candidate Updated";
        if (oldStatus === "withdrawn" && newStatus === "submitted") {
            action = "Candidate Re-Submitted";
        } else if (oldStatus !== "withdrawn" && newStatus === "withdrawn") {
            action = "Candidate Withdrawn";
        } else if (newStatus === "rejected") {
            action = "Candidate Rejected";
        }
        await candidateHistoryService.handleCandidateHistory({ program_id, oldData, newData, action });

        if (updateData.status?.toUpperCase() == "REJECTED") {
            const query = `SELECT * FROM jobs WHERE id = :jobId LIMIT 1;`;
            const jobRequest: any = await sequelize.query(query, {
                type: QueryTypes.SELECT,
                replacements: { jobId: updates?.job_id },
            });

            let jobDatas = jobRequest[0];
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
            let payload: any;
            if (userType.user_type.toLowerCase() === "client" || userType.user_type.toLowerCase() === "msp") {
                if (updates?.job_id) {
                    const JobData = await getJobData(sequelize, updates?.job_id)
                    const jobCreator = await getJobCreator(updates?.job_id)
                    payload = {
                        ...payload,
                        job_id: JobData?.[0]?.job_id || "NA",
                        job_url: jobDatas?.dataValues?.id && jobDatas?.dataValues?.job_template_id
                            ? `${ui_base_url}/jobs/job/view/${jobDatas.dataValues.id}/${jobDatas.dataValues.job_template_id}?detail=job-details`
                            : '',
                        job_title: JobData?.[0]?.job_name || "NA",
                        created_by_first_name: jobCreator?.[0]?.first_name || "NA",
                        created_by_last_name: jobCreator?.[0]?.last_name || "NA",
                    }
                }
                if (candidate?.dataValues?.candidate_id) {
                    const candidateData = await getCandidateDetails(candidate?.dataValues?.candidate_id);
                    payload = {
                        ...payload,
                        candidate_first_name: candidateData?.first_name || "NA",
                        candidate_last_name: candidateData?.last_name || "NA",
                    }
                }
                if (updates?.reason) {
                    payload = {
                        ...payload,
                        reject_reason: updates.reason
                    }
                }
                if (candidate?.dataValues?.unique_id) {
                    payload = {
                        ...payload,
                        submission_id: candidate.dataValues.unique_id
                    }
                }
                console.log("payload  - - -", payload);
            }
            if (userType.user_type.toLowerCase() === "client") {
                let eventCode = "SUBMISSION_REJECT_CANDIDATE_CLIENT";
                (async () => {
                    if (user?.userType) {
                        console.log("Inside super user....")
                        return;
                    }
                    console.log("outside super user...");
                    try {

                        const managerData = await getJobManagerEmail(sequelize, jobDatas.job_manager_id);
                        let allPayload = {
                            program_id: program_id,
                            hierarchy_ids: jobDatas.hierarchy_ids,
                            user_type: ['msp', 'vendor'],
                            user_id: user?.sub

                        }
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

            } else if (userType.user_type.toLowerCase() === "msp") {
                let eventCode = "SUBMISSION_REJECT_CANDIDATE_MSP";
                (async () => {
                    if (user?.userType) {
                        console.log("Inside super user....")
                        return;
                    }
                    console.log("outside super user...");
                    try {

                        const managerData = await getJobManagerEmail(sequelize, jobDatas.job_manager_id);
                        let allPayload = {
                            program_id: program_id,
                            hierarchy_ids: jobDatas.hierarchy_ids,
                            user_type: ['vendor'],
                            user_id: user?.sub

                        }
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
                            role: user?.user_type
                        };

                        await notifyJobManager(sendNotification, notificationPayload, recipientEmailList);
                    } catch (notificationError) {
                        console.error("Error in notification logic:", notificationError);
                    }
                })();

            }


        }
        reply.status(200).send({
            status_code: 200,
            message: 'Submission candidate updated successfully',
            trace_id: traceId,
        });
    } catch (error) {
        console.log('error is:', error)
        reply.status(500).send({
            status_code: 500,
            message: 'Failed to update submission candidate',
            trace_id: traceId,
        });
    }
};

export async function deleteSubmissionCandidate(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const traceId = generateCustomUUID();
    const user = request?.user;
    const userId = user?.sub

    try {
        const { program_id, id } = request.params as { program_id: string, id: string };
        const candidateLocum = await submissionCandidateModel.findOne({ where: { program_id, id } });

        if (candidateLocum) {
            await submissionCandidateModel.update({ is_deleted: true, is_enabled: false, updated_by: userId }, { where: { program_id, id } });

            reply.status(204).send({
                status_code: 204,
                message: 'Submission candidate deleted successfully',
                trace_id: traceId,
            });
        } else {
            reply.status(404).send({
                status_code: 404,
                message: 'Submission candidate not found',
                trace_id: traceId,
            });
        }
    } catch (error) {
        reply.status(500).send({
            status_code: 500,
            message: 'Failed to delete submission candidate',
            trace_id: traceId,
            error,
        });
    }
};
interface Hierarchy {
    id: string;
    parent_hierarchy_id: string | null;
    rate_model: string | null;
};

const getHierarchyPath = async (hierarchyId: string): Promise<Hierarchy[]> => {
    const path: Hierarchy[] = [];
    let currentHierarchy: Hierarchy | null = await sequelize.query(
        `SELECT * FROM ${config_db}.hierarchies WHERE id = ?`, {
        replacements: [hierarchyId],
        type: QueryTypes.SELECT
    }).then(result => result[0] as Hierarchy);

    while (currentHierarchy) {
        path.push(currentHierarchy);
        if (currentHierarchy.parent_hierarchy_id) {
            currentHierarchy = await sequelize.query(
                `SELECT * FROM ${config_db}.hierarchies WHERE id = ?`, {
                replacements: [currentHierarchy.parent_hierarchy_id],
                type: QueryTypes.SELECT
            }).then(result => result[0] as Hierarchy);
        } else {
            break;
        }
    }
    return path.reverse();
};

const getRateModel = async (hierarchyIds: string[]): Promise<string | null> => {
    const rateModels = await Promise.all(
        hierarchyIds.map(async (id) => {
            const hierarchy: Hierarchy | null = await sequelize.query(
                `SELECT * FROM ${config_db}.hierarchies WHERE id = ?`, {
                replacements: [id],
                type: QueryTypes.SELECT
            }).then(result => result[0] as Hierarchy);
            return hierarchy?.rate_model;
        })
    );

    const firstRateModel = rateModels[0];
    let rate_model: any = null;
    const allSameRateModel = rateModels.every(rateModel => rateModel === firstRateModel);

    if (allSameRateModel) {
        rate_model = firstRateModel;
    } else {
        const paths = await Promise.all(
            hierarchyIds.map(id => getHierarchyPath(id))
        );
        let commonAncestor: Hierarchy | null = null;

        for (let i = 0; i < paths[0].length; i++) {
            const currentNode = paths[0][i];
            if (paths.every(path => path[i]?.id === currentNode.id)) {
                commonAncestor = currentNode;
            } else {
                break;
            }
        }
        rate_model = commonAncestor?.rate_model ?? null;
    }
    return rate_model;
};

export async function getVendorMarkup(request: FastifyRequest, reply: FastifyReply) {
    const traceId = generateCustomUUID();
    try {
        const { program_id } = request.params as { program_id: string };
        const { candidate_source, hierarchy_id, work_location_id, vendor_id, labour_category_id } = request.query as {
            candidate_source: string;
            hierarchy_id: string;
            work_location_id: string;
            vendor_id: string;
            labour_category_id: string;
        };

        const hierarchyIds = hierarchy_id.split(',');
        const rateModel = await getRateModel(hierarchyIds);

        const markupsData = await submissionRepo.vendorMarkup(program_id, { rateModel, program_id, labour_category_id, work_location_id, vendor_id }) as HierarchyRecord;

        let selectedMarkup: any = null;
        let rate_model: string | null = null;

        if (markupsData) {
            const markups = markupsData.markups;
            rate_model = markupsData.rate_model;
            selectedMarkup = candidate_source === 'sourced' ? markups?.sourced_markup : candidate_source === 'payrolled' ? markups?.payrolled_markup : null;
        }

        if (selectedMarkup === null) {
            return reply.status(200).send({
                status_code: 200,
                trace_id: traceId,
                message: `No ${candidate_source}_markup found for the provided criteria`,
                rate_model,
                markups: null
            });
        }

        return reply.status(200).send({
            status_code: 200,
            message: "Vendor bill rate and markup retrieved successfully",
            trace_id: traceId,
            rate_model: rateModel,
            markup: selectedMarkup,
        });

    } catch (error: any) {
        console.error(error);
        return reply.status(500).send({
            status_code: 500,
            message: "Failed to retrieve vendor markup",
            trace_id: traceId,
            error: error.message
        });
    }
}

function getFeeAmount(fee_details: any[], feeCategory: string): number {
    return Number(
        fee_details
            ?.find((fee) => fee.fee_category === feeCategory)
            ?.applicable_config?.find((config: any) => config.entity_ref === 'ASSIGNMENT')?.fee ?? 0
    );
}

function calculateRateWithMarkup(rate: number, markup: number): number {
    return rate + (rate * markup) / 100;
}

function vendorBillRateWithFee(rate: number, fee: number, feeType: string): number {
    if (feeType === 'percentage') {
        return rate - (rate * fee) / 100;
    } else {
        return rate - fee;
    }
}

function applyDifferential(rate: number, differential: string, differentialType: string, rateTypeCategory: string, ot_exempt: boolean): number {
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
        return rate + differentialValue;
    }
}

function adjustRateWithVMarkup(rate: number, markup: number): number {
    return (rate * 100) / (100 + markup);
}

function clientBillRateWithMarkupForBillRate(rate: number, fee: number, feeType: string): number {
    return feeType === 'percentage' ? (rate * 100) / (100 - fee) : rate + fee;
}

function clientBillRateWithNoMarkupForBillRate(rate: number, fee: number, feeType: string): number {
    return feeType === 'percentage' ? (rate * 100) / (100 + fee) : rate - fee;
}

function calculateRateWithFee(rate: number, fee: number, feeType: string): number {
    return feeType === 'percentage' ? rate + (rate * fee) / 100 : rate + fee;
}

function adjustRatesForPayRate(rateDetails: any, rate_model: string, vendor_markup: number, msp_fee: number, STcandidatePayRate: number, candidatePayRate: number, vendorBillRate: number, clientBillRate: number, feeType: string, ot_exempt: boolean) {
    const rateTypeCategory = rateDetails.rate_type.rate_type_category?.value;
    const baseRate = rateDetails.rate_type.is_base_rate;
    if (baseRate === true) {
        clientBillRate ||= calculateRateWithMarkup(candidatePayRate, vendor_markup);
        vendorBillRate ||= vendorBillRateWithFee(clientBillRate, msp_fee, feeType);
    } else {
        let differentialValue = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_value : rateDetails.bill_rate[0].differential_value;
        let differentialType = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_type : rateDetails.bill_rate[0].differential_type;
        candidatePayRate = applyDifferential(STcandidatePayRate, differentialValue, differentialType, rateTypeCategory, ot_exempt);
        clientBillRate ||= calculateRateWithMarkup(candidatePayRate, vendor_markup);
        vendorBillRate ||= vendorBillRateWithFee(clientBillRate, msp_fee, feeType);
    }
    return { candidatePayRate, clientBillRate, vendorBillRate };
}

function adjustRatesBillRateMarkup(rateDetails: any, rate_model: string, vendor_markup: number, msp_fee: number, STcandidatePayRate: number, candidatePayRate: number, vendorBillRate: number, clientBillRate: number, feeType: string, ot_exempt: boolean) {
    const rateTypeCategory = rateDetails.rate_type.rate_type_category?.value;
    const baseRate = rateDetails.rate_type.is_base_rate;
    if (baseRate === true) {
        vendorBillRate ||= vendorBillRateWithFee(clientBillRate, msp_fee, feeType);
        clientBillRate ||= clientBillRateWithMarkupForBillRate(vendorBillRate, msp_fee, feeType);
        candidatePayRate ||= adjustRateWithVMarkup(clientBillRate, vendor_markup);
    } else {
        let differentialValue = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_value : rateDetails.bill_rate[0].differential_value;
        let differentialType = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_type : rateDetails.bill_rate[0].differential_type;
        candidatePayRate ||= applyDifferential(STcandidatePayRate, differentialValue, differentialType, rateTypeCategory, ot_exempt);
        clientBillRate ||= calculateRateWithMarkup(candidatePayRate, vendor_markup);
        vendorBillRate ||= vendorBillRateWithFee(clientBillRate, msp_fee, feeType);
    }
    return { candidatePayRate, clientBillRate, vendorBillRate };
}

function adjustRatesBillRateNoMarkup(rateDetails: any, rate_model: string, msp_fee: number, STvendorBillRatee: number, STclientBillRate: number, vendorBillRate: number, clientBillRate: number, feeType: string, ot_exempt: boolean) {
    const rateTypeCategory = rateDetails.rate_type.rate_type_category?.value;
    const baseRate = rateDetails.rate_type.is_base_rate;
    if (baseRate === true) {
        clientBillRate ||= clientBillRateWithMarkupForBillRate(vendorBillRate, msp_fee, feeType);
        vendorBillRate ||= vendorBillRateWithFee(clientBillRate, msp_fee, feeType);
    } else {
        let differentialValue = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_value : rateDetails.bill_rate[0].differential_value;
        let differentialType = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_type : rateDetails.bill_rate[0].differential_type;
        clientBillRate = applyDifferential(STclientBillRate, differentialValue, differentialType, rateTypeCategory, ot_exempt);
        vendorBillRate = vendorBillRateWithFee(clientBillRate, msp_fee, feeType);
    }
    return { clientBillRate, vendorBillRate };
}

function clientAdjustRatesForPayRate(rateDetails: any, rate_model: string, vendor_markup: number, msp_fee: number, STcandidatePayRate: number, candidatePayRate: number, vendorBillRate: number, clientBillRate: number, feeType: string, ot_exempt: boolean) {
    const rateTypeCategory = rateDetails.rate_type.rate_type_category?.value;
    const baseRate = rateDetails.rate_type.is_base_rate;
    if (baseRate === true) {
        vendorBillRate ||= calculateRateWithMarkup(candidatePayRate, vendor_markup);
        clientBillRate ||= calculateRateWithFee(vendorBillRate, msp_fee, feeType);
    } else {
        let differentialValue = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_value : rateDetails.bill_rate[0].differential_value;
        let differentialType = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_type : rateDetails.bill_rate[0].differential_type;
        candidatePayRate ||= applyDifferential(STcandidatePayRate, differentialValue, differentialType, rateTypeCategory, ot_exempt);
        vendorBillRate ||= calculateRateWithMarkup(candidatePayRate, vendor_markup);
        clientBillRate ||= calculateRateWithFee(vendorBillRate, msp_fee, feeType);
    }
    return { candidatePayRate, clientBillRate, vendorBillRate };
}

function clientAdjustRatesForBillRate(rateDetails: any, rate_model: string, vendor_markup: number, msp_fee: number, STcandidatePayRate: number, candidatePayRate: number, vendorBillRate: number, clientBillRate: number, feeType: string, ot_exempt: boolean) {
    const rateTypeCategory = rateDetails.rate_type.rate_type_category?.value;
    const baseRate = rateDetails.rate_type.is_base_rate;
    if (baseRate === true) {
        vendorBillRate ||= clientBillRateWithNoMarkupForBillRate(clientBillRate, msp_fee, feeType);
        clientBillRate ||= calculateRateWithFee(vendorBillRate, msp_fee, feeType);;
        candidatePayRate ||= adjustRateWithVMarkup(vendorBillRate, vendor_markup);
    } else {
        let differentialValue = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_value : rateDetails.bill_rate[0].differential_value;
        let differentialType = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_type : rateDetails.bill_rate[0].differential_type;
        candidatePayRate ||= applyDifferential(STcandidatePayRate, differentialValue, differentialType, rateTypeCategory, ot_exempt);
        clientBillRate ||= calculateRateWithFee(vendorBillRate, msp_fee, feeType);
        vendorBillRate ||= calculateRateWithMarkup(vendorBillRate, vendor_markup);
    }
    return { candidatePayRate, clientBillRate, vendorBillRate };
}

function clientAdjustRatesForBillRateNoMarkup(rateDetails: any, rate_model: string, msp_fee: number, STvendorBillRatee: number, STclientBillRate: number, vendorBillRate: number, clientBillRate: number, feeType: string, ot_exempt: boolean) {
    const rateTypeCategory = rateDetails.rate_type.rate_type_category?.value;
    const baseRate = rateDetails.rate_type.is_base_rate;
    if (baseRate === true) {
        clientBillRate ||= calculateRateWithFee(vendorBillRate, msp_fee, feeType);
        vendorBillRate ||= clientBillRateWithNoMarkupForBillRate(clientBillRate, msp_fee, feeType);
    } else {
        let differentialValue = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_value : rateDetails.bill_rate[0].differential_value;
        let differentialType = rate_model === 'pay_rate' ? rateDetails.pay_rate[0].differential_type : rateDetails.bill_rate[0].differential_type;
        clientBillRate ||= applyDifferential(STclientBillRate, differentialValue, differentialType, rateTypeCategory, ot_exempt);
        vendorBillRate ||= clientBillRateWithNoMarkupForBillRate(clientBillRate, msp_fee, feeType);
    }
    return { clientBillRate, vendorBillRate };
}

function calculatePayRateModel(candidatePayRate: number, vendorMarkup: number, mspFee: number) {
    const standardCandidateBillRate = candidatePayRate + (candidatePayRate * vendorMarkup) / 100;
    const vendorBillRateMin = standardCandidateBillRate - (standardCandidateBillRate * mspFee) / 100;
    console.log(candidatePayRate, "ssss", vendorMarkup, "pppppp", mspFee);
    return {
        pr: candidatePayRate.toFixed(4),
        br: standardCandidateBillRate,
        vbr: vendorBillRateMin,
    };
}

function calculateBillRateModel(vendorBillRate: number, vendorMarkup: number, mspFee: number) {
    const standardCandidateBillRate = (vendorBillRate * 100) / (100 - mspFee);
    const standardCandidatePayRate = (standardCandidateBillRate * 100) / (100 + vendorMarkup);
    const vendorBillRateMin = standardCandidateBillRate - (standardCandidateBillRate * mspFee) / 100;
    return {
        pr: standardCandidatePayRate.toFixed(4),
        br: standardCandidateBillRate.toFixed(4),
        vbr: vendorBillRateMin.toFixed(4),
    };
}

function calculateBillRateNoMarkup(vendorBillRate: number, mspFee: number) {
    const standardCandidateBillRate = (vendorBillRate * 100) / (100 - mspFee);
    const vendorBillRateMin = standardCandidateBillRate - (standardCandidateBillRate * mspFee) / 100;
    return {
        br: standardCandidateBillRate.toFixed(4),
        vbr: vendorBillRateMin.toFixed(4),
    };
}

function calculateRatesBasedOnFundingModel(params: FundingModelParams) {
    let { rateDetails, fundingModel, rate_model, candidatePayRate, STcandidatePayRate, STvendorBillRate, STclientBillRate, vendorBillRate, clientBillRate, vendorMarkup, msp_fee, feeType, vmsFee, mspPartnerFee, ot_exempt } = params;

    if (fundingModel === 'VENDOR') {
        if (rate_model === 'pay_rate') {
            ({ candidatePayRate, clientBillRate, vendorBillRate } = adjustRatesForPayRate(rateDetails, rate_model, vendorMarkup, msp_fee, STcandidatePayRate, candidatePayRate, vendorBillRate, clientBillRate, feeType, ot_exempt));
        } else if (rate_model === 'markup') {
            ({ candidatePayRate, clientBillRate, vendorBillRate } = adjustRatesBillRateMarkup(rateDetails, rate_model, vendorMarkup, msp_fee, STcandidatePayRate, candidatePayRate, vendorBillRate, clientBillRate, feeType, ot_exempt));
        } else {
            ({ clientBillRate, vendorBillRate } = adjustRatesBillRateNoMarkup(rateDetails, rate_model, msp_fee, STvendorBillRate, STclientBillRate, vendorBillRate, clientBillRate, feeType, ot_exempt));
        }
    } else if (fundingModel === 'CLIENT') {
        if (rate_model === 'pay_rate') {
            ({ candidatePayRate, clientBillRate, vendorBillRate } = clientAdjustRatesForPayRate(rateDetails, rate_model, vendorMarkup, msp_fee, STcandidatePayRate, candidatePayRate, vendorBillRate, clientBillRate, feeType, ot_exempt));
        } else if (rate_model === 'markup') {
            ({ candidatePayRate, clientBillRate, vendorBillRate } = clientAdjustRatesForBillRate(rateDetails, rate_model, vendorMarkup, msp_fee, STcandidatePayRate, candidatePayRate, vendorBillRate, clientBillRate, feeType, ot_exempt));
        } else {
            ({ clientBillRate, vendorBillRate } = clientAdjustRatesForBillRateNoMarkup(rateDetails, rate_model, msp_fee, STvendorBillRate, STclientBillRate, vendorBillRate, clientBillRate, feeType, ot_exempt));
        }
    }

    return { candidatePayRate, vendorBillRate, clientBillRate };
}

export async function getMspBudget(request: FastifyRequest, reply: FastifyReply) {
    const trace_id = generateCustomUUID();

    try {
        const { program_id } = request.params as { program_id: string };
        const {
            ot_exempt,
            rate_model,
            rate_factors = [],
            labor_category_id,
            work_location_id,
            job_type,
            job_template_id,
            vendor_id,
            candidate_source,
            worker_classification
        } = request.body as CandidateBudget;

        const program_industry = labor_category_id;
        const work_locations = work_location_id;

        const processedData = await Promise.all(
            (rate_factors as unknown as any[]).map(async (rateItem: any) => {
                try {
                    const hierarchyIds = Array.isArray(rateItem.hierarchies)
                        ? rateItem.hierarchies.map((h: any) => h.id ?? h)
                        : rateItem.hierarchies;

                    const feesConfig = await GlobalRepository.findFeesConfig(program_id, program_industry, hierarchyIds, vendor_id);

                    if (!feesConfig.length) {
                        throw new Error('No fee configuration found.');
                    }

                    const feesConfigData = feesConfig[0] as FeeConfig;
                    const { funding_model, categorical_fees } = feesConfigData;
                    const feeType = categorical_fees[0]?.fee_type?.toLowerCase();
                    const mspPartnerFee = getFeeAmount(categorical_fees, 'MSP_PARTNER');
                    const vmsFee = getFeeAmount(categorical_fees, 'VMS');
                    const msp_fee = mspPartnerFee + vmsFee;
                    const fundingModel = funding_model.toUpperCase();

                    const rateConfiguration = await Promise.all(
                        rateItem.rate_configuration.map(async (config: any) => {
                            const baseRateCalc = await (async () => {
                                const rateDetails = config.base_rate;
                                let candidatePayRate = parseFloat(rateDetails.candidate_pay_rate);
                                let vendorBillRate = parseFloat(rateDetails.vendor_bill_rate);
                                let clientBillRate = parseFloat(rateDetails.client_bill_rate);
                                let markup = parseFloat(rateDetails.markup);
                                let STcandidatePayRate = 0;
                                let STvendorBillRate = 0;
                                let STclientBillRate = 0;

                                const rateType = rateDetails.rate_type.id;

                                const markupData = await getVendorMarkups(
                                    program_id,
                                    program_industry,
                                    hierarchyIds,
                                    rate_model,
                                    vendor_id,
                                    work_locations,
                                    job_type,
                                    job_template_id,
                                    rateType,
                                    worker_classification
                                );

                                let vendorMarkup;
                                let vendor_fixed_markup;

                                if (markup && markup !== 0) {
                                    vendorMarkup = markup;
                                    const markupDataItem = markupData[0] as MarkupDataInterface;
                                    vendor_fixed_markup = calculateMarkups(
                                        markupDataItem.sourced_markup_max,
                                        markupDataItem.payrolled_markup_max,
                                        candidate_source
                                    );
                                } else {
                                    if (shouldValidateMarkups(rate_model, markupData[0] as MarkupDataInterface)) {
                                        throw new Error('No markups found for vendors.');
                                    }

                                    const markupDataItem = markupData[0] as MarkupDataInterface;

                                    if (!markupDataItem && rate_model !== 'bill_rate') {
                                        throw new Error('No markups found for vendors.');
                                    }

                                    if (rate_model !== 'bill_rate') {
                                        vendorMarkup = calculateMarkups(
                                            markupDataItem.sourced_markup_max,
                                            markupDataItem.payrolled_markup_max,
                                            candidate_source
                                        );
                                        vendor_fixed_markup = calculateMarkups(
                                            markupDataItem.sourced_markup_max,
                                            markupDataItem.payrolled_markup_max,
                                            candidate_source
                                        );
                                    } else {
                                        vendorMarkup = 0;
                                        vendor_fixed_markup = 0;
                                    }
                                }

                                const rates = calculateRatesBasedOnFundingModel({
                                    rateDetails,
                                    fundingModel,
                                    rate_model,
                                    candidatePayRate,
                                    STcandidatePayRate,
                                    STvendorBillRate,
                                    STclientBillRate,
                                    vendorBillRate,
                                    clientBillRate,
                                    vendorMarkup,
                                    msp_fee,
                                    feeType,
                                    vmsFee,
                                    mspPartnerFee,
                                    ot_exempt
                                });

                                return {
                                    rate_type: rateDetails.rate_type,
                                    bill_rate: rateDetails.bill_rate,
                                    pay_rate: rateDetails.pay_rate,
                                    markup: vendorMarkup,
                                    vendor_fixed_markup: vendor_fixed_markup,
                                    client_bill_rate: rates.clientBillRate || 0,
                                    vendor_bill_rate: rates.vendorBillRate || 0,
                                    candidate_pay_rate: rates.candidatePayRate || 0,
                                };
                            })();

                            const processedRates = await Promise.all(
                                config.base_rate.rates.map(async (rateDetails: any) => {
                                    let candidatePayRate = parseFloat(rateDetails.candidate_pay_rate) || 0;
                                    let vendorBillRate = parseFloat(rateDetails.vendor_bill_rate) || 0;
                                    let clientBillRate = parseFloat(rateDetails.client_bill_rate) || 0;
                                    let STcandidatePayRate = baseRateCalc.candidate_pay_rate || 0;
                                    let STvendorBillRate = baseRateCalc.vendor_bill_rate || 0;
                                    let STclientBillRate = baseRateCalc.client_bill_rate || 0;
                                    let markup = parseFloat(rateDetails.markup);

                                    const rateType = rateDetails.rate_type.id;

                                    const markupData = await getVendorMarkups(
                                        program_id,
                                        program_industry,
                                        hierarchyIds,
                                        rate_model,
                                        vendor_id,
                                        work_locations,
                                        job_type,
                                        job_template_id,
                                        rateType,
                                        worker_classification
                                    );

                                    let vendorMarkup;
                                    let vendor_fixed_markup;
                                    if (markup && markup !== 0) {
                                        vendorMarkup = markup;

                                        const markupDataItem = markupData[0] as MarkupDataInterface;
                                        if (markupDataItem) {
                                            vendor_fixed_markup = calculateMarkups(
                                                markupDataItem.sourced_markup_max,
                                                markupDataItem.payrolled_markup_max,
                                                candidate_source
                                            );
                                        }
                                    } else {
                                        const markupDataItem = markupData[0] as MarkupDataInterface;
                                        if (markupDataItem) {
                                            vendorMarkup = calculateMarkups(
                                                markupDataItem.sourced_markup_max,
                                                markupDataItem.payrolled_markup_max,
                                                candidate_source
                                            );
                                            vendor_fixed_markup = calculateMarkups(
                                                markupDataItem.sourced_markup_max,
                                                markupDataItem.payrolled_markup_max,
                                                candidate_source
                                            );
                                        }
                                    }

                                    vendorMarkup = vendorMarkup || baseRateCalc.markup;
                                    vendor_fixed_markup = vendor_fixed_markup || Number(baseRateCalc.vendor_fixed_markup);

                                    const rates = calculateRatesBasedOnFundingModel({
                                        rateDetails,
                                        fundingModel,
                                        rate_model,
                                        candidatePayRate,
                                        STcandidatePayRate,
                                        STvendorBillRate,
                                        STclientBillRate,
                                        vendorBillRate,
                                        clientBillRate,
                                        vendorMarkup,
                                        msp_fee,
                                        feeType,
                                        vmsFee,
                                        mspPartnerFee,
                                        ot_exempt
                                    });

                                    return {
                                        rate_type: rateDetails.rate_type,
                                        bill_rate: rateDetails.bill_rate,
                                        pay_rate: rateDetails.pay_rate,
                                        markup: Number(vendorMarkup).toFixed(8) || 0,
                                        vendor_fixed_markup: vendor_fixed_markup ?? 0,
                                        client_bill_rate: Number(rates.clientBillRate).toFixed(8) || 0,
                                        vendor_bill_rate: Number(rates.vendorBillRate).toFixed(8) || 0,
                                        candidate_pay_rate: Number(rates.candidatePayRate).toFixed(8) || 0,
                                    };
                                })
                            );

                            const processedRateSection = await Promise.all(
                                config.rate.map(async (rateDetails: any) => {
                                    let candidatePayRate = parseFloat(rateDetails.candidate_pay_rate) || 0;
                                    let vendorBillRate = parseFloat(rateDetails.vendor_bill_rate) || 0;
                                    let clientBillRate = parseFloat(rateDetails.client_bill_rate) || 0;
                                    const STcandidatePayRate = baseRateCalc.candidate_pay_rate || 0;
                                    const STvendorBillRate = baseRateCalc.vendor_bill_rate || 0;
                                    const STclientBillRate = baseRateCalc.client_bill_rate || 0;
                                    let markup = parseFloat(rateDetails.markup);

                                    const rateType = rateDetails.rate_type.id;

                                    const markupData = await getVendorMarkups(
                                        program_id,
                                        program_industry,
                                        hierarchyIds,
                                        rate_model,
                                        vendor_id,
                                        work_locations,
                                        job_type,
                                        job_template_id,
                                        rateType,
                                        worker_classification
                                    );

                                    let vendorMarkup;
                                    let vendor_fixed_markup;
                                    if (markup && markup !== 0) {
                                        vendorMarkup = markup;

                                        const markupDataItem = markupData[0] as MarkupDataInterface;
                                        if (markupDataItem) {
                                            vendor_fixed_markup = calculateMarkups(
                                                markupDataItem.sourced_markup_max,
                                                markupDataItem.payrolled_markup_max,
                                                candidate_source
                                            );
                                        }
                                    } else {
                                        const markupDataItem = markupData[0] as MarkupDataInterface;
                                        if (markupDataItem) {
                                            vendorMarkup = calculateMarkups(
                                                markupDataItem.sourced_markup_max,
                                                markupDataItem.payrolled_markup_max,
                                                candidate_source
                                            );
                                            vendor_fixed_markup = calculateMarkups(
                                                markupDataItem.sourced_markup_max,
                                                markupDataItem.payrolled_markup_max,
                                                candidate_source
                                            );
                                        }
                                    }

                                    vendorMarkup = vendorMarkup || baseRateCalc.markup;
                                    vendor_fixed_markup = vendor_fixed_markup ?? Number(baseRateCalc.vendor_fixed_markup);

                                    const rates = calculateRatesBasedOnFundingModel({
                                        rateDetails,
                                        fundingModel,
                                        rate_model,
                                        candidatePayRate,
                                        STcandidatePayRate,
                                        STvendorBillRate,
                                        STclientBillRate,
                                        vendorBillRate,
                                        clientBillRate,
                                        vendorMarkup,
                                        msp_fee,
                                        feeType,
                                        vmsFee,
                                        mspPartnerFee,
                                        ot_exempt
                                    });

                                    const processedNestedRates = await Promise.all(
                                        rateDetails.rates.map(async (nestedRate: any) => {
                                            let candidatePayRate = parseFloat(nestedRate.candidate_pay_rate) || 0;
                                            let vendorBillRate = parseFloat(nestedRate.vendor_bill_rate) || 0;
                                            let clientBillRate = parseFloat(nestedRate.client_bill_rate) || 0;
                                            const STcandidatePayRate = rates.candidatePayRate || 0;
                                            let markup = parseFloat(nestedRate.markup);

                                            const rateType = nestedRate.rate_type.id;

                                            const markupData = await getVendorMarkups(
                                                program_id,
                                                program_industry,
                                                hierarchyIds,
                                                rate_model,
                                                vendor_id,
                                                work_locations,
                                                job_type,
                                                job_template_id,
                                                rateType,
                                                worker_classification
                                            );

                                            let vendorMarkup;
                                            let vendor_fixed_markup
                                            if (markup && markup !== 0) {
                                                vendorMarkup = markup;

                                                const markupDataItem = markupData[0] as MarkupDataInterface;
                                                if (markupDataItem) {
                                                    vendor_fixed_markup = calculateMarkups(
                                                        markupDataItem.sourced_markup_max,
                                                        markupDataItem.payrolled_markup_max,
                                                        candidate_source
                                                    );
                                                }
                                            } else {
                                                const markupDataItem = markupData[0] as MarkupDataInterface;
                                                if (markupDataItem) {
                                                    vendorMarkup = calculateMarkups(
                                                        markupDataItem.sourced_markup_max,
                                                        markupDataItem.payrolled_markup_max,
                                                        candidate_source
                                                    );
                                                    vendor_fixed_markup = calculateMarkups(
                                                        markupDataItem.sourced_markup_max,
                                                        markupDataItem.payrolled_markup_max,
                                                        candidate_source
                                                    );
                                                }
                                            }

                                            vendorMarkup = vendorMarkup || Number(baseRateCalc.markup);
                                            vendor_fixed_markup = vendor_fixed_markup || Number(baseRateCalc.vendor_fixed_markup);

                                            const nestedRates = calculateRatesBasedOnFundingModel({
                                                rateDetails: nestedRate,
                                                fundingModel,
                                                rate_model,
                                                candidatePayRate,
                                                STcandidatePayRate,
                                                STvendorBillRate: rates.vendorBillRate,
                                                STclientBillRate: rates.clientBillRate,
                                                vendorBillRate,
                                                clientBillRate,
                                                vendorMarkup,
                                                msp_fee,
                                                feeType,
                                                vmsFee,
                                                mspPartnerFee,
                                                ot_exempt
                                            });

                                            return {
                                                rate_type: nestedRate.rate_type,
                                                bill_rate: nestedRate.bill_rate,
                                                pay_rate: nestedRate.pay_rate,
                                                markup: Number(vendorMarkup).toFixed(8) || 0,
                                                vendor_fixed_markup: vendor_fixed_markup ?? 0,
                                                client_bill_rate: Number(nestedRates.clientBillRate).toFixed(8) || 0,
                                                vendor_bill_rate: Number(nestedRates.vendorBillRate).toFixed(8) || 0,
                                                candidate_pay_rate: Number(nestedRates.candidatePayRate).toFixed(8) || 0,
                                            };
                                        })
                                    );

                                    return {
                                        rate_type: rateDetails.rate_type,
                                        pay_rate: rateDetails.pay_rate,
                                        bill_rate: rateDetails.bill_rate,
                                        markup: Number(vendorMarkup).toFixed(8) || 0,
                                        vendor_fixed_markup: vendor_fixed_markup,
                                        client_bill_rate: Number(rates.clientBillRate).toFixed(8) || 0,
                                        vendor_bill_rate: Number(rates.vendorBillRate).toFixed(8) || 0,
                                        candidate_pay_rate: Number(rates.candidatePayRate).toFixed(8) || 0,
                                        rates: processedNestedRates,
                                    };
                                })
                            );

                            return {
                                fundingModel,
                                feeType,
                                mspPartnerFee: Number(mspPartnerFee).toFixed(8) || 0,
                                vmsFee: Number(vmsFee).toFixed(8) || 0,
                                msp_fee: Number(msp_fee).toFixed(8) || 0,
                                base_rate: {
                                    rate_type: baseRateCalc.rate_type,
                                    bill_rate: Number(baseRateCalc.bill_rate).toFixed(8) || 0,
                                    pay_rate: Number(baseRateCalc.pay_rate).toFixed(8) || 0,
                                    client_bill_rate: Number(baseRateCalc.client_bill_rate).toFixed(8) || 0,
                                    vendor_bill_rate: Number(baseRateCalc.vendor_bill_rate).toFixed(8) || 0,
                                    candidate_pay_rate: Number(baseRateCalc.candidate_pay_rate).toFixed(8) || 0,
                                    markup: Number(baseRateCalc.markup).toFixed(8) || 0,
                                    vendor_fixed_markup: baseRateCalc.vendor_fixed_markup,
                                    rates: processedRates,
                                },
                                rate: processedRateSection,
                            };
                        })
                    );

                    return {
                        is_shift_rate: rateItem.is_shift_rate,
                        hierarchies: rateItem.hierarchies,
                        rate_configuration: rateConfiguration,
                    };
                } catch (error) {
                    console.error(`Error processing rate factor: ${error}`);
                    throw error;
                }
            })
        );

        return reply.status(200).send({
            status_code: 200,
            message: 'Financial detail calculated successfully',
            trace_id: trace_id,
            data: processedData,
        });

    } catch (error: any) {
        console.error('Error in getMspBudget:', error);
        return reply.status(500).send({
            status_code: 500,
            trace_id: trace_id,
            message: 'An unexpected error occurred.',
            error: error.message
        });
    }
}

function normalizeArray(value: any): any[] {
    return Array.isArray(value) ? value : [value].filter(Boolean);
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

async function getVendorMarkups(program_id: string, program_industry: string, hierarchy: any, rate_model: string, vendor_id: string, work_location: string, job_type: string, job_template_id: string, rate_type: string, worker_classification: string) {
    return GlobalRepository.findMarkupsForVendor({
        program_id,
        program_industry,
        hierarchy,
        rate_model,
        vendor_id,
        work_location,
        job_type,
        job_template_id,
        rate_type,
        worker_classification
    });
}

function calculateMarkups(sourced_markup_max: number, payrolled_markup_max: number, candidate_source: string): number {
    let vendorMarkup;

    if (candidate_source.toLocaleLowerCase() === "sourced") {
        vendorMarkup = sourced_markup_max
    } else {
        vendorMarkup = payrolled_markup_max
    }

    return vendorMarkup;
}

export const getSubmissionCandidateByCandidateId = async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = generateCustomUUID();
    const { program_id, candidate_id } = request.params as { program_id: string; candidate_id: string };
    const { job_id } = request.query as { job_id: string };
    try {
        const user = request.user as any;
        let isVendorUser = false;
        const userId = user?.sub;
        const userData = await jobRepository.findUser(program_id, userId);
        const userType = userData[0]?.user_type?.toLowerCase() ?? user.userType?.toLowerCase();

        if (userType === "vendor") isVendorUser = true;

        const replacements: any = {
            program_id,
            candidate_id,
        };

        if (job_id) {
            replacements.job_id = job_id;
        }

        if (isVendorUser) {
            replacements.isVendorUser = isVendorUser;
        }

        const candidates = await submissionRepo.submiteCandidatesGetByCandidateId(replacements);

        if (!candidates.length) {
            return reply.status(200).send({
                status_code: 200,
                trace_id: traceId,
                message: 'Submission candidate not found.',
                submission_candidate: {},
            });
        }

        const candidate = candidates[0];
        const hierarchy_id = candidate?.primary_hierarchy;
        const getIsHideCandidateImage = await submissionRepo.getIsHideCandidateImageToggle(program_id, hierarchy_id);
        const is_hide_candidate_img = getIsHideCandidateImage?.is_hide_candidate_img ?? false;
        const shouldHideAvatar = userType === "client" && is_hide_candidate_img;

        const actions = await getOfferActionFlags({ status: candidate.status, userType, jobId: candidate.job_id });

        const formattedCandidate = {
            id: candidate.id,
            program_id: candidate.program_id,
            job_id: {
                id: candidate.job_id,
                job_name: candidate.job_template_name,
            },
            currency: candidate.currency,
            unique_id: candidate.unique_id,
            candidate_id: candidate.candidate_id,
            first_name: candidate.first_name,
            last_name: candidate.last_name,
            middle_name: candidate.middle_name,
            config_candidate_id: candidate.can_id,
            do_not_rehire: candidate.do_not_rehire,
            do_not_rehire_reason: candidate.do_not_rehire_reason,
            do_not_rehire_notes: candidate.do_not_rehire_notes,
            state_national_id: candidate.state_national_id,
            worker_type_id: candidate.worker_type_id,
            vendor_id: candidate.vendor_id,
            tenant_id: candidate.tenant_id,
            resume_url: candidate.resume_url,
            avatar: shouldHideAvatar ? undefined : candidate.avatar,
            worker_classification: candidate.worker_classification,
            available_start_date: candidate.available_start_date,
            available_end_date: candidate.available_end_date,
            is_candidate_work_before: !!candidate.is_candidate_work_before,
            is_remote_worker: !!candidate.is_remote_worker,
            candidate_source: candidate.candidate_source,
            is_duplicate_submission: candidate.is_duplicate_submission,
            mtp_id: candidate.mtp_id,
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
            created_on: candidate.created_on,
            updated_on: candidate.updated_on,
            created_by: candidate.created_by,
            updated_by: candidate.updated_by,
            is_deleted: !!candidate.is_deleted,
            is_enabled: !!candidate.is_enabled,
            custom_fields: Array.isArray(candidate.custom_fields) && candidate.custom_fields.length > 0
                ? candidate.custom_fields.sort((a: any, b: any) => a.seq_number - b.seq_number)
                .map((field: { value: string }) => ({
                    ...field,
                    value: parseCustomFieldValue(field.value),
                }))
                : null,
            qualifications: candidate.qualifications,
            interview_flag: candidate.interview_flag == 1,
            offer_flag: candidate.offer_flag == 1,
            actions: actions
        };

        return reply.status(200).send({
            status_code: 200,
            trace_id: traceId,
            message: 'Submission candidate retrieved successfully',
            submission_candidate: formattedCandidate,
        });
    } catch (error: any) {
        return reply.status(500).send({
            status_code: 500,
            message: 'Internal Server Error',
            trace_id: traceId,
            error: error.message,
        });
    }
};

const parseCustomFieldValue = (value: string) => {
    try {
        const parsedValue = JSON.parse(value);
        return parsedValue;
    } catch (e) {
        return value;
    }
};

export const getOnboardingTasks = async (
    request: FastifyRequest<{
        Params: { program_id: string };
        Querystring: { job_id: string };
    }>,
    reply: FastifyReply
) => {
    const { program_id } = request.params;
    const { job_id } = request.query;

    if (!job_id) {
        return reply.status(400).send({
            status_code: 400,
            message: "job_id is required",
        });
    }

    try {
        const jobData = await JobModel.findByPk(job_id);
        if (!jobData) {
            return reply.status(404).send({
                status_code: 404,
                message: "No job found for the provided job_id",
            });
        }

        if (!jobData.checklist_entity_id) {
            return reply.status(200).send({
                status_code: 200,
                message: "Job doesn't have a checklist associated to it",
            });
        }

        const checklistQuery = `
        SELECT version_id, entity_id, name, description, version
        FROM ${config_db}.checklist
        WHERE entity_id = :checklist_entity_id
        AND latest = 1
        AND is_deleted = 0;
        `;

        const checklists = await sequelize.query(checklistQuery, {
            replacements: { checklist_entity_id: jobData.checklist_entity_id },
            type: QueryTypes.SELECT,
        }) as { version_id: string, entity_id: string, name: string, description: string, version: number }[];

        if (checklists.length === 0) {
            return reply.status(404).send({
                status_code: 404,
                message: "No checklist found for the provided checklist_entity_id",
            });
        }

        const latestChecklist = checklists[0] as { version_id: string, entity_id: string, name: string, description: string, version: number };

        const taskMappingQuery = `
            SELECT *
            FROM ${config_db}.checklist_task_mapping
            WHERE checklist_version_id = :version_id
            AND is_deleted = 0
            AND \`trigger\` = '${SUBMISSION_CREATION}';
        `;
        const taskMappingData = await sequelize.query(taskMappingQuery, {
            replacements: { version_id: latestChecklist.version_id },
            type: QueryTypes.SELECT,
        }) as { task_entity_id: string; trigger: string }[];

        if (taskMappingData.length === 0) {
            return reply.send({
                status_code: 200,
                message: "No tasks configured for submission creation event ",
                data: {
                    checklist: latestChecklist,
                    checklist_mappings: []
                },
            });
        }

        const taskEntityIds = taskMappingData.map((task) => task.task_entity_id);

        const latestTasksResponse = await credentialingService.getLatestTasksByIds(
            program_id,
            taskEntityIds,
            request.headers?.authorization!
        );

        if (!latestTasksResponse || latestTasksResponse.status_code !== 200) {
            return reply.status(latestTasksResponse?.status_code || 500).send({
                status_code: latestTasksResponse?.status_code || 500,
                message: "Failed to fetch latest tasks",
            });
        }

        const latestTasks = latestTasksResponse.data;

        const checklistTaskMappings = taskMappingData.map((mapping) => {
            const latestTask = latestTasks.find(
                (task: { entity_id: string }) => task.entity_id === mapping.task_entity_id
            );
            return {
                mapping: mapping,
                task: latestTask,
            };
        });

        return reply.send({
            status_code: 200,
            message: "Successfully fetched checklist task mapping",
            data: {
                checklist: latestChecklist,
                checklist_mappings: checklistTaskMappings
            },
        });
    } catch (error: any) {
        console.error("Error fetching onboarding tasks data:", error);
        return reply.status(500).send({
            status_code: 500,
            message: "Failed to fetch onboarding tasks data",
        });
    }
};

export const getSubmissionCandidateForVendor = async (
    request: FastifyRequest,
    reply: FastifyReply
) => {
    const traceId = generateCustomUUID();
    const { vendor_id } = request.params as { vendor_id: string }
    const { job_id, candidate_id } = request.query as { job_id?: string, candidate_id?: string };

    try {
        const whereClause: any = {
            vendor_id: vendor_id,
            is_deleted: false,
            is_enabled: true
        };
        if (job_id) {
            whereClause.job_id = job_id;
        }
        if (candidate_id) {
            whereClause.candidate_id = candidate_id;
        }
        const candidates = await submissionCandidateModel.findAll({
            where: whereClause,
            attributes: ["candidate_id"],
        });
        const candidateIds = candidates.map(candidate => candidate.candidate_id);
        return reply.status(200).send({
            status_code: 200,
            trace_id: traceId,
            message: 'Submission candidates retrieved successfully.',
            submission_candidate_ids: candidateIds,
        });
    } catch (error: any) {
        return reply.status(500).send({
            status_code: 500,
            message: 'Internal Server Error',
            trace_id: traceId,
            error: error.message,
        });
    }
};

async function handleSubmissionNotification(
    sequelize: any,
    user: any,
    program_id: string,
    jobDatas: any,
    candidate: any,
    unique_id: string | null,
    traceId: string,
    token: string,
    sendNotification: any
) {
    const userType = await determineUserType(user, token);

    if (!userType || userType?.length === 0) {
        console.error("User data not found");
        return;
    }

    const eventCode = NotificationEventCode.SUBMISSION_CREATE;

    if (
        userType?.toLocaleUpperCase() === TenantConstant.VENDOR.toLocaleUpperCase()
    ) {
        const programType = await getProgramType(sequelize, program_id);
        const managerData = await getJobManagerEmail(sequelize, jobDatas?.job_manager_id);
        const job_id = candidate?.job_id || "";

        const jobDetails = await getJobDetails(sequelize, job_id);
        const vendorDetails = await fetchUserDetils(user.sub)
        const payload: any = {
            job_id: jobDetails[0]?.job_id ?? "",
            job_url: jobDetails[0]?.job_id && jobDetails[0]?.job_template_id
                ? `${ui_base_url}/jobs/job/view/${jobDetails[0].id}/${jobDetails[0].job_template_id}?detail=job-details`
                : '',
            job_name: jobDetails[0]?.job_name ?? "",
            submission_id: unique_id,
            submission_url: candidate?.candidate_id ? `${ui_base_url}/jobs/view-submit/${candidate.candidate_id}/job/${jobDetails[0].id}?detail=submission`
                : '',
            created_by_first_name: vendorDetails[0]?.first_name ?? "",
            created_by_last_name: vendorDetails[0]?.last_name ?? "",
        };

        const recipientEmailList: EmailRecipient[] = [];
        if (managerData) {
            recipientEmailList.push(managerData);
        }

        if (programType?.toLocaleUpperCase() === "MSP-MANAGED") {
            const emailList = await getUsersWithHierarchy(
                sequelize,
                program_id,
                TenantConstant.MSP,
                jobDatas?.dataValues?.hierarchy_ids ?? []
            );

            if (emailList?.length) {
                recipientEmailList.push(...emailList);
            }
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

        notifyJobManager(sendNotification, notificationPayload, recipientEmailList);
    }
}

export const getCandidateProgress = async (request: FastifyRequest, reply: FastifyReply) => {
    const { program_id } = request.params as { program_id: string };
    const { candidate_id, job_id } = request.query as { candidate_id: string, job_id: string };
    const trace_id = generateCustomUUID();
    const user = request?.user;
    let isVendorUser = false;
    const userId = user?.sub;
    const userType = user?.userType || undefined;
    const userData = await jobRepository.findUser(program_id, userId);
    const user_type = userData[0]?.user_type;
    if (userType === undefined && user_type === "vendor") {
        isVendorUser = true
    }

    try {

        const result = await submissionRepo.getCandidateProgress(program_id, candidate_id, job_id, isVendorUser);
        const {
            submittedCandidateCondition = false,
            interviewCandidateCondition = false,
            offerCondition = false,
        } = result;

        return reply.status(200).send({
            message: 'Candidate progress fetched successfully',
            trace_id: trace_id,
            count: {
                profile_completed: true,
                submitted_candidate_completed: submittedCandidateCondition === 1,
                interview_completed: interviewCandidateCondition === 1,
                offer_completed: offerCondition === 1
            }
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

export async function getCandidates(request: FastifyRequest, reply: FastifyReply) {
    const traceId = generateCustomUUID();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ message: 'Unauthorized - Token not found' });
    }

    const token = authHeader.split(' ')[1];
    const user = await decodeToken(token);
    const userId = user?.sub;
    const userType = user?.userType;

    if (!user) {
        return reply.status(401).send({ message: 'Unauthorized - Invalid token' });
    }

    try {
        const { program_id } = request.params as { program_id: string };
        const {
            page = "1",
            limit = "10",
            sort = "desc",
            candidate_id,
            first_name,
            middle_name,
            last_name,
            name,
            is_active,
            worker_type_id,
            availability_date,
            updatedAt,
            is_talent_pool,
            job_id,
            vendor_name,
            email,
            vendor_id,
            search,
            labour_category_id,
            job_template_id,
            job_category,
            job_title,
            ...filters
        } = request.query as any;

        const userData = await jobRepository.findUser(program_id, userId);
        const user_type = userData[0]?.user_type;
        const hierarchyIdsArray = userData[0]?.associate_hierarchy_ids || [];
        const tenantId = userData[0]?.tenant_id;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        const replacements = {
            program_id,
            limit: limitNum,
            offset,
            candidate_id: candidate_id ? `%${candidate_id}%` : undefined,
            first_name: first_name ? `%${first_name}%` : undefined,
            middle_name: middle_name ? `%${middle_name}%` : undefined,
            last_name: last_name ? `%${last_name}%` : undefined,
            is_active: is_active !== undefined ? is_active === 'true' : undefined,
            is_talent_pool,
            job_id,
            vendor_name,
            email,
            worker_type_id,
            tenantId,
            vendor_id,
            search: search ? `%${search}%` : null,
            labour_category_id,
            job_template_id,
            job_title: job_title ? `%${job_title}%` : null,
            job_category: job_category ? `%${job_category}%` : null,
        };

        let data = null;
        let isVendor = false;

        if (userType === 'super_user') {
            data = await submissionRepo.getCandidatesWithFilters(replacements, isVendor);
        }

        if (user_type) {
            if (user_type.toUpperCase() === "CLIENT" || user_type.toUpperCase() === "MSP") {
                data = await submissionRepo.getCandidatesForClientMSP(replacements, hierarchyIdsArray);
            } else if (user_type.toUpperCase() === "VENDOR") {
                isVendor = true;
                data = await submissionRepo.getCandidatesWithFilters(replacements, isVendor);
            }
        }

        if (!data || !Array.isArray(data.candidates)) {
            console.error("Data or candidates not found or invalid:", data);
        }

        const candidateIds = data.candidates
            .map((candidate: any) => candidate.id)
            .filter(Boolean);

        let workerAssignmentCountData = null;
        if (candidateIds.length > 0) {
            workerAssignmentCountData = await getWorkerAssignmentCount(program_id, candidateIds, token);
        }

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
        data.candidates = data.candidates.map((candidate: any) => {
            const key = (candidate._id || candidate.id || '').toString();
            const assignmentCount = assignmentCountMap.get(key) || {
                current_count: 0,
                previous_count: 0
            };
            return {
                ...candidate,
                assignment_count: assignmentCount
            };
        });

        const totalRecords = data.total_count || 0;
        const totalPages = Math.ceil(totalRecords / limitNum);

        return reply.status(200).send({
            status_code: 200,
            message: "Candidates fetched successfully",
            items_per_page: limitNum,
            total_candidates: totalRecords,
            total_pages: totalPages,
            candidates: data.candidates,
            trace_id: traceId,
        });

    } catch (error: any) {
        console.error("Error in getCandidates:", error);
        return reply.status(500).send({
            status_code: 500,
            trace_id: traceId,
            message: "Internal Server Error",
            error: error.message,
        });
    }
}

export const advanceFilterSubmissionCandidates = async (
    request: FastifyRequest<{ Body: { job_id?: string, job_ids?: string[], search?: string, employment_status?: string, updated_on?: any, worker_type_id?: string, unique_id?: string, page?: string, limit?: string, available_start_date?: string, preferred_location?: string, status?: string, first_name?: string, job_title?: string, job_code?: string }, Params: { program_id: string } }>,
    reply: FastifyReply
) => {
    const traceId = generateCustomUUID();
    const { program_id } = request.params;
    const user = request?.user;
    const userId: any = user?.sub;
    const userType = user?.userType || undefined;
    const userData = await jobRepository.findUser(program_id, userId);
    const user_type = userData[0]?.user_type;
    const tenantId = userData[0]?.tenant_id;

    try {
        const { page, limit, employment_status, updated_on, worker_type_id, unique_id, job_id, job_ids, search, available_start_date, preferred_location, status, first_name, job_title, job_code } = request.body;

        const pageNumber = parseInt(page ?? "1");
        const pageSize = parseInt(limit ?? "10");
        const offset = (pageNumber - 1) * pageSize;

        const dynamicJobIds = await getJobIdsForUserType(program_id, userId, userType);

        const replacements: any = {
            program_id,
            vendor_id: tenantId,
            employment_status: employment_status ? `%${employment_status}%` : null,
            updated_on,
            worker_type_id,
            unique_id,
            job_id: job_id ?? null,
            job_ids: job_ids || (dynamicJobIds.length > 0 ? dynamicJobIds : null),
            limit: pageSize,
            offset,
            search: search ? `%${search}%` : null,
            available_start_date: available_start_date ? `%${available_start_date}%` : null,
            preferred_location: preferred_location ? `%${preferred_location}%` : null,
            status: status ? `%${status}%` : null,
            first_name: first_name ? `%${first_name}%` : null,
            job_title: job_title ? `%${job_title}%` : null,
            job_code: job_code ? `%${job_code}%` : null,

        };
        let result;
        let totalRecords;
        if (userType === undefined && user_type === "vendor") {
            result = await submissionRepo.submiteCandidatesGetAllForVendor(replacements);
            totalRecords = result.length > 0 ? result[0].total_count : 0;
        } else {

            result = await submissionRepo.submiteCandidatesGetAll(replacements);
            totalRecords = result.length > 0 ? result[0].total_count : 0;
        }

        let workflowData: any[] = [];
        let matchedCandidateIds: any[] = [];
        let filteredCandidates: any[] = [];
        const isSuperUser = userType?.toLowerCase?.() === "super_user";
        if (!isSuperUser) {
            const candidateIds = result.map((candidate: any) => candidate.id);
            workflowData = await getWorkflowData(candidateIds, program_id, userId);

            matchedCandidateIds = workflowData.map((item: any) => item.match_candidate_id)
            const allowedStatuses = [
                "PENDING_REHIRE_REVIEW",
                "PENDING_REHIRE_APPROVAL",
                "PENDING_SHORTLIST_REVIEW",
            ];
            filteredCandidates = result
                .filter((candidate: any) => {
                    const isMatched = isSuperUser || matchedCandidateIds.includes(candidate.id);
                    const shouldShowCandidate = !isMatched && allowedStatuses.includes(candidate.status);
                    return !shouldShowCandidate;
                });
            totalRecords = filteredCandidates?.length;
        }

        const formattedCandidates = filteredCandidates.map((candidate: any) => {
            return {
                id: candidate.id,
                program_id: candidate.program_id,
                job_code: candidate.job_code,
                job_id: candidate.job_id,
                job_title: candidate.job_title,
                unique_id: candidate.unique_id,
                candidate_id: candidate.candidate_id,
                first_name: candidate.first_name,
                last_name: candidate.last_name,
                middle_name: candidate.middle_name,
                worker_type_id: candidate.worker_type_id,
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
                interview_flag: candidate.interview_flag === 1
            }
        });

        reply.status(200).send({
            status_code: 200,
            trace_id: traceId,
            message: 'Submission candidates retrieved successfully',
            total: totalRecords,
            page: pageNumber,
            limit: pageSize,
            submission_candidate: formattedCandidates,
        });
    } catch (error: any) {
        reply.status(500).send({
            status_code: 500,
            message: 'Internal Server Error.',
            trace_id: traceId,
            error: error.message,
        })
    }
}

export async function getSubmitedCandidates(request: FastifyRequest, reply: FastifyReply) {
    const traceId = generateCustomUUID();
    const user = request?.user;
    try {
        const { program_id } = request.params as { program_id: string };
        const {
            job_template_ids
        } = request.query as any;

        const jobTemplateIdsArray = job_template_ids ? job_template_ids.split(',') : [];

        const replacements = {
            program_id,
            job_template_ids: jobTemplateIdsArray.length > 0 ? jobTemplateIdsArray : null
        };

        const data = await submissionRepo.getSubmitedCandidatesWithFilters(replacements);

        return reply.status(200).send({
            status_code: 200,
            message: "Candidates fetched successfully",
            total_candidates: data.length ?? 0,
            candidates: data,
            trace_id: traceId,
        });

    } catch (error: any) {
        return reply.status(500).send({
            status_code: 500,
            trace_id: traceId,
            message: "Internal Server Error",
            error: error.message
        });
    }
}
