import { FastifyInstance } from "fastify";
import {
    getJobQulificationType,
    getJobQulificationTypeById,
    createJobQulificationType,
    updateJobQulificationType,
    deleteJobQulificationType,
} from "../controllers/job-qulification-type.controller";
import { verifyToken } from "../middlewares/verifyToken";

export default async function jobQulificationTypeRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', verifyToken);
    fastify.get("/program/:program_id/jobQulificationType", getJobQulificationType);
    fastify.get("/program/:program_id/jobQulificationType/:id", getJobQulificationTypeById);
    fastify.post("/program/:program_id/jobQulificationType", createJobQulificationType);
    fastify.put("/program/:program_id/jobQulificationType/:id", updateJobQulificationType);
    fastify.delete("/program/:program_id/jobQulificationType/:id", deleteJobQulificationType);
}