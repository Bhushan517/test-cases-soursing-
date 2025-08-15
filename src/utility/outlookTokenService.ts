import axios from 'axios';
import {URLs} from "../config/ms_outlook_urls";


export const getOutlookToken = async (
    code: string,
    client_id: string,
    client_secret: string,
    redirect_url: string
): Promise<any> => {
    try {
        const response = await axios.post(
            URLs.MICROSOFT_TOKEN_ENDPOINT,
            new URLSearchParams({
                client_id: client_id,
                client_secret: client_secret,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirect_url
            }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );

        console.log("Token Response:", response.data);

        if (!response.data || !response.data.access_token) {
            throw new Error('Access token not found in the response');
        }

        return response.data;
    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            console.error('Error fetching access token:', error.response?.data || error.message);
        } else {
            console.error('Unexpected error:', error);
        }

        throw new Error('Failed to retrieve access token');
    }
};


export const refreshAccessToken = async (refresh_token: string,client_id : string,client_secret:string): Promise<{ accessToken: string, refreshToken: string, expiresIn: number }> => {


    if (!client_id || !client_secret) {
        throw new Error("Missing Microsoft Client ID or Secret.");
    }

    const data = {
        client_id: client_id,
        client_secret: client_secret,
        grant_type: 'refresh_token',
        refresh_token: refresh_token,
        scope: URLs.MICROSOFT_TOKEN_SCOPE
    };

    try {
        const response = await axios.post(URLs.MICROSOFT_TOKEN_ENDPOINT, data, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        return {
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
            expiresIn: response.data.expires_in,
        };
    } catch (error: any) {
        console.error("Error refreshing access token:", error.response?.data || error.message);
        throw new Error(error.response?.data.error_description || "Failed to refresh access token");
    }
};

