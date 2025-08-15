import { FastifyRequest, FastifyReply } from "fastify";
import generateCustomUUID from "../utility/genrateTraceId";
import {IntegrationService} from "../services/integration.service";


export async function getAllJobsByProgramId(
    request: FastifyRequest<{
        Params: { program_id: string };
        Querystring: { page?: string; limit?: string };
    }>,
    reply: FastifyReply
) {
    const trace_id = generateCustomUUID();
    try {
        const integrationService = new IntegrationService();
        const result = await integrationService.getAllJobsByProgramId(request, trace_id);
        return reply.status(result.status_code).send(result);
    } catch (error: any) {
        console.error("Error in getAllJobsByProgramId:", error);
        return reply.status(500).send({
            message: "Internal Server Error",
            trace_id,
            error: error.message
        });
    }
}
