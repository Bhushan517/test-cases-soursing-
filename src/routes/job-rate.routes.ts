import { FastifyInstance } from "fastify";
import {
    createJobRate,
    getJobRate,
    getJobRateById,
    updateJobRate,
    deleteJobRate,
} from "../controllers/job-rate.controller";
import { createJobRateSchema, paramsSchema, querySchema } from "../interfaces/job-rate.interfaces";
import { verifyToken } from "../middlewares/verifyToken";

export default async function jobRateRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', verifyToken);
    fastify.get('/program/:program_id/job-rate',
        {
            schema: {
                params: paramsSchema,
                querystring: querySchema,
            }
        },
        getJobRate);

    fastify.get('/program/:program_id/job-rate/:id', {
        schema: {
            params: paramsSchema,
        }
    }, getJobRateById);

    fastify.post('/program/:program_id/job-rate', {
        schema: {
            body: createJobRateSchema,
            params: paramsSchema,
        }
    }, createJobRate);

    fastify.put('/program/:program_id/job-rate/:id', {
        schema: {
            body: createJobRateSchema,
            params: paramsSchema,
        }
    }, updateJobRate);

    fastify.delete('/program/:program_id/job-rate/:id', {
        schema: {
            params: paramsSchema,
        }
    }, deleteJobRate);
}
