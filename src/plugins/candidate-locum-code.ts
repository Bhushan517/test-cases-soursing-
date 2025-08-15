import { QueryTypes } from 'sequelize';
import candidateLocumNameClearModel from '../models/candidate-locum.model';
import { sequelize } from '../config/instance';
import { databaseConfig } from '../config/db';
const config_db = databaseConfig.config.database_config;

export default async function generatedCandidateLocumCode(program_id: string): Promise<string> {
    const programQuery = `SELECT unique_id FROM ${config_db}.programs WHERE id = :program_id;`;
    const [program] = await sequelize.query<{ unique_id: any }>(programQuery, {
        replacements: { program_id: program_id },
        type: QueryTypes.SELECT,
    });
    if (!program) {
        throw new Error('Program not found');
    }

    if (!program.unique_id) {
        throw new Error('Program unique_id is missing');
    }

    const programCode = program.unique_id.toUpperCase();

    const count = await candidateLocumNameClearModel.count({
        where: { program_id }
    });

    const nextNumber = (count + 1).toString().padStart(4, '0');
    const generatedId = `${programCode}-LMN-${nextNumber}`;

    return generatedId;
}

export const generateRandomCode = (): string => {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
};
