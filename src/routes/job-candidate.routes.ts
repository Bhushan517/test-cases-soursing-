import { FastifyInstance } from "fastify";
import {
    getJobCandidateById,
    createJobCandidate,
    updateJobCandidate,
    deleteJobCandidate,
    getJobCandidate
} from "../controllers/job-candidate.controller";
import { verifyToken } from "../middlewares/verifyToken";

export default async function (app: FastifyInstance) {
    app.addHook('preHandler', verifyToken);
    app.get("/program/:program_id/job-candidate/:id", getJobCandidateById);
    app.post("/program/:program_id/job-candidate", createJobCandidate);
    app.get("/program/:program_id/job-candidate", getJobCandidate);
    app.put("/program/:program_id/job-candidate/:id", updateJobCandidate);
    app.delete("/program/:program_id/job-candidate/:id", deleteJobCandidate);
}