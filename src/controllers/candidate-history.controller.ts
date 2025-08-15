import { FastifyRequest, FastifyReply } from 'fastify';
import { CandidateHistoryService } from "../services/candidate-history.service";

const candidateHistoryService = new CandidateHistoryService();

export async function candidateHistory(
    request: FastifyRequest<{ Params: { program_id: string } }>,
    reply: FastifyReply
) {
    try {
        const result = await candidateHistoryService.createCandidateHistory(request);
        reply.code(201).send(result);
    } catch (error: unknown) {
        const err = error as Error;
        console.error('Error creating candidate history:', err);
        reply.code(500).send({ error: err.message });
    }
}

export async function getCandidateHistoryAll(
    request: FastifyRequest<{ Params: { program_id: string; candidate_id: string } }>,
    reply: FastifyReply
) {
    try {
        const result = await candidateHistoryService.getAllCandidateHistory(request);
        
        if (result.status_code === 404) {
            return reply.code(404).send({
                status_code: 404,
                message: "Candidate history not found.",
                history: [],
            });
        }
        
        return reply.code(200).send({
            status_code: 200,
            message: "Candidate revision history fetched successfully.",
            history: result.history,
        });
    } catch (error: unknown) {
        const err = error as Error;
        console.error("Error fetching candidate revision histories:", err);
        return reply.code(500).send({
            status_code: 500,
            message: `Failed to fetch candidate revision histories: ${err.message}`,
        });
    }
}

export async function getCandidateHistory(
    request: FastifyRequest<{ Params: { program_id: string, candidate_id: string, revision_id: string } }>,
    reply: FastifyReply
) {
    try {
        const result = await candidateHistoryService.getCandidateHistoryByRevision(request);
        
        if (result.status_code === 404) {
            return reply.code(404).send({
                status_code: 404,
                message: "Candidate revision history not found.",
                data: null,
            });
        }

        return reply.send({
            message: "Candidate revision history fetched successfully",
            data: result.data,
        });

    } catch (error: unknown) {
        const err = error as Error;
        console.error("Error fetching revision history:", err);
        reply.code(500).send({
            error: `Failed to fetch revision history: ${err.message}`,
        });
    }
}