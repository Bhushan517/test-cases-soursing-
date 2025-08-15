import { QueryTypes } from "sequelize";
import { sequelize } from "../config/instance";
import { databaseConfig } from "../config/db";
import generateCustomUUID from "./genrateTraceId";
import { FastifyReply, FastifyRequest } from "fastify";
import { decodeToken } from "../middlewares/verifyToken";
import axios from "axios";
import JobModel from "../models/job.model";
import JobHistoryModel from "../models/job-history.model";
import jobCandidateModel from "../models/job-candidate.model";
import jobCustomfieldsModel from "../models/job-custom-fields.model";
import jobFoundationDataTypeModel from "../models/job-foundation-data-type.model";
import { JobInterface } from "../interfaces/job.interface";
import jobRateModel from "../models/job-rate.model";
import jobQulificationType from "../models/job-qulification-type.model";
import { distributeAutomatically, distributeJob, tieredDistributeSchedule } from "../controllers/job.controller";
import { NotificationEventCode } from "./notification-event-code";
import { jobTemplateQuery, jobWorkflowQuery } from "../utility/queries";
import JobNotificationService from "../notification/job-notification-service";
import { buildStructuredChanges, createJobHistoryRecord } from "../controllers/job-history.controller";
import { JobComparisonService } from "../repositories/job-history.repository";
import JobDistributionNotificationService from "../notification/job-distribution-notification-service";
import { sendNotification } from "./notificationService";
const config_db = databaseConfig.config.database_config;
let config_base_url = databaseConfig.config.config_url;
const comparisonService = new JobComparisonService();
const jobNotificationService = new JobNotificationService();
const jobDistributionNotificationService = new JobDistributionNotificationService();
export function configBaseUrl(): string | undefined {
    return databaseConfig.config.config_url;
}

interface ModuleRecord {
    id: string;
    [key: string]: any;
}

// const fieldConfigToKeyMapping: Record<string, string | string[]> = {
//     "a0dcbdbc-ead3-42d7-90c1-a84d4c53f012": "labor_category_id",
//     "468b7ce4-303f-4299-8cc6-b80db34f153b": "work_location_id",
//     "c5204d9f-1759-49a2-8441-a505a5452a53": "labor_category_id",
//     "d4ca18c6-3ff3-4f76-8106-970238452fad": "expense_allowed",
//     "01f6627e-b162-4892-af01-d98c2c48608f": "no_positions",
//     "abd03c0d-640e-4d4c-8e23-a796f356ccf2": ["is_expense_allowed", "Counter Offer Budget Increase", "Budget Increase", "maxBillRate", "max_bill_rate"],
//     "433fb525-67ba-4b76-8c76-b93037d83a5c": ["max_bill_rate", "maxBillRate"],
//     "8bd31daf-4cfe-458a-ba00-db5498f71d00": ["foundationDataTypes.foundation_data_ids"],
//     "eae022ad-5753-420a-8a5c-d3c51ff6f4d1": ["foundationDataTypes.foundation_data_type_id"],
//     "14ebe00f-a9aa-44fb-a467-4aa00c3243e7": "timesheet_manager",
//     "f73904a4-4ee2-4653-be79-2d4c087d948b": "job_template_id",
//     "13de82cc-cee0-4b7b-9d1d-bfc15903f4d1": "job_manager",
//     "4eea1135-d028-4f51-b9c9-48a635aef7e0": ["customFields?.value"],
//     "5fdfe905-7961-4c78-9ed8-e7cf8a0583d3": ["customFields?.value"],
//     "f2972c78-bbf6-4649-b137-c515029313e8": "allow_per_identified_s",
//     "51242905-7301-46e7-a743-ba585da940ce": "userType",
//     "44395994-3c32-427a-baa3-16d8164ccb00": "userType",
//     "0fde0cec-0a1a-45df-9c07-b46d51b2f0c4": "expense_manager",
//     "04d8930a-799c-432b-84e9-80553e96ed84": "timesheet_type",
//     "0de9378c-fb63-4731-98b7-b16e409ffdc4": "financial_details.billRateValue.duration_in_days",
//     "595d9b2d-a9c8-4a70-8481-7ab54eda5d38": "foundationDataTypes.foundation_data_type_id",
//     "f2cecac9-7af4-48ed-bf95-c374a8869965": "foundationDataTypes.foundation_data_type_id",
//     "a04be7e5-1eb8-49f5-8af6-caebe0d8ae63": ["custom_fields.id", "custom_fields.custom_field_id"],
//     "abd03c0d-640e-4d4c-8e23-a796f356ccf2 ": "Counter Offer Budget Increase",
//     "58722859-5994-477e-8a4c-9f2669f45598": "net_budget",
//     "93c48420-48a2-47e9-bafa-c30c67e12084": "user_type",
//     "64ab7ddb-f2ae-435e-b105-4dd34284b8a9": ["job type", "job_type_id"],
//     "887b74be-5868-470b-9d99-25098ee1bff8": "Assignment Sourcing Model",
//     "2d90505f-5895-426b-bc92-b66f50c1a66c": "Assignment Manager",
//     "79bcf6ad-9a37-484e-9ae4-4637ff85b423": "Number of Working Days",
//     "9f6107de-c2de-4499-a480-6db92d6f7a25": "Total  Budget With Tax",
//     "a9c7fee4-03f2-4d4f-969c-587d5f1693f1": ["custom_fields.id", "custom_fields.custom_field_id", "Custom Field"],
//     "8b20c216-35a7-4154-93cb-8eb6d1f4c14b": "timesheet_manager",
//     "94cfcce7-36a1-44a4-a402-bb9519d77f41": "expense_manager",
//     "5a9a9444-f531-47f6-9f7a-811454b7bb17": "timesheet_type",
//     "a7e7f237-09d7-4e82-a537-cc7bcae0bd39": "work_location_id",
//     "8839bd6b-db38-407b-be22-3b18b0e0f161": ["Labor Category", "labor_category_id"],
//     "79bcf6ad-9a37-484e-9ae4-4637ff85b424": "Worker Type",
//     "80a9bd53-d347-488c-8710-98e67934a748": "net_budget",
//     "ba97f322-d311-45e3-86f0-c0faa06469b8": ["Duration", "financial_details.billRateValue.duration_in_days"]
// };

const fieldConfigToKeyMapping: Record<string, string | string[]> = {
    "93c48420-48a2-47e9-bafa-c30c67e12084": "user_role",
    "4eea1135-d028-4f51-b9c9-48a635aef7e0": ["customFields?.value", "custom_fields.value"],
    "f2972c78-bbf6-4649-b137-c515029313e8": "allow_per_identified_s",
    "ba97f322-d311-45e3-86f0-c0faa06469b8": "duration",
    "abd03c0d-640e-4d4c-8e23-a796f356ccf2": "expense_allowed,is_expense_allowed",
    "f73904a4-4ee2-4653-be79-2d4c087d948b": "job_template_id,job_template",
    "64ab7ddb-f2ae-435e-b105-4dd34284b8a9": "job_type",
    "a0dcbdbc-ead3-42d7-90c1-a84d4c53f012": "labor_category_id",
    "8bd31daf-4cfe-458a-ba00-db5498f71d00": ["foundationDataTypes.foundation_data_ids", "foundational_data.foundation_data_ids"],
    "01f6627e-b162-4892-af01-d98c2c48608f": "no_positions",
    "80a9bd53-d347-488c-8710-98e67934a748": "budgets.max.net_budget,billRateValue.net_budget,offer_budget",
    "468b7ce4-303f-4299-8cc6-b80db34f153b": "work_location_id",
    "80a9bd53-d347-488c-8710-98e67934a749": "budgets.max.bill_rate",
    "35bcea8a-23af-4872-aae2-a10f9ac26c0c": "is_offer_rate_greater",
    "1738e3e1-7c4a-4d92-8147-0f531f1d9967": "job_managers",
    "14ebe00f-a9aa-44fb-a467-4aa00c3243e7": "timesheet_manager_id",
    "0734a8eb-d0b0-49c0-b02c-b309d5b0e194": "expense_manager_id",
    "5c6709f6-8a57-4c70-938d-57cad476b089": "worker_classification",
    "f02070ec-a800-4316-bbbe-ff4bd4772f08": "vendor_bill_rate"
}

export async function workflowTriggering(
    request: FastifyRequest,
    reply: FastifyReply,
    program_id: any,
    workflows: any[],
    job: any,
    jobData: any,
    jobDatas: any,
    module_name: string,
    is_updated: boolean,
    workflow_job_id: any,
    event_slug: any,
) {
    const trace_id = generateCustomUUID();

    if (!workflows.length) return;

    if (jobData.userId) {
        const user_role = await getUserRole(program_id, jobData?.userId, jobData?.userType);
        jobDatas.user_role = user_role;
        jobData.user_role = user_role;
    }

    if (jobData.net_budget) {
        jobData.net_budget = jobData.net_budget.replace(/[^0-9.]/g, '');
        jobDatas.net_budget = jobDatas.net_budget.replace(/[^0-9.]/g, '');
    }

    console.log('Triggered workflow started.');

    try {
        for (const workflow of workflows) {
            console.log('calling workflow trigger:');
            const workflowData = createWorkflowData(
                workflow,
                job,
                jobData,
                jobDatas,
                module_name,
                is_updated,
                workflow_job_id,
                event_slug
            );
            const eventSlugs = event_slug || workflow?.event_slug;
            console.log('Event slug:', eventSlugs);

            let data = await initialTrigger(
                request,
                reply,
                program_id,
                workflows,
                job,
                jobData,
                jobDatas,
                module_name,
                is_updated,
                workflowData,
                eventSlugs
            );
            return data;
        }
    } catch (error: any) {
        console.error('Error in workflow triggering:', error);
        return error.message;
    }
}

function createWorkflowData(
    workflow: any,
    job: any,
    jobData: any,
    jobDatas: any,
    module_name: string,
    is_updated: boolean,
    workflow_job_id: any,
    event_slug: any
) {
    return {
        status: "pending",
        levels: workflow?.levels,
        event_title: job?.job_id || job.event_title,
        name: workflow?.name,
        event_id: workflow?.event_id,
        flow_type: workflow?.flow_type,
        type: workflow?.type,
        method_id: workflow?.method_id,
        hierarchies: workflow?.hierarchies,
        placement_order: workflow?.placement_order,
        module: workflow?.module,
        initialTrigger: workflow?.initialTrigger,
        config: workflow?.config,
        is_enabled: workflow?.is_enabled,
        created_on: Date.now(),
        updated_on: Date.now(),
        created_by: jobData?.userId || jobDatas?.userId,
        updated_by: jobData?.userId || jobDatas?.userId,
        program_id: workflow?.program_id,
        is_deleted: workflow?.is_deleted,
        flow_count: workflow?.flow_count,
        code: workflow?.code,
        unique_key: jobData?.unique_id || jobData?.job_id || null,
        workflow_id: workflow?.id,
        module_type: module_name,
        events: event_slug || workflow?.event_slug,
        manager: jobDatas?.job_manager_id || jobDatas?.job_manager || jobData?.job_manager,
        job_id: workflow_job_id || job.id,
        is_updated,
        workflow_trigger_id: job.id,
        candidate_id: jobData?.candidate_id || jobData?.id || null
    };
}

async function getUserRole(
    program_id: string,
    userId: string,
    userType: string
): Promise<string> {
    const query =
        userType?.toLowerCase() === "super_user"
            ? `SELECT role_id FROM ${config_db}.user WHERE user_id = :user_id`
            : `SELECT role_id FROM ${config_db}.user WHERE program_id = :program_id AND user_id = :user_id`;

    const replacements: Record<string, any> =
        userType?.toLowerCase() === "super_user"
            ? { user_id: userId }
            : { program_id, user_id: userId };

    const result: { role_id: string }[] = await sequelize.query(query, {
        replacements,
        type: QueryTypes.SELECT,
    });

    return result[0]?.role_id || "";
}

export async function initialTrigger(
    request: FastifyRequest,
    reply: FastifyReply,
    program_id: any,
    rows: any,
    job: any,
    jobData: any,
    jobDatas: any,
    module_name: string,
    is_updated: boolean,
    workflowData: any,
    event_slug: any
) {
    const trace_id = generateCustomUUID();

    const authResult = await validateAuthentication(request, reply);
    if (!authResult.success) {
        return authResult.response;
    }
    const { token, user } = authResult;

    try {
        if (!workflowData.levels || workflowData.levels.length === 0) {
            return;
        }

        console.log('workflow levels:', workflowData.levels);

        const OPERATORS = {
            AND: "78a1ae1f-ab44-43de-a807-d2ae31a7ad31",
            OR: "6dd08625-2d37-4584-8191-1537318ba1cb"
        };

        const firstLevel = workflowData.levels[0];
        const firstLevelMatched = await evaluateLevel(firstLevel, jobData, OPERATORS);

        if (!firstLevelMatched) {
            console.log("First level conditions not matched. Stopping evaluation.");
            return;
        }

        firstLevel.status = "true";
        for (let i = 1; i < workflowData.levels.length; i++) {
            const level = workflowData.levels[i];
            if (!level?.conditions || level.conditions.length === 0) {
                console.log(`Level ${i} has no conditions. Keeping this level.`);
                continue;
            }

            const levelMatched = await evaluateLevel(level, jobData, OPERATORS);

            if (!levelMatched) {
                console.log(`Level ${i} conditions not matched. Removing this level.`);
                workflowData.levels.splice(i, 1);
                i--;
            } else {
                console.log(`Level ${i} conditions matched.`);
            }
        }

        prepareWorkflowForSaving(workflowData);

        const levelData = await getLevelsUsers(
            request, reply,
            rows, job, jobData, jobDatas,
            module_name, is_updated,
            workflowData, program_id, event_slug
        );

        console.log('levelData:', levelData);
        if (levelData === true) {
            let data = await saveWorkflowData(workflowData, request, reply, user);
            return data;
        }
    } catch (error: any) {
        console.error('Error in workflow processing:', error);
        return error.message;
    }
}

async function validateAuthentication(request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return {
            success: false,
            response: reply.status(401).send({ message: 'Unauthorized - Token not found' })
        };
    }

    const token = authHeader.split(' ')[1];
    const user = await decodeToken(token);

    if (!user) {
        return {
            success: false,
            response: reply.status(401).send({ message: 'Unauthorized - Invalid token' })
        };
    }

    return { success: true, token, user };
}

async function evaluateLevel(level: any, jobData: any, OPERATORS: any): Promise<boolean> {
    if (!level.conditions || level.conditions.length === 0) {
        return true;
    }

    if (level.conditions.length === 1 && level.conditions[0].field_config) {
        return await evaluateSingleCondition(level?.conditions[0], jobData);
    }

    return await evaluateMultipleConditions(level?.conditions, jobData, OPERATORS);
}

async function evaluateSingleCondition(condition: any, jobData: any): Promise<boolean> {
    const dynamicKey: any = fieldConfigToKeyMapping[condition.field_config];
    const payloadValue = extractNestedValue(jobData, dynamicKey);
    const targetValues = condition.target_field_value?.values;
    const fieldOperatorId = condition.field_operator_id;

    if (!dynamicKey || payloadValue === undefined || !targetValues) {
        return false;
    }

    const operator = await getOperatorSign(fieldOperatorId);
    if (!operator) {
        return false;
    }

    return compareValues(payloadValue, targetValues, operator);
}

function extractNestedValue(obj: any, path: string | string[]): any {
    console.log('Find key path:', path);
    const parsePath = (pathStr: string): string[] => {
        return pathStr
            .replace(/\?/g, '')
            .split(/[\.\[\]]/)
            .filter(Boolean);
    };

    const traverse = (obj: any, segments: string[]): any => {
        if (!segments.length) return obj;
        const [head, ...tail] = segments;

        if (Array.isArray(obj)) {
            return obj.map(item => traverse(item, segments)).flat(Infinity);
        } else if (obj && typeof obj === 'object') {
            const next = obj[head];
            if (next === undefined) return undefined;
            return traverse(next, tail);
        }

        return undefined;
    };

    const getNestedValue = (obj: any, pathStr: string): any => {
        const segments = parsePath(pathStr);
        return traverse(obj, segments);
    };

    if (typeof path === 'string') {
        const paths = path.split(',').map(p => p.trim()); // Handle multiple keys
        for (const p of paths) {
            const value = getNestedValue(obj, p);
            if (value !== undefined) return value;
        }
        return undefined;
    } else if (Array.isArray(path)) {
        for (const p of path) {
            const value = getNestedValue(obj, p);
            if (value !== undefined) return value;
        }
        return undefined;
    }

    return undefined;
}



async function getOperatorSign(operatorId: string): Promise<string | null> {
    if (!operatorId) return null;

    const query = `
        SELECT sign
        FROM ${config_db}.\`field-operator\`
        WHERE id = :operatorId
        LIMIT 1;
    `;

    try {
        const fieldOperatorData: any = await sequelize.query(query, {
            type: QueryTypes.SELECT,
            replacements: { operatorId },
        });

        return fieldOperatorData[0]?.sign || null;
    } catch (error) {
        console.error(`Error fetching operator sign for id ${operatorId}:`, error);
        return null;
    }
}

function compareValues(value: any, targetValues: any[], operator: string): boolean {
    if (!Array.isArray(targetValues) || targetValues.length === 0) {
        return false;
    }

    if (value === null && targetValues.includes(false)) {
        return true;
    }

    const values = Array.isArray(value) ? value : [value];
    const normalize = (val: any) => (typeof val === "string" ? val?.toLowerCase() : val);
    const normalizedTargetValues = targetValues.map(normalize);
    const normalizedValues = values.map(normalize);

    switch (operator) {
        case '<=':
            return normalizedValues.some(val => normalizedTargetValues.some(target => val <= target));
        case '<':
            return normalizedValues.some(val => normalizedTargetValues.some(target => val < target));
        case '>':
            return normalizedValues.some(val => normalizedTargetValues.some(target => val > target));
        case '>=':
            return normalizedValues.some(val => normalizedTargetValues.some(target => val >= target));
        case '==':
        case '=':
            return normalizedValues.some(val => normalizedTargetValues.some(target => val == target));
        case '!=':
            return normalizedValues.every(val => normalizedTargetValues.every(target => val != target));
        case 'IN':
            return normalizedValues.some(val => normalizedTargetValues.includes(val));
        default:
            console.warn(`Unsupported operator: ${operator}`);
            return false;
    }
}

async function evaluateMultipleConditions(conditions: any[], jobData: any, OPERATORS: any): Promise<boolean> {
    const fieldConditions = conditions.filter((cond: any) => cond.field_config);
    const operatorConditions = conditions.filter(
        (cond: any) => cond.field_operator_id === OPERATORS.AND || cond.field_operator_id === OPERATORS.OR
    );
    const sortedConditions = [...fieldConditions, ...operatorConditions]
        .sort((a, b) => a.placement_order - b.placement_order);

    const groupedConditions = groupConditionsByIndentation(sortedConditions);

    return await evaluateGroupedConditions(groupedConditions, jobData, OPERATORS);
}

function groupConditionsByIndentation(conditions: any[]): any[] {
    const groupedConditions: any[] = [];
    let currentGroup: any[] = [];

    for (let i = 0; i < conditions.length; i++) {
        const currentCondition = conditions[i];

        if (currentCondition.indent === 0) {
            if (currentGroup.length > 0) {
                groupedConditions.push({ group: currentGroup });
                currentGroup = [];
            }

            groupedConditions.push({
                indent: currentCondition?.indent,
                placement_order: currentCondition?.placement_order,
                field_operator_id: currentCondition?.field_operator_id,
            });
        } else {
            currentGroup.push(currentCondition);
        }
    }

    if (currentGroup.length > 0) {
        groupedConditions.push({ group: currentGroup });
    }

    return groupedConditions;
}

async function evaluateGroupedConditions(groupedConditions: any[], jobData: any, OPERATORS: any): Promise<boolean> {
    let finalResult = false;

    for (let i = 0; i < groupedConditions.length; i++) {
        const currentCondition = groupedConditions[i];

        if (currentCondition.group) {
            const groupResult = await evaluateConditionGroup(currentCondition.group, jobData, OPERATORS);

            if (i === 0) {
                finalResult = groupResult;
                continue;
            }

            const previousOperator = groupedConditions[i - 1];

            if (previousOperator.field_operator_id === OPERATORS.AND) {
                finalResult = finalResult && groupResult;
            } else if (previousOperator.field_operator_id === OPERATORS.OR) {
                finalResult = finalResult || groupResult;
            }
        }
    }

    return finalResult;
}

async function evaluateConditionGroup(group: any[], jobData: any, OPERATORS: any): Promise<boolean> {
    const results = await Promise.all(group.map(async (condition) => {
        console.log("Evaluating condition:", condition);
        const fieldKey = fieldConfigToKeyMapping[condition.field_config];
        const jobDataValue = extractNestedValue(jobData, fieldKey);

        if (!fieldKey || jobDataValue === undefined) {
            return false;
        }

        if (condition.field_operator_id) {
            const operatorResult = await evaluateOperator(
                condition.field_operator_id,
                jobDataValue,
                condition.target_field_value
            );

            if (operatorResult) {
                console.log(`Match Found: Condition Values - ${condition.target_field_value?.values}, operator ${operatorResult}, Job Data Value - ${jobDataValue}`);
                return true;
            }

            console.log(`No Match: Condition Values - ${condition.target_field_value?.values}, operator ${operatorResult}, Job Data Value - ${jobDataValue}`);
            return false;
        }

        const matches = condition.target_field_value?.values?.includes(jobDataValue);

        if (matches) {
            console.log(`Match Found: Condition Values - ${condition.target_field_value?.values}, Job Data Value - ${jobDataValue}`);
        } else {
            console.log(`No Match: Condition Values - ${condition.target_field_value?.values}, Job Data Value - ${jobDataValue}`);
        }

        return !!matches;
    }));

    const operatorId = group.find((condition) => condition.indent === 1)?.field_operator_id;

    if (operatorId === OPERATORS.AND) {
        const result = results.every(r => r === true);
        console.log("AND Evaluation - All conditions must match:", result);
        return result;
    } else if (operatorId === OPERATORS.OR) {
        const result = results.some(r => r === true);
        console.log("OR Evaluation - Any condition matching is enough:", result);
        return result;
    }

    const result = results.every(r => r === true);
    console.log("Default AND Evaluation - All conditions must match:", result);
    return result;
}

async function evaluateOperator(operatorId: any, value: any, targetValue: any) {
    if (!operatorId || !targetValue?.values) {
        return null;
    }

    const operator = await getOperatorSign(operatorId);
    if (!operator) {
        return null;
    }

    const result = compareValues(value, targetValue.values, operator);
    return result ? operator : null;
}

function prepareWorkflowForSaving(workflowData: any) {
    if (!workflowData.levels) return;

    workflowData.levels = workflowData?.levels.map((level: any) => ({
        ...level,
        status: "pending",
        recipient_types: level.recipient_types?.map((recipient: any) => ({
            ...recipient,
            status: "pending",
        })),
    }));
}

function makePlacementOrderSequential(levels: any) {
    const sortedLevels = levels.sort((a: any, b: any) => a.placement_order - b.placement_order);
    const uniqueLevels = [];
    const seenOrders = new Set();

    for (const level of sortedLevels) {
        if (!seenOrders.has(level.placement_order)) {
            seenOrders.add(level.placement_order);
            uniqueLevels.push(level);
        }
    }
    return uniqueLevels.map((level, index) => ({ ...level, placement_order: index }));
}

async function updateStatusForEmptyRecipientTypes(levels: any[]) {
    return levels.map(level => {
        if (!level.recipient_types || level.recipient_types.length === 0) {
            return { ...level, status: "complete" };
        }
        return level;
    });
}

async function saveWorkflowData(workflowData: any, request: FastifyRequest, reply: FastifyReply, user: any) {
    try {
        const authHeader = request.headers.authorization;
        const token = authHeader?.split(' ')[1];
        const logged_in_user_id = user.sub;

        let levels = await makePlacementOrderSequential(workflowData?.levels);
        workflowData.levels = levels;

        const config = {
            bypass_duplicate_approver: workflowData?.config?.bypass_duplicate_approver,
            skip_level_if_actor_is_only_approver_in_level: workflowData?.config?.skip_level_if_actor_is_only_approver_in_level,
        };

        console.log("Checking if workflow levels need to be skipped before saving");


        for (const level of workflowData.levels) {
            if (!level.recipient_types || level.recipient_types.length === 0) continue;

            const levelBehavior = level.recipient_types?.[0]?.behaviour?.toUpperCase() || "ALL";

            if (config.skip_level_if_actor_is_only_approver_in_level) {
                let levelUpdated = false;
                let shouldBypassLevel = false;

                level.recipient_types = (level.recipient_types || []).map((recipient: any) => {
                    const includesUser = recipient.meta_data && Object.values(recipient.meta_data).includes(logged_in_user_id);
                    const behavior = recipient.behaviour?.toUpperCase() || levelBehavior;

                    if (includesUser) {
                        if (behavior === "ANY") {
                            shouldBypassLevel = true;
                            return {
                                ...recipient,
                                status: "bypassed",
                                updated_on: Date.now(),
                                notes: `This recipient has been bypassed because the actor matched and behavior is 'ANY'.`,
                            };
                        }
                        if (behavior === "ALL") {
                            levelUpdated = true;
                            return {
                                ...recipient,
                                status: "bypassed",
                                updated_on: Date.now(),
                                notes: `This recipient has been bypassed because the actor matched and behavior is 'ALL'.`,
                            };
                        }
                    }

                    return recipient;
                });

                if (shouldBypassLevel) {
                    levelUpdated = true;
                    level.recipient_types = level.recipient_types.map((recipient: any) => {
                        const includesUser = recipient.meta_data && Object.values(recipient.meta_data).includes(logged_in_user_id);
                        return {
                            ...recipient,
                            status: includesUser ? "bypassed" : "Not needed",
                            updated_on: Date.now(),
                            notes: includesUser
                                ? `This recipient has been bypassed because the actor matched and behavior is 'ANY'.`
                                : `This recipient is not needed because another recipient with 'ANY' behavior matched the actor.`,
                        };
                    });
                }

                if (levelUpdated) {
                    const allRecipientsHandled = level.recipient_types.every(
                        (r: any) => ["bypassed", "reviewed", "approved"].includes(r.status)
                    );

                    const allRecipientsBypassedOrNotNeeded = level.recipient_types.every(
                        (r: any) => ["bypassed", "Not needed"].includes(r.status)
                    );

                    const allBypassed = level.recipient_types.every(
                        (r: any) => r.status === "bypassed"
                    );

                    level.status = allRecipientsHandled
                        ? (allBypassed ? "bypassed" : "completed")
                        : "pending";

                    level.status = allRecipientsBypassedOrNotNeeded ? "bypassed" : level.status;
                    level.updated_on = Date.now();
                }
            }
            const workflow_level = await updateStatusForEmptyRecipientTypes(workflowData.levels)
            const workflowStatus = workflow_level.every((lvl: any) => {
                if (lvl.placement_order === 0) return true;
                return lvl.status === "completed" || lvl.status === "bypassed";
            }) ? "completed" : "pending";

            workflowData.status = workflowStatus;
            workflowData.updated_on = Date.now();

        }
        console.log('Saving workflow data...');
        const response = await axios.post(
            `${config_base_url}/v1/api/program/${workflowData?.program_id}/job-workflow`,
            { ...workflowData, is_updated: workflowData.status === "completed" ? true : false },
            {
                headers: {
                    'Content-Type': 'application/json',
                    authorization: authHeader,
                },
            }
        );

        response.data.flow_type = workflowData?.flow_type;
        response.data.workflow_status = workflowData?.status;
        return response.data;

    } catch (error) {
        console.error("Error saving workflow data:", error);
        throw error;
    }
}

function getNestedValue(obj: any, path?: string): any {
    if (!obj || typeof obj !== "object") return undefined;
    if (!path || typeof path !== "string") return undefined;

    return path.split('.').reduce((acc, key) => acc?.[key], obj);
}


export async function getLevelsUsers(
    request: FastifyRequest, reply: FastifyReply,
    rows: any,
    job: any,
    jobData: any,
    jobDatas: any,
    module_name: string,
    is_updated: boolean,
    workflowData: any,
    program_id: any,
    event_slug: string
) {
    try {

        console.log("Updating the getLevelsUsers", workflowData.levels);

        const traceId = generateCustomUUID();
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            console.error('Unauthorized - Token not found');
            return
        }
        const token = authHeader.split(' ')[1];
        const user = await decodeToken(token);

        if (!user) {
            console.log('Unauthorized - Invalid token');
            return;
        }

        console.log('Updating the getLevelsUsers', JSON.stringify(workflowData.levels));

        if (workflowData.levels?.length > 0) {
            for (const level of workflowData.levels) {
                if (level.recipient_types?.length > 0) {
                    const updatedRecipientTypes = [];
                    let maxNetBudget, minNetBudget
                    if (jobData?.financial_details?.billRateValue?.budget != null) {
                        //offer //submission
                        maxNetBudget = jobData?.financial_details?.billRateValue?.budget
                        minNetBudget = jobData?.financial_details?.billRateValue?.budget

                    } else if (jobDatas.budgets?.max?.net_budget != null) {
                        // job
                        maxNetBudget = jobDatas.budgets?.max?.net_budget;
                        minNetBudget = jobDatas.budgets?.min?.net_budget;
                    }
                    console.log("maxNetBudget is the ", maxNetBudget);


                    for (const recipient of level.recipient_types) {
                        const recipientTypeId = recipient.recipient_type_id;
                        const recipientType = await getRecipientType(recipientTypeId);

                        if (recipientType) {
                            console.log("recipientType name", recipientType.name);
                            switch (recipientType.name) {
                                case "Manager of":
                                    await handleManagerOf(recipient, updatedRecipientTypes, jobDatas, program_id);
                                    break;
                                case "Job Manager":
                                    await handleJobManager(recipient, updatedRecipientTypes, jobDatas);
                                    break;
                                case "Custom Field Supplied User":
                                    await handleCustomFieldSuppliedUser(recipient, updatedRecipientTypes, jobData);
                                    break;
                                case "Top of Financial Authority Chain":
                                    await handleTopOfFinancialAuthorityChain(recipient, updatedRecipientTypes, jobData, jobDatas, program_id, maxNetBudget, minNetBudget);
                                    break;
                                case "Managerial Chain":
                                    await handleManagerialChains(recipient, updatedRecipientTypes, jobData, jobDatas, program_id);
                                    break;
                                case "Master Data Owner":
                                    await handleMasterDataOwner(recipient, updatedRecipientTypes, jobData, jobDatas, program_id);
                                    break;
                                case "Users in Program Role":
                                    await handleUsersInProgramRole(recipient, updatedRecipientTypes, jobData, jobDatas, program_id);
                                    break;
                                case "Financial Authority Chain":
                                    await handleFinancialAuthorityChain(recipient, level, jobData, jobDatas, program_id, maxNetBudget, minNetBudget, workflowData);
                                    break;
                                case "Job Manager On Offer":
                                    await handleJobManagerOnOffer(recipient, updatedRecipientTypes, jobDatas);
                                    break;
                                case "Specific User":
                                    await handleSpecificUser(recipient, updatedRecipientTypes, jobData, jobDatas, program_id);
                                    break;
                                case "Additional MDT Owner":
                                    await handleMasterDataTrackOwner(recipient, updatedRecipientTypes, jobData, jobDatas, program_id)
                                default:
                                    updatedRecipientTypes.push(recipient);
                                    break;
                            }
                        }
                    }
                    console.log("updatedRecipientTypes", updatedRecipientTypes);
                    level.recipient_types = updatedRecipientTypes;
                }
            }
        }
        console.log("workflowData?.levels", workflowData?.levels);

        let hasFilledLevels = workflowData?.levels.some((level: any) =>
            level.recipient_types && level.recipient_types.length > 0
        );

        if (hasFilledLevels) {
            for (const level of workflowData?.levels || []) {
                console.log('level.recipient_types', level.recipient_types);
                if (level.recipient_types?.length > 0) {
                    console.log('Inside IF: recipient_types > 0');
                    const createdLevelId = await createWorkflowTriggeredLevel(level, workflowData, job, program_id, authHeader);
                    await createWorkflowTriggeredRecipients(level?.recipient_types, createdLevelId, workflowData, job, program_id, authHeader);
                } else {
                    console.log('Inside ELSE: recipient_types empty');
                }
            }
        }
        return hasFilledLevels ? true : false;
    } catch (error: any) {
        console.error("Error calculating financial details:", error);
        return error;
    }
}

async function getRecipientType(recipientTypeId: string) {
    const recipientTypeQuery = `
        SELECT id, name
        FROM ${config_db}.recipient_type
        WHERE id = :recipientTypeId
          AND is_enabled = true
        LIMIT 1
    `;
    const recipientTypeData: any = await sequelize.query(recipientTypeQuery, {
        type: QueryTypes.SELECT,
        replacements: { recipientTypeId },
    });
    return recipientTypeData[0];
}

async function handleMspUser(program_id: string, user_id: string, hierarchy_ids: string[]) {
    const userQuery = `SELECT
        tenant_id, user_id, is_all_hierarchy_associate
        FROM ${config_db}.user
        WHERE program_id = :program_id
        AND user_id = :user_id
       AND LOWER(status) = 'active'`;

    const user: any = await sequelize.query(userQuery, {
        type: QueryTypes.SELECT,
        replacements: { program_id, user_id },
    });

    if (user.length === 0 || !user[0]?.tenant_id) {
        console.log(`Skipping level for user ID: ${user_id} as no user is found.`);
        return null;
    }

    const hierarchiesQuery = `SELECT id, managed_by FROM ${config_db}.hierarchies
        WHERE program_id = :program_id
        AND is_enabled = true
        AND (managed_by = :tenant_id OR managed_by IS NULL)`;

    const hierarchies: any = await sequelize.query(hierarchiesQuery, {
        type: QueryTypes.SELECT,
        replacements: { program_id, tenant_id: user[0]?.tenant_id },
    });

    const hasNullManagedBy = hierarchies.every((h: any) => h.managed_by === null);
    if (hasNullManagedBy && user[0]?.is_all_hierarchy_associate === 1) {
        return {
            user_id: user[0]?.user_id,
        };
    }

    const user_hierarchy_ids = hierarchies.map((h: any) => h.id);
    const isMatch = hierarchy_ids.every(id => user_hierarchy_ids.includes(id));

    if (isMatch) {
        return {
            user_id: user[0]?.user_id,
        };
    } else {
        console.log(`Skipping level for user ID: ${user_id} as no hierarchy match is found.`);
        return null;
    }
}

async function handleSpecificUser(recipient: any, updatedRecipientTypes: any[], jobData: any, jobDatas: any, program_id: any) {
    const user_id: any = Object.values(recipient.meta_data)[0];
    const userTypeQuery = `SELECT
    user_type, is_all_hierarchy_associate
    FROM ${config_db}.user
    WHERE program_id = :program_id
    AND user_id = :user_id
    AND LOWER(status) = 'active'`

    const userTypeData: any = await sequelize.query(userTypeQuery, {
        type: QueryTypes.SELECT,
        replacements: { program_id, user_id },
    });
    if (userTypeData.length === 0 || !userTypeData[0]?.user_type) {
        console.log(`Skipping level for user ID: ${user_id} as no user type is found.`);
        return;
    }
    let userId: any = null;
    if (userTypeData[0]?.user_type?.toLowerCase() === 'msp' && userTypeData[0]?.is_all_hierarchy_associate === 1) {
        const user = await handleMspUser(program_id, user_id, jobDatas?.hierarchy_ids || []);
        if (!user?.user_id) {
            console.log(`Skipping level for user ID: ${user_id} as no MSP user match is found.`);
            return;
        }
        userId = user?.user_id;
    } else {
        const userQuery = `
            SELECT u.user_id
            FROM ${config_db}.user u
            WHERE u.program_id = :program_id
            AND u.user_id = :user_id
           AND LOWER(u.status) = 'active'
            AND (
                    u.is_all_hierarchy_associate = true
                    OR (
                        u.is_all_hierarchy_associate = false
                        AND u.associate_hierarchy_ids IS NOT NULL
                        AND NOT EXISTS (
                            SELECT 1
                            FROM JSON_TABLE(:job_hierarchy_ids, '$[*]'
                                COLUMNS (hier_id VARCHAR(36) PATH '$')
                            ) AS jh
                            WHERE JSON_CONTAINS(u.associate_hierarchy_ids, JSON_QUOTE(jh.hier_id)) = 0
                        )
                    )
                )
            LIMIT 1`
        const user: any = await sequelize.query(userQuery, {
            type: QueryTypes.SELECT,
            replacements: { program_id, user_id, job_hierarchy_ids: JSON.stringify(jobDatas?.hierarchy_ids) || '[]' },
        })
        if (user.length === 0 || !user[0]?.user_id) {
            console.log(`Skipping level for user ID: ${user_id} as no user is found.`);
            return;
        }
        userId = user[0]?.user_id;
    }

    for (const [metaKey, metaValue] of Object.entries(recipient.meta_data)) {
        const existingRecipient = updatedRecipientTypes.find(
            (existing) =>
                existing?.recipient_type_id === recipient?.recipient_type_id &&
                existing?.meta_data?.hasOwnProperty(metaKey)
        );

        if (existingRecipient) {
            existingRecipient.meta_data[metaKey] = userId;
        } else {
            recipient.meta_data[metaKey] = userId;
            updatedRecipientTypes.push({ ...recipient });
        }
    }
}

async function handleManagerOf(recipient: any, updatedRecipientTypes: any[], jobDatas: any, program_id: any) {
    for (const metaKey in recipient.meta_data || []) {
        if (recipient.meta_data.hasOwnProperty(metaKey)) {
            const metaValue = recipient.meta_data[metaKey];
            const query = `
                SELECT supervisor
                FROM ${config_db}.user
                WHERE program_id = :program_id
                AND user_id = :jobManagerId
               AND LOWER(status) = 'active'
                LIMIT 1;
            `;
            const userDataDetails: any = await sequelize.query(query, {
                type: QueryTypes.SELECT,
                replacements: { program_id, jobManagerId: jobDatas.job_manager_id },
            });

            const supervisorQuery = `
            SELECT u.user_id
            FROM ${config_db}.user u
            WHERE u.program_id = :program_id
            AND u.user_id = :user_id
           AND LOWER(u.status) = 'active'
            AND (
                    u.is_all_hierarchy_associate = true
                    OR (
                        u.is_all_hierarchy_associate = false
                        AND u.associate_hierarchy_ids IS NOT NULL
                        AND NOT EXISTS (
                            SELECT 1
                            FROM JSON_TABLE(:job_hierarchy_ids, '$[*]'
                                COLUMNS (hier_id VARCHAR(36) PATH '$')
                            ) AS jh
                            WHERE JSON_CONTAINS(u.associate_hierarchy_ids, JSON_QUOTE(jh.hier_id)) = 0
                        )
                    )
                )
            LIMIT 1`

            const supervisorDetails: any = await sequelize.query(supervisorQuery, {
                type: QueryTypes.SELECT,
                replacements: { program_id, user_id: userDataDetails[0]?.supervisor || "", job_hierarchy_ids: JSON.stringify(jobDatas?.hierarchy_ids) || '[]' },
            })

            if (supervisorDetails.length === 0 || !supervisorDetails[0]?.user_id) {
                console.log(`Skipping level for job manager ID: ${jobDatas?.job_manager_id} as no supervisor is found.`);
                return;
            }

            const userRecord = supervisorDetails[0];
            const existingRecipientIndex = updatedRecipientTypes.findIndex(
                (existingRecipient) =>
                    existingRecipient.recipient_type_id === recipient.recipient_type_id &&
                    existingRecipient.meta_data.hasOwnProperty(metaKey)
            );

            if (existingRecipientIndex > -1) {
                updatedRecipientTypes[existingRecipientIndex].meta_data[metaKey] = userRecord?.user_id;
            } else {
                recipient.meta_data[metaKey] = userRecord?.user_id;
                updatedRecipientTypes.push({ ...recipient, managerId: jobDatas?.job_manager_id });
            }
        }
    }
}

async function handleJobManagerOnOffer(recipient: any, updatedRecipientTypes: any[], jobDatas: any) {
    if (!recipient?.meta_data || !jobDatas?.job_manager_id) {
        return;
    }
    const managerId = jobDatas.job_manager_id;

    for (const [metaKey, metaValue] of Object.entries(recipient.meta_data)) {

        const existingRecipient = updatedRecipientTypes.find(
            (existing) =>
                existing?.recipient_type_id === recipient?.recipient_type_id &&
                existing?.meta_data?.hasOwnProperty(metaKey)
        );

        if (existingRecipient) {
            existingRecipient.meta_data[metaKey] = managerId;
        } else {
            recipient.meta_data[metaKey] = managerId;
            updatedRecipientTypes.push({ ...recipient, managerId });
        }
    }
}

async function handleJobManager(recipient: any, updatedRecipientTypes: any[], jobDatas: any) {
    if (!recipient?.meta_data || !jobDatas?.job_manager_id) return;

    const managerId = jobDatas?.job_manager_id;

    for (const [metaKey, metaValue] of Object.entries(recipient.meta_data)) {
        const existingRecipient = updatedRecipientTypes.find(
            (existing) =>
                existing?.recipient_type_id === recipient?.recipient_type_id &&
                existing?.meta_data?.hasOwnProperty(metaKey)
        );

        if (existingRecipient) {
            existingRecipient.meta_data[metaKey] = managerId;
        } else {
            recipient.meta_data[metaKey] = managerId;
            updatedRecipientTypes.push({ ...recipient });
        }
    }
}

async function handleCustomFieldSuppliedUser(recipient: any, updatedRecipientTypes: any[], jobData: any) {
    for (const metaKey in recipient.meta_data) {
        if (!recipient.meta_data.hasOwnProperty(metaKey)) continue;

        const metaValue = recipient.meta_data[metaKey];
        const custom_field = jobData?.customFields || jobData?.custom_fields

        const matchingField = custom_field?.find(
            (field: any) => field.custom_field_id === metaValue
        ) || custom_field?.find(
            (field: any) => field.id === metaValue
        );

        if (!matchingField || !matchingField.value) continue;

        const existingRecipientIndex = updatedRecipientTypes.findIndex(
            (existingRecipient) =>
                existingRecipient.recipient_type_id === recipient.recipient_type_id &&
                existingRecipient.meta_data.hasOwnProperty(metaKey)
        );

        if (existingRecipientIndex > -1) {
            updatedRecipientTypes[existingRecipientIndex].meta_data[metaKey] = matchingField.value;
        } else {
            const newRecipient = { ...recipient };
            newRecipient.meta_data[metaKey] = matchingField.value;
            updatedRecipientTypes.push(newRecipient);
        }
    }
}

async function handleTopOfFinancialAuthorityChain(
    recipient: any,
    updatedRecipientTypes: any[],
    jobData: any,
    jobDatas: any,
    program_id: any,
    maxNetBudget: any,
    minNetBudget: any
) {
    const secondKey = Object.keys(recipient.meta_data)[0];

    const jobManagerId = jobData?.job_manager_id || jobDatas?.job_manager_id;
    const jobHierarchyIds = jobData?.hierarchy_ids || jobDatas?.hierarchy_ids || [];

    if (!jobManagerId) return;

    const financialAuthorityChain: any[] = [];
    let currentManagerId = jobManagerId;
    const visitedManagerIds = new Set();

    while (currentManagerId) {
        if (visitedManagerIds.has(currentManagerId)) {
            console.warn("Cycle detected in manager chain at id:", currentManagerId);
            break;
        }
        visitedManagerIds.add(currentManagerId);

        // Query 1: Manager with is_all_hierarchy_associate = true
        const queryAllHierarchyManager = `
            SELECT 
              u.user_id, u.first_name, u.last_name, u.email, u.avatar, u.supervisor,
              u.min_limit, u.max_limit
            FROM 
              ${config_db}.user u
            WHERE 
              u.program_id = :program_id
              AND u.user_id = :manager_id
              AND LOWER(u.status) = 'active'
              AND u.is_all_hierarchy_associate = true
            LIMIT 1;
        `;

        let managerResult: any[] = await sequelize.query(queryAllHierarchyManager, {
            type: QueryTypes.SELECT,
            replacements: {
                program_id,
                manager_id: currentManagerId,
            },
        });

        // Query 2: Manager with specific hierarchy association
        if (managerResult.length === 0) {
            const querySpecificHierarchyManager = `
                SELECT 
                  u.user_id, u.first_name, u.last_name, u.email, u.avatar, u.supervisor,
                  u.min_limit, u.max_limit
                FROM 
                  ${config_db}.user u
                WHERE 
                  u.program_id = :program_id
                  AND u.user_id = :manager_id
                  AND LOWER(u.status) = 'active'
                  AND u.is_all_hierarchy_associate = false
                  AND u.associate_hierarchy_ids IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1
                    FROM JSON_TABLE(:job_hierarchy_ids, '$[*]'
                      COLUMNS (
                        hier_id VARCHAR(36) PATH '$'
                      )
                    ) AS jh
                    WHERE JSON_CONTAINS(u.associate_hierarchy_ids, JSON_QUOTE(jh.hier_id)) = 0
                  )
                LIMIT 1;
            `;

            managerResult = await sequelize.query(querySpecificHierarchyManager, {
                type: QueryTypes.SELECT,
                replacements: {
                    program_id,
                    manager_id: currentManagerId,
                    job_hierarchy_ids: JSON.stringify(jobHierarchyIds),
                },
            });
        }

        if (managerResult.length > 0) {
            const manager: any = managerResult[0];
            financialAuthorityChain.push({
                user_id: manager?.user_id,
                name: `${manager?.first_name} ${manager?.last_name}`.trim(),
                email: manager?.email,
                avatar: manager?.avatar || null,
                supervisor: manager?.supervisor,
                min_net_budget: manager?.min_limit,
                max_net_budget: manager?.max_limit,
            });
            currentManagerId = manager?.supervisor;
        } else {
            break;
        }
    }

    // 1️⃣ Add topmost manager
    const topManager = financialAuthorityChain.at(-1);
    if (topManager) {
        const topRecipient = {
            status: "pending",
            meta_data: { [secondKey]: topManager.user_id },
            recipient_type_id: recipient?.recipient_type_id,
        };

        const existsTop = updatedRecipientTypes.some(r =>
            r.recipient_type_id === recipient?.recipient_type_id &&
            JSON.stringify(r.meta_data) === JSON.stringify(topRecipient.meta_data)
        );

        if (!existsTop) {
            updatedRecipientTypes.push(topRecipient);
        }
    }

    // 2️⃣ Add manager who matches budget range
    const matchingBudgetManager = financialAuthorityChain.find(manager => {
        const minBudget = parseFloat(manager.min_net_budget ?? 0);
        const maxBudget = parseFloat(manager.max_net_budget ?? 0);
        return minBudget <= minNetBudget && maxBudget >= maxNetBudget;
    });

    if (
        matchingBudgetManager &&
        matchingBudgetManager.user_id !== topManager?.user_id
    ) {
        const budgetRecipient = {
            status: "pending",
            meta_data: { [secondKey]: matchingBudgetManager.user_id },
            recipient_type_id: recipient?.recipient_type_id,
        };

        const existsBudget = updatedRecipientTypes.some(r =>
            r.recipient_type_id === recipient?.recipient_type_id &&
            JSON.stringify(r.meta_data) === JSON.stringify(budgetRecipient.meta_data)
        );

        if (!existsBudget) {
            updatedRecipientTypes.push(budgetRecipient);
        }
    }

    // 3️⃣ Add direct assignment manager (first in chain)
    const directManager = financialAuthorityChain.find(m => m.user_id === jobManagerId);

    if (
        directManager &&
        directManager.user_id !== topManager?.user_id &&
        directManager.user_id !== matchingBudgetManager?.user_id
    ) {
        const directRecipient = {
            status: "pending",
            meta_data: { [secondKey]: directManager.user_id },
            recipient_type_id: recipient?.recipient_type_id,
        };

        const existsDirect = updatedRecipientTypes.some(r =>
            r.recipient_type_id === recipient?.recipient_type_id &&
            JSON.stringify(r.meta_data) === JSON.stringify(directRecipient.meta_data)
        );

        if (!existsDirect) {
            updatedRecipientTypes.push(directRecipient);
        }
    }
}

async function handleManagerialChains(recipient: any, updatedRecipientTypes: any[], jobData: any, jobDatas: any, program_id: any) {
    const secondKey = Object.keys(recipient.meta_data)[1];
    const chainLength = recipient.meta_data[secondKey];
    let newRecipient: any;
    if (chainLength && (jobData?.job_manager_id || jobDatas?.job_manager_id)) {
        const managerialChain = [];
        let currentManagerId = jobData?.job_manager_id || jobDatas?.job_manager_id;

        for (let i = 0; i <= chainLength; i++) {
            if (!currentManagerId) break;
            const managerQuery = `
                SELECT u.user_id, u.first_name, u.last_name, u.email, u.avatar, u.supervisor
                FROM ${config_db}.user u
                WHERE u.user_id = :manager_id
                AND u.program_id = :program_id
               AND LOWER(u.status) = 'active'
                AND (
                    u.is_all_hierarchy_associate = true
                    OR (
                        u.is_all_hierarchy_associate = false
                        AND u.associate_hierarchy_ids IS NOT NULL
                        AND NOT EXISTS (
                            SELECT 1
                            FROM JSON_TABLE(:job_hierarchy_ids, '$[*]'
                                COLUMNS (hier_id VARCHAR(36) PATH '$')
                            ) AS jh
                            WHERE JSON_CONTAINS(u.associate_hierarchy_ids, JSON_QUOTE(jh.hier_id)) = 0
                        )
                    )
                )
                LIMIT 1;`;
            const managerResult = await sequelize.query(managerQuery, {
                type: QueryTypes.SELECT,
                replacements: { manager_id: currentManagerId, program_id, job_hierarchy_ids: JSON.stringify(jobData?.hierarchy_ids || jobDatas?.hierarchy_ids) || '[]' },
            });
            if (managerResult.length > 0) {
                const manager: any = managerResult[0];
                managerialChain.push({
                    user_id: manager?.user_id,
                    name: `${manager?.first_name} ${manager?.last_name}`.trim(),
                    email: manager?.email,
                    avatar: manager?.avatar || null,
                });
                currentManagerId = manager?.supervisor;
            } else {
                break;
            }
        }

        if (managerialChain) {
            const selectedManager = managerialChain.slice(0, Math.max(chainLength + 1, managerialChain.length));
            for (let user of selectedManager) {
                newRecipient = {
                    status: "pending",
                    meta_data: { [secondKey]: user?.user_id },
                    recipient_type_id: recipient?.recipient_type_id,
                };
                const existingRecipientIndex = updatedRecipientTypes.findIndex(
                    (existingRecipient) =>
                        existingRecipient.recipient_type_id === recipient.recipient_type_id &&
                        JSON.stringify(existingRecipient.meta_data) === JSON.stringify(newRecipient.meta_data)
                );

                if (existingRecipientIndex === -1) {
                    updatedRecipientTypes.push(newRecipient);
                }
            }
        }

    }
}

async function handleMasterDataOwner(recipient: any, updatedRecipientTypes: any, jobData: any, jobDatas: any, program_id: string) {
    for (const metaKey in recipient?.meta_data) {
        if (recipient.meta_data.hasOwnProperty(metaKey)) {
            const metaValue = recipient.meta_data[metaKey];
            const foundation_data = jobData?.foundationDataTypes || jobData?.foundational_data
            const machingData = foundation_data?.find(
                (field: any) => field.foundation_data_type_id === metaValue
            );

            const foundationalDataQuery = `
            SELECT manager_ids
            FROM ${config_db}.master_data
            WHERE program_id =:program_id
            AND foundational_data_type_id = :master_data_type_id
            AND id IN (:master_data_ids)
            `;
            const foundationalDataRecords: any = await sequelize.query(foundationalDataQuery, {
                type: QueryTypes.SELECT,
                // replacements: { program_id, master_data_type_id: metaValue, master_data_ids: machingData?.foundation_data_ids || [] },
                replacements: { program_id, master_data_type_id: metaValue || '', master_data_ids: machingData?.foundation_data_ids?.length ? machingData.foundation_data_ids : [-1], }
            });

            const allManagerIds = foundationalDataRecords
                .flatMap((record: { manager_ids: string[] }) => record.manager_ids || []);

            const matchedUsers: any[] = [];
            const seenUserIds = new Set<string>();

            const jobHierarchyJson = JSON.stringify(jobData?.hierarchy_ids || jobDatas?.hierarchy_ids || []);

            for (const managerId of allManagerIds) {
                const userQuery = `
                SELECT
                    u.user_id,
                    u.email,
                    u.first_name,
                    u.middle_name,
                    u.last_name,
                    u.user_type,
                    u.is_all_hierarchy_associate,
                    u.associate_hierarchy_ids
                FROM ${config_db}.user u
                WHERE u.program_id = :program_id
                  AND u.id = :userId
                 AND LOWER(u.status) = 'active'
                  AND (
                      u.is_all_hierarchy_associate = true
                      OR (
                          u.is_all_hierarchy_associate = false
                          AND u.associate_hierarchy_ids IS NOT NULL
                          AND JSON_CONTAINS(
                              JSON_UNQUOTE(u.associate_hierarchy_ids),
                              :job_hierarchy_ids
                          ) = 1
                      )
                  );`;
                const users: any[] = await sequelize.query(userQuery, {
                    type: QueryTypes.SELECT,
                    replacements: { userId: managerId, program_id, job_hierarchy_ids: jobHierarchyJson },
                });

                for (const user of users) {
                    if (!seenUserIds.has(user.user_id)) {
                        matchedUsers.push(user);
                        seenUserIds.add(user.user_id);
                    }
                }
            }

            const newRecipientTypes = matchedUsers.map((user: any) => ({
                status: "pending",
                behaviour: recipient?.behaviour,
                meta_data: { [metaKey]: user?.user_id },
                recipient_type_id: recipient?.recipient_type_id,
            }));

            if (newRecipientTypes) {
                updatedRecipientTypes.push(
                    ...newRecipientTypes.filter((item) => item.recipient_type_id)
                );
            }
        }
    }
}

async function handleUsersInProgramRole(recipient: any, updatedRecipientTypes: any, jobData: any, jobDatas: any, program_id: any) {
    for (const metaKey in recipient.meta_data) {
        if (recipient.meta_data.hasOwnProperty(metaKey)) {
            const metaValue = recipient.meta_data[metaKey];
            const userMappingQuery = `
                SELECT id, user_id
                FROM ${config_db}.user_mappings
                WHERE role_id = :metaValue
            `;
            const userMapping: any = await sequelize.query(userMappingQuery, {
                type: QueryTypes.SELECT,
                replacements: { metaValue },
            });

            const matchedUsers: any[] = [];
            for (const record of userMapping) {
                const userId = record?.user_id;
                const userTypeQuery = `SELECT
                user_type, is_all_hierarchy_associate
                FROM ${config_db}.user
                WHERE program_id = :program_id
                AND user_id = :user_id
                AND LOWER(status) = 'active'`

                const userTypeData: any = await sequelize.query(userTypeQuery, {
                    type: QueryTypes.SELECT,
                    replacements: { program_id, user_id: userId },
                });
                if (userTypeData.length === 0 || !userTypeData[0]?.user_type) {
                    console.log(`Skipping level for user ID: ${userId} as no user type is found.`);
                    continue;
                }

                if (userTypeData[0]?.user_type?.toLowerCase() === 'msp' && userTypeData[0]?.is_all_hierarchy_associate === 1) {
                    console.log('MSP user insidee')
                    const user = await handleMspUser(program_id, userId, jobDatas?.hierarchy_ids || []);
                    if (!user) {
                        console.log(`Skipping level for user ID: ${userId} as no MSP user match is found.`);
                        continue;
                    }
                    matchedUsers.push(user);
                } else {
                    const userQuery = `
                SELECT
                    u.user_id,
                    u.email,
                    u.first_name,
                    u.middle_name,
                    u.last_name,
                    u.user_type,
                    u.is_all_hierarchy_associate,
                    u.associate_hierarchy_ids
                FROM ${config_db}.user u
                WHERE u.program_id = :program_id
                  AND u.user_id = :userId
                  AND LOWER(u.status) = 'active'
                   AND (
                u.is_all_hierarchy_associate = true
                OR (
                    u.is_all_hierarchy_associate = false
                    AND u.associate_hierarchy_ids IS NOT NULL
                    AND NOT EXISTS (
                        SELECT 1
                        FROM JSON_TABLE(:job_hierarchy_ids, '$[*]'
                            COLUMNS (hier_id VARCHAR(36) PATH '$')
                        ) AS jh
                        WHERE JSON_CONTAINS(u.associate_hierarchy_ids, JSON_QUOTE(jh.hier_id)) = 0
                    )
                )
            )`;
                    const jobHierarchyJson = JSON.stringify(jobData?.hierarchy_ids || jobDatas?.hierarchy_ids || jobData.hierarchy) || '[]';
                    const users: any = await sequelize.query(userQuery, {
                        type: QueryTypes.SELECT,
                        replacements: {
                            userId: userId,
                            program_id: program_id,
                            job_hierarchy_ids: jobHierarchyJson,
                        },
                    });
                    if (users && users?.length > 0) {
                        matchedUsers.push(...users);
                    }
                    console.log('user is nowwww', users)
                }
            }
            const newRecipientTypes = matchedUsers.map((user: any) => ({
                status: "pending",
                behaviour: recipient?.behaviour,
                meta_data: {
                    ...recipient?.meta_data,
                    [metaKey]: user?.user_id,
                },
                recipient_type_id: recipient?.recipient_type_id,
            }));

            if (newRecipientTypes) {
                updatedRecipientTypes.push(
                    ...newRecipientTypes.filter((item) => item.recipient_type_id)
                );
            }
        }
    }
}

async function handleFinancialAuthorityChain(recipient: any, level: any, jobData: any, jobDatas: any, program_id: any, maxNetBudget: any, minNetBudget: any, workflowData: any) {
    const secondKey = Object.keys(recipient.meta_data)[0];
    const financialAuthorityChain = [];
    let currentManagerId = jobData?.job_manager || jobData?.job_manager_id || jobDatas?.job_manager_id;

    const visitedManagerIds = new Set();

    while (currentManagerId) {
        if (visitedManagerIds.has(currentManagerId)) {
            console.warn("Cycle detected with managerId:", currentManagerId, "breaking loop!");
            break;
        }
        visitedManagerIds.add(currentManagerId);
        const managerQuery = `
        SELECT u.user_id, u.first_name, u.last_name, u.email, u.avatar, u.supervisor
        FROM ${config_db}.user u
        WHERE u.user_id = :manager_id
          AND u.program_id = :program_id
         AND LOWER(u.status) = 'active'
          AND (
              u.is_all_hierarchy_associate = true
              OR (
                  u.is_all_hierarchy_associate = false
                  AND u.associate_hierarchy_ids IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1
                      FROM JSON_TABLE(:job_hierarchy_ids, '$[*]'
                          COLUMNS (hier_id VARCHAR(36) PATH '$')
                      ) AS jh
                      WHERE JSON_CONTAINS(u.associate_hierarchy_ids, JSON_QUOTE(jh.hier_id)) = 0
                  )
              )
          )
        LIMIT 1;`;
        const managerResult = await sequelize.query(managerQuery, {
            type: QueryTypes.SELECT,
            replacements: {
                manager_id: currentManagerId,
                program_id,
                job_hierarchy_ids: JSON.stringify(jobData?.hierarchy_ids || jobDatas.hierarchy_ids) || '[]',
            },
        });

        if (managerResult.length > 0) {
            const manager: any = managerResult[0];
            financialAuthorityChain.push({
                user_id: manager?.user_id,
                name: `${manager?.first_name} ${manager?.last_name}`.trim(),
                email: manager?.email,
                avatar: manager?.avatar || null,
                supervisor: manager?.supervisor,
            });
            currentManagerId = manager?.supervisor;
        } else {
            break;
        }
    }
    console.log("financialAuthorityChain", financialAuthorityChain);

    if (financialAuthorityChain.length > 0) {
        const newLevels = [];
        const matchedUsers: any = [];
        const firstConditionMatchedUser = [];
        const secondConditionMatchedUser = [];

        for (const user of financialAuthorityChain) {
            const userQueryMinMax = `
            SELECT user_id, min_limit, max_limit, is_allow_unlimited_authority, first_name, last_name
            FROM ${config_db}.user
            WHERE program_id = :program_id
            AND user_id = :user_id
           AND LOWER(status) = 'active'
            AND (
                (:max_budget >= min_limit AND :max_budget > 0 AND :max_budget <= max_limit)
            )
            ORDER BY min_limit DESC
            LIMIT 1;`;

            const fetchAllSupervisor = `
            SELECT user_id, min_limit, max_limit, first_name, last_name
            FROM ${config_db}.user
            WHERE program_id = :program_id
            AND user_id = :user_id
            AND LOWER(status) = 'active'
            LIMIT 1;`;

            const userQueryAuthorityFlag = `
            SELECT user_id, min_limit, max_limit, is_allow_unlimited_authority, first_name, last_name
            FROM ${config_db}.user
            WHERE program_id = :program_id
            AND user_id = :user_id
            AND LOWER(status) = 'active'
            AND is_allow_unlimited_authority = true
            LIMIT 1;`;

            let user_id = user.user_id;
            console.log("user is the  ", user);

            let userData: any = await sequelize.query(userQueryMinMax, {
                type: QueryTypes.SELECT,
                replacements: { program_id, user_id, max_budget: maxNetBudget, min_budget: minNetBudget },
            });
            console.log("userData is the ", userData);

            let allUserData: any = await sequelize.query(fetchAllSupervisor, {
                type: QueryTypes.SELECT,
                replacements: { program_id, user_id, max_budget: maxNetBudget, min_budget: minNetBudget },
            });

            if (userData.length < 0) {
                userData = await sequelize.query(userQueryAuthorityFlag, {
                    type: QueryTypes.SELECT,
                    replacements: { program_id, user_id },
                });
            }

            if (userData.length > 0) {
                const userDetail = userData[0];
                firstConditionMatchedUser.push(userDetail);
            }

            const allUserDetails = allUserData[0];
            secondConditionMatchedUser.push(allUserDetails);
        }

        // Find the user with the highest max limit
        const userWithHighestMaxLimit = firstConditionMatchedUser.length > 0
            ? firstConditionMatchedUser.reduce((highest, user) => {
                return user.max_limit > highest.max_limit ? user : highest;
            }, firstConditionMatchedUser[0])
            : null; // Set to null if no user found

        let matchedUser = [];
        if (userWithHighestMaxLimit) {
            matchedUser = secondConditionMatchedUser.filter((data: any) =>
                data.max_limit <= userWithHighestMaxLimit.max_limit
            );
        }

        for (let allMatchedUser of matchedUser) {
            matchedUsers.push(allMatchedUser);
        }

        const newRecipientTypes = matchedUsers.map((user: any) => ({
            status: "pending",
            behaviour: recipient?.behaviour,
            meta_data: {
                ...recipient?.meta_data,
                [secondKey]: user?.user_id,
            },
            recipient_type_id: recipient?.recipient_type_id,
        }));
        console.log("finacial authority chain newRecipientTypes", newRecipientTypes);

        if (newRecipientTypes.length > 0) {
            newLevels.push({
                status: "pending",
                placement_order: level.placement_order + 1,
                recipient_types: newRecipientTypes,
            });
        }

        const existingLevels = [...workflowData.levels];
        existingLevels.forEach((existingLevel) => {
            if (existingLevel.placement_order > level.placement_order) {
                existingLevel.placement_order += newLevels.length;
            }
        });

        workflowData.levels = [...existingLevels, ...newLevels];
        workflowData.levels.sort((a: any, b: any) => a.placement_order - b.placement_order);
    }
}

async function handleMasterDataTrackOwner(recipient: any, updatedRecipientTypes: any, jobData: any, jobDatas: any, program_id: string) {
    for (const metaKey in recipient?.meta_data) {
        if (recipient.meta_data.hasOwnProperty(metaKey)) {
            const metaValue = recipient.meta_data[metaKey];
            const foundation_data = jobData?.foundationDataTypes || jobData?.foundational_data
            const machingData = foundation_data?.find(
                (field: any) => field.foundation_data_type_id === metaValue
            );

            const foundationalDataTypeQuery = `
                SELECT
                    configuration
                FROM 
                    ${config_db}.master_data_type
                WHERE
                    program_id = :program_id
                    AND id = :master_data_type_id
            `
            const foundationalDataType: any = await sequelize.query(
                foundationalDataTypeQuery,
                {
                    type: QueryTypes.SELECT,
                    replacements: {
                        program_id,
                        master_data_type_id: metaValue || ''
                    }
                }
            );

            const is_track_owner = foundationalDataType?.[0]?.configuration?.track_owner || false;
            if (!is_track_owner) {
                continue;
            }

            const foundationalDataQuery = `
            SELECT additional_mdt_owner
            FROM ${config_db}.master_data
            WHERE program_id =:program_id
            AND foundational_data_type_id = :master_data_type_id
            AND id IN (:master_data_ids)
            `;
            const foundationalDataRecords: any = await sequelize.query(foundationalDataQuery, {
                type: QueryTypes.SELECT,
                replacements: { program_id, master_data_type_id: machingData?.foundation_data_type_id || '', master_data_ids: machingData?.foundation_data_ids?.length ? machingData.foundation_data_ids : [-1], }
            });

            const allManagerIds = foundationalDataRecords
                .flatMap((record: { additional_mdt_owner: string[] }) => record.additional_mdt_owner || []);

            const matchedUsers: any[] = [];
            const seenUserIds = new Set<string>();

            const jobHierarchyJson = JSON.stringify(jobData?.hierarchy_ids || jobDatas?.hierarchy_ids || []);

            for (const managerId of allManagerIds) {
                const userQuery = `
                SELECT
                    u.user_id,
                    u.email,
                    u.first_name,
                    u.middle_name,
                    u.last_name,
                    u.user_type,
                    u.is_all_hierarchy_associate,
                    u.associate_hierarchy_ids
                FROM ${config_db}.user u
                WHERE u.program_id = :program_id
                  AND u.id = :userId
                 AND LOWER(u.status) = 'active'
                  AND (
                      u.is_all_hierarchy_associate = true
                      OR (
                          u.is_all_hierarchy_associate = false
                          AND u.associate_hierarchy_ids IS NOT NULL
                          AND JSON_CONTAINS(
                              JSON_UNQUOTE(u.associate_hierarchy_ids),
                              :job_hierarchy_ids
                          ) = 1
                      )
                  );`;
                const users: any[] = await sequelize.query(userQuery, {
                    type: QueryTypes.SELECT,
                    replacements: { userId: managerId, program_id, job_hierarchy_ids: jobHierarchyJson },
                });

                for (const user of users) {
                    if (!seenUserIds.has(user.user_id)) {
                        matchedUsers.push(user);
                        seenUserIds.add(user.user_id);
                    }
                }
            }

            const newRecipientTypes = matchedUsers.map((user: any) => ({
                status: "pending",
                behaviour: recipient?.behaviour,
                meta_data: { [metaKey]: user?.user_id },
                recipient_type_id: recipient?.recipient_type_id,
            }));

            if (newRecipientTypes) {
                updatedRecipientTypes.push(
                    ...newRecipientTypes.filter((item) => item.recipient_type_id)
                );
            }
        }
    }
}

async function createWorkflowTriggeredLevel(level: any, workflowData: any, job: any, program_id: any, authHeader: string) {
    const payload = {
        workflow_id: workflowData?.workflow_id,
        placement_order: level?.placement_order,
        job_id: job.id,
        workflow_trigger_id: job.id,
        program_id,
    };
    const response = await axios.post(
        `${config_base_url}/v1/api/program/${workflowData?.program_id}/workflow-triggered-level`,
        payload,
        {
            headers: {
                'Content-Type': 'application/json',
                authorization: authHeader,
            },
        }
    );
    return response.data.workflow_level.id;
}

async function createWorkflowTriggeredRecipients(recipientTypes: any[], levelId: string, workflowData: any, job: any, program_id: any, authHeader: string) {
    const recipientData = recipientTypes.map((recipient: any) => ({
        level_id: levelId,
        workflow_id: workflowData?.workflow_id,
        program_id,
        recipient_type_id: recipient?.recipient_type_id,
        meta_data: recipient?.meta_data,
        job_id: job.id,
        workflow_trigger_id: job?.id,
        behaviour: recipient?.behaviour,
    }));

    for (const recipient of recipientData) {
        try {
            await axios.post(
                `${config_base_url}/v1/api/program/${workflowData?.program_id}/workflow-triggered-recipient-type`,
                recipient,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        authorization: authHeader,
                    },
                }
            );
        } catch (error) {
            console.error("Error inserting recipients:", error);
        }
    }
}

export async function updateJobForWorkflow(request: FastifyRequest, reply: FastifyReply, existingJob: any, sequelize: any, event_slug?: string) {
    try {
        const workflows = await fetchJobWorkflows(existingJob.id, sequelize, existingJob.program_id, event_slug);
        console.log('Worfklowwww', JSON.stringify(workflows));
        if (!workflows.length) {
            return {
                status: 'OPEN',
                updated: false,
            };
        }
        const updatedStatus = await determineJobsStatus(workflows, existingJob);
        console.log('updated status', updatedStatus);
        return {
            status: updatedStatus,
            updated: true,
        };
    } catch (error) {
        console.error('Error updating job status:', error);
        return { message: 'Error updating job status', error, updated: false };
    }
}

async function fetchJobWorkflows(workflowTriggerId: string, sequelize: any, program_id: string, event_slug?: string) {
    const workflowQuery = `
        SELECT id, workflow_trigger_id, flow_type
        FROM ${config_db}.workflow
        WHERE program_id = :program_id
        AND workflow_trigger_id = :workflow_trigger_id
        AND is_deleted = false
        AND status ='pending'
        ${event_slug ? `AND events = '${event_slug}'` : ''}
        AND is_enabled = true
    `;

    return await sequelize.query(workflowQuery, {
        type: QueryTypes.SELECT,
        replacements: { program_id, workflow_trigger_id: workflowTriggerId },
    });
}

async function determineJobsStatus(workflows: any[], existingJob: any) {
    for (const workflow of workflows) {
        if (workflow.flow_type === 'Review') {
            await existingJob.update({ status: "PENDING_REVIEW" });
            return "PENDING_REVIEW";
        } else if (workflow.flow_type === 'Approval') {
            await existingJob.update({ status: "PENDING_APPROVAL" });
            return "PENDING_APPROVAL";
        }
    }

    // If no workflow with 'Review' or 'Approval' was found, set status to 'OPEN'
    await existingJob.update({ status: "OPEN" });
    return "OPEN";
}

////////// Workflow review update ///////////////////
export const updateWorkflowReview = async (request: FastifyRequest, reply: FastifyReply) => {
    const { program_id, id, job_workflow_id } = request.params as { program_id: string, id: string, job_workflow_id: string };
    const jobData = request.body as any;
    const traceId = generateCustomUUID();
    const transaction = await sequelize.transaction();
    const authHeader = request.headers.authorization;
    console.log('inside the worlflow update reviwwww')
    if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ message: 'Unauthorized - Token not found' });
    }

    const token = authHeader.split(' ')[1];
    const user = await decodeToken(token);

    if (!user) {
        return reply.status(401).send({ message: 'Unauthorized - Invalid token' });
    }

    const userId: any = user?.sub;
    const userType: any = user?.userType;
    jobData.userId = userId;
    jobData.userType = userType;
    const isSuperUser = user?.userType === "super_user";

    try {
        const userDetails = await getUsersStatus(sequelize, userId);
        const userData = userDetails[0];

        const existingJob = await JobModel.findOne({ where: { program_id, id }, transaction });
        const oldStatus = existingJob?.status;
        if (!existingJob) {
            return reply.status(404).send({
                status_code: 404,
                message: 'Job not found.',
                trace_id: traceId,
            });
        }
        const job_template_id = jobData.job_template_id
        const jobTemplate: any = await jobTemplateQuery(job_template_id, program_id);
        if (!jobTemplate) {
            return reply.status(404).send({
                status_code: 404,
                message: 'Job template not found.',
                trace_id: traceId,
            });
        }

        const updates = jobData.updates;
        let result: any
        let workflows: any
        if (updates) {
            const workflow = await fetchWorkflow(sequelize, program_id, job_workflow_id);
            if (!workflow) {
                return reply.status(404).send({
                    status_code: 404,
                    message: "Workflow data not found!",
                    trace_id: traceId,
                });
            }

            const impersonator_id = user.impersonator?.id || null;
            const updatedLevels = await updateWorkflowLevels(workflow, updates, userData, impersonator_id, isSuperUser, sequelize);
            if (updatedLevels) {
                const workflowStatus = determineWorkflowStatus(workflow.levels);
                await updateExternalWorkflow(workflow, workflowStatus, program_id, job_workflow_id, authHeader);

                if (workflowStatus === "completed") {
                    let workflow_slug = workflow.events;
                    if (workflow.flow_type.toLowerCase() === 'review') {
                        console.log('Inside the apporval trigger for workflow.')

                        const EVENT_SLUG = workflow_slug;
                        const module_name = "Job";
                        const approval_method = 'approval'
                        const TYPE = "workflow"
                        const placement_order = "0"
                        const moduleId = await fetchModuleId(module_name);
                        const eventId = await fetchEventId(moduleId, EVENT_SLUG, TYPE);
                        const workflow: any = await getPendingWorkflow(jobData, moduleId, eventId, program_id, placement_order, approval_method)
                        console.log('workflow', workflow);
                        console.log('moduleId', moduleId);
                        console.log('eventId', eventId)
                        if (jobData.status != "DRAFT") {
                            const event_slug = workflow_slug;
                            let hasEmptyLevels = workflow?.rows.some((row: any) =>
                                !row.levels ||
                                row?.levels?.length === 0 ||
                                row.levels?.every((level: any) => !level?.recipient_types || level?.recipient_types?.length === 0)
                            );
                            console.log('has empty levelsss', hasEmptyLevels);
                            if (!hasEmptyLevels) {
                                workflows = await workflowTriggering(request, reply, program_id, workflow?.rows, existingJob, jobData, jobData, module_name, false, jobData.id, event_slug);
                                if (workflows) {
                                    if (workflows.workflow_status === "completed") {
                                        await existingJob.update({ status: "OPEN" });
                                    } else {
                                        await existingJob.update({ status: "PENDING_APPROVAL" });
                                    }
                                } else {
                                    await existingJob.update({ status: "OPEN" });
                                }
                            }
                        }
                    }
                    result = await handleWorkflowCompletion(workflow, request, reply, existingJob, sequelize, program_id, user, traceId, token);
                }
            }

        }

        if (jobTemplate.is_tiered_distribute_submit && jobData.allow_per_identified_s !== true) {
            try {
                const job = existingJob.dataValues;
                const flowType = workflows?.flow_type?.toLowerCase?.();
                const isApprovalFlow = flowType === "approval";
                const status = isApprovalFlow ? "PENDING_APPROVAL_SOURCING" : "SOURCING";

                const shouldDistribute = !isApprovalFlow || jobTemplate.is_review_configured_or_submit;

                if (shouldDistribute) {
                    await tieredDistributeSchedule({ jobTemplate, job, program_id, userId, status });
                    result.status = status;
                } else {
                    console.log("Distribution upon final approval");
                }
            } catch (error) {
                console.error("Error in background tiered distribution:", error);
            }
        }
        
        const updatedJob = await updateJobDetails(jobData, program_id, id, userId, transaction, result?.status);
        if (updatedJob) {
            const workflow = await fetchWorkflow(sequelize, program_id, job_workflow_id);
            const workflowStatus = determineWorkflowStatus(workflow.levels);
            if (jobTemplate.is_automatic_distribution && jobTemplate.is_review_configured_or_submit && jobData.allow_per_identified_s !== true && workflowStatus === "completed") {
                let job = existingJob.dataValues;
                distributeAutomatically({ jobTemplate, job, program_id, userId });
                jobDistributionNotificationService.distributeAutomaticallyNotification({ user, job, program_id, traceId, token, sequelize, reply, sendNotification, jobTemplate });
            }

            if (jobTemplate.is_automatic_distribution && jobTemplate.is_review_configured_or_submit && jobData.allow_per_identified_s === true && workflowStatus === "completed") {
                const candidates = jobData.candidates;
                const jobId = existingJob?.dataValues?.id;

                const status = workflows?.flow_type?.toLowerCase?.() === "approval"
                    ? "PENDING_APPROVAL_SOURCING"
                    : "SOURCING";

                for (const candidate of candidates ?? []) {
                    distributeJob(candidate, program_id, jobId, userId, jobTemplate, status);
                }
            }

            await transaction.commit();

            reply.send({
                status_code: 200,
                message: 'Job review done successfully',
                id: id,
                trace_id: traceId,
            });

            setImmediate(async () => {
                try {
                    await workflowCreateJobHistory(updatedJob, existingJob, program_id, id, userId, null);

                    const newUpdatedJob: any = await JobModel.findOne({ where: { program_id, id }, raw: true });

                    const changes: any = {
                        ...(await comparisonService.compareJobPayload(existingJob.toJSON(), newUpdatedJob)),
                        status: {
                            newValue: newUpdatedJob?.status,
                            oldValue: oldStatus,
                        },
                    };

                    await createJobHistoryRecord(
                        { id, program_id },
                        newUpdatedJob,
                        userId || "",
                        null,
                        "Job Status Update",
                        buildStructuredChanges(changes),
                        newUpdatedJob?.status
                    );
                    console.log(`Background history creation completed for job ${id}`);
                } catch (err) {
                    console.error("Background history creation failed:", err);
                }
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
        });
    }
};



// Helper functions
export const fetchWorkflow = async (sequelize: any, program_id: string, job_workflow_id: string) => {
    const query = `
        SELECT *
        FROM ${config_db}.workflow
        WHERE id = :job_workflow_id
        AND program_id = :program_id
        LIMIT 1;
    `;

    const workflowData = await sequelize.query(query, {
        type: QueryTypes.SELECT,
        replacements: { job_workflow_id, program_id },
    });

    return workflowData[0];
};


export const updateWorkflowLevels = async (workflow: any, updates: any, userData: any, impersonator_id: any, isSuperUser: boolean, sequelize: any) => {

    let updatedLevels = false;
    let levelFound = false;

    const isUserActive = async (userId: string) => {
        if (!userId) return false;

        try {
            let userQuery = `SELECT status FROM ${config_db}.user WHERE user_id = :userId`
            const user: any = await sequelize.query(userQuery, {
                replacements: { userId },
                type: QueryTypes.SELECT,
            });
            console.log('user status check:', user)
            return user && user?.[0]?.status?.toLowerCase() === 'active';
        } catch (error) {
            console.error('Error checking user active status:', error);
            return true;
        }
    };

    const getUserIdsFromLevel = (level: any) => {
        const userIds: string[] = [];

        if (level && level.recipient_types) {
            level.recipient_types.forEach((recipient: any) => {
                let userId = recipient?.replaced_by;
                if (!userId && recipient?.meta_data) {
                    const metaValues = Object.values(recipient?.meta_data);
                    const potentialId = metaValues.find((val: any) => typeof val === 'string');
                    if (potentialId) userId = potentialId as string;
                }

                if (userId) userIds.push(userId);
            });
        }

        return userIds;
    };

    const checkAllUsersActiveStatus = async (level: any) => {
        const userIds = getUserIdsFromLevel(level);
        const activeStatus: Record<string, boolean> = {};

        await Promise.all(userIds.map(async (userId) => {
            activeStatus[userId] = await isUserActive(userId);
        }));

        return activeStatus;
    };

    if (updates.is_admin_override) {
        workflow.levels = workflow?.levels.map((level: any) => {
            if (level?.status?.toLowerCase() === 'pending') {
                level.status = 'completed';

                level.recipient_types = (level?.recipient_types || []).map((recipient: any) => {

                    return {
                        ...recipient,
                        impersonate_by: impersonator_id,
                        updated_on: Date.now(),
                        actor_first_name: userData?.first_name,
                        actor_last_name: userData?.last_name,
                        actor_by_avtar: userData?.avatar,
                        is_admin_override: updates?.is_admin_override || true,
                        status: 'reviewed',
                    };

                });
            }
            updatedLevels = true;
            return level;
        });
    } else {
        const bypass_duplicate_approver = workflow.config?.bypass_duplicate_approver ?? false;
        const allLevelsActiveStatus: Record<number, Record<string, boolean>> = {};

        await Promise.all(workflow.levels.filter((level: any) => level.status === 'pending').map(async (level: any) => {
            const levelOrder = level.placement_order || 0;
            allLevelsActiveStatus[levelOrder] = await checkAllUsersActiveStatus(level);
            console.log(`Active status for pending level ${levelOrder}:`, allLevelsActiveStatus[levelOrder]);
        }));

        // First, collect active status for all users in pending levels only
        await Promise.all(workflow.levels.filter((level: any) => level.status === 'pending').map(async (level: any) => {
            const levelOrder = level.placement_order || 0;
            allLevelsActiveStatus[levelOrder] = await checkAllUsersActiveStatus(level);
            console.log(`Active status for pending level ${levelOrder}:`, allLevelsActiveStatus[levelOrder]);
        }));

        workflow.levels = await Promise.all(workflow.levels.map(async (level: any) => {
            const levelOrder = level.placement_order || 0;
            const levelActiveStatus = allLevelsActiveStatus[levelOrder] || {};

            if (level.placement_order === updates.placement_order) {
                levelFound = true;
                updatedLevels = true;

                level.recipient_types = await Promise.all(level.recipient_types.map(async (recipient: any) => {
                    const userId = recipient?.replaced_by ||
                        (recipient?.meta_data ? Object.values(recipient?.meta_data).find((id: any) => typeof id === 'string') : null);

                    const matchesUser = recipient?.replaced_by
                        ? updates?.user_id === recipient?.replaced_by
                        : Object.values(recipient?.meta_data).includes(updates?.user_id);

                    const commonFields = {
                        ...recipient,
                        impersonate_by: impersonator_id,
                        updated_on: Date.now(),
                        actor_first_name: userData?.first_name,
                        actor_last_name: userData?.last_name,
                        actor_by_avtar: userData?.avatar,
                        is_admin_override: updates?.is_admin_override || false
                    };

                    // Use precomputed active status
                    let userActive = true;
                    if (userId && levelActiveStatus[userId] !== undefined) {
                        userActive = levelActiveStatus[userId];
                    } else if (userId) {
                        // Fallback if not in precomputed map
                        userActive = await isUserActive(userId);
                    }

                    // Check for inactive users only for pending recipients in pending levels
                    if (!userActive && recipient.status === 'pending' && level.status === 'pending') {
                        return {
                            ...commonFields,
                            status: 'reviewed',
                            auto_approved: true,
                            notes: 'Auto-approved: User is inactive'
                        };
                    }

                    if (isSuperUser) {
                        return { ...commonFields, status: updates.new_status };
                    }

                    if (updates.behavior?.toLowerCase() === 'any') {
                        if (matchesUser) {
                            return { ...commonFields, status: 'reviewed' };
                        } else {
                            return { ...recipient, status: 'Not needed' };
                        }
                    }

                    if (updates.behavior?.toLowerCase() === 'all') {
                        if (matchesUser) {
                            return { ...commonFields, status: 'reviewed' };
                        } else {
                            return recipient;
                        }
                    }

                    if (!updates.behavior) {
                        if (matchesUser) {
                            return { ...commonFields, status: 'reviewed' };
                        } else {
                            return recipient;
                        }
                    }

                    return recipient;
                }));

                const allApproved = level.recipient_types.every(
                    (recipient: any) => recipient.status === 'reviewed' ||
                        recipient.status === 'Not needed' ||
                        recipient.status === 'bypassed'
                );
                level.status = allApproved ? 'completed' : 'pending';
            }

            return level;
        }));
        if (bypass_duplicate_approver === true) {
            let bypass = await handleBypassForUser(workflow.levels, updates.user_id)
            workflow.levels = bypass;
        }
    }

    return updatedLevels;
};

async function findMatchingUsers(levels: any, userId: string) {
    const match_user: any = [];

    (levels || []).forEach((level: any) => {
        const placementOrder = level.placement_order;

        (level.recipient_types || []).forEach((recipient: any) => {
            if (recipient.status === 'pending') {
                const metaValues = Object.values(recipient.meta_data || {});
                if (metaValues.includes(userId)) {
                    match_user.push({
                        user_id: userId,
                        placement_order: placementOrder
                    });
                }
            }
        });
    });

    return match_user;
}

async function handleBypassForUser(levels: any[], userId: string) {
    const matchedUsers = await findMatchingUsers(levels, userId);
    for (const { user_id, placement_order } of matchedUsers) {
        const level = levels.find(l => l.placement_order === placement_order);
        if (!level || !level.recipient_types) continue;

        for (const recipient of level.recipient_types) {
            const metaValues = Object.values(recipient.meta_data || {});
            if (metaValues.includes(user_id) && recipient.status === 'pending') {
                if (recipient.behaviour?.toLowerCase() === 'any') {
                    for (const r of level.recipient_types) {
                        const metaValues = Object.values(r.meta_data || {});
                        if (metaValues.includes(user_id)) {
                            r.status = 'bypassed';
                        } else {
                            r.status = 'Not needed';
                        }
                    }
                    break;
                } else {
                    recipient.status = 'bypassed';
                }
            }
        }
    }

    for (const level of levels) {
        if (!level.recipient_types || level.recipient_types.length === 0) {
            level.status = 'completed';
            continue;
        }

        const behaviorOfLevel = level.recipient_types[0]?.behaviour?.toLowerCase();

        if (behaviorOfLevel === 'any' && level.status === 'pending') {
            const anyBypassed = level.recipient_types.some(
                (r: any) => r.status === 'bypassed'
            );
            level.status = anyBypassed ? 'bypassed' : level.status;
        } else if (level.status === 'pending') {
            const allBypassed = level.recipient_types.every(
                (r: any) => r.status === 'bypassed'
            );

            const allBypassedOrApproved = level.recipient_types.every(
                (r: any) => r.status === 'bypassed' || r.status === 'reviewed'
            );

            if (allBypassed) {
                level.status = 'bypassed';
            } else if (allBypassedOrApproved) {
                level.status = 'completed';
            }
        } else {
            level.status = level.status
        }
    }

    return levels;
}

export const determineWorkflowStatus = (levels: any[]) => {
    let allLevelsAfterFirstCompleted = true;

    for (const level of levels) {
        if (level.status === "pending") {
            allLevelsAfterFirstCompleted = false;
            break;
        }
    }

    return allLevelsAfterFirstCompleted ? "completed" : "pending";
};

export const updateExternalWorkflow = async (workflow: any, workflowStatus: string, program_id: string, job_workflow_id: string, authHeader: string) => {
    const apiUrl = `${config_base_url}/v1/api/program/${program_id}/job-workflow/${job_workflow_id}`;
    let is_updated = false;
    if (workflowStatus === "completed") {
        is_updated = true;
    }
    const payload = {
        levels: workflow.levels,
        status: workflowStatus,
        is_updated,
    };

    const workflow_update = await axios.put(apiUrl, payload, {
        headers: {
            'Content-Type': 'application/json',
            authorization: authHeader,
        },
    });

    return workflow_update.data;
};

const handleWorkflowCompletion = async (workflow: any, request: FastifyRequest, reply: FastifyReply, existingJob: any, sequelize: any, program_id: string, user: any, traceId: string, token: string) => {
    let result: any;
    if (workflow.events === "update_job") {
        result = {
            status: existingJob?.status,
            updated: true,
        };
        jobNotificationService.handleJobNotification(token, sequelize, program_id, existingJob?.dataValues, user, traceId, NotificationEventCode.JOB_UPDATE_REVIEW_COMPLETE);
    } else if (workflow.events === "create_job") {
        result = {
            status: existingJob?.status,
            updated: true,
        };
        jobNotificationService.handleJobNotification(token, sequelize, program_id, existingJob?.dataValues, user, traceId, NotificationEventCode.JOB_REVIEW_COMPLETE);
    }
    return result;
};

const updateJobDetails = async (jobData: any, program_id: string, id: string, userId: string, transaction: any, status: string) => {
    console.log('inside the job  update in update job details.+++++++++++++++.', status, id)
    try {
        const [updatedCount] = await JobModel.update(
            { ...jobData, updated_on: Date.now(), updated_by: userId, status: status },
            { where: { program_id, id } }
        );
        console.log('updatedCount', updatedCount);

        if (updatedCount > 0) {
            const jobAssociations = await updateJobAssociations(jobData, program_id, id, transaction);
            console.log('jobAssociations', jobAssociations);
            const job = await JobModel.findOne({ where: { program_id, id } });
            return job;
        }

        return null;

    } catch (error) {
        console.log('error is nowwww', error)
        return null;

    }

};

const updateJobAssociations = async (jobData: JobInterface, program_id: string, id: string, transaction: any) => {
    const associations = [
        { model: jobCandidateModel, data: jobData.candidates },
        { model: jobCustomfieldsModel, data: jobData.customFields },
        { model: jobFoundationDataTypeModel, data: jobData.foundationDataTypes },
        { model: jobQulificationType, data: jobData.qualifications },
        { model: jobRateModel, data: jobData.rates },
    ];

    let updatedCount = 0;

    try {
        for (const { model, data } of associations) {
            if (data) {
                await model.destroy({ where: { job_id: id, program_id }, transaction });
                const upsertResults = await Promise.all(data.map((item: any) => model.upsert({ ...item, job_id: id, program_id }, { transaction })));
                updatedCount += upsertResults.length;
            }
        }
        return { success: true, updatedCount };
    } catch (error) {
        console.log('Error updating job associations:', error);
        return { success: false, message: 'Error updating job associations' };
    }
};

const workflowCreateJobHistory = async (
    updatedJob: any,
    existingJob: any,
    program_id: string,
    id: string,
    userId: string,
    transaction?: any
) => {
    const changes = await comparisonService.compareJobPayload(
        existingJob.toJSON(),
        updatedJob
    );

    if (Object.keys(changes).length > 0) {
        try {
            const record = await createJobHistoryRecord(
                { id, program_id },
                updatedJob,
                userId || "",
                transaction,
                "Job Updated",
                buildStructuredChanges(changes)
            );
        } catch (error) {
            console.error("Error creating job history (comparison):", error);
        }
    }
};

/////////////////// Workflow review update end //////////////////////

export async function getUsersStatus(sequelize: any, userId: any) {

    const userQuery = `
        SELECT user_id, status,first_name,last_name,avatar
        FROM ${config_db}.user
        WHERE user_id IN (:userId)
          AND LOWER(status) = 'active';`;

    const users = await sequelize.query(userQuery, {
        type: QueryTypes.SELECT,
        replacements: { userId },
    });

    return users.map((user: any) => ({
        user_id: user.user_id,
        first_name: user?.first_name,
        last_name: user?.last_name,
        avatar: user?.avatar?.url,
        status: user?.status,
    }));
}

export async function updateJobStatusForWorkflow(request: FastifyRequest, reply: FastifyReply, existingJob: any, sequelize: any) {
    try {
        const workflows = await fetchWorkflows(existingJob?.id, sequelize, existingJob?.program_id);

        if (!workflows.length) {
            return { message: 'No workflows found for the given ID', updated: false };
        }
        console.log('workflows is nowwww', JSON.stringify(workflows))

        const updatedStatus = await determineJobStatus(workflows, existingJob);
        return {
            status: updatedStatus,
            updated: true,
        };
    } catch (error) {
        console.error('Error updating job status:', error);
        return { message: 'Error updating job status', error, updated: false };
    }
}

async function fetchWorkflows(workflowTriggerId: string, sequelize: any, program_id: string) {
    const workflowQuery = `
        SELECT id, workflow_trigger_id, flow_type, levels
        FROM ${config_db}.workflow
        WHERE program_id = :program_id
        AND workflow_trigger_id = :workflow_trigger_id
        AND is_updated = false
        AND is_deleted = false
        AND is_enabled = true
    `;

    return await sequelize.query(workflowQuery, {
        type: QueryTypes.SELECT,
        replacements: { program_id, workflow_trigger_id: workflowTriggerId },
    });
}

async function determineJobStatus(workflows: any[], existingJob: any) {
    for (const workflow of workflows) {
        if (workflow.flow_type === 'Approval') {
            const levels = workflow.levels || [];
            const hasNonEmptyRecipients = levels.slice(1).some((level: any) => level.recipient_types && level.recipient_types.length > 0);

            if (!hasNonEmptyRecipients) {
                await existingJob.update({ status: "OPEN" });
                return "OPEN";
            }

            await existingJob.update({ status: "PENDING_APPROVAL" });
            return "PENDING_APPROVAL";
        }
    }

    await existingJob.update({ status: "OPEN" });
    return "OPEN";
}



export async function fetchModuleId(moduleName: string): Promise<string | null> {

    try {
        const query = `
        SELECT id
        FROM ${config_db}.module
        WHERE name = :module_name
        AND is_workflow = true
        LIMIT 1;
      `;

        const moduleIds = await sequelize.query<ModuleRecord>(query, {
            type: QueryTypes.SELECT,
            replacements: { module_name: moduleName }
        });

        return moduleIds.length > 0 ? moduleIds[0].id : null;
    } catch (error: any) {
        console.error(`Error fetching module ID: ${error.message}`);
        return null;
    }
}


export async function fetchEventId(moduleId: any, eventSlug: any, type: any) {
    try {
        if (!moduleId || !eventSlug) {
            return null;
        }

        const query = `
        SELECT id
        FROM ${config_db}.event
        WHERE module_id = :module_id
          AND slug = :event_slug
          AND is_enabled = true
          AND type = :type
        LIMIT 1;
      `;

        const event = await sequelize.query(query, {
            type: QueryTypes.SELECT,
            replacements: {
                module_id: moduleId,
                event_slug: eventSlug,
                type
            }
        });
        let eventId: any = event[0]
        return eventId?.id || null;
    } catch (error: any) {
        console.error(`Error fetching event ID: ${error.message}`);
        return null;
    }
}


export async function getPendingWorkflow(jobData: any,
    moduleId: any,
    eventId: any,
    programId: any,
    placementOrder: any,
    approvalMethod: any
) {
    try {

        const workflowQuery = jobWorkflowQuery(jobData?.hierarchy_ids || jobData?.hierarchy, approvalMethod);
        const rows = await sequelize.query(workflowQuery, {
            replacements: {
                module_id: moduleId,
                event_id: eventId,
                program_id: programId,
                placement_order: placementOrder
            },
            type: QueryTypes.SELECT,
        });

        console.log('Workflow rows:', JSON.stringify(rows));

        return {
            rows
        };
    } catch (error: any) {
        console.error(`Error determining job status: ${error.message}`);
        throw error;
    }
}

export async function getWorkflowData(ids: string[], program_id: string, userId: string) {
    if (!ids.length) return [];

    const idsList = ids.map(id => `'${id}'`).join(',');
    const query = `
   SELECT 
       w.workflow_trigger_id AS match_candidate_id
   FROM 
       ${config_db}.workflow w,
       JSON_TABLE(w.levels, '$[*]' 
           COLUMNS (
               recipient_types JSON PATH '$.recipient_types'
           )
       ) AS levels,
       JSON_TABLE(levels.recipient_types, '$[*]' 
           COLUMNS (
               meta_data JSON PATH '$.meta_data'
           )
       ) AS rt,
       JSON_TABLE(rt.meta_data, '$.*' 
           COLUMNS (
               value JSON PATH '$'
           )
       ) AS meta
   WHERE 
       w.workflow_trigger_id IN (${idsList})
       AND w.program_id = :program_id
       AND w.status = 'pending'
       AND JSON_UNQUOTE(JSON_EXTRACT(meta.value, '$')) = :userId;
`;
    return sequelize.query(query, {
        type: QueryTypes.SELECT,
        replacements: { program_id, userId },
    });
};

export async function determinetWorkflowStatus({
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
}: {
    workflow: any,
    jobTemplate: any,
    jobDatas: any,
    request: any,
    reply: any,
    program_id: string,
    module_id: string,
    event_id: string,
    placement_order: any,
    job: any,
    jobData: any,
    module_name: string,
    is_updated: boolean,
    workflow_job_id: string,
    event_slug: string,
    transaction: any
}): Promise<string> {
    const isAutoDist = jobTemplate?.is_automatic_distribution;
    const isReview = jobTemplate?.is_review_configured_or_submit;
    const allowIdentified = jobDatas.allow_per_identified_s === true;

    const getApprovalWorkflow = async () => {
        const approvalQuery = jobWorkflowQuery(jobDatas.hierarchy_ids, 'approval');
        const rows: any[] = await sequelize.query(approvalQuery, {
            replacements: { module_id, event_id, program_id, placement_order },
            type: QueryTypes.SELECT,
            transaction
        });
        return await workflowTriggering(request, reply, program_id, rows, job, jobData, jobDatas, module_name, is_updated, workflow_job_id, event_slug);
    };

    if (!workflow) {
        workflow = await getApprovalWorkflow();
    }

    if (!workflow) {
        return 'OPEN';
    }

    if (workflow?.workflow_status === 'completed') {
        if (workflow.flow_type?.toLowerCase() === 'review') {
            const approvalWorkflow = await getApprovalWorkflow();

            if (!approvalWorkflow) {
                return 'OPEN';
            }

            if (approvalWorkflow.workflow_status === 'completed') {
                return 'OPEN';
            }

            return 'PENDING_APPROVAL';
        }

        return 'OPEN';
    }

    if (workflow.flow_type?.toLowerCase() === 'approval') {
        return 'PENDING_APPROVAL';
    }

    return 'PENDING_REVIEW';
}


async function getUserIdsByUserIds(userIds: any[]): Promise<any[]> {
    if (!userIds?.length) return [];

    const query = `
    SELECT id
    FROM ${config_db}.user
    WHERE user_id IN (:user_ids);
  `;

    const results: { id: any }[] = await sequelize.query(query, {
        type: QueryTypes.SELECT,
        replacements: { user_ids: userIds },
    });

    return results.map(user => user.id);
}

export async function fetchManagerIds(offerData: any) {
    let job_manager_id: any | null = null;

    if (offerData?.job_manager) {
        const query = `
      SELECT id
      FROM ${config_db}.user
      WHERE user_id = :user_id
      LIMIT 1;
    `;

        const [result]: { id: any }[] = await sequelize.query(query, {
            type: QueryTypes.SELECT,
            replacements: { user_id: offerData.job_manager },
        });

        job_manager_id = result?.id ?? null;
    }

    const [timesheet_manager_id, expense_manager_id] = await Promise.all([
        getUserIdsByUserIds(offerData?.timesheet_manager || []),
        getUserIdsByUserIds(offerData?.expense_manager || []),
    ]);

    return {
        job_manager_id,
        timesheet_manager_id,
        expense_manager_id,
    };
}

export const getEventIdFromModule = async (
    module_name: string,
    event_slug: string,
    type: string
): Promise<{ moduleId: string | null; eventId: string | null }> => {
    if (!module_name || !event_slug || !type) return { moduleId: null, eventId: null };

    const [module]: any[] = await sequelize.query(
        `SELECT id FROM ${config_db}.module WHERE name = :module_name AND is_workflow = true LIMIT 1`,
        { type: QueryTypes.SELECT, replacements: { module_name } }
    );

    const moduleId = module?.id || null;
    if (!moduleId) return { moduleId: null, eventId: null };

    const [event]: any[] = await sequelize.query(
        `SELECT id FROM ${config_db}.event WHERE module_id = :module_id AND slug = :event_slug AND is_enabled = true AND type = :type LIMIT 1`,
        { type: QueryTypes.SELECT, replacements: { module_id: moduleId, event_slug, type } }
    );

    const eventId = event?.id || null;

    return { moduleId, eventId };
};
