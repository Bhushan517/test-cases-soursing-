import axios from 'axios';
import { databaseConfig } from "../config/db";
let url = databaseConfig.config.config_url;

class Hierarchy {
    public static updateHierarchy = async (id: string, program_id: string,token:string): Promise<any> => {
        try {
            const response = await axios.put(
                `${url}/config/v1/api/program/${program_id}/hierarchies/${id}`,
                { is_not_editable: true },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );
            return response.data;
        } catch (error: any) {
            console.error('Error updating is_not_editable:',);
        }
    };
}

export default Hierarchy;