import { FastifyInstance } from "fastify";
import {
    getJobCustomfields,
    getJobCustomfieldsById,
    createJobCustomfields,
    updateJobCustomfields,
    deleteJobCustomfields,
} from "../controllers/job-custom-fields.controller";
import { verifyToken } from "../middlewares/verifyToken";

export default async function jobCustomfieldsRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', verifyToken);
    fastify.get('/program/:program_id/job-customfields', getJobCustomfields);
    fastify.get('/program/:program_id/job-customfields/:id', getJobCustomfieldsById);
    fastify.post('/program/:program_id/job-customfields', createJobCustomfields);
    fastify.put('/program/:program_id/job-customfields/:id', updateJobCustomfields);
    fastify.delete('/program/:program_id/job-customfields/:id', deleteJobCustomfields);
}