import { FastifyInstance } from "fastify";
import {
    getJobById,
    createJob,
    updateJob,
    deleteJob,
    getJob,
    jobBudgetCalculation,
    advancedSearchJobs,
    getAll,
    financialDetailsCalculation,
    getJobCount,
    updateJobStatus,
    updateJobStatusNew,
    getStatusCount,
    getJobStatistics,
    updateJobDistribution,
    updateJobClosedStatus,
    updateJobStatusIfFilled
} from "../controllers/job.controller";
import {
    getAllJobsByProgramId
} from "../controllers/integration.controller";

import { updateWorkflowReview } from "../utility/job_workflow";
import { verifyToken } from "../middlewares/verifyToken";
async function jobRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', verifyToken);
    fastify.get("/program/:program_id/job/:id", getJobById);
    fastify.post("/program/:program_id/job", createJob);
    fastify.get("/program/:program_id/job", getJob);
    fastify.put("/program/:program_id/job/:id", updateJob);
    fastify.put("/program/:program_id/job-opt-out", updateJobDistribution);
    fastify.put("/review-workflow/program/:program_id/job/:id/job-workflow/:job_workflow_id", updateWorkflowReview);
    fastify.delete("/program/:program_id/job/:id", deleteJob);
    fastify.post("/program/:program_id/job-budget", jobBudgetCalculation);
    fastify.post("/program/:program_id/financial-calculation", financialDetailsCalculation);
    fastify.post("/program/:program_id/job-advanced-filter", advancedSearchJobs);
    fastify.get("/program/:program_id/all-job-hierarchies", getAll);
    fastify.get("/program/:program_id/job/count/:id", getJobCount);
    fastify.post("/program/:program_id/job/:id", updateJobStatus);
    fastify.put("/program/:program_id/job-status/:id", updateJobStatusNew);
    fastify.get("/program/:program_id/pending_action", getStatusCount);
    fastify.get("/program/:program_id/job-statstics", getJobStatistics);
    fastify.put("/program/:program_id/job/:id/closed", updateJobClosedStatus);
    fastify.put("/program/:program_id/update_job_status/:id", updateJobStatusIfFilled);
    fastify.get("/program/:program_id/jobs/all", getAllJobsByProgramId);
}

export default jobRoutes;
