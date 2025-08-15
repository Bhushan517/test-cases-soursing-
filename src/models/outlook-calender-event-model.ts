import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/instance";

class OutlookCalendarEventModel extends Model {
    id!: string;
    event_id!: string;
    refresh_token!: string;
    user_id!: string;
    interview_id!: string;
}

OutlookCalendarEventModel.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            allowNull: false,
            primaryKey: true,
        },
        interview_id: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: "",
        },
        event_id: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: "",
        },
        refresh_token: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        user_id: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            allowNull: false,
        },
        updated_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            allowNull: false,
        },
    },
    {
        sequelize,
        tableName: "outlook_calendar_events",
        timestamps: true,
        updatedAt: "updated_at",
        createdAt: "created_at",
    }
);

// **Ensure Table is Created**
(async () => {
    try {
        await sequelize.sync();
        console.log("OutlookCalendarEventModel table created successfully.");
    } catch (error) {
        console.error(" Error creating OutlookCalendarEventModel table:", error);
    }
})();

export default OutlookCalendarEventModel;
