import { DataTypes, Model } from 'sequelize';
import { sequelize } from "../config/instance";
import jobModel from './job.model';


class SubmissionCandidateModel extends Model {
    id: any;
    unique_id: any;
    job_id: any;
    candidate_id: any;
    addresses: any;
    is_remote_worker: any;
    job: any;
    jobModel: any;
    jobs: any;
    program_id: any;
    vendor_id: any;
    available_end_date: any;
    available_start_date: any
    onboarding_flow_id: any;
    checklist_entity_id?: string;
    checklist_version?: number;
    resume_url: any;
}

SubmissionCandidateModel.init(
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
        resume_url: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        vendor_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        available_start_date: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        available_end_date: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        is_candidate_work_before: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
        },
        is_remote_worker: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
        },
        candidate_source: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        addresses: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        employment_status: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        status: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: "Pending Shortlist"
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        documents: {
            type: DataTypes.JSON,
            allowNull: true
        },
        financial_detail: {
            type: DataTypes.JSON,
            allowNull: true
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
        candidate_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        unique_id: {
            type: DataTypes.STRING,
            allowNull: true
        },
        checklist_entity_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        checklist_version: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        worker_classification: {
            type: DataTypes.STRING,
            allowNull: true
        },
        onboarding_flow_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        created_by: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        updated_by: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        scores: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        is_duplicate_submission: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        is_rate_above_max_limit: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    },
    {
        sequelize,
        tableName: 'submission_candidate',
        timestamps: false,
    }
);

SubmissionCandidateModel.belongsTo(jobModel, { foreignKey: 'job_id', as: 'jobs' });

export default SubmissionCandidateModel;
