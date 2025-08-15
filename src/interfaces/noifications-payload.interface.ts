export interface NotificationPayload {
  entityRefId: string;
  program_id: string,
  token: string;
  traceId: string;
  eventCode: string;
  channels: string[];
  recipient: {
    email: {
      to: EmailRecipient[];
      sender: { email: string };
    };
  };
  payload: any,
  userId: string;
  language: string;
}


interface EmailRecipient {
  email: string;
}
export interface UserEmail {
  email: string;
}
