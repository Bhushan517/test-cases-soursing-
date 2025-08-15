import { FastifyRequest, FastifyReply } from "fastify";
import { JobQulificationTypeInterface } from "../interfaces/job-qulification-type.interface";
import generateCustomUUID from "../utility/genrateTraceId";
import { baseSearch } from "../utility/baseService";
import jobQulificationTypeModel from "../models/job-qulification-type.model";
import { logger } from "../utility/loggerServices";
import { decodeToken } from "../middlewares/verifyToken";

export async function getJobQulificationType(request: FastifyRequest, reply: FastifyReply) {
    const traceId = generateCustomUUID();
    try {
        const jobQulificationTypes = await jobQulificationTypeModel.findAll({
            where: { is_deleted: false },
            order: [['created_on', 'DESC']],
            limit: 10,
            attributes: ['id', 'is_enabled', 'updated_by', 'updated_on'] 
        });
        reply.status(200).send({
            status_code: 200,
            message: 'JobQulificationTypes fetched successfully.',
            trace_id: traceId,
            data: jobQulificationTypes
        });
    } catch (error) {
        reply.status(500).send({
            status_code: 500,
            message: 'An error occurred while fetching JobQulificationTypes.',
            trace_id: traceId,
            error: error
        });
    }
}

export async function getJobQulificationTypeById(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const traceId = generateCustomUUID();
    try {
        const { program_id, id } = request.params as { program_id: string, id: string };
        const jobQulificationType = await jobQulificationTypeModel.findOne({ where: { program_id, id } });
        if (jobQulificationType) {
            reply.status(200).send({
                status_code: 200,
                message: 'JobQulificationType fetched Successfully.',
                trace_id: traceId,
                type: jobQulificationType
            });
        } else {
            reply.status(200).send({
                status_code: 200,
                message: 'JobQulificationType not found.',
                type: []
            });
        }
    } catch (error) {
        reply.status(500).send({
            status_code: 500,
            message: 'An error occurred while fetching JobQulificationType.',
            trace_id: traceId,
            error: error,
        });
    }
}

export const createJobQulificationType = async (
    request: FastifyRequest,
    reply: FastifyReply
) => {
    const jobQulificationType = request.body as JobQulificationTypeInterface;
    const { program_id } = request.params as { program_id: string };
    const traceId = generateCustomUUID();
   const user=request?.user;
    const userId = user?.sub;
    console.log("uuu", userId)


    logger(
        {
            trace_id: traceId,
            data: request.body,
            eventname: "creating job qualification type",
            status: "info",
            description: `Attempting to create job qualification type for program_id: ${program_id}`,
            level: "info",
            action: request.method,
            url: request.url,
            is_deleted: false,
        },
        jobQulificationTypeModel
    );

    try {
        const newJobQualificationType = await
            jobQulificationTypeModel.create({
                ...jobQulificationType,
                program_id,
                created_by: userId,
                updated_by: userId,
            });


        logger(
            {
                trace_id: traceId,
                data: request.body,
                eventname: "job qualification type created",
                status: "success",
                description: `Job qualification type created successfully for program_id: ${program_id}`,
                level: "success",
                action: request.method,
                url: request.url,
                is_deleted: false,
            },
            jobQulificationTypeModel
        );

        reply.status(201).send({
            status_code: 201,
            trace_id: traceId,
            id: newJobQualificationType?.id,
            message: "JobQulificationType Created Successfully.",
        });
    } catch (error: any) {

        logger({
            trace_id: traceId,
            data: request.body,
            eventname: "job qualification type creation failed",
            status: "error",
            description: `Failed to create job qualification type for program_id: ${program_id}. Error: ${error.message}`,
            level: "error",
            action: request.method,
            url: request.url,
            is_deleted: false,
        });

        reply.status(500).send({
            status_code: 500,
            message: "An error occurred while creating JobQulificationType.",
            trace_id: traceId,
            error: (error as Error).message,
        });
    }
};



export const updateJobQulificationType = async (
    request: FastifyRequest,
    reply: FastifyReply
) => {
    const { program_id, id } = request.params as { program_id: string; id: string };
    const traceId = generateCustomUUID();
    let { name } = request.body as { name: string };
    name = name.trim();
   const user=request?.user;
    const userId = user?.sub

    logger(
        {
            trace_id: traceId,
            data: request.body,
            eventname: "updating job qualification type",
            status: "info",
            description: `Attempting to update job qualification type with ID: ${id} for program_id: ${program_id}`,
            level: "info",
            action: request.method,
            url: request.url,
            is_deleted: false,
        },
        jobQulificationTypeModel
    );

    try {
        const [updatedCount] = await jobQulificationTypeModel.update(
            {
                ...request.body as JobQulificationTypeInterface, updated_by: userId,
            }, { where: { program_id, id } }
        );

        if (updatedCount > 0) {

            logger(
                {
                    trace_id: traceId,
                    data: request.body,
                    eventname: "job qualification type updated",
                    status: "success",
                    description: `Successfully updated job qualification type with ID: ${id} for program_id: ${program_id}`,
                    level: "success",
                    action: request.method,
                    url: request.url,
                    is_deleted: false,
                },
                jobQulificationTypeModel
            );

            reply.send({
                status_code: 201,
                message: "JobQulificationType updated successfully.",
                id: id,
                trace_id: traceId,
            });
        } else {

            logger(
                {
                    trace_id: traceId,
                    data: request.body,
                    eventname: "job qualification type not found",
                    status: "info",
                    description: `Job qualification type with ID: ${id} not found for program_id: ${program_id}`,
                    level: "info",
                    action: request.method,
                    url: request.url,
                    is_deleted: false,
                },
                jobQulificationTypeModel
            );

            reply.status(200).send({
                status_code: 200,
                message: "JobQulificationType not found.",
                trace_id: traceId,
            });
        }
    } catch (error: any) {

        logger({
            trace_id: traceId,
            data: request.body,
            eventname: "update job qualification type failed",
            status: "error",
            description: `Failed to update job qualification type with ID: ${id} for program_id: ${program_id}. Error: ${error.message}`,
            level: "error",
            action: request.method,
            url: request.url,
            is_deleted: false,
        });

        reply.status(500).send({
            status_code: 500,
            message: "Internal Server error",
            trace_id: traceId,
            error,
        });
    }
};


export async function deleteJobQulificationType(
    request: FastifyRequest,
    reply: FastifyReply
) {

    let { name } = request.body as { name: string };
    name = name.trim();
   const user=request?.user;
    const userId = user?.sub
    const traceId = generateCustomUUID();

    try {
        const { program_id, id } = request.params as { program_id: string, id: string };
        const [updatedCount] = await jobQulificationTypeModel.update({ is_deleted: true, is_enabled: false, updated_by: userId, }, { where: { program_id, id } });
        if (updatedCount > 0) {
            reply.status(204).send({
                status_code: 204,
                message: 'JobQulificationType deleted successfully.',
                id: id,
                trace_id: traceId,
            });
        } else {
            reply.status(200).send({
                status_code: 200,
                message: 'JobQulificationType not found.'
            });
        }
    } catch (error) {
        reply.status(500).send({
            status_code: 500,
            message: 'An error occurred while deleting JobQulificationType.',
            trace_id: traceId,
            error: error,
        });
    }
}
