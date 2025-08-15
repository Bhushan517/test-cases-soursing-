import { FastifyRequest, FastifyReply } from 'fastify';
import SubmissionCandidateCustomfieldsModel from '../models/submission-candidate-customfields.model';
import { SubmissionCandidateCustomfieldsInterface } from '../interfaces/submission-candidate-customfields.interface';
import generateCustomUUID from '../utility/genrateTraceId';
import { Op } from 'sequelize';

export const createSubmissionCandidateCustomFields = async (
    request: FastifyRequest<{ Params: { program_id: string } }>,
    reply: FastifyReply
) => {
    const candidate = request.body as SubmissionCandidateCustomfieldsInterface;
    const traceId = generateCustomUUID();
    const { program_id } = request.params;

    const candidateData = {
        ...candidate,
        program_id,
    };
    try {
        const createdCandidate = await SubmissionCandidateCustomfieldsModel.create(candidateData);

        reply.status(201).send({
            status_code: 201,
            trace_id: traceId,
            id: createdCandidate.id,
            message: 'Candidate custom field created successfully for submission.',
        });
    } catch (error) {
        reply.status(500).send({
            status_code: 500,
            message: 'An error occurred while creating the candidate custom fields for submission.',
            trace_id: traceId,
        });
    }
};

export const getAllSubmissionCandidateCustomFields = async (
    request: FastifyRequest<{ Querystring: SubmissionCandidateCustomfieldsInterface, Params: { program_id: string } }>, reply: FastifyReply
) => {
    const traceId = generateCustomUUID();
    const { program_id } = request.params;

    try {
        const {
            page,
            limit,
            updated_on
        } = request.query;

        const pageNumber = parseInt(page ?? "1");
        const pageSize = parseInt(limit ?? "10");
        const offset = (pageNumber - 1) * pageSize;

        const whereCondition: any = {
            program_id,
            is_deleted: false
        };
        if (updated_on) {
            whereCondition.updated_on = { [Op.eq]: updated_on };
        }

        const { rows: candidates, count } = await SubmissionCandidateCustomfieldsModel.findAndCountAll({
            where: whereCondition,
            limit: pageSize,
            offset,
        });

        reply.status(200).send({
            status_code: 200,
            trace_id: traceId,
            message: 'Candidate custom field retrieved successfully for submission',
            total: count,
            page: pageNumber,
            limit: pageSize,
            submission_candidate: candidates,

        });
    } catch (error) {
        reply.status(500).send({
            status_code: 500,
            message: 'Failed to fetch candidate custom field for submission',
            trace_id: traceId,
            error,
        });
    }
};

export const getSubmissionCandidateCustomFieldsById = async (
    request: FastifyRequest<{ Params: { program_id: string; id: string } }>,
    reply: FastifyReply
) => {
    const traceId = generateCustomUUID();
    const { program_id, id } = request.params;

    try {
        const candidates = await SubmissionCandidateCustomfieldsModel.findAll({
            where: {
                id,
                program_id,
                is_deleted: false,
            }
        });

        if (!candidates) {
            return reply.status(400).send({
                status_code: 400,
                trace_id: traceId,
                message: 'Candidate custom field not found for submission',
                submission_candidate: [],
            });
        }

        reply.status(200).send({
            status_code: 200,
            trace_id: traceId,
            submission_candidate: candidates,
        });
    } catch (error) {
        reply.status(500).send({
            status_code: 500,
            message: 'Failed to fetch candidate custom field deleted successfully for submission',
            trace_id: traceId,
        });
    }
};

export const updateSubmissionCandidateCustomFields = async (
    request: FastifyRequest<{
        Params: { program_id: string; id: string };
        Body: Partial<SubmissionCandidateCustomfieldsInterface>;
    }>,
    reply: FastifyReply
) => {
    const traceId = generateCustomUUID();
    const { program_id, id } = request.params;
    const updateData = request.body;

    try {
        const candidate = await SubmissionCandidateCustomfieldsModel.findOne({ where: { id, program_id } });

        if (!candidate) {
            return reply.status(404).send({
                status_code: 404,
                message: 'Candidate custom field not found for submission',
                trace_id: traceId,
            });
        }

        await candidate.update({ ...updateData, updated_on: new Date() });

        reply.status(200).send({
            status_code: 200,
            message: 'Candidate custom field updated successfully for submission',
            trace_id: traceId,
        });
    } catch (error) {
        reply.status(500).send({
            status_code: 500,
            message: 'Failed to update candidate custom field for submission',
            trace_id: traceId,
        });
    }
};

export async function deleteSubmissionCandidateCustomFields(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const traceId = generateCustomUUID();

    try {
        const { program_id, id } = request.params as { program_id: string, id: string };
        const candidateLocum = await SubmissionCandidateCustomfieldsModel.findOne({ where: { program_id, id } });

        if (candidateLocum) {
            await SubmissionCandidateCustomfieldsModel.update({ is_deleted: true, is_enabled: false }, { where: { program_id, id } });

            reply.status(204).send({
                status_code: 204,
                message: 'Candidate custom field deleted successfully for submission',
                trace_id: traceId,
            });
        } else {
            reply.status(404).send({
                status_code: 404,
                message: 'Candidate custom field not found for submission',
                trace_id: traceId,
            });
        }
    } catch (error) {
        reply.status(500).send({
            status_code: 500,
            message: 'Failed to delete candidate custom field for submission',
            trace_id: traceId,
            error,
        });
    }
};
