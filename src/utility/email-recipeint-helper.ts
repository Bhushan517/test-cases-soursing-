
import { getClientEmail, getJobManagerEmail, getMspClientEmail, getProgramVendorsEmail, getUsersWithHierarchy } from "./notification-helper";

export async function getRecipientEmailList(program_id: string, programType: string, job: { dataValues: { hierarchy_ids: any; }; }, sequelize: any) {
    let recipientEmailList = [];

    try {
        const emailList = await getUsersWithHierarchy(
            sequelize,
            program_id,
            programType, // Replace null with default value if needed
            job.dataValues.hierarchy_ids ?? []  // Replace null with an empty array
        );

        if (emailList) {
            recipientEmailList.push(...emailList);
        }
    } catch (error) {
        console.error("Error while fetching recipient email list:", error);
        throw error; // Rethrow or handle error appropriately
    }

    return recipientEmailList;
}


export async function getRecipientEmailDetils(sequelize: any, program_id: string, programType: string, jobData: any) {
    const recipientEmailList = [];

    const clientEmails = await getClientEmail(program_id);
    if (clientEmails) {
        recipientEmailList.push(...clientEmails);
    }
    // Get hierarchy users' emails
    const emailList = await getUsersWithHierarchy(
        sequelize,
        program_id,
        programType,
        jobData.hierarchy_ids ?? []
    );
    if (emailList) {
        recipientEmailList.push(...emailList);
    }

    // Get job manager email
    const manager = await getJobManagerEmail(sequelize, jobData.job_manager_id);
    if (manager) {
        recipientEmailList.push({
            email: manager?.email || "",
            first_name: manager?.first_name || "",
            last_name: manager?.last_name || "",
        });
    }

    return recipientEmailList;
}



export async function getRecipientEmails(program_id: string, programType: string, jobDatas: { hierarchy_ids: any; }, sequelize: any) {
    let recipientEmailList = [];

    // Get MSP client email list
    const MSP = await getMspClientEmail(program_id);
    if (MSP) {
        recipientEmailList.push(...MSP);
    }
    // Get user email list with hierarchy
    const emailList = await getUsersWithHierarchy(
        sequelize,
        program_id,
        programType, // Replace null with default value
        jobDatas.hierarchy_ids ?? []
    );

    if (emailList) {
        recipientEmailList.push(...emailList);
    }

    return recipientEmailList;
}


export async function getRecipients(sequelize: any, program_id: string, programType: string, jobDatas: { hierarchy_ids: any; job_manager_id: string; }) {
    const recipientEmailList = [];

    // Get client emails
    const clientEmails = await getClientEmail(program_id);
    if (clientEmails) {
        recipientEmailList.push(...clientEmails);
    }

    // Get users with hierarchy
    const emailList = await getUsersWithHierarchy(
        sequelize,
        program_id,
        programType,
        jobDatas.hierarchy_ids ?? []
    );
    if (emailList) {
        recipientEmailList.push(...emailList);
    }

    // Get job manager email
    const manager = await getJobManagerEmail(sequelize, jobDatas.job_manager_id);
    if (manager) {
        recipientEmailList.push({
            email: manager.email || "",
            first_name: manager.first_name || "",
            last_name: manager.last_name || "",
        });
    }

    return recipientEmailList;
}


export async function fetchRecipientEmails(program_id: string, programType: string, jobDatas: { hierarchy_ids: any; }, sequelize: any) {
    let recipientEmailList = [];

    // Fetch vendor emails
    const vendorEmails = await getProgramVendorsEmail(program_id);
    if (vendorEmails) {
        recipientEmailList.push(...vendorEmails);
    }
    // Fetch hierarchy-based emails
    const hierarchyEmails = await getUsersWithHierarchy(
        sequelize,
        program_id,
        programType,
        jobDatas.hierarchy_ids ?? []
    );
    if (hierarchyEmails) {
        recipientEmailList.push(...hierarchyEmails);
    }

    return recipientEmailList;
}


export async function getEmailsRecipient(program_id: string, sequelize: any, programType: string, jobData: { hierarchy_ids: any; }[]) {
    const recipientEmailList = [];

    // Fetch MSP client emails
    const MSP = await getMspClientEmail(program_id);
    if (MSP) {
        recipientEmailList.push(...MSP);
    }
    // Fetch user emails based on hierarchy
    const emailList = await getUsersWithHierarchy(
        sequelize,
        program_id,
        programType, // Replace null with default value
        jobData[0].hierarchy_ids ?? [] // Replace null with an empty array
    );

    if (emailList) {
        recipientEmailList.push(...emailList);
    }

    return recipientEmailList;
}


export async function getRecipientList(program_id: string, sequelize: any, programType: string, jobData: { hierarchy_ids: any; job_manager_id: string; }) {
    const recipientEmailList = [];


    // Get client email
    let client = await getClientEmail(program_id);
    if (client) {
        recipientEmailList.push(...client);
    }
    // Get users with hierarchy (safe access for hierarchy_ids)
    const emailList = await getUsersWithHierarchy(
        sequelize,
        program_id,
        programType,
        jobData?.hierarchy_ids ?? [] // Safe access with optional chaining
    );
    if (emailList) {
        recipientEmailList.push(...emailList);
    }

    // Get manager email
    let manager = await getJobManagerEmail(sequelize, jobData?.job_manager_id);
    recipientEmailList.push({
        email: manager?.email || "",
        first_name: manager?.first_name || "",
        last_name: manager?.last_name || " ",
    });

    return recipientEmailList;
}