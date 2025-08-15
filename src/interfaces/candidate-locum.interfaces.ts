export interface CandidateLocumNameClearInterface {
    id: string;
    hierarchy_ids?: any;
    worker_type: string;
    npi: number;
    first_name: string;
    middle_name?: string;
    program_id: string;
    last_name: string;
    name_clear_id: string;
    status?: string;
    vendor_id?: string;
    created_on?: bigint;
    updated_on?: bigint;
    is_deleted?: boolean;
    page?: string,
    limit?: string,
    notes?: string,
    rejection_reason?: string
    userId?: string
    userType?: string
}

export const candidateParamsSchema = {
    type: 'object',
    properties: {
        program_id: { type: 'string' },
        id: { type: 'string' }
    },
    required: ['program_id']
};

export const candidateQuerySchema = {
    type: 'object',
    properties: {
        search: { type: 'string' },
        limit: { type: 'integer' },
        offset: { type: 'integer' }
    }
};

export const createCandidateSchema = {
    type: "object",
    properties: {
        worker_type: { type: "string" },
        npi: { type: "number" },
        first_name: { type: "string" },
        middle_name: { type: "string" },
        last_name: { type: "string" },
        status: { type: "string" },
        vendor_id: { type: "string" },
        name_clear_id: { type: "string" },
        program_id: { type: "string" }
    }
}

