import { sequelize } from "../config/instance";
import { databaseConfig } from "../config/db";
import { determineUserType, fetchUserDetils, formatDate, formatTime, getProgramVendorsEmail, notifyJobManager } from "../utility/notification-helper";
import { TenantConstant } from "../utility/tenant-constant";
import { fetchCandidateDetails, fetchInterviewRejector, gatherEmailRecipients, gatherInterviewRecipients, getCandidateDetails, getInterviewCreator, getInterviewDetails, getJobData, getProgramVendorsEmailBySubmissionIdAndInterviewId } from "../utility/notification-helper-interview";
import { NotificationEventCode } from "../utility/notification-event-code";
import { NotificationDataPayload } from "../interfaces/noifications-data-payload.interface";
import { sendNotification } from "../utility/notificationService";
let ui_base_url = databaseConfig.config.ui_base_url;
let rootTenantId = databaseConfig.config.root_tenant_id;
class InterviewNotificationService {

    async handleSchedulesInterviewNotification(
        user: any,
        token: string,
        processedData: any,
        newItem: any,
        program_id: string,
        job: any,
        traceId: string,
        logger: Function
    ) {
        try {
            if (user?.userType) {
                console.log("Inside super user....");
                return;
            }
            console.log("outside super user...");

            const userType = await determineUserType(user, token);
            if (!userType || userType === TenantConstant.VENDOR.toLocaleUpperCase()) {
                console.error("Vendor not allowed to update distribution", userType);
                return;
            }

            let jobData: any = [];
            jobData = await getJobData(processedData.job_id);

            const emailRecipients = await gatherEmailRecipients(
                sequelize,
                program_id,
                job?.job_manager_id,
                job?.hierarchy_ids,
                userType,
                new Set<string>(),
                jobData?.[0]?.id,
                false
            );
            const interviewId = newItem.dataValues.id;

            let program_vendors = await getProgramVendorsEmailBySubmissionIdAndInterviewId(processedData.program_id, interviewId);
            emailRecipients.push(...program_vendors);

            const interviewCreater = await getInterviewCreator(newItem.dataValues.id);

            const candidateDetails = await fetchCandidateDetails(processedData.submit_candidate_id);
            //emailRecipients.push(candidateDetails);

            const interviewdetails = await getInterviewDetails(newItem.dataValues.id);
            const eventCode = NotificationEventCode.INTERVIEW_SCHEDULED;
            const formattedTime = processedData?.schedules?.[0]?.start_time
                ? await formatTime(processedData.schedules[0].start_time)
                : null;

            const payload: any = {
                candidate_first_name: candidateDetails?.first_name ?? "NA",
                candidate_last_name: candidateDetails?.last_name ?? "NA",
                interview_time: formattedTime ?? "NA",
                interview_location: processedData?.other_location || " ",
                interview_link: interviewdetails?.link ? interviewdetails.link : "",
                interview_id: interviewdetails?.interview_id ?? "NA",
                interview_url:
                    processedData?.job_id && jobData?.[0]?.job_template_id
                        ? `${ui_base_url}/jobs/view-submit/${processedData?.submit_candidate_id}/job/${jobData?.[0]?.job_template_id}?detail=interview`
                        : "",
                interview_type: interviewdetails?.interview_type ?? "NA",
                interview_zone: interviewdetails?.time_zone_name ?? "NA",
            };

            if (Array.isArray(interviewCreater) && interviewCreater.length > 0) {
                payload.created_by_first_name = interviewCreater[0]?.first_name ?? "NA";
                payload.created_by_last_name = interviewCreater[0]?.last_name ?? "NA";
            }

            if (Array.isArray(jobData) && jobData.length > 0) {
                payload.job_id = jobData[0]?.job_id ?? "NA";
                payload.job_name = jobData[0]?.name ?? "NA";
                payload.job_url =
                    processedData.job_id && jobData?.[0]?.job_template_id
                        ? `${ui_base_url}/jobs/job/view/${processedData.job_id}/${jobData?.[0]?.job_template_id}?detail=job-details`
                        : "";
            }

            if (Array.isArray(interviewdetails?.schedules)) {
                const schedules = interviewdetails.schedules;
                for (let i = 0; i < 10; i++) {
                    if (schedules[i]) {
                        const date = formatDate(schedules[i].interview_date); // dd/mm/yyyy
                        const start = formatTime(schedules[i].start_time);    // HH:mm
                        const end = formatTime(schedules[i].end_time);        // HH:mm
                        payload[`Slot_${i + 1}`] = `${date} (${start} - ${end})`;
                    } else {
                        payload[`Slot_${i + 1}`] = ""; // fill empty if no schedule
                    }
                }
            } else {
                for (let i = 1; i <= 10; i++) {
                    payload[`Slot_${i}`] = "";
                }
            }


            if (
                Array.isArray(interviewdetails?.interviewer_contact_numbers) &&
                interviewdetails.interviewer_contact_numbers.length > 0
            ) {
                payload.interview_over_phone = interviewdetails?.interviewer_contact_numbers?.[0]
                    ? interviewdetails.interviewer_contact_numbers[0]
                    : "";
            }

            let notificationPayload: NotificationDataPayload = {
                program_id: processedData.program_id,
                traceId,
                eventCode,
                recipientEmail: emailRecipients,
                payload,
                token,
                userId: user?.sub ?? "",
                roleRecipient: '',
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

    async processInterview(interview: any, user: any, token: string, traceId: string, sequelize: any, reply: any) {

        try {
            const userType = await determineUserType(user, token);
            if (!userType || userType === TenantConstant.SUPER_USER.toLocaleUpperCase()) {
                console.error("super user not allowed to send notification for interview accepted", userType);
                return;
            }
            if (userType === TenantConstant.VENDOR.toLocaleUpperCase()) {
                let program_id = interview.dataValues.program_id;
                let interviewCreater: any;
                let jobData: any = [];
                jobData = await getJobData(interview.dataValues.job_id);
                const vendorList = new Set<string>();

                // Determine recipients based on user type and program type
                const emailRecipients = await gatherInterviewRecipients(sequelize, program_id, jobData[0]?.job_manager_id, jobData[0]?.hierarchy_ids, userType, vendorList, interview.dataValues.id, jobData[0]?.id);

                // returns interviewer first name and last name
                interviewCreater = await getInterviewCreator(interview.id);

                const interviewDetails = await getInterviewDetails(interview?.id);

                let payload: any;

                const eventCode = NotificationEventCode.INTERVIEW_ACCEPTED;

                if (Array.isArray(jobData) && jobData.length > 0 && jobData[0]?.job_id) {
                    payload = {
                        ...payload,
                        job_id: jobData[0].job_id,
                        job_url: interview.dataValues.job_id && jobData?.[0]?.job_template_id ? `${ui_base_url}/jobs/job/view/${interview.dataValues.job_id}/${jobData?.[0]?.job_template_id}?detail=job-details` : '',
                        job_name: jobData?.[0]?.name ?? "NA",
                    };
                } else {
                    console.log("Job data is missing or invalid");
                }
                const acceptedBy = user && typeof user === "object" && user?.sub
                ? await fetchUserDetils(user.sub) : [];                
                payload = {
                    ...payload,
                    created_by_first_name: acceptedBy?.[0]?.first_name ?? "",
                    created_by_last_name: acceptedBy?.[0]?.last_name  ?? "",
                    interview_id: interviewDetails.interview_id || "",
                    interview_url: interview.dataValues.job_id && jobData?.[0]?.job_template_id ? `${ui_base_url}/jobs/view-submit/${interview?.submit_candidate_id}/job/${jobData?.[0]?.job_template_id}?detail=interview` : '',
                };


                let notificationPayload: NotificationDataPayload = {
                    program_id: interview.program_id,
                    traceId,
                    eventCode,
                    recipientEmail: emailRecipients,
                    payload,
                    token,
                    userId: user?.sub ?? "",
                    roleRecipient: '',
                    entityRefId: rootTenantId,
                    role: userType
                };

                console.log("Sending notification...");
                await notifyJobManager(sendNotification, notificationPayload, emailRecipients);
                console.log("Notification sent successfully");
            }
        } catch (notificationError) {
            console.error("Error in notification logic:", notificationError);
        }
    }

    async processInterviewCompletion(
        interview: any,
        user: any,
        token: string,
        traceId: string,
        sequelize: any,
        reply: any
    ) {
        try {
            const userType = await determineUserType(user, token);
            if (!userType || userType === TenantConstant.SUPER_USER.toLocaleUpperCase()
                || userType === TenantConstant.VENDOR.toLocaleUpperCase()) {
                console.error("Vendor / super user will not recieve the notification", userType);
                return;
            }
            let interviewCreater: any;
            let jobData: any = [];
            let program_id = interview.dataValues.program_id;
            jobData = await getJobData(interview.dataValues.job_id);
            let vendorId = interview.dataValues.vendor_id;
            // Determine recipients based on user type and program type
            console.log('Inside processInterviewCompletion -----');
            const emailRecipients = await gatherInterviewRecipients(sequelize, program_id, jobData[0]?.job_manager_id, jobData[0]?.hierarchy_ids, userType, new Set<string>().add(vendorId), interview.dataValues.id, jobData[0]?.id);

            if (!vendorId) {
                const program_vendors = await getProgramVendorsEmailBySubmissionIdAndInterviewId(interview.dataValues.program_id, interview.dataValues.id);
                emailRecipients.push(...program_vendors);
            }

            const candidateDetails = await fetchCandidateDetails(interview?.submit_candidate_id);
            emailRecipients.push(candidateDetails)
            interviewCreater = await getInterviewCreator(interview?.id);
            const interviewDetails = await getInterviewDetails(interview?.id);

            const eventCode = NotificationEventCode.INTERVIEW_COMPLETED;

            const payload: any = {};

            payload.created_by_first_name = (Array.isArray(interviewCreater) && interviewCreater.length > 0)
                ? interviewCreater[0]?.first_name ?? "NA"
                : "NA";

            payload.created_by_last_name = (Array.isArray(interviewCreater) && interviewCreater.length > 0)
                ? interviewCreater[0]?.last_name ?? "NA"
                : "NA";

            payload.candidate_first_name = candidateDetails?.first_name ?? "NA";
            payload.candidate_last_name = candidateDetails?.last_name ?? "NA";


            if (interviewDetails?.start_time && interviewDetails?.end_time) {
                payload.interview_time = `${formatTime(interviewDetails.start_time)} - ${formatTime(interviewDetails.end_time)}`;
            } else if (interviewDetails?.start_time) {
                payload.interview_time = formatTime(interviewDetails.start_time);
            } else {
                payload.interview_time = "NA";
            }
            payload.interview_zone = interviewDetails?.time_zone_name ?? "NA";
            if (interviewDetails?.schedules?.length > 0 && interviewDetails.schedules[0].interview_date) {
                const formattedDate = await formatDate(interviewDetails.schedules[0].interview_date);
                payload.interview_date = formattedDate;
            } else {
                payload.interview_date = "NA";
            }


            payload.start_time = interviewDetails?.start_time ?? "NA";
            payload.end_time = interviewDetails?.end_time ?? "NA";
  
            let roleRecipientType = null;
            const notificationPayload: NotificationDataPayload = {
                program_id: interview.program_id,
                traceId,
                eventCode,
                recipientEmail: emailRecipients,
                payload,
                token,
                userId: user?.sub ?? "",
                roleRecipient: roleRecipientType,
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

    async processInterviewCancellation(
        interview: any,
        user: any,
        token: string,
        traceId: string,
        sequelize: any,
        Data: any, // Assuming `Data` contains additional data like `interview_cancel_reason`
        reply: any
    ) {

        try {
            const userType = await determineUserType(user, token);
            if (!userType || userType === TenantConstant.SUPER_USER.toLocaleUpperCase()) {
                console.error("super user will not recieve the notification", userType);
                return;
            }

            let jobData: any = [];
            let program_id = interview.dataValues.program_id;

            jobData = await getJobData(interview.dataValues.job_id);
            const vendorId = interview.dataValues.vendor_id;
            const vendorList = new Set<string>();
            if (vendorId != undefined) { vendorList.add(vendorId); }
            // Determine recipients based on user type and program type
            const emailRecipients = await gatherInterviewRecipients(sequelize, program_id, jobData[0]?.job_manager_id, jobData[0]?.hierarchy_ids, userType, vendorList, interview.dataValues.id, jobData[0]?.id);

            console.log('------------------ Interview Details -------------', interview);
            const program_vendors = await getProgramVendorsEmail(program_id);
            emailRecipients.push(...program_vendors);

            const candidateDetails = await fetchCandidateDetails(interview?.submit_candidate_id);
            // emailRecipients.push(candidateDetails)
            console.log('-----------Candidate details --------------', candidateDetails);
            const interviewDetails = await getInterviewDetails(interview?.id);
            console.log('-----------interview details --------------', interviewDetails);

            const eventCode = NotificationEventCode.INTERVIEW_CANCELLED;

            let interview_date;
            if (interviewDetails?.schedules?.length > 0 && interviewDetails.schedules[0].interview_date) {
                const formattedDate = await formatDate(interviewDetails.schedules[0].interview_date);
                interview_date = formattedDate;
            } else {
                interview_date = "NA";
            }

            const payload: any = {
                candidate_first_name: candidateDetails?.first_name ?? "NA",
                candidate_last_name: candidateDetails?.last_name ?? "NA",
                status: "Cancelled",
                job_id: jobData?.[0]?.job_id ?? "NA",
                job_url: interview.dataValues.job_id && jobData?.[0]?.job_template_id ? `${ui_base_url}/jobs/job/view/${interview.dataValues.job_id}/${jobData?.[0]?.job_template_id}?detail=job-details` : '',
                job_name: jobData?.[0]?.name ?? "NA",
                interview_cancel_reason: Data?.interview_cancel_reason ?? "NA",
                interview_notes: interviewDetails?.buyer_notes ?? "NA",
                interview_date: interview_date,
                candidate_phone: candidateDetails?.number ?? "NA",
                interview_time: interviewDetails?.start_time ?? "NA",
            };

            const notificationPayload: NotificationDataPayload = {
                program_id: interview.program_id,
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

            sendNotification(notificationPayload);
        } catch (notificationError) {
            console.error("Error in notification logic:", notificationError);
        }
    }

    async handleInterviewRescheduleNotification(
        interview: any,
        user: any,
        token: string,
        traceId: string,
        sequelize: any,
        reply: any,
        eventCode: string,
        Schedule: any
    ) {

        try {
            const eventWithVendor :any= [NotificationEventCode.INTERVIEW_NEW_TIME_PROPOSED];
            const isVendorActor = eventWithVendor.includes(eventCode);
            const userType = await determineUserType(user, token);
            if (!userType || userType === TenantConstant.SUPER_USER.toLocaleUpperCase()
                || (userType === TenantConstant.VENDOR.toLocaleUpperCase() && !isVendorActor)) {
                console.error("super user/ vendor will not recieve the re-schedule notification", userType);
                return;
            }

            let jobData: any = [];
            let program_id = interview.dataValues.program_id;

            jobData = await getJobData(interview.dataValues.job_id);
            console.log('Schedule data : ', Schedule?.schedules);
            let vendorId = interview.dataValues.vendor_id;
            const vendorList = new Set<string>();
            if (vendorId != undefined) { vendorList.add(vendorId); }

            // Handle recipient emails based on userType and programType
            // Determine recipients based on user type and program type
            const emailRecipients = await gatherInterviewRecipients(sequelize, program_id, jobData[0]?.job_manager_id, jobData[0]?.hierarchy_ids, userType, vendorList, interview.dataValues.id, jobData[0]?.id);
            // Get additional recipients

            // Collect additional interview details
            const interviewCreator = await getInterviewCreator(interview.id);
            const candidateDetails = await getCandidateDetails(interview?.submit_candidate_id);
            //emailRecipients.push(candidateDetails)
            const interviewDetails = await getInterviewDetails(interview?.id);

            const formattedDate = Schedule?.schedules?.[0]?.interview_date
                ? await formatDate(Schedule.schedules[0].interview_date)
                : null;
            const formattedTime = Schedule?.schedules?.[0]?.start_time
                ? await formatTime(Schedule.schedules[0].start_time)
                : null;

            const payload: any = {
                candidate_first_name: candidateDetails.first_name,
                candidate_last_name: candidateDetails.last_name,
                created_by_first_name: interviewCreator[0]?.first_name || "",
                created_by_last_name: interviewCreator[0]?.last_name || "",
                job_id: jobData[0]?.job_id,
                job_url: interview.dataValues.job_id && jobData?.[0]?.job_template_id ? `${ui_base_url}/jobs/job/view/${interview.dataValues.job_id}/${jobData?.[0]?.job_template_id}?detail=job-details` : '',
                job_name: jobData[0]?.name,
                interview_id: interviewDetails?.interview_id,
                interview_url: interview.dataValues.job_id && jobData?.[0]?.job_template_id ? `${ui_base_url}/jobs/view-submit/${interview?.submit_candidate_id}/job/${jobData?.[0]?.job_template_id}?detail=interview` : '',
                interview_type: interviewDetails?.interview_type,
                interview_location: Schedule?.other_location || "",
                interview_link: interviewDetails?.link ? interviewDetails.link : "",
                interview_time: formattedTime,
                interview_date: formattedDate,
                interview_zone: interviewDetails?.time_zone_name,
                interview_over_phone: interviewDetails?.interviewer_contact_numbers?.[0]
                    ? interviewDetails.interviewer_contact_numbers[0]
                    : "",
            };
            const roleRecipientType = null;
            const notificationPayload: NotificationDataPayload = {
                program_id: interview.program_id,
                traceId,
                eventCode,
                recipientEmail: emailRecipients,
                payload,
                token,
                userId: user?.sub ?? "",
                roleRecipient: roleRecipientType,
                entityRefId: rootTenantId,
                role: userType
            };

            console.log("Notification Payload:", notificationPayload);
            sendNotification(notificationPayload);
        } catch (notificationError) {
            console.error("Error in notification logic:", notificationError);
        }
    }

    async handleInterviewRejectedNotification(
        interview: any,
        user: any,
        token: string,
        sequelize: any,
        reply: any,
        traceId: string
    ) {
        try {
            // Fetch necessary data
            const userType = await determineUserType(user, token);
            if (!userType || userType === TenantConstant.SUPER_USER.toLocaleUpperCase()) {
                console.error("super user will not recieve the notification", userType);
                return;
            }
            // Add program vendors to recipients
            const vendorList = new Set<string>();
            if (userType.toLocaleUpperCase() === TenantConstant.CLIENT.toLocaleUpperCase() || userType.toLocaleUpperCase() === TenantConstant.MSP.toLocaleUpperCase()) {
                let vendorId = interview.dataValues.vendor_id;
                if (vendorId != undefined) { vendorList.add(vendorId); }
            }

            const jobData = await getJobData(interview.dataValues.job_id);
            let program_id = interview.dataValues.program_id;

            // Process emails based on userType and programType
            // Determine recipients based on user type and program type
            const emailRecipients = await gatherInterviewRecipients(sequelize, program_id, jobData[0]?.job_manager_id, jobData[0]?.hierarchy_ids, userType, vendorList, interview.dataValues.id, jobData[0]?.id);

            // Fetch additional details
            const interviewCreator = await fetchInterviewRejector(interview.id);
            const interviewDetails = await getInterviewDetails(interview.id);

            // Define event and payload
            const eventCode = NotificationEventCode.INTERVIEW_REJECTED_PENDING_ACCEPTANCE;
            const payload = {
                created_by_first_name: interviewCreator?.[0]?.first_name || "",
                created_by_last_name: interviewCreator?.[0]?.last_name || "",
                job_id: jobData?.[0]?.job_id || "",
                job_url: interview.dataValues.job_id && jobData?.[0]?.job_template_id ? `${ui_base_url}/jobs/job/view/${interview.dataValues.job_id}/${jobData?.[0]?.job_template_id}?detail=job-details` : '',
                interview_id: interviewDetails?.interview_id || "",
                interview_url: interview.dataValues.job_id && jobData?.[0]?.job_template_id ? `${ui_base_url}/jobs/view-submit/${interview?.submit_candidate_id}/job/${jobData?.[0]?.job_template_id}?detail=interview` : '',
            };
            const candidateDetails1 = await fetchCandidateDetails(interview?.submit_candidate_id);
            //emailRecipients.push(candidateDetails1)

            // Build notification payload
            const roleRecipientType = null;
            const notificationPayload: NotificationDataPayload = {
                program_id: interview.program_id,
                traceId: interview.dataValues.trace_id,
                eventCode,
                recipientEmail: emailRecipients,
                payload,
                token,
                userId: user?.sub ?? "",
                roleRecipient: roleRecipientType,
                entityRefId: rootTenantId,
                role: userType
            };

            console.log("Sending notification...");
            await notifyJobManager(sendNotification, notificationPayload, notificationPayload.recipientEmail);
            console.log("Notification sent successfully");

        } catch (notificationError) {
            console.error("Error in notification logic:", notificationError);
        }
    }

    async handleInterviewRejectedPendingConfirmation(
        interview: any,
        user: any,
        token: string,
        sequelize: any,
        reply: any,
        traceId: string
    ) {

        try {
            const userType = await determineUserType(user, token);
            if (!userType || userType === TenantConstant.SUPER_USER.toLocaleUpperCase()) {
                console.error("Super user will not receive the notification", userType);
                return;
            }

            let program_id = interview.dataValues.program_id;
            const vendorList = new Set<string>();

            const jobData = await getJobData(interview.dataValues.job_id);
            // Add program vendors to recipients
            if (userType.toLocaleUpperCase() === TenantConstant.CLIENT.toLocaleUpperCase() || userType.toLocaleUpperCase() === TenantConstant.MSP.toLocaleUpperCase()) {
                let vendorId = interview.dataValues.vendor_id;
                if (vendorId != undefined) { vendorList.add(vendorId); }
            }

            // Determine recipients based on user type and program type
            const emailRecipients = await gatherInterviewRecipients(sequelize, program_id, jobData[0]?.job_manager_id, jobData[0]?.hierarchy_ids, userType, vendorList, interview.dataValues.id, jobData[0]?.id);




            // Fetch additional details
            // get external participants
            console.log('------------------ Interview Details --------------------', interview);
            const interviewCreator = await fetchInterviewRejector(interview.id);
            const interviewDetails = await getInterviewDetails(interview.id);
            const candidateDetails1 = await fetchCandidateDetails(interview?.submit_candidate_id);
            //emailRecipients.push(candidateDetails1)

            // Define event code and payload
            const eventCode = NotificationEventCode.INTERVIEW_REJECTED_PENDING_CONFIRMATION;
            const payload = {
                created_by_first_name: interviewCreator?.[0]?.first_name || "",
                created_by_last_name: interviewCreator?.[0]?.last_name || "",
                job_id: jobData?.[0]?.job_id || "",
                job_url: interview.dataValues.job_id && jobData?.[0]?.job_template_id ? `${ui_base_url}/jobs/job/view/${interview.dataValues.job_id}/${jobData?.[0]?.job_template_id}?detail=job-details` : '',
                interview_id: interviewDetails?.interview_id || "",
                interview_url: interview.dataValues.job_id && jobData?.[0]?.job_template_id ? `${ui_base_url}/jobs/view-submit/${interview?.submit_candidate_id}/job/${jobData?.[0]?.job_template_id}?detail=interview` : '',
            };

            // Build notification payload
            const roleRecipientType = null;
            const notificationPayload: NotificationDataPayload = {
                program_id: interview.program_id,
                traceId: interview.dataValues.trace_id,
                eventCode,
                recipientEmail: emailRecipients,
                payload,
                token,
                userId: user?.sub ?? "",
                roleRecipient: roleRecipientType,
                entityRefId: rootTenantId,
                role: userType
            };

            console.log("Sending notification...");
            await notifyJobManager(sendNotification, notificationPayload, notificationPayload.recipientEmail);
            console.log("Notification sent successfully");

        } catch (notificationError) {
            console.error("Error in notification logic:", notificationError);
        }
    }

    async handleInterviewConfirmNotification(
        interview: any,
        user: any,
        token: string,
        traceId: string,
        sequelize: any,
        reply: any,
        eventCode: string,
    ) {

        try {
           
            const userType = await determineUserType(user, token);
            if (!userType || userType === TenantConstant.SUPER_USER.toLocaleUpperCase()
                || userType === TenantConstant.VENDOR.toLocaleUpperCase() ) {
                console.error("super user/ vendor will not recieve the interview confirm notification", userType);
                return;
            }

            let jobData: any = [];
            let program_id = interview?.dataValues?.program_id;
            jobData = interview?.dataValues?.job_id 
             ? await getJobData(interview.dataValues.job_id) 
             : null;
            let vendorId = interview?.dataValues?.vendor_id;
            const vendorList = new Set<string>();
            if (vendorId != undefined) { vendorList.add(vendorId); }

            const emailRecipients = await gatherInterviewRecipients(sequelize, program_id, jobData[0]?.job_manager_id, jobData[0]?.hierarchy_ids, userType, vendorList, interview.dataValues.id, jobData[0]?.id);

            const confirmedBy = user && typeof user === "object" && user?.sub
                ? await fetchUserDetils(user.sub) : []; 

            const payload: any = {
                 created_by_first_name : confirmedBy?.[0]?.first_name ?? "",
                 created_by_last_name: confirmedBy?.[0]?.last_name  ?? "",
                 interview_id : interview?.interview_Id ?? "",
                 job_id: jobData[0]?.job_id ?? "",
                 job_url: interview?.dataValues?.job_id && jobData?.[0]?.job_template_id ? `${ui_base_url}/jobs/job/view/${interview.dataValues.job_id}/${jobData?.[0]?.job_template_id}?detail=job-details` : '', 
                  interview_url :
                    interview?.job_id && jobData?.[0]?.job_template_id
                        ? `${ui_base_url}/jobs/view-submit/${interview?.submit_candidate_id}/job/${jobData?.[0]?.job_template_id}?detail=interview`
                        : "",
            };           
            const roleRecipientType = null;
            const notificationPayload: NotificationDataPayload = {
                program_id: interview.program_id,
                traceId,
                eventCode,
                recipientEmail: emailRecipients,
                payload,
                token,
                userId: user?.sub ?? "",
                roleRecipient: roleRecipientType,
                entityRefId: rootTenantId,
                role: userType
            };

            console.log("Notification Payload:", notificationPayload);
            sendNotification(notificationPayload);
        } catch (notificationError) {
            console.error("Error in notification logic:", notificationError);
        }
    }


}
export default InterviewNotificationService;