import { Sequelize } from 'sequelize';
import jobModel from '../models/job.model';
import JobRepository from "../repositories/job.repository";
import { sequelize } from '../config/instance';
const jobRepositories = new JobRepository()

export default async function generatedJobCode(
  program_id: string,
): Promise<string | null> {
  const transaction = await sequelize.transaction(); 
  try {
    const programResult = await jobRepositories.programQuery(program_id);

    if (!programResult?.length) {
      throw new Error('Program not found');
    }

    const programName = programResult[0].name.replace(/\s+/g, '');
    const programCode = programName.slice(0, 3).toUpperCase();

    const lastEntry = await jobModel.findOne({
      where: { program_id },
      order: [['created_on', 'DESC']],
      attributes: ['job_id'],
      transaction,
    });

    let nextNumber = '001';

    if (lastEntry?.job_id) {
      const lastCode = lastEntry.job_id.split('-').pop();
      const incrementedNumber = parseInt(lastCode ?? '0', 10) + 1;
      nextNumber = incrementedNumber.toString().padStart(3, '0');
    }

    const uniqueCode = `${programCode}-JB-${nextNumber}`;

    await transaction.commit(); 
    return uniqueCode;
  } catch (error) {
    await transaction.rollback(); 
    console.error(error);
    return null;
  }
}


export const generateRandomCode = (): string => {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
};
