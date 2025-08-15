export interface OfferInterface {
  id: string;
  program_id: string;
  offer_code: string;
  end_date: Date;
  start_date: Date;
  status?: string;
  is_remote_worker?: boolean;
  worker_start_date?: Date;
  candidate_source?: string;
  checklist_entity_id: string;
  checklist_version: number;
  job_id?: string;
  worker_email?: string;
  worker_classification?: string;
  work_location?: string;
  timesheet_type: string;
  timesheet_manager: string[];
  job_manager: string;
  notes: string;
  unique_id: string;
  expense_manager?: string[];
  candidate_id?: string;
  is_enabled: boolean;
  created_on?: number;
  updated_on?: number;
  created_by?: string;
  foundational_data?: any[];
  updated_by?: string;
  is_deleted: boolean;
  financial_details?: FinancialDetails;
  custom_fields?: any;
  parent_offer_id?: string;
  hierarchy: any;
  updates: any;
  submission_id: string;
  vendor_id?: string;
  userId?: string;
  userType?: string;
  managed_by?: any;
}

export interface FinancialDetails {
  ot_exempt: boolean;
  unit_of_measure: string;
  vendor_markup: number;
  expense_allowed: boolean;
  rate_model: string;
  additionalBudget: string;
  funded_by: any;
  fee_details: FeeDetails;
  rate_factors: any;
  rates: any[];
  adjustment_type: string;
  billRateValue: any;
}

export interface FeeDetails {
  id: string;
  title: string;
  hierarchy_levels: string[];
  source_model: string[];
  vendors: any[];
  effective_date: string;
  funding_model: string;
  labor_category: string[];
  created_by: string;
  updated_by: string;
  ref_id: any;
  categorical_fees: any[];
  funded_by: any;
  notes: string;
  is_enabled: boolean;
  is_deleted: boolean;
  created_on: number;
  updated_on: number;
  program_id: string;
}

export const paramsSchema = {
  type: 'object',
  properties: {
    program_id: { type: 'string' },
    id: { type: 'string' }
  },
  required: ['program_id']
};

export const createOfferSchema = {
  type: 'object',
  required: ['program_id'],
  properties: {
    program_id: { type: 'string' },
    job_id: { type: 'string' },
    is_remote_worker: { type: 'boolean' },
    worker_start_date: { type: ['string'] },
    candidate_source: { type: 'string' },
    checklist_entity_id: {
      type: ['string', 'null'],
    },
    checklist_version: {
      type: ['number', 'null'],
    },
    worker_email: { type: ['string', 'null'] },
    worker_classification: { type: 'string' },
    work_location: { type: 'string' },
    created_by: { type: 'string' },
    updated_by: { type: 'string' },
    timesheet_type: { type: ['string', 'null'] },
    status: { type: 'string' },
    timesheet_manager: { type: ['array', 'null'], items: { type: 'string' } },
    job_manager: { type: ['string', 'null'] },
    expense_manager: { type: 'array', items: { type: 'string' } },
    custom_fields: {
      type: ['array', 'null'], items: {
        type: 'object',
        properties: {
          value: {
            type: ['array', 'string','object'], items: { type: 'string' }
          },
          id: {
            type: 'string'
          },

        }
      }
    },
    foundational_data: {
      type: ['array', 'null'], items: {
        type: 'object',
        properties: {
          foundation_data_ids: {
            type: 'array', items: { type: 'string' }
          },
          foundation_data_type_id: {
            type: 'string'
          },

        }
      }
    },
    financial_details: {
      type: 'object',
      required: ['rates', 'unit_of_measure', 'fee_details'],
      properties: {
        ot_exempt: {
          type: 'boolean'
        },
        unit_of_measure: {
          type: 'string'
        },
        expense_allowed: {
          type: 'boolean'
        },
        vendor_markup: {
          type: 'number'
        },
        rate_model: {
          type: 'string'
        },
        additionalBudget: {
          type: 'string'
        },
        funded_by: {
          type: ['string', 'number', 'object', 'null']
        },
        rate_factors: {
          type: ['array', 'object', 'string', 'null', 'number']
        },
        rates: {
          type: 'array'
        },
        adjustment_type: {
          type: 'string'
        },
        billRateValue: {
          type: ['string', 'number', 'object', 'null']
        },
        fee_details: {
          type: 'object',
          properties: {
            title: {
              type: 'string'
            },
            id: {
              type: 'string'
            },
            hierarchy_levels: {
              type: 'array'
            },
            source_model: {
              type: 'array', items: { type: 'string' }
            },
            vendors: {
              type: 'array', items: { type: 'string' }
            },
            funding_model: {
              type: 'string'
            },
            effective_date: {
              type: 'string'
            },
            labor_category: {
              type: 'array'
            },
            created_by: {
              type: 'string'
            },
            updated_by: {
              type: 'string'
            },
            categorical_fees: {
              type: 'array'
            },
            ref_id: {
              type: ['number', 'string', 'null']
            },
            notes: {
              type: 'string'
            },
            funded_by: {
              type: ['string', 'number', 'object', 'null']
            },
            is_deleted: {
              type: 'boolean'
            },
            is_enabled: {
              type: 'boolean'
            },
            program_id: {
              type: 'string'
            }
          }
        }
      }
    },
    candidate_id: { type: 'string' },
    notes: { type: 'string' },
    start_date: { type: 'string' },
    end_date: { type: 'string' },
    vendor_id: { type: 'string' },
    submission_id: { type: ['string', 'null'] },
    hierarchy: { type: ['array', 'null'], items: { type: 'string' } },
    parent_offer_id: { type: ['string', 'null'] }
  }
};
