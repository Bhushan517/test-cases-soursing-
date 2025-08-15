import { DataTypes, Model } from 'sequelize';
import { sequelize } from "../config/instance";
import { beforeSave } from '../hooks/timeFormatHook';
import { convertEmptyStringsToNull } from '../hooks/convertEmptyStringsToNull';

class OfferCustomFieldModel extends Model {
    id!: string;
    custom_field_id!: string;
    value: any;
    offer_id!: string;
}

OfferCustomFieldModel.init({
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
    },
    offer_id: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    custom_field_id: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    value: {
        type: DataTypes.JSON,
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
    created_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    updated_by: {
        type: DataTypes.UUID,
        allowNull: true
    }
}, {
    sequelize,
    tableName: 'offer_custom_fields',
    timestamps: false,
    hooks: {
        beforeSave: (instance) => {
            beforeSave(instance);
        },
        beforeValidate: async (instance) => {
            convertEmptyStringsToNull(instance);
        },
    },
});

export default OfferCustomFieldModel;