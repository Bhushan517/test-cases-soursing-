export interface JobCustomfieldsInterface {
    id: string;
    program_id: string;
    custom_field_id: string;
    value: string;
    job_id: string;
    is_enabled: boolean;
    is_deleted: boolean;
    created_by: string;
    updated_by: string;
    created_on: bigint;
    updated_on: bigint;
}