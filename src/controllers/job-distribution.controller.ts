import { FastifyReply, FastifyRequest } from "fastify";
import generateCustomUUID from "../utility/genrateTraceId";
import JobDistributionModel from "../models/job-distribution.model";
import { JobDistributionAttributes } from "../interfaces/job-distribution.interface";
import { sequelize } from "../config/instance";
import JobDistributionRepository from "../repositories/job-distridution.repository";
import { sendNotification } from "../utility/notificationService";
import JobModel from "../models/job.model";
import { QueryTypes } from "sequelize";
import { decodeToken } from "../middlewares/verifyToken";
import { logger } from "../utility/loggerServices";
import JobHistoryModel from "../models/job-history.model";
const jobDistributionRepository = new JobDistributionRepository();
import { databaseConfig } from '../config/db';
import JobRepository from "../repositories/job.repository";
import { NotificationEventCode } from "../utility/notification-event-code";
import { runJobDistributionSchedular } from "../utility/job-distribution-schedular";
const jobRepository = new JobRepository();
import JobDistributionNotificationService from "../notification/job-distribution-notification-service";
import { getVendorDistributionScheduleByIds } from "./job.controller";
import { buildMinimalChanges, createJobHistoryRecord } from "./job-history.controller";
import { JobDistributionService } from "../services/job-distribution.service";
const jobDistributionNotificationService = new JobDistributionNotificationService();
const jobDistributionService = new JobDistributionService();
runJobDistributionSchedular();

const config_db = databaseConfig.config.database_config;

export async function createJobDistribution(
  request: FastifyRequest<{ Params: { program_id: string } }>,
  reply: FastifyReply
) {
  const traceId = generateCustomUUID();
  const user = request?.user;
  
  logger(
    {
      traceId,
      actor: {
        user_name: user?.preferred_username,
        user_id: user?.sub,
      },
      data: request.body,
      eventname: "creating job distribution",
      status: "info",
      description: `Creating job distribution for program_id ${request.params.program_id}`,
      level: "info",
      action: request.method,
      url: request.url,
      entity_id: request.params.program_id,
      is_deleted: false,
      created_by: user.sub,
      updated_by: user.sub,
    },
    JobDistributionModel
  );

  try {
    const { program_id } = request.params;
    const jobDistributionData = request.body as JobDistributionAttributes;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ message: 'Unauthorized - Token not found' });
    }
    
    const token = authHeader.split(' ')[1];
    const userFromToken = await decodeToken(token);
    if (!userFromToken) {
      return reply.status(401).send({ message: 'Unauthorized - Invalid token' });
    }

    const result = await jobDistributionService.createJobDistribution(
      program_id,
      jobDistributionData,
      token,
      userFromToken,
      traceId
    );

    logger(
      {
        traceId,
        actor: {
          user_name: user?.preferred_username,
          user_id: user?.sub,
        },
        data: jobDistributionData,
        eventname: "job distribution created",
        status: "success",
        description: `Job distribution created successfully for program_id ${program_id}`,
        level: "success",
        action: request.method,
        url: request.url,
        entity_id: program_id,
        is_deleted: false,
        created_by: user.sub,
        updated_by: user.sub,
      },
      JobDistributionModel
    );

    return reply.status(201).send({
      status_code: 201,
      message: result.message,
      trace_id: result.trace_id,
    });

  } catch (error) {
    const errorMessage = (error as Error).message;
    let statusCode = 500;

    logger(
      {
        traceId,
        actor: {
          user_name: user?.preferred_username,
          user_id: user?.sub,
        },
        data: request.body,
        eventname: "job distribution creation failed",
        status: statusCode === 400 ? "failed" : "error",
        description: `Job distribution creation failed for program_id ${request.params.program_id}`,
        level: "error",
        action: request.method,
        url: request.url,
        entity_id: request.params.program_id,
        is_deleted: false,
        created_by: user.sub,
        updated_by: user.sub,
      },
      JobDistributionModel
    );

    return reply.status(statusCode).send({
      status_code: statusCode,
      message: "Internal server error",
      error: errorMessage,
      trace_id: traceId,
    });
  }
}

export async function getActiveVendors(allVendorIds: Set<string>, program_id: string, jobDetails: any, transaction: any) {
  let hierarchyFilter = "";
  if (jobDetails.hierarchy_ids?.length > 0) {
    const conditions = jobDetails.hierarchy_ids
      .map((id: string) => `JSON_CONTAINS(pv.hierarchies, JSON_QUOTE('${id}'), '$')`)
      .join(" OR ");
    hierarchyFilter = ` AND ((${conditions}) OR pv.all_hierarchy = true)`;
  }

  let laborCategoryFilter = "";
  if (jobDetails.labor_category_id) {
    laborCategoryFilter = ` AND (JSON_CONTAINS(pv.program_industry, JSON_QUOTE(:labor_category_id), '$') OR pv.is_labour_category = true)`;
  }

  const query = `
    SELECT
      pv.id AS vendor_id,
      pv.is_job_auto_opt_in
    FROM
      ${config_db}.program_vendors pv
    WHERE
      pv.id IN (:vendorIds)
      AND pv.status = 'Active'
      AND pv.program_id = :program_id
      ${hierarchyFilter}
      ${laborCategoryFilter}
  `;

  const activeVendors = await sequelize.query<{ vendor_id: string; is_job_auto_opt_in: boolean }>(query, {
    replacements: {
      vendorIds: Array.from(allVendorIds),
      program_id,
      labor_category_id: jobDetails.labor_category_id
    },
    type: QueryTypes.SELECT,
    transaction
  });

  return activeVendors;
}

export const updateJobDistributionById = async (
  request: FastifyRequest<{
    Params: { program_id: string; id: string };
    Body: Partial<JobDistributionAttributes>;
  }>,
  reply: FastifyReply
) => {
  const traceId = generateCustomUUID();
  const logger = request.log;
  const { program_id, id } = request.params;
  const updateData = request.body;
  let transaction;
  logger.info({ trace_id: traceId, program_id, id }, "Update job distribution request received");

  try {
    const user = request?.user;
    const userId = user?.sub;
    transaction = await sequelize.transaction();
    logger.debug({ trace_id: traceId }, "Transaction started");

    const jobDistribution = await JobDistributionModel.findOne({
      where: { id, program_id },
      transaction,
    });

    if (!jobDistribution) {
      await transaction.rollback();
      return reply.status(200).send({
        status_code: 200,
        message: "Job distribution not found",
        trace_id: traceId,
        job_distributions: [],
      });
    }

    await jobDistribution.update(
      { ...updateData, updated_on: Date.now(), updated_by: userId },
      { transaction }
    );

    await transaction.commit();
    logger.info({ trace_id: traceId, id }, "Transaction committed successfully");

    if (updateData.submission_limit) {
      let eventCode = "INDIVIDUAL_SUBMISSION_LIMIT_UPDATE"
      jobDistributionNotificationService.jobIndividualStatusNotification(request, reply, jobDistribution, program_id, jobDistribution?.vendor_id, eventCode)
    }

    if (updateData.status == "HOLD") {
      let eventCode = "JOB_HOLD_INDIVIDUAL"
      jobDistributionNotificationService.jobIndividualStatusNotification(request, reply, jobDistribution, program_id, jobDistribution?.vendor_id, eventCode)
    }
    if (updateData.status === "RELEASE") {
      const jobHistoryRecords = await JobHistoryModel.findAll({
        where: { program_id, job_id: id },
        order: [["updated_on", "DESC"]],
      });

      const updatedRecords = jobHistoryRecords.filter(
        (record) => record.event_type === "Job Updated"
      );

      // Find the latest record (already sorted by "updated_on" in DESC order)
      const latestUpdatedRecord = updatedRecords.length > 0 ? updatedRecords[0] : null;
      if (!latestUpdatedRecord?.status) {
        return reply.status(400).send({
          status_code: 400,
          message: "Invalid job history record for determining the previous status.",
          trace_id: traceId,
        });
      }

      const newStatus = latestUpdatedRecord?.status;

      if (newStatus == 'HOLD') {
        let eventCode = "JOB_RELEASE_FROM_HOLD_VENDOR"
        let data = jobDistributionNotificationService.jobIndividualStatusNotification(request, reply, jobDistribution, program_id, jobDistribution?.vendor_id, eventCode)
      } else if (newStatus == 'HALTED') {
        let eventCode = "JOB_RELEASE_FROM_HALT_VENDOR"
        let data = jobDistributionNotificationService.jobIndividualStatusNotification(request, reply, jobDistribution, program_id, jobDistribution?.vendor_id, eventCode)
      }
    }
    reply.status(200).send({
      status_code: 200,
      message: "Job distribution updated successfully",
      trace_id: traceId,
      data: id,
    });
  } catch (error: any) {
    logger.error(
      { trace_id: traceId, error: error.message },
      "Error updating job distribution"
    );
    if (transaction) {
      await transaction.rollback();
      logger.debug({ trace_id: traceId }, "Transaction rolled back");
    }
    reply.status(500).send({
      status_code: 500,
      message: "Failed to update Job distribution",
      trace_id: traceId,
    });
  }
}

export async function deleteJobDistributionById(
  request: FastifyRequest<{ Params: { id: string; program_id: string } }>,
  reply: FastifyReply
) {
  const traceId = generateCustomUUID();

  try {
    const { id, program_id } = request.params;
    const user = request?.user;
    const userId = user?.sub;

    const jobDistribution = await JobDistributionModel.findOne({
      where: { id, program_id },
    });

    if (jobDistribution) {
      await JobDistributionModel.update(
        { is_deleted: true, updated_by: userId, is_enabled: false },
        { where: { id, program_id } }
      );

      reply.status(200).send({
        status_code: 200,
        message: "Job distribution marked as deleted successfully",
        trace_id: traceId,
      });
    } else {
      reply.status(404).send({
        status_code: 404,
        message: "Job distribution not found",
        trace_id: traceId,
      });
    }
  } catch (error) {
    reply.status(500).send({
      status_code: 500,
      message: "An error occurred while marking job distribution as deleted",
      trace_id: traceId,
      error: (error as Error).message,
    });
  }
}

export async function getAllJobDistributions(
  request: FastifyRequest<{
    Querystring: {
      status?: string;
      limit?: string;
      page?: string;
      job_id?: string;
    };
    Params: { program_id: string };
  }>,
  reply: FastifyReply
) {
  const traceId = generateCustomUUID();
  try {
    const {
      status,
      job_id,
      submission_limit,
      distributed_by,
      opt_status,
      vendor_id,
      limit = 10,
      page = 1,
    } = request.query as {
      status?: string;
      job_id?: string;
      submission_limit?: string
      opt_status?: string,
      vendor_id?: string,
      distributed_by?: string
      limit?: string | number;
      page?: string | number;
    };
    const { program_id } = request.params;

    const parsedLimit = parseInt(limit as string, 10) || 10;
    const parsedPage = parseInt(page as string, 10) || 1;
    const offset = (parsedPage - 1) * parsedLimit;

    if (parsedLimit <= 0 || parsedPage <= 0) {
      return reply.status(400).send({
        message: "Invalid pagination parameters",
        trace_id: traceId,
      });
    }
    const jobDistributions = await jobDistributionRepository.getAllJobDistributionDetails(program_id, { status, job_id, submission_limit, opt_status, distributed_by, vendor_id });
    if (jobDistributions.length > 0) {
      const totalItems = (jobDistributions[0] as { total_count: number }).total_count || 0;
      const totalPages = Math.ceil(totalItems / parsedLimit);

      reply.status(200).send({
        message: "Job distributions fetched successfully",
        trace_id: traceId,
        job_distributions: jobDistributions,
        pagination: {
          total: totalItems,
          pages: totalPages,
          page: parsedPage,
          limit: parsedLimit,
        },
      });
    } else {
      reply.status(404).send({
        status_code: 404,
        message: "No job distributions found",
        trace_id: traceId,
        job_distributions: [],
        pagination: {
          total: 0,
          pages: 0,
          page: parsedPage,
          limit: parsedLimit,
        },
      });
    }
  } catch (error) {
    reply.status(500).send({
      message: "An error occurred while fetching job distributions",
      trace_id: traceId,
      error: (error as Error).message,
    });
  }
}

export async function getJobDistributions(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { program_id } = request.params as { program_id: string };
  const { job_id, status, vendor_name, distributed_by, distribution_date, submission_limit, opt_status, opt_status_date, limit = 10, page = 1, submissions, } = request.query as {
    job_id?: string;
    status?: string;
    limit?: string | number;
    page?: string | number;
    vendor_name?: string;
    distributed_by?: string;
    distribution_date?: number;
    submission_limit?: number;
    opt_status?: string;
    opt_status_date?: number;
    submissions?: number;
  };

  let statusList: string[] | null = null;
  if (status) {
    statusList = Array.isArray(status)
      ? status
      : status.split(',').map(s => s.trim()).filter(Boolean);
  }
  const traceId = generateCustomUUID();

  if (!job_id) {
    return reply.status(400).send({
      trace_id: traceId,
      message: "job_id is a required query parameter.",
    });
  }

  try {
    const parsedLimit = parseInt(limit as string, 10) || 10;
    const parsedPage = parseInt(page as string, 10) || 1;
    const offset = (parsedPage - 1) * parsedLimit;

    const replacements: any = {
      program_id,
      job_id: job_id || null,
      limit: parsedLimit,
      offset,
      statusList,
      vendor_name: vendor_name ? `%${vendor_name}%` : null,
      distributed_by: distributed_by ? `%${distributed_by}%` : null,
      submission_limit,
      opt_status: opt_status ? `%${opt_status}%` : null,
      submissions: submissions || null,
    };

    if (distribution_date) {
      replacements.distribution_date = distribution_date;
    }

    if (opt_status_date) {
      replacements.opt_status_date = opt_status_date;
    }

    const distributions = await jobDistributionRepository.fetchJobDistributions(replacements);

    if (!distributions.length) {
      return reply.status(200).send({
        status_code: 200,
        trace_id: traceId,
        message: "No distributions found for the given job.",
        distributions: [],
      });
    }

    const formattedDistributions = distributions.map((dist: any) => ({
      distribute_method: dist.distribute_method,
      status: dist.status,
      id: dist.id,
      job_id: dist.job_id,
      submission_limit: dist.submission_limit,
      opt_status: dist.opt_status,
      opt_status_date: dist.opt_status_date,
      duration: dist.duration,
      measure_unit: dist.measure_unit,
      is_enabled: dist.is_enabled,
      distribution_date: dist.distribution_date,
      updated_on: dist.updated_on,
      vendor: {
        id: dist.vendor_id,
        vendor_name: dist.vendor_name,
      },
      distributed_by: {
        id: dist.distributed_by,
        first_name: dist.first_name,
        last_name: dist.last_name,
      },
      submissions: dist.submissions,
      opt_out_reason: dist.opt_out_reason,
      notes: dist.notes
    }));

    return reply.status(200).send({
      status_code: 200,
      trace_id: traceId,
      message: "Job distributions fetched successfully for the given job.",
      distributions: formattedDistributions,
    });
  } catch (error: any) {
    console.error(error);
    return reply.status(500).send({
      trace_id: traceId,
      message: "An error occurred while fetching distributions.",
      error: error.message,
    });
  }
}

export async function updateSubmissionLimit(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { distribution_id, job_id, vendor_id } = request.query as {
    distribution_id?: string;
    job_id?: string;
    vendor_id?: string;
  };
  const { program_id } = request.params as { program_id: string };
  const { submission_limit_vendor, status, opt_status, opt_out_reason, notes } = request.body as {
    submission_limit_vendor?: number;
    status?: string;
    opt_status?: string;
    opt_out_reason?: string;
    notes?: string;
  };

  const traceId = generateCustomUUID();
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return reply.status(401).send({ message: "Unauthorized - Token not found" });
  }

  const token = authHeader.split(" ")[1];
  const user = await decodeToken(token);
  const userId = user?.sub;

  if (!user) {
    return reply.status(401).send({ message: "Unauthorized - Invalid token" });
  }

  try {
    const userData = await jobDistributionRepository.findProgramVendorUser(program_id, userId);
    let vendorId = userData.length ? (userData[0] as { program_vendor_id: string })?.program_vendor_id : null;

    if (job_id && !vendor_id && !distribution_id) {
      const jobRecord = await JobModel.findOne({ where: { id: job_id } });
      if (!jobRecord) {
        return reply.status(200).send({
          status_code: 404,
          trace_id: traceId,
          message: "No job record found.",
        });
      }

      // await jobRecord.update(
      //   { submission_limit_vendor, status, updated_on: Date.now() },
      // );
      const distributionsQuery = `
        UPDATE job_distributions
        SET submission_limit = :submission_limit_vendor, updated_on = CURRENT_TIMESTAMP
        WHERE job_id = :job_id;
      `;
      await sequelize.query(distributionsQuery, {
        replacements: { job_id, submission_limit_vendor },
      });
      if (submission_limit_vendor) {
        let eventCode = "GLOBAL_SUBMISSION_LIMIT_UPDATED"
        jobDistributionNotificationService.JobStatusUpdateLimitNotification(request, reply, jobRecord, program_id, vendor_id, eventCode)
      }

      return reply.status(200).send({
        status_code: 200,
        trace_id: traceId,
        message: "Submission limit updated successfully!",
      });
    } else if (distribution_id && vendor_id) {
      const jobDistribution = await JobDistributionModel.findOne({
        where: { id: distribution_id, vendor_id },
      });

      if (!jobDistribution) {
        return reply.status(200).send({
          status_code: 200,
          trace_id: traceId,
          message: "Distribution ID not found in the job_distributions table for the given vendor.",
        });
      }

      const normalizedStatus = status?.toUpperCase();
      const isScheduled = (normalizedStatus === "DISTRIBUTED" || normalizedStatus === "RELEASE") && !jobDistribution.distribution_date;

      await jobDistribution.update({
        submission_limit: submission_limit_vendor,
        status: isScheduled ? "scheduled" : status,
        opt_status,
        updated_on: Date.now(),
      });

      if (submission_limit_vendor) {
        let eventCode = "INDIVIDUAL_SUBMISSION_LIMIT_UPDATE"
        jobDistributionNotificationService.JobStatusUpdateLimitNotification(request, reply, jobDistribution, program_id, vendor_id, eventCode)
      }

      const newStatus = status?.toUpperCase();
      console.log('New status ------ ; ', newStatus);

      if (newStatus === "HOLD") {
        jobDistributionNotificationService.jobIndividualStatusNotification(request, reply, jobDistribution, program_id, vendor_id, "JOB_HOLD_INDIVIDUAL"
        );
      } else if (newStatus === "RELEASE_FROM_HOLD") {
        jobDistributionNotificationService.jobIndividualStatusNotification(request, reply, jobDistribution, program_id, vendor_id, "JOB_RELEASE_FROM_HOLD_VENDOR"
        );
      } else if (newStatus === "HALT") {
        jobDistributionNotificationService.jobIndividualStatusNotification(request, reply, jobDistribution, program_id, vendor_id, "JOB_HALT_INDIVIDUAL"
        );
      }

      // const jobDatas = await fetchJobDetails(jobDistribution.job_id);
      // logUserData(userId);
      // (async () => {
      // await sendNotifications(user, jobDatas, program_id, token, traceId, jobDistribution);

      // })();

      return reply.status(200).send({
        status_code: 200,
        trace_id: traceId,
        message: "Submission limit updated successfully!",
      });
    } else if (job_id && vendor_id) {
      const jobDistribution = await JobDistributionModel.findOne({
        where: { job_id, vendor_id: vendorId },
      });

      if (!jobDistribution) {
        return reply.status(200).send({
          status_code: 200,
          trace_id: traceId,
          message: "Distribution ID not found in the job_distributions table for the given vendor.",
        });
      }

      await jobDistribution.update({
        opt_status,
        opt_out_reason,
        notes,
        opt_by: userId,
        updated_on: Date.now(),
        opt_status_date: Date.now()
      });

      if (opt_status?.toLocaleUpperCase() === "OPT_IN") {
        const eventCode = NotificationEventCode.JOB_OPT_IN;
        const optOutReason = opt_out_reason || ""
        jobDistributionNotificationService.jobOPTNotification(traceId, token, sequelize, program_id, user, job_id, vendor_id, eventCode, opt_status, optOutReason, notes, jobDistribution?.dataValues?.updated_on)
      }
      else if (opt_status?.toLocaleUpperCase() === "OPT_OUT") {

        const eventCode = NotificationEventCode.JOB_OPT_OUT
        const optOutReason = opt_out_reason || ""
        jobDistributionNotificationService.jobOPTNotification(traceId, token, sequelize, program_id, user, job_id, vendor_id, eventCode, opt_status, optOutReason, notes, jobDistribution?.dataValues?.updated_on)
      }

      return reply.status(200).send({
        status_code: 200,
        trace_id: traceId,
        message: "Opt status updated successfully for the distribution.",
      });
    }
  } catch (error: any) {
    return reply.status(500).send({
      status_code: 500,
      trace_id: traceId,
      message: "Server error.",
      error: error.message,
    });
  }
}

async function fetchJobDetails(job_id: string) {
  const jobRequest: any = await sequelize.query(`SELECT * FROM jobs WHERE id = :jobId LIMIT 1;`,
    { type: QueryTypes.SELECT, replacements: { jobId: job_id } }
  );
  return jobRequest[0];
}

async function logUserData(userId: any) {
  const userQuery = `SELECT id, user_type, email FROM ${config_db}.user WHERE user_id = :userId AND is_enabled = true LIMIT 1 `;
  const userData = await sequelize.query(userQuery, {
    type: QueryTypes.SELECT,
    replacements: { userId },
  });

  if (userData.length) {
    console.log("User data retrieved successfully:", userData[0]);
  } else {
    console.warn("No user data found for the provided user ID.");
  }
}

export async function getOptOutJobs(request: FastifyRequest, reply: FastifyReply) {
  const traceId = generateCustomUUID();
  const user = request?.user;
  const userId = user?.sub;
  const { program_id } = request.params as { program_id: string };
  const {
    page = "1",
    limit = "10",
    status,
    job_id,
    start_date,
    end_date,
    template_name,
    job_template_id,
    vendor_id,

  } = request.query as {
    page?: string;
    limit?: string;
    status?: string;
    job_id?: string;
    start_date?: string;
    end_date?: string;
    template_name?: string;
    job_template_id?: string;
    vendor_id?: string; // comma-separated values from frontend

  };
  const limitInt = parseInt(limit, 10);
  const pageInt = parseInt(page, 10);
  const offset = (pageInt - 1) * limitInt;

  try {
    const userData = await jobRepository.findUser(program_id, userId);
    const user_type = userData[0]?.user_type?.toUpperCase();
    const tenantId = userData[0]?.tenant_id;
    const hierarchyIdsArray = userData[0]?.associate_hierarchy_ids || 0;
    const job_ids = await jobRepository.getJobIdsWithHierarchies(program_id, hierarchyIdsArray);
    const vendorIdsArray = vendor_id ? vendor_id.split(',') : null;
    const statusesArray = status ? status.split(',') : null;
    const replacements: any = {
      program_id,
      limit: limitInt,
      vendor_id: vendorIdsArray,
      offset,
      status: statusesArray,
      job_id: job_id ? `%${job_id}%` : null,
      start_date,
      end_date,
      template_name: template_name ? `%${template_name}%` : null,
      job_template_id,
      job_ids
    };

    if (user_type === "VENDOR") {
      const vendor = await jobRepository.findVendor(program_id, tenantId);
      const vendor_id = vendor?.[0]?.id;
      if (!vendor_id) {
        return reply.status(403).send({ message: "Forbidden - Vendor ID not found" });
      }
      replacements.vendor_id = vendor_id;
    } else if (user_type === "CLIENT" || user_type === "MSP") {
      replacements.job_id_list = job_ids.length ? job_ids : null;
    }
    const { jobs, totalCount, totalPages } = await jobDistributionRepository.getOptOutJob(replacements);

    if (jobs.length === 0) {
      return reply.status(200).send({
        traceId: traceId,
        message: 'No job found for the given criteria',
        total_count: totalCount,
        pages: totalPages,
        data: []
      });
    }

    return reply.status(200).send({
      status_code: 200,
      message: "Jobs fetched successfully",
      trace_id: traceId,
      total_count: totalCount,
      pages: totalPages,
      data: jobs,
    });

  } catch (error: any) {
    return reply.status(500).send({
      status_code: 500,
      trace_id: traceId,
      message: "Internal Server Error",
      error: error.message,
    });
  }
}


export async function getOptOutJobsVendor(request: FastifyRequest, reply: FastifyReply) {
  const traceId = generateCustomUUID();
  const user = request?.user;
  const userId = user?.sub;

  const { program_id } = request.params as { program_id: string };

  try {
    const userData = await jobRepository.findUser(program_id, userId);
    const user_type = userData[0]?.user_type?.toUpperCase();
    const hierarchyIdsArray = userData[0]?.associate_hierarchy_ids || 0;
    const job_ids = await jobRepository.getJobIdsWithHierarchies(program_id, hierarchyIdsArray);
    const vendor_id = null;
    const replacements: any = {
      program_id,
      vendor_id,
      job_ids
    };

    if (user_type === "VENDOR") {
      const vendor = await jobRepository.findVendor(program_id, userId);
      const vendor_id = vendor?.[0]?.id;
      replacements.vendor_id = vendor_id;
    } else if (user_type === "CLIENT" || user_type === "MSP") {
      replacements.job_id_list = job_ids.length ? job_ids : null;
    }
    const result = await jobDistributionRepository.getOptOutJobVendors(replacements);

    return reply.status(200).send({
      status_code: 200,
      message: "Opt out jobs vendors fetched successfully.",
      trace_id: traceId,
      data: result,
    });

  } catch (error: any) {
    return reply.status(500).send({
      status_code: 500,
      trace_id: traceId,
      message: "Internal Server Error",
      error: error.message,
    });
  }
}

export async function getVendorAndVendorGroup(request: FastifyRequest, reply: FastifyReply) {
  const traceId = generateCustomUUID();
  const { program_id } = request.params as { program_id: string };
  const {
    search,
    job_id,
    hierarchy_ids,
    labor_category_id
  } = request.body as {
    search?: string,
    job_id?: string,
    hierarchy_ids?: string[],
    labor_category_id?: any
  };

  if (!job_id) {
    return reply.status(400).send({
      status_code: 400,
      message: 'job_id is required',
      trace_id: traceId,
    });
  }

  try {
    const [jobConfig] = await sequelize.query<{ allow_per_identified_s: number }>(
      'SELECT allow_per_identified_s FROM jobs WHERE id = :job_id',
      {
        replacements: { job_id },
        type: QueryTypes.SELECT,
      }
    );

    if (!jobConfig) {
      return reply.status(404).send({
        status_code: 404,
        message: 'Job not found',
        trace_id: traceId,
      });
    }

    const vendors = jobConfig.allow_per_identified_s === 1
      ? await getJobVendors(job_id, program_id, search)
      : await getCombinedVendorsAndGroups(program_id, labor_category_id, search, hierarchy_ids);

    return reply.status(200).send({
      status_code: 200,
      message: 'Vendors retrieved successfully',
      vendors,
      trace_id: traceId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return reply.status(500).send({
      status_code: 500,
      message: 'Internal Server Error',
      trace_id: traceId,
      error: errorMessage,
    });
  }
}

async function getJobVendors(job_id: string, program_id: string, search?: string) {
  const replacements: Record<string, any> = { job_id, program_id };
  let query = `
    SELECT DISTINCT pv.id, pv.display_name
    FROM job_candidate jc
    JOIN ${config_db}.program_vendors pv ON jc.vendor = pv.id
    WHERE jc.job_id = :job_id
      AND jc.program_id = :program_id
      AND pv.is_deleted = false
  `;

  if (search) {
    query += ` AND pv.display_name LIKE :search`;
    replacements.search = `%${search}%`;
  }

  const jobVendors = await sequelize.query(query, {
    replacements,
    type: QueryTypes.SELECT,
  });

  return jobVendors.map((vendor: any) => ({
    id: vendor.id,
    vendor: vendor.display_name,
  }));
}

async function getCombinedVendorsAndGroups(
  program_id: string,
  labor_category_id: any,
  search?: string,
  hierarchyIdsArray: string[] = []
) {
  const vendorFilterQuery = await jobDistributionRepository.vendorFilterQueryBuilder(hierarchyIdsArray, labor_category_id);
  const replacements: Record<string, any> = {
    program_id,
    ...(search && { search: `%${search}%` })
  };

  if (labor_category_id) {
    replacements.labor_category_id = labor_category_id;
  }

  const [filteredVendors, vendorGroups] = await Promise.all([
    sequelize.query<{ id: any, display_name: any }>(
      `${vendorFilterQuery} ${search ? "AND display_name LIKE :search" : ""}`,
      {
        replacements,
        type: QueryTypes.SELECT,
      }
    ),
    sequelize.query<{ id: any, vendor_group_name: any }>(
      `SELECT id, vendor_group_name FROM ${config_db}.vendor_groups WHERE program_id = :program_id AND is_deleted = false ${search ? "AND vendor_group_name LIKE :search" : ""}`,
      {
        replacements: { program_id, search: search ? `%${search}%` : undefined },
        type: QueryTypes.SELECT,
      }
    ),
  ]);

  return [
    ...filteredVendors.map(vendor => ({ id: vendor.id, vendor: vendor.display_name })),
    ...vendorGroups.map(group => ({ id: group.id, vendor: group.vendor_group_name, is_group: true })),
  ];
}