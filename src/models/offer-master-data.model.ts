import { DataTypes, Model } from 'sequelize';
import { sequelize } from "../config/instance";
import { beforeSave } from '../hooks/timeFormatHook';
import { convertEmptyStringsToNull } from '../hooks/convertEmptyStringsToNull';

class OfferMasterDataModel extends Model {
    id!: string;
    offer_id!: string;
    foundation_data_type_id!: string;
    foundation_data_ids!: any;
}

OfferMasterDataModel.init({
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
    foundation_data_type_id:{
        type: DataTypes.STRING,
        allowNull: true,
    },
    foundation_data_ids:{
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
    created_by:{
        type: DataTypes.UUID,
        allowNull: true
    },
    updated_by:{
        type: DataTypes.UUID,
        allowNull: true
    }
}, {
    sequelize,
    tableName: 'offer_master_data',
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

export default OfferMasterDataModel;