export interface JobQulificationTypeInterface {
    id: string;
    job_id: string;
    program_id: string;
    qulification_type_id: string;
    qulification: any;
    is_deleted: boolean;
    is_enabled: boolean;
    created_by: string;
    updated_by: string;
    created_on: bigint;
    updated_on: bigint;
}