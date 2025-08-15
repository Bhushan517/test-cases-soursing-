import { FastifyInstance } from 'fastify';
import { candidateHistory, getCandidateHistory, getCandidateHistoryAll } from '../controllers/candidate-history.controller';

async function candidateHistoryRoutes(fastify: FastifyInstance) {
    fastify.post('/program/:program_id/candidate-history', candidateHistory);
    fastify.get('/program/:program_id/candidate-history/:candidate_id/revision/:revision_id', getCandidateHistory);
    fastify.get('/program/:program_id/candidate-history/:candidate_id', getCandidateHistoryAll);

}

export default candidateHistoryRoutes;