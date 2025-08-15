import { FastifyRequest, FastifyReply } from "fastify";
import jobRateModel from "../models/job-rate.model";
import { JobRateInterface } from "../interfaces/job-rate.interfaces";
import generateCustomUUID from "../utility/genrateTraceId";
import { baseSearch } from "../utility/baseService";
import { logger } from "../utility/loggerServices";
import { decodeToken } from "../middlewares/verifyToken";

export async function getJobRate(request: FastifyRequest, reply: FastifyReply) {
    const searchFields = ['id', 'program_id', 'is_enabled', 'updated_by', 'name'];
    const responseFields = ['id', 'name', 'program_id', 'is_enabled', 'updated_by', 'updated_on'];
    return baseSearch(request, reply, jobRateModel, searchFields, responseFields);
}

export async function getJobRateById(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const traceId = generateCustomUUID();
    try {
        const { program_id, id } = request.params as { program_id: string, id: string };
        const jobRate = await jobRateModel.findOne({ where: { program_id, id } });
        if (jobRate) {
            reply.status(200).send({
                status_code: 200,
                message: 'JobRate fetched Successfully.',
                trace_id: traceId,
                rate: jobRate
            });
        } else {
            reply.status(200).send({
                status_code: 200,
                message: 'JobRate not found.',
                rate: []
            });
        }
    } catch (error) {
        reply.status(500).send({
            status_code: 500,
            message: 'An error occurred while fetching JobRate.',
            trace_id: traceId,
            error: error,
        });
    }
}
export const createJobRate = async (request: FastifyRequest, reply: FastifyReply) => {
    const jobRate = request.body as JobRateInterface;
    const { program_id } = request.params as { program_id: string };
    const traceId = generateCustomUUID();
    const user=request?.user;
    const userId = user?.sub;
    logger({
        trace_id: traceId,
        eventname: "createJobRate",
        status: "info",
        description: `Request received for creating JobRate.`,
        data: { program_id, jobRate },
        action: request.method,
        url: request.url,
    });

    try {
        await jobRateModel.create({ ...jobRate, program_id,created_by: userId,
            updated_by: userId, });

        logger({
            trace_id: traceId,
            eventname: "createJobRate",
            status: "success",
            description: `JobRate created successfully with ID: ${jobRate.id}`,
            data: { program_id, jobRate },
            action: request.method,
            url: request.url,
        });

        reply.status(201).send({
            status_code: 201,
            trace_id: traceId,
            id: jobRate.id,
            message: 'JobRate Created Successfully.',
        });
    } catch (error: any) {
        logger({
            trace_id: traceId,
            eventname: "createJobRate",
            status: "error",
            description: `Error occurred while creating JobRate.`,
            data: { program_id, jobRate },
            action: request.method,
            url: request.url,
            error: error.message,
        });

        reply.status(500).send({
            status_code: 500,
            message: 'An error occurred while creating JobRate.',
            trace_id: traceId,
            error: error.message,
        });
    }
};

export const updateJobRate = async (
    request: FastifyRequest,
    reply: FastifyReply
) => {
    const user=request?.user;
    const userId = user?.sub;
    const { program_id, id } = request.params as { program_id: string, id: string };
    const traceId = generateCustomUUID();

    logger({
        trace_id: traceId,
        eventname: "updateJobRate",
        status: "info",
        description: `Request received for updating JobRate with ID: ${id}`,
        data: { program_id, id, body: request.body },
        action: request.method,
        url: request.url,
    });

    try {
        const [updatedCount] = await jobRateModel.update(request.body as JobRateInterface, { where: { program_id, id,updated_by: userId } });

        if (updatedCount > 0) {
            logger({
                trace_id: traceId,
                eventname: "updateJobRate",
                status: "success",
                description: `JobRate updated successfully with ID: ${id}`,
                data: { program_id, id, changes: request.body },
                action: request.method,
                url: request.url,
            });

            reply.status(201).send({
                status_code: 201,
                message: 'JobRate updated successfully.',
                id: id,
                trace_id: traceId,
            });
        } else {
            logger({
                trace_id: traceId,
                eventname: "updateJobRate",
                status: "warning",
                description: `JobRate with ID: ${id} not found.`,
                data: { program_id, id },
                action: request.method,
                url: request.url,
            });

            reply.status(200).send({
                status_code: 200,
                message: 'JobRate not found.',
            });
        }
    } catch (error:any) {
        logger({
            trace_id: traceId,
            eventname: "updateJobRate",
            status: "error",
            description: `Error occurred while updating JobRate.`,
            data: { program_id, id, requestBody: request.body },
            action: request.method,
            url: request.url,
            error: error.message,
        });

        reply.status(500).send({
            status_code: 500,
            message: 'Internal Server error',
            trace_id: traceId,
            error: error.message,
        });
    }
};

export async function deleteJobRate(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const traceId = generateCustomUUID();
  const user=request?.user;
    const userId = user?.sub;
    try {
        const { program_id, id } = request.params as { program_id: string, id: string };
        const [updatedCount] = await jobRateModel.update({ is_deleted: true, is_enabled: false,updated_by: userId, }, { where: { program_id, id } });
        if (updatedCount > 0) {
            reply.status(204).send({
                status_code: 204,
                message: 'JobRate deleted successfully.',
                id: id,
                trace_id: traceId,
            });
        } else {
            reply.status(200).send({
                status_code: 200,
                message: 'JobRate not found.'
            });
        }
    } catch (error) {
        reply.status(500).send({
            status_code: 500,
            message: 'An error occurred while deleting JobRate.',
            trace_id: traceId,
            error: error,
        });
    }
}
