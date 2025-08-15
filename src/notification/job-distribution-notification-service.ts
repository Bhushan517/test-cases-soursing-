import { QueryTypes } from "sequelize";
import { sequelize } from "../config/instance";
import generateCustomUUID from "../utility/genrateTraceId";
import { decodeToken } from "../middlewares/verifyToken";
import { determineUserType, formatDate, getAllDistributedProgramVendor, getJobTemplateName, getPerIdentifiedCandidate, getVendorName } from "../utility/notification-helper";
import { TenantConstant } from "../utility/tenant-constant";
import { getJobData } from "../utility/notification-helper-interview";
import { FastifyReply, FastifyRequest } from "fastify";
import JobDistributionRepository from "../repositories/job-distridution.repository";
import { databaseConfig } from "../config/db";
import { NotificationEventCode } from "../utility/notification-event-code";
import { getVendorDistributionScheduleByIds } from "../controllers/job.controller";
import JobRoleRecipientNotificationService from "./job-role-recipient-notification-service";
const jobDistributionRepository = new JobDistributionRepository();
let ui_base_url = databaseConfig.config.ui_base_url;
let rootTenantId = databaseConfig.config.root_tenant_id;
const jobRoleRecipientNotificationService = new JobRoleRecipientNotificationService();

class JobDistributionNotificationService {
  static distributeAutomaticallyNotification(arg0: { user: import("jsonwebtoken").JwtPayload; job: any; program_id: string; traceId: string; token: string; sequelize: import("sequelize").Sequelize; reply: FastifyReply<import("fastify").RawServerDefault, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, import("fastify").RouteGenericInterface, unknown, import("fastify").FastifySchema, import("fastify").FastifyTypeProviderDefault, unknown>; sendNotification: any; jobTemplate: any; }) {
    throw new Error("Method not implemented.");
  }

  async jobIndividualStatusNotification(request: FastifyRequest, reply: FastifyReply, jobDistribution: any, program_id: any, vendor_id: any, eventCode: any) {
    const traceId = generateCustomUUID();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ message: "Unauthorized - Token not found" });
    }

    const token = authHeader.split(" ")[1];
    const user = await decodeToken(token);

    if (!user) {
      return reply.status(401).send({ message: "Unauthorized - Invalid token" });
    }
    try {
      const userType = await determineUserType(user, token);

      if (userType?.toLowerCase() == TenantConstant.MSP.toLowerCase() ||
        userType?.toLowerCase() == TenantConstant.CLIENT.toLowerCase()) {
        const query = `SELECT * FROM jobs WHERE (id = :jobId  OR job_id = :jobId) LIMIT 1;`;
        const jobID = jobDistribution?.dataValues?.job_id ?? jobDistribution?.dataValues?.id ?? "";
        const jobRequest: any = await sequelize.query(query, {
          type: QueryTypes.SELECT,
          replacements: { jobId: jobID },
          logging: console.log
        });
        let jobDatas = jobRequest[0];

        const jobData = await getJobData(jobDatas?.id);
        const workLocationDetails = await jobDistributionRepository.getWorkLocationData(jobDatas?.work_location_id);
        //const allVendors = await jobDistributionRepository.findVendor(program_id, new Array<string>(jobDistribution?.dataValues?.id));
        //Fetch MSP
        const vendors = new Set<any>();
        vendors.add(String(vendor_id));
        let entityRefId = rootTenantId;
        const payload = {
          job_name: jobData[0]?.name || "NA",
          job_id: jobDatas?.job_id,
          job_url: jobDatas?.id && jobDatas?.job_template_id
            ? `${ui_base_url}/jobs/job/view/${jobDatas.id}/${jobDatas.job_template_id}?detail=job-details`
            : '',
          work_location_name: workLocationDetails?.[0]?.name ?? "",
          work_location_code: workLocationDetails?.[0]?.code ?? "",
          updated_submission_limit: jobDistribution?.dataValues.submission_limit || jobDistribution?.dataValues.submission_limit_vendor || "",
        };

        //Fetch Tenant
        let isVendorOnly: boolean = false;
        if (eventCode === 'JOB_HALT_INDIVIDUAL' ||
          eventCode === 'JOB_HOLD_INDIVIDUAL' ||
          eventCode === 'JOB_HOLD_GLOBAL' ||
          eventCode === 'JOB_HOLD_GLOBAL1' ||
          eventCode === 'JOB_HALT_GLOBAL' || 
          eventCode === 'JOB_HALT_GLOBAL1') {
          isVendorOnly = true;
        }
        jobRoleRecipientNotificationService.fetchAndProcessJobTemplateRoleRecipientNotification(program_id, token, entityRefId, eventCode, userType, jobDatas, traceId, user, payload, vendors, sequelize, isVendorOnly);
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

  async JobStatusUpdateLimitNotification(request: FastifyRequest, reply: FastifyReply, jobDistribution: any, program_id: any, vendor_id: any, eventCode: any) {
    console.log('inside job limit udpate')
    const traceId = generateCustomUUID();
    let entityRefId = rootTenantId;
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      console.error("Unauthorized - Token not found");
      return;
    }

    const token = authHeader.split(" ")[1];
    const user = await decodeToken(token);

    if (!user) {
      console.error("Unauthorized - Invalid token");
      return;
    }
    try {

      const userType = await determineUserType(user, token);
      if (userType?.toLowerCase() == "msp".toLowerCase() ||
        userType?.toLowerCase() == "client".toLowerCase()) {
        const query = `SELECT * FROM jobs WHERE (id = :jobId  OR job_id = :jobId) LIMIT 1;`;
        const jobID = jobDistribution?.dataValues?.job_id ?? jobDistribution?.dataValues?.id ?? "";
        const jobRequest: any = await sequelize.query(query, {
          type: QueryTypes.SELECT,
          replacements: { jobId: jobID },
          logging: console.log
        });

        let jobDatas = jobRequest[0];
        const vendors = new Set<any>();
        if (eventCode == "INDIVIDUAL_SUBMISSION_LIMIT_UPDATE") {
          // get individual vendor for distribution
          vendors.add(String(vendor_id));
        } else {
          const vendorsDetail: Set<string> = await getAllDistributedProgramVendor(jobDistribution?.dataValues?.id, program_id);
          if (vendorsDetail.size === 0) {
            console.log('No vendors found for this job distribution');
          } else {
            vendorsDetail.forEach(vendorId => vendors.add(vendorId));
          }
        }
        // Fetch manager details
        try {
          const jobData = await getJobData(jobDatas?.id);
          const workLocationDetails = await jobDistributionRepository.getWorkLocationData(jobDatas?.work_location_id);

          const payload = {
            job_name: jobData[0]?.name || "NA",
            job_id: jobDatas?.job_id,
            job_url: jobDatas?.id && jobDatas?.job_template_id
              ? `${ui_base_url}/jobs/job/view/${jobDatas.id}/${jobDatas.job_template_id}?detail=job-details`
              : '',
            work_location_name: workLocationDetails[0]?.name ?? "",
            work_location_code: workLocationDetails[0]?.code ?? "",
            updated_submission_limit: jobDistribution?.dataValues.submission_limit || jobDistribution?.dataValues.submission_limit_vendor || "",
          };
          //Fetch Tenant
          console.log('eventCode ----', eventCode)
          jobRoleRecipientNotificationService.fetchAndProcessJobTemplateRoleRecipientNotification(program_id, token, entityRefId, eventCode, userType, jobDatas, traceId, user, payload, vendors, sequelize, false);

        } catch (notificationError) {
          console.error("Error in notification logic:", notificationError);
        }
      }
    } catch (error) {
      console.error('An error occurred while marking job distribution as deleted : ', error)
    }
  }

  async handleJobDistributionNotification(
    user: any,
    job: any,
    program_id: string,
    traceId: string,
    token: string,
    schedules: any,
    jobName: string,
    sequelize: any,
    reply: any,
    sendNotification: any
  ) {
    try {
      console.log('Inside job distribution');
      let entityRefId = rootTenantId;
      const userType = await determineUserType(user, token);
      if (!userType || userType === TenantConstant.VENDOR.toLocaleUpperCase()) {
        console.error("Vendor not allowed to update distribution", userType);
        return;
      }

      let vendorList: Set<string> = new Set<string>();

      schedules.forEach((scheduleData: { vendor_id: string[]; id: string }) => {
        //Automatic distribution - we get vendor_id list
        //Manaul Distribution - we get array of vendor object 
        if (scheduleData.vendor_id && scheduleData.vendor_id.length > 0) {
          // Add all vendor_ids from this schedule to the set 
          scheduleData.vendor_id.forEach((vendorId: string) => {
            vendorList.add(vendorId);
          });
        }
        else {
          vendorList.add(scheduleData.id);
        }
      });
      if (job?.dataValues) {
        job = job.dataValues;
      }

      const workLocationDetails = await jobDistributionRepository.getWorkLocationData(job?.work_location_id);
      const formattedStartDate = formatDate(job?.start_date);
      const formattedEndDate = formatDate(job?.end_date);
      let jobTemplateName: any;
      if (!jobName) {
        const jobTemplateDetails = await getJobTemplateName(job?.job_template_id);
        jobTemplateName = jobTemplateDetails[0]?.name;
      }

      const job_candidate = await getPerIdentifiedCandidate(job?.id);
      let payload: any = {
        unit_of_measure: job?.unit_of_measure ?? "NA",
        job_title: jobName ? jobName : jobTemplateName ?? "NA",
        work_location_name: workLocationDetails?.[0]?.name ?? "",
        work_location_code: workLocationDetails?.[0]?.code ?? "",
        pre_identified_candidate: job_candidate?.[0]?.first_name && job_candidate?.[0]?.last_name
          ? `${job_candidate?.[0].first_name} ${job_candidate[0].last_name}`
          : '',
        currency_symbol: job?.currency_symbol ?? "",
        minimum_rate_from_job_creation: job?.min_bill_rate ?? "",
        maximum_rate_from_job_creation: job?.max_bill_rate ?? "",
        user_type: userType,
        job_id: job?.job_id ?? "",
        job_start_date: formattedStartDate ?? "",
        job_end_date: formattedEndDate ?? "",
        job_url: job?.id && job?.job_template_id
          ? `${ui_base_url}/jobs/job/view/${job.id}/${job.job_template_id}?detail=job-details`
          : '',
      };
      const eventCode = NotificationEventCode.JOB_DISTRIBUTION_STATUS;
      jobRoleRecipientNotificationService.fetchAndProcessJobTemplateRoleRecipientNotification(program_id, token, entityRefId, eventCode, userType, job, traceId, user, payload, vendorList, sequelize, false);
      //const emailRecipients = await gatherEmailRecipients(sequelize, program_id, schedules, job, userType);
      //const emailRecipients = await gatherEmailRecipients(sequelize, program_id, job?.job_manager_id, job?.hierarchy_ids, userType, vendorList, job?.id);
      //console.log('Email recipient : ', emailRecipients);

    } catch (notificationError) {
      console.error("Error in notification logic:", notificationError);
    }

  }

  async jobOPTNotification(
    trace_id: string,
    token: string,
    sequelize: any,
    program_id: any,
    user: any,
    job_id: any,
    vendor_id: any,
    eventCode: string,
    opt_status: string,
    opt_out_reason: string,
    notes: any,
    updated_on: any
  ) {
    try {
      const userType = await determineUserType(user, token);
      if (!userType || userType === TenantConstant.MSP.toLocaleUpperCase() || userType === TenantConstant.CLIENT.toLocaleUpperCase()) {
        console.error("Only vendors allowed to Update status  ", userType);
        return;
      }
      let entityRefId = rootTenantId;
      const JobData = job_id ? await getJobData(job_id) : null;
      const vendorData = vendor_id ? await getVendorName(vendor_id) : null;
      const jobDate = updated_on ? await formatDate(updated_on) : null;
      const payload: any = {
        job_id: JobData?.[0]?.job_id ?? "",
        job_url: job_id && JobData?.[0]?.job_template_id
          ? `${ui_base_url}/jobs/job/view/${job_id}/${JobData[0]?.job_template_id}?detail=job-details`
          : '',
        job_title: JobData?.[0].name,
        opt_out_reason_code: opt_out_reason,
        notes: notes,
        date_opted_out: jobDate,
        date_opted_in: jobDate,
        Vendor: vendorData?.[0].vendor_name
      };
      jobRoleRecipientNotificationService.fetchAndProcessJobTemplateRoleRecipientNotification(program_id, token, entityRefId, eventCode, userType, JobData?.[0], trace_id, user, payload, new Set<string>(), sequelize, false);
      //const emailRecipients = await gatherEmailRecipients(sequelize, program_id, JobData?.[0]?.job_manager_id, JobData?.[0]?.hierarchy_ids, userType, new Set<string>(), JobData?.[0]?.id);
    }
    catch (error) {
      console.error("Error occurred while sending notification:", error);
    }
  }

  async distributeAutomaticallyNotification({
    user,
    job,
    program_id,
    traceId,
    token,
    sequelize,
    reply,
    sendNotification,
    jobTemplate
  }: {
    user: any,
    job: any,
    program_id: string,
    traceId: string,
    token: string,
    sequelize: any,
    reply: any,
    sendNotification: Function,
    jobTemplate: any
  }) {
    const matchedVendors = await getVendorDistributionScheduleByIds({
      hierarchy_ids: job.hierarchy_ids,
      // work_location_id: job.work_location_id,
      labor_category_id: jobTemplate?.labour_category,
      program_id
    });

    const jobName = jobTemplate?.template_name || "";

    console.log("Inside Job Distribution Notification");
    await this.handleJobDistributionNotification(
      user,
      job,
      program_id,
      traceId,
      token,
      matchedVendors,
      jobName,
      sequelize,
      reply,
      sendNotification
    );
  }
}

export default JobDistributionNotificationService;