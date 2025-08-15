import { FastifyRequest } from "fastify";
import CandidateHistoryModel from '../models/candidate-history.model';
import { sequelize } from '../config/instance';
import { getUserDetails } from '../utility/candidate_history_queries';
import { CandidateHistoryService as CandidateHistoryHelper } from '../utility/candidate_history_helper';
import { determineUserType } from '../utility/notification-helper';
import { skipJobFilterActions, vendorHiddenActions } from '../utility/candidate-history-actions';
import { Op } from 'sequelize';

export class CandidateHistoryService {
    private candidateHistoryHelper: CandidateHistoryHelper;

    constructor() {
        this.candidateHistoryHelper = new CandidateHistoryHelper(sequelize);
    }

    async createCandidateHistory(
        request: FastifyRequest<{ Params: { program_id: string } }>
    ) {
        const { program_id } = request.params;
        const { oldData, newData, action } = request.body as any;

        const newRecord = await this.candidateHistoryHelper.handleCandidateHistory({ program_id, oldData, newData, action });

        return {
            message: 'Candidate history created successfully',
            newRecord,
        };
    }

    async getAllCandidateHistory(
        request: FastifyRequest<{ Params: { program_id: string; candidate_id: string } }>
    ) {
        const { program_id, candidate_id } = request.params;
        const { job_id } = request.query as any;
        let whereClause: any = { program_id, candidate_id };

        if (job_id) {
            whereClause = {
                [Op.and]: [
                    { program_id },
                    { candidate_id },
                    {
                        [Op.or]: [
                            { action: { [Op.in]: skipJobFilterActions } },
                            { job_id }
                        ]
                    }
                ]
            };
        }

        const authHeader = request.headers.authorization;
        const token = authHeader?.split(" ")[1] ?? "";
        const user = request.user;
        const userType = await determineUserType(user, token);

        const histories = await CandidateHistoryModel.findAll({
            where: whereClause,
            order: [['revision', 'DESC']],
            raw: true,
        });

        if (!histories || histories.length === 0) {
            return {
                status_code: 404,
                message: "Candidate history not found.",
                history: [],
            };
        }

        const filteredHistories = histories.filter(record => {
            return !(
                userType?.toLowerCase() === 'vendor' &&
                vendorHiddenActions.includes(record.action?.trim())
            );
        });

        const history = await Promise.all(
            filteredHistories.map(async (record) => {
                let updatedBy = null;
                if (record.updated_by) {
                    try {
                        const userDetails = await getUserDetails(sequelize, record.updated_by);
                        if (userDetails) {
                            updatedBy = {
                                id: record.updated_by,
                                first_name: userDetails.first_name || null,
                                last_name: userDetails.last_name || null,
                            };
                        }
                    } catch (err) {
                        console.error("User lookup failed for", record.updated_by, err);
                    }
                }

                return {
                    reason: record.reason ?? null,
                    status: record.status ?? null,
                    action: record.action ?? null,
                    revision: record.revision ?? null,
                    updated_by: updatedBy,
                    created_on: record.created_on ?? null,
                    updated_on: record.updated_on ?? null,
                    is_show:
                        (record?.compare_meta_data && typeof record.compare_meta_data === 'object'
                            ? Object.keys(record.compare_meta_data).length > 0
                            : false)
                };
            })
        );

        return {
            status_code: 200,
            message: "Candidate revision history fetched successfully.",
            history,
        };
    }

    async getCandidateHistoryByRevision(
        request: FastifyRequest<{ Params: { program_id: string, candidate_id: string, revision_id: string } }>
    ) {
        const { program_id, candidate_id, revision_id } = request.params;
        const { job_id } = request.query as any;
        const whereClause: any = {
            program_id,
            candidate_id,
            revision: revision_id,
        };
        if (job_id) {
            whereClause.job_id = job_id;
        }

        const candidatetMetaData = await CandidateHistoryModel.findOne({
            where: whereClause,
        });

        if (!candidatetMetaData) {
            return {
                status_code: 404,
                message: "Candidate revision history not found.",
                data: null,
            };
        }

        let newMetaData = candidatetMetaData.new_meta_data;
        if (typeof newMetaData === "string") {
            newMetaData = JSON.parse(newMetaData);
        }

        let compareMetaData: any = candidatetMetaData.compare_meta_data;
        if (typeof compareMetaData === "string") {
            compareMetaData = JSON.parse(compareMetaData);
        }

        const candidateDiff = compareMetaData || {};
        const compare_meta_data = Object.entries(candidateDiff).map(([slug, value]: [string, any]) => ({
            key: value.key ?? CandidateHistoryHelper.toReadableKey(slug),
            slug,
            old_value: value.old_value ?? null,
            new_value: value.new_value ?? null,
        }));

        const enrichedMetaData = await this.candidateHistoryHelper.populateNewMetaData(compareMetaData);

        const filteredMetaData = Object.values(enrichedMetaData).filter((item: any) => {
            return item?.key && item?.slug && !['updated_by', 'updated_on'].includes(item.slug);
        });

        let updatedBy = null;
        if (candidatetMetaData.updated_by) {
            try {
                const userDetails = await getUserDetails(sequelize, candidatetMetaData.updated_by);
                if (userDetails) {
                    updatedBy = {
                        id: candidatetMetaData.updated_by,
                        first_name: userDetails.first_name || null,
                        last_name: userDetails.last_name || null,
                    };
                }
            } catch (err) {
                console.error("User lookup failed for", candidatetMetaData.updated_by, err);
            }
        }

        return {
            message: "Candidate revision history fetched successfully",
            data: {
                reason: candidatetMetaData.reason,
                status: candidatetMetaData.status,
                action: candidatetMetaData.action,
                revision: candidatetMetaData.revision,
                compare_meta_data: filteredMetaData,
                newMetaData,
                updated_by: updatedBy,
                created_on: candidatetMetaData.created_on ?? null,
                updated_on: candidatetMetaData.updated_on ?? null,
            },
        };
    }
}