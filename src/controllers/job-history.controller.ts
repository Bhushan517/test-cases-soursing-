import JobHistoryModel from '../models/job-history.model';
import { ChangeRecord, JobHistoryInput, JobHistoryResponse, JobHistorySummary, JobRevision, JobUpdateComparison, NestedChangeRecord } from '../interfaces/job-histroy.interface';
import { JobComparisonService, UpdatedFields } from '../repositories/job-history.repository';
import { sequelize } from '../config/instance';
import { databaseConfig } from '../config/db';
import { FastifyReply, FastifyRequest } from 'fastify';
import generateCustomUUID from '../utility/genrateTraceId';
import { decodeToken } from '../middlewares/verifyToken';
import { logger } from "../utility/loggerServices";
import JobHistory from '../models/job-history.model';
import { isEqual, populateReason, populateUserDetails, processCompareMetaData, processNewMetaData } from '../utility/job-history';
const config_db = databaseConfig.config.database_config;

const jobComparisonService = new JobComparisonService();

export async function createJobHistoryRecord(
  job: JobHistoryInput,
  newData: Record<string, any>,
  userId: string,
  transaction: any,
  eventType = 'Job Created',
  compareMetaData: Record<string, any> | null = null,
  newStatus?: string
) {

  const latestHistory = await JobHistoryModel.findOne({
    where: { job_id: job.id, program_id: job.program_id },
    order: [['revision', 'DESC']],
    transaction
  });

  const nextRevision = latestHistory ? latestHistory.revision + 1 : (eventType === 'Job Created' ? 0 : 1);

  const formattedCompareMetaData = compareMetaData && typeof compareMetaData === 'object' &&
                                 !Array.isArray(compareMetaData) ? compareMetaData : null;

  return JobHistoryModel.create({
    job_id: job.id,
    program_id: job.program_id,
    revision: nextRevision,
    reason: newData?.closed_reason || null,
    note: newData?.closed_note || null,
    event_type: eventType,
    new_meta_data: eventType === 'Job Created' ? newData : null,
    compare_meta_data: formattedCompareMetaData,
    status: (newStatus || newData.status || 'OPEN').toString().toUpperCase(),
    created_by: userId,
    updated_by: userId,
    created_on: Date.now(),
    updated_on: Date.now(),
    is_deleted: false,
    is_enabled: true,
  }, { transaction });
}
export async function trackJobChanges(
  program_id: string,
  job_id: string,
  newData: any,
  userId: string,
  transaction: any,
  eventType = 'Job Updated'
) {
  try {
    const oldData = await jobComparisonService.getJobSnapshot(program_id, job_id);
    const updatedFields = await jobComparisonService.compareJobPayload(oldData, newData);

    if (Object.keys(updatedFields).length > 0) {
      const minimalChanges = buildStructuredChanges(updatedFields);

      await createJobHistoryRecord(
        { id: job_id, program_id },
        newData,
        userId,
        transaction,
        eventType,
        minimalChanges
      );
    }

    return updatedFields;
  } catch (error) {
    console.error('Error tracking job changes:', error);
    throw error;
  }
}

function cleanSlug(key: string): string {
  return key.replace(/_id$/, '');
}

export function buildStructuredChanges(updatedFields: UpdatedFields): NestedChangeRecord {
  const result: NestedChangeRecord = {};

  for (const [path, change] of Object.entries(updatedFields)) {
    if (isEqual(change.newValue, change.oldValue)) continue;

    // Remove all array indices from the path (both [0] and .0 notation)
    const cleanPath = path.replace(/\[\d+\]|\.\d+/g, '');
    const parts = cleanPath.split('.').filter(Boolean); // Remove empty parts
    
    let current: any = result;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (isLast) {
        current[part] = {
          key: formatDisplayName(part),
          slug: cleanSlug(part),
          new_value: change.newValue,
          old_value: change.oldValue
        };
      } else {
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
    }
  }

  return result;
}




function extractValue(value: any, index?: number): any {
  if (value === undefined) return undefined;

  if (index !== undefined && Array.isArray(value)) {
    return value[index];
  }

  return value;
}



function isPrimitive(value: any): boolean {
  return value === null || typeof value !== 'object';
}


function extractChangedValue(value: any, index?: number): any {
  if (value === undefined) return undefined;

  if (index !== undefined && Array.isArray(value)) {
    return value[index];
  }

  if (typeof value === 'object' && value !== null) {
    if ('rate_configuration' in value) {
      return { rate_configuration: value.rate_configuration };
    }
    if ('base_rate' in value) {
      return { base_rate: value.base_rate };
    }
    if ('rates' in value) {
      return { rates: value.rates };
    }
    if ('pay_rate' in value) {
      return { pay_rate: value.pay_rate };
    }
  }

  return value;
}

export function buildMinimalChanges(updatedFields: UpdatedFields): NestedChangeRecord {
  const result: NestedChangeRecord = {};

  for (const [path, change] of Object.entries(updatedFields)) {
    if (isEqual(change.newValue, change.oldValue)) continue;

    const parts = path.split('.');
    let current = result;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i].replace(/\[\d+\]/g, '');
      current[part] = current[part] || {};
      current = current[part] as NestedChangeRecord;
    }

    const lastPart = parts[parts.length - 1].replace(/\[\d+\]/g, '');
    const cleanPath = cleanSlug(lastPart);


    if (lastPart === 'rateType' || lastPart === 'hierarchy_ids') {
      current[lastPart] = {
        key: formatDisplayName(lastPart),
        slug: cleanPath,
        new_value: change.newValue || null,
        old_value: change.oldValue || null
      };
    } else {
      current[lastPart] = {
        key: formatDisplayName(lastPart),
        slug: cleanPath,
        ...(change.newValue !== undefined && { new_value: change.newValue }),
        ...(change.oldValue !== undefined && { old_value: change.oldValue })
      };
    }
  }

  return result;
}

function formatDisplayName(key: string): string {
  return key
    .replace(/\[\d+\]/g, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}


export function buildNestedChanges(updatedFields: UpdatedFields): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [path, change] of Object.entries(updatedFields)) {
    const parts = path.split('.');
    let current = result;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const arrayMatch = part.match(/(\w+)\[(\d+)\]/);

      if (arrayMatch) {
        const [_, arrayName, indexStr] = arrayMatch;
        const arrayIndex = parseInt(indexStr);

        if (!current[arrayName]) {
          current[arrayName] = []; 
        }

        if (isLast) {
            current[arrayName][arrayIndex] = {
                key: formatDisplayName(arrayName) + `[${arrayIndex}]`, 
                slug: cleanSlug(arrayName),
                new_value: change.newValue,
                old_value: change.oldValue
            };
        } else {
            if (!current[arrayName][arrayIndex]) {
                current[arrayName][arrayIndex] = {};
            }
            current = current[arrayName][arrayIndex];
        }
      } else {

        if (isLast) {
          current[part] = {
            key: formatDisplayName(part),
            slug: cleanSlug(part),
            new_value: change.newValue,
            old_value: change.oldValue
          };
        } else {
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }
      }
    }
  }

  return result;
}


export async function createJobHistoryHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const traceId = generateCustomUUID();
  const response: JobHistoryResponse = {
    status_code: 500,
    message: ERROR_MESSAGES.SERVER_ERROR,
    trace_id: traceId,
  };

  try {
    const token = request.headers.authorization?.split(" ")[1];
    if (!token) {
      response.status_code = 401;
      response.message = ERROR_MESSAGES.UNAUTHORIZED;
      return reply.status(401).send(response);
    }

    const user = await decodeToken(token);
    if (!user) {
      response.status_code = 401;
      response.message = ERROR_MESSAGES.INVALID_TOKEN;
      return reply.status(401).send(response);
    }

    const { program_id } = request.params as { program_id: string };
    let { job_id, status, event_type, new_data = null , old_data= null} = request.body as any;

    if (!program_id || !job_id || !status || !event_type) {
      response.status_code = 400;
      response.message = ERROR_MESSAGES.MISSING_PARAMS;
      return reply.status(400).send(response);
    }

    const transaction = await sequelize.transaction();

    try {
      const latestJobHistory = await JobHistoryModel.findOne({
       where: { program_id, job_id },
       order: [["updated_on", "DESC"]],
       raw: true,
      });
      
      let compareMetaData = null;
      if (new_data && latestJobHistory) {
        const updatedFields = await jobComparisonService.compareJobPayload(
          latestJobHistory,
          new_data
        );
        if (Object.keys(updatedFields).length > 0) {
          compareMetaData = buildStructuredChanges(updatedFields);
        }
      }
       new_data = {
            ...new_data,
            ...(old_data?.closed_note && { closed_note: old_data.closed_note }),
            ...(old_data?.closed_reason && { closed_reason: old_data.closed_reason }),
          };
		  

      const historyRecord = await createJobHistoryRecord(
        { id: job_id, program_id },
        new_data || {},
        user?.sub || "",
        transaction,
        event_type,
        compareMetaData,
        status
      );

      await transaction.commit();

      response.status_code = 200;
      response.message = "Job history created successfully";
      response.data = { job_history: historyRecord };
      return reply.status(200).send(response);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error(`[${traceId}] Error in createJobHistoryHandler:`, error);
    response.error = error instanceof Error ? error.message : "Unknown error";
    return reply.status(response.status_code).send(response);
  }
}



export async function getJobHistoryByRevision(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const traceId = generateCustomUUID();
  let response: JobHistoryResponse = {
    status_code: 500,
    message: ERROR_MESSAGES.SERVER_ERROR,
    trace_id: traceId
  };

  try {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      response.status_code = 401;
      response.message = ERROR_MESSAGES.UNAUTHORIZED;
      return reply.status(401).send(response);
    }

    const token = authHeader.split(" ")[1];
    const user = await decodeToken(token);
    if (!user) {
      response.status_code = 401;
      response.message = ERROR_MESSAGES.INVALID_TOKEN;
      return reply.status(401).send(response);
    }

    const { program_id, id: job_id, revision } = request.params as {
      program_id: string,
      id: string,
      revision: string
    };

    if (!program_id || !job_id || !revision) {
      response.status_code = 400;
      response.message = ERROR_MESSAGES.MISSING_PARAMS;
      return reply.status(400).send(response);
    }

    const historyRecord = await JobHistory.findOne({
      where: { program_id, job_id, revision },
      raw: true
    });
  const firstHistoryRecord:any = await JobHistory.findOne({
  where: { program_id, job_id },
  order: [['created_on', 'ASC']], 
  raw: true
});
    if (!historyRecord) {
      response.status_code = 404;
      response.message = ERROR_MESSAGES.REVISION_NOT_FOUND;
      return reply.status(404).send(response);
    }

    const [createdByDetails,updatedByDetails, populatedCompareData, populatedNewMetaData] = await Promise.all([
      populateUserDetails(historyRecord.program_id,historyRecord.created_by),populateUserDetails(historyRecord.program_id,historyRecord.updated_by),
      historyRecord.compare_meta_data
        ? processCompareMetaData(
            typeof historyRecord.compare_meta_data === 'string'
              ?( JSON.parse(historyRecord.compare_meta_data),firstHistoryRecord.new_meta_data)
              : historyRecord.compare_meta_data,firstHistoryRecord.new_meta_data
          )
        : {},
      historyRecord.new_meta_data
        ? processNewMetaData(
            typeof historyRecord.new_meta_data === 'string'
              ? JSON.parse(historyRecord.new_meta_data)
              : historyRecord.new_meta_data
          )
        : null
    ]);

    const jobRevision: JobRevision = {
      id: historyRecord.id,
      job_id: historyRecord.job_id,
      program_id: historyRecord.program_id,
      reason: historyRecord.reason,
      status: historyRecord.status,
      action: historyRecord.event_type,
      note: historyRecord.note,
      updated_on: historyRecord.updated_on,
      revision: historyRecord.revision,
      updated_by: updatedByDetails,
      created_by:createdByDetails,
      compare_meta_data: populatedCompareData,
      new_meta_data: populatedNewMetaData
    };


    response = {
      status_code: 200,
      message: "Job history revision retrieved successfully",
      data: { job_revision: jobRevision },
      trace_id: traceId
    };

    return reply.status(200).send(response);

  } catch (error) {
    console.error(`[${traceId}] Error in getJobHistoryByRevision:`, error);

    response.error = error instanceof Error ? error.message : 'Unknown error';
    return reply.status(response.status_code).send(response);
  }
}

export async function getAllJobHistory(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const traceId = generateCustomUUID();
  let response: JobHistoryResponse = {
    status_code: 500,
    message: ERROR_MESSAGES.SERVER_ERROR,
    trace_id: traceId
  };

  try {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      response.status_code = 401;
      response.message = ERROR_MESSAGES.UNAUTHORIZED;
      return reply.status(401).send(response);
    }

    const token = authHeader.split(" ")[1];
    const user = await decodeToken(token);
    if (!user) {
      response.status_code = 401;
      response.message = ERROR_MESSAGES.INVALID_TOKEN;
      return reply.status(401).send(response);
    }

    const { program_id, id: job_id } = request.params as {
      program_id: string,
      id: string
    };

    if (!program_id || !job_id) {
      response.status_code = 400;
      response.message = ERROR_MESSAGES.MISSING_PARAMS;
      return reply.status(400).send(response);
    }

    const historyRecords = await JobHistory.findAll({
      where: { program_id, job_id },
      order: [['revision', 'DESC']],
      raw: true
    });

    if (!historyRecords?.length) {
      response.status_code = 404;
      response.message = ERROR_MESSAGES.HISTORY_NOT_FOUND;
      return reply.status(404).send(response);
    }

 const jobs: JobHistorySummary[] = await Promise.all(
      historyRecords.map(async (record) => {
       const isRecordChange =
        record?.revision === 0 ||
        (record?.compare_meta_data && typeof record?.compare_meta_data === 'object'
          ? Object.keys(record?.compare_meta_data).length > 0
          : false);


        return {
          reason: await populateReason(record.reason) || record.reason,
          status: record.status,
          action: record.event_type,
          updated_on: record.updated_on,
          revision: record.revision,
          updated_by: await populateUserDetails(record.program_id, record.updated_by),
          is_show: isRecordChange
        };
      })
    );
    response = {
      status_code: 200,
      message: "Job history retrieved successfully",
      data: { jobs },
      trace_id: traceId
    };

    return reply.status(200).send(response);

  } catch (error) {
    console.error(`[${traceId}] Error in getAllJobHistory:`, error);

    response.error = error instanceof Error ? error.message : 'Unknown error';
    return reply.status(response.status_code).send(response);
  }
}

export const POPULATE_CONFIG = {
  keysForPopulate: [
    'job_manager_id', 'job_template_id', 'hierarchy_ids',
    'primary_hierarchy', 'work_location_id', 'labor_category_id', 'rateType','closed_reason','foundation_data_ids', 'foundation_data_type_id','currency','managed_by'

  ] as const,
  populateKeyTable: {
    job_manager_id: 'user',
    job_template_id: 'job_templates',
    hierarchy_ids: 'hierarchies',
    primary_hierarchy: 'hierarchies',
    work_location_id: 'work_locations',
    labor_category_id: 'labour_category',
    rateType: 'rate_type',
    closed_reason:'reason_codes',
    foundation_data_ids: 'master_data',
    foundation_data_type_id: 'master_data_type',
    currency :'currencies',
    managed_by : 'tenant'
  },
  keyForMatch: {
    job_manager_id: 'user_id',
    job_template_id: 'id',
    hierarchy_ids: 'id',
    primary_hierarchy: 'id',
    work_location_id: 'id',
    labor_category_id: 'id',
    rateType: 'id',
    closed_reason:'id',
    foundation_data_ids: 'id',
    foundation_data_type_id: 'id',
    currency:'code',
    managed_by : 'id',
  },
  populateFields: {
    job_manager_id: ['first_name', 'last_name'] as const,
    job_template_id: ['template_name'] as const,
    hierarchy_ids: ['name'] as const,
    primary_hierarchy: ['name'] as const,
    work_location_id: ['name'] as const,
    labor_category_id: ['name'] as const,
    rateType: ['name'] as const,
    closed_reason :['name','category'] as const,
    foundation_data_ids: ['id','name', 'code'] as const,
    foundation_data_type_id: ['id','name'] as const,
    currency :['name','label','symbol','code'] as const,
    managed_by :['display_name'] as const 
  }
};

const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Unauthorized - Token not found',
  INVALID_TOKEN: 'Unauthorized - Invalid token',
  MISSING_PARAMS: 'Bad Request - Missing required parameters',
  REVISION_NOT_FOUND: 'Job history revision not found',
  HISTORY_NOT_FOUND: 'No job history found',
  SERVER_ERROR: 'An error occurred while processing your request'
};


