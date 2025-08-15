import { QueryTypes } from "sequelize";
import { sequelize } from "../config/instance";
import { databaseConfig } from '../config/db';
import { AnyMxRecord } from "dns";
const config_db = databaseConfig.config.database_config;

class SubmissionCandidateRepository {

    async vendorMarkup(program_id: string, replacements: Record<string, any>) {
        let workLocationCondition = '';
        let orderByWorkLocation = '';

        if (replacements.work_location_id) {
            workLocationCondition = 'AND vmc.work_locations = :work_location_id';
            orderByWorkLocation = `
                CASE WHEN vmc.program_industry = :labour_category_id AND vmc.work_locations = :work_location_id THEN 1 ELSE 2 END,
                CASE WHEN vmc.work_locations = :work_location_id THEN 1 ELSE 2 END,
            `;
        }

        const query = `
            SELECT
                vmc.markups,
                vmc.rate_model
            FROM
                ${config_db}.vendor_markup_config vmc
            WHERE
                vmc.program_id = :program_id
                AND vmc.program_vendor_id = :vendor_id
                AND (
                    (:rateModel LIKE CONCAT(vmc.rate_model, '%')
                    AND vmc.program_industry = :labour_category_id
                    )
                    OR
                    (vmc.is_all_labor_category = 1 AND vmc.is_all_work_locations = 1 AND vmc.is_all_hierarchy = 1)
                )
                ${workLocationCondition}
            ORDER BY
                -- Prioritize by exact industry and location matches (if work_location_id is provided)
                ${orderByWorkLocation}
                -- Fallback: Prioritize rows where all categories, locations, and hierarchy are set to 1
                CASE WHEN vmc.is_all_labor_category = 1 AND vmc.is_all_work_locations = 1 AND vmc.is_all_hierarchy = 1 THEN 3 ELSE 1 END,
                -- Additional sorting logic if needed
                CASE WHEN vmc.program_industry = :labour_category_id THEN 1 ELSE 2 END
            LIMIT 1;
        `;
        const result = await sequelize.query(query, {
            replacements: {
                program_id,
                ...replacements,
            },
            type: QueryTypes.SELECT,
        });
        return result[0] || null;
    }

    async programQuery(program_id: string): Promise<{ name: string, display_name: string, unique_id: string }[]> {
        const query = `
                SELECT
                    programs.name,
                    programs.display_name,
                    programs.unique_id
                FROM ${config_db}.programs
                WHERE programs.id = :program_id;
            `;

        const data = await sequelize.query<{ name: string, display_name: string, unique_id: string }>(query, {
            replacements: { program_id },
            type: QueryTypes.SELECT,
        });

        return data;
    }

    async submiteCandidatesGetAll(replacements: any): Promise<any[]> {
        const query = `
WITH level_recipients AS (
    SELECT
        sc.id AS candidate_id,
        sc.status AS candidate_status,
        CAST(JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.placement_order')) AS UNSIGNED) AS placement_order,
        JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.status')) AS level_status,
        JSON_UNQUOTE(JSON_EXTRACT(recipient.recipient_json, '$.status')) AS recipient_status,
        recipient.recipient_json AS recipient_json
    FROM submission_candidate sc
    JOIN ${config_db}.workflow vm ON sc.id = vm.workflow_trigger_id,
    JSON_TABLE(vm.levels, '$[*]' COLUMNS (
        level_json JSON PATH '$'
    )) AS level,
    JSON_TABLE(level.level_json, '$.recipient_types[*]' COLUMNS (
        recipient_json JSON PATH '$'
    )) AS recipient
    WHERE sc.program_id = :program_id
    AND sc.is_deleted = 0
),
matching_levels AS (
    SELECT candidate_id, placement_order
    FROM level_recipients
    WHERE level_status = 'pending'
    AND recipient_status = 'pending'
    AND JSON_SEARCH(JSON_EXTRACT(recipient_json, '$.meta_data'), 'one', :user_id) IS NOT NULL
    GROUP BY candidate_id, placement_order
),
all_levels AS (
    SELECT
        sc.id AS candidate_id,
        CAST(JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.placement_order')) AS UNSIGNED) AS placement_order,
        JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.status')) AS level_status,
        JSON_LENGTH(JSON_EXTRACT(level.level_json, '$.recipient_types')) AS recipient_count
    FROM submission_candidate sc
    JOIN ${config_db}.workflow vm ON sc.id = vm.workflow_trigger_id,
    JSON_TABLE(vm.levels, '$[*]' COLUMNS (
        level_json JSON PATH '$'
    )) AS level
    WHERE sc.program_id = :program_id
    AND sc.is_deleted = 0
),
valid_levels AS (
    SELECT ml.candidate_id, ml.placement_order
    FROM matching_levels ml
    WHERE NOT EXISTS (
        SELECT 1
        FROM all_levels prior
        WHERE prior.candidate_id = ml.candidate_id
          AND prior.placement_order < ml.placement_order
          AND (
              prior.recipient_count > 0 AND prior.level_status NOT IN ('completed', 'bypassed')
          )
    )
),
Candidates AS (
    SELECT
        c.id,
        c.program_id,
        c.unique_id,
        c.candidate_id,
        cand.first_name,
        cand.last_name,
        cand.middle_name,
        cand.worker_type_id,
        cand.do_not_rehire,
        cand.do_not_rehire_reason,
        cand.do_not_rehire_notes,
        c.resume_url,
        c.available_start_date,
        c.available_end_date,
        c.is_candidate_work_before,
        c.is_remote_worker,
        c.candidate_source,
        c.employment_status,
        c.status,
        c.description,
        c.documents,
        c.financial_detail,
        c.created_on,
        c.updated_on,
        c.is_deleted,
        c.is_enabled,
        c.worker_classification,
        j.work_location_id,
        c.addresses,
        j.job_id AS job_code,
        j.id AS job_id,
        c.scores,
        c.is_duplicate_submission,
        c.is_rate_above_max_limit,
        jt.template_name AS job_title,
        jt.is_submission_exceed_max_bill_rate,
        (
            SELECT COUNT(*)
            FROM submission_candidate sc
            WHERE sc.candidate_id = c.candidate_id AND sc.program_id = c.program_id
        ) AS submitted_jobs_count,
        COUNT(*) OVER() AS total_count
    FROM submission_candidate c
    LEFT JOIN ${config_db}.candidates cand ON c.candidate_id = cand.id
    LEFT JOIN jobs j ON c.job_id = j.id
    LEFT JOIN ${config_db}.job_templates jt ON j.job_template_id = jt.id
    WHERE c.program_id = :program_id
    AND c.is_deleted = false
    AND (
        :user_id IS NULL
        OR (
            :isValidStatus = FALSE
            OR c.id IN (SELECT candidate_id FROM valid_levels)
        )
    )
    ${replacements.employment_status ? "AND c.employment_status LIKE :employment_status" : ""}
    ${replacements.updated_on ? "AND c.updated_on = :updated_on" : ""}
    ${replacements.worker_type_id ? "AND cand.worker_type_id = :worker_type_id" : ""}
    ${replacements.unique_id ? "AND c.unique_id = :unique_id" : ""}
    ${replacements.job_id ? "AND c.job_id = :job_id" : ""}
    ${replacements.job_ids && replacements.job_ids.length > 0 ? "AND c.job_id IN (:job_ids)" : ""}
    ${replacements.search ? `AND (
        cand.first_name LIKE :search OR
        cand.last_name LIKE :search OR
        CONCAT(cand.first_name, ' ', cand.last_name) LIKE :search
    )` : ""}
    ${replacements.available_start_date ? "AND c.available_start_date LIKE :available_start_date" : ""}
    ${replacements.preferred_location ? "AND j.work_location_id = :preferred_location" : ""}
    ${replacements.status && replacements.status.length > 0 ? "AND c.status IN (:status)" : ""}
    ${replacements.first_name ? "AND cand.first_name LIKE :first_name" : ""}
    ${replacements.job_title ? "AND jt.template_name LIKE :job_title" : ""}
    ${replacements.job_code ? "AND j.job_id LIKE :job_code" : ""}
    ${replacements.created_on ? 'AND DATE(FROM_UNIXTIME(c.created_on / 1000)) = DATE(:created_on)' : ''}
    ORDER BY c.created_on DESC
    LIMIT :limit OFFSET :offset
)

SELECT
    Candidates.*,
    CASE
        WHEN Candidates.is_remote_worker = false AND Candidates.work_location_id IS NOT NULL THEN (
            SELECT name FROM ${config_db}.work_locations wl WHERE wl.id = Candidates.work_location_id
        )
        ELSE NULL
    END AS work_location_name,
    JSON_UNQUOTE(JSON_EXTRACT(Candidates.addresses, '$.zipcode')) AS address_zip,
    JSON_UNQUOTE(JSON_EXTRACT(Candidates.addresses, '$.city')) AS address_city,
    JSON_UNQUOTE(JSON_EXTRACT(Candidates.addresses, '$.state')) AS address_state,
    JSON_UNQUOTE(JSON_EXTRACT(Candidates.addresses, '$.country')) AS address_country,
    JSON_UNQUOTE(JSON_EXTRACT(Candidates.addresses, '$.address_line_1')) AS address_street,
    cm.id AS country_id,
    cm.name AS country_name,
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM offers o
            WHERE o.program_id = Candidates.program_id
              AND o.job_id = Candidates.job_id
              AND o.candidate_id = Candidates.candidate_id
        ) THEN true ELSE false
    END AS offer_flag,
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM interviews i
            WHERE i.program_id = Candidates.program_id
              AND i.job_id = Candidates.job_id
              AND i.submit_candidate_id = Candidates.candidate_id
        ) THEN true ELSE false
    END AS interview_flag,
    Candidates.total_count
FROM Candidates
LEFT JOIN ${config_db}.countries cm ON JSON_UNQUOTE(JSON_EXTRACT(Candidates.addresses, '$.country')) = cm.id
ORDER BY Candidates.created_on DESC, Candidates.id DESC;
`;



        return sequelize.query(query, {
            replacements,
            type: QueryTypes.SELECT
        });
    }


    async submiteCandidatesGetAllForVendor(replacements: any): Promise<any[]> {
        const query = `
            WITH program_vendor_match AS (
                SELECT id
                FROM ${config_db}.program_vendors
                WHERE tenant_id = :vendor_id AND program_id = :program_id
            ), RankedCandidates AS (
                SELECT
                    c.id,
                    c.program_id,
                    c.unique_id,
                    c.candidate_id,
                    cand.first_name,
                    cand.last_name,
                    cand.middle_name,
                    cand.worker_type_id,
                    cand.do_not_rehire,
                    cand.do_not_rehire_reason,
                    cand.do_not_rehire_notes,
                    c.resume_url,
                    c.available_start_date,
                    c.available_end_date,
                    c.is_candidate_work_before,
                    c.is_remote_worker,
                    c.candidate_source,
                    c.employment_status,
                    c.status AS candidate_status,
                    c.description,
                    c.documents,
                    c.financial_detail,
                    c.worker_classification,
                    c.created_on,
                    c.updated_on,
                    c.is_deleted,
                    c.is_enabled,
                    j.work_location_id,
                    c.addresses,
                    j.job_id AS job_code,
                    j.id AS job_id,
                    jt.template_name AS job_title,
                    jt.is_submission_exceed_max_bill_rate,
                    c.scores,
                    c.is_duplicate_submission,
                    c.is_rate_above_max_limit,
                    (
                        SELECT COUNT(*)
                        FROM submission_candidate sc
                        WHERE sc.candidate_id = c.candidate_id AND sc.program_id = c.program_id
                    ) AS submitted_jobs_count,
                    CASE
                        WHEN UPPER(c.status) IN (
                            'OFFER PENDING REVIEW', 'OFFER PENDING APPROVAL',
                            'PENDING SHORTLIST', 'PENDING RE-HIRE CHECK REVIEW',
                            'PENDING RE-HIRE CHECK APPROVAL', 'PENDING_SHORTLIST_REVIEW',
                            'PENDING_SHORTLIST_APPROVAL', 'PENDING_REHIRE_REVIEW', 'PENDING_REHIRE_APPROVAL','SHORTLISTED'
                        ) THEN 'submitted'
                        ELSE c.status
                    END AS status,
                    COUNT(*) OVER() AS total_count,
                     ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY c.created_on DESC) AS row_num
                FROM submission_candidate c
                INNER JOIN program_vendor_match pv ON c.vendor_id = pv.id
                LEFT JOIN ${config_db}.candidates cand ON c.candidate_id = cand.id
                LEFT JOIN jobs j ON c.job_id = j.id
                LEFT JOIN ${config_db}.job_templates jt ON j.job_template_id = jt.id
                LEFT JOIN ${config_db}.mtp mt ON c.candidate_id = mt.mtp_candidate_id
                WHERE c.program_id = :program_id
                  AND c.is_deleted = false
                  ${replacements.job_id ? "AND c.job_id = :job_id" : ""}
                  ${replacements.employment_status ? "AND c.employment_status LIKE :employment_status" : ""}
                  ${replacements.updated_on ? "AND c.updated_on = :updated_on" : ""}
                  ${replacements.worker_type_id ? "AND cand.worker_type_id = :worker_type_id" : ""}
                  ${replacements.unique_id ? "AND c.unique_id = :unique_id" : ""}
                  ${replacements.search ? `AND (
                      cand.first_name LIKE :search OR
                      cand.last_name LIKE :search OR
                      CONCAT(cand.first_name, ' ', cand.last_name) LIKE :search
                  )` : ""}
                  ${replacements.available_start_date ? "AND c.available_start_date LIKE :available_start_date" : ""}
                  ${replacements.preferred_location ? "AND j.work_location_id = :preferred_location" : ""}
                  ${replacements.status && replacements.status.length > 0
                ? `AND (
                CASE
                WHEN UPPER(c.status) IN (
                'OFFER PENDING REVIEW', 'OFFER PENDING APPROVAL',
                'PENDING SHORTLIST', 'PENDING RE-HIRE CHECK REVIEW',
                'PENDING RE-HIRE CHECK APPROVAL', 'PENDING_SHORTLIST_REVIEW',
                'PENDING_SHORTLIST_APPROVAL', 'PENDING_REHIRE_REVIEW',
                'PENDING_REHIRE_APPROVAL', 'SHORTLISTED'
                ) THEN 'submitted'
               ELSE c.status
               END
                ) IN (:status)`
                : ""}
                  ${replacements.first_name ? "AND cand.first_name LIKE :first_name" : ""}
                  ${replacements.job_title ? "AND jt.template_name LIKE :job_title" : ""}
                  ${replacements.job_code ? "AND j.job_id LIKE :job_code" : ""}
                  ${replacements.created_on ? 'AND DATE(FROM_UNIXTIME(c.created_on / 1000)) = DATE(:created_on)' : ''}
            ),
                   Candidates AS (
            SELECT * FROM RankedCandidates WHERE row_num = 1
        )
            SELECT
                Candidates.*,
                CASE
                    WHEN Candidates.is_remote_worker = false
                         AND Candidates.work_location_id IS NOT NULL
                    THEN (SELECT name FROM ${config_db}.work_locations wl WHERE wl.id = Candidates.work_location_id)
                    ELSE NULL
                END AS work_location_name,
                JSON_EXTRACT(Candidates.addresses, '$.zipcode') AS address_zip,
                JSON_EXTRACT(Candidates.addresses, '$.city') AS address_city,
                JSON_EXTRACT(Candidates.addresses, '$.state') AS address_state,
                JSON_EXTRACT(Candidates.addresses, '$.country') AS address_country,
                JSON_EXTRACT(Candidates.addresses, '$.address_line_1') AS address_street,
                cm.id AS country_id,
                cm.name AS country_name,
                CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM offers o
                        WHERE o.program_id = Candidates.program_id
                          AND o.job_id = Candidates.job_id
                          AND o.candidate_id = Candidates.candidate_id
                    ) THEN true
                    ELSE false
                END AS offer_flag,
                CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM interviews i
                        WHERE i.program_id = Candidates.program_id
                          AND i.job_id = Candidates.job_id
                          AND i.submit_candidate_id = Candidates.candidate_id
                    ) THEN true
                    ELSE false
                END AS interview_flag,
                Candidates.total_count
            FROM Candidates
            LEFT JOIN ${config_db}.countries cm ON JSON_EXTRACT(Candidates.addresses, '$.country') = cm.id
            ORDER BY Candidates.created_on DESC, Candidates.id DESC
            LIMIT :limit OFFSET :offset;
        `;

        return sequelize.query(query, {
            replacements,
            type: QueryTypes.SELECT
        });
    }


    async submiteCandidatesGetById(replacements: any): Promise<any[]> {
        const query = `
            WITH Candidates AS (
                SELECT
                    c.id,
                    c.program_id,
                    c.job_id,
                    c.unique_id,
                    c.candidate_id,
                    cand.first_name,
                    cand.last_name,
                    cand.middle_name,
                    cand.worker_type_id,
                    cand.avatar,
                    c.vendor_id,
                    cand.email,
                    cand.tenant_id,
                    c.resume_url,
                    c.available_start_date,
                    c.available_end_date,
                    c.is_candidate_work_before,
                    c.is_remote_worker,
                    c.candidate_source,
                    c.employment_status,
                    c.status,
                    c.description,
                    c.documents,
                    c.financial_detail,
                    c.created_on,
                    c.updated_on,
                    c.is_deleted,
                    c.is_enabled,
                    JSON_OBJECT(
                        'id', pi.id,
                        'value', pi.value,
                        'label', pi.label
                    ) AS worker_classification,
                    j.work_location_id,
                    c.addresses,
                    j.job_template_id,
                    JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'custom_field_id', scf.custom_field_id,
                            'value', scf.value
                        )
                    ) AS custom_fields
                FROM submission_candidate c
                LEFT JOIN ${config_db}.candidates cand ON c.candidate_id = cand.id
                LEFT JOIN ${config_db}.picklistitems pi on c.worker_classification = pi.id
                LEFT JOIN submission_candidate_customfields scf ON c.id = scf.submission_candidate_id
                LEFT JOIN jobs j ON c.job_id = j.id
                WHERE c.program_id = :program_id
                  AND c.id = :id
                  AND c.is_deleted = false
                GROUP BY c.id
            )
            SELECT
                Candidates.*,
                CASE
                    WHEN Candidates.is_remote_worker = false AND Candidates.work_location_id IS NOT NULL THEN (
                        SELECT wl.name
                        FROM ${config_db}.work_locations wl
                        WHERE wl.id = Candidates.work_location_id
                    )
                    ELSE NULL
                END AS work_location_name,
                JSON_UNQUOTE(JSON_EXTRACT(Candidates.addresses, '$.zipcode')) AS address_zip,
                JSON_UNQUOTE(JSON_EXTRACT(Candidates.addresses, '$.city')) AS address_city,
                JSON_UNQUOTE(JSON_EXTRACT(Candidates.addresses, '$.state')) AS address_state,
                JSON_UNQUOTE(JSON_EXTRACT(Candidates.addresses, '$.country')) AS address_country,
                JSON_UNQUOTE(JSON_EXTRACT(Candidates.addresses, '$.address_line_1')) AS address_street,
                cm.id AS country_id,
                cm.name AS country_name,
                jt.template_name AS job_template_name
            FROM Candidates
            LEFT JOIN ${config_db}.countries cm ON JSON_UNQUOTE(JSON_EXTRACT(Candidates.addresses, '$.country')) = cm.id
            LEFT JOIN ${config_db}.job_templates jt ON Candidates.job_template_id = jt.id;
        `;
        return sequelize.query(query, {
            replacements,
            type: QueryTypes.SELECT,
        });
    }

    async submiteCandidatesGetByCandidateId(replacements: any): Promise<any[]> {
        const query = `
            WITH Candidates AS (
                SELECT
                    c.id,
                    c.program_id,
                    c.job_id,
                    c.unique_id,
                    c.candidate_id,
                    cand.first_name,
                    cand.last_name,
                    cand.middle_name,
                    cand.worker_type_id,
                    cand.tenant_id,
                    cand.avatar,
                    cand.candidate_id as can_id,
                    c.vendor_id,
                    c.resume_url,
                    c.available_start_date,
                    c.available_end_date,
                    c.is_candidate_work_before,
                    c.is_remote_worker,
                    c.candidate_source,
                    c.employment_status,
                    c.is_duplicate_submission,
                    mt.id AS mtp_id,
                    JSON_OBJECT(
                        'id', pi.id,
                        'value', pi.value,
                        'label', pi.label
                    ) AS worker_classification,
                    cand.do_not_rehire,
                    cand.do_not_rehire_reason,
                    cand.do_not_rehire_notes,
                    ${replacements.isVendorUser
                ? `CASE
                        WHEN UPPER(c.status) IN (
                            'OFFER PENDING REVIEW',
                            'OFFER PENDING APPROVAL',
                            'PENDING_REHIRE_REVIEW',
                            'PENDING_REHIRE_APPROVAL',
                            'PENDING_SHORTLIST_REVIEW',
                            'SHORTLISTED'
                        ) THEN 'submitted'
                        ELSE c.status
                     END`
                : 'c.status'
            } AS status,
                    c.description,
                    c.documents,
                    c.financial_detail,
                    c.created_on,
                    c.updated_on,
                    c.is_deleted,
                    c.is_enabled,
                    j.work_location_id,
                    j.primary_hierarchy,
                    c.addresses,
                    j.job_template_id,
                    (
                      SELECT JSON_ARRAYAGG(result_row)
                    FROM (
                      SELECT
                        JSON_OBJECT(
                            'custom_field_id', scf.custom_field_id,
                            'value', scf.value,
                            'label', cf.label,
                            'field_type', cf.field_type,
                            'is_required', cf.is_required,
                            'options', cf.name,
                            'seq_number', cf.seq_number,
                            'manager_name',
                           CASE
                           WHEN user.user_id IS NOT NULL
                           THEN CONCAT(user.first_name, ' ', user.last_name)
                           ELSE NULL
                           END
                        ) result_row
                        FROM submission_candidate_customfields scf
                        LEFT JOIN ${config_db}.custom_fields cf ON scf.custom_field_id = cf.id
                        LEFT JOIN ${config_db}.user ON TRIM(BOTH '"' FROM scf.value) = user.user_id AND scf.program_id=user.program_id
                        WHERE scf.submission_candidate_id = c.id
                        AND cf.is_deleted=false
                        ANd cf.is_enabled=true
                        ORDER BY cf.seq_number ASC
                       ) AS ordered_results
                    ) AS custom_fields,
                    (
                        SELECT JSON_ARRAYAGG(
                            JSON_OBJECT(
                                'qualification_type_id', scq.qualification_type_id,
                                'qualification_type_name', qt.name,
                                'qualifications', (
                                    SELECT JSON_ARRAYAGG(
                                        JSON_OBJECT(
                                            'id', sq.id,
                                            'name', q.name,
                                            'is_primary', sq.is_primary,
                                            'experience_levels', sq.experience_levels
                                        )
                                    )
                                    FROM JSON_TABLE(scq.qualifications, '$[*]' COLUMNS (
                                        id VARCHAR(255) PATH '$.id',
                                        is_primary BOOLEAN PATH '$.is_primary',
                                        experience_levels JSON PATH '$.experience_levels'
                                    )) AS sq
                                    LEFT JOIN ${config_db}.qualifications q ON sq.id = q.id
                                )
                            )
                        )
                        FROM submission_candidate_qualifications scq
                        LEFT JOIN ${config_db}.qualification_types qt ON scq.qualification_type_id = qt.id
                        WHERE scq.submission_candidate_id = c.id
                    ) AS qualifications,
                    JSON_OBJECT(
                        'id', ANY_VALUE(cu.id),
                        'name', ANY_VALUE(cu.name),
                        'symbol', ANY_VALUE(cu.symbol),
                        'code', ANY_VALUE(cu.code)
                    ) AS currency,
                    JSON_OBJECT(
                        'id', ANY_VALUE(u.id),
                        'first_name', ANY_VALUE(u.first_name),
                        'last_name', ANY_VALUE(u.last_name),
                        'user_id', ANY_VALUE(u.user_id)
                    ) AS created_by,
                    JSON_OBJECT(
                        'id', ANY_VALUE(m.id),
                        'first_name', ANY_VALUE(m.first_name),
                        'last_name', ANY_VALUE(m.last_name),
                        'user_id', ANY_VALUE(m.user_id)
                    ) AS updated_by
                FROM submission_candidate c
                LEFT JOIN ${config_db}.candidates cand ON c.candidate_id = cand.id
                LEFT JOIN ${config_db}.user u ON c.created_by = u.user_id
                LEFT JOIN ${config_db}.user m ON c.updated_by = m.user_id
                LEFT JOIN jobs j ON c.job_id = j.id
                LEFT JOIN ${config_db}.currencies cu ON j.currency = cu.code
                LEFT JOIN ${config_db}.picklistitems pi on c.worker_classification = pi.id
                LEFT JOIN ${config_db}.mtp mt ON JSON_CONTAINS(mt.linked_profiles, JSON_QUOTE(c.candidate_id), '$')
                WHERE c.program_id = :program_id
                    AND c.candidate_id = :candidate_id
                    AND c.is_deleted = false
                    ${replacements.job_id ? 'AND c.job_id = :job_id' : ''}
                GROUP BY
                    c.id, c.program_id, c.job_id, c.unique_id, c.candidate_id,
                    cand.first_name, cand.last_name, cand.middle_name,
                    cand.worker_type_id, cand.tenant_id, c.vendor_id,
                    c.resume_url, c.available_start_date, c.available_end_date,
                    c.is_candidate_work_before, c.is_remote_worker,
                    c.candidate_source, c.employment_status,
                    c.worker_classification, c.status, c.description,
                    c.documents, c.financial_detail, c.created_on,
                    c.updated_on, c.is_deleted, c.is_enabled,
                    j.work_location_id, c.addresses, j.job_template_id
            )
            SELECT
                Candidates.*,
                CASE
                    WHEN Candidates.is_remote_worker = false AND Candidates.work_location_id IS NOT NULL THEN (
                        SELECT wl.name
                        FROM ${config_db}.work_locations wl
                        WHERE wl.id = Candidates.work_location_id
                    )
                    ELSE NULL
                END AS work_location_name,
                JSON_UNQUOTE(JSON_EXTRACT(Candidates.addresses, '$.zipcode')) AS address_zip,
                JSON_UNQUOTE(JSON_EXTRACT(Candidates.addresses, '$.city')) AS address_city,
                JSON_UNQUOTE(JSON_EXTRACT(Candidates.addresses, '$.state')) AS address_state,
                JSON_UNQUOTE(JSON_EXTRACT(Candidates.addresses, '$.country')) AS address_country,
                JSON_UNQUOTE(JSON_EXTRACT(Candidates.addresses, '$.address_line_1')) AS address_street,
                ANY_VALUE(cm.id) AS country_id,
                ANY_VALUE(cm.name) AS country_name,
                ANY_VALUE(jt.template_name) AS job_template_name,
                CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM offers o
                        WHERE o.program_id = Candidates.program_id
                        AND o.job_id = Candidates.job_id
                        AND o.candidate_id = Candidates.candidate_id
                    ) THEN true
                    ELSE false
                END AS offer_flag,
                CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM interviews i
                        WHERE i.program_id = Candidates.program_id
                        AND i.job_id = Candidates.job_id
                        AND i.submit_candidate_id = Candidates.candidate_id
                    ) THEN true
                    ELSE false
                END AS interview_flag
            FROM Candidates
            LEFT JOIN ${config_db}.countries cm
                ON JSON_UNQUOTE(JSON_EXTRACT(Candidates.addresses, '$.country')) = cm.id
            LEFT JOIN ${config_db}.job_templates jt
                ON Candidates.job_template_id = jt.id;
        `;

        const m = sequelize.query(query, {
            replacements,
            type: QueryTypes.SELECT,
        });
        return m;
    }

    async getPendingShortlistReviewCountForSuperAdmin(program_id: string): Promise<number> {
        const query = `
            SELECT COUNT(*) AS resume_to_review_count
            FROM submission_candidate
            WHERE program_id = :program_id
            AND status = 'PENDING_SHORTLIST_REVIEW'
            AND is_deleted=false;
        `;

        const [result] = await sequelize.query<{ resume_to_review_count: number }>(query, {
            replacements: { program_id },
            type: QueryTypes.SELECT,
        });

        return result?.resume_to_review_count ?? 0;
    };
    async getPendingShortlistCountReviewForClient(program_id: string, job_ids: string[]): Promise<any> {
        if (!job_ids || job_ids.length === 0) {
            return 0;
        }
        const query = `
        SELECT COUNT(*) AS resume_to_review_count
        FROM submission_candidate
        WHERE program_id = :program_id
        AND is_deleted=false
        AND status IN ('PENDING_SHORTLIST_REVIEW')
        AND job_id IN (:job_ids)
    `;
        const [result] = await sequelize.query<{ resume_to_review_count: number }>(query, {
            replacements: { program_id, job_ids },
            type: QueryTypes.SELECT,
        });

        return result?.resume_to_review_count ?? 0;
    };

    async getPendingShortlistCountForSuperAdmin(program_id: string): Promise<any> {

        const query = `
            SELECT
                CAST(SUM(CASE WHEN UPPER(status) = 'PENDING_SHORTLIST_REVIEW' THEN 1 ELSE 0 END) AS SIGNED) AS resume_to_review_count,
                CAST(SUM(CASE WHEN UPPER(status) = 'PENDING_REHIRE_APPROVAL' THEN 1 ELSE 0 END) AS SIGNED) AS Pending_Rehire_Check_Approval_count,
                CAST(SUM(CASE WHEN UPPER(status) = 'PENDING_REHIRE_REVIEW' THEN 1 ELSE 0 END) AS SIGNED) AS Pending_Rehire_Check_Review_count
            FROM submission_candidate
            WHERE program_id = :program_id
            AND is_deleted=false
        `;

        const [result] = await sequelize.query(query, {
            replacements: { program_id },
            type: QueryTypes.SELECT,
            raw: true, // Ensures the result is a plain object
        });

        console.log("result", result);
        return result; // Return the entire result object with counts as integers
    }

    async getPendingShortlistCountForClient(program_id: string, user_id: string | undefined, job_ids: string[]): Promise<any> {
        if (!job_ids || job_ids.length === 0) {
            return {
                resume_to_review_count: 0,
                pending_rehire_check_approval_count: 0,
                pending_rehire_check_review_count: 0,
            };
        }
        const query = `
            WITH level_recipients AS (
                        SELECT
                        sc.id AS candidate_id,
                        sc.status AS candidate_status,
                        CAST(JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.placement_order')) AS UNSIGNED) AS placement_order,
                        JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.status')) AS level_status,
                        JSON_UNQUOTE(JSON_EXTRACT(recipient.recipient_json, '$.status')) AS recipient_status,
                        recipient.recipient_json AS recipient_json
                        FROM submission_candidate sc
                        JOIN ${config_db}.workflow vm
                        ON sc.id = vm.workflow_trigger_id,
                        JSON_TABLE(vm.levels, '$[*]' COLUMNS (
                        level_json JSON PATH '$'
                        )) AS level,
                        JSON_TABLE(level.level_json, '$.recipient_types[*]' COLUMNS (
                        recipient_json JSON PATH '$'
                        )) AS recipient
                        WHERE sc.program_id = :program_id
                        AND sc.is_deleted = 0
                        ),
                        matching_levels AS (
                        SELECT
                        candidate_id,
                        placement_order
                        FROM level_recipients
                        WHERE level_status = 'pending'
                        AND recipient_status = 'pending'
                        AND JSON_SEARCH(JSON_EXTRACT(recipient_json, '$.meta_data'), 'one', :user_id) IS NOT NULL
                        GROUP BY candidate_id, placement_order
                        ),
                        all_levels AS (
                        SELECT
                        sc.id AS candidate_id,
                        CAST(JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.placement_order')) AS UNSIGNED) AS placement_order,
                        JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.status')) AS level_status,
                        JSON_LENGTH(JSON_EXTRACT(level.level_json, '$.recipient_types')) AS recipient_count
                        FROM submission_candidate sc
                        JOIN ${config_db}.workflow vm
                        ON sc.id = vm.workflow_trigger_id,
                        JSON_TABLE(vm.levels, '$[*]' COLUMNS (
                        level_json JSON PATH '$'
                        )) AS level
                        WHERE sc.program_id = :program_id
                        AND sc.is_deleted = 0
                        ),
                        valid_levels AS (
                        SELECT ml.candidate_id, ml.placement_order
                        FROM matching_levels ml
                        WHERE NOT EXISTS (
                        SELECT 1
                        FROM all_levels prior
                        WHERE prior.candidate_id = ml.candidate_id
                            AND prior.placement_order < ml.placement_order
                            AND (
                             (prior.recipient_count > 0 AND prior.level_status NOT IN ('completed', 'bypassed'))
                            )
                        )
                        )
                        SELECT
                        CAST(SUM(CASE WHEN UPPER(sc.status) = 'PENDING_SHORTLIST_REVIEW' AND sc.id IN (SELECT candidate_id FROM valid_levels) THEN 1 ELSE 0 END) AS UNSIGNED) AS resume_to_review_count,
                        CAST(SUM(CASE WHEN UPPER(sc.status) = 'PENDING_REHIRE_APPROVAL' AND sc.id IN (SELECT candidate_id FROM valid_levels) THEN 1 ELSE 0 END) AS UNSIGNED) AS pending_rehire_check_approval_count,
                        CAST(SUM(CASE WHEN UPPER(sc.status) = 'PENDING_REHIRE_REVIEW' AND sc.id IN (SELECT candidate_id FROM valid_levels) THEN 1 ELSE 0 END) AS UNSIGNED) AS pending_rehire_check_review_count
                        FROM submission_candidate sc
                        WHERE sc.program_id = :program_id
                        AND sc.is_deleted = 0
                        AND sc.job_id IN (:job_ids)

              `;

        const [result] = await sequelize.query(query, {
            replacements: { program_id, user_id, job_ids },
            type: QueryTypes.SELECT,
            raw: true, // Ensures the result is a plain object
        });
        console.log("result", result)
        return result; // Returns all count values as integers
    }



    async getCandidateProgress(
        program_id: string,
        candidate_id: string,
        job_id: string,
        isVendorUser: boolean
    ) {
        const query = `
        SELECT
            CASE
                 WHEN :isVendorUser = TRUE AND UPPER(s.status) IN ('DRAFT', 'REJECTED') THEN FALSE
                 WHEN :isVendorUser = TRUE THEN TRUE
                WHEN UPPER(s.status) NOT IN (
                    'PENDING SHORTLIST', 'PENDING RE-HIRE CHECK REVIEW',
                    'PENDING RE-HIRE CHECK APPROVAL', 'PENDING_SHORTLIST_REVIEW',
                    'PENDING_SHORTLIST_APPROVAL', 'DRAFT', 'REJECTED'
                ) THEN TRUE
                ELSE FALSE
            END AS submittedCandidateCondition,
            CASE WHEN UPPER(i.status) = 'COMPLETED' THEN TRUE ELSE FALSE END AS interviewCandidateCondition,
            CASE WHEN UPPER(o.status) = 'ACCEPTED' THEN TRUE ELSE FALSE END AS offerCondition
        FROM
            (SELECT status FROM submission_candidate WHERE program_id = :program_id AND candidate_id = :candidate_id AND job_id = :job_id LIMIT 1) s
        LEFT JOIN
            (SELECT status FROM interviews WHERE program_id = :program_id AND submit_candidate_id = :candidate_id AND job_id = :job_id) i
        ON true
        LEFT JOIN
            (SELECT status FROM offers WHERE program_id = :program_id AND candidate_id = :candidate_id AND job_id = :job_id LIMIT 1) o
        ON true;
        `;

        const replacements = { program_id, candidate_id, job_id, isVendorUser };

        const result = await sequelize.query<{
            submittedCandidateCondition: number;
            interviewCandidateCondition: number;
            offerCondition: number;
        }>(query, {
            replacements,
            type: QueryTypes.SELECT,
        });

        return result[0] || {};
    }

    async getCandidatesForClientMSP(replacements: any, hierarchyIdsArray: string[]): Promise<any> {
        const query = `
            WITH filtered_jobs AS (
                SELECT j.id
                FROM jobs j
                WHERE j.program_id = :program_id
                AND j.is_deleted = false
                AND (
                    JSON_LENGTH(:hierarchyIdsArray) = 0 OR
                    EXISTS (
                        SELECT 1
                        FROM ${config_db}.hierarchies h
                        WHERE JSON_CONTAINS(j.hierarchy_ids, JSON_QUOTE(CAST(h.id AS CHAR)))
                        AND h.id IN (SELECT id FROM JSON_TABLE(:hierarchyIdsArray, '$[*]' COLUMNS(id VARCHAR(36) PATH '$')) AS jt)
                    )
                )
            ),
            matched_candidates AS (
                SELECT DISTINCT sc.candidate_id
                FROM submission_candidate sc
                INNER JOIN filtered_jobs fj ON sc.job_id = fj.id
            )
            SELECT DISTINCT
                c.id,
                c.first_name,
                c.middle_name,
                c.last_name,
                c.is_active,
                c.name,
                c.email,
                c.program_id,
                c.candidate_id,
                c.worker_type_id,
                c.job_title,
                c.birth_date,
                c.unique_id,
                c.updated_on,
                c.state_national_id,
                c.do_not_rehire_notes,
                c.do_not_rehire_reason,
                c.is_pre_identified,
                c.do_not_rehire,
                c.candidate_source,
                JSON_OBJECT(
                    'id', v.id,
                    'vendor_name', v.max_vendor_name,
                    'display_name', v.max_display_name
                ) AS vendor,
                JSON_OBJECT(
                    'id', countries.id,
                    'name', countries.name
                ) AS country,
                IFNULL(JSON_UNQUOTE(JSON_EXTRACT(c.contacts, '$[0].number')), '') AS phone_number,
                (
                    SELECT COUNT(*)
                    FROM submission_candidate sc
                    WHERE sc.candidate_id = c.id AND sc.program_id = c.program_id
                ) AS submitted_jobs_count,
                COUNT(*) OVER() AS total_count
            FROM ${config_db}.candidates c
            INNER JOIN matched_candidates mc ON c.id = mc.candidate_id
            LEFT JOIN ${config_db}.countries ON c.country_id = countries.id
            LEFT JOIN (
                SELECT
                    MAX(id) AS id,
                    MAX(vendor_name) AS max_vendor_name,
                    MAX(display_name) AS max_display_name
                FROM ${config_db}.program_vendors
                GROUP BY id
            ) v
            ON c.vendor_id = v.id
            WHERE c.program_id = :program_id AND c.is_deleted = false
            ${replacements.candidate_id ? ` AND c.candidate_id LIKE :candidate_id` : ''}
            ${replacements.first_name ? ` AND c.first_name LIKE :first_name` : ''}
            ${replacements.middle_name ? ` AND c.middle_name LIKE :middle_name` : ''}
            ${replacements.last_name ? ` AND c.last_name LIKE :last_name` : ''}
            ${replacements.job_title ? ` AND c.job_title LIKE :job_title` : ''}
            ${replacements.is_active !== undefined ? ` AND c.is_active = :is_active` : ''}
            ${replacements.worker_type_id ? ` AND c.worker_type_id = :worker_type_id` : ''}
            ${replacements.vendor_id ? ` AND c.vendor_id = :vendor_id` : ''}
            ${replacements.search ? ` AND (
                    c.first_name LIKE :search OR
                    c.last_name LIKE :search OR
                    c.email LIKE :search OR
                    CONCAT(c.first_name, ' ', c.last_name, c.email) LIKE :search
                )` : ""}
            ORDER BY c.updated_on DESC
            LIMIT :limit OFFSET :offset;
        `;

        const candidates = await sequelize.query<any>(query, {
            replacements: {
                program_id: replacements.program_id,
                hierarchyIdsArray: JSON.stringify(hierarchyIdsArray),
                candidate_id: replacements.candidate_id ? `%${replacements.candidate_id}%` : undefined,
                first_name: replacements.first_name ? `%${replacements.first_name}%` : undefined,
                middle_name: replacements.middle_name ? `%${replacements.middle_name}%` : undefined,
                last_name: replacements.last_name ? `%${replacements.last_name}%` : undefined,
                job_title: replacements.job_title ? `%${replacements.job_title}%` : undefined,
                is_active: replacements.is_active,
                worker_type_id: replacements.worker_type_id,
                vendor_id: replacements.vendor_id,
                search: replacements.search ? `%${replacements.search}%` : null,
                limit: replacements.limit || 10,
                offset: replacements.offset || 0,
            },
            type: QueryTypes.SELECT,
        });

        const total_count = candidates.length > 0 ? candidates[0].total_count : 0
        return { candidates, total_count };
    }

    async getCandidatesWithFilters(replacements: any, isVendor: boolean): Promise<any> {
        let whereClause = `WHERE c.program_id = :program_id AND c.is_deleted = false`;
        if (isVendor) {
            whereClause += ` AND c.vendor_id IN (
                SELECT id
                FROM ${config_db}.program_vendors
                WHERE tenant_id = :tenantId
                AND program_id = :program_id
            )`;
        }
        if (replacements.vendor_id) {
            whereClause += ` AND c.vendor_id = :vendor_id`;
        }
        if (replacements.candidate_id) whereClause += ` AND c.candidate_id LIKE :candidate_id`;
        if (replacements.first_name) whereClause += ` AND c.first_name LIKE :first_name`;
        if (replacements.middle_name) whereClause += ` AND c.middle_name LIKE :middle_name`;
        if (replacements.last_name) whereClause += ` AND c.last_name LIKE :last_name`;
        if (replacements.is_active !== undefined) whereClause += ` AND c.is_active = :is_active`;
        if (replacements.job_category) {
            whereClause += ` AND EXISTS (
            SELECT id FROM ${config_db}.labour_category lc
            WHERE lc.id = c.job_category AND lc.name LIKE :job_category
            )`;
        }
        if (replacements.job_title) {
            whereClause += ` AND EXISTS (
            SELECT id FROM ${config_db}.job_templates jt
            WHERE jt.id = c.job_title AND jt.template_name LIKE :job_title
            )`;
        }

        if (replacements.vendor_name) {
            whereClause += ` AND c.vendor_id IN (
                SELECT id FROM ${config_db}.program_vendors WHERE vendor_name LIKE :vendor_name
            )`;
            replacements.vendor_name = `%${replacements.vendor_name}%`;
        }

        if (replacements.worker_type_id) {
            if (typeof replacements.worker_type_id === 'string' && replacements.worker_type_id.includes(',')) {
                replacements.worker_type_id = replacements.worker_type_id.split(',').map((id: string) => id.trim());
                whereClause += ' AND c.worker_type_id IN (:worker_type_id)';
            } else {
                whereClause += ' AND c.worker_type_id = :worker_type_id';
            }
        }

        if (replacements.email) {
            replacements.email = replacements.email.replace(/ /g, '+');
            whereClause += ` AND c.email = :email`;
        }

        if (replacements.is_talent_pool === "true" && replacements.job_id) {
            const jobQuery = `SELECT allow_per_identified_s FROM jobs WHERE id = :job_id LIMIT 1`;
            const [job] = await sequelize.query<{ allow_per_identified_s: any }>(jobQuery, {
                replacements: { job_id: replacements.job_id },
                type: QueryTypes.SELECT,
            });

            if (job.allow_per_identified_s) {
                const candidateQuery = `SELECT candidate_id FROM job_candidate WHERE job_id = :job_id`;
                const jobCandidates = await sequelize.query<{ candidate_id: string }>(candidateQuery, {
                    replacements: { job_id: replacements.job_id },
                    type: QueryTypes.SELECT,
                });

                const candidateIds = jobCandidates.map(c => c.candidate_id);
                if (candidateIds.length > 0) {
                    whereClause += ` AND c.id IN (:candidateIds)`;
                    replacements.candidateIds = candidateIds;
                } else {
                    whereClause += ` AND 1=0`;
                }
            } else {
                whereClause += ` AND c.id NOT IN (
                    SELECT candidate_id FROM submission_candidate
                    WHERE job_id = :job_id AND candidate_id IS NOT NULL
                )`;
            }
        }
        if (replacements.search) {
            whereClause += ` AND (
                c.first_name LIKE :search OR
                c.last_name LIKE :search OR
                c.email LIKE :search OR
                CONCAT(c.first_name, ' ', c.last_name, c.email) LIKE :search
            )`
        }

        let orderByClause = '';
        if (replacements.is_talent_pool === "true" && replacements.labour_category_id && replacements.job_template_id) {
            orderByClause = `
            ORDER BY
                CASE
                    WHEN c.job_category = :labour_category_id AND c.job_title = :job_template_id THEN 1
                    WHEN c.job_category = :labour_category_id THEN 2
                    ELSE 3
                END,
                c.updated_on DESC
        `;
        } else {
            orderByClause = `ORDER BY c.updated_on DESC`;
        }

        const countQuery = `SELECT COUNT(DISTINCT c.id) AS total_count FROM ${config_db}.candidates c ${whereClause}`;

        const [countResult] = await sequelize.query<{ total_count: number }>(countQuery, {
            replacements,
            type: QueryTypes.SELECT,
        });

        const query = `
        SELECT DISTINCT
        c.id,
        c.first_name,
        c.middle_name,
        c.last_name,
        c.is_active,
        c.name,
        c.email,
        c.program_id,
        c.candidate_id,
        c.worker_type_id,
        c.job_title,
        c.birth_date,
        c.unique_id,
        c.contacts,
        c.updated_on,
        c.state_national_id,
        c.do_not_rehire_notes,
        c.do_not_rehire_reason,
        c.is_pre_identified,
        c.do_not_rehire,
        c.candidate_source,
        JSON_OBJECT(
            'id', v.id,
            'vendor_name', v.max_vendor_name,
            'display_name', v.max_display_name
        ) AS vendor,
        JSON_OBJECT(
            'id', countries.id,
            'name', countries.name
        ) AS country,
        JSON_OBJECT(
            'id', lc.id,
            'name', lc.name
        ) AS job_category,
        JSON_OBJECT(
            'id', jt.id,
            'name', jt.template_name
        ) AS job_title,
        IFNULL(JSON_UNQUOTE(JSON_EXTRACT(c.contacts, '$[0].number')), '') AS phone_number,
        (
            SELECT COUNT(*)
            FROM submission_candidate sc
            WHERE sc.candidate_id = c.id AND sc.program_id = c.program_id
        ) AS submitted_jobs_count
        FROM ${config_db}.candidates c
        LEFT JOIN ${config_db}.countries ON c.country_id = countries.id
        LEFT JOIN ${config_db}.labour_category lc ON c.job_category = lc.id
        LEFT JOIN ${config_db}.job_templates jt ON c.job_title = jt.id
        LEFT JOIN (
        SELECT
            MAX(id) AS id,
            MAX(vendor_name) AS max_vendor_name,
            MAX(display_name) AS max_display_name
        FROM ${config_db}.program_vendors
        GROUP BY id
        ) v
        ON c.vendor_id = v.id
        ${whereClause}
        ${orderByClause}
        LIMIT :limit OFFSET :offset;
        `;

        const candidates = await sequelize.query<{ total_count: any }>(query, {
            replacements,
            type: QueryTypes.SELECT,
        });

        return { candidates, total_count: countResult.total_count, };
    }

    async getIsHideCandidateImageToggle(program_id: string, hierarchy_id: string): Promise<any> {
        console.log("program_id", program_id);
        console.log("hierarchy_id", hierarchy_id)
        const query = `
           select is_hide_candidate_img
            from ${config_db}.hierarchies
            where program_id=:program_id
            AND id=:hierarchy_id
        `;

        const [result] = await sequelize.query(query, {
            replacements: { program_id, hierarchy_id },
            type: QueryTypes.SELECT,
            raw: true,
        });

        console.log("result", result);
        return result;
    }

    async getSubmissionCandidateDetails(programId: string, jobId: any): Promise<any[]> {
        console.log("program_id", programId);
        console.log("job_id", jobId)
        const query = `
          Select
          sc.candidate_id,
          j.description as job_description,
          jt.template_name as job_title
          from submission_candidate sc
          LEFT JOIN jobs j ON sc.job_id = j.id
          LEFT JOIN ${config_db}.job_templates jt ON j.job_template_id = jt.id
          Where sc.program_id = :program_id
          AND sc.job_id = :job_id
        `;

        const result = await sequelize.query(query, {
            replacements: { program_id: programId, job_id: jobId },
            type: QueryTypes.SELECT,
            raw: true,
        });

        console.log("result", result);
        return result;
    }

    async getSubmitedCandidatesWithFilters(replacements: any): Promise<any> {
        let whereClause = `WHERE c.program_id = :program_id AND c.is_deleted = false`;
        let submissionFilterClause = '';

        if (replacements.job_template_ids && replacements.job_template_ids.length > 0) {
            submissionFilterClause = `
                AND sc.job_id IN (
                    SELECT j.id
                    FROM jobs j
                    WHERE j.job_template_id IN (:job_template_ids)
                )
            `;
        }

        const query = `
        SELECT DISTINCT
            c.id,
            c.first_name,
            c.middle_name,
            c.last_name,
            c.is_active,
            c.name,
            c.email,
            c.program_id,
            c.candidate_id,
            c.worker_type_id,
            c.job_title,
            c.birth_date,
            c.contacts,
            c.updated_on,
            c.state_national_id,
            c.do_not_rehire_notes,
            c.do_not_rehire_reason,
            c.do_not_rehire
        FROM ${config_db}.candidates c
        LEFT JOIN submission_candidate sc ON sc.candidate_id = c.id
        ${whereClause}
        ${submissionFilterClause}
        ORDER BY c.updated_on DESC
        `;

        const candidates = await sequelize.query<{ total_count: any }>(query, {
            replacements,
            type: QueryTypes.SELECT,
        });

        return candidates;
    }

}
export default SubmissionCandidateRepository;