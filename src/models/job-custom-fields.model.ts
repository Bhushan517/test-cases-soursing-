import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/instance";
import jobModel from "./job.model";

class jobCustomfieldsModel extends Model {
    custom_field_id: any;
}

jobCustomfieldsModel.init(
    {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
        },
        program_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        job_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'jobs',
                key: 'id'
            }
        },
        custom_field_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        value: {
            type: DataTypes.JSON,
            allowNull: false,
        },
        is_enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        created_by: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            allowNull: false,
        },
        updated_by: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            allowNull: false,
        },
        created_on: {
            type: DataTypes.BIGINT.UNSIGNED,
            defaultValue: Date.now(),
            allowNull: false,
        },
        updated_on: {
            type: DataTypes.BIGINT.UNSIGNED,
            defaultValue: Date.now(),
            allowNull: false,
        },
    },
    {
        sequelize,
        tableName: "job_custom_fields",
        timestamps: false,
    }
);

sequelize.sync();
jobCustomfieldsModel.belongsTo(jobModel, { foreignKey: 'job_id', as: 'jobs' });
export default jobCustomfieldsModel;