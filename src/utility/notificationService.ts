import axios from 'axios';
import { NotificationDataPayload } from '../interfaces/noifications-data-payload.interface'
import { EmailRecipient } from '../interfaces/email-recipient';
import { databaseConfig } from '../config/db';
import { TenantConstant } from './tenant-constant';
import { getJobManagerEmail } from './notification-helper';
import sequelize from 'sequelize/types/sequelize';
const config_base_url = databaseConfig.config.config_url;
const auth_base_url = databaseConfig.config.auth_url;
const notification_url = databaseConfig.config.notification_url;

function validateToken(token: string | undefined): boolean {
  if (!token) {
    console.error('Notification token is not defined.');
    return false;
  }
  return true;
}

export async function sendNotification(payload: NotificationDataPayload): Promise<void> {
  const token = payload.token;
  const userId = payload.userId;
  const programData = await fetchProgramDetails(token, payload.program_id);

  if (!programData) {
    console.error("Program not found for ID:", payload.program_id);
    return;
  }
  const program = programData.data as any
  const tenent_id = program.client.id || program.msp.id;
  if (!tenent_id) {
    console.error("Tenant ID is missing in the payload.");
    return;
  }



  const result: any = await fetchTenantDetails(token, tenent_id);

  if (!result) {

    return;
  }
  const tenantData: any = result.tenant_data;
  let tenantLogo = tenantData.logo;
  let name = tenantData.name;
  let user: any;
  const type = payload.payload.user_type;


  //TODO : remove the auth db call, this is temporay solution, the super user should exist in config db too
  const userData = await fetchUserDetails(type, { token, userId });

  if (!userData) {
    console.error("User not found for program ID:", payload.program_id, "and user ID:", payload.userId);
    return;
  }

  if (!notification_url) {
    console.error('Notification URL is not defined in environment variables.');
    return;
  }

  if (!validateToken(payload.token)) {
    return;
  }

  const data = payload.payload;

  if (payload.recipientEmail.length > 0 && type?.toLocaleUpperCase() != TenantConstant.SUPER_USER.toLocaleUpperCase()) {
    payload.recipientEmail.forEach((element: any) => {
      Object.assign(data, {
        fullName: `${element.first_name} ${element.middle_name || ""} ${element.last_name}`,
        created_by_first_name: payload.payload.created_by_first_name,
        created_by_last_name: payload.payload.created_by_last_name,
        logo_url: tenantLogo,
        name: name,
        interview_id: payload.payload.interview_id,
        job_id: payload.payload.job_id,
        candidate_first_name: payload.payload.candidate_first_name,
        candidate_last_name: payload.payload.candidate_last_name,
        status: payload.payload.status,
        candidate_phone: payload.payload.candidate_phone,
        job_name: payload.payload.job_name,
        interview_cancel_reason: payload.payload.interview_cancel_reason,
        interview_notes: payload.payload.interview_notes,
        rejected_by_first_name: userData.first_name,
        rejected_by_last_name: userData.last_name,
      });
      const emailData = element.email;

      const notificationData = {
        entityRefId: payload.entityRefId,
        program_id: payload.program_id,
        traceId: payload.traceId,
        eventCode: payload.eventCode,
        channels: [
          "EMAIL"
        ],
        recipient: {
          email: {
            to: [
              {
                email: emailData,
              }
            ],
            sender: {
              email: "noreply@simplifyvms.com",
            }
          }
        },
        payload: data,
        userId: payload.userId ?? "",
        language: "en",
        roleRecipient: payload.roleRecipient,
        role: type
      };
      try {
        //console.log('payload : ', notificationData);
        const response = axios.post(
          `${notification_url}/notification-message/`, notificationData,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${payload.token}`,
            },
          }
        );


      } catch (error: any) {
        console.error('Failed to send notification:', error?.message);
      }
    });
  }

}

export async function fetchTemplate(payload: any, tenantId: string) {
  try {
    const response = await axios.get(
      `${notification_url}/template/search-template`,
      {
        headers: {
          Authorization: `Bearer ${payload.token}`,
        },
        params: {
          refId: tenantId,
          code: payload.event_code,
          language: 'en',
          role: payload.role
        }
      }
    );
    return response?.data;
  } catch (error: any) {
    console.error('Failed to fetch template:', error?.message);
    return null;
  }
}

export async function fetchProgramDetails(token: string, programId: string): Promise<any> {
  const response = await axios.get(
    `${config_base_url}/v1/api/program/getbyid/${programId}`,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return response?.data;
}

export async function fetchTenantDetails(token: string, tenantId: string): Promise<any> {

  const response = await axios.get(
    `${config_base_url}/v1/api/tenant/${tenantId}`,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response?.data;
}

export async function fetchUserDetails(type: string, payload: { token: string, userId: string }): Promise<any> {
  try {
    console.log('userId : ', payload.userId);
    if (type === 'super_user') {
      const response = await axios.get(
        `${auth_base_url}/v1/api/user`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${payload.token}`,
          },
        }
      );
      return response?.data;
    } else {
      const response = await axios.get(
        `${config_base_url}/v1/api/user/${payload.userId}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${payload.token}`,
          },
        }
      );
      return response?.data;
    }
  } catch (error) {
    console.error("Unable to fetch user details", error);
    return null;
  }
}

export async function fetchAllRoleRecipientTemplatesDetails(allTemplates: any, jobDetails: any) {

  const roleRecipientMap: { [key: string]: string[] } = {};

  if (allTemplates) {
    console.log('All templates information : ', allTemplates);

    allTemplates?.payload?.forEach((template: any) => {
      if (template.recipient && template.recipient.roles) {

        // Get the template role (assuming there's a role field in template)
        const templateRole = template.roleRecipient;

        // Initialize array if it doesn't exist
        if (!roleRecipientMap[templateRole]) {
          roleRecipientMap[templateRole] = [];
        }

        // Iterate through all roles and add each role's id to the corresponding array
        template.recipient.roles.forEach((role: any) => {
          console.log('---------- Role Details --------------', role);

          if (role.id && !roleRecipientMap[templateRole].includes(role.id)) {
            roleRecipientMap[templateRole].push(role.id);
          }
        });
      }
    });
  }

  // Convert map to array of objects with key-value structure
  const roleRecipientArray = Object.entries(roleRecipientMap)?.map(([key, value]) => ({
    key: key,
    value: value
  }));

  return roleRecipientArray;
}

export async function fetchUsersWithRole(roleIds: any, token: any, programId: string, userTypes: any): Promise<any> {
  try {
    let payload: any = {
      'role_ids': roleIds,
      'program_id': programId,
      'user_types': roleIds ? null : Array.of(userTypes) //If roleIds present then only filter based on the roleId
    }
    const response: any = await axios.post(
      `${auth_base_url}/v1/api/user/group-role-mapping/filter`, payload,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        params: {
          'tenant-id': programId,
        }
      }
    );
    const emailRecipients = new Set<EmailRecipient>();
    for (const user of response?.data?.response?.content) {
      emailRecipients.add({
        email: user?.email || null,
        first_name: user?.first_name || null,
        middle_name: user?.middle_name || null,
        last_name: user?.last_name || null,
        userType: user?.user_type || null
      });
    }
    return emailRecipients;
  } catch (error) {
    console.log(error);
    return null;
    //throw new Error("Unable to fetch user details");
  }
}

export async function fetchNotificationTenant(programId: string, token: any) {
  try {
    const response = await axios.get(
      `${notification_url}/tenant/ref-id/${programId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        }
      }
    );
    console.log('tenant reponse from notification service data : -------', response);

    return response?.data;
  } catch (error: any) {
    console.error('Failed to fetch template:', error?.message);
    return null;
    //throw error;
  }
}