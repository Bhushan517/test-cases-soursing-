import { FastifyRequest, FastifyReply } from "fastify";
import jobCustomfieldsModel from "../models/job-custom-fields.model";
import { JobCustomfieldsInterface } from "../interfaces/job-custom-fields.interfaces";
import generateCustomUUID from "../utility/genrateTraceId";
import { baseSearch } from "../utility/baseService";
import { logger } from "../utility/loggerServices";
import { decodeToken } from "../middlewares/verifyToken";

export async function getJobCustomfields(request: FastifyRequest, reply: FastifyReply) {
    const traceId = generateCustomUUID();
    try {
        const jobCustomfields = await jobCustomfieldsModel.findAll({
            where: { is_deleted: false },
            order: [['created_on', 'DESC']],
            limit: 10,
            attributes: ['id', 'program_id', 'is_enabled', 'updated_by', 'updated_on'] 
        });
        reply.status(200).send({
            status_code: 200,
            message: 'JobCustomfields fetched successfully.',
            trace_id: traceId,
            data: jobCustomfields
        });
    } catch (error) {
        reply.status(500).send({
            status_code: 500,
            message: 'An error occurred while fetching JobCustomfields.',
            trace_id: traceId,
            error: error
        });
    }
}

export async function getJobCustomfieldsById(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const traceId = generateCustomUUID();
    try {
        const { program_id, id } = request.params as { program_id: string, id: string };
        const jobCustomfields = await jobCustomfieldsModel.findOne({ where: { program_id, id } });
        if (jobCustomfields) {
            reply.status(200).send({
                status_code: 200,
                message: 'JobCustomfields fetched Successfully.',
                trace_id: traceId,
                customfields: jobCustomfields
            });
        } else {
            reply.status(200).send({
                status_code: 200,
                message: 'JobCustomfields not found.',
                customfields: []
            });
        }
    } catch (error) {
        reply.status(500).send({
            status_code:500,
            message: 'An error occurred while fetching JobCustomfields.',
            trace_id: traceId,
            error: error,
        });
    }
}

export const createJobCustomfields = async (
    request: FastifyRequest,
    reply: FastifyReply
) => {
    const jobCustomfields = request.body as JobCustomfieldsInterface;
    const { program_id } = request.params as { program_id: string };
    const traceId = generateCustomUUID();
    const user=request?.user;
    const userId = user?.sub;
    logger({
        trace_id: traceId,
        eventname: "createJobCustomfields",
        status: "info",
        description: "Request received for creating JobCustomfields",
        data: { program_id, jobCustomfields },
        action: request.method,
        url: request.url,
    });

    try {
        const createdJobCustomfields = await jobCustomfieldsModel.create({
            ...jobCustomfields,
            program_id,
            created_by: userId,
            updated_by: userId,
        });

        logger({
            trace_id: traceId,
            eventname: "createJobCustomfields",
            status: "success",
            description: `JobCustomfields created successfully with ID: ${createdJobCustomfields.custom_field_id}`,
            data: { program_id, createdJobCustomfields },
            action: request.method,
            url: request.url,
        });

        reply.status(201).send({
            status_code: 201,
            trace_id: traceId,
            id: createdJobCustomfields.custom_field_id,
            message: "JobCustomfields Created Successfully.",
        });
    } catch (error: any) {
        logger({
            trace_id: traceId,
            eventname: "createJobCustomfields",
            status: "error",
            description: `Error occurred while creating JobCustomfields: ${error.message}`,
            data: { program_id, jobCustomfields },
            action: request.method,
            url: request.url,
            error: error.message,
        });

        reply.status(500).send({
            status_code: 500,
            message: "An error occurred while creating JobCustomfields.",
            trace_id: traceId,
            error: error.message,
        });
    }
};

export const updateJobCustomfields = async (
    request: FastifyRequest,
    reply: FastifyReply
) => {
    const { program_id, id } = request.params as { program_id: string; id: string };
    const traceId = generateCustomUUID();
   const user=request?.user;
    const userId = user?.sub;
    logger({
        trace_id: traceId,
        eventname: "updateJobCustomfields",
        status: "info",
        description: "Request received for updating JobCustomfields",
        data: { program_id, id, requestBody: request.body },
        action: request.method,
        url: request.url,
    });

    try {
        const [updatedCount] = await jobCustomfieldsModel.update(
           {...jobCustomfieldsModel,updated_by: userId,},
            { where: { program_id, id } }
        );

        if (updatedCount > 0) {
            logger({
                trace_id: traceId,
                eventname: "updateJobCustomfields",
                status: "success",
                description: `JobCustomfields updated successfully for ID: ${id}`,
                data: { program_id, id, changes: request.body },
                action: request.method,
                url: request.url,
            });

            reply.status(201).send({
                status_code: 201,
                message: "JobCustomfields updated successfully.",
                id: id,
                trace_id: traceId,
            });
        } else {
            logger({
                trace_id: traceId,
                eventname: "updateJobCustomfields",
                status: "warning",
                description: `JobCustomfields not found for ID: ${id}`,
                data: { program_id, id },
                action: request.method,
                url: request.url,
            });

            reply.status(200).send({
                status_code: 200,
                message: "JobCustomfields not found.",
                trace_id: traceId,
            });
        }
    } catch (error: any) {
        logger({
            trace_id: traceId,
            eventname: "updateJobCustomfields",
            status: "error",
            description: `Error occurred while updating JobCustomfields: ${error.message}`,
            data: { program_id, id, requestBody: request.body },
            action: request.method,
            url: request.url,
            error: error.message,
        });

        reply.status(500).send({
            status_code: 500,
            message: "Internal Server error",
            trace_id: traceId,
            error: error.message,
        });
    }
};
export async function deleteJobCustomfields(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const traceId = generateCustomUUID();
    const user=request?.user;
    const userId = user?.sub;
    try {
        const { program_id, id } = request.params as { program_id: string, id: string };
        const jobCustomfieldsData = await jobCustomfieldsModel.findOne({ where: { program_id, id } });
        if (jobCustomfieldsData) {
            await jobCustomfieldsModel.update({ is_deleted: true, is_enabled: false,updated_by: userId, }, { where: { program_id, id } });
            reply.status(204).send({
                status_code: 204,
                message: 'JobCustomfields deleted successfully.',
                id: id,
                trace_id: traceId,
            });
        } else {
            reply.status(200).send({
                status_code: 200,
                message: 'JobCustomfields not found.'
            });
        }
    } catch (error) {
        reply.status(500).send({
            status_code:500,
            message: 'An error occurred while deleting JobCustomfields.',
            trace_id: traceId,
            error: error,
        });
    }
}

export async function deleteJobRate(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const traceId = generateCustomUUID();
    const user=request?.user;
    const userId = user?.sub;
    try {
        const { program_id, id } = request.params as { program_id: string, id: string };
        const [updatedCount] = await jobCustomfieldsModel.update({ is_deleted: true, is_enabled: false,updated_by: userId, }, { where: { program_id, id } });
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
            status_code:500,
            message: 'An error occurred while deleting JobRate.',
            trace_id: traceId,
            error: error,
        });
    }
}
