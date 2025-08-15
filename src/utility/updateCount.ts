
import axios from 'axios';
import { databaseConfig } from '../config/db';
const CONFIG_SERVICE_URL = databaseConfig.config.config_url;
export const incrementJobSubmittedCount = async (
  id: string,
  program_id: string,
  currentCount: number,
  token:any
): Promise<any> => {
  try {
    const response = await axios.put(
      `${CONFIG_SERVICE_URL}/v1/api/program/${program_id}/job-template/${id}`,
      { job_submitted_count: currentCount + 1, updated_on: Date.now() },
      
        {
          headers: {
            Authorization: `Bearer ${token}`,
        },
      }
    );
    console.log('Job submitted count increment response:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('Error updating job submitted count:',);
  }
};


export default incrementJobSubmittedCount;
