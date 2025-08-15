import { DataTypes, Model } from 'sequelize';
import { sequelize } from "../config/instance";
import { beforeSave } from '../hooks/timeFormatHook';
import { convertEmptyStringsToNull } from '../hooks/convertEmptyStringsToNull';
import InterviewRepository from '../repositories/interview.repository';
const interviewRepository = new InterviewRepository();
class OfferModel extends Model {
    id!: string;
    program_id!: string;
    offer_code!: string;
    candidate_id: any;
    vendor_id: any;
    onboarding_flow_id: any;
    checklist_entity_id: any;
    checklist_version: any;
    job_id: any;
    submission_id: any;
    status!: string
    created_on!: number
    created_by!: string
}

OfferModel.init({
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
    },
    status: {
        type: DataTypes.STRING,
        allowNull: true
    },
    program_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    onboarding_flow_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    checklist_entity_id: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    checklist_version: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    parent_offer_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    is_remote_worker: {
        type: DataTypes.BOOLEAN,
        allowNull: true
    },
    worker_start_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    candidate_source: {
        type: DataTypes.STRING,
        allowNull: true
    },
    job_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    worker_email: {
        type: DataTypes.STRING,
        allowNull: true
    },
    worker_classification: {
        type: DataTypes.STRING,
        allowNull: true
    },
    work_location: {
        type: DataTypes.STRING,
        allowNull: true
    },
    timesheet_type: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    timesheet_manager: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    job_manager: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    unique_id: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    expense_manager: {
        type: DataTypes.JSON,
        allowNull: true
    },
    candidate_id: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    end_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    start_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    financial_details: {
        type: DataTypes.JSON,
        allowNull: true
    },
    offer_code: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    ot_exempt: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    expense_allowed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    notes: {
        type: DataTypes.STRING,
        allowNull: true
    },
    is_workflow: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    submission_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    managed_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    created_on: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        defaultValue: Date.now()
    },
    updated_on: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        defaultValue: Date.now()
    },
    created_by: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    is_deleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    vendor_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    assignment_creation_info: {
        type: DataTypes.JSON,
        allowNull: true
    },
    is_rate_above_max_limit: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
}, {
    sequelize,
    tableName: 'offers',
    timestamps: false,
    hooks: {
        beforeValidate: async (instance) => {
            convertEmptyStringsToNull(instance);
            if (!instance.offer_code && instance.program_id) {
                const programData = await interviewRepository.programQuery(
                    instance.program_id
                );
                if (programData.length > 0 && programData[0].unique_id) {
                    const programPrefix = programData[0].unique_id
                        .substring(0, 3)
                        .toUpperCase();
                    const count = await OfferModel.count({ where: { program_id: instance.program_id } });
                    const sequence = (count + 1).toString().padStart(5, "0");
                    instance.offer_code = `${programPrefix}-OFF-${sequence}`;
                }
            }
        },
    },
});

export default OfferModel;
