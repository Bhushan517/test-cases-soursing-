import { DataTypes, Model } from 'sequelize';
import { sequelize } from "../config/instance";
import jobModel from './job.model';

class SubmissionCandidateCustomfieldsModel extends Model {
    id: any;
}

SubmissionCandidateCustomfieldsModel.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            allowNull: false,
            primaryKey: true,
        },
        program_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        job_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'jobs',
                key: 'id',
            },
        },
        candidate_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        custom_field_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        submission_candidate_id:{
            type:DataTypes.UUID,
            allowNull:true
        },
        value: {
            type: DataTypes.JSON,
            allowNull: true,
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
        is_deleted: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: false,
        },
        is_enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: true,
        },
        updated_by: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        created_by: {
            type: DataTypes.UUID,
            allowNull: true,
        },
    },
    {
        sequelize,
        tableName: 'submission_candidate_customfields',
        timestamps: false,
    }
);

SubmissionCandidateCustomfieldsModel.belongsTo(jobModel, { foreignKey: 'job_id' });
export default SubmissionCandidateCustomfieldsModel;
