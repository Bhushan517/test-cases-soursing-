import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/instance";
import InterviewRepository from "../repositories/interview.repository";
const interviewRepository = new InterviewRepository()
class JobModel extends Model {
    id: any;
    job_id: any;
    work_location_id: any;
    hierarchy_ids: any;
    job_template_id: any;
    program_id: any;
    job_manager_id: any;
    workLocation: any;
    jobTemplate: any;
    hierarchies: any;
    createdBy: any;
    modifiedBy: any;
    status: any;
    updated_by: any;
    checklist_version!: number;
    checklist_entity_id!: string;
    candidates: any;
    customFields: any;
    foundationDataTypes: any;
    qualifications: any;
    rates: any;
    start_date: any;
    end_date: any;
    static id: any;
    static program_id: any;
    allow_per_identified_s: any;
    no_positions: any;
}

JobModel.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            allowNull: true,
            primaryKey: true,
        },
        job_id: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        program_id: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        primary_hierarchy: {
            type: DataTypes.UUID,
            allowNull: true
        },
        job_manager_id: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        checklist_entity_id: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        checklist_version: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        job_type: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        job_template_id: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        hierarchy_ids: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        work_location_id: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        labor_category_id: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        description_url: {
            type: DataTypes.TEXT,
            allowNull: true,
            defaultValue: null
        },
        additional_attachments: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        start_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        end_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        no_positions: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        expense_allowed: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        currency: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        unit_of_measure: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        min_bill_rate: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
        max_bill_rate: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
        allow_per_identified_s: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        status: {
            type: DataTypes.ENUM(
                'OPEN',
                'CLOSED',
                'DRAFT',
                'SOURCING',
                'PENDING_APPROVAL_SOURCING',
                'PENDING_APPROVAL',
                'PENDING_REVIEW',
                'REJECTED',
                'HALTED',
                'HOLD',
                'FILLED'
            ),
            allowNull: true,
        },
        rate_model: {
            type: DataTypes.ENUM(
                'pay_rate',
                'bill_rate',
                'markup'
            ),
            allowNull: true

        },
        job_level: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        pri_identified_candidates: {
            type: DataTypes.JSON,
            allowNull: true
        },
        source: {
            type: DataTypes.ENUM(
                'TEMPLATE',
                'COPYJOB'
            )
        },
        credentials: {
            type: DataTypes.JSON,
            allowNull: true
        },
        working_days: {
            type: DataTypes.JSON,
            allowNull: true
        },
        shifts_per_week: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        estimated_hours_per_shift: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        shift: {
            type: DataTypes.STRING,
            allowNull: true
        },
        adjustment_type: {
            type: DataTypes.STRING,
            allowNull: true
        },
        adjustment_value: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        budgets: {
            type: DataTypes.JSON,
            allowNull: true
        },
        financial_calculation: {
            type: DataTypes.JSON,
            allowNull: true
        },
        rate: {
            type: DataTypes.JSON,
            allowNull: true
        },
        // qualifications: {
        //     type: DataTypes.JSON,
        //     allowNull: true
        // },
        foundational_data: {
            type: DataTypes.JSON,
            allowNull: true
        },
        is_enabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        ot_exempt: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        rate_configuration: {
            type: DataTypes.JSON
        },
        managed_by: {
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
        event_id: {
            type: DataTypes.STRING,
            allowNull: true
        },
        module_id: {
            type: DataTypes.STRING,
            allowNull: true
        },
        method_id: {
            type: DataTypes.STRING,
            allowNull: true
        },
        expenses: {
            type: DataTypes.JSON
        },
        net_budget: {
            type: DataTypes.STRING,
            allowNull: true
        },
        submission_limit_vendor: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        closed_reason: {
            type: DataTypes.STRING,
            allowNull: true
        },
        closed_note: {
            type: DataTypes.STRING,
            allowNull: true
        },
        closed_at: {
            type: DataTypes.DATE
        }
    },
    {
        sequelize,
        tableName: "jobs",
        timestamps: false,
        hooks: {
            beforeValidate: async (instance) => {
                if (!instance.job_id && instance.program_id) {
                    const transaction = await sequelize.transaction();
                    try {
                        const programData = await interviewRepository.programQuery(
                            instance.program_id
                        );

                        if (programData.length > 0 && programData[0].unique_id) {
                            const programPrefix = programData[0].unique_id
                                .substring(0, 3)
                                .toUpperCase();

                            let count = await JobModel.count({
                                where: { program_id: instance.program_id, is_deleted: false },
                                transaction,
                            });

                            let newJobId;
                            let existingJob;

                            do {
                                const sequence = (count + 1).toString().padStart(5, "0");
                                newJobId = `${programPrefix}-JB-${sequence}`;

                                // Check if the generated job_id already exists
                                existingJob = await JobModel.findOne({
                                    where: { job_id: newJobId, program_id: instance.program_id, is_deleted: false },
                                    transaction,
                                });

                                if (!existingJob) {
                                    instance.job_id = newJobId;
                                } else {
                                    count++; // Increment count and try generating a new job_id
                                }
                            } while (existingJob);

                            await transaction.commit();
                        }
                    } catch (error) {
                        await transaction.rollback();
                        throw error;
                    }
                }
            }

        },
    }
);

sequelize.sync()
export default JobModel;
