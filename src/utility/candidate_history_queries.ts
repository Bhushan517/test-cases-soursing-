import { QueryTypes, Sequelize } from 'sequelize';
import { databaseConfig } from "../config/db";
const config_db = databaseConfig.config.database_config;

export async function getEntityMap(
    sequelize: Sequelize,
    table: string,
    idField: string,
    nameFields: string[],
    ids: string[]
): Promise<Record<string, string>> {
    if (!ids.length) return {};

    const fields = nameFields.join(', ');
    const query = `
        SELECT ${idField} as id, ${fields}
        FROM ${config_db}.${table}
        WHERE ${idField} IN (:ids)
    `;

    const results = await sequelize.query(query, {
        replacements: { ids },
        type: QueryTypes.SELECT,
    });

    const map: Record<string, string> = {};
    for (const record of results as any[]) {
        const fullName = nameFields
            .map(field => record[field])
            .filter(Boolean)
            .join(' ');
        if (record.id && fullName) {
            map[record.id] = fullName;
        }
    }

    return map;
}


export async function getUserDetails(sequelize: Sequelize, userId: any): Promise<{ first_name: string, last_name: string } | null> {
    try {
        const [user] = await sequelize.query(
            `SELECT first_name, last_name 
     FROM ${config_db}.user 
     WHERE user_id = :userId AND is_enabled = true
LIMIT 1;`,
            {
                replacements: { userId },
                type: QueryTypes.SELECT,
            }
        ) as [{ first_name: string, last_name: string }];

        return user || null;
    } catch (error) {
        console.error('Error fetching user details:', error);
        throw error;
    }
}


export async function getJobTemplateMap(
    sequelize: Sequelize,
    jobIds: string[]
): Promise<Record<string, string>> {
    if (!jobIds.length) return {};

    const rows = await sequelize.query(
        `
        SELECT j.id AS job_id, jt.template_name
        FROM jobs j
        JOIN ${config_db}.job_templates jt ON j.job_template_id = jt.id
        WHERE j.id IN (:jobIds)
        `,
        {
            type: QueryTypes.SELECT,
            replacements: { jobIds },
        }
    );

    const map: Record<string, string> = {};
    for (const row of rows as any[]) {
        map[row.job_id] = row.template_name || 'N/A';
    }

    return map;
}