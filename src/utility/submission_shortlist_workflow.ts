import { QueryTypes } from "sequelize";
import { determineWorkflowStatus, fetchEventId, fetchModuleId, fetchWorkflow, getPendingWorkflow, updateExternalWorkflow, updateWorkflowLevels, workflowTriggering } from "./job_workflow";
import { databaseConfig } from "../config/db";
import { decodeToken } from "../middlewares/verifyToken";
import { CandidateHistoryService } from "./candidate_history_helper";
import { sequelize } from "../config/instance";
const config_db = databaseConfig.config.database_config;
const candidateHistoryService = new CandidateHistoryService(sequelize);


export async function handleShortlistWorkflowUpdate( sequelize: any, program_id: any, workflowID: any, update: any, submissionCandidate: any, id: any, traceId: any, isSuperUser: any, userId: any, userType: any,
    authHeader: any, request: any, reply: any, job: any, candidateDatas: any, jobDatas: any, token: any
)
 {
    const user = await decodeToken(token);
    const workflow = await fetchWorkflow(sequelize, program_id, workflowID);

    if (!workflow) {
        if (submissionCandidate) {
            await submissionCandidate.update({status:"shortlisted"});  
            return reply.status(200).send({
                status_code: 200,
                message: "Data updated successfully",
                submission_candidate: id,
                trace_id: traceId,
            });
        } else {
            return reply.status(404).send({
                status_code: 404,
                message: "Submission Candidate not found",
            });
        }
    }

    const impersonator_id = update?.user?.impersonator?.id || user?.impersonator?.id || null;
    const updates = update?.updates[0] || update?.updates;

    const workflowStatus = determineWorkflowStatus(workflow.levels);
    console.log("workflowStatus is the ", workflowStatus);
    
    // await updateExternalWorkflow(workflow, workflowStatus, program_id, id, authHeader);

    if (workflowStatus === "completed") {
        const eventSlugShortlist = "submit_candidate_shortlist";
        const moduleName = "Submissions";
        const type = "workflow";
        const placementOrder = "0";
        const moduleId = await fetchModuleId(moduleName);

        const eventIdShortlist = await fetchEventId(moduleId, eventSlugShortlist, type);

        const workflowResult = await getPendingWorkflow(
            update,
            moduleId,
            eventIdShortlist,
            program_id,
            placementOrder,
            "review"
        );
        const hasEmptyLevels = workflowResult?.rows.some((row: any) =>
            !row.levels || row.levels.length === 0 ||
            row.levels.every((level: any) =>
                !level?.recipient_types || level?.recipient_types.length === 0
            )
        );
        if (!hasEmptyLevels) {
            const jobIdValue = updates?.job_id;

            const workflow = await workflowTriggering(
                request,
                reply,
                program_id,
                workflowResult?.rows,
                job,
                candidateDatas,
                jobDatas,
                moduleName,
                false,
                jobIdValue,
                eventSlugShortlist
            );
            let status
            if (workflow && workflow !== "Completed") {
                status = "PENDING_SHORTLIST_REVIEW"
            } else {
                status ="shortlisted"
            }

            const oldData = {
                candidate_id: submissionCandidate?.dataValues.candidate_id,
                status: submissionCandidate?.dataValues.status,
                job_id: updates?.job_id,
                updated_by: userId
            };

            const submissionStatus = await submissionCandidate.update({ status: status });

            const newData = {
                candidate_id: submissionCandidate?.dataValues.candidate_id,
                status: submissionCandidate?.dataValues.status,
                job_id: updates?.job_id,
                updated_by: userId
            };
            await candidateHistoryService.handleCandidateHistory({ program_id, oldData, newData, action: "Candidate Re-Hire Check Approved" });

        }
    }
}