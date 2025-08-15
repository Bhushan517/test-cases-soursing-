import {FastifyInstance} from "fastify";

import {
    createOutlookEvent,
    getOutlookEvents,
    redirectUrl,
    checkSlotAvailability,
    getToken,
    getTokenFromCode,
    handleCallback,
    validateToken,
    getSchedule,
    reScheduleEvent,
    getSavedToken,
    saveToken,
    cancelOutlookEvent, getOutlookUserDetails, outlookWebHook, outlookEventDetails
} from "../controllers/msoutlook.controller";


export async function msOutlookRoutes(fastify: FastifyInstance) {
    fastify.post('/availability', checkSlotAvailability);
    fastify.post('/calendar/createEvent', createOutlookEvent);
    fastify.post('/calendar/events', getOutlookEvents);
    fastify.get('/redirectURL', redirectUrl);
    fastify.get('/callback', handleCallback);
    fastify.post('/refreshToken', getToken);
    fastify.post('/get-token', getTokenFromCode);
    fastify.post('/token-validation', validateToken);
    fastify.post('/get-schedule', getSchedule);
    fastify.patch('/reschedule-event', reScheduleEvent);
    fastify.post('/get-saved-token', getSavedToken);
    fastify.post('/save-token', saveToken);
    fastify.post('/calendar/cancel-event', cancelOutlookEvent);
    fastify.get('/outlook/user', getOutlookUserDetails);
    fastify.post('/cancel-meeting/outlook',outlookWebHook);
    fastify.get('/outlook-event-details',outlookEventDetails);

}
