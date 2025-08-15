import { DataTypes, Model } from 'sequelize';
import { sequelize } from "../config/instance";
import { beforeSave } from '../hooks/timeFormatHook';
import { convertEmptyStringsToNull } from '../hooks/convertEmptyStringsToNull';

class AdditionalAttendees extends Model {
    id: any;
    accepted_schedule_id?: string
    external_participant_email?: string
}
AdditionalAttendees.init(
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
        participant_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        is_external: {
            type: DataTypes.BOOLEAN,
            allowNull: true
        },
        is_interviewer: {
            type: DataTypes.BOOLEAN,
            allowNull: true
        },
        external_participant_email: {
            type: DataTypes.STRING,
            allowNull: true
        },
        accepted_schedule_id: {
            type: DataTypes.STRING,
            allowNull: true
        },
        status: {
            type: DataTypes.STRING,
            allowNull: true
        },
        candidate_phone: {
            type: DataTypes.DOUBLE,
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
        modelName: 'interview_participants',
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
export default AdditionalAttendees;
