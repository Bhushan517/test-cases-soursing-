import jobFoundationDataTypeModel from "../models/job-foundation-data-type.model";
import { FastifyRequest, FastifyReply } from "fastify";
import { JobFoundationDataTypeInterface } from "../interfaces/job-foundation-data-type.interface";
import { baseSearch } from "../utility/baseService";
import generateCustomUUID from "../utility/genrateTraceId";
import { logger } from "../utility/loggerServices";
import { decodeToken } from "../middlewares/verifyToken";

export async function getJobFoundationDataType(request: FastifyRequest, reply: FastifyReply) {
    const searchFields = ['id', 'program_id', 'is_enabled', 'updated_by']
    const responseFields = ['id', 'name']
    return baseSearch(request, reply, jobFoundationDataTypeModel, searchFields, responseFields)
}
export async function getJobFoundationDataTypeById(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const traceId = generateCustomUUID();
    try {
        const { program_id, id } = request.params as { program_id: string, id: string };
        const jobFoundationDataType = await jobFoundationDataTypeModel.findOne({ where: { program_id, id } });
        if (jobFoundationDataType) {
            reply.status(200).send({
                status_code: 200,
                message: 'jobFoundationDataType fetched Successfully.',
                trace_id: traceId,
                job_candidate: jobFoundationDataType
            });
        } else {
            reply.status(200).send({
                status_code: 200,
                message: 'jobFoundationDataType not found.',
                job_candidate: []
            });
        }
    } catch (error) {
        reply.status(500).send({
            message: 'An error occurred while fetching jobFoundationDataType.',
            trace_id: traceId,
            error: error,
        });
    }
}

export const createJobFoundationDataType = async (request: FastifyRequest, reply: FastifyReply) => {
    const jobFoundationDataType = request.body as JobFoundationDataTypeInterface;
    const { program_id } = request.params as { program_id: string };
    const traceId = generateCustomUUID();
   const user=request?.user;
    const userId = user?.sub;


    logger({
        trace_id: traceId,
        eventname: "createJobFoundationDataType",
        status: "info",
        description: "Request received for creating jobFoundationDataType",
        data: request.body,
        action: request.method,
        url: request.url,
    });

    try {

        const newDataType = await jobFoundationDataTypeModel.create({
            ...jobFoundationDataType,
            updated_by: userId,
            created_by: userId,
            program_id,
        });


        logger({
            trace_id: traceId,
            eventname: "createJobFoundationDataType",
            status: "success",
            description: `JobFoundationDataType created successfully with ID: ${newDataType.id}`,
            data: newDataType,
            action: request.method,
            url: request.url,
        });

        reply.status(201).send({
            status_code: 201,
            trace_id: traceId,
            id: newDataType.id,
            message: 'JobFoundationDataType Created Successfully.',
        });
    } catch (error: any) {

        logger({
            trace_id: traceId,
            eventname: "createJobFoundationDataType",
            status: "error",
            description: `Error occurred while creating jobFoundationDataType: ${error.message}`,
            data: request.body,
            action: request.method,
            url: request.url,
            error: error.message,
        });

        reply.status(500).send({
            status_code: 500,
            message: 'An error occurred while creating jobFoundationDataType.',
            trace_id: traceId,
            error: error.message,
        });
    }
};

export const updateJobFoundationDataType = async (
    request: FastifyRequest,
    reply: FastifyReply
) => {
    const { program_id, id } = request.params as { program_id: string; id: string };
    const traceId = generateCustomUUID();
    const user=request?.user;
    const userId = user?.sub;


    logger({
        trace_id: traceId,
        eventname: "updateJobFoundationDataType",
        status: "info",
        description: `Request received for updating JobFoundationDataType with ID: ${id}`,
        data: request.body,
        action: request.method,
        url: request.url,
    });

    try {

        const [updatedCount] = await jobFoundationDataTypeModel.update(
            request.body as JobFoundationDataTypeInterface,
            { where: { program_id, id } }
        );

        if (updatedCount > 0) {

            logger({
                trace_id: traceId,
                eventname: "updateJobFoundationDataType",
                status: "success",
                description: `JobFoundationDataType updated successfully for ID: ${id}`,
                data: { program_id, id, changes: request.body },
                action: request.method,
                url: request.url,
            });

            reply.status(200).send({
                status_code: 200,
                message: 'JobFoundationDataType updated successfully.',
                id: id,
                trace_id: traceId,
            });
        } else {

            logger({
                trace_id: traceId,
                eventname: "updateJobFoundationDataType",
                status: "warning",
                description: `JobFoundationDataType with ID: ${id} not found.`,
                data: { program_id, id },
                action: request.method,
                url: request.url,
            });

            reply.status(404).send({
                status_code: 404,
                message: 'JobFoundationDataType not found.',
                trace_id: traceId,
            });
        }
    } catch (error: any) {

        logger({
            trace_id: traceId,
            eventname: "updateJobFoundationDataType",
            status: "error",
            description: `Error occurred while updating JobFoundationDataType: ${error.message}`,
            data: { program_id, id, requestBody: request.body },
            action: request.method,
            url: request.url,
            error: error.message,
        });

        reply.status(500).send({
            status_code: 500,
            message: 'Internal Server Error',
            trace_id: traceId,
            error: error.message,
        });
    }
};

export async function deleteJobFoundationDataType(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const traceId = generateCustomUUID();
   
    try {
        const { program_id, id } = request.params as { program_id: string, id: string };
        const user=request?.user;
        const userId = user?.sub;
        
        const jobFoundationDataTypeData = await jobFoundationDataTypeModel.findOne({ where: { program_id, id } });
        if (jobFoundationDataTypeData) {
            await jobFoundationDataTypeModel.update({ is_deleted: true, is_enabled: false, updated_by: userId }, { where: { program_id, id } });
            reply.status(204).send({
                status_code: 204,
                message: 'jobFoundationDataType deleted successfully.',
                id: id,
                trace_id: traceId,
            });
        } else {
            reply.status(200).send({
                status_code: 200,
                message: 'jobFoundationDataType not found.'
            });
        }
    } catch (error) {
        reply.status(500).send({
            status_code: 500,
            message: 'An error occurred while deleting jobFoundationDataType.',
            trace_id: traceId,
            error: error,
        });
    }
}