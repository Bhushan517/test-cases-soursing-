import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/instance";
import { beforeSave } from "../hooks/timeFormatHook";
import { convertEmptyStringsToNull } from "../hooks/convertEmptyStringsToNull";
import InterviewRepository from "../repositories/interview.repository";
const interviewRepository = new InterviewRepository();
import { Schedule } from "../interfaces/interview.interface";
class JobInterviewModel extends Model {
  id!: string;
  interviewers!: any;
  start_time?: string;
  schedules!: Schedule[];
  interview_review!: string[];
  candidate_id: any;
  location: any;
  time_zone: any;
  submit_candidate_id!: string;
  custom_fields: any;
  custom_field_id: any;
  interview_feedback: any;
  interview_Id: any;
  vendor_id: any;
  program_id!: string;
  status!: string;
  job_id: any;
  updated_by!: string;
  revision!: number;
  title!: string;
}

JobInterviewModel.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      allowNull: false,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    interview_type: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    location: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    location_type: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    time_zone: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    submission_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    external_participant_email: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    vendor_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(
        'PENDING_ACCEPTANCE',
        'PENDING_CONFIRMATION',
        'ACCEPTED',
        'REJECTED',
        'COMPLETED',
        'CANCELLED',
        'DRAFT',
        'RESHEDULED'
      ),
      allowNull: true,
    },
    program_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    submit_candidate_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    job_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    phone_number: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    interview_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    vendor_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    revision: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    is_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_on: {
      type: DataTypes.BIGINT.UNSIGNED,
      defaultValue: Date.now(),
      allowNull: true
    },
    updated_on: {
      type: DataTypes.BIGINT.UNSIGNED,
      defaultValue: Date.now(),
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
    is_deleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    buyer_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    link: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    interview_cancel_reason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    interview_Id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    other_location: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "interviews",
    timestamps: false,
    hooks: {
      beforeValidate: async (instance) => {
        convertEmptyStringsToNull(instance);
        if (!instance.interview_Id && instance.program_id) {
          const programData = await interviewRepository.programQuery(
            instance.program_id
          );
          if (programData.length > 0 && programData[0].unique_id) {
            const programPrefix = programData[0].unique_id
              .substring(0, 3)
              .toUpperCase();
            const count = await JobInterviewModel.count({ where: { program_id: instance.program_id } });
            const sequence = (count + 1).toString().padStart(5, "0");
            instance.interview_Id = `${programPrefix}-IN-${sequence}`;
          }
        }
      },
      beforeSave: (instance) => {
        beforeSave(instance);
      },
    },
  }
);

export default JobInterviewModel;
