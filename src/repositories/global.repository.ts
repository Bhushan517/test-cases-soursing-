import { QueryTypes } from "sequelize";
import { sequelize } from "../config/instance";
import { databaseConfig } from '../config/db';
const config_db = databaseConfig.config.database_config;
const CONFIG_URL = process.env.CONFIG_URL;

interface MarkupDataInterface {
    program_id?: string,
    program_industry?: string,
    hierarchy?: Array<string>,
    rate_model?: string,
    vendor_id?: string,
    work_location?: string,
    job_type?: string,
    rate_type?: any,
    job_template_id?: string,
    worker_classification?: string
}

class GlobalRepository {

    static async findProgramVendorUser(program_id: string, userId: string) {

        const sql = `SELECT u.user_type, u.tenant_id, pv.id AS program_vendor_id FROM ${config_db}.user AS u
        LEFT JOIN ${config_db}.program_vendors AS pv ON pv.tenant_id = u.tenant_id AND pv.program_id = u.program_id
        WHERE u.program_id = :program_id AND u.user_id = :userId`;

        const userData = await sequelize.query(sql, {
            replacements: { program_id, userId },
            type: QueryTypes.SELECT
        });

        return userData;
    }

    static async findFeesConfig(program_id: string, program_industry: string, hierarchy: Array<string>, vendor_id: string) {
        const sql = `
            SELECT funding_model, categorical_fees FROM ${config_db}.fees
            WHERE program_id = :program_id
            AND (JSON_CONTAINS(labor_category, :labor_category) OR is_all_labor_category = 1)
            AND (JSON_CONTAINS(hierarchy_levels, :hierarchy_levels) OR is_all_hierarchy_associated = 1)
            AND is_deleted = false
            AND (JSON_CONTAINS(vendors, :vendors) OR JSON_LENGTH(vendors) = 0)
            AND is_enabled = true
            `;

        const feesData = await sequelize.query(sql, {
            replacements: { program_id, labor_category: JSON.stringify(program_industry), hierarchy_levels: JSON.stringify(hierarchy), vendors: JSON.stringify(vendor_id) },
            type: QueryTypes.SELECT,
            raw: true
        });

        return feesData;
    }

    private static buildMarkupQueryConditions(markupDetail: MarkupDataInterface) {
        const rateModel = markupDetail.rate_model === 'markup' ? 'bill_rate' : markupDetail.rate_model;
        let hierarchyCondition = '';
        let replacements: Record<string, any> = {
            program_id: markupDetail.program_id,
            rate_model: rateModel
        };

        if (markupDetail.hierarchy?.length) {
            const hierarchyPlaceholders = markupDetail.hierarchy.map((_, index) => `:hierarchy${index}`).join(',');
            const jsonContainsConditions = markupDetail.hierarchy.map((h, index) => {
                replacements[`hierarchy${index}`] = h;
                return `JSON_CONTAINS(pv.hierarchies, CONCAT('"', :hierarchy${index}, '"')) = 1`;
            }).join(' OR ');

            hierarchyCondition = `AND ((vmc.hierarchy IN (${hierarchyPlaceholders}) OR vmc.hierarchy IS NULL) AND
                (pv.hierarchies IS NULL OR (${jsonContainsConditions})))`;
        }

        // Add conditional replacements only when needed
        if (markupDetail.vendor_id) replacements.vendor_id = markupDetail.vendor_id;
        if (markupDetail.program_industry) replacements.program_industry = markupDetail.program_industry;
        if (markupDetail.work_location) replacements.work_location = markupDetail.work_location;
        if (markupDetail.job_type) replacements.job_type = markupDetail.job_type;
        if (markupDetail.rate_type) replacements.rate_type = markupDetail.rate_type;
        if (markupDetail.job_template_id) replacements.job_template_id = markupDetail.job_template_id;
        if (markupDetail.worker_classification) replacements.worker_classification = markupDetail.worker_classification;

        return { hierarchyCondition, replacements };
    }

    static async findVendorMarkups(markupDetail: MarkupDataInterface) {
        const { hierarchyCondition, replacements } = this.buildMarkupQueryConditions(markupDetail);

        const sql = `
            SELECT
                MIN(CAST(JSON_UNQUOTE(JSON_EXTRACT(vmc.markups, '$.sourced_markup')) AS FLOAT)) AS sourced_markup_min,
                MAX(CAST(JSON_UNQUOTE(JSON_EXTRACT(vmc.markups, '$.sourced_markup')) AS FLOAT)) AS sourced_markup_max,
                MIN(CAST(JSON_UNQUOTE(JSON_EXTRACT(vmc.markups, '$.payrolled_markup')) AS FLOAT)) AS payrolled_markup_min,
                MAX(CAST(JSON_UNQUOTE(JSON_EXTRACT(vmc.markups, '$.payrolled_markup')) AS FLOAT)) AS payrolled_markup_max
            FROM ${config_db}.vendor_markup_config vmc
            JOIN ${config_db}.program_vendors pv ON vmc.program_vendor_id = pv.id
            WHERE vmc.program_id = :program_id
            AND vmc.rate_model = :rate_model
            AND pv.status = 'Active'
            AND pv.is_deleted = 0
            ${markupDetail.vendor_id ? 'AND vmc.program_vendor_id = :vendor_id' : ''}
            ${markupDetail.program_industry ? `AND (
                (vmc.program_industry = :program_industry OR vmc.program_industry IS NULL) AND
                (pv.program_industry IS NULL OR JSON_CONTAINS(pv.program_industry, CONCAT('"', :program_industry, '"')) = 1))` : ''}
            ${hierarchyCondition}
            ${markupDetail.work_location ? 'AND (vmc.work_locations = :work_location OR vmc.work_locations IS NULL)' : ''}
            ${markupDetail.job_type ? 'AND (vmc.job_type = :job_type OR vmc.job_type IS NULL)' : ''}
            ${markupDetail.rate_type ? 'AND (vmc.rate_type IN (:rate_type) OR vmc.rate_type IS NULL)' : ''}
            ${markupDetail.job_template_id ? 'AND (vmc.job_template = :job_template_id OR vmc.job_template IS NULL)' : ''}
            ${markupDetail.worker_classification ? 'AND (vmc.worker_classification = :worker_classification OR vmc.worker_classification IS NULL)' : ''}
            ORDER BY
                CASE WHEN vmc.program_industry IS NOT NULL THEN 1 ELSE 2 END,
                CASE WHEN vmc.hierarchy IS NOT NULL THEN 1 ELSE 2 END,
                CASE WHEN vmc.work_locations IS NOT NULL THEN 1 ELSE 2 END,
                CASE WHEN vmc.job_type IS NOT NULL THEN 1 ELSE 2 END
            LIMIT 1`;

        return sequelize.query(sql, {
            replacements,
            type: QueryTypes.SELECT,
            raw: true,
            logging: true
        });
    }

    static async findMarkupsForVendor(markupDetail: MarkupDataInterface) {
        const rateModel = markupDetail.rate_model === 'markup' ? 'bill_rate' : markupDetail.rate_model;

        const sql = `
            SELECT
                CAST(JSON_UNQUOTE(JSON_EXTRACT(vmc.markups, '$.sourced_markup')) AS FLOAT) AS sourced_markup_max,
                CAST(JSON_UNQUOTE(JSON_EXTRACT(vmc.markups, '$.payrolled_markup')) AS FLOAT) AS payrolled_markup_max
            FROM ${config_db}.vendor_markup_config vmc
            JOIN ${config_db}.program_vendors pv ON vmc.program_vendor_id = pv.id
            WHERE vmc.program_id = :program_id
            AND vmc.rate_model = :rate_model
            AND pv.status = 'Active'
            AND pv.is_deleted = 0
            ${markupDetail.vendor_id ? 'AND vmc.program_vendor_id = :vendor_id' : ''}
            ${markupDetail.program_industry ? 'AND (vmc.program_industry = :program_industry OR vmc.program_industry IS NULL)' : ''}
            ${markupDetail.hierarchy ? `AND (vmc.hierarchy IN (:hierarchy) OR vmc.hierarchy IS NULL)` : ''}
            ${markupDetail.work_location ? 'AND (vmc.work_locations = :work_location OR vmc.work_locations IS NULL)' : ''}
            ${markupDetail.job_type ? 'AND (vmc.job_type = :job_type OR vmc.job_type IS NULL)' : ''}
            ${markupDetail.rate_type ? 'AND (vmc.rate_type = :rate_type OR vmc.rate_type IS NULL)' : ''}
            ${markupDetail.job_template_id ? 'AND (vmc.job_template = :job_template_id OR vmc.job_template IS NULL)' : ''}
            ${markupDetail.worker_classification ? 'AND (vmc.worker_classification = :worker_classification OR vmc.worker_classification IS NULL)' : ''}
            ORDER BY
                CASE WHEN vmc.program_industry IS NOT NULL THEN 1 ELSE 2 END,
                CASE WHEN vmc.hierarchy IS NOT NULL THEN 1 ELSE 2 END,
                CASE WHEN vmc.work_locations IS NOT NULL THEN 1 ELSE 2 END,
                CASE WHEN vmc.job_type IS NOT NULL THEN 1 ELSE 2 END
            LIMIT 1`;

        const markupData = await sequelize.query(sql, {
            replacements: {
                program_id: markupDetail.program_id,
                program_industry: markupDetail.program_industry,
                hierarchy: markupDetail.hierarchy,
                work_location: markupDetail.work_location,
                rate_model: rateModel,
                vendor_id: markupDetail.vendor_id,
                job_type: markupDetail.job_type,
                rate_type: markupDetail.rate_type,
                job_template_id: markupDetail.job_template_id,
                worker_classification: markupDetail.worker_classification
            },
            type: QueryTypes.SELECT,
            raw: true,
            logging: true
        });

        return markupData;
    }

    static async accuracyConfiguration(program_id: string, config_model: string): Promise<any[]> {
        try {
            const query = `
                SELECT
                    id,
                    program_id,
                    config_model,
                    title,
                    description,
                    \`key\`,
                    data_type,
                    \`value\`,
                    configuration_id
                FROM ${config_db}.programs_config
                WHERE program_id = :program_id AND title = :config_model
            `;

            const replacements = { program_id, config_model };

            const result = await sequelize.query(query, {
                replacements,
                type: QueryTypes.SELECT
            });

            if (!result.length) {
                return [];
            }

            return result as any[];
        } catch (error) {
            console.error("Error fetching configuration:", error);
            throw new Error("Failed to fetch accuracy configuration");
        }
    }

    static findAndCalculate(configData: any[], title: string, amount: number): string {
        if (!Array.isArray(configData)) {
            console.error("Error: configData is not an array or is undefined");
            return amount.toString();
        }
        if (amount === null || amount === undefined || isNaN(amount)) {
            console.log("Invalid amount provided (null, undefined, or NaN):", amount);
            return "0";
        }
        amount = Number(amount);
        if (!Number.isFinite(amount)) {
            console.log("Invalid amount provided (Not Finite):", amount);
            return amount.toString();
        }

        const accuracyConfigRecord = configData.find(
            (item) =>
                item.title === "Accuracy Configuration" &&
                item.config_model === "platform"
        );
        const isAccuracyEnabled = accuracyConfigRecord?.value == true;

        const amountObject = configData
            .find((item) => item.config_model === "accuracy_configuration")
            ?.value.find((val: { title: string }) => val.title === title);

        if (!amountObject || !Array.isArray(amountObject.fields)) {
            console.warn("Warning: 'Amount' configuration not found or has no fields");
            return amount.toString();
        }

        const allFields = amountObject.fields.flatMap((group: { fields: any[] }) =>
            Array.isArray(group.fields) ? group.fields : []
        );

        const scaleLimit = isAccuracyEnabled ? parseInt(allFields[1].value, 10) : 4;
        const threshold = isAccuracyEnabled ? parseInt(allFields[2].value, 10) : 4;
        const scalingType = isAccuracyEnabled ? allFields[0].value : 'Truncate';

        const factor = Math.pow(10, scaleLimit);
        let adjustedAmount = Number(amount.toFixed(10));
        const stringAmount = adjustedAmount.toString();
        const decimalPart = stringAmount.split('.')[1] || '';

        switch (scalingType) {
            case 'Round Up':
                adjustedAmount = Number(adjustedAmount.toFixed(scaleLimit));
                if (adjustedAmount % 1 !== 0 && adjustedAmount % 1 >= threshold / 10) {
                    adjustedAmount = Math.ceil(adjustedAmount * factor) / factor;
                }
                break;
            case 'Round Down':
                if (decimalPart.length > scaleLimit) {
                    const extraDigit = parseInt(decimalPart[scaleLimit] || '0', 10);
                    if (extraDigit <= threshold) {
                        adjustedAmount = Math.floor(adjustedAmount * factor) / factor - 1 / factor;
                    } else {
                        adjustedAmount = Math.floor(adjustedAmount * factor) / factor;
                    }
                } else {
                    adjustedAmount = Number(adjustedAmount.toFixed(scaleLimit));
                }
                break;
            case 'Truncate':
                adjustedAmount = Math.trunc(adjustedAmount * factor) / factor;
                break;
            default:
                return amount.toString();
        }

        return adjustedAmount.toFixed(scaleLimit);
    }
}

export default GlobalRepository;