import { Json } from "sequelize/types/utils";

export interface JobMasterDataInterface {
    id: string;
    program_id: string;
    job_temp_id?: string | null;
    foundation_data_type_id: string;
    foundation_data_id: Json;
    is_read_only: boolean;
    is_deleted: boolean;
    is_enabled: boolean;
    created_by?: string | null;
    updated_by?: string | null;
    created_on: bigint;
    updated_on: bigint;
}