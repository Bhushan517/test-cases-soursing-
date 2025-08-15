import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/instance";
import { convertEmptyStringsToNull } from "../hooks/convertEmptyStringsToNull";

class JobHistory extends Model {
  id: any;
  program_id: any;
  job_id: any;
  revision: any;
  reason: any;
  note: any;
  event_type: any;
  new_meta_data: any;
  compare_meta_data: any;
  status: any;
  created_by: any;
  updated_by: any;
  created_on: any;
  updated_on: any;
  is_deleted: any;
  is_enabled: any;
}

JobHistory.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    program_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    job_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    revision: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    reason: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    event_type: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    new_meta_data: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    compare_meta_data: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(
        "OPEN",
        "CLOSED",
        "DRAFT",
        "SOURCING",
        "PENDING_APPROVAL_SOURCING",
        "PENDING_APPROVAL",
        "PENDING_REVIEW",
        "REJECTED",
        "HALTED",
        "HOLD",
        "FILLED"
      ),
      allowNull: true,
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
      allowNull: true
    },
    updated_on: {
      type: DataTypes.BIGINT.UNSIGNED,
       defaultValue: Date.now(),
      allowNull: true
    },
    is_deleted: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: false,
    },
    is_enabled: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: "job_history",
    timestamps: false,
    hooks: {
      beforeValidate: (instance) => {
        convertEmptyStringsToNull(instance);
      },
    },
  }
);

sequelize.sync();
export default JobHistory;
