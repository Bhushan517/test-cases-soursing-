export interface JobRateInterface{
    id: string;
    program_id: string;
    job_id: string;
    rate_type_id: string;
    abbreviation: string;
    billable: boolean;
    name: string;
    is_enabled: boolean;
    is_deleted: boolean;
    created_by: string;
    updated_by: string;
    created_on: bigint;
    updated_on: bigint;
}
export const paramsSchema = {
    type: 'object',
    properties: {
        program_id: { type: 'string' },
        id: { type: 'string' }
    },
    required: ['program_id']
};

export const querySchema = {
    type: 'object',
    properties: {
        search: { type: 'string' },
        limit: { type: 'integer' },
        offset: { type: 'integer' }
    }
};

export const createJobRateSchema = {
    type: 'object',
    required: ['program_id'],
    properties: {
        program_id: { type: 'string' },
        job_id: { type: 'string' },
        rate_type_id: { type: 'string' },
        abbreviation: { type: 'string' },
        billable: { type: 'boolean' },
        pay_rate: {
            type: 'array',
        },
        bill_rate: {
            type: 'array',
        },
        name: { type: 'string' },
        is_enabled: { type: 'boolean' },
        is_deleted: { type: 'boolean' },
        created_by: { type: 'string' },
        updated_by: { type: 'string' },
        created_on: { type: 'string' },
        updated_on: { type: 'string' }
    }
};

