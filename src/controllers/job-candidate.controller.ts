import jobCandidateModel from "../models/job-candidate.model";
import { FastifyRequest, FastifyReply } from "fastify";
import { JobCandidateInterface } from "../interfaces/job-candidate.interface";
import { baseSearch } from "../utility/baseService";
import generateCustomUUID from "../utility/genrateTraceId";
import { logger } from "../utility/loggerServices";
import { decodeToken } from "../middlewares/verifyToken";

export async function getJobCandidate(request: FastifyRequest, reply: FastifyReply) {
    const searchFields = ['id', 'program_id', 'is_enabled', 'updated_by']
    const responseFields = ['id', 'name']
    return baseSearch(request, reply, jobCandidateModel, searchFields, responseFields)
}
export async function getJobCandidateById(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const traceId = generateCustomUUID();
    try {
        const { program_id, id } = request.params as { program_id: string, id: string };
        const jobCandidate = await jobCandidateModel.findOne({ where: { program_id, id } });
        if (jobCandidate) {
            reply.status(200).send({
                status_code: 200,
                message: 'jobCandidate fetched Successfully.',
                trace_id: traceId,
                job_candidate: jobCandidate
            });
        } else {
            reply.status(200).send({
                status_code: 200,
                message: 'jobCandidate not found.',
                job_candidate: []
            });
        }
    } catch (error) {
        reply.status(500).send({
            message: 'An error occurred while fetching jobCandidate.',
            trace_id: generateCustomUUID(),
            error: error,
        });
    }
}

export const createJobCandidate = async (request: FastifyRequest, reply: FastifyReply) => {
    const jobCandidate = request.body as JobCandidateInterface;
    const { program_id } = request.params as { program_id: string };
    const traceId = generateCustomUUID();
    const user=request?.user;
    const userId = user?.sub;

    logger({
        trace_id: traceId,
        eventname: "createJobCandidate",
        status: "info",
        description: `Request received for creating JobCandidate.`,
        data: { program_id, jobCandidate },
        action: request.method,
        url: request.url,
    });

    try {
        await jobCandidateModel.create({ ...jobCandidate, program_id ,created_by: userId,updated_by: userId,});

        logger({
            trace_id: traceId,
            eventname: "createJobCandidate",
            status: "success",
            description: `JobCandidate created successfully with ID: ${jobCandidate.id}`,
            data: { program_id, jobCandidate },
            action: request.method,
            url: request.url,
        });

        reply.status(201).send({
            status_code: 201,
            trace_id: traceId,
            id: jobCandidate.id,
            message: 'JobCandidate Created Successfully.',
        });
    } catch (error: any) {
        logger({
            trace_id: traceId,
            eventname: "createJobCandidate",
            status: "error",
            description: `Error occurred while creating JobCandidate.`,
            data: { program_id, jobCandidate },
            action: request.method,
            url: request.url,
            error: error.message,
        });

        reply.status(500).send({
            status_code: 500,
            message: 'An error occurred while creating JobCandidate.',
            trace_id: traceId,
            error: error.message,
        });
    }
};



export const updateJobCandidate = async (
    request: FastifyRequest,
    reply: FastifyReply
) => {
    const { program_id, id } = request.params as { program_id: string, id: string };
    const traceId = generateCustomUUID();
    const user=request?.user;
    const userId = user?.sub;
    logger({
        trace_id: traceId,
        eventname: "updateJobCandidate",
        status: "info",
        description: `Request received for updating JobCandidate with ID: ${id}`,
        data: { program_id, id, body: request.body },
        action: request.method,
        url: request.url,
    });

    try {
        const [updatedCount] = await jobCandidateModel.update({ ...jobCandidateModel, updated_by: userId,},  { where: { program_id, id } });

        if (updatedCount > 0) {
            logger({
                trace_id: traceId,
                eventname: "updateJobCandidate",
                status: "success",
                description: `JobCandidate updated successfully with ID: ${id}`,
                data: { program_id, id, changes: request.body },
                action: request.method,
                url: request.url,
            });

            reply.send({
                status_code: 201,
                message: 'JobCandidate updated successfully.',
                id: id,
                trace_id: traceId,
            });
        } else {
            logger({
                trace_id: traceId,
                eventname: "updateJobCandidate",
                status: "warning",
                description: `JobCandidate with ID: ${id} not found.`,
                data: { program_id, id },
                action: request.method,
                url: request.url,
            });

            reply.status(200).send({
                status_code: 200,
                message: 'JobCandidate not found.',
            });
        }
    } catch (error: any) {
        logger({
            trace_id: traceId,
            eventname: "updateJobCandidate",
            status: "error",
            description: `Error occurred while updating JobCandidate.`,
            data: { program_id, id, requestBody: request.body },
            action: request.method,
            url: request.url,
            error: error.message,
        });

        reply.status(500).send({
            message: 'Internal Server error',
            trace_id: traceId,
            error: error.message,
        });
    }
};

export async function deleteJobCandidate(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const traceId = generateCustomUUID();
    const user=request?.user;
    const userId = user?.sub;
    try {
        const { program_id, id } = request.params as { program_id: string, id: string };
        const jobCandidateData = await jobCandidateModel.findOne({ where: { program_id, id } });
        if (jobCandidateData) {
            await jobCandidateModel.update({ is_deleted: true, is_enabled: false,updated_by: userId, }, { where: { program_id, id } });
            reply.status(204).send({
                status_code: 204,
                message: 'jobCandidate deleted successfully.',
                id: id,
                trace_id: traceId,
            });
        } else {
            reply.status(200).send({
                status_code: 200,
                message: 'jobCandidate not found.'
            });
        }
    } catch (error) {
        reply.status(500).send({
            status_code:500,
            message: 'An error occurred while deleting jobCandidate.',
            trace_id:traceId,
            error: error,
        });
    }
}