export interface Addresses {
    country: string;
    city: string;
    label: string;
    state: string;
    county: string;
    zipcode: string;
    address_line_1: string;
    address_line_2?: string;
}
export interface SubmissionCandidateInterface {
    id: string;
    program_id?: string;
    resume_url?: string;
    status?: string;
    candidate_id?: string;
    job_id?: string;
    vendor_id: string;
    checklist_entity_id?: string;
    checklist_version?: number;
    onboarding_flow_id: string;
    available_start_date?: any;
    available_end_date?: Date;
    is_candidate_work_before?: boolean;
    is_remote_worker?: boolean;
    candidate_source?: string;
    addresses?: Addresses;
    do_not_rehire?: boolean;
    job_manager?: string;
    employment_status?: string;
    description?: string;
    worker_classification?: string;
    documents?: any;
    financial_detail?: any;
    unique_id?: string;
    created_on: bigint;
    updated_on: bigint;
    is_deleted?: boolean;
    is_enabled?: boolean;
    page?: string,
    limit?: string,
    updates: any,
    reject_reason: string,
    userId?: string,
    userType?: string,
    scores?: any,
    is_duplicate_submission?:boolean
}
export interface SubmissionCandidateCustomFieldInterface {
    id: any;
    value: any;
    custom_fields?: any;
}

export interface SubmissionCandidateQualificationsInterface {
    id: any;
    qualification_type_id: any;
    qualifications?: any;
}

export interface CandidateBudget {
    program_industry: string;
    hierarchy_ids: string[];
    work_location_id: string;
    program_vendor_id: string;
    labor_category_id: string;
    job_type: string;
    job_template_id: string;
    worker_classification: string;
    candidate_source: string;
    vendor_id: string;
    funded_by: string;
    ot_exempt: boolean;
    vendor_markup: string;
    rate_model: string;
    fee_details: Array<{
        fee_type: string;
        funded_by: string;
        is_enabled?: boolean;
        fee_category: string;
        applicable_config: Array<{
            fee: number | null;
            entity_ref: string;
        }>;
    }>;
    rate_factors: Array<{
        is_shift_rate: boolean;
        hierarchies: Array<{
            id: string;
            name: string;
        }>;
        rate_configuration: Array<{
            rate: Array<{
                rate_type: {
                    id: string;
                    name: string;
                    abbreviation: string;
                    rate_type_category: {
                        id: string;
                        value: string;
                        label: string;
                    };
                    is_base_rate: boolean;
                    shift_types: null | string;
                };
                bill_rate: Array<{
                    differential_on: string;
                    differential_type: string;
                    differential_value: number;
                    min_rate: number;
                    max_rate: number;
                }>;
                pay_rate: Array<{
                    differential_on: string;
                    differential_type: string;
                    differential_value: number;
                    min_rate: number;
                    max_rate: number;
                }>;
                rates?: Array<{
                    rate_type: {
                        id: string;
                        name: string;
                        abbreviation: string;
                        rate_type_category: {
                            id: string;
                            value: string;
                            label: string;
                        };
                        is_base_rate: boolean;
                        shift_types: null | string;
                    };
                    bill_rate: Array<{
                        differential_on: string;
                        differential_type: string;
                        differential_value: number;
                        min_rate: number;
                        max_rate: number;
                    }>;
                    pay_rate: Array<{
                        differential_on: string;
                        differential_type: string;
                        differential_value: number;
                        min_rate: number;
                        max_rate: number;
                    }>;
                }>;
            }>;
            base_rate?: {
                rates: Array<{
                    pay_rate: Array<{
                        max_rate: number;
                        min_rate: number;
                        differential_on: string;
                        differential_type: string;
                        differential_value: number;
                    }>;
                    bill_rate: Array<{
                        max_rate: number;
                        min_rate: number;
                        differential_on: string;
                        differential_type: string;
                        differential_value: number;
                    }>;
                    rate_type: {
                        id: string;
                        name: string;
                        is_enabled: boolean;
                        shift_types: null | string;
                        abbreviation: string;
                        is_base_rate: boolean;
                        rate_type_category: string;
                    };
                }>;
                rate_type: {
                    id: string;
                    name: string;
                    max_rate: number;
                    min_rate: number;
                    is_enabled: boolean;
                    shift_types: null | string;
                    abbreviation: string;
                    is_base_rate: boolean;
                    rate_type_category: string;
                };
            };
            vendor_bill_rate: number;
            candidate_pay_rate: number;
        }>;
    }>;
}

export interface MarkupDataInterface {
    sourced_markup_min: number;
    sourced_markup_max: number;
    payrolled_markup_min: number;
    payrolled_markup_max: number;
}
export interface ChecklistAndData {
    checklist?: {
        version_id: string;
        entity_id: string;
        version: number;
        name: string;
        description: string;
    };
    checklist_mappings_and_data?: {
        mapping: {
            id: string;
        };
        task: {
            version_id: string;
            entity_id: string;
            name: string;
            version: number;
        };
        task_data?: {
            task_version_id: string;
            task_entity_id: string;
            task_version: string;
            category_id?: string | null;
            value?: any;
            status?: any;
            sub_status?: string | null;
            message?: string | null;
            sub_message?: string | null;
            attributes?: Record<string, any> | null;
            pre_task_data_entity_id?: string | null;
            pre_task_data_version?: string | null;
            submitted_to_user_id?: string;
            submitted_to_user_mapping_id?: string;
            submitted_to_tenant_id?: string | null;
            is_submitted_to_tenant: boolean;
            submitter_user_id: string;
            submitter_user_mapping_id?: string | null;
            submitter_tenant_id?: string | null;
            subject_user_id: string;
            subject_user_mapping_id?: string | null;
            associations?: Record<string, any> | null;
            is_enabled: boolean;
            is_deleted: boolean;
        };
    }[];
}

export interface FundingModelParams {
    rateDetails: any,
    fundingModel: string,
    rate_model: string,
    candidatePayRate: number,
    STcandidatePayRate: number,
    STvendorBillRate: number,
    STclientBillRate: number,
    vendorBillRate: number,
    clientBillRate: number,
    vendorMarkup: number,
    msp_fee: number,
    feeType: string,
    vmsFee: number,
    mspPartnerFee: number,
    ot_exempt: boolean
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
        offset: { type: 'integer' },
        job_id: { type: 'string' },
        job_ids: { type: 'array', items: { type: 'string' } },
        employment_status: { type: 'string' },
        modified_on: {},
        worker_type_id: { type: 'string' },
        unique_id: { type: 'string' },
        page: { type: 'string' },
        available_start_date: { type: 'string' },
        preferred_location: { type: 'string' },
        status: { type: 'string' },
        first_name: { type: 'string' },
        job_title: { type: 'string' },
        job_code: { type: 'string' }
    }
};

export const createSubmissionCandidateSchema = {
    type: 'object',
    properties: {
        resume_url: { type: 'string' },
        status: { type: 'string' },
        candidate_id: { type: 'string' },
        job_id: { type: 'string' },
        vendor_id: { type: 'string' },
        checklist: { type: 'object' },
        checklist_mappings_and_data: { type: 'array' },
        available_start_date: { type: 'string' },
        available_end_date: { type: 'string' },
        is_candidate_work_before: { type: 'boolean' },
        is_remote_worker: { type: 'boolean' },
        candidate_source: { type: 'string' },
        do_not_rehire: { type: 'boolean' },
        job_manager: { type: 'string' },
        employment_status: { type: 'string' },
        description: { type: 'string' },
        documents: { type: 'object' },
        financial_detail: { type: 'object' },
        custom_fields: { type: 'array' },
        unique_id: { type: 'string' },
        created_on: { type: 'number' },
        modified_on: { type: 'number' },
        is_deleted: { type: 'boolean' },
        is_enabled: { type: 'boolean' },
        addresses: {
            type: 'object',
            properties: {
                country: { type: 'string' },
                city: { type: 'string' },
                label: { type: 'string' },
                state: { type: 'string' },
                county: { type: 'string' },
                zipcode: { type: 'string' },
                address_line_1: { type: 'string' },
                address_line_2: { type: 'string' }
            },
        }
    }
}

export const candidateBudgetSchema = {
    type: "object",
    required: [
        "vendor_id",
        "ot_exempt",
        "rate_model",
        "rate_factors",
        "labor_category_id",
        "candidate_source",
        "job_template_id"
    ],
    properties: {
        ot_exempt: { type: "boolean" },
        rate_model: { type: "string" },
        rate_factors: {
            type: "array",
            items: {
                type: "object",
                required: ["is_shift_rate", "hierarchies", "rate_configuration"],
                properties: {
                    is_shift_rate: { type: ["string", "boolean"] },
                    hierarchies: {
                        type: "array",
                        items: {
                            type: "object",
                            required: ["id", "name"],
                            properties: {
                                id: { type: "string" },
                                name: { type: "string" },
                            },
                        },
                    },
                    rate_configuration: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                rate: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            rate_type: {
                                                type: "object",
                                                required: [
                                                    "id",
                                                    "name",
                                                    "abbreviation",
                                                    "rate_type_category",
                                                    "is_base_rate"
                                                ],
                                                properties: {
                                                    id: { type: "string" },
                                                    name: { type: "string" },
                                                    abbreviation: { type: "string" },
                                                    is_base_rate: { type: "boolean" },
                                                    shift_types: { type: ["string", "null"] },
                                                    rate_type_category: {
                                                        type: "object",
                                                        required: ["id", "value", "label"],
                                                        properties: {
                                                            id: { type: "string" },
                                                            value: { type: "string" },
                                                            label: { type: "string" },
                                                        },
                                                    },
                                                },
                                            },
                                            bill_rate: {
                                                type: "array",
                                                items: {
                                                    type: "object",
                                                    required: [
                                                        "differential_on",
                                                        "differential_type",
                                                        "differential_value",
                                                        "min_rate",
                                                        "max_rate",
                                                    ],
                                                    properties: {
                                                        differential_on: { type: "string" },
                                                        differential_type: { type: "string" },
                                                        differential_value: { type: "number" },
                                                        min_rate: { type: "number" },
                                                        max_rate: { type: "number" },
                                                    },
                                                },
                                            },
                                            pay_rate: {
                                                type: "array",
                                                items: {
                                                    type: "object",
                                                    required: [
                                                        "differential_on",
                                                        "differential_type",
                                                        "differential_value",
                                                        "min_rate",
                                                        "max_rate",
                                                    ],
                                                    properties: {
                                                        differential_on: { type: "string" },
                                                        differential_type: { type: "string" },
                                                        differential_value: { type: "number" },
                                                        min_rate: { type: "number" },
                                                        max_rate: { type: "number" },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                                vendor_bill_rate: { type: "number" },
                                candidate_pay_rate: { type: "number" },
                            },
                        },
                    },
                },
            },
        },
        labor_category_id: { type: "string" },
        work_location_id: { type: "string" },
        job_type: { type: "string" },
        job_template_id: { type: "string" },
        vendor_id: { type: "string" },
        candidate_source: { type: "string" },
    },
};

export interface FeeConfig {
    categorical_fees: {
        fee_category: string;
        fee_type: string;
        funded_by: string;
        applicable_config: { fee: string, entity_ref: string }[];
    }[];
    funding_model: string;
    is_enabled: boolean;
}

