import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/instance";
class JobMasterDataModel extends Model {
    id: any;
  foundation_data_type_id: any;
  foundation_data_id: any;
  is_read_only: any;
}
JobMasterDataModel.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            allowNull: false,
            primaryKey: true,
        },
        program_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        job_temp_id: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        foundation_data_type_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        foundation_data_id: {
            type: DataTypes.JSON,
            allowNull: false,
        },
        is_read_only: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        is_enabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        created_by: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            allowNull: true
        },
        updated_by: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            allowNull: true
        },
        created_on: {
            type: DataTypes.BIGINT.UNSIGNED,
            defaultValue: Date.now()
        },
        updated_on: {
            type: DataTypes.BIGINT.UNSIGNED,
            defaultValue: Date.now()
        },
    },
    {
        sequelize,
        tableName: "job_template_master_data",
        timestamps: false,
    }
);
sequelize.sync();
export default JobMasterDataModel;