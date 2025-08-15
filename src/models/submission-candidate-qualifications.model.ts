import { DataTypes, Model } from 'sequelize';
import { sequelize } from "../config/instance";
import jobModel from './job.model';
class SubmissionCandidateQualifications extends Model {
    id: any;
}
SubmissionCandidateQualifications.init(
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
            allowNull: true
        },
        qualification_type_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        qualifications: {
            type: DataTypes.JSON,
            allowNull: true
        },
        submission_candidate_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        candidate_id: {
            type: DataTypes.UUID,
            allowNull: true
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
        created_by: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        updated_by: {
            type: DataTypes.UUID,
            allowNull: true,
        }
    },
    {
        sequelize,
        tableName: 'submission_candidate_qualifications',
        timestamps: false,
    }
);

SubmissionCandidateQualifications.belongsTo(jobModel, { foreignKey: 'job_id' });
export default SubmissionCandidateQualifications;
