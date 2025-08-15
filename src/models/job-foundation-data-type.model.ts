import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/instance";
import jobModel from "./job.model";


class JobFoundationDataTypeModel extends Model {
    foundation_data_type_id: any;
    foundation_data_ids: any;
    id: any;
}

JobFoundationDataTypeModel.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            allowNull: false,
            primaryKey: true,
        },
        job_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'jobs',
                key: 'id',
            },
        },
        program_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        foundation_data_type_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        foundation_data_ids: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        is_enabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        created_by: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            allowNull: true,
        },
        updated_by: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            allowNull: true,
        },
        created_on: {
            type: DataTypes.BIGINT.UNSIGNED,
            defaultValue: Date.now(),
            allowNull: true,

        },
        updated_on: {
            type: DataTypes.BIGINT.UNSIGNED,
            defaultValue: Date.now(),
            allowNull: true,
        },
    },
    {
        sequelize,
        tableName: "job_master_data",
        timestamps: false,
    }
);

sequelize.sync()
JobFoundationDataTypeModel.belongsTo(jobModel, { foreignKey: 'job_id', as: 'jobs' });
export default JobFoundationDataTypeModel;