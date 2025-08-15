import axios from 'axios';
import { databaseConfig } from '../config/db';
const AUTH_SERVICE_URL = databaseConfig.config.auth_url ;
 
export const getUser = async (
    programId: string,
    userIds: string | undefined,
    token: string
): Promise<any> => {
    try {
        const response = await axios.get(`${AUTH_SERVICE_URL}/v1/api/user`, {
            headers: { Authorization: `Bearer ${token}` },
        });
 
        return response.data;
    } catch (error: any) {
        console.error('Error fetching user details:', error.response?.data || error.message);
        throw new Error('Failed to fetch user details.');
    }
};
export default getUser;
 