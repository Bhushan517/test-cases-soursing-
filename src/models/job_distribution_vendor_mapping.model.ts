import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/instance";
class JobDistributionVendorMapping extends Model {
  id!: string;
  vendor_id!: string;
}

JobDistributionVendorMapping.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    vendor_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    distribution_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false
    },
    submission_limit_vendor: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    opt_status: {
      type: DataTypes.STRING,
      allowNull: true
    },
    opt_status_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    measure_unit: {
      type: DataTypes.STRING,
      allowNull: true
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
  },
  {
    sequelize,
    tableName: "job_distribution_vendors_mapping",
    timestamps: false,
  }
);

export default JobDistributionVendorMapping;
