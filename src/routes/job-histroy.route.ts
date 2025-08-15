import { FastifyInstance } from 'fastify';
import { createJobHistoryHandler, getAllJobHistory, getJobHistoryByRevision } from '../controllers/job-history.controller';
async function JobHistoryRoutes(fastify: FastifyInstance) {
    fastify.get("/program/:program_id/job-history/:id/revision/:revision", getJobHistoryByRevision);
    fastify.get("/program/:program_id/job-history/:id", getAllJobHistory);
    fastify.post("/program/:program_id/job-history", createJobHistoryHandler);


}
export default JobHistoryRoutes; 