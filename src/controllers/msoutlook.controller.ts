import dotenv from "dotenv";
import {FastifyReply, FastifyRequest} from "fastify";
import {createGraphClient, interviewAvailability} from "../utility/msOutlookServices";
import axios from 'axios';
import {getOutlookToken, refreshAccessToken} from "../utility/outlookTokenService";
import {URLs} from "../config/ms_outlook_urls";
import {databaseConfig} from "../config/db";
import {isValid, parseISO} from "date-fns";
import {decryptToken, encryptToken} from "../utility/outlook/tokenUtils";
import OutlookCalenderEventModel from "../models/outlook-calender-event-model";
import OutlookCalendarEventModel from "../models/outlook-calender-event-model";
import {sequelize} from "../config/instance";
import {AvailabilitySlot} from "../utility/enum/outlook_enum";
import JobInterviewModel from "../models/interview.model";
import generateCustomUUID from "../utility/genrateTraceId";
import SubmissionCandidateModel from "../models/submission-candidate.model";
import InterviewSlots from "../models/interview-schedule.model";
import {Op} from "sequelize";
import {SubscriptionModel} from "../models/outlook-subscription.model";

dotenv.config();

const CALENDER_SCOPE = "Calendars.ReadWrite offline_access User.Read"

const config = databaseConfig.config;

const ENCRYPTION_KEY_BASE64 = config.encryption_key || "o2ioHXDtKzImoJQ/1DFt6nMhmf5TwiZEF1F6F30/tBI=";

export const outlookEventDetails = async (request: FastifyRequest, reply: FastifyReply) => {

    const {event_id, refresh_token} = request.query as { event_id: string, refresh_token: string };

    try {
        const accessTokenData = await refreshAccessToken(
            refresh_token,
            config.outlook_secret_id,
            config.outlook_secret_value
        );

        const accessToken = accessTokenData.accessToken;

        const userDetailResponse = await axios.get(
            URLs.MICROSOFT_GRAPH_ME,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const user_email = userDetailResponse.data.mail || userDetailResponse.data.userPrincipalName;

        if (!userDetailResponse?.data) {
            console.error("No data in user detail response");
            return reply.status(500).send({
                error: "Invalid response from Microsoft Graph API",
                details: userDetailResponse,
            });
        }

        const url = `https://graph.microsoft.com/v1.0/users/${user_email}/events/${event_id}`;
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });
        return reply.send(response.data);

    } catch (error: any) {
        console.error("Error fetching event details:", error?.response?.data || error.message);
        return reply.status(500).send({
            error: "Failed to fetch event details",
            details: error?.response?.data || error.message,
        });
    }
};


export const getOutlookUserDetails = async (request: FastifyRequest, reply: FastifyReply) => {
    const {ms_token, refresh_token} = request.query as { ms_token: string, refresh_token: string };

    let new_access_Token = '';


    try {
        const response = await axios.get(
            URLs.MICROSOFT_GRAPH_ME,
            {
                headers: {
                    Authorization: `Bearer ${ms_token}`,
                    "Content-Type": "application/json"
                }
            }
        );

        if (response.status === 401) {
            console.warn("Unauthorized: Invalid or expired token");
            const newToken = await refreshAccessToken(refresh_token, config.outlook_secret_id, config.outlook_secret_value);
            new_access_Token = newToken.accessToken;

            const response = await axios.get(
                URLs.MICROSOFT_GRAPH_ME,
                {
                    headers: {
                        Authorization: `Bearer ${new_access_Token}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            console.log("User details response: ", response.data);
            return reply.send(response.data);

        }

        console.log("User details response: ", response.data);
        return reply.send(response.data);
    } catch (error) {
        console.error("Error getting user details:", error);
        return reply.status(500).send({error: "Internal server error"});
    }
};

export const getSchedule = async (request: FastifyRequest, reply: FastifyReply) => {
    const {ms_token, schedules, startDateTime, endDateTime} = request.body as {
        ms_token: string;
        schedules: string[];
        startDateTime: string;
        endDateTime: string;
    };

    try {

        const requestBody = {
            "schedules": schedules,
            "startTime": {
                "dateTime": startDateTime,
                "timeZone": "UTC"
            },
            "endTime": {
                "dateTime": endDateTime,
                "timeZone": "UTC"
            },
            "availabilityViewInterval": 60
        };


        const response = await axios.post(
            "https://graph.microsoft.com/v1.0/me/calendar/getschedule",
            requestBody,
            {headers: {Authorization: `Bearer ${ms_token}`, "Content-Type": "application/json"}}
        )
            .then(response => console.log(`schedule response......... >>> ${response.data}`))
            .catch(error => console.error("Error getting schedule:", error));

        return reply.send(response);
    } catch (error) {
        console.error("Error getting schedule:", error);
        return reply.status(500).send({error: "Internal server error"});
    }
};

export const validateToken = async (request: FastifyRequest, reply: FastifyReply) => {
    const {ms_token} = request.body as { ms_token: string };

    try {
        const response = await fetch(URLs.MICROSOFT_GRAPH_ME, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${ms_token}`,
                "Content-Type": "application/json",
            },
        });
        if (response.status === 401) {
            console.warn("Unauthorized: Invalid or expired token");
            return reply.status(401).send({user: false, error: "Invalid or expired token"});
        }

        if (response.status === 403) {
            console.warn("Forbidden: Insufficient permissions");
            return reply.status(403).send({user: false, error: "Insufficient permissions"});
        }

        if (!response.ok) {
            console.error("Graph API Error:", response.statusText);
            return false;
        }

        return reply.send({user: true});

    } catch (error) {
        console.error("Error validating token:", error);
        return reply.status(500).send({user: false, error: "Internal server error"});
    }
};

export const checkSlotAvailability = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const {start, end, email, ms_token} = request.body as {
            start: string;
            end: string;
            email: string;
            ms_token: string;
        };

        // Validate required parameters
        if (!ms_token) {
            console.warn("[checkSlotAvailability] Missing ms_token in request body");
            return reply.status(401).send({error: "Token is required in the request body"});
        }


        if (!start || !end || !email) {
            console.warn("[checkSlotAvailability] Missing required parameters:", {start, end, email});
            return reply.status(400).send({error: "Missing required parameters: start, end, email"});
        }

        console.log(`[checkSlotAvailability] Checking availability for ${email} from ${start} to ${end}`);

        // Fetch availability
        const availabilityResult = await interviewAvailability(ms_token, start, end, email);

        // Response should only contain email and slot (no error or availability field)
        console.log("[checkSlotAvailability] Transformed response:", JSON.stringify(availabilityResult, null, 2));

        return reply.send({availability: availabilityResult});
    } catch (error: any) {
        console.error("[checkSlotAvailability] Error checking slot availability:", error.message || error);
        return reply.status(500).send({error: "Internal Server Error", details: error.message});
    }
};

export const getOutlookEvents = async (request: FastifyRequest, reply: FastifyReply) => {
    const {access_token, emails, startDateTime, endDateTime} = request.body as {
        access_token: string;
        emails: string[];
        startDateTime: string;
        endDateTime: string;
    };

    if (!access_token || !emails || emails.length === 0) {
        return reply.status(400).send({error: 'Token and email list are required'});
    }

    try {
        const client = createGraphClient(access_token);
        const eventsByUser: Record<string, any[]> = {};

        for (const email of emails) {
            try {
                const response = await client
                    .api(`/users/${email}/calendarview`)
                    .query({startDateTime, endDateTime})
                    .get();

                const events = response.value?.map((event: any) => ({
                    subject: event.subject,
                    start: event.start.dateTime,
                    end: event.end.dateTime,
                    status: event.responseStatus.response || "unknown"
                })) || [];

                eventsByUser[email] = events;
            } catch (err) {
                console.error(`Error fetching events for ${email}:`, err);
                eventsByUser[email] = [{subject: 'Error', status: 'failed', details: err}];
            }
        }

        reply.send(eventsByUser);
    } catch (err) {
        console.error("Error fetching outlook events:", err);
        return reply.status(500).send({error: 'Failed to create Graph client', details: err});
    }
};

export const redirectUrl = async (request: FastifyRequest, reply: FastifyReply) => {
    const url = generateAuthRedirectUrl();
    reply.send({URL: url});
}

function generateAuthRedirectUrl() {
    try {
        return URLs.MICROSOFT_LOGIN_AUTH(CALENDER_SCOPE, config.outlook_redirect_uri, config.outlook_secret_id);
    } catch (err: any) {
        if (err.statusCode === 401) {
            console.error('Unauthorized: Check token validity and permissions.');
        }
        console.error('Error creating calendar:', err.response?.body || err.message);
        throw err;

    }
}

export const handleCallback = async (request: FastifyRequest, reply: FastifyReply) => {
    const {code} = request.query as { code?: string; };

    if (!code) {
        reply.status(400).send({
            message: "Missing 'code' parameter in the callback URL.",
            error: "Bad Request",
        });
        return;
    }

    try {
        const tokenResponse: any = await getOutlookToken(code, config.outlook_secret_id, config.outlook_secret_value, config.outlook_redirect_uri);


        if (!tokenResponse?.access_token) {
            return reply.status(400).send({
                error: "Bad Request",
                message: "Access token missing in response",
            });
        }

        const subscription = await createOutlookWebhook(tokenResponse.access_token, tokenResponse.refresh_token);


        return reply.send({
            access_token: tokenResponse.access_token,
            refresh_token: tokenResponse.refresh_token,
            subscription: subscription.id

        });
    } catch (err) {
        console.error('Error in callback:', err);
        reply.status(500).send({
            error: err,
            message: 'Failed to retrieve access token',
        });
    }
};

export const createOutlookEvent = async (request: FastifyRequest, reply: FastifyReply) => {

    let new_access_Token = '';

    const {email, subject, start, end, attendees, access_token, refresh_token, user_id} = request.body as {
        email: string;
        subject: string;
        start: { dateTime: string; timeZone: string };
        end: { dateTime: string; timeZone: string };
        attendees: { attendee_info: { email_address: string; name?: string } }[];
        access_token: string;
        refresh_token: string;
        user_id: string;

    };
    if (!access_token) {
        return reply.status(401).send({error: 'Access Token is missing in the body'});
    }
    if (!refresh_token) {
        reply.status(400).send({
            message: "Missing 'refresh token' parameter in the body.",
            error: "Bad Request",
        });
        return;
    }

    if (!user_id) {
        return reply.status(400).send({
            message: "Missing 'user id' in the body.",
            error: "Bad Request",
        });
    }

    try {
        const response = await fetch(URLs.MICROSOFT_GRAPH_ME, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${access_token}`,
                "Content-Type": "application/json",
            },
        });


        if (response.status === 403) {
            console.warn("Forbidden: Insufficient permissions");
            return reply.status(403).send({user: false, error: "Insufficient permissions"});
        }

        if (!response.ok) {
            console.error("Graph API Error:", response.statusText);
            return false;
        }


    } catch (error) {
        console.error("Error validating token:", error);
        return reply.status(500).send({user: false, error: "Internal server error"});
    }


    try {
        const startUTC = start.dateTime;
        const endUTC = end.dateTime;
        const startDateTime = parseISO(startUTC);
        const endDateTime = parseISO(endUTC);
        const now = new Date();

        console.log("Current time (UTC):", now.toISOString());
        console.log("Start DateTime (UTC):", startDateTime.toISOString());
        console.log("End DateTime (UTC):", endDateTime.toISOString());

        // 1. Validate date format
        if (!isValid(startDateTime) || !isValid(endDateTime)) {
            return reply.status(400).send({error: 'Invalid date format'});
        }
        // 2. Ensure start time is before end time
        if (startDateTime >= endDateTime) {
            return reply.status(400).send({error: 'Start time must be before end time'});
        }
        // 3. Ensure start and end times are in the future
        if (startDateTime < now || endDateTime < now) {
            return reply.status(400).send({error: 'Start and end times must be in the future'});
        }
        // 4. Check slot availability
        const availabilityToken = new_access_Token ? new_access_Token : access_token;

        console.log("Processing event for:", email);
        console.log("Start Time......", start);
        console.log("End Time......", end);

        const availability = await interviewAvailability(availabilityToken, startUTC, endUTC, email);
        console.log("Availability Response:", availability);

        const availabilityStatus = availability[0]?.status;

        if (availabilityStatus !== AvailabilitySlot.Available) {
            return reply.send({slot: availabilityStatus, details: availability});
        }

        const event = {
            subject,
            start: {
                dateTime: startUTC,
                timeZone: 'UTC',
            },
            end: {
                dateTime: endUTC,
                timeZone: 'UTC',
            },
            attendees: attendees.map((attendee) => ({
                emailAddress: {
                    address: attendee.attendee_info.email_address,
                    name: attendee.attendee_info.name || '',
                },
                type: 'required',
            })),
            isOnlineMeeting: true,
            onlineMeetingProvider: "teamsForBusiness",
        };

        const createEventResponse = await axios.post(
            URLs.MICROSOFT_GRAPH_EVENTS,
            event,
            {
                headers: {
                    Authorization: `Bearer ${availabilityToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const existingEvent = await OutlookCalendarEventModel.findOne({
            where: {user_id},
            attributes: ['refresh_token'],
        });


        const final_refresh_token = encryptToken(refresh_token);

        console.log(`Refresh token -----------------> ${final_refresh_token}`);
        await sequelize.transaction(async (t) => {
            await OutlookCalendarEventModel.destroy({where: {user_id}, transaction: t});

            await OutlookCalendarEventModel.create({
                event_id: createEventResponse.data.id,
                refresh_token: final_refresh_token,
                user_id: user_id,
                interview_id: 'interview_001',
                id: crypto.randomUUID(),
            }, {transaction: t});
        });

        reply.send({event: createEventResponse.data});
    } catch (error: any) {
        console.error('Error creating event:', error.response?.data || error.message);
        reply.status(500).send({error: 'Failed to create event', details: error.response?.data || error.message});
    }
};

export const getToken = async (request: FastifyRequest, reply: FastifyReply) => {
    const {refresh_token} = request.body as { refresh_token?: string };

    if (!refresh_token) {
        reply.status(400).send({
            message: "Missing 'refresh token' parameter in the body.",
            error: "Bad Request",
        });
        return;
    }
    try {
        const newTokens = await refreshAccessToken(refresh_token, config.outlook_secret_id, config.outlook_secret_value);

        return reply.send({
            access_token: newTokens.accessToken,
            refresh_token: newTokens.refreshToken,
            expiresIn: newTokens.expiresIn,
        });
    } catch (error) {
        console.error('Failed to refresh token:', error);
        throw error;
    }
}

export const getTokenFromCode = async (request: FastifyRequest, reply: FastifyReply) => {
    const {code} = request.body as { code: string; };
    if (!code) {
        return reply.status(400).send({error: 'Authorization code is missing'});
    }
    try {
        const tokenResponse = await axios.post(
            URLs.MICROSOFT_TOKEN_ENDPOINT,
            new URLSearchParams({
                client_id: config.outlook_secret_id!,
                client_secret: config.outlook_secret_value!,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: config.outlook_redirect_uri!,
            }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );
        const tokenData = tokenResponse.data;
        console.log('Token Data:', tokenData);
        reply.send({token: tokenData});
    } catch (error: any) {
        console.error('Error fetching token:', error.response?.data || error.message);
        reply.status(500).send({error: 'Failed to fetch access token', details: error.response?.data || error.message});
    }
};

export const saveToken = async (request: FastifyRequest, reply: FastifyReply) => {
    const {user_id, refresh_token} = request.body as {
        user_id: string;
        refresh_token: string;
    };

    console.log("Received user_id:", user_id);

    try {

        if (!refresh_token) {
            return reply.status(404).send({error: "Refresh Token not found"});
        }

        const encryptedToken = encryptToken(refresh_token);
        await OutlookCalenderEventModel.create({
            id: crypto.randomUUID(),
            refresh_token: encryptedToken,
            user_id: user_id
        });

        return reply.send({message: "Token saved !!"});
    } catch (error: any) {
        console.error("Error retrieving token:", error.message);
        return reply.status(500).send({error: "Internal server error"});
    }

};

export const getSavedToken = async (request: FastifyRequest, reply: FastifyReply) => {
    const {user_id} = request.body as {
        user_id: string;
    };

    console.log("Received user_id:", user_id);

    try {
        const outlook_event = await OutlookCalendarEventModel.findOne({where: {user_id}});

        if (!outlook_event) {
            return reply.status(404).send({error: "Event not found"});
        }

        const decrypted_token = decryptToken(outlook_event.refresh_token);
        return reply.send({refresh_token: decrypted_token});
    } catch (error: any) {
        console.error("Error retrieving token:", error.message);
        return reply.status(500).send({error: "Internal server error"});
    }

};

export const reScheduleEvent = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const {interview_id, subject, startDateTime, endDateTime, access_token, attendees} = request.body as {
            subject: string;
            startDateTime: string;
            endDateTime: string;
            interview_id: string;
            access_token: string;
            attendees: { email: string; type?: "required" | "optional" }[];

        };

        if (!access_token) {
            return reply.status(401).send({error: "Access Token is missing in the body"});
        }

        if (!interview_id) {
            return reply.status(401).send({error: "Interview ID is missing in the body"});
        }

        if (!attendees || attendees.length === 0) {
            return reply.status(400).send({error: "Attendees list is required and cannot be empty"});
        }

        const outlook_event = await OutlookCalendarEventModel.findOne({where: {interview_id}});

        if (!outlook_event) {
            return reply.status(404).send({error: "No calendar event found for the given user ID"});
        }


        const event_id = outlook_event.event_id;

        if (!event_id) {
            return reply.status(404).send({error: "Event ID is missing in the database record"});
        }

        const formattedAttendees = attendees.map(att => ({
            emailAddress: {address: att.email},
            type: 'required',
        }));


        const updateEventResponse = await axios.patch(
            `${URLs.MICROSOFT_GRAPH_EVENTS}/${event_id}`,
            {
                subject,
                start: {dateTime: startDateTime, timeZone: "UTC"},
                end: {dateTime: endDateTime, timeZone: "UTC"},
                attendees: formattedAttendees,

            },
            {
                headers: {
                    Authorization: `Bearer ${access_token}`,
                    "Content-Type": "application/json",
                },
            }
        );

        return reply.status(200).send({
            message: "Event rescheduled successfully",
            event: updateEventResponse.data
        });
    } catch (error: any) {
        console.error("Error rescheduling event:", error.response?.data || error.message);
        return reply.status(error.response?.status || 500).send({
            message: "Failed to reschedule event",
            error: error.response?.data || error.message
        });
    }
};

export const cancelOutlookEvent = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const {interview_id, access_token} = request.body as {
            interview_id: string;
            access_token: string;
        };

        if (!access_token) {
            return reply.status(401).send({error: "Access Token is missing in the body"});
        }

        if (!interview_id) {
            return reply.status(400).send({error: "Interview ID is missing in the body"});
        }

        const outlook_event = await OutlookCalendarEventModel.findOne({where: {interview_id}});

        if (!outlook_event) {
            return reply.status(404).send({error: "No calendar event found for the given interview ID"});
        }

        const event_id = outlook_event.event_id;

        if (!event_id) {
            return reply.status(404).send({error: "Event ID is missing in the database record"});
        }

        await axios.delete(`${URLs.MICROSOFT_GRAPH_EVENTS}/${event_id}`, {
            headers: {
                Authorization: `Bearer ${access_token}`,
                "Content-Type": "application/json",
            },
        });

        // Optional: remove the event record from your DB after cancelling
        await OutlookCalendarEventModel.destroy({where: {interview_id}});

        return reply.status(200).send({message: "Event cancelled successfully"});
    } catch (error: any) {
        console.error("Error cancelling event:", error.response?.data || error.message);
        return reply.status(error.response?.status || 500).send({
            message: "Failed to cancel event",
            error: error.response?.data || error.message
        });
    }
};

export async function createOutlookWebhook(accessToken: string, refreshToken: string) {
    let validAccessToken = accessToken;
    let tokenResponse;

    try {
        tokenResponse = await axios.get(URLs.MICROSOFT_GRAPH_ME, {
            headers: {
                Authorization: `Bearer ${validAccessToken}`,
                "Content-Type": "application/json"
            }
        });
        console.log("Token validation success:", JSON.stringify(tokenResponse.data, null, 2));

    } catch (error: any) {

        if (error.response?.status === 401) {
            validAccessToken = (await refreshAccessToken(
                refreshToken,
                config.outlook_secret_id,
                config.outlook_secret_value
            )).accessToken;


            tokenResponse = await axios.get(URLs.MICROSOFT_GRAPH_ME, {
                headers: {
                    Authorization: `Bearer ${validAccessToken}`,
                    "Content-Type": "application/json"
                }
            });

            console.log("Token refresh success:", JSON.stringify(tokenResponse.data, null, 2));

        } else {
            if (error.isAxiosError && error.toJSON) {
                console.error("Axios error during token request:", error.toJSON());
            } else {
                console.error("Unexpected error during token request:", error.message);
            }
            throw error;
        }
    }

    const expirationDate = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
    const expirationIso = expirationDate.toISOString();


    const baseUrl = config.api_public_url;
    console.log(`API PUBLIC URL ${baseUrl}`);
    const notificationURL = `${baseUrl}/sourcing/v1/api/cancel-meeting/outlook`;
    console.log(`Outlook Notification URL  ${notificationURL}`);

    const subscription_resource = `users/${tokenResponse.data.id}/calendar/events`;

    console.log(`Subscription resource  ${subscription_resource}`);

    try {
        const response = await axios.post(
            "https://graph.microsoft.com/v1.0/subscriptions",
            {
                changeType: "updated,deleted",
                notificationUrl: notificationURL,
                resource: subscription_resource,
                expirationDateTime: expirationIso,
                clientState: ENCRYPTION_KEY_BASE64
            },
            {
                headers: {
                    Authorization: `Bearer ${validAccessToken}`,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log("Subscription creation response:", JSON.stringify(response.data, null, 2));

        const userId = tokenResponse.data.id;

        const {id, expirationDateTime: newExpirationDateTime} = response.data;
        console.log("Subscription Id :", JSON.stringify(response.data.id, null, 2));


        await SubscriptionModel.create({
            subscriptionId: id,
            userId: userId,
            expirationDateTime: newExpirationDateTime
        });

        return response.data;

    } catch (error: any) {
        if (error.response) {
            console.error("Subscription creation failed:");
            console.error("Status:", error.response.status);
            console.error("Data:", JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error("No response received:", error.request);
        } else {
            console.error("Axios error during subscription creation:", error.message);
        }
        throw error;
    }
}

export const outlookWebHook = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { validationToken?: string };

    reply.raw.removeHeader?.('Access-Control-Allow-Origin');
    reply.raw.removeHeader?.('Access-Control-Allow-Methods');
    reply.raw.removeHeader?.('Access-Control-Allow-Headers');

    try {
        if (query?.validationToken) {
            console.log("Received validation token:", query.validationToken);
            return reply.code(200).header("Content-Type", "text/plain").send(query.validationToken);
        }

        const body = request.body as any;
        const value = body?.value ?? [];

        for (const notification of value) {
            const {changeType, resource} = notification;
            const eventId = resource.split("/").pop();

            const sequelize = JobInterviewModel.sequelize;
            if (!sequelize) {
                console.error("Sequelize instance not available on JobInterviewModel");
                return reply.status(500).send({error: "Internal server error: DB not initialized"});
            }

            const transaction = await sequelize.transaction();

            try {
                const outlookEvent = await OutlookCalendarEventModel.findOne({where: {event_id: eventId}});

                if (!outlookEvent) {
                    console.warn(`No Outlook event found for event ID: ${eventId}`);
                    continue;
                }

                const interview = await JobInterviewModel.findOne({where: {id: outlookEvent.interview_id}});

                if (!interview) {
                    console.warn(`No Interview  found for event ID: ${outlookEvent.interview_id}`);
                    continue;
                }
                console.log(`Interview Id : ${interview.id}`);
                console.log(`Submit candidate Id  ${interview.submit_candidate_id}`);
                console.log(`Job Id ${interview.job_id}`);
                console.log(`Program Id ${interview.program_id}`);
                console.log("Received changeType:", changeType);
                console.log("Incoming notification", JSON.stringify(value).replace(/\s+/g, ' '));
                console.log(`Event ID: ${eventId}`);

                if (changeType === "deleted") {
                    await interview.update(
                        {
                            status: "CANCELLED",
                            interview_cancel_reason: "",
                            updated_by: outlookEvent.user_id
                        },
                        {transaction}
                    );

                    await SubmissionCandidateModel.update(
                        {status: "Interview Cancelled"},
                        {
                            where: {
                                candidate_id: interview.submit_candidate_id,
                                program_id: interview.program_id,
                                job_id: interview.job_id
                            },
                            transaction
                        }
                    );

                    await InterviewSlots.update(
                        {status: "CANCELLED"},
                        {
                            where: {interview_id: {[Op.in]: [interview.id]}},
                            transaction
                        }
                    );

                } else if (changeType === "updated") {
                    const refresh_token = decryptToken(outlookEvent.refresh_token);

                    const accessTokenData = await refreshAccessToken(
                        refresh_token,
                        config.outlook_secret_id,
                        config.outlook_secret_value
                    );
                    const access_token = accessTokenData.accessToken;

                    console.log(`generated access token, ${access_token}`);

                    const userDetailResponse = await axios.get(URLs.MICROSOFT_GRAPH_ME, {
                        headers: {
                            Authorization: `Bearer ${access_token}`,
                            "Content-Type": "application/json"
                        }
                    });
                    console.log("reschedule user response:", JSON.stringify(userDetailResponse.data, null, 2));


                    if (!userDetailResponse) {
                        console.error("No data in user detail response");
                        return reply.status(500).send({
                            error: "Invalid response from Microsoft Graph API",
                            details: userDetailResponse,
                        });
                    }

                    const user_email = userDetailResponse.data?.mail;

                    if (!user_email) {
                        console.error("Email not found in user detail response");
                        return reply.status(500).send({
                            error: "User email not available in Graph API response",
                            details: userDetailResponse.data,
                        });
                    }


                    const eventDetailsResponse = await axios.get(
                        `https://graph.microsoft.com/v1.0/users/${user_email}/events/${eventId}`,
                        {
                            headers: {
                                Authorization: `Bearer ${access_token}`,
                                "Content-Type": "application/json"
                            }
                        }
                    );

                    if (!eventDetailsResponse) {
                        console.error(" No data from Microsoft Event Details API");
                        await transaction?.rollback();
                        return;
                    }
                    console.log(" Fetched updated event:", eventDetailsResponse.data);


                    const updatedEvent = eventDetailsResponse.data;


                    const eventDateTime = updatedEvent.start.dateTime;
                    const eventDateTimestamp = new Date(eventDateTime).getTime();

                    const startTimeStr: string = updatedEvent.start.dateTime;
                    const endTimeStr: string = updatedEvent.end.dateTime;

                    const startTime: Date = new Date(startTimeStr);
                    const endTime: Date = new Date(endTimeStr);

                    const durationMs: number = endTime.getTime() - startTime.getTime();

                    const durationMinutes: number = Math.floor(durationMs / 60000);
                    console.log("Interview duration :", durationMinutes);


                    const job_interview: JobInterviewModel | null = await JobInterviewModel.findByPk(outlookEvent.interview_id);
                    if (job_interview) {

                        const updatedData = {
                            title: updatedEvent.subject,
                            buyer_notes: "",
                            start_time: updatedEvent.start?.dateTime,
                            updated_by: outlookEvent.user_id,
                            status: "PENDING_ACCEPTANCE",
                            submit_candidate_id: interview.submit_candidate_id,
                            program_id: interview.program_id,
                            job_id: interview.job_id,
                            vendor_id: interview.vendor_id,
                        };

                        console.log("Updating JobInterview with:");
                        for (const key in updatedData) {
                            const value = updatedData[key as keyof typeof updatedData];
                            console.log(`${key} =>`, value, "| Type:", typeof value);
                        }

                        await job_interview.update(
                            {
                                title: updatedEvent.subject,
                                buyer_notes: "",
                                start_time: updatedEvent.start?.dateTime,
                                updated_by: outlookEvent.user_id,
                                status: "PENDING_ACCEPTANCE",
                                submit_candidate_id: interview.submit_candidate_id,
                                program_id: interview.program_id,
                                job_id: interview.job_id,
                                vendor_id: interview.vendor_id,

                            },
                            {transaction}
                        );
                        console.log(" job_interview updated successfully");
                    }
                    else {
                        console.warn("No job_interview found for", outlookEvent.interview_id);
                    }


                    const destroyCount = await InterviewSlots.destroy({
                        where: { interview_id: interview.id },
                        transaction,
                    });
                    console.log(`Deleted ${destroyCount} old InterviewSlots for interview ID: ${interview.id}`);


                    try {
                        const slotUpsertData = {
                            interview_id: interview.id,
                            interview_date: eventDateTimestamp,
                            start_time: updatedEvent.start?.dateTime,
                            end_time: updatedEvent.end?.dateTime,
                            duration: durationMinutes.toString(),
                            status: "PENDING",
                            is_propose: false,
                        };

                        console.log("Upserting InterviewSlots with:");
                        for (const key in slotUpsertData) {
                            const value = slotUpsertData[key as keyof typeof slotUpsertData];
                            console.log(`${key} =>`, value, "| Type:", typeof value);
                        }

                        await InterviewSlots.upsert({
                            interview_id: interview.id,
                            interview_date: eventDateTimestamp,
                            start_time: updatedEvent.start?.dateTime,
                            end_time: updatedEvent.end?.dateTime,
                            duration: durationMinutes.toString(),
                            status: "PENDING",
                            is_propose: false
                        }, { transaction });

                        console.log("InterviewSlots upsert successful");
                    } catch (e) {
                        console.error("InterviewSlots upsert failed", e);
                    }

                    const submissionUpdateWhere = {
                        candidate_id: interview.submit_candidate_id,
                        program_id: interview.program_id,
                        job_id: interview.job_id,
                    };

                    console.log("Updating SubmissionCandidateModel with status: 'Interview Rescheduled' where:", submissionUpdateWhere);


                    const updateResult = await SubmissionCandidateModel.update(
                        { status: "Interview Pending Acceptance" },
                        {
                            where: {
                                candidate_id: interview.submit_candidate_id,
                                program_id: interview.program_id,
                                job_id: interview.job_id,
                            },
                            transaction,
                        }
                    );
                    console.log(" SubmissionCandidateModel update result:", updateResult);

                } else {
                    console.warn("Unsupported changeType:", changeType);
                }

                await transaction.commit();
                console.log(`Transaction committed for eventId: ${eventId}`);

            } catch (innerError) {
                console.error("Processing error for eventId:", eventId, innerError);
                await transaction.rollback();
            }

        }

        return reply.status(200).send("Webhook processed");

    } catch (error) {
        const traceId = generateCustomUUID();
        console.error("Webhook error:", error);
        return reply.status(500).send({traceId, error});
    }
};
