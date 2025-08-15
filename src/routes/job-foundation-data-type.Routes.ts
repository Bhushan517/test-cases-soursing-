import { FastifyInstance } from "fastify";
import {
    getJobFoundationDataTypeById,
    createJobFoundationDataType,
    updateJobFoundationDataType,
    deleteJobFoundationDataType,
    getJobFoundationDataType
} from "../controllers/job-foundation-data-type.controller";
import { verifyToken } from "../middlewares/verifyToken";

export default async function (app: FastifyInstance) {
    app.addHook('preHandler', verifyToken);
    app.get("/program/:program_id/job_foundation_data_type/:id", getJobFoundationDataTypeById);
    app.post("/program/:program_id/job_foundation_data_type", createJobFoundationDataType);
    app.get("/program/:program_id/job_foundation_data_type", getJobFoundationDataType);
    app.put("/program/:program_id/job_foundation_data_type/:id", updateJobFoundationDataType);
    app.delete("/program/:program_id/job_foundation_data_type/:id", deleteJobFoundationDataType);
}