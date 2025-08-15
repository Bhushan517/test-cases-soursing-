import { FastifyInstance } from 'fastify';
import {
    createJobDistribution,
    getAllJobDistributions,
    updateJobDistributionById,
    deleteJobDistributionById,
    getJobDistributions,
    updateSubmissionLimit,
    getOptOutJobs,
    getOptOutJobsVendor,
    getVendorAndVendorGroup
} from '../controllers/job-distribution.controller';
import { jobDistributionSchema, paramsSchema, querySchema } from '../interfaces/job-distribution.interface';
import { verifyToken } from '../middlewares/verifyToken';

export default async function jobDistributionRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', verifyToken);

    fastify.post('/program/:program_id/job-distribution', {
        schema: {
            body: jobDistributionSchema,
        }
    }, createJobDistribution);

    fastify.get('/program/:program_id/job-distribution', {
        schema: {
            params: paramsSchema,
            querystring: querySchema
        }
    }, getAllJobDistributions);

    fastify.get('/program/:program_id/distributions', {
        schema: {
            params: paramsSchema
        }
    }, getJobDistributions);

    fastify.put('/program/:program_id/job-distribution/:id', {
        schema: {
            body: jobDistributionSchema,
        }
    }, updateJobDistributionById);

    fastify.put('/program/:program_id/submission-limit', {
        schema: {
            params: paramsSchema
        }
    }, updateSubmissionLimit);

    fastify.delete('/program/:program_id/job-distribution/:id', {
        schema: {
            params: paramsSchema
        }
    }, deleteJobDistributionById);

    fastify.get('/program/:program_id/job-opt-status', {
        schema: {
            params: paramsSchema
        }
    }, getOptOutJobs);

    fastify.get('/program/:program_id/opt-out/vendor', {
        schema: {
            params: paramsSchema
        }
    }, getOptOutJobsVendor);

    fastify.post('/program/:program_id/program-vendor/vendor-group', {
        schema: {
            params: paramsSchema
        }
    }, getVendorAndVendorGroup);
}
