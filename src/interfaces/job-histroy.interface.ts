export interface JobHistoryInterface {
    id: string;
    job_id: string;
    event_summary_before?: Record<string, any>;
    event_summary_after?: Record<string, any>;
    event_type?: string;
    program_id?: string;
    created_on?: bigint;
    updated_on?: bigint;
    created_by?: string;
    updated_by?: string;
    [key: string]: any;
}

import { JobInterface } from "./job.interface";

export interface JobHistoryRecord {
  job_id: string;
  program_id: string;
  revision: number;
  reason: string | null;
  note: string | null;
  event_type: string;
  new_meta_data: Record<string, any>;
  compare_meta_data: Record<string, any> | null;
  status: string;
  created_by: string;
  updated_by: string;
  created_on: number;
  updated_on: number;
  is_deleted: boolean;
  is_enabled: boolean;
}



// Input used for fetching job history
export interface JobHistoryInput {
  id: string;
  program_id: string;
  allow_per_identified_s?: boolean;
  status?: string;
}


// Comparison of job update fields
export interface JobUpdateComparison {
  field: string;
  display_name: string;
  old_value: any;
  new_value: any;
  data_type: string;
}

export interface FieldChange {
  newValue: any;
  oldValue: any;
}

export interface ChangeRecord {
  key: string;
  slug: string;
  new_value?: any;
  old_value?: any;
}

export type UpdatedFields = Record<string, FieldChange>;

export type NestedChangeRecord = {
  [key: string]: ChangeRecord | NestedChangeRecord | Array<ChangeRecord | NestedChangeRecord>;
};

export interface JobHistoryResponse {
  status_code: number;
  message: string;
  data?: any;
  trace_id: string;
  error?: string;
}

export interface UserDetails {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
}

export interface JobRevision {
  id: string;
  job_id: string;
  program_id: string;
  reason: string | null;
  status: string;
  action: string;
  note: string | null;
  updated_on: number;
  revision: number;
  updated_by: UserDetails | {};
  created_by :UserDetails | {};
  compare_meta_data: any;
  new_meta_data:any
}

export interface JobHistorySummary {
  reason: string | null;
  status: string;
  action: string;
  updated_on: number;
  revision: number;
  updated_by: UserDetails | {};
}
