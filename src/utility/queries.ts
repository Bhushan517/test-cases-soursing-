import { QueryTypes } from "sequelize";
import { sequelize } from "../config/instance";
import { JobTemplate } from "../interfaces/job.interface";
import { databaseConfig } from "../config/db";

const config_db = databaseConfig.config.database_config;
export const getJobOfferByIdQuery = () => {
  return `
    SELECT
      offers.*,
      JSON_OBJECT(
        'id', candidates.id,
        'candidate_middle_name', MAX(candidates.middle_name),
        'candidate_first_name', MAX(candidates.first_name),
        'candidate_last_name', MAX(candidates.last_name)
      ) AS candidate_data,
      JSON_ARRAYAGG(
        JSON_OBJECT(
          'id', hierarchies.id,
          'name', hierarchies.name
        )
      ) AS hierarchies,
      JSON_OBJECT(
        'id', work_locations.id,
        'name', MAX(work_locations.name)
      ) AS work_location,
      JSON_OBJECT(
        'id', job_manager.id,
        'first_name', MAX(job_manager.first_name),
        'middle_name', MAX(job_manager.middle_name),
        'last_name', MAX(job_manager.last_name)
      ) AS job_manager,
      expense_managers.managers AS expense_managers,
      timesheet_managers.managers AS timesheet_managers,
      JSON_ARRAYAGG(
        JSON_OBJECT(
          'foundation_data_type_id', master_data_type.id,
          'foundation_data_type_name', master_data_type.name,
          'foundation_Data',
          (
            SELECT JSON_ARRAYAGG(
              JSON_OBJECT(
                'id', fd.id,
                'name', fd.name
              )
            )
            FROM master_data fd
            WHERE JSON_CONTAINS(offer_master_data.foundation_data_ids, JSON_QUOTE(fd.id))
          )
        )
      ) AS foundational_data,
      custom_fields.fields AS custom_fields
    FROM
      offers
    LEFT JOIN candidates ON offers.candidate_id = candidates.id
    LEFT JOIN work_locations ON offers.work_location = work_locations.id
    LEFT JOIN (
      SELECT
        oh.offer_id,
        h.id,
        h.name
      FROM offers_hierarchy AS oh
      JOIN hierarchies AS h ON oh.hierarchy = h.id
    ) AS hierarchies ON hierarchies.offer_id = offers.id
    LEFT JOIN user AS job_manager ON offers.job_manager = job_manager.id
    LEFT JOIN offer_master_data ON offers.id = offer_master_data.offer_id
    LEFT JOIN master_data_type ON offer_master_data.foundation_data_type_id = master_data_type.id
    LEFT JOIN (
      SELECT
        jo.id,
        JSON_ARRAYAGG(
          JSON_OBJECT('id', em.id, 'first_name', em.first_name, 'last_name', em.last_name)
        ) AS managers
      FROM offers AS jo
      LEFT JOIN user AS em
        ON JSON_VALID(jo.expense_manager)
        AND JSON_CONTAINS(jo.expense_manager, JSON_QUOTE(CAST(em.id AS CHAR)))
      GROUP BY jo.id
    ) AS expense_managers ON expense_managers.id = offers.id
    LEFT JOIN (
      SELECT
        jo.id,
        JSON_ARRAYAGG(
          JSON_OBJECT('id', tm.id, 'first_name', tm.first_name, 'last_name', tm.last_name)
        ) AS managers
      FROM offers AS jo
      LEFT JOIN user AS tm
        ON JSON_VALID(jo.timesheet_manager)
        AND JSON_CONTAINS(jo.timesheet_manager, JSON_QUOTE(CAST(tm.id AS CHAR)))
      GROUP BY jo.id
    ) AS timesheet_managers ON timesheet_managers.id = offers.id
    LEFT JOIN (
      SELECT
        ocf.offer_id,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', cf.id,
            'name', cf.name,
            'label', cf.label,
            'value', ocf.value
          )
        ) AS fields
      FROM offer_custom_fields AS ocf
      LEFT JOIN custom_fields AS cf ON ocf.custom_field_id = cf.id
      GROUP BY ocf.offer_id
    ) AS custom_fields ON custom_fields.offer_id = offers.id
    WHERE offers.id = :id
    GROUP BY
      offers.id,
      candidates.id,
      work_locations.id,
      job_manager.id,
      master_data_type.id,
      custom_fields.fields
    LIMIT 0, 1000;
  `;
};


export const getOffersForCandidateQuery = () => {
  return `
    SELECT
      offers.*,  -- Include all columns from the 'offers' table
      offers.id AS offer_id,
      offers.candidate_id,
      offers.job_id,
      offers.financial_details,
      JSON_OBJECT(
        'id', candidates.id,
        'candidate_first_name', MAX(candidates.first_name),
        'candidate_last_name', MAX(candidates.last_name)
      ) AS candidate,
      JSON_OBJECT(
        'id', work_locations.id,
        'name', MAX(work_locations.name)
      ) AS work_location,
      JSON_ARRAYAGG(
        JSON_OBJECT(
          'id', hierarchies.id,
          'name', hierarchies.name
        )
      ) AS hierarchies,
      JSON_OBJECT(
        'id', job_manager.id,
        'first_name', MAX(job_manager.first_name),
        'last_name', MAX(job_manager.last_name)
      ) AS job_manager,
      expense_managers.managers AS expense_managers,
      timesheet_managers.managers AS timesheet_managers,
      (SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
          'foundation_data_type_id', master_data_type.id,
          'foundation_data_type_name', master_data_type.name,
          'foundation_Data',
          (
            SELECT JSON_ARRAYAGG(
              JSON_OBJECT(
                'id', fd.id,
                'name', fd.name
              )
            )
            FROM master_data fd
            WHERE JSON_CONTAINS(offer_master_data.foundation_data_ids, JSON_QUOTE(fd.id))
          )
        )
      ) FROM offer_master_data
         LEFT JOIN master_data_type ON offer_master_data.foundation_data_type_id = master_data_type.id
         WHERE offer_master_data.offer_id = offers.id
      ) AS foundational_data,
      custom_fields.fields AS custom_fields
    FROM offers
    LEFT JOIN candidates ON offers.candidate_id = candidates.id
    LEFT JOIN work_locations ON offers.work_location = work_locations.id
    LEFT JOIN (
      SELECT
        oh.offer_id,
        h.id,
        h.name
      FROM offers_hierarchy AS oh
      JOIN hierarchies AS h ON oh.hierarchy = h.id
    ) AS hierarchies ON hierarchies.offer_id = offers.id
    LEFT JOIN user AS job_manager ON offers.job_manager = job_manager.id
    LEFT JOIN (
      SELECT
        jo.id,
        JSON_ARRAYAGG(
          JSON_OBJECT('id', em.id, 'first_name', em.first_name, 'last_name', em.last_name)
        ) AS managers
      FROM offers AS jo
      LEFT JOIN user AS em
        ON JSON_VALID(jo.expense_manager)
        AND JSON_CONTAINS(jo.expense_manager, JSON_QUOTE(CAST(em.id AS CHAR)))
      GROUP BY jo.id
    ) AS expense_managers ON expense_managers.id = offers.id
    LEFT JOIN (
      SELECT
        jo.id,
        JSON_ARRAYAGG(
          JSON_OBJECT('id', tm.id, 'first_name', tm.first_name, 'last_name', tm.last_name)
        ) AS managers
      FROM offers AS jo
      LEFT JOIN user AS tm
        ON JSON_VALID(jo.timesheet_manager)
        AND JSON_CONTAINS(jo.timesheet_manager, JSON_QUOTE(CAST(tm.id AS CHAR)))
      GROUP BY jo.id
    ) AS timesheet_managers ON timesheet_managers.id = offers.id
    LEFT JOIN (
      SELECT
        ocf.offer_id,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', cf.id,
            'name', cf.name,
            'label', cf.label,
            'value', ocf.value
          )
        ) AS fields
      FROM offer_custom_fields AS ocf
      LEFT JOIN custom_fields AS cf ON ocf.custom_field_id = cf.id
      GROUP BY ocf.offer_id
    ) AS custom_fields ON custom_fields.offer_id = offers.id
    WHERE offers.candidate_id = ?
      AND offers.job_id = ?
      AND offers.program_id = ?
      AND offers.parent_offer_id IS NULL
    GROUP BY offers.id, work_locations.id, job_manager.id, expense_managers.managers, timesheet_managers.managers, custom_fields.fields
    LIMIT 1; -- To ensure only one result is returned
  `;
};

export const getCounterOffersForCandidateQuery = () => {
  return `
    SELECT
      offers.*,  -- Include all columns from the 'offers' table
      offers.id AS offer_id,
      offers.candidate_id,
      offers.job_id,
      offers.financial_details,
      JSON_OBJECT(
        'id', candidates.id,
        'candidate_first_name', MAX(candidates.first_name),
        'candidate_last_name', MAX(candidates.last_name)
      ) AS candidate,
      JSON_OBJECT(
        'id', work_locations.id,
        'name', MAX(work_locations.name)
      ) AS work_location,
      JSON_ARRAYAGG(
        JSON_OBJECT(
          'id', hierarchies.id,
          'name', hierarchies.name
        )
      ) AS hierarchies,
      JSON_OBJECT(
        'id', job_manager.id,
        'first_name', MAX(job_manager.first_name),
        'last_name', MAX(job_manager.last_name)
      ) AS job_manager,
      expense_managers.managers AS expense_managers,
      timesheet_managers.managers AS timesheet_managers,
      (SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
          'foundation_data_type_id', master_data_type.id,
          'foundation_data_type_name', master_data_type.name,
          'foundation_Data',
          (
            SELECT JSON_ARRAYAGG(
              JSON_OBJECT(
                'id', fd.id,
                'name', fd.name
              )
            )
            FROM master_data fd
            WHERE JSON_CONTAINS(offer_master_data.foundation_data_ids, JSON_QUOTE(fd.id))
          )
        )
      ) FROM offer_master_data
         LEFT JOIN master_data_type ON offer_master_data.foundation_data_type_id = master_data_type.id
         WHERE offer_master_data.offer_id = offers.id
      ) AS foundational_data,
      custom_fields.fields AS custom_fields
    FROM offers
    LEFT JOIN candidates ON offers.candidate_id = candidates.id
    LEFT JOIN work_locations ON offers.work_location = work_locations.id
    LEFT JOIN (
      SELECT
        oh.offer_id,
        h.id,
        h.name
      FROM offers_hierarchy AS oh
      JOIN hierarchies AS h ON oh.hierarchy = h.id
    ) AS hierarchies ON hierarchies.offer_id = offers.id
    LEFT JOIN user AS job_manager ON offers.job_manager = job_manager.id
    LEFT JOIN (
      SELECT
        jo.id,
        JSON_ARRAYAGG(
          JSON_OBJECT('id', em.id, 'first_name', em.first_name, 'last_name', em.last_name)
        ) AS managers
      FROM offers AS jo
      LEFT JOIN user AS em
        ON JSON_VALID(jo.expense_manager)
        AND JSON_CONTAINS(jo.expense_manager, JSON_QUOTE(CAST(em.id AS CHAR)))
      GROUP BY jo.id
    ) AS expense_managers ON expense_managers.id = offers.id
    LEFT JOIN (
      SELECT
        jo.id,
        JSON_ARRAYAGG(
          JSON_OBJECT('id', tm.id, 'first_name', tm.first_name, 'last_name', tm.last_name)
        ) AS managers
      FROM offers AS jo
      LEFT JOIN user AS tm
        ON JSON_VALID(jo.timesheet_manager)
        AND JSON_CONTAINS(jo.timesheet_manager, JSON_QUOTE(CAST(tm.id AS CHAR)))
      GROUP BY jo.id
    ) AS timesheet_managers ON timesheet_managers.id = offers.id
    LEFT JOIN (
      SELECT
        ocf.offer_id,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', cf.id,
            'name', cf.name,
            'label', cf.label,
            'value', ocf.value
          )
        ) AS fields
      FROM offer_custom_fields AS ocf
      LEFT JOIN custom_fields AS cf ON ocf.custom_field_id = cf.id
      GROUP BY ocf.offer_id
    ) AS custom_fields ON custom_fields.offer_id = offers.id
    WHERE offers.parent_offer_id = ?
      AND offers.program_id = ?
      AND (offers.status IS NULL OR offers.status NOT IN ('CLOSED'))
    GROUP BY offers.id, work_locations.id, job_manager.id, expense_managers.managers, timesheet_managers.managers, custom_fields.fields
    LIMIT 1; -- To ensure only one result is returned
  `;
};

export function getAllOffersQuery(filterString: string): string {
  const adjustedFilterString = filterString.split(' AND ').map(filter => {
    if (filter.includes('job_id')) {
      if (!filter.includes('jo.job_id') && !filter.includes('oj.job_id')) {
        return filter.replace(/job_id/g, 'jo.job_id');
      }
    }
    return filter;
  }).join(' AND ');

  return `
    SELECT
        jo.id,
        jo.status,
        jo.updated_on,
        jo.offer_code,
        jo.candidate_id,
        jo.job_id,
        jo.unique_id,
        jo.submission_id,
        jo.updated_on,
        jo.created_on,
        jo.created_on,
        jc.first_name,
        jc.last_name,
        jc.middle_name,
        jc.candidate_id AS candidate_unique_id,
        os.unique_id AS submission_unique_id,
        oj.job_id AS job_unique_id,
        jt.template_name AS job_name
    FROM offers AS jo
    LEFT JOIN candidates AS jc ON jc.id = jo.candidate_id
    LEFT JOIN submission_candidate AS os ON os.id = jo.submission_id
    LEFT JOIN jobs AS oj ON oj.id = jo.job_id
    LEFT JOIN job_templates AS jt ON jt.id = oj.job_template_id
    WHERE jo.is_deleted = false
      AND jo.program_id = :program_id
      AND (jo.status IS NULL OR jo.status NOT IN ('Counter Offer'))
      ${adjustedFilterString} -- Adjusted filters from query params
    ORDER BY jo.created_on DESC
    LIMIT :limit
    OFFSET :offset;
  `;
}

export function getAllOffersCountQuery(filterString: string): string {
  return `
    SELECT COUNT(*) AS total_records
    FROM offers AS jo
    LEFT JOIN candidates AS jc ON jc.id = jo.candidate_id
    WHERE jo.is_deleted = false
    AND jo.program_id = :program_id
    AND (jo.status IS NULL OR jo.status NOT IN ('Counter Offer'))
    ${filterString}; -- Filters from query params
  `;
}

export const deleteJobTemplateHierarchyQuery = `
  DELETE FROM job_template_hierarchies
  WHERE program_id = :program_id AND job_temp_id = :job_temp_id
`;

export const getJobTemplateByHierarchies = () => {
  return `
      SELECT
          ji.id,
          ji.template_name,
          ji.job_id,
          ji.program_id,
          ji.created_on,
          GROUP_CONCAT(jc.hierarchy SEPARATOR ',') AS hierarchy -- concatenate hierarchies
      FROM job_templates AS ji
      INNER JOIN job_template_hierarchies AS jc ON jc.job_temp_id = ji.id
      WHERE ji.is_deleted = false
        AND ji.program_id = :program_id
      GROUP BY ji.id, ji.template_name, ji.job_id, ji.program_id, ji.created_on
      ORDER BY ji.created_on DESC;
    `;
};

export const getMostUsedJobTemplatesByProgram = (
  includeJobIdFilter: boolean,
  hierarchyIdsArray: string[],
  job_type?: string,
  limit?: number,
  offset?: number,
) => {
  const hierarchyCondition = includeJobIdFilter && hierarchyIdsArray.length > 0
    ? `AND job_template_hierarchies.hierarchy IN (${hierarchyIdsArray.map(() => '?').join(',')})`
    : '';
  const jobTypeCondition = job_type ? `AND job_templates.job_type = ?` : '';
  const paginationCondition = limit !== undefined && offset !== undefined
    ? `LIMIT ? OFFSET ?`
    : '';

  return `
    SELECT
      job_templates.template_name,
      MIN(job_templates.id) AS id,
      MIN(job_templates.program_id) AS program_id,
      MIN(job_templates.job_type) AS job_type,
      MIN(job_templates.description) AS description,
      MIN(job_templates.template_code) AS template_code,
      MIN(job_templates.template_code) AS template_code,
      MIN(job_category.title) AS job_category,
      MIN(labour_category.name) AS labour_category_name,
      MIN(hierarchies.name) AS hierarchy,
      MAX(job_templates.job_submitted_count) AS job_submitted_count
    FROM job_templates
    INNER JOIN job_template_hierarchies
      ON job_templates.id = job_template_hierarchies.job_temp_id
	INNER JOIN hierarchies
      ON job_template_hierarchies.hierarchy = hierarchies.id
	left join job_category on job_templates.category=job_category.id
    left join labour_category on job_templates.program_industry=labour_category.id
    WHERE job_templates.program_id = ?
    ${hierarchyCondition}
    ${jobTypeCondition}
    GROUP BY
      job_templates.template_name
    ORDER BY
      job_submitted_count DESC
    ${paginationCondition};
  `;
};

export const getJobTempletByHierarchies = (
  includeJobIdFilter: boolean,
  hierarchyIdsArray: string[],
  job_type?: string
) => {
  let hierarchyCondition = '';

  if (includeJobIdFilter && hierarchyIdsArray.length > 0) {
    hierarchyCondition = `AND job_template_hierarchies.hierarchy IN (${hierarchyIdsArray.map(() => '?').join(',')})`;
  }
  const jobTypeCondition = job_type ? `AND job_templates.job_type = ?` : '';
  return `
    SELECT
      job_templates.template_name,
      MIN(job_templates.id) AS id,
      MIN(job_templates.program_id) AS program_id,
      MIN(job_templates.job_type) AS job_type,
      MIN(job_templates.description) AS description,
      MIN(job_templates.template_code) AS template_code,
      MIN(job_templates.template_code) AS template_code,
      MIN(job_category.title) AS job_category,
      MIN(labour_category.name) AS labour_category_name,
      MIN(hierarchies.name) AS hierarchy,
      MIN(job_templates.created_on) AS created_on
    FROM job_templates
   INNER JOIN job_template_hierarchies
      ON job_templates.id = job_template_hierarchies.job_temp_id
	INNER JOIN hierarchies
      ON job_template_hierarchies.hierarchy = hierarchies.id
	left join job_category on job_templates.category=job_category.id
    left join labour_category on job_templates.program_industry=labour_category.id
    WHERE job_templates.program_id = ?
    ${hierarchyCondition}
    ${jobTypeCondition}
    GROUP BY
      job_templates.template_name
    ORDER BY
      created_on DESC;
  `;
};


export const getAllJobTemplateByHierarchy = (
  includeJobIdFilter: boolean,
  hierarchyIdsArray: string[],
  includeLaborCategoryIdFilter: boolean,
  laborCategoryIdsArray: string[],
  includeQualificationIdFilter: boolean,
  qualificationIdsArray: string[],
  limit?: number,
  offset?: number,
  job_type?: string,
  name?:string
) => {
  const hierarchyCondition = includeJobIdFilter
    ? `AND job_template_hierarchies.hierarchy IN (${hierarchyIdsArray.map(() => '?').join(',')})`
    : '';

  const laborCategoryCondition = includeLaborCategoryIdFilter
    ? `AND job_templates.program_industry IN (${laborCategoryIdsArray.map(() => '?').join(',')})`
    : '';

  const qualificationCondition = includeQualificationIdFilter
    ? `AND qualifications.id IN (${qualificationIdsArray.map(() => '?').join(',')})`
    : '';

  const jobTypeCondition = job_type ? `AND job_templates.job_type = ?` : '';
  const jobTemplateCondition = name ? `AND job_templates.template_name LIKE ?` : '';


  const paginationCondition = limit && offset
    ? `LIMIT ? OFFSET ?`
    : '';

    return `
    SELECT
      job_templates.template_name,
      MIN(job_templates.id) AS id,
      MIN(job_templates.program_id) AS program_id,
      MIN(job_templates.job_type) AS job_type,
      MIN(job_templates.description) AS description,
      MIN(job_templates.template_code) AS template_code,
      MIN(job_category.title) AS job_category,
      MIN(labour_category.name) AS labour_category_name,
      MIN(labour_category.id) AS labour_category_id,
      MIN(hierarchies.name) AS hierarchy,
      MIN(qualifications.name) AS qualification_name,
      MIN(qualifications.id) AS qualification_id
    FROM job_templates
    INNER JOIN job_template_hierarchies
      ON job_templates.id = job_template_hierarchies.job_temp_id
    INNER JOIN hierarchies
      ON job_template_hierarchies.hierarchy = hierarchies.id
    LEFT JOIN job_category
      ON job_templates.category = job_category.id
    LEFT JOIN labour_category
      ON job_templates.program_industry = labour_category.id
    LEFT JOIN job_template_qualification
      ON job_templates.id = job_template_qualification.job_temp_id
    LEFT JOIN qualifications
      ON JSON_CONTAINS(
          JSON_EXTRACT(job_template_qualification.qualifications, '$[*].qualification_id'),
          JSON_QUOTE(qualifications.id)
      )
    WHERE job_templates.program_id = ?
    ${hierarchyCondition}
    ${laborCategoryCondition}
    ${qualificationCondition}
    ${jobTypeCondition}
     ${jobTemplateCondition}
    GROUP BY job_templates.template_name
    ORDER BY job_templates.template_name
    ${paginationCondition};
  `;

};

export const jobAdvancedFilter = (
  hasJobId: boolean, hasQueryName: boolean, hasTemplateName: boolean, hasFirstName: boolean, hasJobSubmittedCandidate: boolean, hasStatus: boolean, hasNoPosition: boolean, hasStartDate: boolean, hasEndDate: boolean, hierarchyIdsArray: string[]) => {
    const hierarchyIdsClause = hierarchyIdsArray.length
      ? `AND ${hierarchyIdsArray.map((_, index) => `JSON_CONTAINS(jobs.hierarchy_ids, JSON_QUOTE(:hierarchy_ids${index}), '$')`).join(' AND ')}`
      : '';

    return `
      SELECT
        jobs.*,
        JSON_OBJECT(
          'id', user.id,
          'first_name', user.first_name
        ) AS jobManager,
        JSON_OBJECT(
          'id', work_locations.id,
          'name', work_locations.name
        ) AS work_location,
        JSON_OBJECT(
          'id', job_templates.id,
          'template_name', job_templates.template_name
        ) AS job_template,
        (
          SELECT COUNT(sub.job_id)
          FROM submission_candidate sub
          WHERE sub.job_id = jobs.id
        ) AS job_submitted_candidate,
        JSON_ARRAYAGG(
          JSON_OBJECT('id', hierarchies.id, 'name', hierarchies.name)
        ) AS hierarchies  -- Aggregate hierarchies into a JSON array
      FROM
        jobs
      INNER JOIN
        job_templates ON jobs.job_template_id = job_templates.id
      INNER JOIN
        work_locations ON jobs.work_location_id = work_locations.id
      INNER JOIN
        user ON jobs.job_manager_id = user.id
      LEFT JOIN
        hierarchies ON JSON_VALID(jobs.hierarchy_ids)
        AND JSON_CONTAINS(jobs.hierarchy_ids, JSON_QUOTE(CAST(hierarchies.id AS CHAR)))
      WHERE
        jobs.is_deleted = false
        AND jobs.program_id = :program_id
        ${hasJobId ? 'AND jobs.job_id = :job_id' : ''}
        ${hasQueryName ? 'AND work_locations.name LIKE :name' : ''}
        ${hasTemplateName ? 'AND job_templates.template_name LIKE :template_name' : ''}
        ${hasFirstName ? 'AND user.first_name LIKE :first_name' : ''}
        ${hasStatus ? 'AND jobs.status = :status' : ''}
        ${hasNoPosition ? 'AND jobs.no_positions = :no_positions' : ''}
        ${hasStartDate ? 'AND jobs.start_date >= :start_date' : ''}
        ${hasEndDate ? 'AND jobs.end_date <= :end_date' : ''}
        ${hierarchyIdsClause}
      GROUP BY
        jobs.id,
        job_templates.template_name,
        work_locations.name,
        user.first_name,
        user.id,
        work_locations.id,
        work_locations.address,
        job_templates.id
      HAVING
        ${hasJobSubmittedCandidate ? 'job_submitted_candidate >= :job_submitted_candidate' : '1=1'}
      ORDER BY
        jobs.id ASC
      LIMIT :limit
      OFFSET :offset;
    `;
  };



  export const getJobByJobIdAndProgramId = `
  SELECT
    jobs.*,
    JSON_OBJECT(
        'id', work_locations.id,
        'name', work_locations.name,
        'address', work_locations.address
    ) AS work_location,
    JSON_OBJECT(
        'id', user.id,
        'job_manager_name', user.first_name,
        'job_manager_last_name', user.last_name,
        'job_manager_number', (SELECT JSON_EXTRACT(user.contacts, '$[0].number'))  -- Extracting the first contact number
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
    ) AS currency,  -- Adding currency object
    JSON_OBJECT(
        'id', job_templates.id,
        'template_name', job_templates.template_name,
        'is_manual_distribution_job_submit',job_templates.is_manual_distribution_job_submit,
        'is_tiered_distribute_schedule',job_templates.is_tiered_distribute_schedule,
        'category', JSON_OBJECT(
            'id', job_category.id,
            'title', job_category.title,
            'category', job_category.category
        )
    ) AS job_template,
    COALESCE(job_templates.level, NULL) AS job_level,
    JSON_ARRAYAGG(JSON_OBJECT('id', hierarchies.id, 'name', hierarchies.name)) AS hierarchies, -- Aggregate hierarchy as JSON array
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
    ) AS updated_by
  FROM jobs
      LEFT JOIN work_locations
        ON jobs.work_location_id = work_locations.id
      LEFT JOIN user AS user
        ON jobs.job_manager_id = user.id
      LEFT JOIN labour_category
        ON jobs.labor_category_id = labour_category.id
      LEFT JOIN job_templates
        ON jobs.job_template_id = job_templates.id
      LEFT JOIN job_category
        ON job_templates.category = job_category.id
      LEFT JOIN currencies
        ON jobs.currency = currencies.id  -- Join currencies table
      LEFT JOIN hierarchies
        ON JSON_VALID(jobs.hierarchy_ids)
        AND JSON_CONTAINS(jobs.hierarchy_ids, JSON_QUOTE(CAST(hierarchies.id AS CHAR)))
      LEFT JOIN user AS creator ON jobs.created_by = creator.id
      LEFT JOIN user AS modifier  -- Join user table for updated_by field
        ON jobs.updated_by = modifier.id
  WHERE jobs.id = :id
      AND jobs.program_id = :program_id
      AND jobs.is_deleted = false
  GROUP BY
    jobs.id,
    work_locations.id,
    work_locations.name,
    work_locations.address,
    user.id,
    user.first_name,
    user.contacts,
    user.last_name,
    labour_category.id,
    labour_category.name,
    currencies.id,  -- Include currencies in GROUP BY
    currencies.name,
    job_templates.id,
    job_templates.template_name,
    job_category.id,
    job_category.title,
    job_category.category,
     creator.id,
      creator.first_name,
      creator.middle_name,
      creator.last_name,
      creator.username,
      creator.email,
      modifier.id,
      modifier.first_name,
      modifier.middle_name,
      modifier.last_name,
      modifier.username,
      modifier.email;
`;

export const getAllJobDetails = `
SELECT
    jobs.program_id,
    GROUP_CONCAT(DISTINCT jobs.status) AS status,
    JSON_ARRAYAGG(
       JSON_OBJECT(
        'id', work_locations.id,
        'name', work_locations.name
    )
    ) AS work_location,
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'id', job_templates.id,
            'template_name', job_templates.template_name
        )
    ) AS job_title,
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'id', hierarchies.id,
            'name', hierarchies.name
        )
    ) AS hierarchies,
    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'job_submitted_candidate', (
                    SELECT COUNT(*)
                    FROM submission_candidate s
                    WHERE s.job_id = j.id
                )
            )
        )
        FROM jobs j
        WHERE j.program_id = jobs.program_id
        AND j.is_deleted = false
    ) AS job_candidate_count
FROM jobs
LEFT JOIN hierarchies
    ON JSON_VALID(jobs.hierarchy_ids)
    AND JSON_CONTAINS(jobs.hierarchy_ids, JSON_QUOTE(CAST(hierarchies.id AS CHAR)))
LEFT JOIN submission_candidate
    ON jobs.id = submission_candidate.job_id
LEFT JOIN job_templates
    ON jobs.job_template_id = job_templates.id
LEFT JOIN work_locations
    ON jobs.work_location_id = work_locations.id
WHERE jobs.program_id = :program_id
    AND jobs.is_deleted = false
GROUP BY jobs.program_id;
`;

export const markupQuery = `
    SELECT
        vmc.markups,
        vmc.rate_model
    FROM
        vendor_markup_config vmc
    WHERE
        vmc.program_id=:program_id AND
        vmc.program_vendor_id = :vendor_id
        AND (
            (:rateModel LIKE CONCAT(vmc.rate_model, '%')
             AND vmc.program_industry = :labour_category_id
             AND vmc.work_locations = :work_location_id)
            OR
            (vmc.is_all_labor_category = 1 AND vmc.is_all_work_locations = 1 AND vmc.is_all_hierarchy = 1)
        )
    ORDER BY
        -- Prioritize by exact industry and location matches
        CASE WHEN vmc.program_industry = :labour_category_id AND vmc.work_locations = :work_location_id THEN 1 ELSE 2 END,
        -- Fallback: Prioritize rows where all categories, locations, and hierarchy are set to 1
        CASE WHEN vmc.is_all_labor_category = 1 AND vmc.is_all_work_locations = 1 AND vmc.is_all_hierarchy = 1 THEN 3 ELSE 1 END,
        -- Additional sorting logic if needed
        CASE WHEN vmc.program_industry = :labour_category_id THEN 1 ELSE 2 END,
        CASE WHEN vmc.work_locations = :work_location_id THEN 1 ELSE 2 END
    LIMIT 1;
`;

export const workflowQuery =(
  hierarchyIdsArray: string[]
)=>{
  const hierarchyJsonArray = JSON.stringify(hierarchyIdsArray) || '[]';
return `
SELECT
    *
FROM
    ${config_db}.workflow_config w
WHERE
    w.event_id = :event_id
    AND is_deleted=false
    AND is_enabled=true
    AND w.module = :module_id
    AND w.program_id = :program_id
    AND (
      JSON_CONTAINS(w.hierarchies, '${hierarchyJsonArray}')
      OR w.is_associated_to_all_hierarchy = true
    )
    ORDER BY created_on DESC
    LIMIT 1
`};

export const ApprovalworkflowQuery =(
  hierarchyIdsArray: string[]
)=>{
  const hierarchyJsonArray = JSON.stringify(hierarchyIdsArray) || '[]';
return `
SELECT
    *
FROM
    ${config_db}.workflow_config w
WHERE
    w.event_id = :event_id
    AND is_deleted=false
    AND is_enabled=true
    AND w.module = :module_id
    AND w.program_id = :program_id
    AND (
      JSON_CONTAINS(w.hierarchies, '${hierarchyJsonArray}')
      OR w.is_associated_to_all_hierarchy = true
    )
    AND LOWER(w.flow_type) = 'approval'
    ORDER BY created_on DESC
    LIMIT 1
`};

export const jobWorkflowQuery = (hierarchyIdsArray: string[], flowtype: string = 'review') => {
  const hierarchyJsonArray = JSON.stringify(hierarchyIdsArray) || '[]';

  return `
    SELECT * FROM (
      SELECT
          w.*,
          1 as priority
      FROM
          ${config_db}.workflow_config w
      WHERE
          w.event_id = :event_id
          AND w.is_deleted = false
          AND w.is_enabled = true
          AND w.module = :module_id
          AND w.program_id = :program_id
          AND (
            JSON_CONTAINS(w.hierarchies, '${hierarchyJsonArray}')
            OR w.is_associated_to_all_hierarchy = true
          )
          AND LOWER(w.flow_type) = '${flowtype?.toLowerCase()}'
      ORDER BY created_on DESC
      LIMIT 1
    ) AS review_workflow
    
    UNION ALL
    
    SELECT * FROM (
      SELECT
          w.*,
          2 as priority
      FROM
          ${config_db}.workflow_config w
      WHERE
          w.event_id = :event_id
          AND w.is_deleted = false
          AND w.is_enabled = true
          AND w.module = :module_id
          AND w.program_id = :program_id
          AND (
            JSON_CONTAINS(w.hierarchies, '${hierarchyJsonArray}')
            OR w.is_associated_to_all_hierarchy = true
          )
          AND LOWER(w.flow_type) = 'approval'
      ORDER BY created_on DESC
      LIMIT 1
    ) AS approval_workflow
    
    ORDER BY priority
    LIMIT 1;
  `;
};


export const jobCounts = `
    SELECT
        -- Count of submitted candidates
        COUNT(CASE WHEN sc.candidate_id IS NOT NULL THEN 1 END) AS submittedCandidateCount,

        -- Count of available candidates
        (
            SELECT COUNT(c.id)
            FROM candidates AS c
            WHERE c.program_id = :program_id
              AND c.is_deleted = 0
              AND NOT EXISTS (
                  SELECT 1
                  FROM submission_candidate AS sub
                  WHERE sub.job_id = :job_id
                    AND sub.candidate_id = c.id
                    AND sub.candidate_id IS NOT NULL
              )
        ) AS availableCandidateCount,

        -- Count of interviews
        (
            SELECT COUNT(i.id)
            FROM interviews AS i
            WHERE i.program_id = :program_id
              AND i.job_id = :job_id
        ) AS interviewCandidateCount,

        -- Count of job offers
        (
            SELECT COUNT(o.id)
            FROM offers AS o
            WHERE o.program_id = :program_id
              AND o.job_id = :job_id
        ) AS offerCandidateCount,

        -- Count of job distributions
        (
            SELECT COUNT(jd.id)
            FROM job_distributions AS jd
            WHERE jd.program_id = :program_id
              AND jd.job_id = :job_id
        ) AS jobDistributionCount
     FROM submission_candidate AS sc
     WHERE sc.job_id = :job_id
       AND sc.program_id = :program_id
`;

export const jobTemplateQuery = async (
  job_temp_id: string,
  program_id: string
): Promise<JobTemplate | null> => {
  const query = `
    SELECT *
    FROM ${config_db}.job_templates
    WHERE id = :job_temp_id AND program_id = :program_id;
  `;

  const data = await sequelize.query<JobTemplate>(query, {
    replacements: { job_temp_id, program_id },
    type: QueryTypes.SELECT,
  });

  return data[0] || null;
};


export const rejectWorkflow =(
)=>{
return `
SELECT
    id
FROM
    ${config_db}.workflow w
WHERE
    w.workflow_trigger_id = :job_id
    AND w.is_updated=true
    AND w.status="pending"
    AND w.is_enabled=true
    AND w.is_deleted=false
`};

export const approvalWorkflow =(
)=>{
return `
SELECT
    id
FROM
    ${config_db}.workflow w
WHERE
    w.workflow_trigger_id = :job_id
    AND w.status="completed"
    AND w.flow_type="Approval"
    AND w.is_updated=true
    AND w.is_enabled=true
    AND w.is_deleted=false
`};