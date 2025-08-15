import axios from 'axios';
import { NotificationDataPayload } from '../interfaces/noifications-data-payload.interface';
import { EmailRecipient } from '../interfaces/email-recipient';
import { QueryTypes, Sequelize } from "sequelize";

// import { sequelize } from '../plugins/sequelize';
import { sequelize } from '../config/instance';
import { decodeToken } from '../middlewares/verifyToken';
import { databaseConfig } from '../config/db';
import { Json } from 'sequelize/types/utils';

const config_db = databaseConfig.config.database_config;

// get all user associted to the hierarchy for the same program
export async function getUsersWithHierarchy(
    sequelize: any,
    programId: string | null,
    userType: string | null,
    hierarchies: string[] | null
): Promise<EmailRecipient[]> {
    // Prepare hierarchy array as a JSON string
    const hierarchyJson = JSON.stringify(hierarchies);

    // Query to fetch user data
    const result: any[] = await sequelize.query(
        `
        SELECT user.email,
            user.first_name,
            user.middle_name,
            user.last_name,
            user.user_type
        FROM ${config_db}.user user
        WHERE user.program_id = :program_id 
        AND LOWER(user.status) = LOWER(:status)
        AND user.user_type = :userType
        AND (
            user.is_all_hierarchy_associate = 1 
            OR JSON_CONTAINS(user.associate_hierarchy_ids, :hierarchy_ids, '$')
        )
        AND EXISTS (
            SELECT 1 FROM ${config_db}.user_mappings 
            WHERE user_mappings.user_id = user.user_id
        )`,
        {
            replacements: {
                program_id: programId,
                userType: userType,
                hierarchy_ids: hierarchyJson,
                status:"active"
            },
            type: QueryTypes.SELECT,
        }
    );

    // If the query returns results, map and return them as EmailRecipient objects
    if (result.length > 0) {
        const emailRecipientList: EmailRecipient[] = result.map((user: any) => ({
            email: user.email || null,
            first_name: user.first_name || null,
            middle_name: user.middle_name || null,
            last_name: user.last_name || null,
            userType: user.user_type || null
        }));

        return emailRecipientList;
    }

    // Default return when no result is found
    return [];
}


export async function getProgramType(sequelize: any, programId: string): Promise<string | null> {
    const result: any[] = await sequelize.query(
        `SELECT type
         FROM ${config_db}.programs AS program
         WHERE program.id = :program_id;`,
        {
            replacements: { program_id: programId },
            type: QueryTypes.SELECT
        }
    );

    if (result.length > 0) {
        return result[0].type;
    }

    return null;
}



export async function getJobManagerEmail(sequelize: any, userId: string): Promise<EmailRecipient | null> {
    const result: any[] = await sequelize.query(
        `SELECT user.email,
                    user.first_name as first_name,
                    user.middle_name as middle_name,
                    user.last_name as last_name,
                    user.user_type as user_type
            FROM ${config_db}.user AS user
            WHERE user.user_id = :user_id;`,
        {
            replacements: { user_id: userId },
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
            userType: user.user_type || null
        };

        return emailRecipient;
    }

    return null; // Return null if no job manager is found
}

export async function getUsersByMetaValues(sequelize: any, metaValues: string[]): Promise<EmailRecipient[]> {
    const userQuery = `
            SELECT id, first_name, last_name, email, user_type
            FROM ${config_db}.user
            WHERE user_id IN (:meta_values)
              AND LOWER(status) = 'active';`;

    const userResults = await sequelize.query(userQuery, {
        type: QueryTypes.SELECT,
        replacements: { meta_values: metaValues },
    });

    return userResults.map((user: any) => ({
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        userType: user.user_type,
    }));
}
export async function notifyJobManager(
    sendNotification: Function,
    notificationPayload: NotificationDataPayload,
    recipientEmail: object[] | null
): Promise<void> {
    if (recipientEmail) {
        await sendNotification(notificationPayload);
        console.info("Notification sent to:", recipientEmail);
    } else {
        console.info("No recipient email found, notification skipped.");
    }
}

export async function fetchUsersBasedOnHierarchy(
    sequelize: any,
    allPayload: { hierarchy_ids: any[], program_id: any, user_type: string[], user_id: any }
): Promise<EmailRecipient[]> {
    try {
        const { hierarchy_ids, program_id, user_type, user_id } = allPayload;

        // Query to fetch users based on hierarchy_ids and program_id
        const query = `
        SELECT u.email,
               u.first_name,
               u.middle_name,
               u.last_name,
               u.user_type
        FROM ${config_db}.user u
        WHERE u.program_id = :program_id
          AND u.user_type IN (:user_type)
          AND u.user_id = :user_id;
        `;

        // Execute the query
        const users = await sequelize.query(query, {
            type: QueryTypes.SELECT,
            replacements: {
                program_id: program_id,
                user_type: user_type,
                hierarchy_ids: hierarchy_ids,
                user_id: user_id
            }
        });

        // Map the results to EmailRecipient format
        const emailRecipientList: EmailRecipient[] = users.map((user: any) => ({
            email: user.email || null,
            first_name: user.first_name || null,
            middle_name: user.middle_name || null,
            last_name: user.last_name || null,
            userType: user.user_type || null,
        }));

        return emailRecipientList; // Return the list of email recipients
    } catch (error) {
        console.error("Error fetching users:", error);
        throw new Error("Error fetching users based on hierarchy and program_id.");
    }
}


export async function getMspClientEmail(programId: string): Promise<EmailRecipient[]> {
    if (!programId) {
        return [];
    }

    try {
        const result = await sequelize.query(
            `SELECT t.primary_contact
             FROM ${config_db}.programs p
             JOIN ${config_db}.tenant t ON p.msp_id = t.id
             WHERE p.id = :program_id;`,
            {
                replacements: { program_id: programId },
                type: QueryTypes.SELECT
            }
        ) as [{ primary_contact: { email?: string; first_name?: string; last_name?: string } | null }];

        if (!result || result === undefined || result === null) {
            return [];
        }

        return result
            .map((item) => {
                if (!item.primary_contact) return null;
                const { email = "", first_name = "", last_name = "" } = item.primary_contact;
                return { email, first_name, last_name };
            })
            .filter(Boolean) as EmailRecipient[];

    } catch (error) {
        console.error("Error fetching MSP client email:", error);
        return [];
    }
}

export async function getProgramVendorsEmail(programId: string): Promise<EmailRecipient[]> {
    try {


        const contacts = await sequelize.query(
            `SELECT
           JSON_UNQUOTE(JSON_EXTRACT(contact, '$[0].email')) AS email,
           JSON_UNQUOTE(JSON_EXTRACT(contact, '$[0].first_name')) AS first_name,
           JSON_UNQUOTE(JSON_EXTRACT(contact, '$[0].last_name')) AS last_name
         FROM ${config_db}.program_vendors
         WHERE program_id = :program_id
            AND LOWER(status) = 'active';`,

            {
                replacements: { program_id: programId },
                type: QueryTypes.SELECT,
                logging: console.log
            }
        ) as { email: string, first_name: string, last_name: string }[];
        return contacts;
    } catch (error) {
        console.error('Error fetching program vendor contact details:', error);
        throw error;
    }
}

export async function getClientEmail(programId: string): Promise<EmailRecipient[]> {
    if (!programId) {
        return [];
    }

    try {
        const result = await sequelize.query(
            `SELECT t.primary_contact
             FROM ${config_db}.programs p
             JOIN ${config_db}.tenant t ON p.client_id = t.id
             WHERE p.id = :program_id;`,
            {
                replacements: { program_id: programId },
                type: QueryTypes.SELECT
            }
        ) as [{ primary_contact: { email?: string; first_name?: string; last_name?: string } | null }];

        if (!result || result === undefined || result === null) {
            return [];
        }

        return result
            .map((item) => {
                if (!item.primary_contact) return null;
                const { email = "", first_name = "", last_name = "" } = item.primary_contact;
                return { email, first_name, last_name };
            })
            .filter(Boolean) as EmailRecipient[];

    } catch (error) {
        console.error("Error fetching client email:", error);
        return [];
    }
}




export async function getUserType(token: string) {
    try {
        const authenticatedUser = await decodeToken(token);
        if (!authenticatedUser) {
            console.error("Unauthorized - Invalid token:", authenticatedUser);
            return null;
        }

        const userQuery = `
        SELECT id, user_type, email
        FROM ${config_db}.user
        WHERE user_id = :user_id
        AND LOWER(status) = 'active'
        LIMIT 1
      `;

        const userData: any = await sequelize.query(userQuery, {
            type: QueryTypes.SELECT,
            replacements: { user_id: authenticatedUser.sub }
        });
        if (!userData) {
            return null;
        }
        return userData[0]?.user_type?.toLocaleUpperCase();
    } catch (error) {
        console.error("Error authenticating user:", error);
        return null;
    }
}

export async function getJobData(
    sequelize: Sequelize,
    jobId: string | null
): Promise<{ hierarchy_ids: Json; job_id: string; job_manager_id: string; job_name: string }[]> {
    try {
        if (!jobId) {
            console.warn("jobId is null or undefined, returning empty array.");
            return [];
        }

        const jobData = await sequelize.query(
            `SELECT j.hierarchy_ids, j.job_id, j.job_manager_id, j.job_template_id, jt.template_name AS job_name 
             FROM jobs j
             LEFT JOIN ${config_db}.job_templates jt ON j.job_template_id = jt.id
             WHERE j.id = :job_id;`,
            {
                replacements: { job_id: jobId },
                type: QueryTypes.SELECT,
            }
        ) as [{ hierarchy_ids: Json; job_id: string; job_manager_id: string; job_name: string }];

        return jobData;
    } catch (error) {
        console.error("Error fetching job data:", error);
        throw error;
    }
}


export async function getOfferData(sequelize: Sequelize, offerid: string): Promise<{ offer_code: string }[]> {
    try {
        const offerData = await sequelize.query(
            `SELECT offer_code
         FROM offers
         WHERE id = :offer_id;`,
            {
                replacements: { offer_id: offerid },
                type: QueryTypes.SELECT,
            }
        ) as [{ offer_code: string }];

        return offerData;
    } catch (error) {
        console.error('Error fetching offer data:', error);
        throw error;
    }
}

export async function fetchUserDetils(user_id: string) {
    try {
        const result = await sequelize.query(
            `SELECT first_name, last_name
       FROM ${config_db}.user
       WHERE user_id = :user_id;`,
            {
                replacements: { user_id: user_id },
                type: QueryTypes.SELECT
            }
        ) as [{ first_name: string, last_name: string }];

        return result;
    } catch (error) {
        console.error("Error fetching User Detils :", error);
        throw error;
    }
}


export async function getJobCreator(jobId: string) {
    try {
        const result = await sequelize.query(
            `SELECT u.first_name, u.last_name
         FROM jobs i
         JOIN ${config_db}.user u ON i.created_by = user_id
         WHERE i.id = :job_id;`,
            {
                replacements: { job_id: jobId },
                type: QueryTypes.SELECT,
                logging: console.log, // Logs the raw SQL query with bound values
            }
        ) as [{ first_name: string, last_name: string }];

        return result;
    } catch (error) {
        console.error("Error fetching job creator:", error);
        throw error;
    }
}

export async function getJobTemplateName(jobId: string): Promise<{ name: string }[]> {
    const jobTemplateData = await sequelize.query(
        `SELECT template_name as name 
         FROM ${config_db}.job_templates 
         WHERE id = :job_id;`,
        {
            replacements: { job_id: jobId },
            type: QueryTypes.SELECT,
        }
    ) as [{ name: string }];

    return jobTemplateData;
}


export async function getCandidate(candidateid: string) {
    try {
        const result = await sequelize.query(
            `SELECT first_name, last_name
         FROM ${config_db}.candidates 
             WHERE id = :candidate_id;`,
            {
                replacements: { candidate_id: candidateid },
                type: QueryTypes.SELECT,
                logging: console.log, // Logs the raw SQL query with bound values
            }
        ) as [{ first_name: string, last_name: string }];

        return result;
    } catch (error) {
        console.error("Error fetching candidate ...:", error);
        throw error;
    }
}

export async function getJobDetails(
    sequelize: Sequelize,
    jobId: string
): Promise<{
    id: string,
    hierarchy_ids: Json,
    job_id: string,
    job_manager_id: string,
    job_name: string,
    created_by_first_name: string,
    created_by_last_name: string,
    max_bill_rate: number,
    min_bill_rate: number,
    currency_symbol: string,
    job_template_id: string // Add currency symbol to the return type
}[]> {
    try {
        const jobDetails = await sequelize.query(
            `SELECT 
                j.id as id,
                j.hierarchy_ids, 
                j.job_id, 
                j.job_manager_id,
                jt.template_name AS job_name, 
                u.first_name AS created_by_first_name, 
                u.last_name AS created_by_last_name,
                j.max_bill_rate,
                j.min_bill_rate,
                c.symbol AS currency_symbol,
                jt.id as job_template_id
            FROM jobs j
            LEFT JOIN ${config_db}.job_templates jt ON j.job_template_id = jt.id 
            LEFT JOIN ${config_db}.user u ON j.created_by = u.user_id
            LEFT JOIN ${config_db}.currencies c ON j.currency = c.code
            WHERE j.id = :job_id;`,
            {
                replacements: { job_id: jobId },
                type: QueryTypes.SELECT,
                logging: console.log, // Logs the raw SQL query with bound values
            }
        ) as [{
            id: string,
            hierarchy_ids: Json,
            job_id: string,
            job_manager_id: string,
            job_name: string,
            created_by_first_name: string,
            created_by_last_name: string,
            max_bill_rate: number,
            min_bill_rate: number,
            currency_symbol: string,
            job_template_id: string
        }];

        return jobDetails;
    } catch (error) {
        console.error("Error fetching job details:", error);
        throw error;
    }
}

export async function getCandidateBySubmissionID(id: string): Promise<{ first_name: string; last_name: string; email: string } | null> {
    const [candidateDetails] = await sequelize.query(
        `SELECT c.first_name, c.last_name, c.email
         FROM submission_candidate sc
         JOIN ${config_db}.candidates c ON sc.candidate_id = c.id
         WHERE sc.id = :id;`,
        {
            type: QueryTypes.SELECT,
            replacements: { id }
        }
    ) as [{ first_name: string, last_name: string, email: string }];

    return candidateDetails || null;
}

export async function getSubmissionData(
    sequelize: any,
    workflowID: string
): Promise<{ unique_key: string; job_id: string; created_by: string; first_name: string; last_name: string }[]> {
    const result = await sequelize.query(
        `SELECT 
            w.unique_key, 
            w.job_id, 
            j.created_by, 
            u.first_name, 
            u.last_name
        FROM ${config_db}.workflow AS w
        JOIN jobs AS j ON w.job_id = j.id
        JOIN ${config_db}.user AS u ON j.created_by = u.id
        WHERE w.id = :workflow_id;`,
        {
            replacements: { workflow_id: workflowID },
            type: QueryTypes.SELECT
        }
    ) as [{ unique_key: string; job_id: string; created_by: string; first_name: string; last_name: string }];

    return result;
}

export async function determineUserType(user: any, token: any) {
    if (user?.user_type) return user?.user_type;
    const userData = await getUserType(token);
    return userData?.length ? userData : null;
}

export async function fetchJobDetails(jobId: string): Promise<{
    work_location_name: string;
    work_location_code: string;
    name: string;
    job_template_id: string;
    program_id: string;
}> {
    const jobDetails = await sequelize.query(
        `SELECT  
            jt.template_name AS name, 
            jt.id AS job_template_id, 
            j.program_id,
            wl.name AS work_location_name, 
            wl.code AS work_location_code
        FROM jobs j
        JOIN ${config_db}.job_templates jt ON j.job_template_id = jt.id
        LEFT JOIN ${config_db}.work_locations wl ON j.work_location_id = wl.id
        WHERE j.id = :job_id`,
        {
            replacements: { job_id: jobId },
            type: QueryTypes.SELECT,
            logging: console.log,
        }
    ) as {
        work_location_name: string;
        work_location_code: string;
        name: string;
        job_template_id: string;
        program_id: string;
    }[];

    return jobDetails[0];
}

export function formatDate(timestamp: string | number | null | undefined, timezone?: string): string {
    if (!timestamp) return "NA";

    const date = new Date(Number(timestamp) < 1e12 ? Number(timestamp) * 1000 : Number(timestamp));
    if (isNaN(date.getTime())) return "NA";

    return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
}

export function formatTime(timeString: string | null | undefined): string {
    try {
        if (!timeString) return "NA";

        const dateUTC = new Date(timeString);
        if (isNaN(dateUTC.getTime())) return "NA"; 

        const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
        const dateIST = new Date(dateUTC.getTime() + istOffsetMs);

        let hours = dateIST.getHours();
        const minutes = dateIST.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';

        hours = hours % 12;
        hours = hours ? hours : 12; 

        const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes
            .toString()
            .padStart(2, '0')} ${ampm}`;

        return formattedTime;
    } catch (err) {
        console.error("Error formatting time:", err);
        return "NA";
    }
}

export async function getVendorName(vendorId: any): Promise<{ vendor_name: string }[]> {
    const vendorData = await sequelize.query(
        `SELECT REPLACE(vendor_name, '_', ' ') AS vendor_name 
         FROM ${config_db}.program_vendors 
         WHERE tenant_id = :vendor_id;`,
        {
            replacements: { vendor_id: vendorId },
            type: QueryTypes.SELECT,
            logging: console.log,
        }
    ) as [{ vendor_name: string }];

    return vendorData;
}


export async function getPerIdentifiedCandidate(jobId: string) {
    const candidates = await sequelize.query(
        `SELECT 
            jc.first_name, 
            jc.last_name
        FROM job_candidate jc
        WHERE jc.job_id = :job_id;`,
        {
            replacements: { job_id: jobId },
            type: QueryTypes.SELECT,
            logging: console.log,
        }
    ) as [{ first_name: string, last_name: string }];
    return candidates;
}



export async function getJobClosedData(jobId: string): Promise<{
    closed_note: string;
    program_id: string;
    closed_reason: string;
    name: string;
}[]> {
    const jobClosedDetails = await sequelize.query(
        `
      SELECT  
          j.closed_note, 
          j.program_id,
          j.closed_reason,
          rc.name
      FROM jobs j
      JOIN ${config_db}.reason_codes rc ON j.closed_reason = rc.id
      WHERE j.id = :job_id;
      `,
        {
            replacements: { job_id: jobId },
            type: QueryTypes.SELECT,
            logging: console.log,
        }
    ) as [{
        closed_note: string;
        program_id: string;
        closed_reason: string;
        name: string;
    }];

    return jobClosedDetails;
}


export async function getAllVendorForDistribution(jobID: any, programId: any): Promise<EmailRecipient[]> {
    const replacements: Record<string, any> = { jobID, programId };

    const query = `SELECT u.email as email, u.first_name as first_name, u.last_name as last_name, um.user_type as user_type
                   FROM ${config_db}.user_mappings um
                   JOIN ${config_db}.program_vendors pv ON pv.tenant_id = um.tenant_id AND pv.program_id = um.program_id
                   JOIN ${config_db}.user u ON u.user_id = um.user_id AND u.program_id = um.program_id
                   JOIN job_distributions j ON j.vendor_id = pv.id AND j.program_id = um.program_id
                   WHERE um.program_id = :programId AND um.user_type = 'vendor' AND j.job_id = :jobID`;

    const jobVendors = await sequelize.query(query, {
        replacements,
        type: QueryTypes.SELECT,
    }) as { email: string, first_name: string, last_name: string, user_type: string }[];

    // Transform the query results to EmailRecipient objects
    return jobVendors.map(vendor => ({
        email: vendor.email,
        first_name: vendor.first_name,
        last_name: vendor.last_name,
        user_type: vendor.user_type
    }));
}

export async function getOfferCreation(userid: string) {
    try {
        const result = await sequelize.query(
            `SELECT first_name, last_name
         FROM ${config_db}.user
         WHERE user_id = :user_id;`,
            {
                replacements: { user_id: userid || "" },
                type: QueryTypes.SELECT
            }
        ) as [{ first_name: string, last_name: string }];

        console.log("Result:", result);
        return result;
    } catch (error) {
        console.error("Error fetching offer creator:", error);
        throw error;
    }
}

export async function getOfferCreator(offerid: string) {
    try {
        const result = await sequelize.query(
            `SELECT u.first_name, u.last_name
         FROM offers i
         JOIN ${config_db}.user u ON i.created_by = u.user_id
         WHERE i.id = :offer_id;`,
            {
                replacements: { offer_id: offerid },
                type: QueryTypes.SELECT
            }
        ) as [{ first_name: string, last_name: string }];

        console.log("Result:", result);
        return result;
    } catch (error) {
        console.error("Error fetching offer creator:", error);
        throw error;
    }
}
export async function getAllDistributedProgramVendor(jobID: any, programId: any): Promise<Set<string>> {
    const replacements: Record<string, any> = { jobID, programId };

    const query = `SELECT DISTINCT pv.id as vendorId
                   FROM ${config_db}.user_mappings um
                   JOIN ${config_db}.program_vendors pv ON pv.tenant_id = um.tenant_id AND pv.program_id = um.program_id
                   JOIN ${config_db}.user u ON u.user_id = um.user_id AND u.program_id = um.program_id
                   JOIN job_distributions j ON j.vendor_id = pv.id AND j.program_id = um.program_id
                   WHERE um.program_id = :programId 
                     AND um.user_type = 'vendor' 
                     AND j.job_id = :jobID`;

    const jobVendors = await sequelize.query(query, {
        replacements,
        type: QueryTypes.SELECT,
    }) as { vendorId: string }[];
    // Transform the query results to vendor list objects
    return new Set(jobVendors.map(vendor => vendor.vendorId));
}



