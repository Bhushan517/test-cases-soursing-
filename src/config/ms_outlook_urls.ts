export const URLs = {
    MICROSOFT_HOST: "https://login.microsoftonline.com",
    MICROSOFT_TOKEN_SCOPE: "https://graph.microsoft.com/.default",
    MICROSOFT_GRAPH_ME: "https://graph.microsoft.com/v1.0/me",
    MICROSOFT_SUBSCRIPTION_GRAPH: "https://graph.microsoft.com/v1.0/subscriptions",
    MICROSOFT_GRAPH_EVENTS: "https://graph.microsoft.com/v1.0/me/events",
    MICROSOFT_LOGIN_AUTH: (scope: string, redirect_uri: string, client_id: string) =>
        `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
        `scope=${encodeURIComponent(scope)}` +
        `&response_type=code` +
        `&response_mode=query` +
        `&redirect_uri=${encodeURIComponent(redirect_uri)}` +
        `&client_id=${client_id}`,
    MICROSOFT_TOKEN_ENDPOINT: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    getCalendarView: (email: string, start: string, end: string) =>
        `https://graph.microsoft.com/v1.0/users/${email}/calendarView?startDateTime=${start}&endDateTime=${end}&$select=start,end,showAs`,
};
