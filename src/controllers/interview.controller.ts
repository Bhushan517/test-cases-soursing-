import { FastifyReply, FastifyRequest } from "fastify";
import JobInterviewModel from "../models/interview.model";
import { JobInterviewData, Schedule } from "../interfaces/interview.interface";
import generateCustomUUID from "../utility/genrateTraceId";
import { Op, QueryTypes } from "sequelize";
import InterviewSlots from "../models/interview-schedule.model";
import InterviewFeedback from "../models/interview-review.model";
import AdditionalAttendees from "../models/interview-participant.model";
import InterviewCustomFields from "../models/interview-custom-fields";
import SubmissionCandidateModel from "../models/submission-candidate.model";
import InterviewRepository from "../repositories/interview.repository";
import { decodeToken } from "../middlewares/verifyToken";
import { logger } from "../utility/loggerServices";
import { sequelize } from "../config/instance";
import { EmailRecipient } from "../interfaces/email-recipient";
import OfferRepository from "../repositories/offer.repository";
import { getProgramVendorsEmail } from "../utility/notification-helper";
import {
    getInterviewCreator,
} from "../utility/notification-helper-interview";
import { getJobIdsForUserType, parseValue } from "./job.controller";
import JobRepository from "../repositories/job.repository";
import JobModel from "../models/job.model";
import OfferModel from "../models/offer.model";
import { NotificationEventCode } from "../utility/notification-event-code";
import axios from "axios";
import { URLs } from "../config/ms_outlook_urls";
import { refreshAccessToken } from "../utility/outlookTokenService";
import dotenv from "dotenv";
import { databaseConfig } from "../config/db";
import OutlookCalendarEventModel from "../models/outlook-calender-event-model";
import { decryptToken, encryptToken } from "../utility/outlook/tokenUtils";
import { interviewAvailability } from "../utility/msOutlookServices";
import { Status } from "../utility/enum/status_enum";
import InterviewNotificationService from "../notification/interview-notification-service";
import { credentialingService } from "../external-services/credentialing-service";
import { CandidateHistoryService } from "../utility/candidate_history_helper";
import InterviewService from "../services/interview.service";
import JobDistributionModel from "../models/job-distribution.model";
import { getCustomsField } from "../utility/custom-field";

const candidateHistoryService = new CandidateHistoryService(sequelize);
const jobRepository = new JobRepository();
const sourcing_db = databaseConfig.config.database;
const interviewRepository = new InterviewRepository();
const offerRepository = new OfferRepository();
const interviewNotificationService = new InterviewNotificationService();
const interviewService = new InterviewService();

dotenv.config();

const config = databaseConfig.config;

export async function getAllInterviews(
    request: FastifyRequest<{
        Querystring: JobInterviewData;
        Params: { program_id: string };
    }>,
    reply: FastifyReply
) {
    const query = request.query as any;
    const { program_id } = request.params;
    const traceId = generateCustomUUID();

    try {
        const page = parseInt(query.page ?? "1", 10);
        const limit = parseInt(query.limit ?? "10", 10);
        const offset = (page - 1) * limit;
        const user = request?.user;
        const userId = user?.sub;
        const userData = await jobRepository.findUser(program_id, userId);
        const userType = user.userType ?? userData[0]?.user_type;
        const tenantId = userData[0]?.tenant_id;
        let vendor_id = null;
        let is_vendor_user = false;

        if (userType?.toUpperCase() === "VENDOR") {
            const vendor = await jobRepository.findVendor(program_id, tenantId);
            vendor_id = vendor[0].id;
            is_vendor_user = true;
        }

        const jobIds = await interviewService.getJobIdsForUserType(program_id, userId, userType);

        const replacements: any = {
            program_id,
            job_id: query.job_id || null,
            vendor_id: vendor_id,
            job_ids: jobIds,
            is_vendor_user: is_vendor_user,
            limit,
            offset
        };

        let result = await interviewRepository.getAllInterviews(replacements);

        const totalRecords = result[0]?.total_records ?? 0;
        const itemsPerPage = result[0]?.items_per_page ?? 0;
        if (!result || result.length === 0) {
            return reply.status(200).send({
                status_code: 200,
                trace_id: traceId,
                totalRecords: totalRecords,
                items_per_page: itemsPerPage,
                message: "Job Interviews Not Found",
                data: [],
            });
        }

        result = await Promise.all(result.map(async (interview: any) => {
            const actions = await getInterviewActionFlags({ interview, userType });
            return {
                ...interview,
                action_flags: actions
            };
        }));

        reply.status(200).send({
            status_code: 200,
            trace_id: traceId,
            message: "Data Fetched Successfully.",
            total_records: totalRecords,
            items_per_page: itemsPerPage,
            page,
            limit,
            interviews: result,
        });
    } catch (error: any) {
        reply.status(500).send({
            status_code: 500,
            trace_id: traceId,
            message: "Internal Server Error",
            error: error.message,
        });
    }
}

export async function getInterviewActionFlags(interviewData: any) {
    const { interview, userType } = interviewData;

    const { status, submit_candidate_id, job_id, program_id } = interview;

    const actionFlags: Record<string, boolean> = {
        reschedule_interview: false,
        schedule_interview: false,
        cancel_interview: false,
        create_offer: false,
        withdraw_candidate: false,
        reject_candidate: false,
        accept: false,
        reject: false,
        mark_as_completed: false,
        confirm: false,
        propose_new_date_and_time: false
    };

    const ut = userType?.trim().toLowerCase();
    const isSuperUser = ut === "super_user";
    const isClient = ut === "client";
    const isMSP = ut === "msp";
    const isVendor = ut === "vendor";
    const isClientOrMSP = isClient || isMSP;

    const submittedCandidate = await SubmissionCandidateModel.findOne({
        where: { candidate_id: submit_candidate_id, job_id: job_id, program_id: program_id },
        attributes: ['status']
    });

    const interviewStatus = status?.toUpperCase();
    const isRescheduleAllowed = interviewStatus !== Status.ACCEPTED?.toUpperCase();

    const candidateStatus = submittedCandidate?.dataValues?.status;
    const overallCandidateStatus = candidateStatus?.toUpperCase();

    const validStatuses = [
        Status.INTERVIEW_PENDING_ACCEPTANCE,
        Status.INTERVIEW_PENDING_CONFIRMATION,
        Status.INTERVIEW_ACCEPTED,
        Status.INTERVIEW_COMPLETED,
        Status.INTERVIEW_REJECTED,
        Status.INTERVIEW_CANCELLED,
        Status.INTERVIEW_RESCHEDULED
    ].map(status => status.toUpperCase());

    if (validStatuses.includes(overallCandidateStatus)) {
        if (interviewStatus === Status.PENDING_ACCEPTANCES?.toUpperCase()) {
            if (isClientOrMSP || isSuperUser) {
                actionFlags.reschedule_interview = isRescheduleAllowed;
                actionFlags.cancel_interview = true;
            }
            if (isVendor || isSuperUser) {
                actionFlags.cancel_interview = true;
                actionFlags.propose_new_date_and_time = true;
                actionFlags.withdraw_candidate = true;
                actionFlags.accept = true;
                actionFlags.reject = true;
            }
        } else if (interviewStatus === Status.CANCELLED?.toUpperCase()) {
            if (isClientOrMSP || isSuperUser) {
                actionFlags.reschedule_interview = isRescheduleAllowed;
            }
            if (isVendor || isSuperUser) {
                actionFlags.withdraw_candidate = true;
            }
        } else if (interviewStatus === Status.ACCEPTED?.toUpperCase()) {
            if (isClientOrMSP || isSuperUser) {
                actionFlags.reschedule_interview = isRescheduleAllowed;
                actionFlags.cancel_interview = true;
                actionFlags.schedule_interview = true;
                actionFlags.create_offer = true;
                actionFlags.mark_as_completed = true;
                actionFlags.reject_candidate = true;
            }
            if (isVendor || isSuperUser) {
                actionFlags.withdraw_candidate = true;
            }
        } else if (interviewStatus === Status.REJECTED?.toUpperCase()) {
            if (isClientOrMSP || isSuperUser) {
                actionFlags.reschedule_interview = isRescheduleAllowed;
                actionFlags.cancel_interview = true;
                actionFlags.create_offer = true;
                actionFlags.reject_candidate = true;
            }
            if (isVendor || isSuperUser) {
                actionFlags.withdraw_candidate = true;
            }
        } else if (interviewStatus === Status.COMPLETED?.toUpperCase()) {
            if (isClientOrMSP || isSuperUser) {
                actionFlags.schedule_interview = true;
                actionFlags.create_offer = true;
                actionFlags.reject_candidate = true;
            }
            if (isVendor || isSuperUser) {
                actionFlags.withdraw_candidate = true;
            }
        } else if (interviewStatus === Status.PENDING_CONFIRMATION?.toUpperCase()) {
            if (isClientOrMSP || isSuperUser) {
                actionFlags.confirm = true;
                actionFlags.reject = true;
                actionFlags.propose_new_date_and_time = true;
            }
            if (isVendor || isSuperUser) {
                actionFlags.withdraw_candidate = true;
            }
        }
    }

    return actionFlags;
}


export async function interviewsAdvanceFilter(
    request: FastifyRequest<{
        Body: JobInterviewData & {
            program_id: string,
            page: string,
            limit: string,
            interview_date: number,
            duration: string,
            interviewer: string[],
            start_time: string,
            candidate_name: string,
            job_unique_id: string,
            job_name: string,
            submission_unique_id: string
        };
    }>,
    reply: FastifyReply
) {
    const body = request.body;
    const { program_id } = request.params as { program_id: string };
    const traceId = generateCustomUUID();
    try {
        const page = parseInt(body.page ?? "1", 10);
        const limit = parseInt(body.limit ?? "10", 10);
        const offset = (page - 1) * limit;
        const user = request?.user;
        const userId = user?.sub;
        const userType = user?.userType || undefined;
        const userData = await jobRepository.findUser(program_id, userId);
        const user_type = userData[0]?.user_type;
        const tenantId = userData[0]?.tenant_id;
        let vendor_id = null;
        let is_vendor_user = false;

        if (user_type?.toUpperCase() === "VENDOR") {
            const vendor = await jobRepository.findVendor(program_id, tenantId);
            vendor_id = vendor[0].id;
            is_vendor_user = true;
        }

        const jobIds = await getJobIdsForUserType(program_id, userId, userType);

        const replacements: any = {
            program_id,
            job_id: body.job_id || null,
            title: body.title ? `%${body.title}%` : null,
            created_on: body.created_on || null,
            updated_on: body.updated_on || null,
            vendor_id: vendor_id,
            job_ids: jobIds,
            interview_date: body.interview_date || null,
            duration: body.duration || null,
            interview_type: body.interview_type,
            interviewer: body.interviewer,
            status: body.status,
            start_time: body.start_time || null,
            is_vendor_user: is_vendor_user,
            submission_unique_id: body.submission_unique_id || null,
            job_name: body.job_name || null,
            job_unique_id: body.job_unique_id || null,
            candidate_name: body.candidate_name || null,
            limit,
            offset
        };

        let result = await interviewRepository.getAllInterviewsWithFilters(replacements);

        const totalRecords = result[0]?.total_records || 0;
        const itemsPerPage = result[0]?.items_per_page || 0;
        if (!result || result.length === 0) {
            return reply.status(200).send({
                status_code: 200,
                trace_id: traceId,
                totalRecords: totalRecords,
                items_per_page: itemsPerPage,
                message: "Job Interviews Not Found",
                data: [],
            });
        }

        let filteredInterviews = result;

        reply.status(200).send({
            status_code: 200,
            trace_id: traceId,
            message: "Data Fetched Successfully.",
            total_records: totalRecords,
            items_per_page: itemsPerPage,
            page,
            limit,
            interviews: filteredInterviews,
        });
    } catch (error: any) {
        reply.status(500).send({
            status_code: 500,
            trace_id: traceId,
            message: "Internal Server Error",
            error: error.message,
        });
    }
}

export async function getInterviewById(request: FastifyRequest, reply: FastifyReply) {
    const { id, program_id } = request.params as {
        id: string;
        program_id: string;
    };
    const traceId = generateCustomUUID();
    const user = request.user;
    const userId = user?.sub;
    const userData = await offerRepository.findUser(program_id, userId);
    let userType = user?.userType ?? userData[0]?.user_type ?? "";

    try {
        const interview = await interviewRepository.getInterviewById(id, program_id);
        if (!interview) {
            reply.status(200).send({
                status_code: 200,
                trace_id: traceId,
                message: "Job Interview Not Found",
                interview: [],
            });
            return;
        }

        const actions = await getInterviewActionFlags({ interview, userType });

        const interviewData = {
            ...interview,
            action_flags: actions
        };

        reply.status(200).send({
            status_code: 200,
            trace_id: traceId,
            message: "Job Interview Data Found Successfully",
            interview: interviewData,
        });
    } catch (error: any) {
        console.error(`trace_id: ${traceId}, Error: `, error);
        reply.status(500).send({
            trace_id: traceId,
            message: "Internal Server Error",
            error: error.message,
        });
    }
}


function formatMicrosoftGraphTime(schedule: Schedule, timeZone: string) {
    if (!schedule.interview_date || !schedule.start_time || !schedule.end_time) {
        throw new Error("Missing interview_date, start_time, or end_time");
    }

    // Convert interview_date (timestamp) to a Date object
    const interviewDate = new Date(schedule.interview_date);

    // Extract date components (YYYY-MM-DD) from interview_date
    const year = interviewDate.getFullYear();
    const month = String(interviewDate.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const day = String(interviewDate.getDate()).padStart(2, '0');

    // Construct full date-time strings in "YYYY-MM-DDTHH:mm:ss" format
    const startDateTime = `${year}-${month}-${day}T${schedule.start_time}:00`;
    const endDateTime = `${year}-${month}-${day}T${schedule.end_time}:00`;

    return {
        start: {
            dateTime: startDateTime,
            timeZone: timeZone, // Example: 'Pacific Standard Time'
        },
        end: {
            dateTime: endDateTime,
            timeZone: timeZone,
        }
    };
}

export async function createInterview(request: FastifyRequest, reply: FastifyReply) {
    const traceId = generateCustomUUID();
    const { program_id } = request.params as { program_id: string };
    const data = request.body as JobInterviewData;
    let job = await JobModel.findOne({ where: { id: data.job_id, program_id } });
    const transaction = await sequelize.transaction();
    const user = request.user;
    const authHeader = request.headers.authorization;
    const token = authHeader?.split(" ")[1] ?? "";
    const userId = user?.sub;
    try {
        const processedData = { ...data, program_id, created_by: userId, updated_by: userId, created_on: Date.now(), updated_on: Date.now() };

        const holdStatuses = ["HOLD", "PENDING_REVIEW", "DRAFT", "FILLED", "CLOSED", "PENDING_APPROVAL", "REJECTED"];

        if (holdStatuses.includes(job?.status)) {
            reply.status(400).send({
                status_code: 400,
                message: `Job is currently on ${job?.status} interview cannot be scheduled.`,
                trace_id: traceId,
            });
            return;
        }

        let interview = await JobInterviewModel.findOne({
            where: {
                job_id: processedData.job_id,
                submit_candidate_id: processedData.submit_candidate_id,
            },
            order: [["revision", "DESC"]],
        });

        if (interview) {
            const validStatuses = [Status.ACCEPTED.toUpperCase(), Status.COMPLETED.toUpperCase()];
            if (!validStatuses.includes(interview?.status?.toUpperCase?.() as Status)) {
                reply.status(400).send({
                    status_code: 400,
                    message: `Existing Interview status is ${interview?.status}, cannot schedule a new interview.`,
                    trace_id: traceId,
                });
                return;
            }
        }

        const revision = interview ? interview.revision + 1 : 1;

        const newItem = await JobInterviewModel.create(
            { ...processedData, revision },
            { transaction }
        );

        const newData = {
            ...processedData,
            candidate_id: processedData.submit_candidate_id,
        };

        // Handle candidate history for the new interview
        const oldData = {};
        await candidateHistoryService.handleCandidateHistory({ program_id: processedData.program_id, oldData, newData, action: 'Interview Scheduled' });

        const candidate = await SubmissionCandidateModel.findOne({
            where: {
                candidate_id: processedData.submit_candidate_id,
                program_id: program_id,
                job_id: processedData.job_id
            },
            transaction,
        });

        if (interview && revision >= 2) {
            const oldData = { status: interview?.status || '', candidate_id: processedData?.submit_candidate_id, vendor_id: processedData?.vendor_id, job_id: processedData?.job_id, updated_by: userId, }
            const newData = { status: newItem?.status || "", candidate_id: processedData?.submit_candidate_id, vendor_id: processedData?.vendor_id, job_id: processedData?.job_id, updated_by: userId, };

            await candidateHistoryService.handleCandidateHistory({ program_id: processedData?.program_id, oldData, newData, action: "Next Round Scheduled" });
        }
        if (candidate && newItem.status.toUpperCase() !== 'DRAFT') {
            const oldstatus = '';
            await candidate.update(
                { status: "Interview Pending Acceptance" },
                { transaction }
            );
            const newStatus = candidate.dataValues.status || '';

            const oldData = { status: oldstatus, candidate_id: processedData?.submit_candidate_id, vendor_id: processedData?.vendor_id, job_id: processedData?.job_id, updated_by: userId, };
            const newData = { status: newStatus, candidate_id: processedData?.submit_candidate_id, vendor_id: processedData?.vendor_id, job_id: processedData?.job_id, updated_by: userId, };
            await candidateHistoryService.handleCandidateHistory({ program_id: processedData.program_id, oldData, newData, action: "Interview Pending Acceptance" });

        }

        interviewNotificationService.handleSchedulesInterviewNotification(user, token, processedData, newItem, program_id, job, traceId, logger);

        const slotUpdates = processedData.schedules.map((schedule) => ({
            interview_id: newItem.id,
            candidate_id: processedData.submit_candidate_id,
            interview_date: schedule.interview_date,
            start_time: schedule.start_time,
            end_time: schedule.end_time,
            duration: schedule.duration,
            status: "PENDING",
            is_propose: false,
        }));

        await InterviewSlots.bulkCreate(slotUpdates, {
            transaction,
            updateOnDuplicate: [
                "interview_date",
                "start_time",
                "end_time",
                "status",
                "is_propose",
            ],
        });

        if (
            Array.isArray(processedData.external_participant_emails) &&
            processedData.external_participant_emails.length > 0
        ) {
            const externalAttendeeUpdates =
                processedData.external_participant_emails.map((email) => ({
                    interview_id: newItem.id,
                    status: "pending",
                    is_interviewer: false,
                    is_external: true,
                    external_participant_email: email,
                }));

            await AdditionalAttendees.bulkCreate(externalAttendeeUpdates, {
                transaction,
                updateOnDuplicate: ["status"],
            });
        }

        if (processedData.review) {
            await InterviewFeedback.upsert(
                {
                    interview_id: newItem.id,
                    rating: processedData.review.rating,
                    outcome: processedData.review.outcome,
                    vendor_notes: processedData.review.vendor_notes,
                },
                { transaction }
            );
        }

        const interviewerUpdates = processedData.interviewers.map(
            (interviewer) => ({
                interview_id: newItem.id,
                participant_id: interviewer,
                status: "pending",
                is_interviewer: true,
                is_external: false,
            })
        );

        await AdditionalAttendees.bulkCreate(interviewerUpdates, {
            transaction,
            updateOnDuplicate: ["status"],
        });

        if (
            Array.isArray(processedData.additional_participants) &&
            processedData.additional_participants.length > 0
        ) {
            const additionalParticipantUpdates =
                processedData.additional_participants.map((attendeeId) => ({
                    interview_id: newItem.id,
                    participant_id: attendeeId,
                    is_external: false,
                    is_interviewer: false,
                    status: "pending",
                }));

            await AdditionalAttendees.bulkCreate(additionalParticipantUpdates, {
                transaction,
                updateOnDuplicate: ["status"],
            });
        }

        if (
            Array.isArray(processedData.custom_fields) &&
            processedData.custom_fields.length > 0
        ) {
            const customFieldUpdates = processedData.custom_fields.map(
                (customField) => ({
                    interview_id: newItem.id,
                    custom_field_id: customField.id,
                    value: customField.value,
                })
            );

            await InterviewCustomFields.bulkCreate(customFieldUpdates, {
                transaction,
                updateOnDuplicate: ["value"],
            });
        }


        // get microsoft outlook token and validate  if expired generate again
        await handleOutlookIntegration(data, traceId, logger, newItem, processedData, program_id);

        await transaction?.commit();

        reply.status(201).send({
            status_code: 201,
            message: "Interview scheduled successfully!",
            id: newItem?.id,
            trace_id: traceId
        });

    } catch (error: any) {
        if (transaction) {
            await transaction.rollback();
        }

        logger({
            traceId,
            eventname: "Interview Creation Failed",
            status: "error",
            description: `Error occurred while creating the interview for program ${program_id}: ${error.message}`,
            level: "error",
            action: request.method,
            url: request.url,
            error: error.message,
        });

        if (error.name === "SequelizeUniqueConstraintError") {
            const field = error.errors[0].path;
            return reply.status(400).send({
                status_code: 400,
                trace_id: traceId,
                message: `${field} already in use!`,
            });
        }

        return reply.status(500).send({
            status_code: 500,
            trace_id: traceId,
            message: "Failed To Create Data",
            error: error.message,
        });
    }
}

export async function handleOutlookIntegration(data: any, traceId: any, logger: any, newItem: any, processedData: any, program_id: string) {
    if (data.enable_outlook) {
        let new_access_Token;

        try {
            const newToken = await refreshAccessToken(data.refresh_token, config.outlook_secret_id, config.outlook_secret_value);
            new_access_Token = newToken.accessToken;

            let interviewerDetails: any = (await getInterviewCreator(newItem.dataValues.id))[0];
            let vendorDetails: any = await getProgramVendorsEmail(processedData.program_id);

            vendorDetails = Array.isArray(vendorDetails) ? vendorDetails : vendorDetails ? [vendorDetails] : [];

            let outlook_attendees = [];

            if (interviewerDetails?.email) {
                outlook_attendees.push({
                    emailAddress: {
                        address: interviewerDetails.email,
                    },
                    type: "required"
                });
            }

            vendorDetails.forEach((vendor: any) => {
                if (vendor.email) {
                    outlook_attendees.push({
                        emailAddress: {
                            address: vendor.email
                        },
                        type: "optional"
                    });
                }
            });


            const event_title: string = data.title;

            if (!data?.schedules || data.schedules.length === 0) {
                console.error("Schedules array is missing or empty");
                throw new Error("Invalid schedule data");
            }


            console.log("Raw Schedule Data:", data?.schedules[0]);

            const startDateTime = formatOutlookSchedule(data?.schedules[0], "UTC");
            const endDateTime = formatOutlookSchedule(data?.schedules[0], "UTC");

            console.log("Formatted Start DateTime----------------> ", startDateTime);
            console.log("Formatted End DateTime -----------------> ", endDateTime);

            const outlook_event = {
                subject: event_title,
                start: startDateTime?.start,
                end: endDateTime?.end,
                attendees: outlook_attendees,
                isOnlineMeeting: true,
                onlineMeetingProvider: "teamsForBusiness",
            };


            console.log("Outlook Event Object:", JSON.stringify(outlook_event, null, 2));
            console.log("Outlook Attendees:", JSON.stringify(outlook_attendees, null, 2));

            const outlookEventResponse = await axios.post(
                URLs.MICROSOFT_GRAPH_EVENTS,
                outlook_event,
                {
                    headers: {
                        Authorization: `Bearer ${new_access_Token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );


            const user_Id: string = data.user_id;
            const final_refresh_token = encryptToken(data.refresh_token);

            console.log("Creating record with values:----------> ", {
                event_id: outlookEventResponse.data.id,
                refresh_token: final_refresh_token,
                user_id: user_Id,
                interview_id: newItem.id,
            });


            try {
                await sequelize.transaction(async (t) => {
                    try {
                        await OutlookCalendarEventModel.create({
                            event_id: outlookEventResponse.data.id,
                            refresh_token: final_refresh_token,
                            user_id: user_Id,
                            interview_id: newItem.id
                        }, { transaction: t });

                    } catch (txErr) {
                        console.error("Transaction error:", txErr);
                        throw txErr;
                    }
                });
            } catch (error: any) {
                console.error("Outer error in handleOutlookIntegration:", error.message);
                console.error("Full error stack:", error.stack);
                return { success: false, message: error.message };
            }


            logger({
                traceId,
                eventname: "Outlook Interview Scheduled Successfully",
                status: "info",
                description: `Outlook Interview scheduled successfully for program ${program_id} with ID ${newItem.id}`,
                level: "info",
                url: URLs.MICROSOFT_GRAPH_EVENTS,
                data: outlookEventResponse.data,
            });

            return { success: true };


        } catch (error: any) {
            console.error("Error validating token:", error.message);
            if (error.response) {
                console.error("Response Data:", error.response.data);
            }
            return { success: false, message: error.message }; // Return failure message
        }
    }
}

async function acceptInterview(transaction: any, Data: JobInterviewData, interview: JobInterviewModel, userId: string, userType: string) {
    const { accepted_schedule_ids, candidate_phone, vendor_notes } = Data;
    const { id: interviewId, submit_candidate_id, program_id, job_id } = interview;
    const currentTimestamp = Date.now();
    const { id, ...restData } = interview.dataValues;
    const oldData = {
        ...restData,
        candidate_id: interview.dataValues.submit_candidate_id,
        status: interview.dataValues.status,
        updated_by: userId,
    };

    const updateOperations = [
        InterviewSlots.update(
            { status: "ACCEPTED", accepted_date: currentTimestamp },
            {
                where: { id: { [Op.in]: accepted_schedule_ids } },
                transaction,
            }
        ),

        AdditionalAttendees.update(
            {
                status: "Accepted",
                accepted_schedule_id: accepted_schedule_ids?.[0],
                candidate_phone
            },
            {
                where: { interview_id: interviewId },
                transaction,
            }
        ),

        interview.update(
            {
                status: "ACCEPTED",
                updated_by: userId,
                ...(userType === 'vendor' && vendor_notes ? { vendor_notes: vendor_notes } : { interview_notes: vendor_notes })
            },
            transaction
        )
    ];

    const interviews = await JobInterviewModel.findAll({
        where: { program_id, job_id, submit_candidate_id, id: { [Op.ne]: interviewId } },
        attributes: ['status']
    });

    const interviewStatuses = interviews.map(interview => interview.status);

    const revision = interview.dataValues.revision > 1;

    if (revision) {
        if (!interviewStatuses.includes("PENDING_ACCEPTANCE") && !interviewStatuses.includes("PENDING_CONFIRMATION")) {
            updateOperations.push(
                SubmissionCandidateModel.update(
                    { status: "Interview Accepted" },
                    {
                        where: {
                            candidate_id: submit_candidate_id,
                            program_id,
                            job_id
                        },
                        transaction,
                    }
                )
            );
        }
    } else {
        updateOperations.push(
            SubmissionCandidateModel.update(
                { status: "Interview Accepted" },
                {
                    where: {
                        candidate_id: submit_candidate_id,
                        program_id,
                        job_id
                    },
                    transaction,
                }
            )
        );
    }

    updateOperations.push(
        InterviewSlots.update(
            { status: "DECLINED" },
            {
                where: {
                    id: { [Op.notIn]: accepted_schedule_ids },
                    interview_id: interviewId,
                },
                transaction,
            }
        )
    );

    if (vendor_notes) {
        updateOperations.push(
            InterviewFeedback.update(
                { vendor_notes },
                {
                    where: { interview_id: interviewId },
                    transaction,
                }
            )
        );
    }

    await Promise.all(updateOperations);
    const newData = {
        ...restData,
        status: "ACCEPTED",
        updated_by: userId,
        candidate_id: interview.dataValues.submit_candidate_id,
        ...(userType === 'vendor' && vendor_notes ? { vendor_notes: vendor_notes } : { interview_notes: vendor_notes })
    };
    await candidateHistoryService.handleCandidateHistory({ program_id, oldData, newData, action: "Interview Accepted", });

}

async function createReview(transaction: any, interview: JobInterviewModel, Data: JobInterviewData, userId: string) {
    try {
        const { id, ...restData } = interview.dataValues;

        const oldData = {
            ...restData,
            candidate_id: interview.submit_candidate_id,
            modified_by: null
        };

        const feedbackCreation = InterviewFeedback.create(
            {
                interview_id: interview.id,
                outcome: Data.review?.outcome,
                vendor_notes: Data.review?.vendor_notes,
                rating: Data.review?.rating,
            },
            { transaction }
        );

        const interviews = await JobInterviewModel.findAll({
            where: {
                program_id: interview.program_id,
                job_id: interview.job_id,
                submit_candidate_id: interview.submit_candidate_id,
                id: { [Op.ne]: interview.id }
            },
            attributes: ['status']
        });

        const interviewStatuses = interviews.map(interview => interview.status);

        if (interviewStatuses.some(status => status?.toUpperCase() === Status.COMPLETED?.toUpperCase())) {
            throw new Error("For this candidate interview already marked as completed");
        }

        const submissionUpdate = SubmissionCandidateModel.update(
                { status: Status.INTERVIEW_COMPLETED },
                {
                    where: {
                        candidate_id: interview.submit_candidate_id,
                        program_id: interview.program_id,
                        job_id: interview.job_id,
                    },
                    transaction,
                }
            );

        const interviewUpdate = interview.update(
            { status: "COMPLETED", updated_by: userId },
            { transaction }
        );

        const newData = {
            ...restData,
            status: "COMPLETED",
            candidate_id: interview.submit_candidate_id,
            outcome: Data.review?.outcome,
            vendor_notes: Data.review?.vendor_notes,
            rating: Data.review?.rating,
            // modified_by: Data.modified_by
        };
        await candidateHistoryService.handleCandidateHistory({ program_id: interview.program_id, oldData, newData, action: "Interview Completed", });

        await Promise.all([feedbackCreation, submissionUpdate, interviewUpdate]);

    } catch (error: any) {
        throw new Error(error.message);
    }
}

async function cancelInterview(transaction: any, Data: JobInterviewData, interview: JobInterviewModel, userId: string) {
    const { id, ...restData } = interview.dataValues;
    const oldData = {
        ...restData,
        candidate_id: interview.submit_candidate_id,
    };
    await interview.update(
        {
            status: "CANCELLED",
            interview_cancel_reason: Data.interview_cancel_reason,
            updated_by: userId
        },
        {
            where: {
                id: interview.id,
            },
            transaction,
        }
    );

    const interviews = await JobInterviewModel.findAll({
        where: {
            program_id: interview.program_id,
            job_id: interview.job_id,
            submit_candidate_id: interview.submit_candidate_id,
            id: { [Op.ne]: interview.id }
        },
        attributes: ['status']
    });

    const interviewStatuses = interviews.map(interview => interview.status);

    const noUpdateStatuses = [
        "PENDING_ACCEPTANCE",
        "PENDING_CONFIRMATION",
        "ACCEPTED",
        "COMPLETED",
        "REJECTED"
    ];

    const revision = interview.dataValues.revision > 1;

    if (revision) {
        if (!noUpdateStatuses.some(status => interviewStatuses.includes(status))) {
            await SubmissionCandidateModel.update(
                { status: "Interview Cancelled" },
                {
                    where: {
                        candidate_id: interview.submit_candidate_id,
                        program_id: interview.program_id,
                        job_id: interview.job_id
                    },
                    transaction,
                }
            );
        }
    } else {
        await SubmissionCandidateModel.update(
            { status: "Interview Cancelled" },
            {
                where: {
                    candidate_id: interview.submit_candidate_id,
                    program_id: interview.program_id,
                    job_id: interview.job_id
                },
                transaction,
            }
        );
    }

    await InterviewSlots.update(
        { status: "CANCELLED" },
        {
            where: {
                interview_id: {
                    [Op.in]: [interview.id],
                },
            },
            transaction,
        }
    );

    const newData = {
        ...restData,
        status: "CANCELLED",
        reason: Data.interview_cancel_reason,
        candidate_id: interview.submit_candidate_id,
        // interview_notes: Data.notes,
    }
    await candidateHistoryService.handleCandidateHistory({ program_id: interview.program_id, oldData, newData, action: "Interview Cancelled", });

    const traceId = generateCustomUUID();

    if (Data.enable_outlook) {
        const outlookEvent = await OutlookCalendarEventModel.findOne({
            where: { interview_id: interview.id },
        });

        if (outlookEvent && outlookEvent.event_id) {
            await cancelOutlookEvent({
                interviewId: interview.id,
                event_id: outlookEvent.event_id,
                refresh_token: outlookEvent.refresh_token,
                user_id: outlookEvent.user_id,
                traceId,
                logger,
            });
        }
    }
    return { oldData, newData };
}


async function cancelOutlookEvent({
    interviewId,
    event_id,
    refresh_token,
    user_id,
    traceId,
    logger,
}: {
    interviewId: string;
    event_id: string;
    refresh_token: string;
    user_id: string;
    traceId: any;
    logger: any;
}) {
    try {
        // 1. Decrypt the refresh token
        const decryptedRefreshToken = decryptToken(refresh_token);

        // 2. Get a new Access Token
        const newTokens = await refreshAccessToken(
            decryptedRefreshToken,
            config.outlook_secret_id,
            config.outlook_secret_value
        );
        const accessToken = newTokens.accessToken;

        // 3. Delete the event using Microsoft Graph
        await axios.delete(
            `${URLs.MICROSOFT_GRAPH_EVENTS}/${event_id}`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log(`Deleted Outlook event: ${event_id}`);

        // 4. Clean up: Remove the event record from the database
        await OutlookCalendarEventModel.destroy({
            where: { interview_id: interviewId },
        });

        // 5. Logging
        logger({
            traceId,
            eventname: "Outlook Interview Cancelled",
            status: "info",
            description: `Outlook interview cancelled successfully for user ${user_id}`,
            level: "info",
            url: `${URLs.MICROSOFT_GRAPH_EVENTS}/${event_id}`,
        });

        return { success: true };

    } catch (error: any) {
        console.error("Error cancelling Outlook event:", error.message);
        if (error.response) {
            console.error("Response Data:", error.response.data);
        }
        return { success: false, message: error.message };
    }
}

async function proposeNewSlots(transaction: any, Data: JobInterviewData, interview: JobInterviewModel, userId: string, userType: any) {
    if (Array.isArray(Data.schedules) && Data.schedules.length > 0) {
        const schedules = Data.schedules.map((schedule) => ({
            interview_id: interview.id,
            candidate_id: interview.submit_candidate_id,
            interview_date: schedule.interview_date,
            start_time: schedule.start_time,
            end_time: schedule.end_time,
            duration: schedule.duration,
            status: "Pending",
            is_propose: true,
        }));

        try {
            await InterviewSlots.bulkCreate(schedules, {
                transaction,
            });
        } catch (error) {
            console.error("Error Creating Records:", error);
        }
    }

    await InterviewSlots.update(
        { status: "REJECTED" },
        {
            where: {
                interview_id: {
                    [Op.in]: [interview.id],
                },
                is_propose: false,
            },
            transaction,
        }
    );

    const oldStatus = interview.status;
    let interviewStatus;
    let submissionStatus;

    if (userType == "super_user" && oldStatus == "PENDING_ACCEPTANCE") {
        interviewStatus = "PENDING_CONFIRMATION";
        submissionStatus = "Interview Pending Confirmation";
    } else {
        interviewStatus = userType === "vendor" ? "PENDING_CONFIRMATION" : "PENDING_ACCEPTANCE";
        submissionStatus = userType === "vendor" ? "Interview Pending Confirmation" : "Interview Pending Acceptance";
    }

    await interview.update(
        {
            status: interviewStatus,
            updated_by: userId, vendor_notes: Data.vendor_notes
        },
        {
            where: {
                id: interview.id,
            },
            transaction,
        }
    );

    const interviews = await JobInterviewModel.findAll({
        where: {
            program_id: interview.program_id,
            job_id: interview.job_id,
            submit_candidate_id: interview.submit_candidate_id,
            id: { [Op.ne]: interview.id }
        },
        attributes: ['status']
    });

    const interviewStatuses = interviews.map(interview => interview.status);
    const revision = interview.dataValues.revision > 1;

    if (revision) {
        if (!interviewStatuses.includes("PENDING_CONFIRMATION")) {
            await SubmissionCandidateModel.update(
                {
                    status: submissionStatus,
                },
                {
                    where: {
                        candidate_id: interview.submit_candidate_id,
                        program_id: interview.program_id,
                        job_id: interview.job_id
                    },
                    transaction,
                }
            );
        }
    } else {
        await SubmissionCandidateModel.update(
            {
                status: submissionStatus,
            },
            {
                where: {
                    candidate_id: interview.submit_candidate_id,
                    program_id: interview.program_id,
                    job_id: interview.job_id
                },
                transaction,
            }
        );
    }

    const oldData = {
        status: oldStatus,
        candidate_id: interview.submit_candidate_id,
        job_id: interview?.job_id,
        updated_by: userId,
    };

    const newData = {
        status: userType === "vendor" ? "PENDING_CONFIRMATION" : "PENDING_ACCEPTANCE",
        candidate_id: interview.submit_candidate_id,
        job_id: interview?.job_id,
        updated_by: userId,
    };

    await candidateHistoryService.handleCandidateHistory({ program_id: interview?.program_id, oldData, newData, action: submissionStatus });
}

async function resheduledInterview(transaction: any, Data: JobInterviewData, interview: JobInterviewModel, userId: string, enable_outlook: boolean, access_token: string, interview_id: string) {
    const candidateId = interview?.submit_candidate_id;
    const programId = interview?.program_id;
    const oldData = {
        interview_date: interview?.dataValues?.schedules?.[0]?.interview_date ?? null,
        start_time: interview?.dataValues?.schedules?.[0]?.start_time ?? null,
        end_time: interview?.dataValues?.schedules?.[0]?.end_time ?? null,
        status: interview?.dataValues?.status,
        candidate_id: candidateId,
        job_id: interview?.dataValues?.job_id,
        updated_by: interview?.dataValues?.updated_by,
    };

    await interview.update({ ...Data, status: "PENDING_ACCEPTANCE", updated_by: userId }, { transaction });
    if (Data.schedules) {
        await InterviewSlots.destroy({
            where: { interview_id: interview.id },
            transaction,
        });
        await Promise.all(
            Data.schedules.map((schedule) =>
                InterviewSlots.upsert(
                    {
                        interview_date: schedule.interview_date,
                        start_time: schedule.start_time,
                        end_time: schedule.end_time,
                        duration: schedule.duration,
                        status: "PENDING",
                        interview_id: interview.id,
                        is_propose: false
                    },
                    { transaction }
                )
            )
        );
    }

    if (Array.isArray(Data.interviewers)) {
        await AdditionalAttendees.destroy({
            where: { interview_id: interview.id, is_interviewer: true },
            transaction,
        });
        const interviewerUpdates = Data.interviewers?.map(
            (interviewer) => ({
                interview_id: interview.id,
                participant_id: interviewer,
                status: "pending",
                is_interviewer: true,
                is_external: false,
            })
        );
        await AdditionalAttendees.bulkCreate(interviewerUpdates, { transaction });

    }

    if (Array.isArray(Data.additional_participants)) {
        await AdditionalAttendees.destroy({
            where: { interview_id: interview.id, is_interviewer: false },
            transaction,
        });
        const additionalParticipantUpdates =
            Data.additional_participants?.map((attendeeId) => ({
                interview_id: interview.id,
                participant_id: attendeeId,
                is_external: false,
                is_interviewer: false,
                status: "pending",
            }));

        await AdditionalAttendees.bulkCreate(additionalParticipantUpdates, {
            transaction
        });
    }

    if (Array.isArray(Data.custom_fields)) {

        await InterviewCustomFields.destroy({
            where: { interview_id: interview.id },
            transaction,
        });

        const customFieldUpdates = Data.custom_fields?.map(
            (customField) => ({
                interview_id: interview.id,
                custom_field_id: customField.id,
                value: customField.value,
            })
        );

        await InterviewCustomFields.bulkCreate(customFieldUpdates, { transaction });
    }

    if (Array.isArray(Data.external_participant_emails)) {
        await AdditionalAttendees.destroy({
            where: { interview_id: interview.id, is_external: true },
            transaction,
        });

        const externalAttendeeUpdates =
            Data.external_participant_emails.map((email) => ({
                interview_id: interview.id,
                status: "pending",
                is_interviewer: false,
                is_external: true,
                external_participant_email: email,
            }));

        await AdditionalAttendees.bulkCreate(externalAttendeeUpdates, {
            transaction,
            updateOnDuplicate: ["status"],
        });
    }

    const interviews = await JobInterviewModel.findAll({
        where: {
            program_id: interview.program_id,
            job_id: interview.job_id,
            submit_candidate_id: interview.submit_candidate_id,
            id: { [Op.ne]: interview.id }
        },
        attributes: ['status']
    });

    const interviewStatuses = interviews.map(interview => interview.status);
    const revision = interview.dataValues.revision > 1;

    if (revision) {
        if (!interviewStatuses.includes("PENDING_CONFIRMATION")) {
            await SubmissionCandidateModel.update(
                { status: "Interview Pending Acceptance" },
                {
                    where: {
                        candidate_id: interview.submit_candidate_id,
                        program_id: interview.program_id,
                        job_id: interview.job_id
                    },
                    transaction,
                }
            );
        }
    } else {
        await SubmissionCandidateModel.update(
            { status: "Interview Pending Acceptance" },
            {
                where: {
                    candidate_id: interview.submit_candidate_id,
                    program_id: interview.program_id,
                    job_id: interview.job_id
                },
                transaction,
            }
        );
    }

    if (enable_outlook) {
        await handleOutlookEventRescheduling(interview_id, Data, access_token, interview, transaction);
    }

    const newData = {
        interview_date: Data?.schedules?.[0]?.interview_date ?? null,
        start_time: Data?.schedules?.[0]?.start_time ?? null,
        end_time: Data?.schedules?.[0]?.end_time ?? null,
        status: "RESHEDULED",
        candidate_id: candidateId,
        job_id: interview?.dataValues?.job_id,
        updated_by: userId,
    };
    await candidateHistoryService.handleCandidateHistory({ program_id: programId, oldData, newData, action: "Interview Rescheduled", });
}

async function handleOutlookEventRescheduling(
    interview_id: string,
    JobData: JobInterviewData,
    access_token: string,
    interview: JobInterviewModel,
    transaction: any
) {
    const outlook_event = await OutlookCalendarEventModel.findOne({ where: { interview_id } });

    let interviewerDetails: any = (await getInterviewCreator(interview_id));
    let outlook_attendees = [];

    if (interviewerDetails?.email) {
        outlook_attendees.push({
            emailAddress: {
                address: interviewerDetails.email,
            },
            type: "required"
        });
    }

    if (!outlook_event) {
        return console.error("Event Id not found");
    }
    const event_id = outlook_event.event_id;
    const schedule = JobData?.schedules[0];
    const formattedSchedule = formatOutlookSchedule(schedule, "UTC");
    const startDateTime = formattedSchedule?.start;
    const endDateTime = formattedSchedule?.end;

    const outlook_body_event = {
        subject: JobData.title,
        start: startDateTime,
        end: endDateTime,
        attendees: outlook_attendees,
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness",
    };

    await axios.patch(
        `${URLs.MICROSOFT_GRAPH_EVENTS}/${event_id}`,
        outlook_body_event,
        {
            headers: {
                Authorization: `Bearer ${access_token}`,
                "Content-Type": "application/json",
            },
        }
    );
}

export async function getJobManagerEmail(sequelize: any, jobManagerId: string): Promise<EmailRecipient | null> {
    const result: any[] = await sequelize.query(
        `SELECT user.email,
                user.first_name,
                user.middle_name,
                user.last_name,
                user.user_type
         FROM ${sourcing_db}.user AS user
         WHERE user.id = :job_manager_id;`,
        {
            replacements: { job_manager_id: jobManagerId },
            type: QueryTypes.SELECT
        }
    );

    if (result.length > 0) {
        const user = result[0]; // Assuming only one job manager is returned
        const emailRecipient: EmailRecipient = {
            email: user.email || null,
            first_name: user.first_name || null,
            middle_name: user.middle_name || null,
            last_name: user.last_name || null,
            userType: user.user_type || null
        };

        return emailRecipient;
    }

    return null;
}

export async function updateInterview(request: FastifyRequest, reply: FastifyReply) {
    const { program_id, id } = request.params as { program_id: string, id: string };
    const Data = request.body as JobInterviewData;
    const traceId = generateCustomUUID();
    const user = request.user;
    const userId = user?.sub;
    const authHeader = request.headers.authorization;
    const token = authHeader?.split(" ")[1] ?? "";
    const transaction = await JobInterviewModel.sequelize?.transaction();
    const userData = await offerRepository.findUser(program_id, userId);
    if (!userData || userData.length === 0) {
        await transaction?.rollback();
        return reply.status(400).send({
            status_code: 400,
            trace_id:traceId,
            message: "User not found",
        });
    }
    let userType = user?.userType ?? userData[0]?.user_type ?? "";
    const tenantId=userData[0]?.tenant_id
    let vendorId;
    if (userType === "vendor") {
    const vendor = await jobRepository.findVendor(program_id, tenantId);
        vendorId = vendor?.[0]?.id;
        if (!vendorId) {
            await transaction?.rollback();
            return reply.status(400).send({
                status_code: 400,
                message: "Vendor not found.",
                trace_id:traceId,
            });
        }
    }

    try {

        const interview = await JobInterviewModel.findOne({ where: { program_id, id } });
        const interviewStatus = interview?.status;
        if (interview) {
            const job = await JobModel.findOne({ where: { id: interview.job_id, program_id } });
            const holdStatuses = ["HOLD", "PENDING_REVIEW", "DRAFT", "FILLED", "CLOSED", "PENDING_APPROVAL", "REJECTED"];
        if(userType==='vendor'){
            const distribution = await JobDistributionModel.findOne({
                where: { job_id: interview.job_id,vendor_id:vendorId, program_id },
            });
            if (userType === 'vendor' && ['HOLD', 'HALT'].includes(distribution?.status.toUpperCase() ?? '')) {
                await transaction?.rollback();
                return reply.status(400).send({
                    status_code: 400,
                    message: `Job is currently on '${distribution?.status},interview cannot be updated.`,
                    trace_id: traceId,
                });
            }
        }
            if (holdStatuses.includes(job?.status)) {
                await transaction?.rollback();
                return reply.status(400).send({
                    status_code: 400,
                    message: `Job is currently on ${job?.status}, interview cannot be updated.`,
                    trace_id: traceId,
                });
            }

            if (Data.status?.toUpperCase() === "ACCEPTED") {
                if (interview.status?.toUpperCase() === Data.status?.toUpperCase()) {
                    await transaction?.rollback();
                    return reply.status(200).send({
                        trace_id: traceId,
                        message: "Interview has already been accepted.",
                    });
                }
                await acceptInterview(transaction, Data, interview, userId, userType);
                interviewNotificationService.processInterview(interview, user, token, traceId, sequelize, reply);
            }

            if (Data.status?.toLocaleUpperCase() === "COMPLETED" && Data.review) {
                if (interview.status?.toUpperCase() === Data.status?.toUpperCase()) {
                    await transaction?.rollback();
                    return reply.status(200).send({
                        trace_id: traceId,
                        message: "Interview has already been completed.",
                    });
                }
                await createReview(transaction, interview, Data, userId);
                if (Data.status?.toLocaleUpperCase() === "COMPLETED") {
                    interviewNotificationService.processInterviewCompletion(interview, user, token, traceId, sequelize, reply);
                }
            }

            if (Data.status?.toUpperCase() === "CANCELLED" && Data.interview_cancel_reason) {
                if (interview.status?.toUpperCase() === Data.status?.toUpperCase()) {
                    await transaction?.rollback();
                    return reply.status(200).send({
                        trace_id: traceId,
                        message: "Interview has already been cancelled.",
                    });
                }
                await cancelInterview(transaction, Data, interview, userId);
                interviewNotificationService.processInterviewCancellation(interview, user, token, traceId, sequelize, Data, reply);
            }

            if (Data.status?.toUpperCase() === "RESHEDULED_INTERVIEW") {

                if (interview.status?.toUpperCase() === Data.status?.toUpperCase()) {
                    await transaction?.rollback();
                    return reply.status(200).send({
                        trace_id: traceId,
                        message: "Interview has already been rescheduled.",
                    });
                }

                await resheduledInterview(transaction, Data, interview, userId,
                    Data.enable_outlook, Data.ms_token, id);

                if (Data?.schedules?.[0]?.is_propose === true) {
                    const eventCode = NotificationEventCode.INTERVIEW_NEW_TIME_PROPOSED
                    interviewNotificationService.handleInterviewRescheduleNotification(interview, user, token, traceId, sequelize, reply, eventCode, Data);
                } else if (Data?.schedules[0]?.interview_date && Data?.schedules[0]?.start_time) {
                    const eventCode = NotificationEventCode.INTERVIEW_RESCHEDULE_WITH_DATE_TIME
                    interviewNotificationService.handleInterviewRescheduleNotification(interview, user, token, traceId, sequelize, reply, eventCode, Data);
                }
            }

            if (Data.schedules && Data.status?.toUpperCase() == "PENDING_ACCEPTANCE") {
                const { id, ...rest } = interview.dataValues;
                const oldData = {
                    ...rest,
                    candidate_id: interview.dataValues.submit_candidate_id,
                };

                const newData = {
                    ...Data,
                    candidate_id: Data.submit_candidate_id,
                };
                await proposeNewSlots(transaction, Data, interview, userId, userType);
                await candidateHistoryService.handleCandidateHistory({ program_id, oldData, newData, action: 'Interview Pending Acceptance' });
                if (Data?.schedules?.[0]?.is_propose === true) {
                    const eventCode = NotificationEventCode.INTERVIEW_NEW_TIME_PROPOSED
                    interviewNotificationService.handleInterviewRescheduleNotification(interview, user, token, traceId, sequelize, reply, eventCode, Data);
                } else if (Data?.schedules[0]?.interview_date && Data?.schedules[0]?.start_time) {
                    const eventCode = NotificationEventCode.INTERVIEW_RESCHEDULE_WITH_DATE_TIME
                    interviewNotificationService.handleInterviewRescheduleNotification(interview, user, token, traceId, sequelize, reply, eventCode, Data);
                }
            }

            if (Data.schedules && Data.status?.toUpperCase() == "PENDING_CONFIRMATION") {
                const { id, ...rest } = interview.dataValues;
                const oldData = {
                    ...rest,
                    candidate_id: interview.dataValues.submit_candidate_id,
                };

                const newData = {
                    ...Data,
                    candidate_id: Data.submit_candidate_id,
                };
                await proposeNewSlots(transaction, Data, interview, userId, userType);
                await candidateHistoryService.handleCandidateHistory({ program_id, oldData, newData, action: 'Interview Pending Acceptance' });
                if (Data?.schedules?.[0]?.is_propose === true) {
                    const eventCode = NotificationEventCode.INTERVIEW_NEW_TIME_PROPOSED
                    interviewNotificationService.handleInterviewRescheduleNotification(interview, user, token, traceId, sequelize, reply, eventCode, Data);
                } else if (Data?.schedules[0]?.interview_date && Data?.schedules[0]?.start_time) {
                    const eventCode = NotificationEventCode.INTERVIEW_RESCHEDULE_WITH_DATE_TIME
                    interviewNotificationService.handleInterviewRescheduleNotification(interview, user, token, traceId, sequelize, reply, eventCode, Data);
                }
            }

            if(interviewStatus == "PENDING_CONFIRMATION" && Data?.status?.toUpperCase() === "ACCEPTED"){
               if (Data?.accepted_schedule_ids){
                   const eventCode = NotificationEventCode.INTERVIEW_CONFIRMED;
                   interviewNotificationService.handleInterviewConfirmNotification(interview, user, token, traceId, sequelize, reply, eventCode)                   
              }
            }


            await transaction?.commit();

            reply.status(200).send({
                status_code: 200,
                trace_id: traceId,
                message: "Interview updated successfully!",
                id: id,
            });
        } else {
            reply.status(200).send({
                status_code: 200,
                trace_id: traceId,
                message: "Interview Not Found",
                data: [],
            });
        }
    } catch (error: any) {
        await transaction?.rollback();
        console.error(`trace_id: ${traceId}, Error: `, error);
        reply.status(500).send({
            status_code: 500,
            trace_id: traceId,
            message: "Internal Server Error",
            error: error.message,
        });
    }
}

export async function deleteInterview(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const { id } = request.params as { id: string };
    const traceId = generateCustomUUID();
    try {
        const field = await JobInterviewModel.findByPk(id);
        if (field) {
            await field.update({ is_deleted: true });
            reply.status(200).send({
                status_code: 200,
                trace_id: traceId,
                message: "Job Interview Deleted Successfully",
                id: id,
            });
        } else {
            reply.status(200).send({
                status_code: 404,
                trace_id: traceId,
                message: "Job Interview Not Found",
                data: [],
            });
        }
    } catch (error) {
        console.error(`trace_id : ${traceId}, Error : `, error);
        reply.status(500).send({
            status_code: 500,
            trace_id: traceId,
            message: "Internal Server Error",
        });
    }
}

export async function getInterviewApprovalRequest(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const { program_id, tenant_id, job_id } = request.params as {
        program_id: string;
        tenant_id: string;
        job_id: string;
    };

    try {
        // Fetch records with matching program_id, tenant_id, and job_id
        const records = await InterviewSlots.findAll({
            where: {
                program_id,
                tenant_id,
                job_id,
            },
            // Fetch the 'slots' array along with other relevant fields
            attributes: ["id", "program_id", "tenant_id", "slot"],
        });
        console.log(records);

        // Filter records to include only those where all slots have a 'pending' status
        const filteredRecords = records.filter((record) =>
            record.dataValues.slot.every((slot: any) => slot.status === "pending")
        );

        // If no records match the criteria, return an empty array
        if (filteredRecords.length === 0) {
            return reply.code(200).send({ slots: [] });
        }

        // Format response data if records with all pending slots are found
        const response = {
            slots: filteredRecords.map((record) => ({
                id: record.id,
                program_id: record.dataValues.program_id,
                tenant_id: record.dataValues.tenant_id,
                job_id: record.dataValues.job_id,
                slots: record.dataValues.slot.map((slot: any) => ({
                    interview_date: slot.interview_date,
                    start_time: slot.start_time,
                    end_time: slot.end_time,
                    duration: slot.duration,
                    status: slot.status,
                })),
            })),
        };

        return reply.code(200).send(response);
    } catch (error) {
        console.error(error);
        return reply.code(500).send({
            status_code: 500,
            error: "An error occurred while fetching interview slots.",
        });
    }
}

export async function getInterviewsForCandidate(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const { program_id } = request.params as { program_id: string };
    const { candidate_id, job_id } = request.query as {
        candidate_id?: string;
        job_id?: string;
    };

    const traceId = generateCustomUUID();
    const authHeader = request.headers.authorization;

    // Validate if mandatory queries are present
    if (!candidate_id || !job_id) {
        return reply.status(400).send({
            status_code: 400,
            trace_id: traceId,
            message: "candidate_id and job_id are required query parameters.",
        });
    }

    try {
        const user = request?.user;
        const userId = user?.sub;

        const userData = await offerRepository.findUser(program_id, userId);
        const userType = user?.userType ?? userData[0]?.user_type ?? "";

        const user_type = userData[0]?.user_type?.toLowerCase();
        let interviews = await interviewRepository.getInterviewsForCandidate(
            job_id,
            candidate_id,
            program_id
        );
        if (userType === "vendor" || user_type === "vendor") {
            interviews = interviews.filter(
                (interview: any) =>
                    !["DRAFT"].includes(
                        interview.status?.toUpperCase()
                    )
            );

            if (!interviews.length) {
                return reply.status(200).send({
                    trace_id: traceId,
                    message: "Interview is in draft status",
                    offer: [],
                });
            }
        }

        if (!interviews.length) {
            return reply.status(200).send({
                status_code: 200,
                trace_id: traceId,
                message: "No interviews found for the given candidate and job.",
            });
        }

         const interviewData = await Promise.all(
            interviews.map(async (interview: any) => {
                const [rows] = await sequelize.query(
                    getCustomsField(
                        interview.id,
                        "interview_custom_fields",
                        "interview_id",
                        "custom_field_id"
                    ),
                    {
                        replacements: { id: interview.id },
                    }
                ) as any;

                const customFields = (rows[0]?.custom_fields || []).sort((a: any, b: any) => a.seq_number - b.seq_number).map((field: any) => ({
                    ...field,
                    value: parseValue(field.value),
                }));

                const actions = await getInterviewActionFlags({ interview, userType });

                return {
                    ...interview,
                    custom_fields: customFields,
                    action_flags: actions,
                };
            })
        );

        return reply.status(200).send({
            status_code: 200,
            trace_id: traceId,
            interviews: interviewData,
        });
    } catch (error: any) {
        console.error(error);
        return reply.status(500).send({
            status_code: 500,
            trace_id: traceId,
            message: "An error occurred while fetching interviews.",
            error: error.message,
        });
    }
}

export async function getInterviewersAvailability(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<{ status_code: number; trace_id: string; message: string; availability: any[] }> {
    const {
        interviewer_ids,
        start_time,
        end_time,
        interview_date,
        outlook_email,
        ms_token,
        enable_outlook,
        refresh_token
    } =
        request.query as {
            interviewer_ids: string;
            start_time: string;
            end_time: string;
            interview_date: number;
            outlook_email: string;
            refresh_token: string;
            ms_token: string;
            enable_outlook: boolean;
        };
    const { program_id } = request.params as { program_id: string };

    let new_access_Token = '';

    const traceId = generateCustomUUID();

    if (!interviewer_ids || !start_time || !end_time || !interview_date) {
        return reply.status(400).send({
            status_code: 400,
            trace_id: traceId,
            message: "Please pass all required query parameters.",
        });
    }

    const transaction = await JobInterviewModel.sequelize?.transaction();

    try {
        const interviewerIdsArray = interviewer_ids.split(",");

        const availabilityResults = [];

        for (const participant_id of interviewerIdsArray) {
            const user = await interviewRepository.findUser(participant_id, program_id);

            if (!user) {
                availabilityResults.push({
                    participant_id,
                    status: "User not found",
                    display_name: null,
                });
                continue;
            }

            const display_name = `${user.first_name} ${user.last_name}`;

            const participants = await AdditionalAttendees.findAll({
                where: { participant_id },
                attributes: ["accepted_schedule_id"],
                transaction,
            });

            if (!participants.length) {
                availabilityResults.push({
                    participant_id,
                    display_name,
                    status: "Available",
                });
                continue;
            }

            let isAvailable = true;

            for (const p of participants) {
                if (!p.accepted_schedule_id) {
                    continue;
                }

                const slot = await InterviewSlots.findOne({
                    where: {
                        id: p.accepted_schedule_id,
                        interview_date,
                    },
                    transaction,
                });

                if (slot) {
                    const slotStartTime = new Date(slot.start_time).toISOString().substr(11, 8);
                    const slotEndTime = new Date(slot.end_time).toISOString().substr(11, 8);

                    const inputStartTime = new Date(start_time).toISOString().substr(11, 8);
                    const inputEndTime = new Date(end_time).toISOString().substr(11, 8);
                    if (
                        (slotStartTime < inputEndTime) &&
                        (slotEndTime > inputStartTime)
                    ) {
                        isAvailable = false;
                        break;
                    }
                }
            }

            availabilityResults.push({
                participant_id,
                display_name,
                status: isAvailable ? "Available" : "Not Available",
            });
        }

        await transaction?.commit();

        if (enable_outlook?.toString() === 'true' && interviewer_ids) {
            if (!ms_token) {
                console.warn("[checkSlotAvailability] Missing ms_token in request body");
                return reply.status(401).send({ error: "Token is required in the request body" });
            }

            const response = await fetch(URLs.MICROSOFT_GRAPH_ME, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${ms_token}`,
                    "Content-Type": "application/json",
                },
            });

            if (response.status === 400) {
                console.warn("Unauthorized: Invalid or expired token");
                const newToken = await refreshAccessToken(refresh_token, config.outlook_secret_id, config.outlook_secret_value);
                new_access_Token = newToken.accessToken;
            }
            const tokenToUse = response.status === 400 ? new_access_Token : ms_token;

            const outlookAvailability = await interviewAvailability(tokenToUse, start_time, end_time, outlook_email);

            const combinedAvailability = [
                ...availabilityResults,
                ...outlookAvailability,
            ];

            console.log("Coming inside combined availability", JSON.stringify(availabilityResults, null, 2));

            return reply.status(200).send({
                status_code: 200,
                trace_id: traceId,
                message: "Interviewers' availability status retrieved successfully.",
                availability: combinedAvailability,
            });

        }

        console.log("return outside combined availability", JSON.stringify(availabilityResults, null, 2));


        return reply.status(200).send({
            status_code: 200,
            trace_id: traceId,
            message: "Interviewers availability status retrieved successfully.",
            availability: availabilityResults,
        });
    } catch (error: any) {
        await transaction?.rollback();
        return reply.status(500).send({
            status_code: 500,
            trace_id: traceId,
            message: "Internal Server Error",
            error: error.message,
        });
    }
}

export const rejectInterview = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    const authHeader = request.headers.authorization;
    const token = authHeader?.split(" ")[1] ?? "";

    const { program_id, id } = request.params as {
        program_id: string;
        id: string;
    };

    const Data = request.body as JobInterviewData;
    const trace_id = generateCustomUUID();

    const transaction = await JobInterviewModel.sequelize?.transaction();

    try {
        const interview = await JobInterviewModel.findOne({
            where: {
                id,
                program_id,
                is_deleted: false,
            },
            transaction,
        });

        if (!interview) {
            reply.status(200).send({
                status_code: 200,
                message: "Interview not found",
                trace_id,
            });
            await transaction?.rollback();
            return;
        }

        if (interview.status?.toUpperCase() === "REJECTED") {
            await transaction?.rollback();
            return reply.status(200).send({
                trace_id: trace_id,
                message: "Interview has already been Rejected.",
            });
        }
        // Storing the interview status first, to send notifications at different CONDITIONS
        const checkStatus = interview.status.toLocaleUpperCase();

        const oldData = {
            interview_date: interview?.dataValues?.schedules?.[0]?.interview_date ?? null,
            start_time: interview?.dataValues?.schedules?.[0]?.start_time ?? null,
            end_time: interview?.dataValues?.schedules?.[0]?.end_time ?? null,
            status: interview?.dataValues?.status,
            reason: interview?.dataValues?.interview_cancel_reason ?? null,
            notes: interview?.dataValues?.notes,
            candidate_id: interview?.submit_candidate_id,
            job_id: interview?.dataValues?.job_id,
            vendor_id: interview?.dataValues?.vendor_id,
            updated_by: user.sub,
        };

        if (Data.interview_cancel_reason && Data.status?.toUpperCase() == "REJECTED") {
            await interview.update(
                {
                    status: "REJECTED",
                    interview_cancel_reason: Data.interview_cancel_reason,
                },
                { transaction }
            );

            const candidate = await SubmissionCandidateModel.findOne({
                where: {
                    candidate_id: interview.submit_candidate_id,
                    program_id: interview.program_id,
                    job_id: interview.job_id
                },
                attributes: ['status'],
                transaction,
            });

            const currentStatus = candidate?.dataValues.status.toUpperCase();

            const noUpdateStatuses = [
                "INTERVIEW PENDING CONFIRMATION",
                "INTERVIEW PENDING ACCEPTANCE",
                "INTERVIEW ACCEPTED",
                "INTERVIEW COMPLETED"
            ];

            const revision = interview.dataValues.revision > 1;

            if (revision) {
                if (!noUpdateStatuses.includes(currentStatus)) {
                    await SubmissionCandidateModel.update(
                        { status: "Interview Rejected" },
                        {
                            where: {
                                candidate_id: interview.submit_candidate_id,
                                program_id: interview.program_id,
                                job_id: interview.job_id
                            },
                            transaction,
                        }
                    );
                }
            } else {
                await SubmissionCandidateModel.update(
                    { status: "Interview Rejected" },
                    {
                        where: {
                            candidate_id: interview.submit_candidate_id,
                            program_id: interview.program_id,
                            job_id: interview.job_id
                        },
                        transaction,
                    }
                );
            }

            await InterviewSlots.update(
                { status: "REJECTED" },
                {
                    where: {
                        interview_id: {
                            [Op.in]: [interview.id],
                        },
                    },
                    transaction,
                }
            );

            const newData = {
                interview_date: interview?.dataValues?.schedules?.[0]?.interview_date ?? null,
                start_time: interview?.dataValues?.schedules?.[0]?.start_time ?? null,
                end_time: interview?.dataValues?.schedules?.[0]?.end_time ?? null,
                status: "REJECTED",
                reason: Data?.interview_cancel_reason,
                notes: Data?.buyer_notes,
                candidate_id: interview?.submit_candidate_id,
                job_id: interview?.dataValues?.job_id,
                vendor_id: interview?.dataValues?.vendor_id,
                updated_by: user.sub,
            };
            await candidateHistoryService.handleCandidateHistory({ program_id: interview.program_id, oldData, newData, action: "Interview Rejected", });


            // Trigger Notification for Interview INTERVIEW_REJECTED_PENDING_ACCEPTANCE
            if (checkStatus === "PENDING_ACCEPTANCE") {
                interviewNotificationService.handleInterviewRejectedNotification(interview, user, token, sequelize, reply, interview.dataValues.trace_id);

            } else if (checkStatus === "PENDING_CONFIRMATION") {
                // Trigger Notification for Interview INTERVIEW_REJECTED_PENDING_CONFIRMATION
                interviewNotificationService.handleInterviewRejectedPendingConfirmation(interview, user, token, sequelize, reply, interview.dataValues.trace_id);
            }
        } else {
            throw new Error("Reason for Rejection is required.");
        }

        await transaction?.commit();

        reply.status(200).send({
            status_code: 200,
            message: "Interview rejected successfully",
            trace_id,
        });
    } catch (error: any) {
        await transaction?.rollback();
        reply.status(500).send({
            status_code: 500,
            message: "Internal Server Error",
            error: error.message,
            trace_id,
        });
    }
};

export const rejectCandidate = async (
    request: FastifyRequest,
    reply: FastifyReply
) => {
    const { program_id, submission_id } = request.params as {
        program_id: string;
        submission_id: string;
    };
    const authorization = request.headers['authorization'] as string;
    const { reason, notes } = request.body as { reason?: string; notes?: string };
    const trace_id = generateCustomUUID();
    try {
        const submission = await SubmissionCandidateModel.findOne({
            where: {
                program_id: program_id,
                id: submission_id
            }
        })

        const candidate_id = submission?.candidate_id;
        if (candidate_id) {
            const offer = await OfferModel.findAll({
                where: {
                    program_id: program_id,
                    job_id: submission?.job_id,
                    candidate_id: candidate_id,
                    status: "Accepted"
                }
            })
            if (offer.length > 0) {
                reply.status(400).send({
                    status_code: 400,
                    message: "The candidate can't be rejected because an offer has been created for them.",
                    trace_id,
                });
            } else {
                const oldStatus = submission.dataValues.status;
                const updatedBy = submission.dataValues.updated_by;
                const oldData = { candidate_id, vendor_id: submission.vendor_id, status: oldStatus, job_id: submission?.job_id, updated_by: updatedBy };

                submission?.update({ status: 'Rejected' })

                const newData = { candidate_id, vendor_id: submission.vendor_id, status: 'Rejected', reason, notes, job_id: submission?.job_id, updated_by: updatedBy };
                await candidateHistoryService.handleCandidateHistory({ program_id: submission.dataValues.program_id, oldData, newData, action: 'Candidate Rejected' });

                const interview = await JobInterviewModel.findOne({
                    where: {
                        submit_candidate_id: submission?.candidate_id,
                        program_id,
                        job_id: submission?.job_id,
                        is_deleted: false,
                    },
                });

                interview?.update({ status: "CANCELLED" })

                await InterviewSlots.update(
                    { status: "CANCELLED" },
                    {
                        where: {
                            interview_id: {
                                [Op.in]: [interview?.id],
                            },
                        },
                    }
                );
            }

            const workflowId = submission.onboarding_flow_id;
            const tenantId = submission.program_id;

            if (workflowId && tenantId && authorization) {
                await credentialingService.terminateOnboarding(workflowId, tenantId, authorization);
            } else {
                console.warn("Workflow termination skipped due to missing params.");
            }

        }
        reply.status(200).send({
            status_code: 200,
            message: "Candidate rejected successfully",
            trace_id,
        });
    } catch (error: any) {
        reply.status(500).send({
            status_code: 500,
            message: "Internal Server Error",
            error: error.message,
            trace_id,
        });
    }
};


export const getCalendarData = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
        const { program_id } = request.params as { program_id: string };
        const { module_name } = request.query as { module_name?: string };
        const user = request?.user;
        const userId = user?.sub;
        const userType = user?.userType?.toLowerCase();
        const userData = await offerRepository.findUser(program_id, userId);
        const tenantId = userData[0]?.tenant_id;
        const user_type = userData[0]?.user_type?.toLowerCase();
        const hierarchyIdsArray = userData[0]?.associate_hierarchy_ids || 0;
        const job_ids = await jobRepository.getJobIdsWithHierarchies(program_id, hierarchyIdsArray);
        let vendor_id;
        if (user_type === "vendor") {
            const vendor = await jobRepository.findVendor(program_id, tenantId);
            vendor_id = vendor?.[0]?.id;
        }
        if (!module_name) {
            const [interview, offer] = await Promise.all([
                fetchInterviewData(userType, user_type, program_id, vendor_id, job_ids),
                fetchOfferData(userType, user_type, program_id, vendor_id, hierarchyIdsArray)
            ]);

            return reply.status(200).send({
                status_code: 200,
                message: "Calendar Data Fetched Successfully",
                interview: processInterviewData(interview),
                offer: processOfferData(offer)
            });
        }

        switch (module_name.toLowerCase()) {
            case "interview":
                const interview = await fetchInterviewData(userType, user_type, program_id, vendor_id, job_ids);
                return reply.status(200).send({
                    status_code: 200,
                    message: "Calendar Interview Data Fetched Successfully",
                    interview: processInterviewData(interview)
                });

            case "offer":
                const offer = await fetchOfferData(userType, user_type, program_id, vendor_id, hierarchyIdsArray);
                return reply.status(200).send({
                    status_code: 200,
                    message: "Calendar Offer Data Fetched Successfully",
                    offer: processOfferData(offer)
                });

            default:
                return reply.status(400).send({
                    status_code: 400,
                    message: "Invalid module_name. Allowed values are interview or offer."
                });
        }
    } catch (error: any) {
        console.error("Error fetching calendar data:", error.stack || error);
        return reply.status(500).send({
            status_code: 500,
            message: "An error occurred while fetching calendar data.",
            error: error.message
        });
    }
};

const fetchInterviewData = async (userType: string, user_type: string, program_id: string, vendor_id: any, job_ids: any) => {
    if (userType === "super_user") {
        return interviewRepository.findInterviewDataForSuperAdmin(program_id);
    }
    if (user_type === "vendor") {
        return interviewRepository.findInterviewDataForVendor(program_id, vendor_id);
    }
    return interviewRepository.findInterviewDataForClient(program_id, job_ids);
};

const fetchOfferData = async (userType: string, user_type: string, program_id: string, vendor_id: any, hierarchyIdsArray: any) => {
    if (userType === "super_user") {
        return offerRepository.findOfferDataForSuperAdmin(program_id);
    }
    if (user_type === "vendor") {
        return offerRepository.findOfferDataForVendor(program_id, vendor_id);
    }
    return offerRepository.findOfferDataForClient(program_id, hierarchyIdsArray);
};

const processInterviewData = (data: any[]) => data.map(item => ({
    ...item,
    icon: { icon_name: "user-circle", icon_bgColor: "#00B578" },
    backgroundColor: "#E0FFF4"
}));

const processOfferData = (data: any[]) => data.map(item => ({
    ...item,
    icon: { icon_name: "identification-badge", icon_bgColor: "#BF83FF" },
    backgroundColor: "#F3E8FF"
}));

function formatOutlookSchedule(schedule: any, timeZone: string) {
    if (!schedule || !schedule.start_time || !schedule.end_time) {
        console.error("Invalid schedule data:", schedule);
        return null;
    }

    try {
        const formatDate = (dateStr: string) => {
            const date = new Date(dateStr);
            return date.toISOString().split(".")[0]; // Remove milliseconds and 'Z'
        };

        return {
            start: {
                dateTime: formatDate(schedule.start_time),
                timeZone: timeZone,
            },
            end: {
                dateTime: formatDate(schedule.end_time),
                timeZone: timeZone,
            },
        };
    } catch (error) {
        console.error("Error formatting schedule:", error);
        return null;
    }
}
