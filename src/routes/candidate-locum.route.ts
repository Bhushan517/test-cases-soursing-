import { FastifyInstance } from 'fastify';
import { createCandidateLocum, getAllCandidateLocum, getCandidateLocumById, updateCandidateLocum, deleteCandidateLocum } from '../controllers/candidate-locum.controller';
import { createCandidateSchema, candidateQuerySchema, candidateParamsSchema } from '../interfaces/candidate-locum.interfaces';
import { verifyToken } from '../middlewares/verifyToken';

async function candidateLocumNameClearRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', verifyToken);
    fastify.post('/program/:program_id/candidate-locums',
        {
            schema: {
                body: createCandidateSchema,
                params: candidateParamsSchema,
            }
        },
        createCandidateLocum);
    fastify.get('/program/:program_id/candidate-locums',
        {
            schema: {
                params: candidateParamsSchema,
                querystring: candidateQuerySchema,
            }
        },
        getAllCandidateLocum);
    fastify.get('/program/:program_id/candidate-locums/:id',
        {
            schema: {
                params: candidateParamsSchema,
            }
        },
        getCandidateLocumById);
    fastify.put('/program/:program_id/candidate-locums/:id',
        {
            schema: {
                body: createCandidateSchema,
                params: candidateParamsSchema,
            }
        },
        updateCandidateLocum);
    fastify.delete('/program/:program_id/candidate-locums/:id',
        {
            schema: {
                params: candidateParamsSchema,
            }
        },
        deleteCandidateLocum);
}
export default candidateLocumNameClearRoutes;