import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/instance';
import { convertEmptyStringsToNull } from '../hooks/convertEmptyStringsToNull';
import { beforeSave } from '../hooks/timeFormatHook';

class CandidateHistoryModel extends Model {
    id?: string;
    revision?: number;
    new_meta_data!: string | object;
    compare_meta_data!: string | object;
    reason!: object | null;
    note!: object | null;
    status!: string | null;
    action!: string;
    effective_date!: Date;
    updated_by!: object;
    created_by!: object;
    created_on!: number;
    updated_on!: number;
    is_active!: number;
    is_deleted!: number;
}

CandidateHistoryModel.init(
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
        candidate_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        vendor_id: {
            type: DataTypes.UUID,
            allowNull: true,
            defaultValue: null
        },
        job_id: {
            type: DataTypes.UUID,
            allowNull: true,
            defaultValue: null

        },
        revision: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,

        },
        reason: {
            type: DataTypes.UUID,
            allowNull: true,
            defaultValue: null

        },
        note: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        action: {
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
            allowNull: false,
            defaultValue: () => Date.now(),
        },
        updated_on: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            defaultValue: () => Date.now(),
        },
        is_deleted: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0,
        },
        is_active: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 1,
        },
        status: {
            type: DataTypes.STRING,
            allowNull: true,
        }

    },
    {
        sequelize,
        modelName: 'CandidateHistory',
        tableName: 'candidate_history',
        timestamps: false,
        hooks: {
                    beforeValidate: (instance) => {
                        convertEmptyStringsToNull(instance);
                    },
                    beforeSave: (instance) => {
                        beforeSave(instance);
                    },
                },
    }
    
);

sequelize.sync();

export default CandidateHistoryModel;
