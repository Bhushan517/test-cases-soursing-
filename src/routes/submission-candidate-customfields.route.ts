import { FastifyInstance } from 'fastify';
import { createSubmissionCandidateCustomFields, getAllSubmissionCandidateCustomFields, getSubmissionCandidateCustomFieldsById, updateSubmissionCandidateCustomFields, deleteSubmissionCandidateCustomFields } from '../controllers/submission-candidate-customfields.controller';

 async function submissionCandidateCustomFieldsRoutes(fastify: FastifyInstance) {
    fastify.post('/program/:program_id/submission-candidate-customfields', createSubmissionCandidateCustomFields);
    fastify.get('/program/:program_id/submission-candidate-customfields', getAllSubmissionCandidateCustomFields);
    fastify.get('/program/:program_id/submission-candidate-customfields/:id', getSubmissionCandidateCustomFieldsById);
    fastify.put('/program/:program_id/submission-candidate-customfields/:id', updateSubmissionCandidateCustomFields);
    fastify.delete('/program/:program_id/submission-candidate-customfields/:id', deleteSubmissionCandidateCustomFields);
    
}
export default submissionCandidateCustomFieldsRoutes;