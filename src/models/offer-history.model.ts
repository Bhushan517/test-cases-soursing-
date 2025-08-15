import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/instance";
import { beforeSave } from "../hooks/timeFormatHook";
import { convertEmptyStringsToNull } from '../hooks/convertEmptyStringsToNull';
import OfferModel from "./offer.model";

class OfferHistoryModel extends Model {
    id!: string;
}

OfferHistoryModel.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            allowNull: false,
            primaryKey: true,
        },
        offer_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model:OfferModel,
                key: "id"
            }
        },
        program_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        event_summary_before: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        event_summary_after: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        event_type: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        created_on: {
            type: DataTypes.BIGINT.UNSIGNED,
            defaultValue: Date.now()
        },
        updated_on: {
            type: DataTypes.BIGINT.UNSIGNED,
            defaultValue: Date.now()
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
        tableName: "offer_history",
        timestamps: false,
        hooks: {
            beforeValidate: (instance) => {
                convertEmptyStringsToNull(instance);
            },
            beforeSave: async (instance) => {
                beforeSave(instance);
            },
        }
    }
);

sequelize.sync();

export default OfferHistoryModel;
