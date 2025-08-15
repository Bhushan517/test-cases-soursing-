import { Model, DataTypes } from 'sequelize';
import { sequelize } from "../config/instance";

export class SubscriptionModel extends Model {}

SubscriptionModel.init({
    subscriptionId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    userId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    expirationDateTime: {
        type: DataTypes.STRING,
        allowNull: false
    }
}, {
    sequelize,
    tableName: 'outlook_subscription',
    timestamps: true,
});
