import { FastifyInstance } from "fastify";
import {
  getOfferById,
  createOffer,
  updateOffer,
  deleteOffer,
  getAllOffers,
  financialDetailsCalculation,
  getOffersForCandidate,
  getCounterOffer,
  updateWorkflowReview,
  getStatistics,
  updateOfferRelease,
  updateOfferById,
  offerAdvanceFilter
} from "../controllers/offer.controller";
import { createOfferSchema, paramsSchema } from "../interfaces/offer.interface";
import { verifyToken } from '../middlewares/verifyToken';

async function jobOfferRoutes(fastify: FastifyInstance) {

  fastify.addHook('preHandler', verifyToken);

  fastify.get("/program/:program_id/offer/:id", getOfferById);

  fastify.get("/program/:program_id/offers", getAllOffers);

  fastify.get("/program/:program_id/candidate-offers", getOffersForCandidate);

  fastify.get("/program/:program_id/counter-offer", getCounterOffer);

  fastify.post("/program/:program_id/offer",
    {
      schema: {
        body: createOfferSchema,
        params: paramsSchema,
      },
    }, createOffer);

  fastify.put("/program/:program_id/offer/:id", updateOffer);

  fastify.put("/program/:program_id/update-offer/:id", updateOfferById);

  fastify.put("/offer-release/program/:program_id/offer/:id", updateOfferRelease);

  fastify.delete("/program/:program_id/offer/:id", deleteOffer);

  fastify.put("/offer-review-workflow/program/:program_id/offer/:id/job-workflow/:job_workflow_id", updateWorkflowReview);

  fastify.post("/program/:program_id/job/:jobId/financial-details", financialDetailsCalculation);

  fastify.get('/program/:program_id/statistics', getStatistics);

  fastify.post('/program/:program_id/offer-filters', offerAdvanceFilter);
}

export default jobOfferRoutes;