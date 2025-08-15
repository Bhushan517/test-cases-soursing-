
import { Op, QueryTypes, Sequelize } from "sequelize";
import { sequelize } from "../config/instance";
import { EmailRecipient } from "../interfaces/email-recipient";
import { getClientEmail, getMspClientEmail, getProgramType, getUsersWithHierarchy } from "./notification-helper";
import { databaseConfig } from '../config/db';
import { NotificationEventCode } from "./notification-event-code";
import { TenantConstant } from "./tenant-constant";
import { logger } from "./loggerServices";
import { fetchUsersWithRole } from "./notificationService";
const config_db = databaseConfig.config.database_config;


export async function getAllInterviewEmailsForClientRecipient(
    sequelize: any,
    interviewId: string,
    candidateId: string | undefined,
    jobID: string,
    eventType: string
): Promise<Set<EmailRecipient>> {
    const emailRecipients = new Set<EmailRecipient>();

    // Fetch job data
    const jobData = await getJobData(jobID);
    if (!jobData || jobData.length === 0) {
        throw new Error("Job data not found");
    }

    const jobManagerId = jobData[0].job_manager_id;
    const participantIds: Set<string> = await getInterviewParticipantsId(interviewId);
    participantIds.add(jobManagerId); // Add job manager to the participant set
    if (eventType === NotificationEventCode.INTERVIEW_ACCEPTED ||
        eventType === NotificationEventCode.INTERVIEW_SCHEDULED) {
        // Add Interviewer
    }

    // Fetch manager, participants, and candidate details in parallel
    const [managers, candidateDetails] = await Promise.all([
        getAllUserData(sequelize, participantIds),
        candidateId ? getCandidateDetails(candidateId) : Promise.resolve(null)
    ]);

    // Add managers to recipients
    if (managers && managers.size > 0) {
        for (const manager of managers) {
            emailRecipients.add(manager);
        }
    }

    // Add candidate details if available
    if (candidateDetails) {
        emailRecipients.add(candidateDetails);
    }

    return emailRecipients;
}


export async function getEmailsForClientRecipient(
    sequelize: any,
    interviewId: string,
    candidateId: string | undefined,
    jobID: string
): Promise<EmailRecipient[]> {

    let jobData, JobName: any = [];
    jobData = await getJobData(jobID)

    const recipientEmailArray: EmailRecipient[] = [];


    let jobManagerId = jobData[0].job_manager_id

    const [manager, participants, candidateDetails] = await Promise.all([
        getJobManagerEmail(sequelize, jobManagerId),
        getInterviewParticipantsEmail(interviewId),
        candidateId ? getCandidateDetails(candidateId) : Promise.resolve(null),
    ]);
    if (manager) {
        recipientEmailArray.push({
            email: manager.email || "",
            first_name: manager.first_name || "",
            last_name: manager.last_name || ""
        });
    }

    if (participants) {
        recipientEmailArray.push(...participants);
    }

    if (candidateDetails) {
        recipientEmailArray.push(candidateDetails);
    }


    return recipientEmailArray;
}

export async function getEmailsForMSPMANAGED(
    sequelize: any,
    programId: string,
    programType: string,
    jobID: string
): Promise<EmailRecipient[]> {
    const recipientEmailArray: EmailRecipient[] = [];

    let jobData, JobName: any = [];
    jobData = await getJobData(jobID)

    const [mspEmails, hierarchyEmails] = await Promise.all([
        getMspClientEmail(programId),
        getUsersWithHierarchy(sequelize, programId, programType, jobData[0].hierarchy_ids),
    ]);

    if (mspEmails) {
        recipientEmailArray.push(...mspEmails);
    }

    if (hierarchyEmails) {
        recipientEmailArray.push(...hierarchyEmails);
    }

    return recipientEmailArray;
}

export async function getAllUserData(
    sequelize: any,
    userIds: Set<string>
): Promise<Set<EmailRecipient>> {
    if (userIds.size === 0) return new Set(); // Return an empty Set if no user IDs provided

    const result: any[] = await sequelize.query(
        `SELECT user.email,
                  user.first_name,
                  user.middle_name,
                  user.last_name,
                  user.user_type
           FROM ${config_db}.user AS user
           WHERE user.user_id IN (:user_ids);`,
        {
            replacements: { user_ids: Array.from(userIds) }, // Convert Set to Array for query
            type: QueryTypes.SELECT
        }
    );

    const emailRecipients = new Set<EmailRecipient>();

    for (const user of result) {
        const emailRecipient: EmailRecipient = {
            email: user.email || null,
            first_name: user.first_name || null,
            middle_name: user.middle_name || null,
            last_name: user.last_name || null,
            userType: user.user_type || null
        };
        emailRecipients.add(emailRecipient);
    }

    return emailRecipients;
}

export async function getAllVendorUserData(
    sequelize: any,
    programId: string,
    tenantIds: Set<string>,
    hierarchies: string[] | null,
    jobId: string
): Promise<Set<EmailRecipient>> {
    const hierarchyJson = JSON.stringify(hierarchies);
    const result: any[] = await sequelize.query(
        `SELECT user.email, user.first_name, user.middle_name, user.last_name, user.user_type 
        FROM ${config_db}.user AS user 
        JOIN ${config_db}.user_mappings AS ugm ON user.user_id = ugm.user_id AND user.program_id = ugm.program_id
        JOIN ${config_db}.program_vendors AS pv ON ugm.program_id = pv.program_id AND ugm.tenant_id = pv.tenant_id
        WHERE ugm.program_id = :programId 
            AND pv.id IN (:tenantIds)
             AND LOWER(user.status) = 'active';`,
        {
            replacements: {
                programId,
                tenantIds: Array.from(tenantIds).flat(),
                hierarchy_ids: hierarchyJson,
                jobId: jobId
            },
            type: QueryTypes.SELECT,
            logging: console.log
        }
    );
    const emailRecipients = new Set<EmailRecipient>();
    for (const user of result) {
        emailRecipients.add({
            email: user?.email || null,
            first_name: user?.first_name || null,
            middle_name: user?.middle_name || null,
            last_name: user?.last_name || null,
            userType: user?.user_type || null
        });
    }

    return emailRecipients;
}


export async function getJobManagerEmail(sequelize: any, jobManagerId: string): Promise<EmailRecipient | null> {
    const result: any[] = await sequelize.query(
        `SELECT user.email,
                  user.first_name,
                  user.middle_name,
                  user.last_name,
                  user.user_type,
                   user.status 
           FROM ${config_db}.user AS user
           WHERE user.user_id = :job_manager_id
            AND LOWER(user.status) = 'active';`,
        {
            replacements: { job_manager_id: jobManagerId },
            type: QueryTypes.SELECT
        }
    );

    if (result.length > 0) {
        const user = result[0]; // Assuming only one job manager is returned
        const emailRecipient: EmailRecipient = {
            email: user.email || null,
            first_name: user.first_name || null,
            middle_name: user.middle_name || null,
            last_name: user.last_name || null,
            userType: user.user_type || null,
            status: user.status || null

        };

        return emailRecipient;
    }

    return null;
}

export async function getInterviewCreator(interviewId: string) {
    try {
        const result = await sequelize.query(
            `SELECT u.first_name, u.last_name, u.email
         FROM interviews i
         JOIN ${config_db}.user u ON i.updated_by = u.user_id
         WHERE i.id = :interview_id;`,
            {
                replacements: { interview_id: interviewId },
                type: QueryTypes.SELECT,
                logging: console.log, // Logs the raw SQL query with bound values
            }
        ) as [{ first_name: string, last_name: string, email: string }];

        return result;
    } catch (error) {
        console.error("Error fetching interview creator:", error);
        throw error;
    }
}

export async function fetchCandidateDetails(candidateId: string): Promise<{ first_name: string; last_name: string; email: string; number: string }> {
    const queryCandidateDetails = `
      SELECT first_name, last_name, email, JSON_UNQUOTE(JSON_EXTRACT(contacts, '$[0].number')) AS number
      FROM ${config_db}.candidates
      WHERE id = :candidateId;
    `;

    const [candidateDetails] = await sequelize.query(queryCandidateDetails, {
        type: QueryTypes.SELECT,
        replacements: { candidateId },
    }) as [{ first_name: string, last_name: string, email: string, number: string }];

    return candidateDetails;
}

export async function getInterviewParticipantsId(interviewId: string): Promise<Set<string>> {
    const queryParticipantIds = `
      SELECT JSON_ARRAYAGG(participant_id) AS participant_ids
      FROM interview_participants
      WHERE interview_id = :interviewId;
    `;

    // Fetch participant IDs
    const [participantIdsData] = await sequelize.query(queryParticipantIds, {
        type: QueryTypes.SELECT,
        replacements: { interviewId },
    }) as [{ participant_ids: string[] | null }];

    // Ensure participantIdsData.participant_ids is an array, otherwise use an empty array
    const participantIdsArray = participantIdsData?.participant_ids ?? [];

    return new Set(participantIdsArray); // Convert array to Set before returning
}


export async function getInterviewParticipantsEmail(interviewId: string,): Promise<EmailRecipient[]> {
    const queryParticipantIds = `
      SELECT JSON_ARRAYAGG(participant_id) AS participant_ids
      FROM interview_participants
      WHERE interview_id = :interviewId;
    `;

    const queryUserEmails = `
      SELECT email, first_name, last_name
      FROM ${config_db}.user
      WHERE user_id IN (:participantIds);
    `;

    // Fetch participant IDs
    const [participantIdsData] = await sequelize.query(queryParticipantIds, {
        type: QueryTypes.SELECT,
        replacements: { interviewId },
    }) as [{ participant_ids: string[] }];

    const participantIdsArray = participantIdsData?.participant_ids || [];

    if (participantIdsArray.length > 0) {
        // Fetch user emails
        const userEmailsData = await sequelize.query(queryUserEmails, {
            type: QueryTypes.SELECT,
            replacements: { participantIds: participantIdsArray },
        }) as { email: string, first_name: string, last_name: string }[];

        // Map results to EmailRecipient structure
        return userEmailsData.map(user => ({
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name
        }));
    }

    return [];
}

export async function getInterviewDetails(interviewId: string) {
    try {
        // Existing queries remain unchanged
        const interviewResult = await sequelize.query(
            `SELECT i.interview_type, i.other_location, i.link, i.location, i.time_zone, i.interview_Id, i.buyer_notes
             FROM interviews i
             WHERE i.id = :interview_id;`,
            {
                replacements: { interview_id: interviewId },
                type: QueryTypes.SELECT
            }
        ) as [{
            interview_type: string,
            other_location: string,
            link: string,
            location: string,
            time_zone: string,
            interview_Id: string,
            buyer_notes: string
        }];

        const interview = interviewResult[0];

        const scheduleResult = await sequelize.query(
            `SELECT 
                isch.interview_date, 
                isch.start_time, 
                isch.end_time
             FROM interview_schedules isch
             WHERE isch.interview_id = :interview_id;`,
            {
                replacements: { interview_id: interviewId },
                type: QueryTypes.SELECT
            }
        ) as { interview_date: string, start_time: string, end_time: string }[];

        // Query to fetch all interviewers' contacts for the given interview_id
        const interviewerContacts = await sequelize.query(
            `SELECT u.contacts
         FROM interview_participants ip
         JOIN ${config_db}.user u ON ip.participant_id = u.user_id
         WHERE ip.interview_id = :interview_id;`,
            {
                replacements: { interview_id: interviewId },
                type: QueryTypes.SELECT
            }
        ) as [{ contacts: { label: string, number: string, isd_code: string, iso_code_2: string } }];

        // Extract all contact numbers from each contact record
        const contactNumbers = interviewerContacts
            .flatMap(ic => (typeof ic.contacts === 'string' ? JSON.parse(ic.contacts) : ic.contacts))
            .map(c => c?.number ? `+${c.isd_code} ${c.number}` : null)
            .filter(Boolean);

        // Consolidating the results
        const details = {
            interview_type: interview.interview_type,
            other_location: interview.other_location,
            link: interview.link,
            start_time: scheduleResult[0]?.start_time,
            end_time: scheduleResult[0]?.end_time,
            time_zone_name: interview?.time_zone,
            interview_id: interview.interview_Id,
            buyer_notes: interview.buyer_notes,
            schedules: scheduleResult,
            interviewer_contact_numbers: contactNumbers // All valid contact numbers
        };
        return details;
    } catch (error) {
        console.error("Error fetching interview details:", error);
        throw error;
    }
}


export async function getJobData(jobId: string): Promise<{ id: any, hierarchy_ids: any; job_id: string; job_manager_id: string, name: string, work_location_id: string, job_template_id: string }[]> {
    const jobData = await sequelize.query(
        `SELECT j.id as id,j.hierarchy_ids as hierarchy_ids, j.work_location_id as work_location_id ,j.job_id as job_id, j.job_manager_id as job_manager_id, jt.template_name as name, jt.id as job_template_id
       FROM jobs j
       JOIN ${config_db}.job_templates jt ON j.job_template_id = jt.id
       WHERE j.id = :job_id;`,
        {
            replacements: { job_id: jobId },
            type: QueryTypes.SELECT,
            logging: console.log, // Logs the raw SQL query with bound values
        }
    ) as [{ id: any, hierarchy_ids: any, job_id: string, job_manager_id: string, name: string, work_location_id: string, job_template_id: string }];

    return jobData;
}

export async function getWorkLocationDetails(workLocationId: string): Promise<{ name: string; code: string } | null> {
    const workLocationData = await sequelize.query(
        `SELECT name, code FROM ${config_db}.work_locations WHERE id = :work_location_id;`,
        {
            replacements: { work_location_id: workLocationId },
            type: QueryTypes.SELECT,
            logging: console.log, // Logs the raw SQL query with bound values
        }
    ) as [{ name: string; code: string }];

    return workLocationData.length > 0 ? workLocationData[0] : null;
}


export async function getCandidateDetails(candidateId: string): Promise<{ first_name: string; last_name: string; email: string }> {
    const [candidateDetails] = await sequelize.query(
        `SELECT first_name, last_name, email
       FROM ${config_db}.candidates
       WHERE id = :candidateId;`,
        {
            type: QueryTypes.SELECT,
            replacements: { candidateId }
        }
    ) as [{ first_name: string, last_name: string, email: string }];

    return candidateDetails;
}

function addEmailsToCollection(emailList: EmailRecipient[], emailRecipients: Map<string, EmailRecipient>, uniqueEmails: Set<string>) {
    emailList.forEach((email) => {
        if (!uniqueEmails.has(email.email)) {
            uniqueEmails.add(email.email);
            emailRecipients.set(email.email, email);
        }
    });
}
export async function gatherInterviewRecipients(sequelize: any, program_id: string, jobManagerId: any, hierarchies: any, userType: string, vendorList: Set<string>, interviewId: string, jobId: string) {
    const emailRecipients = new Map();
    const uniqueEmails = new Set<string>();

    if (vendorList.size > 0) {
        const vendorEmailList = await getAllVendorUserData(sequelize, program_id, vendorList, hierarchies, jobId);
        addEmailsToCollection(Array.from(vendorEmailList), emailRecipients, uniqueEmails);
    }
    if (jobManagerId) {
        const managerData = await getJobManagerEmail(sequelize, jobManagerId);
        if (managerData) addEmailsToCollection([managerData], emailRecipients, uniqueEmails);
    }
    if (program_id) {
        const emails = await getClientEmail(program_id);
        addEmailsToCollection(Array.from(emails), emailRecipients, uniqueEmails);
    }
    const programType = await getProgramType(sequelize, program_id);
    console.log('------programType-------', programType);
    if (programType === "MSP-MANAGED" && userType.toLocaleUpperCase()) {
        console.log('Inside msp block');
        const hierarchyEmails = await getUsersWithHierarchy(sequelize, program_id, TenantConstant.MSP, hierarchies ?? []);
        addEmailsToCollection(hierarchyEmails, emailRecipients, uniqueEmails);
    } else {
        if (interviewId) {
            const emailList = await getInterviewParticipantsEmail(interviewId);
            addEmailsToCollection(emailList, emailRecipients, uniqueEmails);
        }
       
    }

    return Array.from(emailRecipients.values());
}
export async function gatherEmailRecipients(sequelize: any, program_id: string, jobManagerId: any, hierarchies: any, userType: string, vendorList: Set<string>, jobId: string, isVendorOnly: boolean) {
    const emailRecipients = new Map();
    const uniqueEmails = new Set<string>();

     console.log('Vendor size  : ',vendorList.size);

    if (vendorList.size > 0) {
        const vendorEmailList = await getAllVendorUserData(sequelize, program_id, vendorList, hierarchies, jobId);
        console.log('Vendor response : ', vendorEmailList)
        addEmailsToCollection(Array.from(vendorEmailList), emailRecipients, uniqueEmails);
    }
    if(!isVendorOnly) {
        if (jobManagerId ) {
            const managerData = await getJobManagerEmail(sequelize, jobManagerId);
            if (managerData) addEmailsToCollection([managerData], emailRecipients, uniqueEmails);
        }
        const programType = await getProgramType(sequelize, program_id);
        if (programType === "MSP-MANAGED") {
            /* const clientEmailData = await getUsersWithHierarchy(sequelize, program_id, TenantConstant.CLIENT, hierarchies ?? []);
            addEmailsToCollection(clientEmailData, emailRecipients, uniqueEmails); */
    
            const mspEmailData = await getUsersWithHierarchy(sequelize, program_id, TenantConstant.MSP, hierarchies ?? []);
            addEmailsToCollection(mspEmailData, emailRecipients, uniqueEmails);
        } else {
            const clientEmailData = await getUsersWithHierarchy(sequelize, program_id, TenantConstant.CLIENT, hierarchies ?? []);
            addEmailsToCollection(clientEmailData, emailRecipients, uniqueEmails);
    
        }
    }
    return Array.from(emailRecipients.values());
}



export async function fetchInterviewRejector(interviewId: string) {
    try {
        const result = await sequelize.query(
            `SELECT u.first_name, u.last_name, u.email
             FROM interviews i
             JOIN ${config_db}.program_vendors pv ON i.vendor_id = pv.id
             JOIN ${config_db}.user u ON pv.user_id = u.user_id
             WHERE i.id = :interview_id;`,
            {
                replacements: { interview_id: interviewId },
                type: QueryTypes.SELECT,
                logging: console.log,
            }
        ) as { first_name: string; last_name: string; email: string }[];

        return result;
    } catch (error) {
        console.error("Error fetching interview rejector:", error);
        throw error;
    }
}

export async function getProgramVendorsEmailBySubmissionIdAndInterviewId(
    programId: string, 
    interviewId: string
): Promise<EmailRecipient[]> {
    try {
        const contacts = await sequelize.query(
            `SELECT 
                JSON_UNQUOTE(JSON_EXTRACT(contact, '$[0].email')) AS email,
                JSON_UNQUOTE(JSON_EXTRACT(contact, '$[0].first_name')) AS first_name,
                JSON_UNQUOTE(JSON_EXTRACT(contact, '$[0].last_name')) AS last_name                  
            FROM ${config_db}.program_vendors pv                 
            INNER JOIN interviews i ON i.id = :interviewId                 
            LEFT JOIN submission_candidate sc ON sc.id = i.submit_candidate_id                 
            WHERE pv.program_id = :programId 
            AND pv.id = COALESCE(i.vendor_id, sc.vendor_id)`,
            {
                replacements: { 
                    programId: programId, 
                    interviewId: interviewId 
                },
                type: QueryTypes.SELECT
            }
        ) as { email: string, first_name: string, last_name: string }[];
        
        return contacts;
    } catch (error) {
        console.error('Error fetching program vendor contact details:', error);
        throw error;
    }
}

export async function getRoleRecipientUser(program_id: string, roleIds: any, token: any, userType: any) {
    const emailRecipients = new Map();
    const uniqueEmails = new Set<string>();

    const roleUsers = await fetchUsersWithRole(roleIds, token, program_id, userType);
    if(roleUsers) {
        console.log('role users response : ', roleUsers)
        addEmailsToCollection(Array.from(roleUsers), emailRecipients, uniqueEmails);
    }
    return Array.from(emailRecipients.values());
}


