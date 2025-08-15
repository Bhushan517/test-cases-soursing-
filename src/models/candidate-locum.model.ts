import { DataTypes, Model } from 'sequelize';
import { sequelize } from "../config/instance";

class CandidateLocumNameClearModel extends Model {
    id: any;
    npi: any;
    worker_type: any;
    first_name: any;
    middle_name: any;
    last_name: any;
    name_clear_id: any;
    status: any;
    vendor_id: any;
    created_on: any;
    updated_on: any;
    is_deleted: any;
    program_vendor: any;
    program_id: any;
  rejection_reason: any;
  notes: any;
}

CandidateLocumNameClearModel.init(
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
        worker_type: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        npi: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        first_name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        middle_name: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        last_name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        name_clear_id: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        rejection_reason: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        notes: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        status: {
            type: DataTypes.STRING,
            allowNull: true,
            // defaultValue: 'Pending Name Clear',
        },
        vendor_id: {
            type: DataTypes.UUID,
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
        is_deleted: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: false,
        },
    },
    {
        sequelize,
        tableName: 'candidate_locum',
        timestamps: false
    }
);
export default CandidateLocumNameClearModel;

