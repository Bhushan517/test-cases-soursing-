import { QueryTypes } from "sequelize";
import { sequelize } from "../config/instance";
import { JobInterface } from "../interfaces/job.interface";
import { databaseConfig } from '../config/db';
import axios from "axios";
import { JobHistoryInterface } from "../interfaces/job-histroy.interface";
import { WORKFLOW_STATUS, WORKFLOW_FLOW_TYPE } from "../utility/enum/workflow_enum";
const config_db = databaseConfig.config.database_config;
const CONFIG_URL = process.env.CONFIG_URL;

interface JobResult {
  id: string;
  job_id: string;
  totalRecords: number;
  [key: string]: any;
}
interface ChecklistResult {
  checklist_entity_id: string;
  checklist_version_id: string;
  checklist_version: number;
  checklist_name: string;
  trigger: string;
  mappings: any[];
}
interface JobBasicData {
  id: string;
  program_id: string;
  status: string;
  start_date: string;
  end_date: string;
  checklist_entity_id?: string;
  [key: string]: any;
  checklist: any
}
class JobRepository {

  async getAllJobDetails(program_id: string) {
    const query = `
        SELECT
            :program_id AS program_id,
            (
                SELECT JSON_ARRAYAGG(JSON_OBJECT('id', id, 'name', name))
                FROM (
                    SELECT DISTINCT h.id, h.name
                    FROM ${config_db}.hierarchies h
                    INNER JOIN jobs j ON JSON_CONTAINS(CAST(j.hierarchy_ids AS JSON), JSON_QUOTE(CAST(h.id AS CHAR)))
                    WHERE j.program_id = :program_id AND j.is_deleted = false
                ) AS hierarchies_sub
            ) AS hierarchies,
            (
                SELECT JSON_ARRAYAGG(JSON_OBJECT('id', id, 'name', name))
                FROM (
                    SELECT DISTINCT wl.id, wl.name
                    FROM ${config_db}.work_locations wl
                    INNER JOIN jobs j ON j.work_location_id = wl.id
                    WHERE j.program_id = :program_id AND j.is_deleted = false
                ) AS work_locations_sub
            ) AS work_location,
            (
                SELECT JSON_ARRAYAGG(JSON_OBJECT('id', id, 'name', name))
                FROM (
                    SELECT DISTINCT ph.id, ph.name
                    FROM ${config_db}.hierarchies ph
                    INNER JOIN jobs j ON j.primary_hierarchy = ph.id
                    WHERE j.program_id = :program_id AND j.is_deleted = false
                ) AS primary_hierarchy_sub
            ) AS primary_hierarchy,
            (
                SELECT JSON_ARRAYAGG(JSON_OBJECT('id', id, 'template_name', template_name))
                FROM (
                    SELECT DISTINCT jt.id, jt.template_name
                    FROM ${config_db}.job_templates jt
                    INNER JOIN jobs j ON j.job_template_id = jt.id
                    WHERE j.program_id = :program_id AND j.is_deleted = false
                ) AS job_templates_sub
            ) AS job_title,
                (
            SELECT JSON_ARRAYAGG(JSON_OBJECT('id', user_id, 'first_name', first_name, 'last_name', last_name, 'full_name', CONCAT(first_name, ' ', last_name)))
            FROM (
                SELECT DISTINCT jbm.user_id, jbm.first_name, jbm.last_name
                FROM ${config_db}.user jbm
                INNER JOIN jobs j ON j.job_manager_id = jbm.user_id
                WHERE j.program_id = :program_id AND jbm.program_id = :program_id AND j.is_deleted = false
            ) AS job_manager_sub
        ) AS job_manager
    `;

    const result = await sequelize.query(query, {
      replacements: { program_id },
      type: QueryTypes.SELECT,
    });
    return result;
  }

  async getAllJobDetailsForVendor(program_id: string, vendor_id: string) {
    const query = `
      SELECT
          :program_id AS program_id,
          (
              SELECT JSON_ARRAYAGG(JSON_OBJECT('id', id, 'name', name))
              FROM (
                  SELECT DISTINCT wl.id, wl.name
                  FROM ${config_db}.work_locations wl
                  INNER JOIN jobs j ON j.work_location_id = wl.id
                  WHERE j.program_id = :program_id
                    AND j.is_deleted = false
                    AND EXISTS (
                        SELECT 1 FROM job_distributions jd
                        WHERE jd.job_id = j.id
                          AND jd.vendor_id = :vendor_id
                    )
              ) AS work_locations_sub
          ) AS work_location,
          (
              SELECT JSON_ARRAYAGG(JSON_OBJECT('id', id, 'template_name', template_name))
              FROM (
                  SELECT DISTINCT jt.id, jt.template_name
                  FROM ${config_db}.job_templates jt
                  INNER JOIN jobs j ON j.job_template_id = jt.id
                  WHERE j.program_id = :program_id
                    AND j.is_deleted = false
                    AND EXISTS (
                        SELECT 1 FROM job_distributions jd
                        WHERE jd.job_id = j.id
                          AND jd.vendor_id = :vendor_id
                    )
              ) AS job_templates_sub
          ) AS job_title,
          (
              SELECT JSON_ARRAYAGG(JSON_OBJECT('id', id, 'name', name))
              FROM (
                  SELECT DISTINCT h.id, h.name
                  FROM ${config_db}.hierarchies h
                  INNER JOIN jobs j ON JSON_CONTAINS(j.hierarchy_ids, JSON_QUOTE(CAST(h.id AS CHAR)))
                  WHERE j.program_id = :program_id
                    AND j.is_deleted = false
                    AND EXISTS (
                        SELECT 1 FROM job_distributions jd
                        WHERE jd.job_id = j.id
                          AND jd.vendor_id = :vendor_id
                    )
              ) AS hierarchies_sub
          ) AS hierarchies,
          (
              SELECT JSON_ARRAYAGG(JSON_OBJECT('id', id, 'name', name))
              FROM (
                  SELECT DISTINCT ph.id, ph.name
                  FROM ${config_db}.hierarchies ph
                  INNER JOIN jobs j ON j.primary_hierarchy = ph.id
                  WHERE j.program_id = :program_id
                    AND j.is_deleted = false
                    AND EXISTS (
                        SELECT 1 FROM job_distributions jd
                        WHERE jd.job_id = j.id
                          AND jd.vendor_id = :vendor_id
                    )
              ) AS primary_hierarchy_sub
          ) AS primary_hierarchy,
      (
            SELECT JSON_ARRAYAGG(JSON_OBJECT('id', user_id, 'first_name', first_name, 'last_name', last_name, 'full_name', CONCAT(first_name, ' ', last_name)))
            FROM (
                SELECT DISTINCT jbm.user_id, jbm.first_name, jbm.last_name
                FROM ${config_db}.user jbm
                INNER JOIN jobs j ON j.job_manager_id = jbm.user_id
                WHERE j.program_id = :program_id
                  AND jbm.program_id = :program_id
                  AND j.is_deleted = false
                  AND EXISTS (
                      SELECT 1 FROM job_distributions jd
                      WHERE jd.job_id = j.id
                        AND jd.vendor_id = :vendor_id
                  )
            ) AS job_manager_sub
        ) AS job_manager
      FROM dual;
  `;

    const result = await sequelize.query(query, {
      replacements: { program_id, vendor_id },
      type: QueryTypes.SELECT,
    });
    return result;
  }

  async getAllJobDetailsForClient(program_id: string, hierarchyIdsArray: string[]) {
    const query = `
    SELECT
      :program_id AS program_id,
      (
        SELECT JSON_ARRAYAGG(JSON_OBJECT('id', id, 'name', name))
        FROM (
          SELECT DISTINCT wl.id, wl.name
          FROM ${config_db}.work_locations wl
          INNER JOIN jobs j ON j.work_location_id = wl.id
          WHERE j.program_id = :program_id
            AND j.is_deleted = false
            AND (
              JSON_LENGTH(:hierarchyIdsJSON) = 0
              OR EXISTS (
                SELECT 1
                FROM JSON_TABLE(:hierarchyIdsJSON, '$[*]' COLUMNS(id VARCHAR(36) PATH '$')) AS jt
                WHERE JSON_CONTAINS(j.hierarchy_ids, JSON_QUOTE(jt.id))
              )
            )
        ) AS work_locations_sub
      ) AS work_location,
      (
        SELECT JSON_ARRAYAGG(JSON_OBJECT('id', id, 'template_name', template_name))
        FROM (
          SELECT DISTINCT jt.id, jt.template_name
          FROM ${config_db}.job_templates jt
          INNER JOIN jobs j ON j.job_template_id = jt.id
          WHERE j.program_id = :program_id
            AND j.is_deleted = false
            AND (
              JSON_LENGTH(:hierarchyIdsJSON) = 0
              OR EXISTS (
                SELECT 1
                FROM JSON_TABLE(:hierarchyIdsJSON, '$[*]' COLUMNS(id VARCHAR(36) PATH '$')) AS jt2
                WHERE JSON_CONTAINS(j.hierarchy_ids, JSON_QUOTE(jt2.id))
              )
            )
        ) AS job_templates_sub
      ) AS job_title,
      (
        SELECT JSON_ARRAYAGG(JSON_OBJECT('id', id, 'name', name))
        FROM (
          SELECT DISTINCT h.id, h.name
          FROM ${config_db}.hierarchies h
          INNER JOIN jobs j ON JSON_CONTAINS(j.hierarchy_ids, JSON_QUOTE(CAST(h.id AS CHAR)))
          WHERE j.program_id = :program_id
            AND j.is_deleted = false
            AND (
              JSON_LENGTH(:hierarchyIdsJSON) = 0
              OR EXISTS (
                SELECT 1
                FROM JSON_TABLE(:hierarchyIdsJSON, '$[*]' COLUMNS(id VARCHAR(36) PATH '$')) AS jt3
                WHERE JSON_CONTAINS(j.hierarchy_ids, JSON_QUOTE(jt3.id))
              )
            )
        ) AS hierarchies_sub
      ) AS hierarchies,
      (
        SELECT JSON_ARRAYAGG(JSON_OBJECT('id', id, 'name', name))
        FROM (
          SELECT DISTINCT ph.id, ph.name
          FROM ${config_db}.hierarchies ph
          INNER JOIN jobs j ON j.primary_hierarchy = ph.id
          WHERE j.program_id = :program_id
            AND j.is_deleted = false
            AND (
              JSON_LENGTH(:hierarchyIdsJSON) = 0
              OR EXISTS (
                SELECT 1
                FROM JSON_TABLE(:hierarchyIdsJSON, '$[*]' COLUMNS(id VARCHAR(36) PATH '$')) AS jt4
                WHERE JSON_CONTAINS(j.hierarchy_ids, JSON_QUOTE(jt4.id))
              )
            )
        ) AS primary_hierarchy_sub
      ) AS primary_hierarchy,
  (
        SELECT JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', user_id,
            'first_name', first_name,
            'last_name', last_name,
            'full_name', CONCAT(first_name, ' ', last_name)
          )
        )
        FROM (
          SELECT DISTINCT jbm.user_id, jbm.first_name, jbm.last_name
          FROM ${config_db}.user jbm
          INNER JOIN jobs j ON j.job_manager_id = jbm.user_id
          WHERE j.program_id = :program_id
            AND jbm.program_id = :program_id
            AND j.is_deleted = false
            AND (
              JSON_LENGTH(:hierarchyIdsJSON) = 0
              OR EXISTS (
                SELECT 1
                FROM JSON_TABLE(:hierarchyIdsJSON, '$[*]' COLUMNS(id VARCHAR(36) PATH '$')) AS jt5
                WHERE JSON_CONTAINS(j.hierarchy_ids, JSON_QUOTE(jt5.id))
              )
            )
        ) AS job_manager_sub
      ) AS job_manager
    FROM dual;
  `;

    const result = await sequelize.query(query, {
      replacements: {
        program_id,
        hierarchyIdsJSON: JSON.stringify(hierarchyIdsArray)
      },
      type: QueryTypes.SELECT,
    });
    return result;
  }
  async jobHistoryQuery(program_id: string, id: string | undefined): Promise<JobHistoryInterface[]> {
    const query = `
    WITH before_hierarchy AS (
        SELECT
            job_history.id AS job_history_id,
            before_json.id AS hierarchy_id,
            h.name AS hierarchy_name
        FROM job_history
        JOIN JSON_TABLE(
            JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_before, '$.hierarchy_ids')),
            '$[*]' COLUMNS (id VARCHAR(255) PATH '$')
        ) AS before_json
        LEFT JOIN ${config_db}.hierarchies h ON h.id = before_json.id
    ),
    after_hierarchy AS (
        SELECT
            job_history.id AS job_history_id,
            after_json.id AS hierarchy_id,
            h.name AS hierarchy_name
        FROM job_history
        JOIN JSON_TABLE(
            JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_after, '$.hierarchy_ids')),
            '$[*]' COLUMNS (id VARCHAR(255) PATH '$')
        ) AS after_json
        LEFT JOIN ${config_db}.hierarchies h ON h.id = after_json.id
    ),
    before_rate_type AS (
        SELECT
            job_history.id AS job_history_id,
            before_json.id AS rate_type_id,
            h.name AS rate_type_name
        FROM job_history
        JOIN JSON_TABLE(
            JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_before, '$.rateType')),
            '$[*]' COLUMNS (id VARCHAR(255) PATH '$')
        ) AS before_json
        LEFT JOIN ${config_db}.rate_type h ON h.id = before_json.id
    ),
    after_rate_type AS (
        SELECT
            job_history.id AS job_history_id,
            after_json.id AS rate_type_id,
            h.name AS rate_type_name
        FROM job_history
        JOIN JSON_TABLE(
            JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_after, '$.rateType')),
            '$[*]' COLUMNS (id VARCHAR(255) PATH '$')
        ) AS after_json
        LEFT JOIN ${config_db}.rate_type h ON h.id = after_json.id
    ),
    before_shift_type AS (
        SELECT
            job_history.id AS job_history_id,
            before_json.id AS shift_type_id,
            h.shift_type_name AS shift_type_name  -- Change 'name' to the actual column name
        FROM job_history
        JOIN JSON_TABLE(
            JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_before, '$.shiftType')),
            '$[*]' COLUMNS (id VARCHAR(255) PATH '$')
        ) AS before_json
        LEFT JOIN ${config_db}.shift_types h ON h.id = before_json.id
    ),
    after_shift_type AS (
        SELECT
            job_history.id AS job_history_id,
            after_json.id AS shift_type_id,
            h.shift_type_name AS shift_type_name  -- Change 'name' to the actual column name
        FROM job_history
        JOIN JSON_TABLE(
            JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_after, '$.shiftType')),
            '$[*]' COLUMNS (id VARCHAR(255) PATH '$')
        ) AS after_json
        LEFT JOIN ${config_db}.shift_types h ON h.id = after_json.id
    )

    SELECT
        job_history.id,
        job_history.program_id,
        job_history.job_id,
        job_history.created_by,
        job_history.updated_by,
        job_history.event_type,
        job_history.created_on,
        job_history.updated_on,
        job_history.event_summary_before,
        job_history.event_summary_after,

        -- Job Template Changes
        JSON_OBJECT(
            'old_value', JSON_OBJECT('id', jt.id, 'template_name', jt.template_name),
            'new_value', JSON_OBJECT('id', jb.id, 'template_name', jb.template_name)
        ) AS job_template_id,

        -- Job Manager Changes
        JSON_OBJECT(
            'old_value', JSON_OBJECT('id', u.user_id, 'first_name', u.first_name, 'last_name', u.last_name),
            'new_value', JSON_OBJECT('id', us.user_id, 'first_name', us.first_name, 'last_name', us.last_name)
        ) AS job_manager_id,

        -- Primary Hierarchy Changes
        JSON_OBJECT(
            'old_value', JSON_OBJECT('id', h.id, 'name', h.name),
            'new_value', JSON_OBJECT('id', hs.id, 'name', hs.name)
        ) AS primary_hierarchy,

        -- Work Location Changes
        JSON_OBJECT(
            'old_value', JSON_OBJECT('id', w.id, 'name', w.name, 'address', w.address),
            'new_value', JSON_OBJECT('id', ws.id, 'name', ws.name, 'address', ws.address)
        ) AS work_location_id,

        -- Labor Category Changes
        JSON_OBJECT(
            'old_value', JSON_OBJECT('id', lbc.id, 'name', lbc.name),
            'new_value', JSON_OBJECT('id', lbco.id, 'name', lbco.name)
        ) AS labor_category_id,


        -- Checklist Changes
        JSON_OBJECT(
            'old_value', JSON_OBJECT('id', ck.entity_id, 'name', ck.name),
            'new_value', JSON_OBJECT('id', cko.entity_id, 'name', cko.name)
        ) AS checklist_entity_id,

        -- Created By
        JSON_OBJECT(
            'id', cb.user_id, 'first_name', cb.first_name, 'last_name', cb.last_name, 'email', cb.email
        ) AS created_by,

        -- Modified By
        JSON_OBJECT(
            'id', mb.user_id, 'first_name', mb.first_name, 'last_name', mb.last_name, 'email', mb.email
        ) AS updated_by,

        -- Hierarchy Changes
        JSON_OBJECT(
            'old_value', COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', bh.hierarchy_id, 'name', bh.hierarchy_name))
                 FROM before_hierarchy bh
                 WHERE bh.job_history_id = job_history.id),
                JSON_ARRAY()
            ),
            'new_value', COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', ah.hierarchy_id, 'name', ah.hierarchy_name))
                 FROM after_hierarchy ah
                 WHERE ah.job_history_id = job_history.id),
                JSON_ARRAY()
            )
        ) AS hierarchy_ids,

        -- Rate Type Changes
        JSON_OBJECT(
            'old_value', COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', br.rate_type_id, 'name', br.rate_type_name))
                 FROM before_rate_type br
                 WHERE br.job_history_id = job_history.id),
                JSON_ARRAY()
            ),
            'new_value', COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', ar.rate_type_id, 'name', ar.rate_type_name))
                 FROM after_rate_type ar
                 WHERE ar.job_history_id = job_history.id),
                JSON_ARRAY()
            )
        ) AS rateType,

        -- Shift Type Changes
        JSON_OBJECT(
            'old_value', COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', bst.shift_type_id, 'name', bst.shift_type_name))
                 FROM before_shift_type bst
                 WHERE bst.job_history_id = job_history.id),
                JSON_ARRAY()
            ),
            'new_value', COALESCE(
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', ast.shift_type_id, 'name', ast.shift_type_name))
                 FROM after_shift_type ast
                 WHERE ast.job_history_id = job_history.id),
                JSON_ARRAY()
            )
        ) AS shiftType,

        -- Foundation Data Types Changes
        JSON_OBJECT(
            'old_value', (
                SELECT JSON_ARRAYAGG(JSON_OBJECT(
                    'foundation_data_type_id', bfd.foundation_data_type_id,
                    'foundation_data_type_name', mdt.name,
                    'foundational_data_ids', (
                        SELECT JSON_ARRAYAGG(JSON_OBJECT('id', md.id, 'name', md.name))
                        FROM JSON_TABLE(
                            JSON_UNQUOTE(JSON_EXTRACT(bfd.foundation_data_ids, '$[*]')),
                            '$[*]' COLUMNS (id VARCHAR(255) PATH '$')
                        ) AS fd_ids
                        LEFT JOIN ${config_db}.master_data md ON md.id = fd_ids.id
                    )
                ))
                FROM JSON_TABLE(
                    JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_before, '$.foundationDataTypes')),
                    '$[*]' COLUMNS (
                        foundation_data_type_id VARCHAR(255) PATH '$.foundation_data_type_id',
                        foundation_data_ids JSON PATH '$.foundation_data_ids'
                    )
                ) AS bfd
                LEFT JOIN ${config_db}.master_data_type mdt ON mdt.id = bfd.foundation_data_type_id
            ),
            'new_value', (
                SELECT JSON_ARRAYAGG(JSON_OBJECT(
                    'foundation_data_type_id', afd.foundation_data_type_id,
                    'foundation_data_type_name', mdt.name,
                    'foundational_data_ids', (
                        SELECT JSON_ARRAYAGG(JSON_OBJECT('id', md.id, 'name', md.name))
                        FROM JSON_TABLE(
                            JSON_UNQUOTE(JSON_EXTRACT(afd.foundation_data_ids, '$[*]')),
                            '$[*]' COLUMNS (id VARCHAR(255) PATH '$')
                        ) AS fd_ids
                        LEFT JOIN ${config_db}.master_data md ON md.id = fd_ids.id
                    )
                ))
                FROM JSON_TABLE(
                    JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_after, '$.foundationDataTypes')),
                    '$[*]' COLUMNS (
                        foundation_data_type_id VARCHAR(255) PATH '$.foundation_data_type_id',
                        foundation_data_ids JSON PATH '$.foundation_data_ids'
                    )
                ) AS afd
                LEFT JOIN ${config_db}.master_data_type mdt ON mdt.id = afd.foundation_data_type_id
            )
        ) AS foundationDataTypes,

        JSON_OBJECT(
            'old_value', (
                SELECT JSON_ARRAYAGG(JSON_OBJECT(
                    'qualification_type_id', qbt.qualification_type_id,
                    'qualification_type_name', qtype.name,
                    'qualifications', (
                        SELECT JSON_ARRAYAGG(JSON_OBJECT(
                            'id', q.qualification_id,
                            'name', q.name,
                            'is_required', q.is_required
                        ))
                        FROM JSON_TABLE(
                            JSON_UNQUOTE(JSON_EXTRACT(qbt.qualifications, '$[*]')),
                            '$[*]' COLUMNS (
                                qualification_id VARCHAR(255) PATH '$.qualification_id',
                                name VARCHAR(255) PATH '$.name',
                                is_required BOOLEAN PATH '$.is_required'
                            )
                        ) AS q
                    )
                ))
                FROM JSON_TABLE(
                    JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_before, '$.qualifications')),
                    '$[*]' COLUMNS (
                        qualification_type_id VARCHAR(255) PATH '$.qulification_type_id',
                        qualifications JSON PATH '$.qulification'
                    )
                ) AS qbt
                LEFT JOIN ${config_db}.qualification_types qtype ON qtype.id = qbt.qualification_type_id
            ),
            'new_value', (
                SELECT JSON_ARRAYAGG(JSON_OBJECT(
                    'qualification_type_id', qbt.qualification_type_id,
                    'qualification_type_name', qtype.name,
                    'qualifications', (
                        SELECT JSON_ARRAYAGG(JSON_OBJECT(
                            'id', q.qualification_id,
                            'name', q.name,
                            'is_required', q.is_required
                        ))
                        FROM JSON_TABLE(
                            JSON_UNQUOTE(JSON_EXTRACT(qbt.qualifications, '$[*]')),
                            '$[*]' COLUMNS (
                                qualification_id VARCHAR(255) PATH '$.qualification_id',
                                name VARCHAR(255) PATH '$.name',
                                is_required BOOLEAN PATH '$.is_required'
                            )
                        ) AS q
                    )
                ))
                FROM JSON_TABLE(
                    JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_after, '$.qualifications')),
                    '$[*]' COLUMNS (
                        qualification_type_id VARCHAR(255) PATH '$.qulification_type_id',
                        qualifications JSON PATH '$.qulification'
                    )
                ) AS qbt
                LEFT JOIN ${config_db}.qualification_types qtype ON qtype.id = qbt.qualification_type_id
            )
        ) AS qualifications
    FROM job_history

    -- Joining Job Templates
    LEFT JOIN ${config_db}.job_templates jt ON jt.id = JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_before, '$.job_template_id'))
    LEFT JOIN ${config_db}.job_templates jb ON jb.id = JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_after, '$.job_template_id'))

    -- Joining Users
    LEFT JOIN ${config_db}.user u ON u.user_id = JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_before, '$.job_manager_id'))
    LEFT JOIN ${config_db}.user us ON us.user_id = JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_after, '$.job_manager_id'))

    -- Joining Primary Hierarchies
    LEFT JOIN ${config_db}.hierarchies h ON h.id = JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_before, '$.primary_hierarchy'))
    LEFT JOIN ${config_db}.hierarchies hs ON hs.id = JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_after, '$.primary_hierarchy'))

    -- Joining Work Locations
    LEFT JOIN ${config_db}.work_locations w ON w.id = JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_before, '$.work_location_id'))
    LEFT JOIN ${config_db}.work_locations ws ON ws.id = JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_after, '$.work_location_id'))

    -- Joining Labor Categories
    LEFT JOIN ${config_db}.labour_category lbc ON lbc.id = JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_before, '$.labor_category_id'))
    LEFT JOIN ${config_db}.labour_category lbco ON lbco.id = JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_after, '$.labor_category_id'))

    -- Joining Checklist
    LEFT JOIN ${config_db}.checklist ck ON ck.entity_id = JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_before, '$.checklist_entity_id'))
    LEFT JOIN ${config_db}.checklist cko ON cko.entity_id = JSON_UNQUOTE(JSON_EXTRACT(job_history.event_summary_after, '$.checklist_entity_id'))

    -- Created By and Modified By
    LEFT JOIN ${config_db}.user cb ON job_history.created_by = cb.user_id
    LEFT JOIN ${config_db}.user mb ON job_history.updated_by = mb.user_id

    WHERE job_history.program_id = :program_id
    AND job_history.id = :id;
    `;

    const result = await sequelize.query(query, {
      replacements: { program_id, id },
      type: QueryTypes.SELECT,
    }) as JobHistoryInterface[];

    return result;
  }

  async getJobByJobIdAndProgramId(id: string | undefined, program_id: string, userType: any) {
    const isVendor = userType?.toLowerCase() === 'vendor';

    const statusCase = isVendor
      ? `CASE
       WHEN jobs.status = 'PENDING_APPROVAL_SOURCING' THEN 'SOURCING'
       ELSE jobs.status
     END AS status`
      : `jobs.status AS status`;

    const query = `
            SELECT
                jobs.*,
                ${statusCase},
                JSON_OBJECT(
                    'id', hierarchies.id,
                    'name', hierarchies.name,
                    'parent_hierarchy_id', hierarchies.parent_hierarchy_id,
                    'is_enabled', hierarchies.is_enabled,
                    'code', hierarchies.code,
                    'is_hide_candidate_img',hierarchies.is_hide_candidate_img,
                    'rate_model', hierarchies.rate_model,
                    'default_date_format', hierarchies.default_date_format,
                    'default_time_format', hierarchies.default_time_format,
                    'unit_of_measure', hierarchies.unit_of_measure,
                    'is_vendor_neutral_program',hierarchies.is_vendor_neutral_program
                ) AS primary_hierarchy,
                JSON_OBJECT(
                    'id', work_locations.id,
                    'name', work_locations.name,
                    'address', work_locations.address
                ) AS work_location,
                JSON_OBJECT(
                    'id', job_manager.id,
                    'user_id',job_manager.user_id,
                    'job_manager_name', job_manager.first_name,
                    'job_manager_last_name', job_manager.last_name,
                    'time_zone_id',job_manager.time_zone_id,
                    'job_manager_number', JSON_UNQUOTE(JSON_EXTRACT(job_manager.contacts, '$[0].number'))
                ) AS job_manager,
                JSON_OBJECT(
                    'id', labour_category.id,
                    'name', labour_category.name
                ) AS labor_category,
                JSON_OBJECT(
                    'id', currencies.id,
                    'name', currencies.name,
                    'symbol', currencies.symbol,
                    'code', currencies.code
                ) AS currency,
                JSON_OBJECT(
                    'id', shift_types.id,
                    'shift_type_name', shift_types.shift_type_name
                ) AS shift,
                JSON_OBJECT(
    'id', job_templates.id,
    'template_name', job_templates.template_name,
    'ot_exempt',job_templates.ot_exempt,
    'submission_limit_vendor', job_templates.submission_limit_vendor,
    'job_submitted_count', job_templates.job_submitted_count,
    'is_description_editable', job_templates.is_description_editable,
    'allow_user_description', job_templates.allow_user_description,
    'is_resume_mandatory', job_templates.is_resume_mandatory,
    'allow_express_offer', job_templates.allow_express_offer,
    'is_submission_exceed_max_bill_rate', job_templates.is_submission_exceed_max_bill_rate,
    'is_qualification_enabled', job_templates.is_qualification_enabled,
    'is_onboarding_checklist', job_templates.is_onboarding_checklist,
    'is_automatic_distribution', job_templates.is_automatic_distribution,
    'is_manual_distribute_submit', job_templates.is_manual_distribute_submit,
    'is_tiered_distribute_submit', job_templates.is_tiered_distribute_submit,
    'is_review_configured_or_submit', job_templates.is_review_configured_or_submit,
    'is_distribute_final_approval', job_templates.is_distribute_final_approval,
    'is_expense_allowed_editable', job_templates.is_expense_allowed_editable,
    'is_expense_allowed', job_templates.is_expense_allowed,
    'is_shift_rate', job_templates.is_shift_rate,
    'is_description_required', job_templates.is_description_required,
    'is_checklist_enable', job_templates.is_checklist_enable,
    'is_description_upload_required', job_templates.is_description_upload_required,
    'is_country_mandatory', job_templates.is_country_mandatory,
    'is_address_mandatory', job_templates.is_address_mandatory,
    'allow_pre_identified_candidate', job_templates.allow_pre_identified_candidate,
    'is_tiered_distribute_submit', job_templates.is_tiered_distribute_submit,
    'category', JSON_OBJECT(
        'id', job_category.id,
        'title', job_category.title,
        'category', job_category.category
          ),
          'available_start_date', job_templates.available_start_date
         ) AS job_template,
                COALESCE(job_templates.level, NULL) AS job_level,
                COALESCE((
                    SELECT JSON_ARRAYAGG(JSON_OBJECT(
                        'id', hierarchies.id,
                        'name', hierarchies.name
                    ))
                    FROM ${config_db}.hierarchies
                    WHERE JSON_VALID(jobs.hierarchy_ids)
                      AND JSON_CONTAINS(jobs.hierarchy_ids, JSON_QUOTE(CAST(hierarchies.id AS CHAR)))
                ), JSON_ARRAY()) AS hierarchies,
                COALESCE((
                    SELECT JSON_ARRAYAGG(JSON_OBJECT(
                        'qualification_type_id', qualification_types.id,
                        'qualification_type_name', qualification_types.name,
                        'code', qualification_types.code,
                        'qualifications', COALESCE((
                            SELECT JSON_ARRAYAGG(
                                JSON_OBJECT(
                                    'qualification_id', q.id,
                                    'name', q.name,
                                    'is_locked', jq.is_locked,
                                    'is_required', jq.is_required=1,
                                    'level', jq.level
                                )
                            )
                            FROM ${config_db}.qualifications q
                            JOIN JSON_TABLE(
                                CASE
                                    WHEN JSON_VALID(job_qualification_types.qulification) THEN job_qualification_types.qulification
                                    ELSE '[]'
                                END,
                                '$[*]' COLUMNS(
                                    qualification_id CHAR(36) PATH '$.qualification_id',
                                    is_locked BOOLEAN PATH '$.is_locked',
                                    is_required BOOLEAN PATH '$.is_required',
                                    level JSON PATH '$.level'
                                )
                            ) AS jq ON q.id = jq.qualification_id
                        ), JSON_ARRAY())
                    ))
                    FROM ${config_db}.qualification_types
                    LEFT JOIN job_qualification_types ON job_qualification_types.qulification_type_id = qualification_types.id
                    WHERE job_qualification_types.job_id = jobs.id
                ), JSON_ARRAY()) AS qualifications,
                CASE
                    WHEN DATEDIFF(jobs.end_date, jobs.start_date) < 7 THEN
                        CONCAT(DATEDIFF(jobs.end_date, jobs.start_date), ' days')
                    WHEN DATEDIFF(jobs.end_date, jobs.start_date) < 30 THEN
                        CONCAT(FLOOR(DATEDIFF(jobs.end_date, jobs.start_date) / 7), ' weeks ', DATEDIFF(jobs.end_date, jobs.start_date) % 7, ' days')
                    WHEN DATEDIFF(jobs.end_date, jobs.start_date) < 365 THEN
                        CONCAT(FLOOR(DATEDIFF(jobs.end_date, jobs.start_date) / 30), ' months ', DATEDIFF(jobs.end_date, jobs.start_date) % 30, ' days')
                    ELSE
                        CONCAT(FLOOR(DATEDIFF(jobs.end_date, jobs.start_date) / 365), ' years ',
                               FLOOR((DATEDIFF(jobs.end_date, jobs.start_date) % 365) / 30), ' months ',
                               FLOOR((DATEDIFF(jobs.end_date, jobs.start_date) % 365 % 30) / 7), ' weeks ',
                               DATEDIFF(jobs.end_date, jobs.start_date) % 365 % 30 % 7, ' days')
                END AS duration_in_days,
                COALESCE((
                    SELECT JSON_ARRAYAGG(JSON_OBJECT(
                        'id', job_candidate.id,
                        'first_name', job_candidate.first_name,
                        'middle_name', job_candidate.middle_name,
                        'last_name', job_candidate.last_name,
                        'email', job_candidate.email,
                        'phone_number', job_candidate.phone_number,
                        'vendor', job_candidate.vendor,
                        'country',job_candidate.country,
                        'notes', job_candidate.notes,
                        'vendor_name', program_vendors.display_name,
                        'tenant_id',program_vendors.tenant_id,
                        'country_code',countries.isd_code,
                        'country_name',countries.name,
                        'iso_code_2',countries.iso_code_2,
                        'iso_code_3',countries.iso_code_3
                    ))
                    FROM job_candidate
                    LEFT JOIN ${config_db}.program_vendors ON job_candidate.vendor = program_vendors.id
                    LEFT JOIN ${config_db}.countries ON job_candidate.country = countries.id
                    WHERE job_candidate.job_id = jobs.id
                ), JSON_ARRAY()) AS candidates,
               COALESCE((
                 SELECT JSON_ARRAYAGG(JSON_OBJECT(
                   'id', job_custom_fields.id,
                    'custom_field_id', job_custom_fields.custom_field_id,
                    'value', job_custom_fields.value, -- return value as-is
                  'manager_name',
                      CASE
                        WHEN user.user_id IS NOT NULL
                      THEN CONCAT(user.first_name, ' ', user.last_name)
                      ELSE NULL
                      END,
                   'name', custom_fields.name,
                   'field_type', custom_fields.field_type,
                   'can_edit',custom_fields.can_edit,
                   'can_view',custom_fields.can_view
               ))
            FROM job_custom_fields
              LEFT JOIN ${config_db}.custom_fields ON job_custom_fields.custom_field_id = custom_fields.id
              LEFT JOIN ${config_db}.user ON TRIM(BOTH '"' FROM job_custom_fields.value) = user.user_id AND user.program_id = job_custom_fields.program_id
              WHERE job_custom_fields.job_id = jobs.id
              AND custom_fields.is_deleted=false
              AND custom_fields.is_enabled=true
    ), JSON_ARRAY()) AS custom_fields,

                COALESCE((
                    SELECT JSON_ARRAYAGG(JSON_OBJECT(
                        'id', job_master_data.id,
                        'foundation_data_type_id', job_master_data.foundation_data_type_id,
                        'name', master_data_type.name,
                        'foundation_data_ids', (
                            SELECT JSON_ARRAYAGG(JSON_OBJECT(
                                'id', master_data.id,
                                'foundational_data_name', master_data.name,
                                'code', master_data.code
                            ))
                            FROM ${config_db}.master_data
                            WHERE JSON_CONTAINS(job_master_data.foundation_data_ids, JSON_QUOTE(CAST(master_data.id AS CHAR)))
                        )
                    ))
                    FROM job_master_data
                    LEFT JOIN ${config_db}.master_data_type ON job_master_data.foundation_data_type_id = master_data_type.id
                    WHERE job_master_data.job_id = jobs.id
                ), JSON_ARRAY()) AS foundationDataTypes,
                COALESCE((
                    SELECT JSON_ARRAYAGG(JSON_OBJECT(
                        'id', job_rate_type.id,
                        'bill_rate', job_rate_type.bill_rate,
                        'pay_rate', job_rate_type.pay_rate,
                        'rate_type_id', job_rate_type.id,
                        'abbreviation', job_rate_type.abbreviation,
                        'billable', job_rate_type.billable,
                        'name', job_rate_type.name
                    ))
                    FROM job_rate_type
                    WHERE job_rate_type.job_id = jobs.id
                ), JSON_ARRAY()) AS rates,
                JSON_OBJECT(
                    'id', creator.id,
                    'first_name', creator.first_name,
                    'middle_name', creator.middle_name,
                    'last_name', creator.last_name,
                    'username', creator.username,
                    'email', creator.email
                ) AS created_by,
                JSON_OBJECT(
                    'id', modifier.id,
                    'first_name', modifier.first_name,
                    'middle_name', modifier.middle_name,
                    'last_name', modifier.last_name,
                    'username', modifier.username,
                    'email', modifier.email
                ) AS updated_by,
                CASE
                  WHEN UPPER(jobs.managed_by) = 'SELF-MANAGED' THEN JSON_OBJECT(
                    'id', 'self-managed',
                    'name', 'self-managed',
                    'display_name', 'self-managed'
                  )
                  ELSE JSON_OBJECT(
                    'id', tenant.id,
                    'name', tenant.name,
                    'display_name', tenant.display_name
                  )
                END AS managed_by,
                JSON_OBJECT(
                    'id', job_distributions.id,
                    'opt_status', job_distributions.opt_status,
                    'notes', job_distributions.notes,
                    'opt_out_reason', job_distributions.opt_out_reason,
                    'opt_status_date', job_distributions.opt_status_date,
                    'opted_by', TRIM(CONCAT_WS(' ', opted.first_name, opted.middle_name, opted.last_name))

                ) AS opt_data
            FROM jobs
            LEFT JOIN ${config_db}.work_locations ON jobs.work_location_id = work_locations.id
            LEFT JOIN ${config_db}.user AS job_manager ON jobs.job_manager_id = job_manager.user_id AND jobs.program_id = job_manager.program_id
            LEFT JOIN ${config_db}.labour_category ON jobs.labor_category_id = labour_category.id
            LEFT JOIN ${config_db}.job_templates ON jobs.job_template_id = job_templates.id
            LEFT JOIN ${config_db}.job_category ON job_templates.category = job_category.id
            LEFT JOIN ${config_db}.currencies ON jobs.currency = currencies.code
            LEFT JOIN ${config_db}.user AS creator ON jobs.created_by = creator.user_id
            LEFT JOIN ${config_db}.user AS modifier ON jobs.updated_by = modifier.user_id
            LEFT JOIN ${config_db}.hierarchies ON jobs.primary_hierarchy = hierarchies.id
            LEFT JOIN ${config_db}.tenant ON jobs.managed_by = tenant.id
            LEFT JOIN job_qualification_types ON jobs.id = job_qualification_types.job_id
            LEFT JOIN ${config_db}.qualification_types ON job_qualification_types.qulification_type_id = qualification_types.id
            LEFT JOIN ${config_db}.shift_types on jobs.shift=shift_types.id
            LEFT JOIN job_distributions ON jobs.id=job_distributions.job_id
            LEFT JOIN ${config_db}.user AS opted ON job_distributions.opt_by = opted.user_id AND job_distributions.program_id = opted.program_id
            WHERE jobs.id = :id
            AND jobs.program_id = :program_id
            AND jobs.is_deleted = false
            GROUP BY
              jobs.id,
              hierarchies.id,
              work_locations.id,
              job_manager.id,
              labour_category.id,
              currencies.id,
              job_templates.id,
              job_category.id,
              shift_types.id,
              creator.id,
              modifier.id;
        `;
    const result = await sequelize.query(query, {
      replacements: { id, program_id },
      type: QueryTypes.SELECT,
    }) as any;
    return result;
  }

  async jobAdvancedFilter(
    hasJobId: boolean,
    hasQueryName: boolean,
    hasTemplateName: boolean,
    hasFirstName: boolean,
    hasJobSubmittedCandidate: boolean,
    hasStatus: boolean,
    hadExcludeStatus: boolean,
    hasMinBillRate: boolean,
    hasMaxBillRate: boolean,
    hasNoPosition: boolean,
    hasPrimaryHierarchy: boolean,
    hasStartDate: boolean,
    hasEndDate: boolean,
    hasEstimatedBudget: boolean,
    hasIsShiftRate: boolean,
    hasUnitOfMeasure: boolean,
    hasVendor: boolean,
    hierarchyIdsArray: string[], // This should contain the final filtered hierarchy IDs
    hierarchies: string[],
    hasCliet: boolean, // This is actually isAllHierarchy from your controller
    user_hierarhy_ids: string[],
    program_id: string,
    job_id?: string,
    name?: string,
    template_name?: string[],
    first_name?: string[],
    status?: string[],
    exclude_status?: string[],
    min_bill_rate?: number,
    max_bill_rate?: number,
    no_positions?: string,
    primary_hierarchy?: string[],
    job_submitted_candidate?: number,
    start_date?: string,
    end_date?: string,
    estimated_budget?: string,
    is_shift_rate?: boolean,
    unit_of_measure?: string,
    limitNumber?: number,
    offset?: number,
    hasCreatedOn?: boolean,
    created_on?: string,
    vendor_id?: string,
    user_id?: string | null,
    user_type?: string,
    search?: string,
    isMsp?: boolean,
    tenantId?: string
  ) {
    user_id = user_id ?? null;
    const isVendorUser = user_type?.toLowerCase() === 'vendor' ? 1 : 0;

    if (Array.isArray(status) && status.length) {
      status = status.map(s => {
        if (s === "PENDING_APPROVAL_WORKFLOW") {
          return "PENDING_APPROVAL";
        } else if (s === "PENDING_REVIEW_WORKFLOW") {
          return "PENDING_REVIEW";
        } else if (s === "WORKFLOW_APPROVAL_SOURCING") {
          return "PENDING_APPROVAL_SOURCING";
        }
        return s;
      });
    }

    const isValidStatus = status && (
      status.includes("PENDING_APPROVAL") ||
      status.includes("PENDING_REVIEW") ||
      status.includes("PENDING_APPROVAL_SOURCING")
    );

    const hierarchyFilterClause = `
      AND (
        JSON_LENGTH(:user_hierarchy_ids) = 0 OR
        EXISTS (
          SELECT 1
          FROM ${config_db}.hierarchies
          WHERE JSON_CONTAINS(jobs.hierarchy_ids, JSON_QUOTE(CAST(hierarchies.id AS CHAR)))
          AND hierarchies.id IN (SELECT id FROM JSON_TABLE(:user_hierarchy_ids, '$[*]' COLUMNS(id VARCHAR(36) PATH '$')) AS jt)
        )
      )
    `;
    const hierarchyIdsClause = hierarchyIdsArray.length
      ? `AND ${hierarchyIdsArray.map((_, index) => `JSON_CONTAINS(jobs.hierarchy_ids, JSON_QUOTE(:hierarchy_ids${index}), '$')`).join(' AND ')}`
      : '';
    const statusClause = hasStatus && status?.length
      ? `AND jobs.status IN (${status.map((_, index) => `:status${index}`).join(', ')})`
      : '';

    const excludeStatusClause = hadExcludeStatus && exclude_status?.length
      ? `AND jobs.status NOT IN (${exclude_status.map((_, index) => `:exclude_status${index}`).join(', ')})`
      : '';

    const templateNameClause = hasTemplateName && template_name?.length
      ? `AND jobs.job_template_id IN (${template_name.map((_, index) => `:template_name${index}`).join(', ')})`
      : '';

    const primaryHierarchyClause = hasPrimaryHierarchy && primary_hierarchy?.length
      ? `AND jobs.primary_hierarchy IN (${primary_hierarchy.map((_, index) => `:primary_hierarchy${index}`).join(', ')})`
      : '';

    const jobManagerClause = hasFirstName && first_name?.length
      ? `AND jobs.job_manager_id IN (${first_name.map((_, index) => `:first_name${index}`).join(', ')})`
      : '';

    const startDateClause = hasStartDate ? 'AND DATE(jobs.start_date) = DATE(:start_date)' : '';
    const endDateClause = hasEndDate ? 'AND DATE(jobs.end_date) = DATE(:end_date)' : '';
    const mspClause = isMsp ? 'AND (jobs.managed_by IS NULL OR jobs.managed_by != "self-managed")' : '';
    const vendorClause = hasVendor
      ? `INNER JOIN job_distributions ON jobs.id = job_distributions.job_id
        AND job_distributions.vendor_id = :vendor_id
        AND (job_distributions.opt_status IS NULL OR job_distributions.opt_status NOT IN ('OPT_OUT'))
        AND job_distributions.status NOT IN ('scheduled')`
      : '';

    let statusSelect = `jobs.status AS status`;
    if (user_type?.toLowerCase() === 'vendor') {
      statusSelect = `
         CASE
           WHEN jobs.status = 'PENDING_APPROVAL_SOURCING' THEN 'SOURCING'
           WHEN LOWER(job_distributions.status) = 'hold' THEN 'HOLD'
           WHEN LOWER(job_distributions.status) = 'halt' THEN 'HALTED'
           ELSE jobs.status
         END AS status
         `;
    }

    const query = `
    WITH level_recipients AS (
      SELECT j.id AS job_id,
        j.status AS job_status,
        CAST(JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.placement_order')) AS UNSIGNED) AS placement_order,
        JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.status')) AS level_status,
        JSON_UNQUOTE(JSON_EXTRACT(recipient.recipient_json, '$.status')) AS recipient_status,
        recipient.recipient_json AS recipient_json
      FROM jobs j
      JOIN ${config_db}.workflow vm ON j.id = vm.workflow_trigger_id,
      JSON_TABLE(vm.levels, '$[*]' COLUMNS (level_json JSON PATH '$')) AS level,
      JSON_TABLE(level.level_json, '$.recipient_types[*]' COLUMNS (recipient_json JSON PATH '$')) AS recipient
      WHERE j.program_id = :program_id AND j.is_deleted = 0
    ),
    matching_levels AS (
      SELECT job_id, placement_order
      FROM level_recipients
      WHERE level_status = 'pending'
        AND recipient_status = 'pending'
        AND JSON_SEARCH(JSON_EXTRACT(recipient_json, '$.meta_data'), 'one', :user_id) IS NOT NULL
      GROUP BY job_id, placement_order
    ),
    all_levels AS (
      SELECT j.id AS job_id,
        CAST(JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.placement_order')) AS UNSIGNED) AS placement_order,
        JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.status')) AS level_status,
        JSON_LENGTH(JSON_EXTRACT(level.level_json, '$.recipient_types')) AS recipient_count
      FROM jobs j
      JOIN ${config_db}.workflow vm ON j.id = vm.workflow_trigger_id,
      JSON_TABLE(vm.levels, '$[*]' COLUMNS (level_json JSON PATH '$')) AS level
      WHERE j.program_id = :program_id AND j.is_deleted = 0
    ),
    valid_levels AS (
      SELECT ml.job_id
      FROM matching_levels ml
      WHERE NOT EXISTS (
        SELECT 1
        FROM all_levels prior
        WHERE prior.job_id = ml.job_id
          AND prior.placement_order < ml.placement_order
        AND (prior.recipient_count > 0 AND prior.level_status NOT IN ('completed', 'bypassed'))
      )
    ),
    total_count AS (
      SELECT COUNT(*) AS count
      FROM (
        SELECT jobs.id
        FROM jobs
        LEFT JOIN ${config_db}.job_templates ON jobs.job_template_id = job_templates.id
        ${vendorClause}
        WHERE jobs.program_id = :program_id
          AND jobs.is_deleted = false
          ${hasJobId ? 'AND (jobs.job_id = :job_id OR jobs.job_id LIKE :partial_job_id)' : ''}
          ${hasQueryName ? 'AND jobs.work_location_id LIKE :name' : ''}
          ${search ? 'AND (job_templates.template_name LIKE :search OR jobs.job_id LIKE :search)' : ''}
          ${templateNameClause}
          ${jobManagerClause}
          ${statusClause}
          ${excludeStatusClause}
          AND (:min_bill_rate IS NULL OR jobs.min_bill_rate = :min_bill_rate)
          AND (:max_bill_rate IS NULL OR jobs.max_bill_rate = :max_bill_rate)
          ${hasNoPosition ? 'AND jobs.no_positions = :no_positions' : ''}
          ${primaryHierarchyClause}
          ${hasEstimatedBudget ? 'AND jobs.net_budget LIKE :estimated_budget' : ''}
          ${hasIsShiftRate ? 'AND job_templates.is_shift_rate = :is_shift_rate' : ''}
          ${hasUnitOfMeasure ? 'AND jobs.unit_of_measure LIKE :unit_of_measure' : ''}
          ${startDateClause}
          ${endDateClause}
          ${hierarchyIdsClause}
          ${hierarchyFilterClause}
          ${mspClause}
          ${hasCreatedOn ? 'AND DATE(FROM_UNIXTIME(jobs.created_on / 1000)) = DATE(:created_on)' : ''}
          ${hasJobSubmittedCandidate ? `AND (SELECT COALESCE(COUNT(sub.job_id), 0)
            FROM submission_candidate sub
            WHERE sub.job_id = jobs.id) = :job_submitted_candidate` : ''}
          AND (
            :isVendorUser = 1
            OR (
            :user_id IS NULL
            OR (
              :isValidStatus = 0
              OR (
                 ${hasStatus && status?.length ? `jobs.status IN (${status.map((_, idx) => `:status${idx}`).join(', ')})` : '1=0'}
                 AND jobs.status NOT IN ('PENDING_APPROVAL', 'PENDING_REVIEW', 'PENDING_APPROVAL_SOURCING')
                OR
                (jobs.status IN ('PENDING_APPROVAL', 'PENDING_REVIEW', 'PENDING_APPROVAL_SOURCING') AND jobs.id IN (SELECT job_id FROM valid_levels))
              )
            )
          )
        )
      ) AS job_count
    )
    SELECT
      jobs.id,
      jobs.job_id,
      jobs.status,
      jobs.created_by,
      jobs.updated_by,
      jobs.start_date,
      jobs.end_date,
      jobs.no_positions,
      jobs.job_manager_id,
      jobs.created_on,
      jobs.updated_on,
      jobs.rate_configuration,
      jobs.program_id,
      jobs.financial_calculation,
      jobs.max_bill_rate,
      jobs.min_bill_rate,
      jobs.rate_model,
      jobs.net_budget,
      jobs.unit_of_measure,
      jobs.checklist_entity_id,
      jobs.checklist_version,
      jobs.labor_category_id,
      JSON_OBJECT(
        'id', currencies.id,
        'name', currencies.name,
        'symbol', currencies.symbol,
        'code', currencies.code
        ) AS currency,
      ${statusSelect},
       JSON_OBJECT(
    'user_id', MIN(user.user_id),
    'first_name', MIN(user.first_name),
    'last_name', MIN(user.last_name)
  ) AS jobManager,
  JSON_OBJECT(
    'id', MIN(work_locations.id),
    'name', MIN(work_locations.name)
  ) AS work_location,
  JSON_OBJECT(
    'id', MIN(job_templates.id),
    'template_name', MIN(job_templates.template_name),
    'is_shift_rate', MIN(job_templates.is_shift_rate)
  ) AS job_template,
   JSON_OBJECT(
            'id', pi.id,
            'label', pi.label,
            'picklist_id', pi.picklist_id
          ) AS job_type,
  JSON_OBJECT(
    'id', MIN(primary_hierarchy.id),
    'name', MIN(primary_hierarchy.name),
    'parent_hierarchy_id', MIN(primary_hierarchy.parent_hierarchy_id),
    'is_enabled', MIN(primary_hierarchy.is_enabled),
    'code', MIN(primary_hierarchy.code),
    'rate_model', MIN(primary_hierarchy.rate_model),
    'default_time_format', MIN(primary_hierarchy.default_time_format),
    'unit_of_measure', MIN(primary_hierarchy.unit_of_measure)
  ) AS primary_hierarchy,
  (
    SELECT COALESCE(COUNT(sub.job_id), 0)
    FROM submission_candidate sub
    WHERE sub.job_id = jobs.id
  ) AS job_submitted_candidate,
  JSON_ARRAYAGG(
    JSON_OBJECT('id', hierarchies.id, 'name', hierarchies.name)
  ) AS hierarchies,
      (SELECT count FROM total_count) AS totalRecords
    FROM jobs
    LEFT JOIN ${config_db}.job_templates ON jobs.job_template_id = job_templates.id
    LEFT JOIN ${config_db}.work_locations ON jobs.work_location_id = work_locations.id
    LEFT JOIN ${config_db}.user ON jobs.job_manager_id = user.user_id AND user.program_id = :program_id
    LEFT JOIN ${config_db}.hierarchies primary_hierarchy ON jobs.primary_hierarchy = primary_hierarchy.id
    LEFT JOIN ${config_db}.currencies ON jobs.currency = currencies.code
    LEFT JOIN ${config_db}.picklistitems pi ON jobs.job_type = pi.id
    LEFT JOIN ${config_db}.hierarchies hierarchies ON JSON_VALID(jobs.hierarchy_ids)
      AND JSON_CONTAINS(jobs.hierarchy_ids, JSON_QUOTE(CAST(hierarchies.id AS CHAR)))
    ${vendorClause}
    WHERE jobs.is_deleted = false
      AND jobs.program_id = :program_id
      ${hasJobId ? 'AND (jobs.job_id = :job_id OR jobs.job_id LIKE :partial_job_id)' : ''}
      ${hasQueryName ? 'AND work_locations.id LIKE :name' : ''}
      ${search ? 'AND (job_templates.template_name LIKE :search OR jobs.job_id LIKE :search)' : ''}
      ${templateNameClause}
      ${jobManagerClause}
      ${statusClause}
      ${excludeStatusClause}
      AND (:min_bill_rate IS NULL OR jobs.min_bill_rate = :min_bill_rate)
      AND (:max_bill_rate IS NULL OR jobs.max_bill_rate = :max_bill_rate)
      ${hasNoPosition ? 'AND jobs.no_positions = :no_positions' : ''}
      ${primaryHierarchyClause}
      ${hasEstimatedBudget ? 'AND jobs.net_budget LIKE :estimated_budget' : ''}
      ${hasIsShiftRate ? 'AND job_templates.is_shift_rate = :is_shift_rate' : ''}
      ${hasUnitOfMeasure ? 'AND jobs.unit_of_measure LIKE :unit_of_measure' : ''}
      ${startDateClause}
      ${endDateClause}
      ${hierarchyIdsClause}
      ${hierarchyFilterClause}
      ${mspClause}
      ${hasCreatedOn ? 'AND DATE(FROM_UNIXTIME(jobs.created_on / 1000)) = DATE(:created_on)' : ''}
      ${hasJobSubmittedCandidate ? `AND (
        SELECT COALESCE(COUNT(sub.job_id), 0)
        FROM submission_candidate sub
        WHERE sub.job_id = jobs.id
      ) = :job_submitted_candidate` : ''}
      AND (
        :isVendorUser = 1
        OR (
        :user_id IS NULL
        OR (
          :isValidStatus = 0
          OR (
              ${hasStatus && status?.length ? `jobs.status IN (${status.map((_, idx) => `:status${idx}`).join(', ')})` : '1=0'}
              AND jobs.status NOT IN ('PENDING_APPROVAL', 'PENDING_REVIEW', 'PENDING_APPROVAL_SOURCING')
            OR
            (jobs.status IN ('PENDING_APPROVAL', 'PENDING_REVIEW', 'PENDING_APPROVAL_SOURCING') AND jobs.id IN (SELECT job_id FROM valid_levels))
          )
        )
      )
      )
    GROUP BY jobs.id
    ORDER BY CAST(SUBSTRING_INDEX(jobs.job_id, '-', -1) AS UNSIGNED) DESC,
    jobs.id ASC
    LIMIT :limit OFFSET :offset;
  `;

    // Prepare formatted date values
    const formattedStartDate = hasStartDate && start_date ? new Date(start_date).toISOString().split('T')[0] : null;
    const formattedEndDate = hasEndDate && end_date ? new Date(end_date).toISOString().split('T')[0] : null;
    const formattedCreatedOn = hasCreatedOn && created_on ? new Date(created_on).toISOString().split('T')[0] : null;

    // Prepare replacements
    const replacements: Record<string, any> = {
      program_id,
      user_id: user_id ?? null,
      name: name ? `${name}%` : undefined,
      job_id: job_id ?? null,
      partial_job_id: job_id ? `%${job_id}%` : null,
      start_date: formattedStartDate,
      end_date: formattedEndDate,
      created_on: formattedCreatedOn,
      template_name,
      first_name,
      status,
      exclude_status,
      min_bill_rate: min_bill_rate ?? null,
      max_bill_rate: max_bill_rate ?? null,
      no_positions,
      primary_hierarchy,
      job_submitted_candidate: job_submitted_candidate ?? null,
      estimated_budget: estimated_budget ? `%${estimated_budget}%` : undefined,
      is_shift_rate,
      unit_of_measure,
      limit: limitNumber,
      offset,
      vendor_id,
      hierarchyIdsArray: JSON.stringify(hierarchyIdsArray),
      isValidStatus: isValidStatus ? 1 : 0,
      search: search ? `%${search}%` : undefined,
      isVendorUser,
      user_hierarchy_ids: JSON.stringify(user_hierarhy_ids),
    };

    Object.keys(replacements).forEach(key => {
      if (replacements[key] === undefined) {
        delete replacements[key];
      }
    });

    // Add list-based dynamic parameters
    [...status || []].forEach((val, idx) => replacements[`status${idx}`] = val);
    [...exclude_status || []].forEach((val, idx) => replacements[`exclude_status${idx}`] = val);
    [...template_name || []].forEach((val, idx) => replacements[`template_name${idx}`] = val);
    [...primary_hierarchy || []].forEach((val, idx) => replacements[`primary_hierarchy${idx}`] = val);
    [...first_name || []].forEach((val, idx) => replacements[`first_name${idx}`] = val);

    hierarchyIdsArray.forEach((val, idx) => replacements[`hierarchy_ids${idx}`] = val);
    // hierarchies.forEach((val, idx) => replacements[`hierarchy_ids${idx}`] = val);

    console.log("Final replacements:", {
      program_id: replacements.program_id,
      hierarchyIdsArray: replacements.hierarchyIdsArray,
      user_id: replacements.user_id,
      status: replacements.status,
    });

    // Execute the query
    const result = await sequelize.query(query, {
      replacements,
      type: QueryTypes.SELECT,
    }) as JobResult[];

    console.log("Query result count:", result?.length);
    return result;
  }

  async getAllJob(program_id: string, limit: number, offset: number): Promise<JobInterface[]> {
    const query = `
        WITH total_count AS (
          SELECT COUNT(*) AS count
          FROM jobs
          WHERE jobs.program_id = :program_id
          AND jobs.is_deleted = false
        )
        SELECT
          jobs.id,
          jobs.job_id,
          jobs.status,
          jobs.created_by,
          jobs.updated_by,
          jobs.start_date,
          jobs.end_date,
          jobs.no_positions,
          jobs.job_manager_id,
          jobs.created_on,
          jobs.updated_on,
          jobs.rate_configuration,
          jobs.program_id,
          jobs.financial_calculation,
          jobs.max_bill_rate,
          jobs.min_bill_rate,
          jobs.rate_model,
          jobs.budgets,
          jobs.net_budget,
          jobs.unit_of_measure,
          jobs.checklist_entity_id,
          jobs.checklist_version,
          JSON_OBJECT(
            'id', MIN(user.user_id),
            'first_name', MIN(user.first_name),
            'last_name', MIN(user.last_name)
          ) AS jobManager,
          JSON_OBJECT(
            'id', MIN(hierarchies.id),
            'name', MIN(hierarchies.name),
            'parent_hierarchy_id', MIN(hierarchies.parent_hierarchy_id),
            'is_enabled', MIN(hierarchies.is_enabled),
            'code', MIN(hierarchies.code),
            'rate_model', MIN(hierarchies.rate_model),
            'default_time_format', MIN(hierarchies.default_time_format),
            'unit_of_measure', MIN(hierarchies.unit_of_measure),
            'is_vendor_neutral_program' , MIN(hierarchies.is_vendor_neutral_program)
          ) AS primary_hierarchy,
          JSON_OBJECT(
            'id', MIN(labour_category.id),
            'name', MIN(labour_category.name)
          ) AS labor_category,
          JSON_OBJECT(
            'id', MIN(work_locations.id),
            'name', MIN(work_locations.name)
          ) AS work_location,
            JSON_OBJECT(
                    'id', currencies.id,
                    'name', currencies.name,
                    'symbol', currencies.symbol,
                    'code', currencies.code
                ) AS currency,
          JSON_OBJECT(
            'id', MIN(pi.id),
            'label', MIN(pi.label),
            'picklist_id', MIN(pi.picklist_id)
          ) AS job_type,
          JSON_OBJECT(
            'id', MIN(job_templates.id),
            'template_name', MIN(job_templates.template_name),
            'is_shift_rate', MIN(job_templates.is_shift_rate),
            'checklist_entity_id', MIN(job_templates.checklist_entity_id),
            'checklist_version', MIN(job_templates.checklist_version)
          ) AS job_template,
          COALESCE(
            (SELECT JSON_ARRAYAGG(
              JSON_OBJECT(
                'id', h.id,
                'name', h.name
              )
            )
            FROM ${config_db}.hierarchies h
            WHERE JSON_CONTAINS(jobs.hierarchy_ids, JSON_QUOTE(h.id))), JSON_ARRAY()
          ) AS hierarchies,
          (
            SELECT COUNT(*)
            FROM submission_candidate
            WHERE submission_candidate.job_id = jobs.id
            AND submission_candidate.is_deleted = false
          ) AS job_submitted_candidate,
          (SELECT count FROM total_count) AS total_count
        FROM jobs
        LEFT JOIN ${config_db}.user ON jobs.job_manager_id = user.user_id AND user.program_id = :program_id
        LEFT JOIN ${config_db}.labour_category ON jobs.labor_category_id = labour_category.id
        LEFT JOIN ${config_db}.work_locations ON jobs.work_location_id = work_locations.id
        LEFT JOIN ${config_db}.job_templates ON jobs.job_template_id = job_templates.id
        LEFT JOIN ${config_db}.hierarchies ON jobs.primary_hierarchy = hierarchies.id
        LEFT JOIN ${config_db}.currencies ON jobs.currency = currencies.code
        LEFT JOIN ${config_db}.picklistitems pi ON jobs.job_type = pi.id
        WHERE jobs.program_id = :program_id
        AND jobs.is_deleted = false
        GROUP BY jobs.id
        ORDER BY CAST(SUBSTRING_INDEX(jobs.job_id, '-', -1) AS UNSIGNED) DESC,
        jobs.updated_on DESC
        LIMIT :limit OFFSET :offset;
      `;

    const data = await sequelize.query<JobInterface>(query, {
      replacements: {
        program_id,
        limit,
        offset
      },
      type: QueryTypes.SELECT,
    });

    return data;
  }

  async getAllJobWithHierarchies(
    program_id: string,
    hierarchyIdsArray: string[],
    limit: number,
    offset: number,
    isMsp?: any,
    tenantId?: string,
  ): Promise<JobInterface[]> {

    const query = `
      WITH total_count AS (
        SELECT COUNT(*) AS count
        FROM jobs
        WHERE jobs.program_id = :program_id
        AND jobs.is_deleted = false
        AND (
          JSON_LENGTH(:hierarchyIdsArray) = 0 OR -- Handle empty array
          EXISTS (
            SELECT 1
            FROM ${config_db}.hierarchies
            WHERE JSON_CONTAINS(jobs.hierarchy_ids, JSON_QUOTE(CAST(hierarchies.id AS CHAR)))
            AND hierarchies.id IN (SELECT id FROM JSON_TABLE(:hierarchyIdsArray, '$[*]' COLUMNS(id VARCHAR(36) PATH '$')) AS jt)
          )
        )
        ${isMsp ? 'AND (jobs.managed_by IS NULL OR jobs.managed_by != "self-managed")' : ''}
      )
      SELECT DISTINCT
        jobs.id,
        jobs.job_id,
        jobs.status,
        jobs.created_by,
        jobs.updated_by,
        jobs.start_date,
        jobs.end_date,
        jobs.no_positions,
        jobs.job_manager_id,
        jobs.created_on,
        jobs.updated_on,
        jobs.rate_configuration,
        jobs.program_id,
        jobs.financial_calculation,
        jobs.max_bill_rate,
        jobs.min_bill_rate,
        jobs.rate_model,
        jobs.budgets,
        jobs.net_budget,
        jobs.unit_of_measure,
        jobs.checklist_entity_id,
        jobs.checklist_version,
         JSON_OBJECT(
            'id', currencies.id,
             'name', currencies.name,
              'symbol', currencies.symbol,
              'code', currencies.code
        ) AS currency,
        (
          SELECT JSON_OBJECT(
            'id', MIN(user.user_id),
            'first_name', MIN(user.first_name),
            'last_name', MIN(user.last_name)
          )
          FROM ${config_db}.user
          WHERE user.user_id = jobs.job_manager_id AND user.program_id = :program_id
        ) AS jobManager,
        (
          SELECT JSON_OBJECT(
            'id', MIN(hierarchies.id),
            'name', MIN(hierarchies.name),
            'parent_hierarchy_id', MIN(hierarchies.parent_hierarchy_id),
            'is_enabled', MIN(hierarchies.is_enabled),
            'code', MIN(hierarchies.code),
            'rate_model', MIN(hierarchies.rate_model),
            'default_time_format', MIN(hierarchies.default_time_format),
            'unit_of_measure', MIN(hierarchies.unit_of_measure),
            'is_vendor_neutral_program' , MIN(hierarchies.is_vendor_neutral_program)
          )
          FROM ${config_db}.hierarchies
          WHERE hierarchies.id = jobs.primary_hierarchy
        ) AS primary_hierarchy,
        (
          SELECT JSON_OBJECT(
            'id', MIN(labour_category.id),
            'name', MIN(labour_category.name)
          )
          FROM ${config_db}.labour_category
          WHERE labour_category.id = jobs.labor_category_id
        ) AS labor_category,
        (
          SELECT JSON_OBJECT(
            'id', MIN(work_locations.id),
            'name', MIN(work_locations.name)
          )
          FROM ${config_db}.work_locations
          WHERE work_locations.id = jobs.work_location_id
        ) AS work_location,
        (
          SELECT JSON_OBJECT(
            'id', MIN(job_templates.id),
            'template_name', MIN(job_templates.template_name),
            'is_shift_rate', MIN(job_templates.is_shift_rate),
            'checklist_entity_id', MIN(job_templates.checklist_entity_id),
            'checklist_version', MIN(job_templates.checklist_version)
          )
          FROM ${config_db}.job_templates
          WHERE job_templates.id = jobs.job_template_id
        ) AS job_template,
        COALESCE(
          (SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', h.id,
              'name', h.name
            )
          )
          FROM ${config_db}.hierarchies h
          WHERE JSON_CONTAINS(jobs.hierarchy_ids, JSON_QUOTE(h.id))), JSON_ARRAY()
        ) AS hierarchies,
        (
          SELECT COUNT(*)
          FROM submission_candidate
          WHERE submission_candidate.job_id = jobs.id
          AND submission_candidate.is_deleted = false
        ) AS job_submitted_candidate,
        (SELECT count FROM total_count) AS total_count
      FROM jobs
      LEFT JOIN ${config_db}.user ON jobs.job_manager_id = user.user_id
      LEFT JOIN ${config_db}.labour_category ON jobs.labor_category_id = labour_category.id
      LEFT JOIN ${config_db}.work_locations ON jobs.work_location_id = work_locations.id
      LEFT JOIN ${config_db}.job_templates ON jobs.job_template_id = job_templates.id
      LEFT JOIN ${config_db}.hierarchies ON jobs.primary_hierarchy = hierarchies.id
      LEFT JOIN ${config_db}.currencies ON jobs.currency = currencies.code
      WHERE jobs.program_id = :program_id
      AND jobs.is_deleted = false
      AND (
        JSON_LENGTH(:hierarchyIdsArray) = 0 OR
          EXISTS (
            SELECT 1
            FROM ${config_db}.hierarchies
            WHERE JSON_CONTAINS(jobs.hierarchy_ids, JSON_QUOTE(CAST(hierarchies.id AS CHAR)))
            AND hierarchies.id IN (SELECT id FROM JSON_TABLE(:hierarchyIdsArray, '$[*]' COLUMNS(id VARCHAR(36) PATH '$')) AS jt)
            ${tenantId ? 'AND (hierarchies.managed_by = :tenantId OR hierarchies.managed_by IS NULL)' : ''}
          )
      )
      ${isMsp ? 'AND (jobs.managed_by IS NULL OR jobs.managed_by != "self-managed")' : ''}
      GROUP BY jobs.id
      ORDER BY CAST(SUBSTRING_INDEX(jobs.job_id, '-', -1) AS UNSIGNED) DESC,
      jobs.created_on DESC
      LIMIT :limit OFFSET :offset;
    `;

    const replacements: any = {
      program_id,
      hierarchyIdsArray: JSON.stringify(hierarchyIdsArray),
      limit,
      offset
    };

    if (tenantId) {
      replacements.tenantId = tenantId;
    }

    const data = await sequelize.query<JobInterface>(query, {
      replacements,
      type: QueryTypes.SELECT,
    });

    return data;
  }

  async getVendorJobs(program_id: string, vendor_id: string, limit: number, offset: number, isNewRequest: boolean = false): Promise<JobInterface[]> {
    const filteredJobsHaving = isNewRequest
      ? `GROUP BY jobs.id HAVING COUNT(submission_candidate.id) = 0`
      : ``;
    const mainGroupBy = `GROUP BY jobs.id`;
    const query = `
      WITH program_vendor_match AS (
        SELECT id AS tenant_id FROM ${config_db}.program_vendors WHERE tenant_id = :vendor_id AND program_id = :program_id
      ), filtered_jobs AS (
        SELECT jobs.id
        FROM jobs
        INNER JOIN job_distributions ON jobs.id = job_distributions.job_id
        ${isNewRequest ? `LEFT JOIN submission_candidate ON jobs.id = submission_candidate.job_id
        AND submission_candidate.program_id = jobs.program_id
        AND submission_candidate.is_deleted = false` : ``}
        WHERE jobs.program_id = :program_id
        AND job_distributions.vendor_id IN (SELECT tenant_id FROM program_vendor_match)
         ${isNewRequest ? `AND jobs.status IN ('PENDING_APPROVAL_SOURCING', 'SOURCING')` : ``}
        AND (job_distributions.opt_status IS NULL OR job_distributions.opt_status NOT IN ('OPT_OUT'))
        AND job_distributions.status NOT IN ('scheduled')
        AND jobs.is_deleted = false
        ${filteredJobsHaving}
      ), total_count AS (
        SELECT COUNT(*) AS count FROM filtered_jobs
      )
      SELECT
        jobs.id,
        jobs.job_id,
        CASE
          WHEN LOWER(job_distributions.status) = 'halt' THEN 'HALTED'
          WHEN LOWER(job_distributions.status) = 'hold' THEN 'HOLD'
          WHEN jobs.status = 'PENDING_APPROVAL_SOURCING' THEN 'SOURCING'
          ELSE jobs.status
        END AS status,
        CASE
        WHEN MIN(job_distributions.opt_status) = 'OPT_IN' THEN CAST(true AS JSON)
        ELSE CAST(false AS JSON)
        END AS opt_in,
        jobs.created_by,
        jobs.updated_by,
        jobs.start_date,
        jobs.end_date,
        jobs.no_positions,
        jobs.job_manager_id,
        jobs.created_on,
        jobs.updated_on,
        jobs.rate_configuration,
        jobs.program_id,
        jobs.financial_calculation,
        jobs.max_bill_rate,
        jobs.min_bill_rate,
        jobs.rate_model,
        jobs.budgets,
        jobs.net_budget,
        jobs.unit_of_measure,
        jobs.checklist_entity_id,
        jobs.checklist_version,
        JSON_OBJECT(
          'id', MIN(user.user_id),
          'first_name', MIN(user.first_name),
          'last_name', MIN(user.last_name)
        ) AS jobManager,
        JSON_OBJECT(
          'id', MIN(hierarchies.id),
          'name', MIN(hierarchies.name),
          'parent_hierarchy_id', MIN(hierarchies.parent_hierarchy_id),
          'is_enabled', MIN(hierarchies.is_enabled),
          'code', MIN(hierarchies.code),
          'rate_model', MIN(hierarchies.rate_model),
          'default_time_format', MIN(hierarchies.default_time_format),
          'unit_of_measure', MIN(hierarchies.unit_of_measure),
          'is_vendor_neutral_program' , MIN(hierarchies.is_vendor_neutral_program)
        ) AS primary_hierarchy,
        JSON_OBJECT(
          'id', MIN(labour_category.id),
          'name', MIN(labour_category.name)
        ) AS labor_category,
        JSON_OBJECT(
          'id', MIN(work_locations.id),
          'name', MIN(work_locations.name)
        ) AS work_location,
          JSON_OBJECT(
            'id', currencies.id,
            'name', currencies.name,
            'symbol', currencies.symbol,
            'code', currencies.code
        ) AS currency,
        JSON_OBJECT(
          'id', MIN(job_templates.id),
          'template_name', MIN(job_templates.template_name),
          'is_shift_rate', MIN(job_templates.is_shift_rate),
          'checklist_entity_id', MIN(job_templates.checklist_entity_id),
          'checklist_version', MIN(job_templates.checklist_version)
        ) AS job_template,
        COALESCE(
          (SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', h.id,
              'name', h.name
            )
          )
          FROM ${config_db}.hierarchies h
          WHERE JSON_CONTAINS(jobs.hierarchy_ids, JSON_QUOTE(h.id))), JSON_ARRAY()
        ) AS hierarchies,
        (
          SELECT COUNT(*)
          FROM submission_candidate
          WHERE submission_candidate.job_id = jobs.id
          AND submission_candidate.is_deleted = false
        ) AS job_submitted_candidate,
        (SELECT count FROM total_count) AS total_count
      FROM jobs
      INNER JOIN job_distributions ON jobs.id = job_distributions.job_id
      LEFT JOIN ${config_db}.user ON jobs.job_manager_id = user.user_id AND user.program_id = :program_id
      LEFT JOIN ${config_db}.labour_category ON jobs.labor_category_id = labour_category.id
      LEFT JOIN ${config_db}.work_locations ON jobs.work_location_id = work_locations.id
      LEFT JOIN ${config_db}.job_templates ON jobs.job_template_id = job_templates.id
      LEFT JOIN ${config_db}.hierarchies ON jobs.primary_hierarchy = hierarchies.id
      LEFT JOIN ${config_db}.currencies ON jobs.currency = currencies.code
      WHERE jobs.program_id = :program_id
      AND job_distributions.vendor_id IN (SELECT tenant_id FROM program_vendor_match)
      AND jobs.id IN (SELECT id FROM filtered_jobs)
      ${mainGroupBy}
      ORDER BY CAST(SUBSTRING_INDEX(jobs.job_id, '-', -1) AS UNSIGNED) DESC, jobs.created_on DESC
      LIMIT :limit OFFSET :offset;
    `;

    const data = await sequelize.query<JobInterface>(query, {
      replacements: {
        program_id,
        vendor_id,
        limit,
        offset,
        isNewRequest
      },
      type: QueryTypes.SELECT,
    });

    return data;
  }



  async programQuery(program_id: string): Promise<{ name: string }[]> {
    const query = `
                SELECT
                    programs.name
                FROM ${config_db}.programs
                WHERE programs.id = :program_id;
            `;

    const data = await sequelize.query<{ name: string }>(query, {
      replacements: { program_id },
      type: QueryTypes.SELECT,
    });

    return data;
  }

  async getJobCounts(
    user_id: string,
    program_id: string,
    job_id: string,
    isVendorUser: boolean,
    vendor_id: string | null,
    candidate_id: string | undefined,
    workflow_trigger_id?: string,
    module_name?: string
  ) {
    // Increase max length for GROUP_CONCAT to avoid truncation
    await sequelize.query('SET SESSION group_concat_max_len = 1000000;');
    console.log("module_name is ", module_name);

    const query = `
    WITH ProgramVendor AS (
      SELECT id
      FROM ${config_db}.program_vendors
      WHERE tenant_id = :vendor_id AND program_id = :program_id
    ),
    AvailableCandidates AS (
      WITH allow_flag AS (
        SELECT allow_per_identified_s
        FROM jobs
        WHERE id = :job_id
        LIMIT 1
      )
      SELECT
        COUNT(DISTINCT c.id) AS availableCandidateCount,
        CASE WHEN COUNT(DISTINCT c.id) > 0 THEN TRUE ELSE FALSE END AS availableCandidateCondition
      FROM allow_flag,
      (
        SELECT DISTINCT c.id
        FROM ${config_db}.candidates AS c
        JOIN ProgramVendor pv ON c.vendor_id = pv.id
        WHERE c.program_id = :program_id
          AND c.is_deleted = 0
          AND c.is_active = 1
          AND NOT EXISTS (
            SELECT 1
            FROM submission_candidate AS sub
            WHERE sub.job_id = :job_id
              AND sub.candidate_id = c.id
              AND sub.program_id = :program_id
          )
          AND (
            (SELECT allow_per_identified_s FROM allow_flag) = 0
            OR (
              (SELECT allow_per_identified_s FROM allow_flag) = 1
              AND EXISTS (
                SELECT 1
                FROM job_candidate jc
                WHERE jc.job_id = :job_id
                  AND jc.candidate_id = c.id
              )
            )
          )
      ) c
    ),
    SubmittedCandidates AS (
      SELECT
        sc.id AS submission_id,
        COUNT(sc.id) AS submittedCandidateCount,
        CONCAT(
          '[',
          GROUP_CONCAT(
            JSON_OBJECT(
              'id', sc.id,
              'status', sc.status
            ) SEPARATOR ','
          ),
          ']'
        ) AS submittedCandidatesJson,
        CASE
          WHEN COUNT(sc.id) = 0 THEN 'pending'
          WHEN COUNT(sc.id) = SUM(CASE
              WHEN UPPER(sc.status) IN (
                'OFFER PENDING ACCEPTANCE', 'OFFER ACCEPTED', 'OFFER WITHDRAWN',
                'OFFER REJECTED', 'OFFER PENDING REVIEW', 'OFFER PENDING APPROVAL'
              ) THEN 1 ELSE 0
            END) THEN 'completed'
          ELSE 'in-progress'
        END AS submittedCandidateCondition
      FROM submission_candidate AS sc
      LEFT JOIN ${config_db}.program_vendors AS pv ON pv.id = sc.vendor_id
      WHERE sc.job_id = :job_id
        AND sc.program_id = :program_id
        ${isVendorUser ? `AND pv.tenant_id = :vendor_id` : ''}
        ${candidate_id ? `AND sc.candidate_id = :candidate_id` : ''}
    ),
    InterviewCandidates AS (
      SELECT
        COUNT(DISTINCT CONCAT(i.submit_candidate_id, '-', i.job_id)) AS interviewCandidateCount,
        CASE
          WHEN COUNT(i.submit_candidate_id) = 0 THEN 'pending'
          WHEN COUNT(i.submit_candidate_id) = SUM(CASE
              WHEN UPPER(i.status) = 'COMPLETED'
              OR EXISTS (
                SELECT 1
                FROM offers AS o
                WHERE o.job_id = :job_id
                  AND o.program_id = :program_id
                  AND o.candidate_id = i.submit_candidate_id
                  AND UPPER(o.status) NOT IN ('WITHDRAWN', 'REJECTED')
              ) THEN 1 ELSE 0
            END) THEN 'completed'
          ELSE 'in-progress'
        END AS interviewCandidateCondition
      FROM interviews AS i
      LEFT JOIN ${config_db}.program_vendors AS pv ON pv.id = i.vendor_id
      WHERE i.program_id = :program_id
        AND i.job_id = :job_id
        ${isVendorUser ? `AND pv.tenant_id = :vendor_id` : ''}
        ${candidate_id ? `AND i.submit_candidate_id = :candidate_id` : ''}
    ),
    OfferCandidates AS (
      SELECT
        o.id AS offer_id,
        COUNT(o.id) AS offerCandidateCount,
        CASE
          WHEN COUNT(o.id) = 0 THEN 'pending'
          WHEN COUNT(o.id) = SUM(CASE
              WHEN UPPER(o.status) NOT IN ('COUNTER OFFER','CLOSED')
                AND UPPER(o.status) IN ('ACCEPTED', 'WITHDRAW', 'REJECTED')
              THEN 1 ELSE 0
            END) THEN 'completed'
          ELSE 'in-progress'
        END AS offerCandidateCondition
      FROM offers AS o
      LEFT JOIN ${config_db}.program_vendors AS pv ON pv.id = o.vendor_id
      WHERE o.program_id = :program_id
        AND o.job_id = :job_id
        AND UPPER(o.status) NOT IN ('COUNTER OFFER','CLOSED')
        ${isVendorUser ? `
          AND pv.tenant_id = :vendor_id
          AND (
            UPPER(o.status) NOT IN ('PENDING REVIEW', 'PENDING APPROVAL')
            OR o.parent_offer_id IS NOT NULL
          )
        ` : ''}
        ${candidate_id ? `AND o.candidate_id = :candidate_id` : ''}
    ),
    ActiveWorkflowConfigs AS (
      SELECT
        COUNT(wc.id) AS activeWorkflowConfigCount,
        CASE
          WHEN COUNT(wc.id) = 0 THEN 'pending'
          WHEN COUNT(wc.id) = SUM(CASE WHEN UPPER(wc.status) = 'COMPLETED' THEN 1 ELSE 0 END)
          THEN 'completed'
          ELSE 'in-progress'
        END AS activeWorkflowConfigCondition
      FROM ${config_db}.workflow AS wc
      ${candidate_id && module_name?.toLowerCase() === 'submission' ? `JOIN SubmittedCandidates st ON st.submission_id = wc.workflow_trigger_id` : ''}
      ${candidate_id && module_name?.toLowerCase() === 'offer' ? `JOIN OfferCandidates ofr ON ofr.offer_id = wc.workflow_trigger_id` : ''}
      WHERE wc.program_id = :program_id
        AND wc.job_id = :job_id
        ${module_name?.toLowerCase() === 'job' ? `AND wc.workflow_trigger_id = :job_id` : ''}
        AND wc.is_enabled = 1
        AND wc.is_deleted = 0
    ),
    JobDistributionCheck AS (
      SELECT COUNT(*) AS jobDistributionCount
      FROM job_distributions
      WHERE job_id = :job_id
        AND program_id = :program_id
    ),
    JobStatusCheck AS (
      SELECT
      CASE
        WHEN LOWER(status) = 'draft' THEN FALSE
        ELSE TRUE
      END AS job_history
      FROM jobs
      WHERE id = :job_id
      LIMIT 1
    )

    SELECT
      sc.submittedCandidateCount,
      sc.submittedCandidatesJson,
      ac.availableCandidateCount,
      ic.interviewCandidateCount,
      oc.offerCandidateCount,
      awc.activeWorkflowConfigCount,
      sc.submittedCandidateCondition,
      ac.availableCandidateCondition,
      ic.interviewCandidateCondition,
      oc.offerCandidateCondition,
      awc.activeWorkflowConfigCondition,
      jdc.jobDistributionCount,
      jsc.job_history
    FROM SubmittedCandidates sc
    CROSS JOIN AvailableCandidates ac
    CROSS JOIN InterviewCandidates ic
    CROSS JOIN OfferCandidates oc
    CROSS JOIN ActiveWorkflowConfigs awc
    CROSS JOIN JobDistributionCheck jdc
    CROSS JOIN JobStatusCheck jsc;
  `;

    const replacements = {
      user_id,
      job_id,
      program_id,
      vendor_id: isVendorUser ? vendor_id : null,
      candidate_id,
      workflow_trigger_id,
    };

    const [result] = await sequelize.query<{
      submittedCandidateCount: number;
      submittedCandidatesJson: string;
      availableCandidateCount: number;
      interviewCandidateCount: number;
      offerCandidateCount: number;
      activeWorkflowConfigCount: number;
      submittedCandidateCondition: string;
      availableCandidateCondition: boolean;
      interviewCandidateCondition: string;
      offerCandidateCondition: string;
      activeWorkflowConfigCondition: string;
      jobDistributionCount: number;
      job_history: boolean;
    }>(query, { replacements, type: QueryTypes.SELECT });

    // Safely parse JSON string to array
    if (result?.submittedCandidatesJson) {
      try {
        (result as any).submittedCandidates = JSON.parse(result.submittedCandidatesJson);
      } catch {
        (result as any).submittedCandidates = [];
      }
    }

    return result || {};
  }

  async getJobPendingCountWithHierarchies(
    program_id: string,
    hierarchyIdsArray: string[]
  ): Promise<{ job_pending_approval_count: number }> {

    const query = `
    SELECT
      COUNT(*) AS job_pending_approval_count
    FROM jobs
    WHERE program_id = :program_id
      AND status="PENDING_APPROVAL"
      AND is_deleted = false
      AND (
        JSON_LENGTH(:hierarchyIdsArray) = 0 OR
        EXISTS (
          SELECT 1
           FROM ${config_db}.hierarchies
          WHERE JSON_CONTAINS(jobs.hierarchy_ids, JSON_QUOTE(CAST(hierarchies.id AS CHAR)))
          AND hierarchies.id IN (SELECT id FROM JSON_TABLE(:hierarchyIdsArray, '$[*]' COLUMNS(id VARCHAR(36) PATH '$')) AS jt)
        )
      );
  `;

    const [result] = await sequelize.query<{ job_pending_approval_count: number }>(query, {
      replacements: {
        program_id,
        hierarchyIdsArray: JSON.stringify(hierarchyIdsArray)
      },
      type: QueryTypes.SELECT,
    });

    return {
      job_pending_approval_count: result?.job_pending_approval_count ?? 0,
    };
  }

  async getVendorJobPendingCount(
    program_id: string,
    vendor_id: string | undefined,
  ): Promise<{ job_pending_approval_count: number; job_count: number }> {

    const query = `
    SELECT
      COUNT(*) AS job_pending_approval_count,
      (SELECT COUNT(jobs.id)
       FROM jobs
       INNER JOIN job_distributions ON jobs.id = job_distributions.job_id
       WHERE jobs.program_id = :program_id
       AND job_distributions.vendor_id = :vendor_id
       AND (job_distributions.opt_status IS NULL OR job_distributions.opt_status NOT IN ('OPT_OUT'))
       AND jobs.is_deleted = false) AS job_count
    FROM jobs
    WHERE program_id = :program_id
    AND status="PENDING_APPROVAL"
    AND is_deleted = false;
  `;

    const [result] = await sequelize.query<{
      job_pending_approval_count: number;
      job_count: number;
    }>(query, {
      replacements: { program_id, vendor_id },
      type: QueryTypes.SELECT,
    });

    return {
      job_pending_approval_count: result?.job_pending_approval_count ?? 0,
      job_count: result?.job_count ?? 0,
    };
  }

  async getSuperUserJobPendingCount(program_id: string): Promise<{ job_pending_approval_count: number }> {

    const query = `
    SELECT
    COUNT(*) AS job_pending_approval_count
    FROM jobs
    WHERE program_id = :program_id
    AND status = 'PENDING_APPROVAL'
    AND is_deleted = false;
  `;

    const [result] = await sequelize.query<{ job_pending_approval_count: number }>(query, {
      replacements: { program_id },
      type: QueryTypes.SELECT,
    });

    return {
      job_pending_approval_count: result?.job_pending_approval_count ?? 0,
    };
  }

  async getSuperUserJobPendingCountReview(program_id: string): Promise<{ job_pending_review_count: number }> {
    const query = `
    SELECT COUNT(*) AS job_pending_review_count
    FROM jobs
    WHERE program_id = :program_id
      AND status = 'PENDING_REVIEW'
      AND is_deleted = false;
  `;
    const [result] = await sequelize.query<{ job_pending_review_count: number }>(query, {
      replacements: { program_id },
      type: QueryTypes.SELECT,
    });
    return {
      job_pending_review_count: result?.job_pending_review_count ?? 0,
    };
  }

  async getJobPendingCountWithHierarchiesReview(
    program_id: string,
    user_id: string,
    hierarchyIdsArray: string[]
  ): Promise<{
    job_pending_approval_count: number;
    job_pending_review_count: number;
    jobs_to_distribute_count: number;
    job_pending_approval_sourcing_count: number;
  }> {
    // const query = `
    //   SELECT
    //     SUM(CASE WHEN status = 'PENDING_REVIEW' THEN 1 ELSE 0 END) AS job_pending_review_count,
    //     SUM(CASE WHEN status IN ('OPEN', 'PENDING_APPROVAL') THEN 1 ELSE 0 END) AS jobs_to_distribute_count
    //   FROM jobs
    //   WHERE program_id = :program_id
    //     AND is_deleted = false
    //     AND (
    //       JSON_LENGTH(:hierarchyIdsArray) = 0 OR
    //       EXISTS (
    //         SELECT 1
    //         FROM ${config_db}.hierarchies
    //         WHERE JSON_CONTAINS(jobs.hierarchy_ids, JSON_QUOTE(CAST(hierarchies.id AS CHAR)))
    //           AND hierarchies.id IN (
    //             SELECT id
    //             FROM JSON_TABLE(:hierarchyIdsArray, '$[*]' COLUMNS(id VARCHAR(36) PATH '$')) AS jt
    //           )
    //       )
    //     );
    // `;
    const query = `
        WITH level_recipients AS (
                        SELECT
                          j.id AS job_id,
                          j.status AS job_status,
                          CAST(JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.placement_order')) AS UNSIGNED) AS placement_order,
                          JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.status')) AS level_status,
                          JSON_UNQUOTE(JSON_EXTRACT(recipient.recipient_json, '$.status')) AS recipient_status,
                          recipient.recipient_json AS recipient_json
                        FROM jobs j
                        JOIN ${config_db}.workflow vm
                          ON j.id = vm.workflow_trigger_id,
                        JSON_TABLE(vm.levels, '$[*]' COLUMNS (
                          level_json JSON PATH '$'
                        )) AS level,
                        JSON_TABLE(level.level_json, '$.recipient_types[*]' COLUMNS (
                          recipient_json JSON PATH '$'
                        )) AS recipient
                        WHERE j.program_id = :program_id
                          AND j.is_deleted = 0
                        ),
                        matching_levels AS (
                        SELECT
                          job_id,
                          placement_order
                        FROM level_recipients
                        WHERE level_status = 'pending'
                          AND recipient_status = 'pending'
                          AND JSON_SEARCH(JSON_EXTRACT(recipient_json, '$.meta_data'), 'one', :user_id) IS NOT NULL
                        GROUP BY job_id, placement_order
                        ),
                        all_levels AS (
                        SELECT
                          j.id AS job_id,
                          CAST(JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.placement_order')) AS UNSIGNED) AS placement_order,
                          JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.status')) AS level_status,
                          JSON_LENGTH(JSON_EXTRACT(level.level_json, '$.recipient_types')) AS recipient_count
                        FROM jobs j
                        JOIN ${config_db}.workflow vm
                          ON j.id = vm.workflow_trigger_id,
                        JSON_TABLE(vm.levels, '$[*]' COLUMNS (
                          level_json JSON PATH '$'
                        )) AS level
                        WHERE j.program_id = :program_id
                          AND j.is_deleted = 0
                        ),
                        valid_levels AS (
                        SELECT ml.job_id, ml.placement_order
                        FROM matching_levels ml
                        WHERE NOT EXISTS (
                          SELECT 1
                          FROM all_levels prior
                          WHERE prior.job_id = ml.job_id
                            AND prior.placement_order < ml.placement_order
                            AND (
                            (prior.recipient_count > 0 AND prior.level_status NOT IN ('completed', 'bypassed'))
                            )
                        )
                        )
                        SELECT
                        COUNT(DISTINCT CASE
                          WHEN j.status = 'PENDING_APPROVAL'
                            AND j.id IN (SELECT job_id FROM valid_levels)
                          THEN j.id
                        END) AS job_pending_approval_count,

                        COUNT(DISTINCT CASE
                          WHEN j.status = 'PENDING_REVIEW'
                            AND j.id IN (SELECT job_id FROM valid_levels)
                          THEN j.id
                        END) AS job_pending_review_count,

                        COUNT(DISTINCT CASE
                        WHEN j.status = 'OPEN'
                        OR (j.status = 'PENDING_APPROVAL' AND j.id IN (SELECT job_id FROM valid_levels))
                        THEN j.id
                        END) AS jobs_to_distribute_count,

                        COUNT(DISTINCT CASE
                          WHEN j.status = 'PENDING_APPROVAL_SOURCING'
                            AND j.id IN (SELECT job_id FROM valid_levels)
                          THEN j.id
                        END) AS job_pending_approval_sourcing_count

                        FROM jobs j
                        WHERE j.program_id = :program_id
                        AND j.is_deleted = 0
                        AND EXISTS (
                          SELECT 1
                          FROM ${config_db}.hierarchies h
                          WHERE JSON_CONTAINS(j.hierarchy_ids, JSON_QUOTE(CAST(h.id AS CHAR)))
                            AND h.id IN (:hierarchyIdsArray)
                        );
                `;
    const [result] = await sequelize.query<{
      job_pending_approval_count: number;
      job_pending_review_count: number;
      jobs_to_distribute_count: number;
      job_pending_approval_sourcing_count: number;
    }>(query, {
      replacements: {
        program_id,
        user_id,
        hierarchyIdsArray
      },
      type: QueryTypes.SELECT,
    });

    return {
      job_pending_approval_count: result?.job_pending_approval_count ?? 0,
      job_pending_review_count: result?.job_pending_review_count ?? 0,
      jobs_to_distribute_count: result?.jobs_to_distribute_count ?? 0,
      job_pending_approval_sourcing_count: result?.job_pending_approval_sourcing_count ?? 0,
    };
  }


  async getVendorJobPendingCountReview(
    program_id: string,
    vendor_id: string | undefined,
  ): Promise<{ job_pending_review_count: number; job_count: number }> {

    const query = `
    SELECT
      COUNT(*) AS job_pending_review_count,
      (SELECT COUNT(jobs.id)
       FROM jobs
       INNER JOIN job_distributions ON jobs.id = job_distributions.job_id
       WHERE jobs.program_id = :program_id
       AND job_distributions.vendor_id = :vendor_id
       AND (job_distributions.opt_status IS NULL OR job_distributions.opt_status NOT IN ('OPT_OUT'))
       AND jobs.is_deleted = false) AS job_count
    FROM jobs
    WHERE program_id = :program_id
    AND status = 'PENDING_REVIEW'
    AND is_deleted = false;
  `;

    const [result] = await sequelize.query<{
      job_pending_review_count: number;
      job_count: number;
    }>(query, {
      replacements: { program_id, vendor_id },
      type: QueryTypes.SELECT,
    });

    return {
      job_pending_review_count: result?.job_pending_review_count ?? 0,
      job_count: result?.job_count ?? 0,
    };
  }

  async findUser(program_id: string, userId: any): Promise<any> {
    const userHierarchyData = await sequelize.query(
      `   SELECT
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
        replacements: { user_id: userId, program_id: program_id },
        type: QueryTypes.SELECT,
      }
    ) as any[];
    return userHierarchyData;
  }

  async getJobIdsWithHierarchies(
    program_id: string,
    hierarchyIdsArray: string[],
    isMsp?: any
  ): Promise<string[]> {
    const query = `
          SELECT id
          FROM jobs
          WHERE jobs.program_id = :program_id
          AND jobs.is_deleted = false
          AND (
            JSON_LENGTH(:hierarchyIdsArray) = 0 OR -- Handle empty array
            EXISTS (
              SELECT 1
              FROM ${config_db}.hierarchies
              WHERE JSON_CONTAINS(jobs.hierarchy_ids, JSON_QUOTE(CAST(hierarchies.id AS CHAR)))
              AND hierarchies.id IN (SELECT id FROM JSON_TABLE(:hierarchyIdsArray, '$[*]' COLUMNS(id VARCHAR(36) PATH '$')) AS jt)
            )
          )
          ${isMsp ? 'AND (jobs.managed_by IS NULL OR jobs.managed_by != "self-managed")' : ''}
        `;

    const data = await sequelize.query<{ id: string }>(query, {
      replacements: {
        program_id,
        hierarchyIdsArray: JSON.stringify(hierarchyIdsArray),
      },
      type: QueryTypes.SELECT,
    });
    return data.map(({ id }) => id);
  }

  async getAllJobIds(program_id: string): Promise<string[]> {
    const query = `
        SELECT j.id
        FROM jobs j
        WHERE j.program_id = :program_id
        AND j.is_deleted = false
        ORDER BY j.created_on DESC
    `;

    const data = await sequelize.query<{ id: string }>(query, {
      replacements: { program_id },
      type: QueryTypes.SELECT,
    });

    return data.map(({ id }) => id);
  }

  async getAllJobIdsBasedOnHierarchies(program_id: string, tenant_id: any): Promise<string[]> {
    const query = `
        SELECT h.id
        FROM ${config_db}.hierarchies h
        WHERE h.program_id = :program_id
        AND h.managed_by = :tenant_id
        AND h.is_deleted = false
    `;

    const data = await sequelize.query<{ id: string }>(query, {
      replacements: { program_id, tenant_id },
      type: QueryTypes.SELECT,
    });

    return data.map(({ id }) => id);
  }

  async getVendorJobIds(userData: { program_id: string; userId: string; isOptOut: boolean }): Promise<string[]> {
    const { program_id, userId, isOptOut } = userData;
    const query = `
      WITH VendorProgram AS (
        SELECT id
        FROM ${config_db}.program_vendors
        WHERE user_id = :user_id
        AND program_id = :program_id
        LIMIT 1
      )
      SELECT jobs.id
        FROM jobs
        INNER JOIN job_distributions ON jobs.id = job_distributions.job_id
        LEFT JOIN submission_candidate ON jobs.id = submission_candidate.job_id
          AND submission_candidate.program_id = jobs.program_id
          AND submission_candidate.is_deleted = false
        WHERE jobs.program_id = :program_id
        AND job_distributions.vendor_id IN (SELECT id FROM VendorProgram)
        ${!isOptOut ? "AND (job_distributions.opt_status IS NULL OR job_distributions.opt_status NOT IN ('OPT_OUT'))" : ""}
        AND job_distributions.status NOT IN ('scheduled')
        AND jobs.is_deleted = false
    `;

    const data = await sequelize.query<{ id: string }>(query, {
      replacements: {
        program_id,
        user_id: userId
      },
      type: QueryTypes.SELECT,
    });

    return data.map(({ id }) => id);
  }

  async getJobCountWithHierarchies(
    program_id: string,
    hierarchyIdsArray: string[],
    userId: string,
    isMsp: boolean
  ): Promise<{ active_jobs_count: number; current_openings_count: number; contract_ending_count: number }> {
    const mspClause = isMsp ? 'AND (jobs.managed_by IS NULL OR jobs.managed_by != "self-managed")' : '';
    const query = `
      WITH level_recipients AS (
        SELECT j.id AS job_id,
          j.status AS job_status,
          CAST(JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.placement_order')) AS UNSIGNED) AS placement_order,
          JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.status')) AS level_status,
          JSON_UNQUOTE(JSON_EXTRACT(recipient.recipient_json, '$.status')) AS recipient_status,
          recipient.recipient_json AS recipient_json
        FROM jobs j
        JOIN ${config_db}.workflow vm ON j.id = vm.workflow_trigger_id,
        JSON_TABLE(vm.levels, '$[*]' COLUMNS (level_json JSON PATH '$')) AS level,
        JSON_TABLE(level.level_json, '$.recipient_types[*]' COLUMNS (recipient_json JSON PATH '$')) AS recipient
        WHERE j.program_id = :program_id AND j.is_deleted = 0
      ),
      matching_levels AS (
        SELECT job_id, placement_order
        FROM level_recipients
        WHERE level_status = 'pending'
          AND recipient_status = 'pending'
          AND JSON_SEARCH(JSON_EXTRACT(recipient_json, '$.meta_data'), 'one', :user_id) IS NOT NULL
        GROUP BY job_id, placement_order
      ),
      all_levels AS (
        SELECT j.id AS job_id,
          CAST(JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.placement_order')) AS UNSIGNED) AS placement_order,
          JSON_UNQUOTE(JSON_EXTRACT(level.level_json, '$.status')) AS level_status,
          JSON_LENGTH(JSON_EXTRACT(level.level_json, '$.recipient_types')) AS recipient_count
        FROM jobs j
        JOIN ${config_db}.workflow vm ON j.id = vm.workflow_trigger_id,
        JSON_TABLE(vm.levels, '$[*]' COLUMNS (level_json JSON PATH '$')) AS level
        WHERE j.program_id = :program_id AND j.is_deleted = 0
      ),
      valid_levels AS (
        SELECT ml.job_id
        FROM matching_levels ml
        WHERE NOT EXISTS (
          SELECT 1
          FROM all_levels prior
          WHERE prior.job_id = ml.job_id
            AND prior.placement_order < ml.placement_order
            AND (prior.recipient_count > 0 AND prior.level_status NOT IN ('completed', 'bypassed'))
        )
      )

      SELECT
        SUM(
          CASE
            WHEN (
              UPPER(jobs.status) IN ('SOURCING', 'OPEN') OR
              (UPPER(jobs.status) = 'PENDING_APPROVAL_SOURCING' AND jobs.id IN (SELECT job_id FROM valid_levels))
            )
            THEN 1 ELSE 0
          END
        ) AS active_jobs_count,

        SUM(CASE
          WHEN UPPER(jobs.status) = 'SOURCING' THEN 1 ELSE 0
        END) AS current_openings_count,

        SUM(CASE
          WHEN jobs.end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
          THEN 1 ELSE 0
        END) AS contract_ending_count

      FROM jobs
      WHERE jobs.program_id = :program_id
        AND jobs.is_deleted = false
        ${mspClause}
        AND (
          JSON_LENGTH(:hierarchyIdsArray) = 0 OR
          EXISTS (
            SELECT 1
            FROM ${config_db}.hierarchies
            WHERE JSON_CONTAINS(jobs.hierarchy_ids, JSON_QUOTE(CAST(hierarchies.id AS CHAR)))
              AND hierarchies.id IN (
                SELECT id
                FROM JSON_TABLE(:hierarchyIdsArray, '$[*]' COLUMNS(id VARCHAR(36) PATH '$')) AS jt
              )
          )
        )`;

    const [result] = await sequelize.query<{ active_jobs_count: number; current_openings_count: number; contract_ending_count: number }>(query, {
      replacements: {
        program_id,
        hierarchyIdsArray: JSON.stringify(hierarchyIdsArray),
        user_id: userId
      },
      type: QueryTypes.SELECT,
    });

    return {
      active_jobs_count: result?.active_jobs_count ?? 0,
      current_openings_count: result?.current_openings_count ?? 0,
      contract_ending_count: result?.contract_ending_count ?? 0,
    };
  }

  async getVendorJobCount(
    program_id: string,
    vendor_id: string
  ): Promise<{ active_jobs_count: number; current_openings_count: number; contract_ending_count: number; job_count: number }> {
    const query = `
    SELECT
        COUNT(*) AS job_count,
        SUM(CASE
            WHEN UPPER(j.status) IN ('PENDING_APPROVAL_SOURCING', 'SOURCING') THEN 1 ELSE 0 END
        ) AS active_jobs_count,
        SUM(CASE
            WHEN UPPER(j.status) = 'SOURCING' THEN 1 ELSE 0 END
        ) AS current_openings_count,
        SUM(CASE
            WHEN j.end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END
        ) AS contract_ending_count
    FROM jobs j
    JOIN job_distributions jd ON j.id = jd.job_id
    WHERE j.program_id = :program_id
    AND j.is_deleted = false
    AND jd.vendor_id = :vendor_id
    AND (jd.opt_status IS NULL OR jd.opt_status NOT IN ('OPT_OUT'))
    AND jd.status NOT IN ('scheduled')
    `;

    const [result] = await sequelize.query<{
      active_jobs_count: number;
      current_openings_count: number;
      contract_ending_count: number;
      job_count: number;
    }>(query, {
      replacements: { program_id, vendor_id },
      type: QueryTypes.SELECT,
    });

    return {
      active_jobs_count: result?.active_jobs_count ?? 0,
      current_openings_count: result?.current_openings_count ?? 0,
      contract_ending_count: result?.contract_ending_count ?? 0,
      job_count: result?.job_count ?? 0,
    };
  }


  async getSuperUserJobCount(program_id: string): Promise<{ active_jobs_count: number; current_openings_count: number; contract_ending_count: number }> {
    const query = `
    SELECT
      SUM(CASE
        WHEN UPPER(status) IN ('PENDING_APPROVAL_SOURCING', 'SOURCING', 'OPEN') THEN 1 ELSE 0
      END) AS active_jobs_count,
      SUM(CASE
        WHEN UPPER(status) = 'SOURCING' THEN 1 ELSE 0
      END) AS current_openings_count,
      SUM(CASE
        WHEN end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0
      END) AS contract_ending_count
    FROM jobs
    WHERE program_id = :program_id
      AND is_deleted = false
  `;

    const [result] = await sequelize.query<{ active_jobs_count: number; current_openings_count: number; contract_ending_count: number }>(query, {
      replacements: { program_id },
      type: QueryTypes.SELECT,
    });

    return {
      active_jobs_count: result?.active_jobs_count ?? 0,
      current_openings_count: result?.current_openings_count ?? 0,
      contract_ending_count: result?.contract_ending_count ?? 0,
    };
  }


  async updateWorkflowAssociation(program_id: string, workflow_id: string) {
    try {
      const payload = {
        program_id,
        workflow_id,
        is_associated: true,
      };

      const response = await axios.put(
        `${CONFIG_URL}/v1/api/program/${program_id}/workflow/${workflow_id}`,
        payload
      );

      if (response.status === 200) {
        return { message: "Workflow association updated successfully" };
      }
    } catch (error) {
      throw new Error("Failed to update workflow association");
    }
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

  async countVendorJobs(program_id: string, vendor_id: string): Promise<any> {
    const query = `
      SELECT
          COUNT(*) AS total_count
      FROM (
          SELECT
              jobs.id
          FROM
              jobs
          LEFT JOIN
              submission_candidate ON jobs.id = submission_candidate.job_id
                  AND submission_candidate.program_id = jobs.program_id
          LEFT JOIN
              job_distributions ON jobs.id = job_distributions.job_id
          WHERE
              jobs.program_id = :program_id
              AND job_distributions.vendor_id = :vendor_id
              AND jobs.status IN ('PENDING_APPROVAL_SOURCING', 'SOURCING')
              AND jobs.is_deleted = FALSE
              AND (job_distributions.opt_status IS NULL OR job_distributions.opt_status NOT IN ('OPT_OUT'))
          GROUP BY
              jobs.id, jobs.program_id, jobs.status
          HAVING
              COUNT(submission_candidate.id) = 0
      ) AS subquery
      LIMIT 0, 1000;
  `;

    const [result] = await sequelize.query(query, {
      replacements: { program_id, vendor_id },
      type: QueryTypes.SELECT,
    });
    const { total_count } = result as { total_count: number };
    return total_count || 0;
  }

  async GetJobCount(program_id: string): Promise<any> {
    const query = `
      SELECT
          COUNT(*) AS total_count
      FROM (
          SELECT
              jobs.id
          FROM
              jobs
          LEFT JOIN
              submission_candidate ON jobs.id = submission_candidate.job_id
                  AND submission_candidate.program_id = jobs.program_id
          LEFT JOIN
              job_distributions ON jobs.id = job_distributions.job_id
          WHERE
              jobs.program_id = :program_id
              AND jobs.status IN ('PENDING_APPROVAL_SOURCING', 'SOURCING')
              AND jobs.is_deleted = FALSE
              AND (job_distributions.opt_status IS NULL OR job_distributions.opt_status NOT IN ('OPT_OUT'))
          GROUP BY
              jobs.id, jobs.program_id, jobs.status
          HAVING
              COUNT(submission_candidate.id) = 0
      ) AS subquery
      LIMIT 0, 1000;
  `;

    const [result] = await sequelize.query(query, {
      replacements: { program_id },
      type: QueryTypes.SELECT,
    });
    const { total_count } = result as { total_count: number };
    return total_count || 0;

  }

  async countClientJobs(program_id: string, hierarchyIdsArray: string[]): Promise<any> {
    const query = `
        SELECT
            COUNT(*) AS total_count
        FROM (
            SELECT
                jobs.id
            FROM
                jobs
            LEFT JOIN
                submission_candidate ON jobs.id = submission_candidate.job_id
                    AND submission_candidate.program_id = jobs.program_id
            LEFT JOIN
                job_distributions ON jobs.id = job_distributions.job_id
            WHERE
                jobs.program_id = :program_id
                AND jobs.status IN ('PENDING_APPROVAL_SOURCING', 'SOURCING')
                AND jobs.is_deleted = FALSE
                AND (job_distributions.opt_status IS NULL OR job_distributions.opt_status NOT IN ('OPT_OUT'))
                AND (
                    JSON_LENGTH(:hierarchyIdsArray) = 0 OR
                    EXISTS (
                        SELECT 1
                        FROM ${config_db}.hierarchies
                        WHERE JSON_CONTAINS(jobs.hierarchy_ids, JSON_QUOTE(CAST(hierarchies.id AS CHAR)))
                        AND hierarchies.id IN (
                            SELECT id FROM JSON_TABLE(:hierarchyIdsArray, '$[*]' COLUMNS(id VARCHAR(36) PATH '$'))
                            AS jt
                        )
                    )
                )
            GROUP BY
                jobs.id, jobs.program_id, jobs.status
            HAVING
                COUNT(submission_candidate.id) = 0
        ) AS subquery
        LIMIT 0, 1000;
    `;

    const [result] = await sequelize.query(query, {
      replacements: {
        program_id,
        hierarchyIdsArray: JSON.stringify(hierarchyIdsArray),
      },
      type: QueryTypes.SELECT,
    });

    return (result as { total_count: number })?.total_count || 0;
  }


  async getVendorIsJobAutoOptIn(programId: string, vendorId: string): Promise<any> {
    const query = `
      SELECT
          jobs.id,
          pv.is_job_auto_opt_in,
          CASE
              WHEN pv.is_job_auto_opt_in = 1 THEN 'OPT_IN'
              ELSE 'OPT_OUT'
          END AS opt_status
      FROM jobs
      LEFT JOIN job_candidate jc ON jobs.id = jc.job_id
      LEFT JOIN ${config_db}.program_vendors pv ON jc.vendor = pv.id
      WHERE jobs.program_id =:program_id
      AND pv.id =:id
  `;

    const result = await sequelize.query(query, {
      replacements: { program_id: programId, id: vendorId },
      type: QueryTypes.SELECT,
    });

    return result;
  }


  async getDistributionData(programId: string, jobId: string): Promise<any> {
    const query = `
      select
job_distributions.job_id,
job_distributions.vendor_id,
job_distributions.program_id
From job_distributions
where job_distributions.program_id=:program_id
AND job_distributions.job_id=:job_id
  `;

    const result = await sequelize.query(query, {
      replacements: { program_id: programId, job_id: jobId },
      type: QueryTypes.SELECT,
    });

    return result;
  }

  async findJobById(jobId: string) {
    const query = `SELECT status FROM jobs WHERE id = :jobId AND is_deleted = false`;

    const [result] = await sequelize.query(query, {
      replacements: { jobId },
      type: QueryTypes.SELECT,
    });

    return result;
  }

  async getJobCandidate(candidateId: string, jobId: string, programId: string) {
    const query = `
    SELECT vendor FROM job_candidate
    WHERE id = :candidateId
      AND job_id = :jobId
      AND program_id = :programId
    LIMIT 1
  `;

    const rows = await sequelize.query(query, {
      type: QueryTypes.SELECT,
      replacements: {
        candidateId,
        jobId,
        programId,
      },
    }) as any;

    return rows[0] || null;
  }

  async updateJobDistributionStatus(programId: string, jobId: string, vendorId: string): Promise<any> {
    const query = `
    UPDATE job_distributions
    SET status = 'Hold'
    WHERE job_id = :jobId
      AND vendor_id = :vendorId
      AND program_id = :programId
  `;

    const result = await sequelize.query(query, {
      replacements: { programId, jobId, vendorId },
      type: QueryTypes.UPDATE,
    });
    return result;
  }

  async getJobBasicData(id: string, program_id: string, userType: any) {
    const isVendor = userType?.toLowerCase() === 'vendor';
    const statusCase = isVendor
      ? `CASE WHEN jobs.status = 'PENDING_APPROVAL_SOURCING' THEN 'SOURCING' ELSE jobs.status END AS status`
      : `jobs.status AS status`;

    const query = `
      SELECT
        jobs.*,
        ${statusCase}
      FROM jobs
      WHERE jobs.id = :id
        AND jobs.program_id = :program_id
        AND jobs.is_deleted = false
    `;

    const result = await sequelize.query<{ start_date: any, end_date: any }>(query, {
      replacements: { id, program_id },
      type: QueryTypes.SELECT,
    }) as JobBasicData[];
    return result[0];
  }

  async getJobHierarchies(id: string, program_id: string) {
    const query = `
      SELECT
        JSON_OBJECT(
          'id', h.id,
          'name', h.name,
          'parent_hierarchy_id', h.parent_hierarchy_id,
          'is_enabled', h.is_enabled,
          'code', h.code,
          'is_hide_candidate_img', h.is_hide_candidate_img,
          'rate_model', h.rate_model,
          'default_date_format', h.default_date_format,
          'default_time_format', h.default_time_format,
          'unit_of_measure', h.unit_of_measure,
          'is_vendor_neutral_program', h.is_vendor_neutral_program
        ) AS primary_hierarchy,
        COALESCE((
          SELECT JSON_ARRAYAGG(JSON_OBJECT(
            'id', hierarchies.id,
            'name', hierarchies.name
          ))
          FROM ${config_db}.hierarchies
          WHERE JSON_VALID(j.hierarchy_ids)
            AND JSON_CONTAINS(j.hierarchy_ids, JSON_QUOTE(CAST(hierarchies.id AS CHAR)))
        ), JSON_ARRAY()) AS hierarchies
      FROM jobs j
      LEFT JOIN ${config_db}.hierarchies h ON j.primary_hierarchy = h.id
      WHERE j.id = :id AND j.program_id = :program_id
    `;

    const result = await sequelize.query(query, {
      replacements: { id, program_id },
      type: QueryTypes.SELECT,
    });
    return result[0];
  }

  async getJobLocationAndManager(id: string, program_id: string) {
    const query = `
      SELECT
        JSON_OBJECT(
          'id', wl.id,
          'name', wl.name,
          'address', wl.address
        ) AS work_location,
        JSON_OBJECT(
          'id', jm.id,
          'user_id', jm.user_id,
          'job_manager_name', jm.first_name,
          'job_manager_last_name', jm.last_name,
          'time_zone_id', jm.time_zone_id,
          'job_manager_number', JSON_UNQUOTE(JSON_EXTRACT(jm.contacts, '$[0].number'))
        ) AS job_manager,
        JSON_OBJECT(
            'id', pi.id,
            'label', pi.label,
            'picklist_id', pi.picklist_id
          ) AS job_type
      FROM jobs j
      LEFT JOIN ${config_db}.work_locations wl ON j.work_location_id = wl.id
      LEFT JOIN ${config_db}.user jm ON j.job_manager_id = jm.user_id AND j.program_id = jm.program_id
      LEFT JOIN ${config_db}.picklistitems pi ON j.job_type = pi.id
      WHERE j.id = :id AND j.program_id = :program_id
    `;

    const result = await sequelize.query(query, {
      replacements: { id, program_id },
      type: QueryTypes.SELECT,
    });
    return result[0];
  }

  async getJobTemplateData(id: string, program_id: string) {
    const query = `
      SELECT
        JSON_OBJECT(
          'id', jt.id,
          'template_name', jt.template_name,
          'ot_exempt', jt.ot_exempt,
          'submission_limit_vendor', jt.submission_limit_vendor,
          'job_submitted_count', jt.job_submitted_count,
          'is_description_editable', jt.is_description_editable,
          'allow_user_description', jt.allow_user_description,
          'is_resume_mandatory', jt.is_resume_mandatory,
          'allow_express_offer', jt.allow_express_offer,
          'is_submission_exceed_max_bill_rate', jt.is_submission_exceed_max_bill_rate,
          'is_qualification_enabled', jt.is_qualification_enabled,
          'is_onboarding_checklist', jt.is_onboarding_checklist,
          'is_automatic_distribution', jt.is_automatic_distribution,
          'is_manual_distribute_submit', jt.is_manual_distribute_submit,
          'is_tiered_distribute_submit', jt.is_tiered_distribute_submit,
          'is_review_configured_or_submit', jt.is_review_configured_or_submit,
          'is_distribute_final_approval', jt.is_distribute_final_approval,
          'is_expense_allowed_editable', jt.is_expense_allowed_editable,
          'is_expense_allowed', jt.is_expense_allowed,
          'is_shift_rate', jt.is_shift_rate,
          'is_description_required', jt.is_description_required,
          'is_checklist_enable', jt.is_checklist_enable,
          'is_description_upload_required', jt.is_description_upload_required,
          'is_country_mandatory', jt.is_country_mandatory,
          'is_address_mandatory', jt.is_address_mandatory,
          'allow_pre_identified_candidate', jt.allow_pre_identified_candidate,
          'category', JSON_OBJECT(
            'id', jc.id,
            'title', jc.title,
            'category', jc.category
          ),
          'available_start_date', jt.available_start_date
        ) AS job_template,
        COALESCE(jt.level, NULL) AS job_level
      FROM jobs j
      LEFT JOIN ${config_db}.job_templates jt ON j.job_template_id = jt.id
      LEFT JOIN ${config_db}.job_category jc ON jt.category = jc.id
      WHERE j.id = :id AND j.program_id = :program_id
    `;

    const result = await sequelize.query(query, {
      replacements: { id, program_id },
      type: QueryTypes.SELECT,
    });
    return result[0];
  }

  async getJobCategoryAndRates(id: string, program_id: string) {
    const query = `
      SELECT
        JSON_OBJECT(
          'id', lc.id,
          'name', lc.name
        ) AS labor_category,
        JSON_OBJECT(
          'id', c.id,
          'name', c.name,
          'symbol', c.symbol,
          'code', c.code
        ) AS currency,
        JSON_OBJECT(
          'id', st.id,
          'shift_type_name', st.shift_type_name
        ) AS shift
      FROM jobs j
      LEFT JOIN ${config_db}.labour_category lc ON j.labor_category_id = lc.id
      LEFT JOIN ${config_db}.currencies c ON j.currency = c.code
      LEFT JOIN ${config_db}.shift_types st ON j.shift = st.id
      WHERE j.id = :id AND j.program_id = :program_id
    `;

    const result = await sequelize.query(query, {
      replacements: { id, program_id },
      type: QueryTypes.SELECT,
    });
    return result[0];
  }

  async getJobQualifications(id: string) {
    const query = `
      SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'qualification_type_id', qt.id,
        'qualification_type_name', qt.name,
        'code', qt.code,
        'qualifications', COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'qualification_id', q.id,
              'name', q.name,
              'is_locked', jq.is_locked,
              'is_required', jq.is_required=1,
              'level', jq.level
            )
          )
          FROM ${config_db}.qualifications q
          JOIN JSON_TABLE(
            CASE
              WHEN JSON_VALID(jqt.qulification) THEN jqt.qulification
              ELSE '[]'
            END,
            '$[*]' COLUMNS(
              qualification_id CHAR(36) PATH '$.qualification_id',
              is_locked BOOLEAN PATH '$.is_locked',
              is_required BOOLEAN PATH '$.is_required',
              level JSON PATH '$.level'
            )
          ) AS jq ON q.id = jq.qualification_id
        ), JSON_ARRAY())
      )) AS qualifications
      FROM ${config_db}.qualification_types qt
      LEFT JOIN job_qualification_types jqt ON jqt.qulification_type_id = qt.id
      WHERE jqt.job_id = :id
    `;

    const result = await sequelize.query<{ qualifications: any }>(query, {
      replacements: { id },
      type: QueryTypes.SELECT,
    });
    return result[0]?.qualifications || [];
  }

  async getJobCandidates(id: string) {
    const query = `
      SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'id', jc.id,
        'first_name', jc.first_name,
        'middle_name', jc.middle_name,
        'last_name', jc.last_name,
        'email', jc.email,
        'phone_number', jc.phone_number,
        'vendor', jc.vendor,
        'country', jc.country,
        'notes', jc.notes,
        'vendor_name', pv.display_name,
        'tenant_id', pv.tenant_id,
        'country_code', co.isd_code,
        'country_name', co.name,
        'iso_code_2', co.iso_code_2,
        'iso_code_3', co.iso_code_3
      )) AS candidates
      FROM job_candidate jc
      LEFT JOIN ${config_db}.program_vendors pv ON jc.vendor = pv.id
      LEFT JOIN ${config_db}.countries co ON jc.country = co.id
      WHERE jc.job_id = :id
    `;

    const result = await sequelize.query<{ candidates: any }>(query, {
      replacements: { id },
      type: QueryTypes.SELECT,
    });
    return result[0]?.candidates || [];
  }

  async getJobFoundationDataTypes(id: string) {
    const query = `
     SELECT JSON_ARRAYAGG(result_row) AS foundationDataTypes
     FROM (
      SELECT JSON_OBJECT(
        'id', jmd.id,
        'foundation_data_type_id', jmd.foundation_data_type_id,
        'name', mdt.name,
        'seq_number', mdt.seq_number,
        'foundation_data_ids', (
          SELECT JSON_ARRAYAGG(JSON_OBJECT(
            'id', md.id,
            'foundational_data_name', md.name,
            'code', md.code
          ))
          FROM ${config_db}.master_data md
          WHERE JSON_CONTAINS(jmd.foundation_data_ids, JSON_QUOTE(CAST(md.id AS CHAR)))
        )
      ) AS result_row
      FROM job_master_data jmd
      LEFT JOIN ${config_db}.master_data_type mdt ON jmd.foundation_data_type_id = mdt.id
      WHERE jmd.job_id = :id
      ORDER BY mdt.seq_number ASC
    ) AS ordered_results
    `;

    const result = await sequelize.query<{ foundationDataTypes: any }>(query, {
      replacements: { id },
      type: QueryTypes.SELECT,
    });
    return result[0]?.foundationDataTypes || [];
  }

  async getJobRates(id: string) {
    const query = `
      SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'id', jrt.id,
        'bill_rate', jrt.bill_rate,
        'pay_rate', jrt.pay_rate,
        'rate_type_id', jrt.id,
        'abbreviation', jrt.abbreviation,
        'billable', jrt.billable,
        'name', jrt.name
      )) AS rates
      FROM job_rate_type jrt
      WHERE jrt.job_id = :id
    `;

    const result = await sequelize.query<{ rates: any }>(query, {
      replacements: { id },
      type: QueryTypes.SELECT,
    });
    return result[0]?.rates || [];
  }

  async getJobAuditUsers(id: string, program_id: string) {
    const query = `
      SELECT
        JSON_OBJECT(
          'id', creator.id,
          'first_name', creator.first_name,
          'middle_name', creator.middle_name,
          'last_name', creator.last_name,
          'username', creator.username,
          'email', creator.email
        ) AS created_by,
        JSON_OBJECT(
          'id', modifier.id,
          'first_name', modifier.first_name,
          'middle_name', modifier.middle_name,
          'last_name', modifier.last_name,
          'username', modifier.username,
          'email', modifier.email
        ) AS updated_by,
        CASE
          WHEN UPPER(j.managed_by) = 'SELF-MANAGED' THEN JSON_OBJECT(
            'id', 'self-managed',
            'name', 'self-managed',
            'display_name', 'self-managed'
          )
          ELSE JSON_OBJECT(
            'id', t.id,
            'name', t.name,
            'display_name', t.display_name
          )
        END AS managed_by
      FROM jobs j
      LEFT JOIN ${config_db}.user creator ON j.created_by = creator.user_id AND (creator.user_type = 'super_user' OR creator.program_id = j.program_id)
      LEFT JOIN ${config_db}.user modifier ON j.updated_by = modifier.user_id AND (modifier.user_type = 'super_user' OR modifier.program_id = j.program_id)
      LEFT JOIN ${config_db}.tenant t ON j.managed_by = t.id
      WHERE j.id = :id AND j.program_id = :program_id
    `;

    const result = await sequelize.query(query, {
      replacements: { id, program_id },
      type: QueryTypes.SELECT,
    });
    return result[0];
  }

  async getJobDistributionData(id: string, program_id: string) {
    const query = `
      SELECT
        JSON_OBJECT(
          'id', jd.id,
          'opt_status', jd.opt_status,
          'notes', jd.notes,
          'opt_out_reason', jd.opt_out_reason,
          'opt_status_date', jd.opt_status_date,
          'opted_by', TRIM(CONCAT_WS(' ', opted.first_name, opted.middle_name, opted.last_name))
        ) AS opt_data
      FROM jobs j
      LEFT JOIN job_distributions jd ON j.id = jd.job_id
      LEFT JOIN ${config_db}.user opted ON jd.opt_by = opted.user_id AND jd.program_id = opted.program_id
      WHERE j.id = :id AND j.program_id = :program_id
    `;

    const result = await sequelize.query(query, {
      replacements: { id, program_id },
      type: QueryTypes.SELECT,
    });
    return result[0];
  }

  async getJobChecklistData(checklist_entity_id: string, transaction: any) {
    const query = `
      SELECT
        c.entity_id AS checklist_entity_id,
        c.version_id AS checklist_version_id,
        c.version AS checklist_version,
        c.name AS checklist_name,
        ctm.trigger,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'mapping_id', ctm.id,
            'category_id', ctm.category_id,
            'category_name', ctm.category_name,
            'task_entity_id', ctm.task_entity_id,
            'task_name', ctm.task_name,
            'seq_no', ctm.seq_no,
            'is_mandatory', ctm.is_mandatory
          )
        ) AS mappings
      FROM ${config_db}.checklist c
      JOIN ${config_db}.checklist_task_mapping ctm ON c.version_id = ctm.checklist_version_id
      WHERE c.entity_id = :checklist_entity_id
        AND c.latest = 1
        AND c.is_deleted = 0
        AND ctm.is_enabled = 1
        AND ctm.is_deleted = 0
      GROUP BY c.entity_id, c.version_id, c.version, c.name, ctm.trigger
    `;

    return await sequelize.query<{ checklist_entity_id: any }>(query, {
      replacements: { checklist_entity_id },
      type: QueryTypes.SELECT,
      transaction
    }) as ChecklistResult[];
  }

  async getVendorDistributionData(program_id: string, job_id: string, userId: string, transaction: any) {
    const userCheckQuery = `
      SELECT
        u.user_type,
        u.tenant_id,
        pv.id AS program_vendor_id
      FROM ${config_db}.user u
      JOIN ${config_db}.program_vendors pv ON u.tenant_id = pv.tenant_id
      WHERE
        u.program_id = :program_id
        AND u.user_id = :userId
        AND u.user_type = 'vendor'
        AND pv.program_id = :program_id
        AND pv.tenant_id = u.tenant_id
    `;

    const userResult = await sequelize.query(userCheckQuery, {
      replacements: { program_id, userId },
      type: QueryTypes.SELECT,
      transaction
    });

    if (userResult.length === 0) {
      return { optStatus: null, submissionLimit: null, optIn: false };
    }

    const { program_vendor_id } = userResult[0] as { program_vendor_id: string };

    const jobDistributionQuery = `
      SELECT opt_status, submission_limit, status
      FROM job_distributions
      WHERE program_id = :program_id AND job_id = :job_id AND vendor_id = :vendor_id
    `;

    const jobDistribution = await sequelize.query(jobDistributionQuery, {
      replacements: { program_id, job_id, vendor_id: program_vendor_id },
      type: QueryTypes.SELECT,
      transaction,
    }) as { opt_status: string | null; submission_limit: number | null; status: string }[];

    const optStatus = jobDistribution.find(dist => dist.opt_status !== null)?.opt_status ?? null;
    const submissionLimit = jobDistribution.find(dist => dist.submission_limit !== null)?.submission_limit || null;
    const status = jobDistribution.find(dist => dist.status !== null)?.status ?? null;
    const optIn = optStatus === 'OPT_IN';

    return { optStatus, submissionLimit, optIn, status };
  }

  // Optimized main method using Promise.all
  async getJobByJobIdAndProgramIdOptimized(id: string, program_id: string, userType: any, transaction: any) {
    try {
      const [
        jobBasicData,
        hierarchyData,
        locationManagerData,
        templateData,
        categoryRatesData,
        qualifications,
        candidates,
        foundationDataTypes,
        rates,
        auditUsers,
        distributionData
      ] = await Promise.all([
        this.getJobBasicData(id, program_id, userType),
        this.getJobHierarchies(id, program_id),
        this.getJobLocationAndManager(id, program_id),
        this.getJobTemplateData(id, program_id),
        this.getJobCategoryAndRates(id, program_id),
        this.getJobQualifications(id),
        this.getJobCandidates(id),
        this.getJobFoundationDataTypes(id),
        this.getJobRates(id),
        this.getJobAuditUsers(id, program_id),
        this.getJobDistributionData(id, program_id)
      ]);

      if (!jobBasicData) {
        return null;
      }

      const duration = this.calculateDuration(jobBasicData.start_date, jobBasicData.end_date);

      const result = {
        ...jobBasicData,
        ...hierarchyData,
        ...locationManagerData,
        ...templateData,
        ...categoryRatesData,
        ...auditUsers,
        ...distributionData,
        qualifications,
        candidates,
        foundationDataTypes,
        rates,
        duration_in_days: duration
      };

      return [result];
    } catch (error) {
      console.error('Error in getJobByJobIdAndProgramIdOptimized:', error);
      throw error;
    }
  }

  private calculateDuration(startDate: string, endDate: string): string {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 7) {
      return `${diffDays} days`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      const days = diffDays % 7;
      return `${weeks} weeks ${days} days`;
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      const days = diffDays % 30;
      return `${months} months ${days} days`;
    } else {
      const years = Math.floor(diffDays / 365);
      const months = Math.floor((diffDays % 365) / 30);
      const weeks = Math.floor(((diffDays % 365) % 30) / 7);
      const days = diffDays % 365 % 30 % 7;
      return `${years} years ${months} months ${weeks} weeks ${days} days`;
    }
  }
  async getWorkflowData(workflowTriggerId: string): Promise<Array<{ flow_type: string; is_completed: boolean }>> {

    const programData = await sequelize.query(
      `SELECT * FROM ${config_db}.workflow WHERE workflow_trigger_id = :workflow_trigger_id AND (status = :pending_status OR status = :completed_status)`,
      {
        replacements: {
          workflow_trigger_id: workflowTriggerId,
          pending_status: WORKFLOW_STATUS.PENDING,
          completed_status: WORKFLOW_STATUS.COMPLETED
        },
        type: QueryTypes.SELECT
      }
    );

    const flowTypeStatusMap = new Map<string, boolean>();
    for (const program of programData) {
      const { flow_type, status } = program as { flow_type: string; status: string };
      if (!flowTypeStatusMap.has(flow_type) || status === WORKFLOW_STATUS.COMPLETED) {
        flowTypeStatusMap.set(flow_type, status === WORKFLOW_STATUS.COMPLETED);
      }
    }

    const flowTypes = Array.from(flowTypeStatusMap.entries())
      .map(([flow_type, is_completed]) => ({ flow_type, is_completed }))
      .sort((a, b) => {
        if (a.flow_type === WORKFLOW_FLOW_TYPE.REVIEW) return -1;
        if (b.flow_type === WORKFLOW_FLOW_TYPE.REVIEW) return 1;
        return 0;
      });

    return flowTypes;
  }

  async getJobsCountByProgramId(program_id: string): Promise<number> {
    const countQuery = `
        SELECT COUNT(*) as total
        FROM jobs j
        WHERE j.program_id = :program_id 
        AND j.is_deleted = false
    `;

    const result = await sequelize.query(countQuery, {
      replacements: { program_id },
      type: QueryTypes.SELECT
    }) as any[];

    return result[0]?.total || 0;
  }


  async getPaginatedJobIds(program_id: string, limit: number, offset: number): Promise<string[]> {
    const query = `
        SELECT j.id
        FROM jobs j
        WHERE j.program_id = :program_id 
        AND j.is_deleted = false
        ORDER BY j.created_on DESC
        LIMIT :limit OFFSET :offset
    `;

    const data = await sequelize.query<{ id: string }>(query, {
      replacements: {
        program_id,
        limit: Number(limit),
        offset: Number(offset)
      },
        type: QueryTypes.SELECT
    });

    return data.map(({ id }) => id);
  }

 async getBatchJobHistoryRevisions(validJobIds: any[], transaction: any) {
    const batchJobHistoryQuery = `
        SELECT DISTINCT job_id, MAX(revision) as revision
        FROM job_history
        WHERE job_id IN (:jobIds)
        GROUP BY job_id
    `;

    return await sequelize.query(batchJobHistoryQuery, {
        replacements: { jobIds: validJobIds },
        type: QueryTypes.SELECT,
        transaction
    });
}

}
export default JobRepository;
