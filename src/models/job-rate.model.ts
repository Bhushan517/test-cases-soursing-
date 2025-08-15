import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/instance";
import jobModel from "./job.model";


class JobRateModel extends Model { }

JobRateModel.init(
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
        bill_rate: {
            type: DataTypes.JSON,
            allowNull: false,
        },
        pay_rate: {
            type: DataTypes.JSON,
            allowNull: false,
        },
        rate_type_id: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        abbreviation: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        billable: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
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
            allowNull: true
        },
        updated_by: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            allowNull: true
        },
        created_on: {
            type: DataTypes.BIGINT.UNSIGNED,
            defaultValue: Date.now()
        },
        updated_on: {
            type: DataTypes.BIGINT.UNSIGNED,
            defaultValue: Date.now()
        },
    },
    {
        sequelize,
        tableName: "job_rate_type",
        modelName: "JobRateModel",
        timestamps: false
    }
);


sequelize.sync()
JobRateModel.belongsTo(jobModel, { foreignKey: 'job_id', as: 'jobs' });
export default JobRateModel;
