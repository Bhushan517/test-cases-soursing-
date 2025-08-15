import axios, { AxiosError, AxiosResponse } from "axios";
import { databaseConfig } from '../config/db';
import { format, parseISO } from 'date-fns';
import OfferModel from "../models/offer.model";
import { createMtp } from "./create-mtp";
import SubmissionCandidateRepository from "../repositories/submission-candidate.repository";
import { QueryTypes } from "sequelize";
import { sequelize } from "../config/instance";
const submissionRepo = new SubmissionCandidateRepository();
const TEAI_URL = databaseConfig.config.teai_url;
const config_db = databaseConfig.config.database_config;

interface AssignmentPayload {
    offer_id: string;
    [key: string]: any;
}

interface AssignmentCreationInfo {
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
    error: string | null;
    errorCode: string | null;
    attempts: number;
    assignment_id?: string | null,
    lastAttempt?: string;
}

/**
 * Creates an assignment based on provided payload
 * @param payload Assignment data with offer_id
 * @param program_id Program identifier
 * @param token Authorization token
 * @returns Response data or error object
 */
async function createAssignment(
    payload: AssignmentPayload,
    program_id: string,
    token: string
): Promise<any> {
    const { offer_id } = payload;
    const url = `${TEAI_URL}/assignment/v1/program/${program_id}/assignment`;

    console.log('Creating assignment', {
        url,
        offer_id,
        program_id,
        payload: JSON.stringify(payload)
    });

    try {
        // Make API request
        const response: AxiosResponse = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
        });

        // Update offer with success information
        const assignmentInfo: AssignmentCreationInfo = {
            status: 'SUCCESS',
            error: null,
            errorCode: null,
            attempts: 1,
            assignment_id: response.data.uuid,
            lastAttempt: new Date().toISOString()
        };

        await updateOfferAssignmentInfo(offer_id, program_id, assignmentInfo);
        return response.data;
    } catch (error: any) {
        const axiosError = error as AxiosError;
        const errorMessage = axiosError.response?.data || axiosError.message;
        const errorCode = axiosError.code || "VALIDATION_ERROR";

        console.error("Error creating assignment:", {
            offer_id,
            program_id,
            errorMessage,
            errorCode
        });

        // Update offer with error information
        try {
            const assignmentInfo: AssignmentCreationInfo = {
                status: "FAILED",
                error: typeof errorMessage === 'object' ?
                    JSON.stringify(errorMessage) : String(errorMessage),
                errorCode,
                attempts: 1,
                lastAttempt: new Date().toISOString()
            };
            await updateOfferAssignmentInfo(offer_id, program_id, assignmentInfo);
        } catch (dbError) {
            console.error('Failed to update offer with error information:', dbError);
        }
        const mtpCandidateId = payload.candidate_id;
        const userId = payload.userId;

        createMtp(program_id, mtpCandidateId, token, userId);

        return {
            error: true,
            message: "Failed to create assignment",
            details: errorMessage
        };
    }
}

async function updateOfferAssignmentInfo(
    offer_id: string,
    program_id: string,
    info: AssignmentCreationInfo
): Promise<void> {
    await OfferModel.update(
        { assignment_creation_info: info },
        { where: { id: offer_id, program_id } }
    );
}

function formatDateFromTimestamp(ms: number): string {
    const date = new Date(Number(ms));
    return format(date, 'yyyy-MM-dd');
}

function formatShiftDateFromTimestamp(timestamp: string): string {
    if (!timestamp) return ""; // Handle empty strings

    try {
        const date: Date = parseISO(timestamp);
        return format(date, "hh:mm a"); // Format as "hh:mm:ss AM/PM"
    } catch (error) {
        console.error("Invalid timestamp:", timestamp, error);
        return "";
    }
}


export async function fetchCustomFields(offer: any, transaction: any) {
    const offerCustomFields = await sequelize.query(
        `
      SELECT
          custom_field_id AS \`key\`,
          value
      FROM
          offer_custom_fields
      WHERE
          offer_id = :offer_id;
      `,
        {
            replacements: { offer_id: offer?.id },
            type: QueryTypes.SELECT,
            transaction,
        }
    );
    return offerCustomFields;
}

const jobQuery = `
                SELECT id, job_id, job_template_id, labor_category_id, primary_hierarchy, shifts_per_week,
                    estimated_hours_per_shift, budgets, currency, job_type, budgets , shift
                    FROM jobs
                    WHERE id = :job_id
                    LIMIT 1;
                    `;

export async function fetchMasterData(offer: any, transaction: any) {
    const offerMasterData: any = await sequelize.query(
        `
      SELECT
          foundation_data_type_id AS data_id,
          foundation_data_ids AS value
      FROM
          offer_master_data
      WHERE
          offer_id = :offer_id
          AND JSON_LENGTH(foundation_data_ids) > 0
          AND foundation_data_ids IS NOT NULL
          AND NOT JSON_CONTAINS(foundation_data_ids, 'null');
      `,
        {
            replacements: { offer_id: offer?.id },
            type: QueryTypes.SELECT,
            transaction,
        }
    );

    function removeDuplicates(data: { data_id: string, value: string[] }[]) {
        const DuplicatData = new Set();
        return data?.filter(item => {
            const key = `${item?.data_id}:${item?.value?.join(',')}`;
            if (DuplicatData?.has(key)) {
                return false;
            }
            DuplicatData?.add(key);
            return true;
        });
    }

    const masterData = removeDuplicates(offerMasterData);
    return masterData
}

export async function fetchRates(offer: any, transaction: any) {
    if (!offer || !offer?.financial_details?.rates) {
        throw new Error("Offer or financial details are missing");
    }

    const job: any = await sequelize.query(jobQuery, {
        replacements: { job_id: offer?.job_id },
        type: QueryTypes.SELECT,
    });
    const mapRates = (rates: any) => {

        if (rates[0]?.is_shift_rate) {
            return rates?.flatMap((rate: any) => {
                return rate?.hierarchies?.map((hierarchy: any) => {
                    const rateDetails: any[] = [];
                    const shiftsData: any[] = [];

                    rate?.rate_configuration?.forEach((config: any) => {
                        const stRate = config?.base_rate?.rate_type;
                        const currentShifts: any[] = [];

                        if (job[0]?.shift === null || job[0]?.shift === stRate?.shift_type?.id) {
                            if (stRate?.shift_type !== null) {
                                const shiftRate: any[] = [];

                                const shiftTypeTimes = (stRate?.shift_type?.shift_type_time || [])
                                    ?.map((time: any) => ({
                                        shift_start_time: time?.shift_start_time,
                                        shift_end_time: time?.shift_end_time,
                                    }));
                                config?.base_rate?.rates?.forEach((rateDetail: any) => {
                                    if (!shiftRate.some(r => r.rate_type_id === rateDetail.rate_type?.id)) {
                                        shiftRate.push({
                                            abbreviation: rateDetail?.rate_type?.abbreviation || "",
                                            seq_number: rateDetail?.seq_number,
                                            billrate: {
                                                amount: rateDetail?.client_bill_rate || 0,
                                                rate_factor: rateDetail?.bill_rate?.[0]?.differential_value || 1,
                                                rate_type: rateDetail?.rate_type?.name || "",
                                                adjustment: config?.base_rate?.msp_fee || 0,
                                                adjustment_type: config?.base_rate?.msp_fee_type || "Unknown",
                                                is_diffe_edit: false,
                                                differential_type: rateDetail?.bill_rate?.[0]?.differential_type || "",
                                            },
                                            payrate: {
                                                amount: rateDetail?.candidate_pay_rate || 0,
                                                rate_factor: rateDetail?.pay_rate?.[0]?.differential_value || 1,
                                                rate_type: rateDetail?.rate_type?.name || "",
                                                is_diffe_edit: false,
                                                differential_type: rateDetail?.pay_rate?.[0]?.differential_type || ""
                                            },
                                            vendor_rate: {
                                                amount: rateDetail?.vendor_bill_rate || 0,
                                            },
                                            rate_type_id: rateDetail?.rate_type?.id || "",
                                            rate_type_title: rateDetail?.rate_type?.name || "",
                                            rate_type_category_id: rateDetail?.rate_type?.rate_type_category?.id || "",
                                            rate_type_category_title: rateDetail?.rate_type?.rate_type_category?.name || "Unknown",
                                            is_base_rate: false,
                                            default: "No",
                                            billable: true,
                                            applicable: rateDetail?.rate_type?.is_enabled ?? true,
                                            markup: rateDetail?.markup || 0,
                                        });
                                    }
                                });

                                currentShifts.push({
                                    shift_id: stRate?.shift_type?.id || "",
                                    seq_number: config?.base_rate?.seq_number || 0,
                                    time_duration: stRate?.shift_type?.time_duration || "",
                                    shift_type_time: shiftTypeTimes,
                                    shift_type: stRate?.shift_type?.shift_type_name || "",
                                    rate_details: [
                                        {
                                            abbreviation: stRate?.abbreviation || "",
                                            billrate: {
                                                amount: config?.base_rate?.client_bill_rate || 0,
                                                rate_factor: 1,
                                                rate_type: stRate?.name || "Standard Rate",
                                                adjustment: config?.base_rate?.msp_fee || 0,
                                                adjustment_type: config?.base_rate?.msp_fee_type || "Unknown",
                                                is_diffe_edit: false,
                                            },
                                            payrate: {
                                                amount: config?.base_rate?.candidate_pay_rate || 0,
                                                rate_factor: 1,
                                                rate_type: stRate?.name || "Standard Rate",
                                                is_diffe_edit: false,
                                            },
                                            vendor_rate: {
                                                amount: config?.base_rate?.vendor_bill_rate || 0,
                                            },
                                            rate_type_id: stRate?.id || "",
                                            rate_type_title: stRate?.name || "",
                                            rate_type_category_id: stRate?.rate_type_category?.id || "",
                                            rate_type_category_title: stRate?.rate_type_category?.label || "Standard",
                                            is_base_rate: true,
                                            default: null,
                                            billable: true,
                                            applicable: stRate?.shift_type?.is_enabled ?? true,
                                            markup: config?.base_rate?.markup || 0
                                        },
                                        ...shiftRate
                                    ],
                                });
                            } else {
                                rateDetails.push({
                                    abbreviation: stRate?.abbreviation || "ST",
                                    seq_number: config?.base_rate?.seq_number,
                                    billrate: {
                                        amount: config?.base_rate?.client_bill_rate || 0,
                                        rate_factor: 1,
                                        rate_type: stRate?.name || "Standard Rate",
                                        adjustment: config?.base_rate?.msp_fee || 0,
                                        adjustment_type: config?.base_rate?.msp_fee_type || "Unknown",
                                        is_diffe_edit: false,
                                    },
                                    payrate: {
                                        amount: config?.base_rate?.candidate_pay_rate || 0,
                                        rate_factor: 1,
                                        rate_type: stRate?.name || "Standard Rate",
                                        is_diffe_edit: false,
                                    },
                                    vendor_rate: {
                                        amount: config?.base_rate?.vendor_bill_rate || 0,
                                    },
                                    rate_type_id: stRate?.id || "",
                                    rate_type_title: stRate?.name || "",
                                    rate_type_category_id: stRate?.rate_type_category?.id || "",
                                    rate_type_category_title: stRate?.rate_type_category?.label || "Standard",
                                    is_base_rate: true,
                                    default: "No",
                                    billable: true,
                                    applicable: stRate?.is_enabled ?? true,
                                    markup: config?.base_rate?.markup || 0,
                                });
                            }


                            // Process shift rates (only push if not already in shiftRate)
                            config?.rate?.forEach((ShiftRates: any) => {
                            const shiftRate: any[] = [];

                                ShiftRates?.rates?.forEach((rates: any) => {
                                    if (!shiftRate.some(r => r.rate_type_id === rates.rate_type?.id)) {
                                        shiftRate.push({
                                            abbreviation: rates?.rate_type?.abbreviation || "",
                                            seq_number: rates?.seq_number,
                                            billrate: {
                                                amount: rates?.client_bill_rate || 0,
                                                rate_factor: rates?.bill_rate?.[0]?.differential_value || 1,
                                                rate_type: rates?.rate_type?.name || "",
                                                adjustment: config?.base_rate?.msp_fee || 0,
                                                adjustment_type: config?.base_rate?.msp_fee_type || "Unknown",
                                                is_diffe_edit: false,
                                                differential_type: rates?.bill_rate?.[0]?.differential_type || ""
                                            },
                                            payrate: {
                                                amount: rates?.candidate_pay_rate || 0,
                                                rate_factor: rates?.pay_rate?.[0]?.differential_value || 1,
                                                rate_type: rates?.rate_type?.name || "",
                                                is_diffe_edit: false,
                                                differential_type: rates?.pay_rate?.[0]?.differential_type || ""
                                            },
                                            vendor_rate: {
                                                amount: rates?.vendor_bill_rate || 0,
                                            },
                                            rate_type_id: rates?.rate_type?.id || "",
                                            rate_type_title: rates?.rate_type?.name || "",
                                            rate_type_category_id: rates?.rate_type?.rate_type_category?.id || "",
                                            rate_type_category_title: rates?.rate_type?.rate_type_category?.name || "Unknown",
                                            is_base_rate: false,
                                            default: "No",
                                            billable: true,
                                            applicable: rates?.rate_type?.is_enabled ?? true,
                                            markup: rates?.markup || 0,
                                        });
                                    }
                                });

                                const shiftTypeTimes = (ShiftRates?.rate_type?.shift_type?.shift_type_time || [])
                                    ?.map((time: any) => ({
                                        shift_start_time: time?.shift_start_time,
                                        shift_end_time: time?.shift_end_time,
                                    }));

                                currentShifts.push({
                                    seq_number: ShiftRates?.seq_number,
                                    shift_id: ShiftRates?.rate_type?.shift_type?.id || "",
                                    time_duration: ShiftRates?.rate_type?.shift_type?.time_duration || "",
                                    shift_type_time: shiftTypeTimes,
                                    shift_type: ShiftRates?.rate_type?.shift_type?.shift_type_name || "",
                                    rate_details: [
                                        {
                                            abbreviation: ShiftRates?.rate_type?.abbreviation || "",
                                            billrate: {
                                                amount: ShiftRates?.client_bill_rate || 0,
                                                rate_factor: ShiftRates?.bill_rate?.[0]?.differential_value || 1,
                                                rate_type: ShiftRates?.rate_type?.name || "fixed",
                                                adjustment: config?.msp_fee || 0,
                                                adjustment_type: config?.feeType || "percentage",
                                                is_diffe_edit: true,
                                                differential_type: ShiftRates?.bill_rate?.[0]?.differential_type || ""
                                            },
                                            payrate: {
                                                amount: ShiftRates?.candidate_pay_rate || 0,
                                                rate_factor: ShiftRates?.pay_rate?.[0]?.differential_value || 1,
                                                rate_type: ShiftRates?.rate_type?.name || "fixed",
                                                is_diffe_edit: false,
                                                differential_type: ShiftRates?.pay_rate?.[0]?.differential_type || ""
                                            },
                                            vendor_rate: {
                                                amount: ShiftRates?.vendor_bill_rate || 0,
                                            },
                                            rate_type_id: ShiftRates?.rate_type?.id || "",
                                            rate_type_title: ShiftRates?.rate_type?.name || "",
                                            rate_type_category_id: ShiftRates?.rate_type?.rate_type_category?.id || "",
                                            rate_type_category_title: ShiftRates?.rate_type?.rate_type_category?.value || "Standard",
                                            is_base_rate: false,
                                            default: null,
                                            billable: true,
                                            applicable: ShiftRates?.rate_type?.is_enabled ?? true,
                                            markup: ShiftRates?.markup || 0,
                                        },
                                        ...shiftRate
                                    ],
                                });
                            });
                        }
                        if (currentShifts?.length > 0) {
                            shiftsData.push({
                                seq_number: config?.base_rate?.seq_number,
                                shift: currentShifts
                            });
                        }
                    });

                    return {
                        hierarchy: hierarchy?.id,
                        markup: rate?.rate_configuration?.[0]?.base_rate?.markup?.toString() || "0",
                        max_bill_rate: offer?.financial_details?.billRateValue?.bill_rate,
                        rate_details: rateDetails,
                        shifts: shiftsData,
                    };
                });
            });
        }
        return rates?.flatMap((rate: any) => {
            return rate?.hierarchies?.map((hierarchy: any) => {
                const rateDetails: any[] = [];

                rate?.rate_configuration?.forEach((config: any) => {
                    const stRate = config?.base_rate?.rate_type;

                    rateDetails?.push({
                        abbreviation: stRate?.abbreviation || "ST",
                        seq_number: config?.base_rate?.seq_number,
                        billrate: {
                            amount: config?.base_rate?.client_bill_rate || 0,
                            rate_factor: 1,
                            rate_type: stRate?.name || "Standard Rate",
                            adjustment: config?.base_rate?.msp_fee || 0,
                            adjustment_type: config?.base_rate?.msp_fee_type || "Unknown",
                            is_diffe_edit: false,
                        },
                        payrate: {
                            amount: config?.base_rate?.candidate_pay_rate || 0,
                            rate_factor: 1,
                            rate_type: stRate?.name || "Standard Rate",
                            is_diffe_edit: false,
                        },
                        vendor_rate: {
                            amount: config?.base_rate?.vendor_bill_rate || 0,
                        },
                        rate_type_title: stRate?.name || "",
                        rate_type_id: stRate?.id || "",
                        rate_type_category_id: stRate?.rate_type_category?.id || "",
                        rate_type_category_title: stRate?.rate_type_category?.label || "Standard",
                        is_base_rate: true,
                        default: "No",
                        billable: true,
                        applicable: stRate?.is_enabled || false,
                        markup: config?.base_rate?.markup || 0,
                    });

                    config?.base_rate?.rates?.forEach((rateDetail: any) => {
                        rateDetails?.push({
                            abbreviation: rateDetail?.rate_type?.abbreviation || "",
                            seq_number: rateDetail?.seq_number,
                            billrate: {
                                amount: rateDetail?.client_bill_rate || 0,
                                rate_factor: rateDetail?.bill_rate?.[0]?.differential_value || 1,
                                rate_type: rateDetail?.rate_type?.name || "",
                                adjustment: config?.base_rate?.msp_fee || 0,
                                adjustment_type: config?.base_rate?.msp_fee_type || "Unknown",
                                is_diffe_edit: false,
                                differential_type: rateDetail?.bill_rate?.[0]?.differential_type || ""
                            },
                            payrate: {
                                amount: rateDetail?.candidate_pay_rate || 0,
                                rate_factor: rateDetail?.pay_rate?.[0]?.differential_value || 1,
                                rate_type: rateDetail?.rate_type?.name || "",
                                is_diffe_edit: false,
                                differential_type: rateDetail?.pay_rate?.[0]?.differential_type || ""
                            },
                            vendor_rate: {
                                amount: rateDetail?.vendor_bill_rate || 0,
                            },
                            rate_type_id: rateDetail?.rate_type?.id || "null",
                            rate_type_title: rateDetail?.rate_type?.name || "",
                            rate_type_category_id: rateDetail?.rate_type?.rate_type_category?.id || "",
                            rate_type_category_title: rateDetail?.rate_type?.rate_type_category?.name || "Unknown",
                            is_base_rate: false,
                            default: "No",
                            billable: true,
                            applicable: rateDetail?.rate_type?.is_enabled || false,
                            markup: rateDetail?.markup || 0,
                        });
                    });
                });
                return {
                    hierarchy: hierarchy?.id,
                    markup: rate?.rate_configuration?.[0]?.base_rate?.markup || "0",
                    max_bill_rate: offer?.financial_details?.billRateValue?.bill_rate,
                    rate_details: rateDetails,
                };
            });
        });
    };

    const mappedRates = mapRates(offer?.financial_details?.rates);
    console.log("mappedRates is", JSON.stringify(mappedRates));

    return mappedRates;
}

export async function mapFeeDetails(offer: any, transaction: any) {
    if (
        !offer?.financial_details?.rates ||
        !offer?.financial_details?.fee_details?.categorical_fees
    ) {
        throw new Error("Rates or fee details are missing");
    }

    const mapRates = (rates: any) => {
        return rates?.flatMap((rate: any) =>
            rate?.hierarchies?.map((hierarchy: any) => ({
                hierarchy: hierarchy?.id,
            }))
        );
    };

    const hierarchies = mapRates(offer?.financial_details?.rates)?.map(
        (item: any) => item?.hierarchy
    );

    const feeDetails = offer?.financial_details?.fee_details;
    const mappedFees = hierarchies?.map((hierarchyId: any) => {
        const feeData = feeDetails?.categorical_fees?.flatMap((feeCategory: any) =>
            feeCategory?.applicable_config
                ?.filter((config: any) => config?.entity_ref === "ASSIGNMENT")
                ?.map((config: any) => ({
                    value: config?.fee || 0,
                    applicable_on: feeCategory?.funded_by || "Unknown",
                    unit: feeCategory?.fee_type?.toLowerCase() === 'fixed' ? 'fixed_amount' : 'percentage',
                    name: feeCategory?.fee_category || "Unknown",
                    funded_by: feeCategory?.funded_by || "Unknown",
                }))
        );

        console.log('Fee data:', feeData);

        const totalValue = feeData?.reduce((sum: any, item: any) => {
            return sum + parseFloat(item?.value || 0);
        }, 0);
        console.log('totalValue', totalValue);

        feeData?.push({
            value: totalValue || 0,
            applicable_on: feeData[0]?.funded_by || "Unknown",
            unit: feeData[0]?.unit,
            name: 'MSP',
            funded_by: feeData[0]?.funded_by || "Unknown",
        })
        return {
            hierarchy: hierarchyId,
            data: feeData,
        };
    });

    return mappedFees;
}

export async function generateAssignmentPayload(
    offer: any,
    candidateId: string,
    programId: string,
    customFields: any[] = [],
    masterData: any[] = [],
    userId: string,
    mappedRates: any[],
    feeDetails: any[]
) {
    const queries = {
        candidate: `
      SELECT *
      FROM ${config_db}.candidates
      WHERE id = :candidate_id
      LIMIT 1;
      `,
        job: jobQuery,
        jobTemplate: `
      SELECT template_name, id, job_id, is_expense_allowed, is_shift_rate
      FROM ${config_db}.job_templates
      WHERE id = :job_template_id
      LIMIT 1;
      `,
        hierarchies: `
      SELECT hierarchy
      FROM offers_hierarchy
      WHERE offer_id = :offer_id;
      `,
    };

    const [candidateResult, jobResult, hierarchiesResult] = await Promise.all([
        sequelize.query(queries.candidate, {
            replacements: { candidate_id: candidateId },
            type: QueryTypes.SELECT,
        }),
        sequelize.query(queries.job, {
            replacements: { job_id: offer?.job_id },
            type: QueryTypes.SELECT,
        }),
        sequelize.query(queries.hierarchies, {
            replacements: { offer_id: offer?.id },
            type: QueryTypes.SELECT,
        }),
    ]);

    const candidate: any = candidateResult[0];
    const job: any = jobResult[0];
    if (!candidate || !job) throw new Error("Failed to fetch candidate or job data");

    const jobTemplateResult = await sequelize.query(queries.jobTemplate, {
        replacements: { job_template_id: job?.job_template_id },
        type: QueryTypes.SELECT,
    });

    const jobTemplate: any = jobTemplateResult[0];
    const hierarchyIds: any = hierarchiesResult?.map((h: any) => h?.hierarchy);

    const budgets = offer?.financial_details?.billRateValue?.budget;
    const additional_amount = offer?.financial_details?.billRateValue?.additional_amount;
    const timesheet_budgets = Math?.abs(budgets - additional_amount);
    const start_date = offer?.start_date;
    const end_date = offer?.end_date;
    const original_start_date = offer?.worker_start_date || null;
    const classification_id = offer?.worker_classification
    const Query = `
          SELECT value
          FROM ${config_db}.picklistitems
          WHERE id = :classification_id
      `;

    const [classification]: any = await sequelize.query(Query, {
        type: QueryTypes.SELECT,
        replacements: { classification_id },
    });

    return {
        is_quick_assignment: false,
        is_shift_based: jobTemplate?.is_shift_rate,
        offer_id: offer?.id,
        onboarding_flow_id: offer?.onboarding_flow_id,
        is_shift_rate: jobTemplate?.is_shift_rate || false,
        shift_type: job?.shift,
        checklist_entity_id: offer?.checklist_entity_id,
        checklist_version: offer?.checklist_version,
        candidate_id: candidateId,
        hierarchy_ids: hierarchyIds,
        sourcing_model: "contingent",
        source: "job",
        vendor_id: offer?.vendor_id,
        timesheet_type: offer?.timesheet_type,
        title: jobTemplate?.template_name,
        source_details: {
            title: jobTemplate?.template_name,
            id: job?.id,
            code: job?.job_id,
            job_template_id: jobTemplate?.id,
            job_template_code: jobTemplate?.job_id,
        },
        assignment_manager: offer?.job_manager,
        work_location: offer?.work_location,
        start_date: start_date,
        end_date: end_date,
        managed_by: offer?.managed_by,
        job_type: job?.job_type,
        candidate_sourcing_type: offer?.candidate_source,
        program_id: programId,
        worker: {
            source_type: "new_worker",
            original_start_date: original_start_date || null,
            official_email: offer?.worker_email,
            classification: classification?.value,
        },
        labor_category: job?.labor_category_id,
        remote_worker: offer?.is_remote_worker,
        remote_worker_details: {
            remote_country: candidate?.country_id,
            remote_state: candidate?.addresses[0]?.state,
            remote_county: candidate?.addresses[0]?.county,
            remote_city: candidate?.addresses[0]?.city,
        },
        primary_hierarchy: job?.primary_hierarchy,
        primary_shift: job?.shift,
        is_billable: true,
        ot_exempt: typeof offer?.financial_details?.ot_exempt === "string"
            ? offer?.financial_details?.ot_exempt?.toLowerCase() === "yes"
                ? true
                : offer?.financial_details?.ot_exempt?.toLowerCase() === "no"
                    ? false
                    : offer?.financial_details?.ot_exempt
            : offer?.financial_details?.ot_exempt,
        is_expense_allowed: offer?.expense_allowed || false,
        is_timesheet_enabled: true,
        unit_of_measure: offer?.financial_details?.unit_of_measure,
        rate_model: offer?.financial_details?.rate_model,
        timesheet_manager: offer?.timesheet_manager,
        expense_manager: offer?.expense_manager,
        additional_budget: offer?.financial_details?.billRateValue?.additional_amount,
        additional_budget_type: offer?.financial_details?.adjustment_type
            ? offer?.financial_details?.adjustment_type?.toUpperCase() === "FLAT AMOUNT"
                ? "FIXED_AMOUNT"
                : offer?.financial_details?.adjustment_type?.toUpperCase()
            : '',
        additional_budget_percentage:
            offer?.financial_details?.adjustment_type?.toUpperCase() === "FLAT AMOUNT" ? 0 : offer?.financial_details?.additionalBudget,
        vendor_markup: parseFloat(offer?.financial_details?.vendor_markup),
        expense: [],
        tax: [],
        adjustment_fee: [],
        st_days: job?.shifts_per_week,
        shift_hours: job?.estimated_hours_per_shift,
        shift_days: job?.shifts_per_week,
        markup: isNaN(job?.budgets?.max?.markup) ? 0 : job?.budgets?.max?.markup ?? 0,
        currency: job?.currency,
        st_hours: job?.estimated_hours_per_shift,
        days_per_week: job?.shifts_per_week,
        net_allocated_budget: offer?.financial_details?.billRateValue?.budget,
        adjustment_budget: job?.budgets != null ? job?.budgets?.max?.additional_amount : 0,
        expense_budget: 0,
        estimated_tax: 0,
        timesheet_budget: timesheet_budgets,
        gross_allocated_budget: offer?.financial_details?.billRateValue?.budget,
        estimated_adjustment: 0,
        adjusted_markup: 0,
        custom_field: customFields || [],
        master_data: masterData || [],
        rate: mappedRates || [],
        fee: feeDetails || [],
    };
}
export { createAssignment, formatDateFromTimestamp, formatShiftDateFromTimestamp };