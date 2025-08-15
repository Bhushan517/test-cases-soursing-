import { sequelize } from "../config/instance";
import { NotificationDataPayload } from "../interfaces/noifications-data-payload.interface";
import { getUsersWithHierarchy, notifyJobManager } from "../utility/notification-helper";
import { gatherEmailRecipients, getAllVendorUserData, getJobManagerEmail, getRoleRecipientUser } from "../utility/notification-helper-interview";
import { fetchAllRoleRecipientTemplatesDetails, fetchNotificationTenant, fetchTemplate, sendNotification } from "../utility/notificationService";
import { TenantConstant } from "../utility/tenant-constant";

interface NotificationResult {
    entityRefId: any;
    emailRecipients: any;
}

class JobRoleRecipientNotificationService {

    async fetchAndProcessJobTemplateRoleRecipientNotification(
        program_id: string, token: string, initialEntityRefId: string, eventCode: string, userType: any, job: any, traceId: string, user: any, payload: any, vendorList: Set<any>, sequelize: any, isVendorOnly: boolean): Promise<NotificationResult> {

        const tenantDetails = await fetchNotificationTenant(program_id, token);
        console.log('Teanant found : ', tenantDetails);

        if (!tenantDetails || tenantDetails?.message === 'Tenant Not Found') {
            return await this.handleFallbackNotification(
                sequelize,
                program_id,
                job,
                userType,
                vendorList,
                payload,
                traceId,
                eventCode,
                token,
                user,
                initialEntityRefId,
                isVendorOnly
            );
        }

        const entityRefId = tenantDetails?.payload?.refId || initialEntityRefId;
        console.log("Processing tenant details");

        const templates = await this.fetchTemplates(token, eventCode, userType, program_id);
        console.log('Template found : ', templates);

        if (!templates) {
            return { entityRefId, emailRecipients: {} };
        }

        const roleBasedTemplates = await fetchAllRoleRecipientTemplatesDetails(templates, job);
        console.log('Role recipient found : ', roleBasedTemplates);

        if (!roleBasedTemplates) {
            return await this.handleFallbackNotification(
                sequelize,
                program_id,
                job,
                userType,
                vendorList,
                payload,
                traceId,
                eventCode,
                token,
                user,
                entityRefId,
                isVendorOnly
            );
        }

        await this.processRoleBasedTemplates(
            roleBasedTemplates,
            {
                sequelize,
                program_id,
                vendorList,
                job,
                token,
                payload,
                traceId,
                eventCode,
                user,
                entityRefId,
                userType
            }
        );

        return { entityRefId, emailRecipients: {} };
    }

    async fetchTemplates(
        token: string,
        eventCode: string,
        userType: any,
        program_id: string
    ) {
        const templatePayload = {
            token,
            event_code: eventCode,
            role: userType
        };

        return await fetchTemplate(templatePayload, program_id);
    }
    async notifyUsers(payload: any, program_id: string, traceId: string, eventCode: string, emailRecipients: any, token: string, user: any, entityRefId: any, roleType: any, userType: string) {
        // Prepare notification payload
        const notificationPayload: NotificationDataPayload = {
            program_id,
            traceId,
            eventCode,
            recipientEmail: emailRecipients,
            payload,
            token,
            userId: user?.sub ?? "",
            roleRecipient: roleType,
            entityRefId: entityRefId,
            role: userType
        };

        // Send the notification
        console.log("Sending notification...");
        await notifyJobManager(sendNotification, notificationPayload, emailRecipients);
        console.log("Notification sent successfully");
    }

    async processRoleBasedTemplates(
        roleBasedTemplates: any[],
        context: {
            sequelize: any;
            program_id: string;
            vendorList: Set<string>;
            job: any;
            token: string;
            payload: any;
            traceId: string;
            eventCode: string;
            user: any;
            entityRefId: any;
            userType: any;
        }
    ) {
        for (const roleObj of roleBasedTemplates) {
            const recipients = await this.getRecipientsForRole(roleObj, context);
            if (context.eventCode && context.eventCode.toLowerCase().includes('job')) {
                // Send email to the hiring manager
                console.log('Job details :  ',context.job)
                let jobDetails = context.job?.dataValues ?  context.job?.dataValues : context.job;
                const jobManager = await getJobManagerEmail(sequelize, jobDetails?.job_manager_id);
                if (jobManager && jobManager.email && jobManager.email.trim() !== '' &&
                    !recipients.some(recipient => recipient.email === jobManager.email)) {
                    recipients.push(jobManager);
                }
            }

            await this.notifyUsers(
                context.payload,
                context.program_id,
                context.traceId,
                context.eventCode,
                recipients,
                context.token,
                context.user,
                context.entityRefId,
                roleObj.key,
                context.userType
            );
        }
    }

    async getRecipientsForRole(
        roleObj: any,
        context: {
            sequelize: any;
            program_id: string;
            vendorList: Set<string>;
            job: any;
            token: string;
        }
    ): Promise<any[]> {
        const { key, value } = roleObj;
        const recipients: any[] = [];

        console.log(`Processing role: ${key} with IDs:`, value);
        console.log('Key:', key);
        console.log('Vendor list:', context.vendorList);

        if (await this.isVendorRole(key) && context.vendorList) {
            console.log('Job data:', context.job);
            const vendorRecipients = await getAllVendorUserData(
                context.sequelize,
                context.program_id,
                context.vendorList,
                context.job.hierarchy_ids,
                context.job.id
            );
            recipients.push(...vendorRecipients);
        } else if (await this.hasRoleValues(value)) {
            const roleRecipients = await getRoleRecipientUser(
                context.program_id,
                value,
                context.token,
                key
            );
            recipients.push(...roleRecipients);
        } else {
            const fallbackRecipients = await this.getFallbackRecipients(key, context);
            if (fallbackRecipients) {
                recipients.push(fallbackRecipients);
            }
        }

        return recipients;
    }
    async getFallbackRecipients(
        key: string,
        context: { sequelize: any; program_id: string; job: any }
    ): Promise<any> {
        const normalizedKey = key?.toLocaleUpperCase();

        if (normalizedKey === TenantConstant.CLIENT.toLocaleUpperCase()) {
            return await getJobManagerEmail(context.sequelize, context.job?.job_manager_id);
        }

        if (normalizedKey === TenantConstant.MSP.toLocaleUpperCase()) {
            return await getUsersWithHierarchy(
                context.sequelize,
                context.program_id,
                TenantConstant.MSP,
                context.job?.hierarchy_ids ?? []
            );
        }
        return null;
    }

    async handleFallbackNotification(
        sequelize: any,
        program_id: string,
        job: any,
        userType: any,
        vendorList: Set<string>,
        payload: any,
        traceId: string,
        eventCode: string,
        token: string,
        user: any,
        entityRefId: any,
        isVendorOnly: boolean
    ): Promise<NotificationResult> {
        const emailRecipients = await gatherEmailRecipients(
            sequelize,
            program_id,
            job?.job_manager_id,
            job?.hierarchy_ids,
            userType,
            vendorList,
            job?.id,
            isVendorOnly
        );

        await this.notifyUsers(
            payload,
            program_id,
            traceId,
            eventCode,
            emailRecipients,
            token,
            user,
            entityRefId,
            null,
            userType
        );

        return { entityRefId, emailRecipients };
    }

    async isVendorRole(key: string): Promise<boolean> {
        return key?.toLocaleUpperCase() === TenantConstant.VENDOR.toLocaleUpperCase();
    }

    async hasRoleValues(value: any[]): Promise<boolean> {
        return value && value.length > 0;
    }

}

export default JobRoleRecipientNotificationService;