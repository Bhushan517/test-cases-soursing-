import axios from 'axios';
import { databaseConfig } from '../config/db';
export class CredentialingService {
    private baseURL: string;

    constructor() {
        this.baseURL = databaseConfig.config.credentialing_url;
    }

    async createWorkflow(workflowPayload: any, tenantId: string, authorization: string): Promise<any> {
        try {
            console.log("Creating workflow with payload:", JSON.stringify(workflowPayload, null, 2));
            const response = await axios.post(`${this.baseURL}/v1/api/workflow?tenant_id=${tenantId}`, workflowPayload, {
                headers: {
                    Authorization: authorization,
                },
            });

            console.log("response from credentialing-", response);
            return response.data;
        } catch (error: any) {
            console.error('Error creating workflow in credentialing service:', error.message, error.error);
            throw error;
        }
    };

    async createWorkflowSteps(workflowId: string, workflowSteps: any[], tenantId: string, authorization: string): Promise<any> {
        try {
            const workflowPayload = { steps: workflowSteps };

            console.log("Calling credentialing to create workflow with steps, payload:" , JSON.stringify(workflowPayload, null, 2));
            const response = await axios.post(`${this.baseURL}/v1/api/workflow/${workflowId}/steps/append?tenant_id=${tenantId}`,
                workflowPayload, 
                {
                    headers: {
                        Authorization: authorization,
                        'Content-Type': 'application/json',
                    },
                }
            );

            console.log("response from credentialing-", response);
            return response.data;
        } catch (error) {
            console.error('Error creating workflow steps in credentialing service:', error);
            throw error;
        }
    };

    
    async getWorkflow(workflowId: string, tenantId: string, authorization: string): Promise<any> {
        try {
            console.log("Calling credentialing to get workflow");
            const response = await axios.get(`${this.baseURL}/v1/api/workflow/${workflowId}?tenant_id=${tenantId}`,
                {
                    headers: {
                        Authorization: authorization,
                        'Content-Type': 'application/json',
                    },
                }
            );

            console.log("response from credentialing-", response);
            return response.data as {
                id: string;
                description: string;
                message?: string;
                status: string;
                associations?: Record<string, any>;
                attributes?: Record<string, any>;
                tenant_id: string;
                is_enabled: boolean;
                is_deleted: boolean;
                created_on: Date;
                updated_on: Date;
                created_by: string;
                updated_by: string;
            };
        } catch (error) {
            console.error('Error creating workflow steps in credentialing service:', error);
            throw error;
        }
    };

    async getLatestTasksByIds(tenantId: string, taskEntityIds: string[], authorization: string): Promise<any> {
        try {
        console.log("Calling credentialing to get latest tasks for entity ids, payload:" , JSON.stringify(taskEntityIds, null, 2));
        const response = await axios.post(
            `${this.baseURL}/v1/api/tasks/latest?tenant_id=${tenantId}`,
            { task_entity_ids: taskEntityIds },
            {
                headers: {
                Authorization: authorization,
                'Content-Type': 'application/json',
                },
            }
        );

        console.log("response from credentialing-", response);
        return response.data;
        } catch (error) {
          console.error('Error fetching latest tasks in credentialing service:', error);
          throw error;
        }
      };

    async pushWorkflowUpdates(workflowId: string, workflowUpdates: Record<string, any>, tenantId: string, authorization: string): Promise<any> {
        try {
            console.log("Calling credentialing to push updated to workflow, payload:" , JSON.stringify(workflowUpdates, null, 2));
            const response = await axios.put(`${this.baseURL}/v1/api/workflow/${workflowId}/push?tenant_id=${tenantId}`,
                workflowUpdates, 
                {
                    headers: {
                        Authorization: authorization,
                        'Content-Type': 'application/json',
                    },
                }
            );

            console.log("response from credentialing-", response);
            return response.data;
        } catch (error) {
            console.error('Error pushing updates to workflow in credentialing service:', error);
            throw error;
        }
    };

    async pushWorkflowUpdatesAndAppendSteps(workflowId: string, workflowAndSteps: Record<string, any>, tenantId: string, authorization: string): Promise<any> {
        try {
            console.log("Calling credentialing to push updated to workflow and append steps, payload:" , JSON.stringify(workflowAndSteps, null, 2));
            const response = await axios.put(`${this.baseURL}/v1/api/workflow/${workflowId}/push-and-append?tenant_id=${tenantId}`,
                workflowAndSteps, 
                {
                    headers: {
                        Authorization: authorization,
                        'Content-Type': 'application/json',
                    },
                }
            );

            console.log("response from credentialing-", response);
            return response.data;
        } catch (error: any) {
            console.error(`Error pushing updates and adding steps credentialing service, message:${error.message}, error:${error.error}`);
            throw error;
        }
    };

    async terminateOnboarding(
    workflowId: string,
    tenantId: string,
    authorization: string
  ): Promise<void> {
    if (!workflowId || !tenantId || !authorization) {
      throw new Error(
        "Missing required parameters: workflowId, tenantId, or authorization"
      );
    }
 
    const authHeader = authorization.startsWith("Bearer ")
      ? authorization
      : `Bearer ${authorization}`;
 
    const url = `${this.baseURL}/v1/api/workflow/${workflowId}/terminate?tenant_id=${tenantId}`;
 
    try {
      const response = await axios.put(
        url,
        { new_status: "Cancelled" },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          timeout: 30000,
        }
      );
 
      console.log(
        `Workflow terminated. ID: ${workflowId}, Status: ${response.status}`
      );
    } catch (error: any) {
      const status = error.response?.status;
 
      if (status === 401) {
        throw new Error("Unauthorized: Invalid token");
      } else if (status === 403) {
        throw new Error("Forbidden: Access denied");
      } else if (status === 404) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }
 
      throw new Error(`Failed to terminate workflow: ${error.message}`);
    }
  }
 
}

export const credentialingService = new CredentialingService();
