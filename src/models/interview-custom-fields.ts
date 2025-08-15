import { DataTypes, Model } from 'sequelize';
import { sequelize } from "../config/instance";
import { beforeSave } from '../hooks/timeFormatHook';
import { convertEmptyStringsToNull } from '../hooks/convertEmptyStringsToNull';

class InterviewCustomFields extends Model {
    id: any;
}
InterviewCustomFields.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        interview_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        value: {
            type: DataTypes.JSON,
            allowNull: true
        },
        custom_field_id: {
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
        modelName: 'interview_custom_fields',
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
export default InterviewCustomFields;
