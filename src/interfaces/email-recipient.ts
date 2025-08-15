export interface EmailRecipient {
    email: string;
    first_name?: string;
    middle_name?: string;
    last_name?: string;
    userType?: string;
    eventCode?: string;
    status?: string | null;

    // Add any other properties you need
}