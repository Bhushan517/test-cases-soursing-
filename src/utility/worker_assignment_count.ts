import axios from 'axios';
import { databaseConfig } from '../config/db';
const TEAI_URL = databaseConfig.config.teai_url;

interface WorkerAssignmentCountResponse {
  [key: string]: any;
}

async function getWorkerAssignmentCount(
  programId: string,
  candidateIds: string[],
  token: string
): Promise<WorkerAssignmentCountResponse> {
  const url = `${TEAI_URL}/worker/v1/program/${programId}/worker-assignment-count`;

  try {
    const response = await axios.post(url, 
      { candidate_ids: candidateIds }, 
      {
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
         
        }
      }
    );

    return response.data;
  } catch (error: any) {
    console.error('Error fetching worker assignment count:', error.response?.data || error.message);
    throw error;
  }
}


export { getWorkerAssignmentCount };
