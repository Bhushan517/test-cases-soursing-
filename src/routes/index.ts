import { FastifyInstance } from "fastify";

import jobRateRoutes from "./job-rate.routes";
import jobCustomfieldsRoutes from "./job-custom-fields.routes";
import jobQulificationTypeRoutes from "./job-qulification-type.routes";
import jobCandidateRoutes from "./job-candidate.routes";
import jobFoundationDataTypeRoutes from "./job-foundation-data-type.Routes";
import jobRoutes from "./job.routes";
import jobInterviewRoutes from "./interview.routes"
import jobOfferRoutes from "./offer.routes"
import candidateLocumNameClearRoutes from "./candidate-locum.route";
import submissionCandidateRoutes from "./submission-candidate.route";
import submissionCandidateCustomFieldsRoutes from "./submission-candidate-customfields.route";
import jobDistributionRoutes from "./job-distribution.route";
import JobHistoryRoutes from "./job-histroy.route";
import {msOutlookRoutes} from "./ms-integration.routes";
import candidateHistoryRoutes from "./candidate-history.route";
const basePrefix = "/sourcing/v1/api";

export default async function (app: FastifyInstance) {
  app.register(jobRateRoutes, { prefix: `${basePrefix}` });
  app.register(jobCustomfieldsRoutes, { prefix: `${basePrefix}` });
  app.register(jobQulificationTypeRoutes, { prefix: `${basePrefix}` });
  app.register(jobCandidateRoutes, { prefix: `${basePrefix}` });
  app.register(jobFoundationDataTypeRoutes, { prefix: `${basePrefix}` })
  app.register(jobRoutes, { prefix: `${basePrefix}` })
  app.register(jobInterviewRoutes, { prefix: `${basePrefix}` })
  app.register(jobOfferRoutes, { prefix: `${basePrefix}` })
  app.register(candidateLocumNameClearRoutes, { prefix: `${basePrefix}` })
  app.register(submissionCandidateRoutes, { prefix: `${basePrefix}` })
  app.register(submissionCandidateCustomFieldsRoutes, { prefix: `${basePrefix}` })
  app.register(jobDistributionRoutes, { prefix: `${basePrefix}` })
  app.register(JobHistoryRoutes, { prefix: `${basePrefix}` })
  app.register(msOutlookRoutes, {prefix: `${basePrefix}` })
  app.register(candidateHistoryRoutes,{prefix:`${basePrefix}`})
}
