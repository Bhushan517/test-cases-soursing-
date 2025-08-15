import { POPULATE_CONFIG } from "../controllers/job-history.controller";
import { sequelize } from "../config/instance";
import { databaseConfig } from "../config/db";
import { QueryTypes, Sequelize } from "sequelize";
import {
  ChangeRecord,
  NestedChangeRecord,
  UserDetails,
} from "../interfaces/job-histroy.interface";
import { decodeToken } from "../middlewares/verifyToken";


const config_db = databaseConfig.config.database_config;

export async function populateFieldData(
  table: string,
  column: string,
  values: any[],
  fields: string[]
): Promise<Record<string, any>[]> {
  if (!values?.length) return [];

  const stringValues = values.map((v) => v.toString());
  const fieldStr = fields.join(", ");

  const query = `SELECT ${column}, ${fieldStr} FROM ${config_db}.${table} 
                   WHERE ${column} IN (:values)`;

  try {
    return (await sequelize.query(query, {
      replacements: { values: stringValues },
      type: QueryTypes.SELECT,
    })) as Record<string, any>[];
  } catch (error) {
    console.error("Error populating field data:", error);
    return [];
  }
}

export async function populateUserDetails(
  program_id :any,
  userId: string
): Promise<UserDetails | {}> {
  if (!userId) return {};

  const userQuery = `
        SELECT
        JSON_OBJECT(
            'id', u.user_id,
            'first_name', u.first_name,
            'middle_name', u.middle_name,
            'last_name', u.last_name
        ) AS user_details 
        FROM ${config_db}.user u
        WHERE u.user_id = :id AND 
        is_active = true AND 
        ( u.user_type = 'super_user'
        OR (u.user_type != 'super_user' AND u.program_id = :program_id))
        LIMIT 1;
    `;

  try {
    const [userResult] = (await sequelize.query(userQuery, {
      replacements: { id: userId , program_id },
      type: QueryTypes.SELECT,
    })) as any[];

    return userResult?.user_details || {};
  } catch (error) {
    console.error("Error fetching user details:", error);
    return {};
  }
}


export async function populateReason(reasonId: string): Promise<string | null> {
  const reasonData = await sequelize.query(
    `SELECT name 
     FROM ${config_db}.reason_codes 
     WHERE id = :reason_id 
     LIMIT 1;`,
    {
      replacements: { reason_id: reasonId },
      type: QueryTypes.SELECT,
      logging: console.log,
    }
  ) as [{ name: string }];

  return reasonData.length ? reasonData[0].name : null;
}
  

function cleanFieldName(field: string): string {
  let cleaned = field
    .replace(/(_)?(id|ids)$/i, "")
    .replace(/(^|_)(id|ids)($|_)/gi, "$1$3")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/__+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
  return cleaned || field.toLowerCase();
}
function isChangeRecord(
  obj: any
): obj is { key?: string; slug?: string; new_value?: any; old_value?: any } {
  return (
    typeof obj === "object" &&
    obj !== null &&
    ("new_value" in obj || "old_value" in obj) && 
    (typeof obj.key === "string" || obj.key === undefined) && 
    (typeof obj.slug === "string" || obj.slug === undefined) 
  );
}


export async function processCompareMetaData(compareData: any, originalData: any, parentKey?: string): Promise<any> {
    try {
        if (compareData === null || typeof compareData !== 'object') {
            return compareData;
        }

        if (isChangeRecord(compareData)) {
            return await processChangeRecord(compareData, parentKey);
        }

        if (Array.isArray(compareData)) {
            return await Promise.all(
                compareData.map(item => 
                    reprocessMetaData(item, originalData)
                ));
        }

        const result: { [key: string]: any } = {};
        
        for (const [key, value] of Object.entries(compareData)) {
            try {
                if (key === "rate" && isObject(value)) {
                    result[key] = await processRateComparison(value, originalData?.rate || []);
                } else {
                    result[key] = await reprocessMetaData(value, originalData?.[key], key);
                }
            } catch (error) {
                console.error(`Error processing key ${key}:`, error);
                result[key] = value;
            }
        }
        
        return result;
    } catch (error) {
        console.error('Error in processCompareMetaData:', error);
        return compareData; 
    }
}

async function reprocessMetaData(compareData: any, originalData: any, parentKey?: string) {
    try {
        return await processCompareMetaData(compareData, originalData, parentKey);
    } catch (error) {
        console.error('Error in reprocessMetaData:', error);
        return compareData;
    }
}

async function processRateComparison(rateCompareData: any, originalRateData: any[]) {
    try {
        return await processRateHierarchyComparison(rateCompareData, originalRateData);
    } catch (error) {
        console.error('Error in processRateComparison:', error);
        return rateCompareData; 
    }
}

async function processChangeRecord(change: any, parentKey?: string) {
    try {
        const processedChange: any = {
            key: change.key || '',
            slug: change.slug || ''
        };

        const formatIfString = (val: any) => {
            try {
                if (typeof val !== 'string') return val;
                return val.toLowerCase()
                    .split('_')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
            } catch {
                return val;
            }
        };

        const cleanCurrency = (val: any) => {
            try {
                if (val === null || val === undefined) return val;
                if (typeof val === 'string') {
                    const cleaned = val.replace(/[^\d.-]/g, '');
                    if (!isNaN(parseFloat(cleaned))) {
                        return parseFloat(cleaned).toFixed(8);
                    }
                }
                return val;
            } catch {
                return val;
            }
        };

        if ('new_value' in change) {
            processedChange.new_value = cleanCurrency(change.new_value);
            if (parentKey === 'status') {
                processedChange.new_value = formatIfString(processedChange.new_value);
            }
        }

        if ('old_value' in change) {
            processedChange.old_value = cleanCurrency(change.old_value);
            if (parentKey === 'status') {
                processedChange.old_value = formatIfString(processedChange.old_value);
            }
        }

        return processedChange;
    } catch (error) {
        console.error('Error in processChangeRecord:', error);
        return change; 
    }
}

async function processRateHierarchyComparison(rateCompareData: any, originalRateData: any[]) {
    const result: any = {};
    
    try {
        const firstOriginalRate = originalRateData[0] || {};
        const originalHierarchies = firstOriginalRate.hierarchies || [];
        const originalConfig = firstOriginalRate.rate_configuration?.[0] || {};
        const originalBaseRate = originalConfig.base_rate || {};
        const originalRateType = originalBaseRate.rate_type || {  name: 'Standard Rate', abbreviation: 'ST'    };

        if (rateCompareData.rate_configuration?.base_rate?.rate_type?.min_max_rate) {
            const changes = rateCompareData.rate_configuration.base_rate.rate_type.min_max_rate;
            
            for (const hierarchy of originalHierarchies) {
                const hierarchyName = hierarchy.name || 'Unknown Hierarchy';
                result[hierarchyName] = { data: [] };
                
                if (changes.max_rate) {
                    result[hierarchyName].data.push(createRateChangeItem(
                        changes.max_rate,
                        originalRateType,
                        'Max Rate',
                        'max_rate'
                    ));
                }
                
                if (changes.min_rate) {
                    result[hierarchyName].data.push(createRateChangeItem(
                        changes.min_rate,
                        originalRateType,
                        'Min Rate',
                        'min_rate'
                    ));
                }
            }
        }

        if (rateCompareData.rate_configuration?.base_rate?.rates) {
            const originalRates = originalBaseRate.rates || [];
            
            for (const [rateKey, rateValue] of Object.entries(rateCompareData.rate_configuration.base_rate.rates)) {
                if (isObject(rateValue)) {
                    const originalRate = originalRates[parseInt(rateKey) || 0] || {};
                    
                    for (const [changeKey, changeValue] of Object.entries(rateValue)) {
                        if (isChangeRecord(changeValue)) {
                            for (const hierarchy of originalHierarchies) {
                                const hierarchyName = hierarchy.name || 'Unknown Hierarchy';
                                if (!result[hierarchyName]) {
                                    result[hierarchyName] = { data: [] };
                                }
                                
                                result[hierarchyName].data.push(createRateChangeItem(
                                    changeValue,
                                    originalRate.rate_type || originalRateType,
                                    changeKey,
                                    changeKey
                                ));
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error in processRateHierarchyComparison:', error);
    }
    
    return Object.keys(result).length ? result : rateCompareData;
}

function createRateChangeItem(
    change: any,
    rateType: any,
    defaultKey: string,
    defaultSlug: string
) {
    return {
        key: change.key || defaultKey,
        slug: change.slug || defaultSlug,
        new_value: change.new_value,
        old_value: change.old_value,
        rate_type_title: rateType.name || 'Standard Rate',
        abbreviation: rateType.abbreviation || 'ST'
    };
}

function isObject(obj: any): obj is Record<string, any> {
    return obj && typeof obj === 'object' && !Array.isArray(obj);
}

  export async function processNewMetaData(
  newMetaData: Record<string, any>
): Promise<Record<string, any>> {
  if (!newMetaData) return {};

  const processedData = JSON.parse(JSON.stringify(newMetaData));

  const populatedData = (obj: any) => {
    if (obj && typeof obj === "object") {
      Object.keys(obj).forEach((key) => {
        if (
          obj[key] === "NaN" ||
          (typeof obj[key] === "number" && isNaN(obj[key]))
        ) {
          obj[key] = 0;
        } else if (typeof obj[key] === "object") {
          populatedData(obj[key]);
        }
      });
    }
    return obj;
  };

  await Promise.all(
    POPULATE_CONFIG.keysForPopulate.map(async (field) => {
      if (field in processedData) {
        const table = POPULATE_CONFIG.populateKeyTable[field];
        const column = POPULATE_CONFIG.keyForMatch[field];
        const fields = POPULATE_CONFIG.populateFields[field];
        const value = processedData[field];

        if (!value) return;

        delete processedData[field];

        const cleanField = cleanFieldName(field);
        const isPlural = field.toLowerCase().endsWith("ids");
        const isCurrencyField =
          table === "currencies" || field.toLowerCase().includes("currency");

        const fieldsToSelect = isCurrencyField
          ? [...fields, "label", "symbol", "code"]
          : [...fields];

        if (Array.isArray(value) || isPlural) {
          const values = Array.isArray(value) ? value : [value];
          if (values.length === 0) {
            processedData[cleanField] = [];
            return;
          }
          const resolvedData = await populateFieldData(
            table,
            column,
            values,
            fieldsToSelect
          );

          processedData[cleanField] = resolvedData.map((item) => {
            if (isCurrencyField) {
              return {
                id: item.id,
                name: item.name,
                ...(item.label && { label: item.label }),
                ...(item.symbol && { symbol: item.symbol }),
                ...(item.code && { code: item.code }),
              };
            }

            return {
              id: item.id,
              name: fields.map((f) => item[f]).join(" "),
            };
          });
        } else {
          const resolvedData = await populateFieldData(
            table,
            column,
            [value],
            fieldsToSelect
          );

          processedData[cleanField] =
            resolvedData.length > 0
              ? isCurrencyField
                ? {
                    id: resolvedData[0].id,
                    name: resolvedData[0].name,
                    ...(resolvedData[0].label && {
                      label: resolvedData[0].label,
                    }),
                    ...(resolvedData[0].symbol && {
                      symbol: resolvedData[0].symbol,
                    }),
                    ...(resolvedData[0].code && { code: resolvedData[0].code }),
                  }
                : {
                    id: resolvedData[0].id,
                    name: fields.map((f) => resolvedData[0][f]).join(" "),
                  }
              : {};
        }
      }
    })
  );

  if (
    processedData.foundationDataTypes &&
    Array.isArray(processedData.foundationDataTypes)
  ) {
    await Promise.all(
      processedData.foundationDataTypes.map(async (item: any) => {
        if (
          item.foundation_data_ids &&
          Array.isArray(item.foundation_data_ids)
        ) {
          const nonNullIds = item.foundation_data_ids.filter(
            (id: string | null) => id !== null
          );
          if (nonNullIds.length > 0) {
            const resolvedData = await populateFieldData(
              POPULATE_CONFIG.populateKeyTable.foundation_data_ids,
              POPULATE_CONFIG.keyForMatch.foundation_data_ids,
              nonNullIds,
              [...POPULATE_CONFIG.populateFields.foundation_data_ids]
            );

            item.foundation_data = resolvedData.map((dataItem: any) => ({
              id: dataItem.id,
              name: dataItem.name,
              code: dataItem?.code,
            }));
          } else {
            item.foundation_data = [];
          }
          delete item.foundation_data_ids;
        }
        if (item.foundation_data_type_id) {
          const resolvedData = await populateFieldData(
            POPULATE_CONFIG.populateKeyTable.foundation_data_type_id,
            POPULATE_CONFIG.keyForMatch.foundation_data_type_id,
            [item.foundation_data_type_id],
            [...POPULATE_CONFIG.populateFields.foundation_data_type_id]
          );

          item.foundation_data_type =
            resolvedData.length > 0
              ? {
                  id: resolvedData[0].id,
                  name: resolvedData[0].name,
                }
              : {};
          delete item.foundation_data_type_id;
        }
      })
    );
  }

  Object.keys(processedData).forEach((key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey.endsWith("id") || lowerKey.endsWith("ids")) {
      delete processedData[key];
    }
  });

  return populatedData(processedData);
}


async function processFieldValue(
  value: any,
  table: string,
  column: string,
  fields: readonly string[]
): Promise<any> {
  if (!value) return value;

  if (Array.isArray(value)) {
    if (value.length === 0) return value;

    const resolvedData = await populateFieldData(table, column, value, [
      ...fields,
    ]);
    return {
      ids: value,
      names: resolvedData.map((item) => fields.map((f) => item[f]).join(" ")),
    };
  }

  // Handle single value case
  const resolvedData = await populateFieldData(
    table,
    column,
    [value],
    [...fields]
  );
  if (resolvedData.length) {
    return {
      ids: [value],
      names: [fields.map((f) => resolvedData[0][f]).join(" ")],
    };
  }

  return value;
}



export function isEqual(a: any, b: any): boolean {
  // Handle primitive types
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;

  // Handle Date objects
  if (a instanceof Date || b instanceof Date) {
    return new Date(a).getTime() === new Date(b).getTime();
  }

  // Handle arrays
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Handle objects
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!isEqual(a[key], b[key])) return false;
  }

  return true;
}




