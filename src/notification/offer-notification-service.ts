import { sequelize } from "../config/instance";
import { NotificationEventCode } from "../utility/notification-event-code";
import { determineUserType, fetchUsersBasedOnHierarchy, getCandidate, getJobData, getJobManagerEmail, getOfferCreation, getOfferCreator, getProgramVendorsEmail, notifyJobManager } from "../utility/notification-helper";
import { TenantConstant } from "../utility/tenant-constant";
import { gatherEmailRecipients } from "../utility/notification-helper-interview";
import { NotificationDataPayload } from "../interfaces/noifications-data-payload.interface";
import { sendNotification } from "../utility/notificationService";
import { databaseConfig } from "../config/db";
import { FastifyReply, FastifyRequest } from "fastify";
import generateCustomUUID from "../utility/genrateTraceId";
import { decodeToken } from "../middlewares/verifyToken";
import { EmailRecipient } from "../interfaces/email-recipient";
let ui_base_url = databaseConfig.config.ui_base_url;
let rootTenantId = databaseConfig.config.root_tenant_id;

class OfferNotificationService {

    processAndSendOfferNotification = async (
        token: string,
        reply: any,
        program_id: string,
        newItem: any,
        jobDatas: any,
        sequelize: any,
        user: any,
        traceId: string,
        offerData: any,
        eventCode: NotificationEventCode.OFFER_CREATE | NotificationEventCode.OFFER_RELEASED
    ) => {
        try {
            const userType = await determineUserType(user, token);
            if (!userType || userType === TenantConstant.VENDOR.toLocaleUpperCase()) {
                console.error("Vendor not allowed to create offer : ", userType);
                return;
            }

            let offerCreater = await getOfferCreation(newItem?.dataValues.created_by);
            let candidatesDetils = offerData?.candidate_id || "";
            const candidateData = await getCandidate(candidatesDetils);

            // list vendors
            const emailRecipients = await gatherEmailRecipients(sequelize, program_id, jobDatas?.job_manager_id, jobDatas?.hierarchy_ids, userType, new Set<string>().add(offerData?.vendor_id), jobDatas?.id, false);
            //const program_vendors = await getProgramVendorsEmail(program_id);
            //emailRecipients.push(...program_vendors);
            const payload: any = {
                job_id: jobDatas?.job_id ?? "",
                job_url: jobDatas?.id && jobDatas?.job_template_id
                    ? `${ui_base_url}/jobs/job/view/${jobDatas.id}/${jobDatas.job_template_id}?detail=job-details`
                    : '',
                offer_id: newItem.dataValues.offer_code ?? "",
                offer_url: offerData?.candidate_id ? `${ui_base_url}/jobs/view-submit/${offerData.candidate_id}/job/${offerData?.job_id}?offerId=${newItem?.dataValues?.id}&detail=offer`
                    : '',
                created_by_first_name: offerCreater[0]?.first_name ?? "NA",
                created_by_last_name: offerCreater[0]?.last_name ?? "NA",
                user_type: user?.userType,
                candidate_first_name: candidateData[0]?.first_name ?? "NA",
                candidate_last_name: candidateData[0]?.last_name ?? "NA",
            };

            const notificationPayload: NotificationDataPayload = {
                program_id,
                traceId,
                eventCode,
                recipientEmail: emailRecipients,
                payload,
                token,
                userId: user?.sub ?? "",
                roleRecipient: null,
                entityRefId: rootTenantId,
                role: userType
            };
            console.log("Sending notification...");
            await notifyJobManager(sendNotification, notificationPayload, emailRecipients);
            console.log("Notification sent successfully");
        }
        catch (error) {
            console.error("Error occurred while sending notification:", error);
        }
    };

    async sendNotificationsForUserType(request: FastifyRequest,
        reply: FastifyReply, program_id: string, id: string, eventCode: any, payload: any, allPayload: any, updates: any) {
        const traceId = generateCustomUUID();
        try {

            const authHeader = request.headers.authorization;

            if (!authHeader?.startsWith('Bearer ')) {
                return reply.status(401).send({ message: 'Unauthorized - Token not found' });
            }
            const token = authHeader.split(' ')[1];
            const user = await decodeToken(token);

            if (!user) {
                return reply.status(401).send({ message: 'Unauthorized - Invalid token' });
            }
            const userType = await determineUserType(user, token);
            if (userType?.user_type?.toLowerCase() == "msp".toLowerCase() || userType?.user_type?.toLowerCase() == "client".toLowerCase() || user.userType?.toLowerCase() == "super_user".toLowerCase()) {
                (async () => {
                    if (user?.userType) {
                        console.log("Inside super user....")
                        return;
                    }
                    console.log("outside super user...");
                    try {

                        const managerData = await getJobManagerEmail(sequelize, id);


                        const recipientEmailList: EmailRecipient[] = [];
                        if (managerData) recipientEmailList.push(managerData)
                        const emailList = await fetchUsersBasedOnHierarchy(
                            sequelize,
                            allPayload
                        );
                        if (emailList) {
                            recipientEmailList.push(...emailList);
                        }


                        const notificationPayload: NotificationDataPayload = {
                            program_id,
                            traceId,
                            eventCode,
                            recipientEmail: recipientEmailList,
                            payload,
                            token,
                            userId: user?.sub ?? "",
                            roleRecipient: null,
                            entityRefId: rootTenantId,
                            role: userType
                        };

                        await notifyJobManager(sendNotification, notificationPayload, recipientEmailList);
                    } catch (notificationError) {
                        console.error("Error in notification logic:", notificationError);
                    }
                })();

            }
        } catch (error: any) {

            reply.status(500).send({
                status_code: 500,
                message: 'Internal Server Error.',
                trace_id: traceId,
                error: error.message,
            });
        }
    }

    async handleOfferStatusNotification(
        token: string,
        sequelize: any,
        program_id: string,
        offer: any,
        user: any,
        traceId: string,
        eventCode: NotificationEventCode.OFFER_ACCEPT | NotificationEventCode.OFFER_REJECT
    ) {
        try {
            const userType = await determineUserType(user, token);
            if (!userType || userType === TenantConstant.MSP.toLocaleUpperCase() || userType === TenantConstant.CLIENT.toLocaleUpperCase()) {
                console.error("Offer is accepted and rejected by Only Vendor : ", userType);
                return;
            }

            const jobId = offer?.dataValues.job_id;
            const jobData: any = await getJobData(sequelize, jobId);
            const offerCreator = await getOfferCreator(offer.id);

            // Determine recipient list based on user and program type
            const emailRecipients = await gatherEmailRecipients(sequelize, program_id, jobData?.[0]?.job_manager_id, jobData?.[0]?.hierarchy_ids, userType, new Set<string>(), jobData?.[0]?.id, false);

            // Prepare notification payload
            const payload: any = {
                job_id: jobData[0]?.job_id ?? "",
                job_url: jobId && jobData[0]?.job_template_id
                    ? `${ui_base_url}/jobs/job/view/${jobId}/${jobData[0]?.job_template_id}?detail=job-details`
                    : '',
                offer_id: offer?.dataValues.offer_code ?? "",
                offer_url: offer?.candidate_id ? `${ui_base_url}/jobs/view-submit/${offer.candidate_id}/job/${jobId}?offerId=${offer?.id}&detail=offer`
                    : '',
                created_by_first_name: offerCreator[0]?.first_name ?? "NA",
                created_by_last_name: offerCreator[0]?.last_name ?? "NA",
            };

            const notificationPayload: NotificationDataPayload = {
                program_id,
                traceId,
                eventCode,
                recipientEmail: emailRecipients,
                payload,
                token,
                userId: user?.sub ?? "",
                roleRecipient: null,
                entityRefId: rootTenantId,
                role: userType
            };

            // Send the notification
            console.log("Sending notification...");
            await notifyJobManager(sendNotification, notificationPayload, emailRecipients);
            console.log("Notification sent successfully");
        } catch (notificationError) {
            console.error("Error in notification logic:", notificationError);
        }
    }

    async handleOfferWithdrawalNotification(
        token: string,
        sequelize: any,
        program_id: string,
        offer: any,
        user: any,
        traceId: string
    ) {
        try {
            const eventCode = NotificationEventCode.OFFER_WITHDRAWN;
            const userType = await determineUserType(user, token);
            if (!userType || userType === TenantConstant.VENDOR.toLocaleUpperCase()) {
                console.error("Vendor not allowed to withdraw offer : ", userType);
                return;
            }
            const jobId = offer?.dataValues.job_id;
            const jobData: any = await getJobData(sequelize, jobId);
            const offerCreator = await getOfferCreator(offer.id);

            // Determine recipient list based on user and program type
            const emailRecipients = await gatherEmailRecipients(sequelize, program_id, jobData?.job_manager_id, jobData?.hierarchy_ids, userType, new Set<string>(), jobData?.[0]?.id, false);

            const payload: any = {
                job_id: jobData[0]?.job_id ?? "",
                job_url: jobId && jobData[0]?.job_template_id
                    ? `${ui_base_url}/jobs/job/view/${jobId}/${jobData[0]?.job_template_id}?detail=job-details`
                    : '',
                offer_id: offer?.dataValues.offer_code ?? "",
                offer_url: offer?.candidate_id ? `${ui_base_url}/jobs/view-submit/${offer.candidate_id}/job/${jobId}?offerId=${offer?.id}&detail=offer`
                    : '',
                created_by_first_name: offerCreator[0]?.first_name ?? "NA",
                created_by_last_name: offerCreator[0]?.last_name ?? "NA",
            };

            const notificationPayload: NotificationDataPayload = {
                program_id,
                traceId,
                eventCode,
                recipientEmail: emailRecipients,
                payload,
                token,
                userId: user?.sub ?? "",
                roleRecipient: null,
                entityRefId: rootTenantId,
                role: userType
            };

            console.log("Sending notification...");
            await notifyJobManager(sendNotification, notificationPayload, emailRecipients);
            console.log("Notification sent successfully");
        } catch (notificationError) {
            console.error("Error in notification logic:", notificationError);
        }
    }
}
export default OfferNotificationService;