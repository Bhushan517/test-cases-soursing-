import { z } from 'zod';
export interface JobInterface {
    upsert: any;
    job_id: boolean;
    id: string;
    program_id: string;
    job_manager_id: string;
    job_type: string;
    job_template_id: string;
    hierarchy_ids: string[];
    work_location_id: string;
    checklist_entity_id: string;
    checklist_version: number;
    labor_category_id: string;
    description: string;
    additional_attachments: any[];
    job_leval: string;
    pri_identified_candidates: any;
    credentials: any;
    rate_configuration: any;
    budgets: any;
    primary_hierarchy: string;
    rate_details: any;
    qualifications: any,
    foundational_data: any,
    custom_fields: any,
    start_date: string;
    end_date: string;
    no_positions: number;
    expense_allowed: boolean;
    currency: string;
    unit_of_measure: string;
    min_bill_rate: number;
    max_bill_rate: number;
    allow_per_identified_candidates: boolean;
    is_enabled: boolean;
    min_rate: number;
    max_rate: number;
    program_industry: string;
    hierarchy: Array<string>;
    work_locations: string;
    rate_model: "pay_rate" | "markup" | "bill_rate";
    hours_per_day: number;
    week_working_days: number;
    num_resources: number;
    additional_type: "percentage" | "fixed";
    additional_value: number;
    working_days: Array<string>;
    rate: JSON;
    financial_calculation: JSON;
    event_id: string;
    module_id: string
    pay_rate: number,
    markup: number,
    total_weeks: number,
    formattedDays: number,
    min_markup: number,
    max_markup: number,
    avg_markup: number,
    rate_amount: number,
    vendor_id: string,
    candidates: any,
    customFields: any,
    foundationDataTypes: any,
    rates: any,
    expenses: any,
    total_count: number
    ot_exempt: boolean,
    net_budget: string,
    source: 'TEMPLATE' | 'COPYJOB',
    closed_reason: string,
    closed_note: string,
    closed_at: any
    userType?: any
    userId?: any,
    allow_per_identified_s?:boolean
    managed_by?: any;
    duration?: number;
}

export interface JobCandidateDataInterface {
    vendor: any;
    candidates: any,
    id: any,
    program_id: any,
    created_on: bigint,
    updated_on: bigint,
    job_id: any,
}

export interface JobCustomfieldDataInterface {
    custom_fields: any,
    id: any,
    program_id: any,
    created_on: any,
    updated_on: any,
    job_id: any,

}

export interface JobFoundationDataTypeDataInterface {
    foundational_data: any;
    id: any,
    program_id: any,
    created_on: bigint,
    updated_on: bigint,
    job_id: any,
}

export interface JobQualificationDataTypeDataInterface {
    qualifications: any;
    id: any,
    program_id: any,
    created_on: bigint,
    updated_on: bigint,
    job_id: any,
}

export interface JobRateTypeDataInterface {
    rates: any;
    id: any,
    program_id: any,
    created_on: bigint,
    updated_on: bigint,
    job_id: any,
}

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

export interface MarkupDataInterface {
    sourced_markup_min: number;
    sourced_markup_max: number;
    payrolled_markup_min: number;
    payrolled_markup_max: number;
}

export interface VendorMarkupDataInterface {
    program_id?: string,
    program_industry?: string,
    hierarchyIds?: Array<string>,
    rate_model?: string,
    program_vendor_id?: string,
    work_locations?: string,
    job_type?: string,
    rateType?: string,
    job_template_id?: string,
    worker_classification?: string
}

export interface FundingModelParams {
    rateDetails: any
    minRate: number;
    maxRate: number;
    STvendorBillRateMin: number;
    STvendorBillRateMax: number;
    fundingModel: string;
    rate_model: string;
    min_markup: number;
    max_markup: number;
    msp_fee: number;
    feeType: string;
    vmsFee: number;
    mspPartnerFee: number;
    STminRate: number;
    STmaxRate: number;
    ot_exempt: boolean;
}

export interface JobRateDataInterface {
    rateDetails: any;
    rate_model: string;
    minRate: number;
    maxRate: number;
    min_markup: number;
    max_markup: number;
    STminRate: number;
    STmaxRate: number;
    ot_exempt: boolean;
}

export const JobValidationSchema = z.object({
    program_industry: z.string().min(1, "program_industry is required"),
    hierarchy: z.array(z.string()).nonempty("is required"),
    min_rate: z.number().positive("should be a positive number"),
    max_rate: z.number().positive("should be a positive number"),
    rate_model: z.enum(["pay_rate", "markup", "bill_rate"]),
    hours_per_day: z.number().positive("should be a positive number"),
    week_working_days: z.number().positive("should be a positive number"),
    num_resources: z.number().positive("should be a positive number"),
    additional_type: z.enum(["percentage", "fixed"]),
    additional_value: z.number(),
    start_date: z.string().min(1, "is required"),
    end_date: z.string().min(1, "is required"),
    vendor_id: z.string().optional(),
    unit_of_measure: z.string().optional(),
    rate_type: z.array(z.string()).optional()
});

export interface JobTemplate {
    labour_category : string;
    is_review_configured_or_submit: boolean;
    is_distribute_final_approval: boolean;
    is_manual_distribution_job_submit: any;
    template_name: string;
    id: string;
    program_id: string;
    job_submitted_count: number;
    is_automatic_distribution: boolean;
    is_tiered_distribute_schedule: boolean;
    checklist_entity_id: string;
    checklist_version: number;
    submission_limit_vendor: number;
    is_tiered_distribute_submit:any;
}
export interface JobStatistics {
    active_jobs_count?: number;
    current_openings_count?: number;
    contract_ending_count?: number;
}

export enum accuracyType {
    CONFIG_MODEL = "Accuracy Configuration",
    RATE = "Rate",
    AMOUNT = "Amount",
    HOUR = "hour",
    MARKUP = "Markup",
    FEE = "Fee",
    TAX = "Tax",
    ADJUSTMENT = "Adjustment",
    UNIT_OF_MEASURE = "Unit of Measure"
}
export type JobValidationInterface = z.infer<typeof JobValidationSchema>;
