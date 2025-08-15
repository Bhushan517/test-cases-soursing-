import { FastifyInstance } from 'fastify';
import { candidateBudgetSchema, createSubmissionCandidateSchema, paramsSchema, querySchema } from '../interfaces/submission-candidate.interface';
import * as SubmissionCandidateController from '../controllers/submission-candidate.controller';
import { verifyToken } from '../middlewares/verifyToken';

async function submissionCandidateRoutes(fastify: FastifyInstance) {

    fastify.addHook('preHandler', verifyToken);

    fastify.post('/program/:program_id/submission-candidate', {
        schema: {
            body: createSubmissionCandidateSchema,
            params: paramsSchema,
        }
    }, SubmissionCandidateController.createSubmissionCandidate);

    fastify.get('/program/:program_id/submission-candidate', {
        schema: {
            params: paramsSchema,
            querystring: querySchema
        }
    }, SubmissionCandidateController.getAllSubmissionCandidate);

    fastify.get('/program/:program_id/submission-candidate/:id', SubmissionCandidateController.getSubmissionCandidateById);

    fastify.put('/program/:program_id/submission-candidate/:id', {
        schema: {
            params: paramsSchema,
            body: createSubmissionCandidateSchema
        }
    }, SubmissionCandidateController.updateSubmissionCandidate);

    fastify.put('/update-submission-status/program/:program_id/submission-candidate/:id', SubmissionCandidateController.updateSubmissionStatus);

    fastify.put("/submission-review-workflow/program/:program_id/submission/:id/job-workflow/:job_workflow_id", SubmissionCandidateController.updateWorkflowReview);

    fastify.delete('/program/:program_id/submission-candidate/:id', SubmissionCandidateController.deleteSubmissionCandidate);

    fastify.get('/program/:program_id/get-vendor-markup', SubmissionCandidateController.getVendorMarkup);

    fastify.post('/program/:program_id/get-msp-budget', {
        schema: {
            params: paramsSchema,
            body: candidateBudgetSchema
        }
    }, SubmissionCandidateController.getMspBudget);

    fastify.get('/program/:program_id/get-submission-candidate/:candidate_id', SubmissionCandidateController.getSubmissionCandidateByCandidateId);

    fastify.get('/program/:program_id/submission-candidate/onboarding-tasks', SubmissionCandidateController.getOnboardingTasks);

    fastify.get('/program/:program_id/candidate-progress', SubmissionCandidateController.getCandidateProgress);

    fastify.get('/vendor/:vendor_id/submission-candidates', SubmissionCandidateController.getSubmissionCandidateForVendor);

    fastify.get('/program/:program_id/candidates', SubmissionCandidateController.getCandidates);

    fastify.post('/program/:program_id/advance-filter', SubmissionCandidateController.advanceFilterSubmissionCandidates);

    fastify.get('/program/:program_id/submission-candidates', SubmissionCandidateController.getSubmitedCandidates);

}
export default submissionCandidateRoutes;