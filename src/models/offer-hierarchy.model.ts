import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/instance';

class OfferHierachy extends Model {
}

OfferHierachy.init({
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
    },
    hierarchy: {
        type: DataTypes.STRING,
        allowNull: true
    },
    offer_id:{
        type: DataTypes.STRING,
        allowNull: true
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
    tableName: 'offers_hierarchy',
    timestamps: false,
});

export default OfferHierachy;