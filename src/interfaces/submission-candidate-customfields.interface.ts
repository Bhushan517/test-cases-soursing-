export interface SubmissionCandidateCustomfieldsInterface {
    id: string;
    program_id?: string;
    job_id?: string;
    candidate_id?: string;
    custom_field_id?: string;
    value?: JSON;
    created_on: bigint;
    updated_on: bigint;
    is_deleted?: boolean;
    is_enabled?: boolean;
    updated_by?: string;
    created_by?: string;
    submission_candidate_id?:string;
    page?: string;
    limit?: string;
}
