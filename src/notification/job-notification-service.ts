
import { NotificationEventCode } from "../utility/notification-event-code";
import { determineUserType, fetchJobDetails, fetchUserDetils, getAllDistributedProgramVendor, getJobClosedData, getJobManagerEmail } from "../utility/notification-helper";
import { TenantConstant } from "../utility/tenant-constant";
import { databaseConfig } from "../config/db";
import { getJobData, getWorkLocationDetails } from "../utility/notification-helper-interview";
import JobRoleRecipientNotificationService from "./job-role-recipient-notification-service";
let ui_base_url = databaseConfig.config.ui_base_url;
let rootTenantId = databaseConfig.config.root_tenant_id;
const jobRoleRecipientNotificationService = new JobRoleRecipientNotificationService();

class JobNotificationService {
    async handleJobNotification(
        token: string,
        sequelize: any,
        program_id: string,
        job: any,
        user: any,
        traceId: string,
        eventCode: NotificationEventCode
    ) {
        try {
            const userType = await determineUserType(user, token);
            console.log(' userType : ', userType);
            if (!userType || userType === TenantConstant.VENDOR.toLocaleUpperCase() || userType === TenantConstant.SUPER_USER.toLocaleUpperCase()) {
                console.error("Vendor not allowed to perform this action", userType, eventCode);
                return;
            }

            const jobCreator = await fetchUserDetils(job?.created_by);

            //fetch the tenant and template based on the user_type/role and client_id/tenant and event_code
            let entityRefId = rootTenantId;
            let payload: any = {
                job_id: job.job_id ?? "",
                created_by_first_name: jobCreator[0]?.first_name ?? "NA",
                created_by_last_name: jobCreator[0]?.last_name ?? "NA",
                job_url: job?.dataValues?.id && job?.dataValues?.job_template_id
                    ? `${ui_base_url}/jobs/job/view/${job.dataValues.id}/${job.dataValues.job_template_id}?detail=job-details`
                    : '',
            };
            //Fetch Tenant
            jobRoleRecipientNotificationService.fetchAndProcessJobTemplateRoleRecipientNotification(program_id, token, entityRefId, eventCode, userType, job, traceId, user, payload, new Set<string>(), sequelize, false);
        } catch (notificationError) {
            console.error("Error in notification logic:", notificationError);
        }
    }

    async handleEditJobNotification(
        token: string,
        sequelize: any,
        program_id: string,
        job: any,
        user: any,
        traceId: string,
        eventCode: NotificationEventCode
    ) {
        try {
            const userType = await determineUserType(user, token);
            if (!userType || userType === TenantConstant.VENDOR.toLocaleUpperCase() || userType === TenantConstant.SUPER_USER.toLocaleUpperCase()) {
                console.error("Vendor not allowed to perform this action", userType);
                return;
            }

            const jobData = await getJobData(job.id);

            const payload = {
                job_name: jobData[0].name,
                job_id: jobData[0].job_id,
                job_url: jobData[0]?.id && jobData?.[0].name
                    ? `${ui_base_url}/jobs/job/view/${jobData?.[0].id}/${jobData?.[0].name}?detail=job-details`
                    : '',
            };
            let entityRefId = rootTenantId;

            const vendors = new Set<any>();
            const vendorsDetail: Set<string> = await getAllDistributedProgramVendor(job?.id, program_id);
            if (vendorsDetail.size === 0) {
                console.log('No vendors found for this job distribution');
            } else {
                vendorsDetail.forEach(vendorId => vendors.add(vendorId));
            }
            //Fetch Tenant
            jobRoleRecipientNotificationService.fetchAndProcessJobTemplateRoleRecipientNotification(program_id, token, entityRefId, eventCode, userType, job, traceId, user, payload, vendors, sequelize, false);


        } catch (notificationError) {
            console.error("Error in notification logic:", notificationError);
        }
    }

    async sendDynamicJobNotification(
        token: any,
        sequelize: any,
        user: any,
        program_id: string,
        updates: any,
        currentJob: any,
        trace_id: string,
        dynamicEventCodeCallback: (userEmail: any) => string
    ): Promise<void> {
        try {

            const userType = await determineUserType(user, token);
            if (userType.user_type?.toLowerCase() == "msp".toLowerCase() 
                || userType.user_type?.toLowerCase() == "client".toLowerCase() ) {
                const individualEventCode = dynamicEventCodeCallback(userType.user_type);

                const jobDetails: any = await fetchJobDetails(currentJob.id);
                const JobClosedData = await getJobClosedData(currentJob.id);

                const actorDetails = await fetchUserDetils(user.sub);

                const payload = {
                    user_type: userType,
                    job_id: updates?.job_id,
                    job_url: currentJob?.id && jobDetails?.job_template_id
                        ? `${ui_base_url}/jobs/job/view/${currentJob.id}/${jobDetails?.job_template_id}?detail=job-details`
                        : '',
                    template_name: jobDetails?.name,
                    work_location_name: jobDetails?.work_location_name ?? "",
                    work_location_code: jobDetails?.work_location_code ?? "",
                    reason: JobClosedData?.[0]?.name ? JobClosedData[0].name : "",
                    notes: JobClosedData?.[0]?.closed_note ? JobClosedData[0].closed_note : "",
                    actor: `${actorDetails[0]?.first_name} ${actorDetails[0]?.last_name}`,
                };

                let entityRefId = rootTenantId;

                const vendors = new Set<any>();
                const vendorsDetail: Set<string> = await getAllDistributedProgramVendor(currentJob?.id, program_id);
                if (vendorsDetail.size === 0) {
                    console.log('No vendors found for this job distribution');
                } else {
                    vendorsDetail.forEach(vendorId => vendors.add(vendorId));
                }
                //Fetch Tenant
                let isVendorOnly: boolean = false;
                if (individualEventCode === 'JOB_HALT_INDIVIDUAL' ||
                    individualEventCode === 'JOB_HOLD_INDIVIDUAL' ||
                    individualEventCode === 'JOB_HOLD_GLOBAL' ||
                    individualEventCode === 'JOB_HOLD_GLOBAL1' ||
                    individualEventCode === 'JOB_HALT_GLOBAL' || 
                    individualEventCode === 'JOB_HALT_GLOBAL1') {
                    isVendorOnly = true;
                  }
                jobRoleRecipientNotificationService.fetchAndProcessJobTemplateRoleRecipientNotification(program_id, token, entityRefId, individualEventCode, userType, currentJob, trace_id, user, payload, vendors, sequelize, isVendorOnly);

            }
        } catch (notificationError) {
            console.error("Error in notification logic:", notificationError);
        }
    }

    async jobFilledNotification(token: any,
        sequelize: any,
        user: any,
        program_id: string,
        currentJob: any,
        trace_id: string,
        eventCode: any
    ): Promise<void> {
        try {
            const userType = await determineUserType(user, token);
            console.log(' userType : ', userType);
            if (userType === TenantConstant.SUPER_USER.toLocaleUpperCase()) {
                console.error("Vendor not allowed to perform this action", userType, eventCode);
                return;
            }

            const jobData = currentJob?.dataValues?.id
                ? await getJobData(currentJob.dataValues.id)
                : null;

            const locationData = jobData?.[0]?.work_location_id
                ? await getWorkLocationDetails(jobData[0].work_location_id)
                : null;

            const payload: any = {
                job_id: currentJob.dataValues.job_id,
                job_url: currentJob?.dataValues?.id && currentJob?.dataValues?.job_template_id
                    ? `${ui_base_url}/jobs/job/view/${currentJob.dataValues.id}/${currentJob.dataValues.job_template_id}?detail=job-details`
                    : '',
                template_name: jobData?.[0]?.name ?? "",
                work_location_name: locationData?.name ?? "",
                work_location_code: locationData?.code ?? ""
            };
            let entityRefId = rootTenantId;
            const vendors = new Set<any>();
            const vendorsDetail: Set<string> = await getAllDistributedProgramVendor(currentJob?.id, program_id);
            if (vendorsDetail.size === 0) {
                console.log('No vendors found for this job distribution');
            } else {
                vendorsDetail.forEach(vendorId => vendors.add(vendorId));
            }
            //Fetch Tenant
            jobRoleRecipientNotificationService.fetchAndProcessJobTemplateRoleRecipientNotification(program_id, token, entityRefId, eventCode, userType, currentJob, trace_id, user, payload, vendors, sequelize, false);
        } catch (error) {
            console.error("Error in FILLED notification logic:", error);
        }


    }

    async handleJobOptOut(user: any,
        token: string,
        sequelize: any,
        eventCode: string,
        program_id: string,
        currentJob: any,
        traceId: string) {
        try {
            const userType = await determineUserType(user, token);
            console.log(' userType : ', userType);
            if (userType === TenantConstant.SUPER_USER.toLocaleUpperCase()) {
                console.error("Vendor not allowed to perform this action", userType, eventCode);
                return;
            }
            const jobData = currentJob?.dataValues?.id
                ? await getJobData(currentJob.dataValues.id)
                : null;

            const payload = {
                job_id: currentJob?.job_id,
                job_url: currentJob?.dataValues?.id && currentJob?.dataValues?.job_template_id
                    ? `${ui_base_url}/jobs/job/view/${currentJob.dataValues.id}/${currentJob.dataValues.job_template_id}?detail=job-details`
                    : '',
                job_title: currentJob.job_manager_id,
                user_type: user?.userType


            };

            let entityRefId = rootTenantId;
            const vendors = new Set<any>();
            const vendorsDetail: Set<string> = await getAllDistributedProgramVendor(currentJob?.id, program_id);
            if (vendorsDetail.size === 0) {
                console.log('No vendors found for this job distribution');
            } else {
                vendorsDetail.forEach(vendorId => vendors.add(vendorId));
            }
            //Fetch Tenant
            jobRoleRecipientNotificationService.fetchAndProcessJobTemplateRoleRecipientNotification(program_id, token, entityRefId, eventCode, userType, currentJob, traceId, user, payload, vendors, sequelize, false);



        } catch (notificationError) {
            console.error("Error in notification logic:", notificationError);
        }
    }
}
export default JobNotificationService;