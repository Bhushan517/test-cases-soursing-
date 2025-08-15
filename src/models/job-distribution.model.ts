import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/instance";
class JobDistributionModel extends Model {
  id: any;
  job_id: any;
  status: any;
  vendor_id: any;
  created_on: any;
  vendor_group_id: any;
  distribution_date: any;
  opt_status: any;
}
JobDistributionModel.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    job_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    program_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    distribute_method: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    vendor_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true
    },
    submission_limit: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    opt_status: {
      type: DataTypes.STRING,
      allowNull: true
    },
    opt_status_date: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    measure_unit: {
      type: DataTypes.STRING,
      allowNull: true
    },
    submission: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    vendor_group_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    distributed_by: {
      type: DataTypes.STRING,
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
    is_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    opt_by: {
      type: DataTypes.CHAR(36),
      allowNull: true
    },
    distribution_date: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    opt_out_reason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    notes: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true
    },
    updated_by: {
      type: DataTypes.UUID,
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: "job_distributions",
    timestamps: false,
  }
);
sequelize.sync();

export default JobDistributionModel;
