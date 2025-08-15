 export interface JobDistributionAttributes {
    vendor_group_id: any;
    vendor_id: any;
    vendorGroupsIds:any
    id: string;
    job_id: string;
    status: string;
    distributed_by: string;
    distribution_date: Date;
    submission_limit: any;
    submission?: string;
    opt_status: string;
    opt_date: Date;
    program_id:string;
    is_deleted: boolean;
    is_enabled: boolean;
    created_on: bigint;
    updated_on: bigint;
    opt_status_date:number;
    schedules?:any;
    distribute_method?:string,
    created_by?:string,
    updated_by?:string

  }

  export interface Schedules{
    duration?:number,
    measure_unit?:string,
    vendor_id?:string[],
    vendor_group_id?:string[]
  }


  export const  jobDistributionSchema = {
  type: 'object',
  properties: {
    vendor_group_id: { type: 'string' },
    vendor_id: { type: 'string' },
    vendorGroupsIds: { type: 'array', items: { type: 'string' } },
    job_id: { type: 'string' },
    
    status: { type: 'string' },
    distributed_by: { type: 'string' },
    distribution_date: { type: 'string', },
    submission_limit: { type: 'integer' },
    submission: { type: 'integer' },
    opt_status: { type: 'string' },
    opt_date: { type: 'string', },
    is_deleted: { type: 'boolean' },
    is_enabled: { type: 'boolean' },
    created_on: { type: 'number' },
    updated_on: { type: 'number' },
    opt_status_date: { type: 'number' },
    duration: { type: 'number' },
    measure_unit:{type:'string'},
    notes:{type:'string'},
    opt_out_reason:{type:"string"},
    schedules: { type: 'array', items: { type: 'object' } },
    distribute_method: { type: 'string' },
    created_by: { type: 'string' },
    updated_by: { type: 'string' },
  },
};

export const paramsSchema = {
  type: 'object',
  properties: {
      program_id: { type: 'string' },
  },
  required: ['program_id']
};

export const querySchema = {
  type: 'object',
  properties: {
    status:{type:'string'},
    job_id:{type:'string'},
    limit: { type: 'integer' },
    offset: { type: 'integer' }
  }
};

