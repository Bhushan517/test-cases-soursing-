
export interface Schedule {
  interview_id: any;
  status: any;
  interview_date?: number,
  start_time?: string,
  end_time?: string,
  duration: number,
  is_propose?: any
}
export interface Review {
  vendor_notes?: string,
  rating?: number,
  outcome?: string
}
export interface JobInterviewData {
  candidate_phone: any;
  job: any;
  offer_flag: boolean;
  additional_attendees: any;
  vendor_notes?: any;
  accepted_schedule_ids?: string[];
  id: string;
  title: string;
  interview_type?: string;
  location?: string;
  location_type?: string;
  time_zone: string;
  external_participant_emails?: string[];
  additional_participants?: string[];
  interviewers: string[];
  vendor_id?: string;
  status?: string;
  program_id?: string;
  submit_candidate_id: string;
  job_id: string;
  is_enabled: boolean;
  created_on?: bigint;
  updated_on?: bigint;
  created_by?: string;
  updated_by?: string;
  is_deleted: boolean;
  buyer_notes?: string;
  link?: string;
  other_location?: string;
  schedules: Schedule[];
  review?: Review;
  custom_fields?: CustomField[];
  phone_number?: object;
  interview_cancel_reason?: string,
  total_records: number;
  items_per_page: number;

  ms_token: string;
  refresh_token: string;
  enable_outlook: boolean;
  user_id: string;

}


export interface Location {
  id: string;
  name: string;
}
export interface CustomField {
  label: string;
  id: string;
  name: string;
  value: string[];
}
export interface CustomFieldMapping {
  interview_id: any;
  value: string;
  custom_field_id: string;
}
export interface Participant {
  accepted_schedule_id?: string,
  candidate_phone?: number,
  vendor_notes?: string,
  status?: string
}

export interface UserInterface {
  first_name: string;
  last_name: string;
}

type ParticipantDetails = {
  first_name: string;
  last_name: string;
};

type AdditionalAttendee = {
  id: string;
  candidate_phone: string | null;
  external_participant_email: string | null;
  is_interviewer: boolean;
  participants_details: ParticipantDetails;
};

export type Interview = {
  id: string;
  job_id: string;
  status: string;
  title: string;
  created_on: string;
  schedules: any[];
  additional_attendees: AdditionalAttendee[];
  interview_feedback: any[];
  location: any;
  time_zone: any;
  custom_fields: any[];
};

export const paramsSchema = {
  type: 'object',
  properties: {
    program_id: { type: 'string' },
    id: { type: 'string' }
  },
  required: ['program_id']
};

export const createInterviewSchema = {
  type: 'object',
  required: ['program_id', 'title', 'time_zone', 'submit_candidate_id', 'job_id'],
  properties: {
    program_id: { type: 'string' },
    job_id: { type: 'string' },
    title: { type: 'string' },
    interview_type: { type: ['string', 'null'] },
    location: { type: ['string', 'null'] },
    location_type: { type: ['string', 'null'] },
    time_zone: { type: 'string' },
    submission_id: { type: ['string', 'null'] },
    external_participant_emails: { type: ['array', 'null'], items: { type: 'string' } },
    vendor_id: { type: ['string', 'null'] },
    status: {
      type: ['string', 'null'],
      enum: ['DRAFT', 'CANCELLED', 'REJECTED', 'ACCEPTED', 'COMPLETED', 'PENDING_CONFIRMATION', 'PENDING_ACCEPTANCE']
    },
    submit_candidate_id: { type: 'string' },
    phone_number: { type: 'object' },
    interview_notes: { type: ['string', 'null'] },
    vendor_notes: { type: ['string', 'null'] },
    revision: { type: ['integer', 'null'] },
    is_enabled: { type: 'boolean', default: true },
    created_by: { type: ['string', 'null'] },
    updated_by: { type: ['string', 'null'] },
    created_on: { type: ['integer', 'null'] },
    updated_on: { type: ['integer', 'null'] },
    is_deleted: { type: 'boolean', default: false },
    buyer_notes: { type: ['string', 'null'] },
    link: { type: ['string', 'null'] },
    interview_cancel_reason: { type: ['string', 'null'] },
    interview_Id: { type: ['string', 'null'] },
    other_location: { type: ['string', 'null'] },
    additional_attendees: { type: ['array', 'null'], items: { type: 'string' } },
    additional_participants: { type: ['array', 'null'], items: { type: 'string' } },
    interviewers: { type: 'array', items: { type: 'string' } },
    schedules: {
      type: 'array', items: {
        type: 'object',
        properties: {
          interview_date: {
            type: 'array', items: { type: 'integer' }
          },
          start_time: {
            type: 'string'
          },
          end_time: {
            type: 'string'
          },
          duration: {
            type: 'string'
          },
          is_propose: {
            type: ['boolean', 'integer']
          },
          status: {
            type: 'string',
            enum: ['DECLINED', 'CANCELLED', 'REJECTED', 'ACCEPTED', 'PENDING']
          }
        }
      }
    },
    custom_fields: {
      type: ['array', 'null'], items: {
        type: 'object',
        properties: {
          value: {
            type: 'array', items: { type: 'string' }
          },
          id: {
            type: 'string'
          },
        }
      }
    },
  }
};
