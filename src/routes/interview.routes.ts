import { FastifyInstance } from "fastify";
import {
  getInterviewById,
  createInterview,
  updateInterview,
  deleteInterview,
  getAllInterviews,
  getInterviewsForCandidate,
  getInterviewApprovalRequest,
  getInterviewersAvailability,
  rejectInterview,
  rejectCandidate,
  getCalendarData,
  interviewsAdvanceFilter,
} from "../controllers/interview.controller";
import {
  createInterviewSchema,
  paramsSchema,
} from "../interfaces/interview.interface";
import { verifyToken } from "../middlewares/verifyToken";

async function jobInterviewRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', verifyToken);

  fastify.get("/program/:program_id/interview/:id", getInterviewById);

  fastify.get("/program/:program_id/interview", getAllInterviews);

  fastify.post("/program/:program_id/interview",
    {
      schema: {
        body: createInterviewSchema,
        params: paramsSchema,
      },
    }, createInterview);

  fastify.put("/program/:program_id/interview/:id", updateInterview);

  fastify.delete("/program/:program_id/submission-manager/:id", deleteInterview);

  fastify.get("/program/:program_id/candidate-interviews", getInterviewsForCandidate);

  fastify.get("/program/:program_id/interviewers-availability", getInterviewersAvailability);

  fastify.get("/program/:program_id/tenant/:tenant_id/job/:job_id/get-interviewslots", getInterviewApprovalRequest);

  fastify.put("/program/:program_id/reject-interviews/:id", rejectInterview);

  fastify.put("/program/:program_id/reject-candidate/:submission_id", rejectCandidate);

  fastify.get("/program/:program_id/calender/statistics", getCalendarData);

  fastify.post("/program/:program_id/interview-filters", interviewsAdvanceFilter);
}

export default jobInterviewRoutes;
