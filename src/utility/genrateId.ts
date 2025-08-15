import { Model, ModelStatic, QueryTypes } from 'sequelize';
import { sequelize } from '../config/instance';
const config_db = process.env.CONFIG_DB ?? "`qa_vms_configurator`";
async function generateId(
    program_id: string,
    model: ModelStatic<Model>,
    prefix: string
): Promise<string> {
    const programQuery = `SELECT unique_id FROM ${config_db}.programs WHERE id = :program_id;`;
          const [program] = await sequelize.query<{ unique_id: any }>(programQuery, {
            replacements: { program_id:program_id },
            type: QueryTypes.SELECT,
          });

    if (!program) {
        throw new Error('Program not found');
    }

    if (!program.unique_id) {
        throw new Error('Program unique_id is missing');
    }

    const programCode = program.unique_id.toUpperCase();

    const count = await model.count({
        where: { program_id }
    });

    const nextNumber = (count + 1).toString().padStart(8, '0');
    const generatedId = `${programCode}-${prefix}-${nextNumber}`;

    return generatedId;
}

export default generateId;
