import { DataTypes, Model } from 'sequelize';
import { sequelize } from "../config/instance";
import { beforeSave } from '../hooks/timeFormatHook';
import { convertEmptyStringsToNull } from '../hooks/convertEmptyStringsToNull';

class Interviewschedules extends Model {
    name: any;
    id: any;
    start_time: any;
    end_time: any;
}
Interviewschedules.init(
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
        interview_date:{
            type:DataTypes.DOUBLE,
            allowNull:true
        },
        duration:{
            type:DataTypes.STRING,
            allowNull:true
        },
        start_time:{
            type:DataTypes.STRING,
            allowNull:true
        },
        end_time:{
            type:DataTypes.STRING,
            allowNull:true
        },
        candidate_id:{
            type:DataTypes.STRING,
            allowNull:true
        },
        status: {
            type: DataTypes.ENUM(
                'PENDING',
                'ACCEPTED',
                'REJECTED',
                'CANCELLED',
                'DECLINED'
            ),
            allowNull: true,
            defaultValue:"PENDING"
        },
        accepted_date:{
            type: DataTypes.DATE,
            allowNull: true,
        },
        is_propose:{
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
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
        modelName: 'interview_schedules',
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
export default Interviewschedules;
