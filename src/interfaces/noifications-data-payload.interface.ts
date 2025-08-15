import { EmailRecipient } from '../interfaces/email-recipient';

export interface NotificationDataPayload {
    program_id: string,
    token: string;
    traceId: string;
    eventCode: string;
    recipientEmail: EmailRecipient[];
    payload: any;
    userId: string;
    roleRecipient: any;
    entityRefId: string;
    role: any;
  } 