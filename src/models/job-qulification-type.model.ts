import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/instance";
import jobModel from "./job.model";
// import QualificationTypeModel from "./qualificationTypeModel";

export class JobQulificationType extends Model {
    qulification_type_id: any;
    qulification: any;
    id: any;
}

JobQulificationType.init(
    {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
        },
        job_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: "jobs",
                key: "id",
            },
        },
        program_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        qulification_type_id: {
            type: DataTypes.UUID,
            allowNull: false,         
        },
        qulification: {
            type: DataTypes.JSON,
            allowNull: false,
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        is_enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
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
        tableName: "job_qualification_types",
        timestamps: false,
    }
);

sequelize.sync()
// JobQulificationType.belongsTo(QualificationTypeModel, { foreignKey: 'qulification_type_id', as: 'qualification_types' });
JobQulificationType.belongsTo(jobModel, { foreignKey: 'job_id', as: 'jobs' });

export default JobQulificationType;