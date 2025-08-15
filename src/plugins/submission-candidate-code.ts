import SubmissionCandidateModel from '../models/submission-candidate.model';
import SubmissionCandidateRepository from "../repositories/submission-candidate.repository";
const submissionCandidateRepository = new SubmissionCandidateRepository();

export default async function generatedCandidateSubmissionCode(program_id: string): Promise<string | null> {
    const programResult = await submissionCandidateRepository.programQuery(program_id);

    if (!programResult || programResult.length === 0) {
        throw new Error('Program not found');
    }

    if (programResult.length > 0 && programResult[0].unique_id) {
        const programPrefix = programResult[0].unique_id
            .substring(0, 3)
            .toUpperCase();
        const count = await SubmissionCandidateModel.count({ where: { program_id } });
        const sequence = (count + 1).toString().padStart(5, "0");
        return `${programPrefix}-SUB-${sequence}`;
    }
    return null;
}
