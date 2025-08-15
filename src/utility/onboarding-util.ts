import { sequelize } from '../config/instance';
import { QueryTypes } from 'sequelize';
import {databaseConfig} from '../config/db'

const config_db = databaseConfig.config.database_config;

export const SUBMISSION_CREATION = "submission_creation";
export const OFFER_CREATION = "offer_creation";
export const ASSIGNMENT_CREATION = "assignment_creation";
export const ASSIGNMENT_ACTIVATION = "assignment_activation";
export const ASSIGNMENT_END = "assignment_end";

export const onboarding_events_trigger_sequence: string[] = [SUBMISSION_CREATION, OFFER_CREATION, ASSIGNMENT_CREATION, ASSIGNMENT_ACTIVATION, ASSIGNMENT_END];

export function getSubsequentTrigger(currentTrigger: string){
    let found = false;
    const subsequentTrigger = [];
    for(const trigger of onboarding_events_trigger_sequence){
        if(found){
            subsequentTrigger.push(trigger);
        }
        found = found || trigger == currentTrigger;
    } 
    if(!found){
        throw new Error(`Current trigger- ${currentTrigger} is invalid`);
    }
    return subsequentTrigger;
}

export function getBaseTriggersStepCounts(triggers: string[]){
    const stepCounts: Record<string, number>  = {}; 
    for(const trigger of triggers){
        stepCounts[`${trigger}_steps_count`] = 0;
    }
    return stepCounts;
}

export const PRE_ONBOARDING = "pre_onboarding";
export const POST_ONBOARDING = "post_onboarding";

export function getMillisecondsFromDays(days: number){
    return new Date(Date.now() + (days ?? 0)*24*60*60*1000)
}

// Method 1: Fetch Checklist Task Mapping By Trigger
export async function getChecklistTaskMappings(
    { checklist_entity_id, checklist_version, checklist_version_id, triggers }: 
    {checklist_entity_id?: string | null, checklist_version?: number | null, checklist_version_id?: string | null; triggers?: string[] | null; }
    ): Promise<{
                id: string;
                category_id: string;
                category_name: string;
                task_entity_id: string;
                task_version_id: string;
                task_name: string;
                seq_no: number;
                is_mandatory: boolean;
                trigger: string;
                has_dependency: boolean;
                dependency_task_entity_id: string | null;
                dependency_category_id: string | null;
                dependency_task_name: string | null;
                dependency_category_name: string | null;
                actor_org_type: string | null;
                actor_role_id: string | null;
                actor_role_name: string | null;
                reviewer_org_type: string | null;
                reviewer_role_id: string | null;
                reviewer_role_name: string | null;
                start_date: Record<string, any>;
                due_date: Record<string, any>;
            }[]>{
    try {
        let selectFrom: string = ` SELECT ctm.* FROM ${config_db}.checklist_task_mapping ctm`;
        let where: string = ` WHERE ctm.is_deleted = 0`;
        let replacements: Record<string, any> = {};

        const checklistJoin: string = ` JOIN ${config_db}.checklist c on c.version_id = ctm.checklist_version_id`;
        const checklistExistsCondition: string = ` AND c.is_deleted = 0`;
       
        if(checklist_version_id){
            where = `${where} AND ctm.checklist_version_id = :checklist_version_id`;
            replacements = {...replacements, checklist_version_id};
        } else if(checklist_entity_id && checklist_version){
            selectFrom = `${selectFrom} ${checklistJoin}`;
            where = `${where} ${checklistExistsCondition} AND c.entity_id = :checklist_entity_id AND c.version = :checklist_version`;
            replacements = {...replacements, checklist_entity_id, checklist_version};
        } else if(checklist_entity_id){
            selectFrom = `${selectFrom} ${checklistJoin}`;
            where = `${where} ${checklistExistsCondition} AND c.entity_id = :checklist_entity_id AND c.latest = 1`;
            replacements = {...replacements, checklist_entity_id};
        }
        
        if(triggers){
            where = `${where} AND ctm.\`trigger\` in (:triggers)`;
            replacements = {...replacements, triggers};
        }

        const checklistTaskMappings = await sequelize.query(`${selectFrom} ${where}`, {
            replacements,
            type: QueryTypes.SELECT,
        }) as any[];

        return checklistTaskMappings ;
    } catch (error) {
        console.error(`Error fetching checklist task mappings for checklist_id: ${checklist_version_id}, trigger: ${triggers}`, error);
        throw new Error('Failed to fetch checklist task mappings.');
    }
};

// Utility to determine onboarding_category by trigger
function getOnboardingCategoryByTrigger(trigger: string): string {
    const triggerToCategoryMap: Record<string, string> = {
        "submission_creation" : "pre_onboarding",
        "offer_creation": "pre_onboarding",
    };

    const onboardingCategory = triggerToCategoryMap[trigger];

    return onboardingCategory;
};

// Method 2: Create Workflow Steps By Checklist Task Mapping
export async function createWorkflowStepsByChecklistTaskMapping(
    checklistTaskMappings: any[],
    program_id: string,
    candidate_id: string,
    hierarchy_ids: string[],
    vendor_id: string,
    associations: any,
) {
    try {
        const workflowSteps = checklistTaskMappings.map((mapping: any, index: number) => ({
            category_id: mapping.category_id,
            task_entity_id: mapping.task_entity_id,
            task_data_entity_id: null,
            status: "Pending Upload",
            seq_no: index + 1,
            is_mandatory: mapping.is_mandatory,
            has_dependency: mapping.has_dependency,
            dependency_task_entity_id: mapping.dependency_task_entity_id,
            dependency_category_id: mapping.dependency_category_id,
            meta_data: {
                reviewer: {
                    role_id: mapping.reviewer_role_id || null,
                    role_name: mapping.reviewer_role_name || null,
                    org_type: mapping.reviewer_org_type || null,
                },
                actor: {
                    role_id: mapping.actor_role_id || null,
                    role_name: mapping.actor_role_name || null,
                    org_type: mapping.actor_org_type || null,
                },
                start_date_rule: mapping.start_date ? {
                    days: mapping.start_date.days || null,
                    case: mapping.start_date.case || null,
                    event: mapping.start_date.event || null, 
                } : {},
                start_date: getMillisecondsFromDays(mapping?.start_date?.days),
                due_date_rule: mapping.due_date ? {
                    days: mapping.due_date.days || null,
                    case: mapping.due_date.case || null,
                    event: mapping.due_date.event || null, 
                } : {},
                due_date: getMillisecondsFromDays(mapping?.due_date?.days),
            },
            associations: {
                usage: "onboarding",
                trigger: mapping.trigger, 
                onboarding_category: getOnboardingCategoryByTrigger(mapping.trigger),
                ...associations,
                vendor_id,
                candidate_id
            },
            hierarchy_ids,
            submitter_user_id: null,
            submitter_user_mapping_id: null,
            submitter_tenant_id:  null,
            subject_user_id: candidate_id,
            subject_user_mapping_id: null,
            submitted_to_user_id: null,
            submitted_to_user_mapping_id: null,
            submitted_to_tenant_id: program_id,
            is_submitted_to_tenant: true,
            tenant_id: program_id,
            created_by: mapping.created_by,
            updated_by: mapping.updated_by,
            is_enabled: true,
            is_deleted: false,
        }));

        return workflowSteps;
    } catch (error) {
        console.error('Error creating workflow steps:', error);
        throw new Error('Failed to create workflow steps.');
    };
};