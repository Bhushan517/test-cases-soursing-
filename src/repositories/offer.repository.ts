import { QueryTypes } from "sequelize";
import { sequelize } from "../config/instance";
import { databaseConfig } from '../config/db';
const config_db = databaseConfig.config.database_config;
class OfferRepository {

  async getOfferBaseData(id: string) {
    const query = `
    SELECT
      offers.*,
      JSON_OBJECT('id', pi.id, 'value', pi.value, 'label', pi.label) AS worker_classification,
      JSON_OBJECT(
        'id', c.id,
        'candidate_first_name', c.first_name,
        'candidate_middle_name', c.middle_name,
        'candidate_last_name', c.last_name
      ) AS candidate_data,
      JSON_OBJECT('id', wl.id, 'name', wl.name) AS work_location,
      JSON_OBJECT('id', ttc.id, 'title', ttc.title) AS timesheet_type,
      JSON_OBJECT(
        'id', jm.id,
        'first_name', jm.first_name,
        'middle_name', jm.middle_name,
        'last_name', jm.last_name,
        'user_id', jm.user_id
      ) AS job_manager,
      JSON_OBJECT(
        'id', tenant.id,
        'name', tenant.name,
        'display_name', tenant.display_name
      ) AS managed_by
    FROM offers
    LEFT JOIN ${config_db}.picklistitems pi ON offers.worker_classification = pi.id
    LEFT JOIN ${config_db}.candidates c ON offers.candidate_id = c.id
    LEFT JOIN ${config_db}.work_locations wl ON offers.work_location = wl.id
    LEFT JOIN ${config_db}.timesheet_type_config ttc
      ON offers.timesheet_type = ttc.slug AND offers.program_id = ttc.program_id
    LEFT JOIN ${config_db}.user jm ON offers.job_manager = jm.user_id
    LEFT JOIN ${config_db}.tenant ON offers.managed_by = tenant.id
    WHERE offers.id = :id
    LIMIT 1;
  `;
    const [data] = await sequelize.query(query, {
      replacements: { id },
      type: QueryTypes.SELECT,
    });
    return data;
  }

  async getHierarchies(offerId: string) {
    const query = `
    SELECT h.id, h.name
    FROM offers_hierarchy oh
    JOIN ${config_db}.hierarchies h ON oh.hierarchy = h.id
    WHERE oh.offer_id = :offerId;
  `;
    return await sequelize.query(query, {
      replacements: { offerId },
      type: QueryTypes.SELECT,
    });
  }

  async getManagers(offerId: string, program_id: string) {
    const [expenseManagers, timesheetManagers] = await Promise.all([
      sequelize.query(
        `SELECT u.id, u.first_name, u.last_name, u.user_id
        FROM offers o
        JOIN ${config_db}.user u
        ON JSON_CONTAINS(o.expense_manager, JSON_QUOTE(CAST(u.user_id AS CHAR)))
        WHERE o.id = :offerId
        AND o.program_id = :program_id`,
        { replacements: { offerId, program_id }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT u.id, u.first_name, u.last_name, u.user_id
        FROM offers o
        JOIN ${config_db}.user u
        ON JSON_CONTAINS(o.timesheet_manager, JSON_QUOTE(CAST(u.user_id AS CHAR)))
        AND u.program_id = :program_id
        WHERE o.id = :offerId
        AND o.program_id = :program_id`,
        { replacements: { offerId, program_id }, type: QueryTypes.SELECT }
      ),
    ]);

    return { expenseManagers, timesheetManagers };
  }

  async getCustomFields(offerId: string) {
    const query = `
    SELECT
      ocf.id,
      cf.name,
      cf.id AS custom_field_id,
      cf.label,
      ocf.value,
      CASE
      WHEN user.user_id IS NOT NULL
      THEN CONCAT(user.first_name, ' ', user.last_name)
      ELSE NULL
      END AS manager_name,
        cf.field_type
    FROM offer_custom_fields ocf
    LEFT JOIN ${config_db}.custom_fields cf ON ocf.custom_field_id = cf.id
    LEFT JOIN ${config_db}.user ON TRIM(BOTH '"' FROM ocf.value) = user.user_id AND user.program_id = cf.program_id
    WHERE ocf.offer_id = :offerId;
  `;
    return await sequelize.query(query, {
      replacements: { offerId },
      type: QueryTypes.SELECT,
    });
  }

  async getFoundationalData(offerId: string) {
    const query = `
    SELECT
      mdt.id AS foundation_data_type_id,
      mdt.name AS foundation_data_type_name,
      (
        SELECT JSON_ARRAYAGG(
          JSON_OBJECT('id', fd.id, 'name', fd.name)
        )
        FROM ${config_db}.master_data fd
        WHERE JSON_CONTAINS(omd.foundation_data_ids, JSON_QUOTE(fd.id))
      ) AS foundation_Data
    FROM offer_master_data omd
    LEFT JOIN ${config_db}.master_data_type mdt ON omd.foundation_data_type_id = mdt.id
    WHERE omd.offer_id = :offerId;
  `;
    return await sequelize.query(query, {
      replacements: { offerId },
      type: QueryTypes.SELECT,
    });
  }

  async getBaseCounterOffer(program_id: string, parent_offer: string) {
    const query = `
    SELECT
      offers.id AS offer_id,
      offers.*,
      JSON_OBJECT('id', c.id, 'candidate_first_name', c.first_name, 'candidate_last_name', c.last_name) AS candidate,
      JSON_OBJECT('id', u.user_id, 'first_name', u.first_name, 'last_name', u.last_name) AS created_by,
      JSON_OBJECT('id', wl.id, 'name', wl.name) AS work_location,
      JSON_OBJECT('id', ttc.id, 'title', ttc.title, 'display_title', ttc.display_title) AS timesheet_type,
      JSON_OBJECT('id', jm.id, 'first_name', jm.first_name, 'last_name', jm.last_name, 'user_id', jm.user_id) AS job_manager,
      JSON_OBJECT('id', cu.id, 'name', cu.name,'symbol', cu.symbol, 'code', cu.code) AS currency,
      JSON_OBJECT('id', pi.id,'value', pi.value,'label', pi.label) AS worker_classification,
      JSON_OBJECT('id', t.id, 'name', t.name, 'display_name', t.display_name) AS managed_by
    FROM offers
    LEFT JOIN ${config_db}.candidates c ON offers.candidate_id = c.id
    LEFT JOIN ${config_db}.picklistitems pi on offers.worker_classification = pi.id
    LEFT JOIN jobs AS job ON offers.job_id = job.id
    LEFT JOIN ${config_db}.currencies cu ON job.currency = cu.code
    LEFT JOIN ${config_db}.work_locations wl ON offers.work_location = wl.id
    LEFT JOIN ${config_db}.timesheet_type_config ttc ON offers.timesheet_type = ttc.slug AND offers.program_id = ttc.program_id
    LEFT JOIN ${config_db}.user jm ON offers.job_manager = jm.user_id
    LEFT JOIN ${config_db}.user u ON offers.created_by = u.user_id AND (u.user_type = 'super_user' OR u.program_id = offers.program_id)
    LEFT JOIN ${config_db}.tenant t ON offers.managed_by = t.id
    WHERE offers.parent_offer_id = :parent_offer
      AND offers.program_id = :program_id
      AND (offers.status IS NULL OR offers.status NOT IN ('CLOSED'))
    LIMIT 1
  `;

    return await sequelize.query(query, {
      replacements: { program_id, parent_offer },
      type: QueryTypes.SELECT,
    });
  }

  async getOffersForCandidateQuery(candidate_id: string, job_id: string, program_id: string) {
    const query = `
    SELECT
    offers.*,
    JSON_OBJECT(
      'id', pi.id,
      'value', pi.value,
      'label', pi.label
    ) AS worker_classification,
    offers.id AS offer_id,
    offers.candidate_id,
    offers.job_id,
    offers.financial_details,
    JSON_OBJECT(
      'id', candidates.id,
      'candidate_first_name', MAX(candidates.first_name),
      'candidate_last_name', MAX(candidates.last_name),
      'do_not_rehire', MAX(candidates.do_not_rehire),
      'do_not_rehire_reason', MAX(candidates.do_not_rehire_reason),
      'do_not_rehire_notes', MAX(candidates.do_not_rehire_notes)
    ) AS candidate,
    JSON_OBJECT(
      'id', work_locations.id,
      'name', MAX(work_locations.name)
    ) AS work_location,
    JSON_OBJECT(
      'id', MAX(timesheet_type_config.id),
      'title', MAX(timesheet_type_config.title),
      'display_title', MAX(timesheet_type_config.display_title)
    ) AS timesheet_type,
    JSON_ARRAYAGG(
      JSON_OBJECT(
        'id', hierarchies.id,
        'name', hierarchies.name
      )
    ) AS hierarchies,
    JSON_OBJECT(
        'id', cu.id,
        'name', cu.name,
        'symbol', cu.symbol,
        'code', cu.code
    ) AS currency,
    JSON_OBJECT(
      'id', job_manager.id,
      'first_name', MAX(job_manager.first_name),
      'last_name', MAX(job_manager.last_name)
    ) AS job_manager,
    JSON_OBJECT(
      'id', created_by_user.user_id,
      'first_name', MAX(created_by_user.first_name),
      'last_name', MAX(created_by_user.last_name)
    ) AS created_by,
    JSON_OBJECT(
      'id', t.id,
      'name', MAX(t.name),
      'display_name', MAX(t.display_name)
    ) AS managed_by,
    expense_managers.managers AS expense_managers,
    timesheet_managers.managers AS timesheet_managers,
    (SELECT JSON_ARRAYAGG(fdata) 
     FROM (
      SELECT JSON_OBJECT(
        'foundation_data_type_id', master_data_type.id,
        'foundation_data_type_name', master_data_type.name,
        'seq_number',master_data_type.seq_number,
        'foundation_Data',
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', fd.id,
              'name', fd.name
            )
          )
          FROM ${config_db}.master_data fd
          WHERE JSON_CONTAINS(offer_master_data.foundation_data_ids, JSON_QUOTE(fd.id))
        )
       ) AS fdata
        FROM offer_master_data
       LEFT JOIN ${config_db}.master_data_type ON offer_master_data.foundation_data_type_id = master_data_type.id
       WHERE offer_master_data.offer_id = offers.id
       ORDER BY master_data_type.seq_number ASC
      ) AS ordered_data
    ) AS foundational_data,
    custom_fields.fields AS custom_fields
FROM offers
LEFT JOIN ${config_db}.picklistitems pi on offers.worker_classification = pi.id
LEFT JOIN ${config_db}.tenant t on offers.managed_by = t.id
LEFT JOIN ${config_db}.candidates ON offers.candidate_id = candidates.id
LEFT JOIN ${config_db}.work_locations ON offers.work_location = work_locations.id
LEFT JOIN ${config_db}.timesheet_type_config ON offers.timesheet_type = timesheet_type_config.slug
  AND offers.program_id = timesheet_type_config.program_id
LEFT JOIN (
    SELECT
      oh.offer_id,
      h.id,
      h.name
    FROM offers_hierarchy AS oh
    JOIN ${config_db}.hierarchies AS h ON oh.hierarchy = h.id
) AS hierarchies ON hierarchies.offer_id = offers.id
LEFT JOIN ${config_db}.user AS job_manager ON offers.job_manager = job_manager.user_id AND offers.program_id = job_manager.program_id
LEFT JOIN ${config_db}.user AS created_by_user ON offers.created_by = created_by_user.user_id AND offers.program_id = created_by_user.program_id
    AND (
    created_by_user.user_type = 'super_user'
    OR offers.program_id = created_by_user.program_id
  )
LEFT JOIN (
    SELECT
      jo.id,
      JSON_ARRAYAGG(
        JSON_OBJECT('id', em.id, 'first_name', em.first_name, 'last_name', em.last_name)
      ) AS managers
    FROM offers AS jo
    LEFT JOIN ${config_db}.user AS em
      ON JSON_VALID(jo.expense_manager)
      AND JSON_CONTAINS(jo.expense_manager, JSON_QUOTE(CAST(em.user_id AS CHAR)))
      AND em.program_id = jo.program_id
    GROUP BY jo.id
) AS expense_managers ON expense_managers.id = offers.id
LEFT JOIN (
    SELECT
      jo.id,
      JSON_ARRAYAGG(
        JSON_OBJECT('id', tm.id, 'first_name', tm.first_name, 'last_name', tm.last_name)
      ) AS managers
    FROM offers AS jo
    LEFT JOIN ${config_db}.user AS tm
      ON JSON_VALID(jo.timesheet_manager)
      AND JSON_CONTAINS(jo.timesheet_manager, JSON_QUOTE(CAST(tm.user_id AS CHAR)))
      AND tm.program_id = jo.program_id
    GROUP BY jo.id
) AS timesheet_managers ON timesheet_managers.id = offers.id
LEFT JOIN (
    SELECT
      ocf.offer_id,
      JSON_ARRAYAGG(
        JSON_OBJECT(
          'id', ocf.id,
          'name', cf.name,
          'custom_field_id', cf.id,
          'label', cf.label,
          'value', ocf.value,
          'field_type', cf.field_type,
          'seq_number', cf.seq_number,
          'manager_name',
          CASE
            WHEN u.user_id IS NOT NULL THEN CONCAT(u.first_name, ' ', u.last_name)
            ELSE NULL
          END
        )
      ) AS fields
    FROM offer_custom_fields AS ocf
    LEFT JOIN ${config_db}.custom_fields AS cf ON ocf.custom_field_id = cf.id
      LEFT JOIN ${config_db}.user AS u
    ON REPLACE(REPLACE(ocf.value, '"', ''), ' ', '') = TRIM(u.user_id)
    AND u.program_id = cf.program_id
    AND cf.is_deleted = false
    GROUP BY ocf.offer_id
) AS custom_fields ON custom_fields.offer_id = offers.id
LEFT JOIN jobs AS job ON offers.job_id = job.id
LEFT JOIN ${config_db}.currencies cu ON job.currency = cu.code
WHERE offers.candidate_id = ?
  AND offers.job_id = ?
  AND offers.program_id = ?
  AND offers.parent_offer_id IS NULL
GROUP BY
    offers.id,
    work_locations.id,
    job_manager.id,
    expense_managers.managers,
    timesheet_managers.managers,
    custom_fields.fields,
    cu.id,
    hierarchies.id,
    candidates.id,
    cu.name,
    cu.symbol,
    cu.code
LIMIT 1;
`;

    const offers = await sequelize.query(query, {
      replacements: [candidate_id, job_id, program_id],
      type: QueryTypes.SELECT,
    });

    return offers;
  }

  async getStatusCountOffers(vendor_id: string|undefined, program_id: string): Promise<any> {
    const query = `
      SELECT
      CAST(SUM(CASE WHEN status = 'Pending Approval' AND parent_offer_id IS NULL THEN 1 ELSE 0 END) AS SIGNED) AS pending_approval_count,
      CAST(SUM(CASE WHEN status = 'Pending Review' AND parent_offer_id IS NULL THEN 1 ELSE 0 END) AS SIGNED) AS pending_review_count,
      CAST(SUM(CASE WHEN status = 'Pending Acceptance' AND parent_offer_id IS NULL THEN 1 ELSE 0 END) AS SIGNED) AS released_offers_count,
      CAST(SUM(CASE WHEN status = 'Pending Approval' AND parent_offer_id IS NOT NULL THEN 1 ELSE 0 END) AS SIGNED) AS counter_offer_pending_approval_count,
      CAST(SUM(CASE WHEN status = 'Pending Review' AND parent_offer_id IS NOT NULL THEN 1 ELSE 0 END) AS SIGNED) AS counter_offer_pending_review_count
    FROM offers
      WHERE vendor_id = :vendor_id
      AND program_id = :program_id
      AND is_deleted = false
  `;

    const [result] = await sequelize.query(query, {
      replacements: { vendor_id, program_id },
      type: QueryTypes.SELECT,
    });
    return result;
  }

  async getStatusCountForSuperAdmin(program_id: string): Promise<any> {
    const query = `
      SELECT
          CAST(SUM(CASE WHEN status = 'Pending Approval' AND parent_offer_id IS NULL THEN 1 ELSE 0 END) AS SIGNED) AS pending_approval_count,
          CAST(SUM(CASE WHEN status = 'Pending Review' AND parent_offer_id IS NULL THEN 1 ELSE 0 END) AS SIGNED) AS pending_review_count,
          CAST(SUM(CASE WHEN status = 'Rejected' AND parent_offer_id IS NULL THEN 1 ELSE 0 END) AS SIGNED) AS rejected_offers_count,
          CAST(SUM(CASE WHEN status = 'Pending Approval' AND parent_offer_id IS NOT NULL THEN 1 ELSE 0 END) AS SIGNED) AS counter_offer_pending_approval_count,
          CAST(SUM(CASE WHEN status = 'Pending Review' AND parent_offer_id IS NOT NULL THEN 1 ELSE 0 END) AS SIGNED) AS counter_offer_pending_review_count
      FROM offers
      WHERE  program_id = :program_id
      AND is_deleted = false
        `;
    const [result] = await sequelize.query(query, {
      replacements: { program_id },
      type: QueryTypes.SELECT,
    });
    return result;
  }

  async getStatusCountOfferForClient(program_id: string, user_id: string, hierarchyIdsArray: string[]): Promise<any> {
    const query = `
              WITH level_recipients AS (
                                SELECT
                                  o.id AS offer_id,
                                  o.status AS offer_status,
                                  CAST(JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.placement_order')) AS UNSIGNED) AS placement_order,
                                  JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.status')) AS level_status,
                                  JSON_UNQUOTE(JSON_EXTRACT(recipient.recipient_json, '$.status')) AS recipient_status,
                                  recipient.recipient_json AS recipient_json
                                FROM offers o
                                JOIN ${config_db}.workflow vm
                                  ON o.id = vm.workflow_trigger_id
                                CROSS JOIN JSON_TABLE(vm.levels, '$[*]' COLUMNS (
                                  level_json JSON PATH '$'
                                )) AS level
                                CROSS JOIN JSON_TABLE(level.level_json, '$.recipient_types[*]' COLUMNS (
                                  recipient_json JSON PATH '$'
                                )) AS recipient
                                WHERE o.program_id = :program_id
                                  AND o.is_deleted = 0
                                ),
                                matching_levels AS (
                                SELECT
                                  offer_id,
                                  placement_order
                                FROM level_recipients
                                WHERE level_status = 'pending'
                                  AND recipient_status = 'pending'
                                  AND (
                                     (
                                  JSON_UNQUOTE(JSON_EXTRACT(recipient_json, '$.replaced_by')) IS NOT NULL 
                                  AND JSON_UNQUOTE(JSON_EXTRACT(recipient_json, '$.replaced_by')) <> '' 
                                  AND JSON_UNQUOTE(JSON_EXTRACT(recipient_json, '$.replaced_by')) = :user_id
                              )
                            OR (
                              (JSON_UNQUOTE(JSON_EXTRACT(recipient_json, '$.replaced_by')) IS NULL 
                              OR JSON_UNQUOTE(JSON_EXTRACT(recipient_json, '$.replaced_by')) = '')
                              AND JSON_SEARCH(JSON_EXTRACT(recipient_json, '$.meta_data'), 'one', :user_id) IS NOT NULL
                            )
                                )
                                GROUP BY offer_id, placement_order
                                ),
                                all_levels AS (
                                SELECT
                                  o.id AS offer_id,
                                  CAST(JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.placement_order')) AS UNSIGNED) AS placement_order,
                                  JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.status')) AS level_status,
                                  JSON_LENGTH(JSON_EXTRACT(level.level_json, '$.recipient_types')) AS recipient_count
                                FROM offers o
                                JOIN ${config_db}.workflow vm
                                  ON o.id = vm.workflow_trigger_id
                                CROSS JOIN JSON_TABLE(vm.levels, '$[*]' COLUMNS (
                                  level_json JSON PATH '$'
                                )) AS level
                                WHERE o.program_id = :program_id
                                  AND o.is_deleted = 0
                                ),
                                valid_levels AS (
                                SELECT ml.offer_id, ml.placement_order
                                FROM matching_levels ml
                                WHERE NOT EXISTS (
                                  SELECT 1
                                  FROM all_levels prior
                                  WHERE prior.offer_id = ml.offer_id
                                    AND prior.placement_order < ml.placement_order
                                    AND (
                                     (prior.recipient_count > 0 AND prior.level_status NOT IN ('completed', 'bypassed'))
                                    )
                                )
                                )
                                SELECT
                                COUNT(DISTINCT CASE WHEN o.status = 'Pending Approval' AND o.id IN (SELECT offer_id FROM valid_levels) AND o.parent_offer_id IS NULL THEN o.id END) AS pending_approval_count,
                                COUNT(DISTINCT CASE WHEN o.status = 'Pending Review' AND o.id IN (SELECT offer_id FROM valid_levels) AND o.parent_offer_id IS NULL THEN o.id END) AS pending_review_count,
                                COUNT(DISTINCT CASE WHEN o.status = 'Rejected' AND o.parent_offer_id IS NULL THEN o.id END) AS rejected_offers_count,
                                COUNT(DISTINCT CASE WHEN o.status = 'Pending Approval' AND o.id IN (SELECT offer_id FROM valid_levels) AND o.parent_offer_id IS NOT NULL THEN o.id END) AS counter_offer_pending_approval_count,
                                COUNT(DISTINCT CASE WHEN o.status = 'Pending Review' AND o.id IN (SELECT offer_id FROM valid_levels)  AND o.parent_offer_id IS NOT NULL THEN o.id END) AS counter_offer_pending_review_count
                                FROM offers o
                                WHERE o.program_id = :program_id
                                AND o.is_deleted = 0
                                AND EXISTS (
                                  SELECT 1
                                  FROM offers_hierarchy oh
                                  WHERE oh.offer_id = o.id
                                  AND oh.hierarchy IN (:hierarchyIdsArray)
                                );
             `;
    const result = await sequelize.query(query, {
      replacements: { program_id, user_id, hierarchyIdsArray },
      type: QueryTypes.SELECT,
    });
    console.log("result is the ", result);
    
    return result.length > 0 ? result[0] : { pending_approval_count: 0, pending_review_count: 0, rejected_offers_count: 0 };
  }

  async getSourcingStatistics(program_id: string, hierarchyIdsArray: string[]) {
    const queryOffers = `
    SELECT
      'offers' AS source,
      SUM(CASE
              WHEN status IN (
                'Pending Review',
                'Pending Approval',
                'Rejected',
                'Withdrawn',
                'Accepted',
                'Pending Acceptance'
              )
            THEN 1 ELSE 0
        END) AS total,
      SUM(CASE WHEN status = 'Pending Review' THEN 1 ELSE 0 END) AS pending_review_count,
      SUM(CASE WHEN status = 'Pending Approval' THEN 1 ELSE 0 END) AS pending_approval_count,
      SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) AS rejected_count,
      SUM(CASE WHEN status = 'Withdrawn' THEN 1 ELSE 0 END) AS withdraw_count,
      SUM(CASE WHEN status = 'Accepted' THEN 1 ELSE 0 END) AS accepted_count,
      SUM(CASE WHEN status = 'Pending Acceptance' THEN 1 ELSE 0 END) AS released_count
    FROM offers o
    WHERE o.program_id = :program_id
    AND o.is_deleted = false
    AND o.parent_offer_id IS NULL
    AND EXISTS (
      SELECT 1 FROM offers_hierarchy oh
      WHERE oh.offer_id = o.id
      AND oh.hierarchy IN (:hierarchyIdsArray)
    );
  `;

    const [offerStatistics] = await sequelize.query(queryOffers, {
      replacements: { program_id, hierarchyIdsArray },
      type: QueryTypes.SELECT,
    });

    return offerStatistics;
  }

  async getSoursingStatisticsCountForVendor(vendor_id: string | undefined, program_id: string) {
    const queryOffers = `
      SELECT
        'offers' AS source,
        SUM(CASE
              WHEN status IN ('Accepted', 'Pending Acceptance', 'Rejected')
              THEN 1 ELSE 0
        END) AS total,
        SUM(CASE WHEN status = 'Accepted' THEN 1 ELSE 0 END) AS accepted_count,
        SUM(CASE WHEN status = 'Pending Acceptance' THEN 1 ELSE 0 END) AS released_count,
        SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) AS rejected_count
      FROM offers
      WHERE vendor_id = ? AND program_id = ? AND is_deleted = false AND parent_offer_id IS NULL;
    `;

    const [offerStatistics] = await sequelize.query(queryOffers, {
      replacements: [vendor_id, program_id],
      type: QueryTypes.SELECT,
    });
    return offerStatistics;
  }

  async getSoursingStatisticsCountForSuperAdmin(program_id: string) {
    const queryOffers = `
      SELECT
        'offers' AS source,
        SUM(CASE
              WHEN status IN (
                'Pending Review',
                'Pending Approval',
                'Rejected',
                'Withdrawn',
                'Accepted',
                'Pending Acceptance'
              )
            THEN 1 ELSE 0
        END) AS total,
        SUM(CASE WHEN status = 'Pending Review' THEN 1 ELSE 0 END) AS pending_review_count,
        SUM(CASE WHEN status = 'Pending Approval' THEN 1 ELSE 0 END) AS pending_approval_count,
        SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) AS rejected_count,
        SUM(CASE WHEN status = 'Withdrawn' THEN 1 ELSE 0 END) AS withdraw_count,
        SUM(CASE WHEN status = 'Accepted' THEN 1 ELSE 0 END) AS accepted_count,
        SUM(CASE WHEN status = 'Pending Acceptance' THEN 1 ELSE 0 END) AS released_count
      FROM offers
      WHERE program_id = ? AND is_deleted = false and parent_offer_id IS NULL;
    `;

    const [offerStatistics] = await sequelize.query(queryOffers, {
      replacements: [program_id],
      type: QueryTypes.SELECT,
    });
    console.log("offerStatistics", offerStatistics)
    return offerStatistics;
  }

  async findHierarchyIdsByManagedBy(program_id: string, tenantId: string): Promise<string[]> {
    const query = `
    SELECT DISTINCT h.id AS hierarchy
    FROM ${config_db}.hierarchies h
    WHERE h.program_id = :program_id
    AND h.managed_by = :tenantId
  `;

    const result = await sequelize.query<{ hierarchy: string }>(query, {
      replacements: { program_id, tenantId },
      type: QueryTypes.SELECT
    });

    return (result as { hierarchy: string }[]).map(item => item.hierarchy);
  }

  async getAllOffersQuery(filterString: string, hierarchyFilter?: boolean, isMSPUser?: boolean): Promise<string> {
    const adjustedFilterString = filterString
      .split(' AND ')
      .map(filter => {
        if (filter.includes('job_id')) {
          if (!filter.includes('jo.job_id') && !filter.includes('oj.job_id')) {
            return filter.replace(/job_id/g, 'jo.job_id');
          }
        }
        return filter;
      })
      .filter(filter => filter !== null)
      .join(' AND ');

    const query = `
    SELECT DISTINCT
        jo.id,
        jo.status,
        jo.updated_on,
        jo.offer_code,
        jo.candidate_id,
        jo.job_id,
        jo.unique_id,
        jo.submission_id,
        jo.vendor_id,
        jo.is_rate_above_max_limit,
        jo.created_on,
        jc.first_name,
        jc.last_name,
        jc.middle_name,
        jc.do_not_rehire,
        jc.do_not_rehire_reason,
        jc.do_not_rehire_notes,
        jc.candidate_id AS candidate_unique_id,
        os.unique_id AS submission_unique_id,
        oj.job_id AS job_unique_id,
        oj.status AS job_status,
        jt.template_name AS job_name,
        jt.is_submission_exceed_max_bill_rate,
        pv.tenant_id,
        COUNT(*) OVER() AS total_count
    FROM offers AS jo
    ${isMSPUser ? 'INNER JOIN offers_hierarchy AS oh ON oh.offer_id = jo.id' : 'LEFT JOIN offers_hierarchy AS oh ON oh.offer_id = jo.id'}
    LEFT JOIN ${config_db}.candidates AS jc ON jc.id = jo.candidate_id
    LEFT JOIN submission_candidate AS os ON os.id = jo.submission_id
    LEFT JOIN jobs AS oj ON oj.id = jo.job_id
    LEFT JOIN ${config_db}.job_templates AS jt ON jt.id = oj.job_template_id
    LEFT JOIN ${config_db}.program_vendors AS pv ON pv.id = jo.vendor_id AND pv.program_id = :program_id
    WHERE jo.is_deleted = false
      AND jo.program_id = :program_id
      AND (jo.status IS NULL OR jo.status NOT IN ('CLOSED'))
      AND NOT (jo.parent_offer_id IS NOT NULL AND UPPER(jo.status) = 'WITHDRAWN')
      AND (
        :user_id IS NULL
        OR :isValidStatus = FALSE
        OR (
            EXISTS (
                SELECT 1
                FROM ${config_db}.workflow vm
                CROSS JOIN JSON_TABLE(vm.levels, '$[*]' COLUMNS (
                    level_json JSON PATH '$'
                )) AS level
                CROSS JOIN JSON_TABLE(level.level_json, '$.recipient_types[*]' COLUMNS (
                    recipient_json JSON PATH '$'
                )) AS recipient
                WHERE vm.workflow_trigger_id = jo.id
                AND JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.status')) = 'pending'
                AND JSON_UNQUOTE(JSON_EXTRACT(recipient.recipient_json, '$.status')) = 'pending'
                AND JSON_SEARCH(JSON_EXTRACT(recipient.recipient_json, '$.meta_data'), 'one', :user_id) IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1
                    FROM JSON_TABLE(vm.levels, '$[*]' COLUMNS (
                        prior_level_json JSON PATH '$'
                    )) AS prior_level
                    WHERE CAST(JSON_UNQUOTE(JSON_EXTRACT(prior_level.prior_level_json, '$.placement_order')) AS UNSIGNED)
                      < CAST(JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.placement_order')) AS UNSIGNED)
                      AND JSON_LENGTH(JSON_EXTRACT(prior_level.prior_level_json, '$.recipient_types')) > 0
                      AND JSON_UNQUOTE(JSON_EXTRACT(prior_level.prior_level_json, '$.status')) NOT IN ('completed', 'bypassed')
                )
            )
        )
      )
      ${adjustedFilterString}
      ${hierarchyFilter ? ` AND jo.job_id IN (:job_ids)` : ""}
      ORDER BY jo.offer_code DESC, jo.created_on DESC
      `
    return query;
  }

  async getAllOffersCountQuery(filterString: string, hierarchyFilter?: boolean, isMSPUser?: boolean): Promise<string> {
    const adjustedFilterString = filterString
      .split(' AND ')
      .map(filter => {
        if (filter.includes('job_id')) {
          if (!filter.includes('jo.job_id') && !filter.includes('oj.job_id')) {
            return filter.replace(/job_id/g, 'jo.job_id');
          }
        }
        return filter;
      })
      .filter(filter => filter !== null)
      .join(' AND ');

    const query = `
    SELECT COUNT(DISTINCT jo.id) as total_count
    FROM offers AS jo
    ${isMSPUser ? 'INNER JOIN offers_hierarchy AS oh ON oh.offer_id = jo.id' : 'LEFT JOIN offers_hierarchy AS oh ON oh.offer_id = jo.id'}
    LEFT JOIN ${config_db}.candidates AS jc ON jc.id = jo.candidate_id
    LEFT JOIN submission_candidate AS os ON os.id = jo.submission_id
    LEFT JOIN jobs AS oj ON oj.id = jo.job_id
    LEFT JOIN ${config_db}.job_templates AS jt ON jt.id = oj.job_template_id
    LEFT JOIN ${config_db}.program_vendors AS pv ON pv.id = jo.vendor_id AND pv.program_id = :program_id
    WHERE jo.is_deleted = false
      AND jo.program_id = :program_id
      AND (jo.status IS NULL OR jo.status NOT IN ('CLOSED'))
      AND NOT (jo.parent_offer_id IS NOT NULL AND UPPER(jo.status) = 'WITHDRAWN')
      AND (
        :user_id IS NULL
        OR :isValidStatus = FALSE
        OR (
            EXISTS (
                SELECT 1
                FROM ${config_db}.workflow vm
                CROSS JOIN JSON_TABLE(vm.levels, '$[*]' COLUMNS (
                    level_json JSON PATH '$'
                )) AS level
                CROSS JOIN JSON_TABLE(level.level_json, '$.recipient_types[*]' COLUMNS (
                    recipient_json JSON PATH '$'
                )) AS recipient
                WHERE vm.workflow_trigger_id = jo.id
                AND JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.status')) = 'pending'
                AND JSON_UNQUOTE(JSON_EXTRACT(recipient.recipient_json, '$.status')) = 'pending'
                AND JSON_SEARCH(JSON_EXTRACT(recipient.recipient_json, '$.meta_data'), 'one', :user_id) IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1
                    FROM JSON_TABLE(vm.levels, '$[*]' COLUMNS (
                        prior_level_json JSON PATH '$'
                    )) AS prior_level
                    WHERE CAST(JSON_UNQUOTE(JSON_EXTRACT(prior_level.prior_level_json, '$.placement_order')) AS UNSIGNED)
                      < CAST(JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.placement_order')) AS UNSIGNED)
                      AND JSON_LENGTH(JSON_EXTRACT(prior_level.prior_level_json, '$.recipient_types')) > 0
                      AND JSON_UNQUOTE(JSON_EXTRACT(prior_level.prior_level_json, '$.status')) NOT IN ('completed', 'bypassed')
                )
            )
        )
      )
      ${adjustedFilterString}
      ${hierarchyFilter ? ` AND jo.job_id IN (:job_ids)` : ""}
  `;
    return query;
  }

  async getAllOffersFilterQuery(filterString: string, hierarchyFilter?: boolean): Promise<string> {
    const adjustedFilterString = filterString
      .split(' AND ')
      .map(filter => {
        if (filter.includes('job_id')) {
          if (!filter.includes('jo.job_id') && !filter.includes('oj.job_id')) {
            return filter.replace(/job_id/g, 'jo.job_id');
          }
        }
        return filter;
      })
      .filter(filter => filter !== null)
      .join(' AND ');

    const query = `
      SELECT
        jo.id,
        jo.status,
        jo.updated_on,
        jo.offer_code,
        jo.candidate_id,
        jo.job_id,
        jo.unique_id,
        jo.submission_id,
        jo.vendor_id,
        jo.created_on,
        jc.first_name,
        jc.last_name,
        jc.middle_name,
        jc.candidate_id AS candidate_unique_id,
        os.unique_id AS submission_unique_id,
        oj.job_id AS job_unique_id,
        oj.status AS job_status,
        jt.template_name AS job_name,
        pv.tenant_id,
        COUNT(*) OVER() AS total_count
      FROM offers AS jo
      LEFT JOIN ${config_db}.candidates AS jc ON jc.id = jo.candidate_id
      LEFT JOIN submission_candidate AS os ON os.id = jo.submission_id
      LEFT JOIN jobs AS oj ON oj.id = jo.job_id
      LEFT JOIN ${config_db}.job_templates AS jt ON jt.id = oj.job_template_id
      LEFT JOIN ${config_db}.program_vendors AS pv ON pv.id = jo.vendor_id
        AND pv.program_id=:program_id
      WHERE jo.is_deleted = false
        AND jo.program_id = :program_id
        AND (jo.status IS NULL OR jo.status NOT IN ('Counter Offer','CLOSED'))
        ${adjustedFilterString}
        ${hierarchyFilter ? ` AND jo.job_id IN (:job_ids)` : ""}
      ORDER BY jo.created_on DESC
      LIMIT :limit
      OFFSET :offset;
    `;

    return query;
  }



  async findOfferDataForVendor(program_id: string, vendor_id: string): Promise<any> {
    const query = `
    SELECT o.id, o.start_date, o.end_date, o.status,
    CONCAT_WS(' ', c.first_name, c.last_name) AS candidate_name
    FROM offers o
    LEFT JOIN ${config_db}.candidates c ON o.candidate_id = c.id
    WHERE o.program_id = :program_id AND o.vendor_id = :vendor_id`;

    const result = await sequelize.query(query, {
      replacements: { program_id, vendor_id },
      type: QueryTypes.SELECT,
    });
    return result;
  }
  async findOfferDataForSuperAdmin(program_id: string): Promise<any> {
    const query = `
    SELECT o.id, o.start_date, o.end_date, o.status,
    CONCAT_WS(' ', c.first_name, c.last_name) AS candidate_name
    FROM offers o
    LEFT JOIN ${config_db}.candidates c ON o.candidate_id = c.id
    WHERE o.program_id = :program_id`;

    const result = await sequelize.query(query, {
      replacements: { program_id },
      type: QueryTypes.SELECT,
    });
    return result;
  }

  async findOfferDataForClient(program_id: string, hierarchyIdsArray: string[]): Promise<any> {
    const query = `
    SELECT o.id, o.start_date, o.end_date, o.status,
    CONCAT_WS(' ', c.first_name, c.last_name) AS candidate_name
    FROM offers o
    LEFT JOIN ${config_db}.candidates c ON o.candidate_id = c.id
    WHERE o.program_id = :program_id
    AND EXISTS (
      SELECT 1 FROM offers_hierarchy oh
      WHERE oh.offer_id = o.id
      AND oh.hierarchy IN (:hierarchyIdsArray)
    )
    `;

    const result = await sequelize.query(query, {
      replacements: { program_id, hierarchyIdsArray },
      type: QueryTypes.SELECT,
    });
    return result;
  }
  async findUser(program_id: string, userId: any): Promise<any> {
    const userHierarchyData = await sequelize.query(
      ` SELECT
    u.user_type,
    u.tenant_id,
    u.is_all_hierarchy_associate,
    CASE
        WHEN u.is_all_hierarchy_associate = TRUE THEN
            JSON_ARRAYAGG(h.id)
        ELSE
            u.associate_hierarchy_ids
    END AS associate_hierarchy_ids
FROM
    ${config_db}.user AS u
LEFT JOIN
    ${config_db}.hierarchies AS h
    ON u.program_id = h.program_id
WHERE
    u.user_id =:user_id
    AND u.program_id =:program_id
GROUP BY
    u.associate_hierarchy_ids,
    u.user_type,
    u.tenant_id,
    u.is_all_hierarchy_associate`,
      {
        replacements: { user_id: userId, program_id },
        type: QueryTypes.SELECT,
      }
    ) as any[];
    return userHierarchyData;
  }

  async findJobStatus(program_id: string, job_id: string, transaction: any): Promise<any> {
    const jobStatus = await sequelize.query(
      `WITH updated_offers AS (
          SELECT id, status FROM offers WHERE job_id = :job_id AND program_id = :program_id
          FOR UPDATE
      )
      SELECT
          j.no_positions,
          COALESCE(SUM(CASE WHEN uo.status = 'Accepted' THEN 1 ELSE 0 END), 0) AS accepted_offers,
          CASE
              WHEN j.no_positions <= COALESCE(SUM(CASE WHEN uo.status = 'Accepted' THEN 1 ELSE 0 END), 0)
              THEN 'Filled'
              ELSE 'Open'
          END AS job_status,
          uo.id AS offer_id,
          uo.status AS offer_status
      FROM jobs j
      LEFT JOIN updated_offers uo ON j.id = :job_id
      WHERE j.id = :job_id AND j.program_id = :program_id
      GROUP BY j.id, j.no_positions, uo.id, uo.status`,
      {
        replacements: { program_id, job_id },
        transaction,
        type: QueryTypes.SELECT,
      }
    ) as any[];

    return jobStatus[0].job_status;
  }

  async findVendor(program_id: string, user_id: any): Promise<any> {
    const vendor = await sequelize.query(
      `SELECT id FROM ${config_db}.program_vendors WHERE tenant_id = :user_id AND program_id = :program_id`,
      {
        replacements: { user_id: user_id, program_id },
        type: QueryTypes.SELECT,
      }
    );
    return vendor;
  }

  buildOfferFilters(query: any, baseReplacements: any, isVendorUser: boolean, isMSPUser: boolean, isHierarchyAssociated: boolean) {
    const filters: string[] = [];
    const replacements = { ...baseReplacements };

    for (const [key, value] of Object.entries(query)) {
      if (value != null) {
        if (key === "job_ids") {
          filters.push(`jo.job_id IN (:job_ids)`);
          replacements.job_ids = value;
        } else {
          const field = key === "job_id" ? "jo.job_id" : key;
          filters.push(`${field} = :${key}`);
          replacements[key] = value;
        }
      }
    }

    if (isVendorUser) {
      filters.push(`
      (
        (jo.parent_offer_id IS NULL AND (jo.status IS NULL OR jo.status NOT IN ('Pending Review', 'Pending Approval')))
        OR jo.parent_offer_id IS NOT NULL
      ) AND jo.vendor_id = :vendorId
    `);
    }

    if (isMSPUser && isHierarchyAssociated && baseReplacements.mspHierarchyIds) {
      filters.push(`oh.hierarchy IN (:mspHierarchyIds)`);
    }

    return { filters, replacements };
  }

  async getOfferCount(filters: string[], replacements: any, useHierarchy: boolean, useHierarchyFilter: boolean): Promise<number> {
    const filterString = filters.length ? ` AND ${filters.join(" AND ")}` : "";
    const sql = await this.getAllOffersCountQuery(filterString, useHierarchy, useHierarchyFilter);
    const result = await sequelize.query(sql, {
      replacements,
      type: QueryTypes.SELECT
    }) as Array<{ total_count?: number }>;
    return result?.[0]?.total_count ?? 0;
  }

  async getOffers(filters: string[], replacements: any, options: { limit: number, offset: number, useHierarchy: boolean, useHierarchyFilter: boolean }) {
    const filterString = filters.length ? ` AND ${filters.join(" AND ")}` : "";
    let sql = await this.getAllOffersQuery(filterString, options.useHierarchy, options.useHierarchyFilter);
    sql += ` LIMIT :limit OFFSET :offset`;

    const updatedReplacements = {
      ...replacements,
      limit: options.limit,
      offset: options.offset,
    };

    return sequelize.query(sql, {
      replacements: updatedReplacements,
      type: QueryTypes.SELECT
    });
  }


}

export default OfferRepository;
