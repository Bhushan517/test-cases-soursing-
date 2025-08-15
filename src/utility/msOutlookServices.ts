import {Client} from '@microsoft/microsoft-graph-client';
import axios from 'axios';
import {URLs} from "../config/ms_outlook_urls";
import {AvailabilitySlot} from "./enum/outlook_enum";

export const createGraphClient = (accessToken: string) => {
    return Client.init({
        authProvider: (done) => {
            done(null, accessToken);
        },
    });
};

export const interviewAvailability = async (
    accessToken: string,
    start: string,
    end: string,
    email: string,
): Promise<{ display_name: string; status: string }[]> => {
    const availabilityHeader = {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
    };

    const url = URLs.getCalendarView(email, start, end);
    console.log(`Checking availability for: ${email}, URL: ${url}`);

    try {
        const userDetailsResponse = await axios.get(URLs.MICROSOFT_GRAPH_ME, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        const username = userDetailsResponse?.data?.displayName ?? email;
        const response = await axios.get(url, availabilityHeader);

        const events = response?.data?.value ?? [];

        if (Array.isArray(events) && events.length > 0) {
            const statuses: string[] = events.map((event: any) => event.showAs?.toLowerCase() ?? 'unknown');

            if (statuses.includes('busy')) {
                return [{display_name: username, status: AvailabilitySlot.Busy}];
            }
            if (statuses.includes('oof')) {
                return [{display_name: username, status: AvailabilitySlot.Oof}];
            }
            if (statuses.includes('tentative')) {
                return [{display_name: username, status: AvailabilitySlot.Tentative}];
            }
            if (statuses.includes('workingElsewhere')) {
                return [{display_name: username, status: AvailabilitySlot.WorkingElsewhere}];
            }

            return [{display_name: username, status: AvailabilitySlot.Unknown}];
        }

        return [{display_name: username, status: AvailabilitySlot.Available}];
    } catch (error) {
        console.error('Error fetching availability:', error);
        return [{display_name: email, status: 'Error fetching availability'}];
    }
};
