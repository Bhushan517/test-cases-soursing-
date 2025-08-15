import { QueryTypes } from "sequelize";
import { sequelize } from "../config/instance";
import { databaseConfig } from '../config/db';
const config_db = databaseConfig.config.database_config;
const auth_db = databaseConfig.config.database_auth;
class JobDistributionRepository {
  async getAllJobDistributionDetails(
    program_id: string,
    filters: { status?: string; job_id?: string; submission_limit?: string; opt_status?: string, distributed_by?: string, vendor_id?: string },
  ) {
    const { status, job_id, submission_limit, opt_status, distributed_by, vendor_id } = filters;

    const query = `
      SELECT
        job_distributions.*,
        program_vendors.tenant_id AS vendor_id,
        program_vendors.vendor_name AS vendor_name,
        COUNT(*) OVER() AS total_count
      FROM job_distributions
      LEFT JOIN ${config_db}.program_vendors
        ON job_distributions.vendor_id = program_vendors.tenant_id
      WHERE job_distributions.program_id = :program_id
        AND job_distributions.is_deleted = false
        ${status ? "AND job_distributions.status = :status" : ""}
        ${job_id ? "AND job_distributions.job_id = :job_id" : ""}
        ${submission_limit ? "AND job_distributions.submission_limit = :submission_limit" : ""}
        ${opt_status ? "AND job_distributions.opt_status = :opt_status" : ""}
        ${distributed_by ? "AND job_distributions.distributed_by = :distributed_by" : ""}
        ${vendor_id ? "AND job_distributions.vendor_id = :vendor_id" : ""}
      GROUP BY job_distributions.id;
    `;

    const replacements: any = {
      program_id,
    };
    if (status) replacements.status = status;
    if (job_id) replacements.job_id = job_id;
    if (submission_limit) replacements.submission_limit = submission_limit;
    if (opt_status) replacements.opt_status = opt_status;
    if (distributed_by) replacements.distributed_by = distributed_by;
    if (vendor_id) replacements.vendor_id = vendor_id;

    const result = await sequelize.query(query, {
      replacements,
      type: QueryTypes.SELECT,
    });

    return result;
  }

  async fetchJobDistributions(replacements: any): Promise<any[]> {
    const query = `
      SELECT
        job_distributions.distribute_method,
        job_distributions.status,
        job_distributions.id,
        job_distributions.job_id,
        job_distributions.submission_limit,
        CASE
          WHEN job_distributions.status = 'scheduled' THEN NULL
          ELSE job_distributions.opt_status
        END AS opt_status,
        job_distributions.opt_status_date,
        job_distributions.duration,
        job_distributions.measure_unit,
        job_distributions.is_enabled,
        job_distributions.distribution_date,
        job_distributions.updated_on,
        job_distributions.distributed_by,
        job_distributions.opt_out_reason,
        job_distributions.notes,
        COALESCE(program_vendors.id, tenant.id) AS vendor_id,
        tenant.id AS tenant_id,
        program_vendors.display_name AS vendor_name,
        user.user_id AS user_id,
        user.first_name AS first_name,
        user.last_name AS last_name,
        (
          SELECT COUNT(*)
          FROM submission_candidate AS sc
          WHERE sc.vendor_id = job_distributions.vendor_id
            AND sc.job_id = job_distributions.job_id
            AND sc.is_deleted = false
            AND sc.program_id = job_distributions.program_id
        ) AS submissions
      FROM job_distributions
      LEFT JOIN ${config_db}.program_vendors
        ON job_distributions.vendor_id = program_vendors.id
      LEFT JOIN ${config_db}.tenant
        ON job_distributions.vendor_id = tenant.id
      LEFT JOIN (SELECT * FROM ${config_db}.user WHERE user_type = 'super_user' OR program_id = :program_id) AS user
        ON job_distributions.distributed_by = user.user_id
      WHERE job_distributions.program_id = :program_id
        AND job_distributions.job_id = :job_id
        AND job_distributions.is_deleted = false
        ${replacements.statusList && replacements.statusList.length
        ? `AND job_distributions.status IN (:statusList)` : ""}
        ${replacements.vendor_name ? "AND program_vendors.display_name LIKE :vendor_name" : ""}
        ${replacements.distributed_by ?
        ` AND (
                user.first_name LIKE :distributed_by OR
                user.last_name LIKE :distributed_by OR
                CONCAT(user.first_name, ' ', user.last_name) LIKE :distributed_by
            )`
        : ""}
        ${replacements.distribution_date ? 'AND DATE(FROM_UNIXTIME(job_distributions.distribution_date / 1000)) = DATE(:distribution_date)' : ''}
        ${replacements.submission_limit ? "AND job_distributions.submission_limit = :submission_limit" : ""}
        ${replacements.opt_status ? "AND job_distributions.opt_status LIKE :opt_status" : ""}
        ${replacements.opt_status_date ? 'AND DATE(FROM_UNIXTIME(job_distributions.opt_status_date / 1000)) = DATE(:opt_status_date)' : ''}
      GROUP BY job_distributions.job_id, job_distributions.vendor_id
      HAVING ${replacements.submissions !== null ? 'submissions >= :submissions' : '1=1'}  -- Ensure it filters correctly
      ORDER BY job_distributions.distribution_date DESC
      LIMIT :limit OFFSET :offset;
    `;

    return sequelize.query(query, {
      replacements,
      type: QueryTypes.SELECT
    });
  }

  async getOptOutJob(replacements: any): Promise<any> {
    const jobs = await sequelize.query<{ count: any }>(
      `
      WITH VendorProgram AS (
        SELECT id AS tenant_id
        FROM ${config_db}.program_vendors
        WHERE tenant_id = :vendor_id
        AND program_id = :program_id
        LIMIT 1
      )
      SELECT
        jobs.id,
        MAX(jobs.job_id) AS job_id,
        MAX(jobs.status) AS status,
        MAX(jobs.start_date) AS start_date,
        MAX(jobs.end_date) AS end_date,
        MAX(jobs.no_positions) AS no_positions,
        MAX(jobs.job_manager_id) AS job_manager_id,
        MAX(jobs.created_on) AS created_on,
        MAX(jobs.updated_on) AS updated_on,
        MAX(jobs.program_id) AS program_id,
        MAX(jobs.max_bill_rate) AS max_bill_rate,
        MAX(jobs.min_bill_rate) AS min_bill_rate,
        MAX(jobs.rate_model) AS rate_model,
        MAX(jobs.budgets) AS budgets,
        MAX(jobs.net_budget) AS net_budget,
        MAX(JSON_OBJECT(
          'id', user.user_id,
          'first_name', user.first_name,
          'last_name', user.last_name
        )) AS jobManager,
        MAX(JSON_OBJECT(
          'id', labour_category.id,
          'name', labour_category.name
        )) AS labor_category,
        MAX(JSON_OBJECT(
          'id', work_locations.id,
          'name', work_locations.name
        )) AS work_location,
        MAX(JSON_OBJECT(
          'id', job_templates.id,
          'template_name', job_templates.template_name,
          'is_shift_rate', job_templates.is_shift_rate
        )) AS job_template,
        COALESCE(
          (SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', hierarchies.id,
              'name', hierarchies.name
            )
          )
          FROM ${config_db}.hierarchies
          WHERE JSON_CONTAINS(jobs.hierarchy_ids, JSON_QUOTE(hierarchies.id))), JSON_ARRAY()
        ) AS hierarchies,
        (
          SELECT COUNT(*)
          FROM submission_candidate
          WHERE submission_candidate.job_id = jobs.id
          AND submission_candidate.is_deleted = false
        ) AS job_submitted_candidate,
        COUNT(*) OVER() AS count,
        MAX(JSON_OBJECT(
          'id', pv.id,
          'name', pv.display_name
        )) AS vendor,
        job_distributions.opt_out_reason,
        job_distributions.notes,
        job_distributions.opt_status,
        job_distributions.updated_on AS opt_status_date
      FROM job_distributions
      INNER JOIN jobs ON job_distributions.job_id = jobs.id
      LEFT JOIN ${config_db}.user ON jobs.job_manager_id = user.user_id
      LEFT JOIN ${config_db}.labour_category ON jobs.labor_category_id = labour_category.id
      LEFT JOIN ${config_db}.work_locations ON jobs.work_location_id = work_locations.id
      LEFT JOIN ${config_db}.job_templates ON jobs.job_template_id = job_templates.id
      LEFT JOIN ${config_db}.hierarchies ON jobs.primary_hierarchy = hierarchies.id
      LEFT JOIN ${config_db}.program_vendors pv ON pv.id = job_distributions.vendor_id
      WHERE job_distributions.program_id = :program_id
      ${replacements.vendor_id ? "AND job_distributions.vendor_id IN (:vendor_id)" : ""}
      ${replacements.status ? "AND jobs.status IN (:status)" : ""}
      ${replacements.job_id ? "AND jobs.job_id LIKE :job_id" : ""}
      ${replacements.start_date ? "AND jobs.start_date = :start_date" : ""}
      ${replacements.end_date ? "AND jobs.end_date = :end_date" : ""}
      ${replacements.template_name ? "AND job_templates.template_name LIKE :template_name" : ""}
      ${replacements.job_template_id ? "AND jobs.job_template_id = :job_template_id" : ""}
      ${replacements.job_id_list ? "AND jobs.id IN (:job_id_list)" : ""}
      AND job_distributions.is_deleted = false
      AND job_distributions.opt_status = 'OPT_OUT'
      GROUP BY jobs.id
      ORDER BY MAX(jobs.created_on) DESC
      LIMIT :limit OFFSET :offset;
      `,
      {
        replacements,
        type: QueryTypes.SELECT
      }
    );
    const totalCount = jobs[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / replacements.limit);
    return { jobs, totalCount, totalPages };
  }

  async findProgramVendorUser(program_id: string, userId: any) {

    const sql = `SELECT u.user_type, u.tenant_id, pv.id AS program_vendor_id FROM ${config_db}.user AS u
          LEFT JOIN ${config_db}.program_vendors AS pv ON pv.tenant_id = u.tenant_id AND pv.program_id = u.program_id
          WHERE u.program_id = :program_id AND u.user_id = :userId`;

    const userData = await sequelize.query(sql, {
      replacements: { program_id, userId },
      type: QueryTypes.SELECT
    });

    return userData;
  }

  async findVendor(program_id: string, job_ids: any[]) {
    console.log("job_ids", job_ids);

    const sql = `SELECT DISTINCT vendor_id FROM ${config_db}.job_distributions WHERE program_id = :program_id AND job_id IN (:job_ids)`;

    const userData = await sequelize.query(sql, {
      replacements: { program_id, job_ids },
      type: QueryTypes.SELECT,
      logging: console.log
    });

    return userData;
  }

  async getOptOutJobVendors(replacements: any): Promise<any> {
    const data = await sequelize.query<any>(
      `
      WITH VendorProgram AS (
        SELECT id AS tenant_id
        FROM ${config_db}.program_vendors
        WHERE tenant_id = :vendor_id
        AND program_id = :program_id
        LIMIT 1
      )
      SELECT
        work_locations.id AS work_location_id,
        work_locations.name AS work_location_name,
        pv.id AS vendor_id,
        pv.display_name AS vendor_name
      FROM job_distributions
      INNER JOIN jobs ON job_distributions.job_id = jobs.id
      LEFT JOIN ${config_db}.work_locations ON jobs.work_location_id = work_locations.id
      LEFT JOIN ${config_db}.program_vendors pv ON pv.id = job_distributions.vendor_id
      WHERE job_distributions.program_id = :program_id
      ${replacements.vendor_id ? "AND job_distributions.vendor_id IN (:vendor_id)" : ""}
      ${replacements.job_id_list ? "AND jobs.id IN (:job_id_list)" : ""}
      AND job_distributions.is_deleted = false
      AND job_distributions.opt_status = 'OPT_OUT'
      ORDER BY jobs.created_on DESC
      `,
      {
        replacements,
        type: QueryTypes.SELECT,
      }
    );
    const workLocationMap = new Map();
    const vendorMap = new Map();

    data.forEach((row) => {
      if (row.work_location_id && !workLocationMap.has(row.work_location_id)) {
        workLocationMap.set(row.work_location_id, {
          id: row.work_location_id,
          name: row.work_location_name,
        });
      }

      if (row.vendor_id && !vendorMap.has(row.vendor_id)) {
        vendorMap.set(row.vendor_id, {
          id: row.vendor_id,
          name: row.vendor_name,
        });
      }
    });

    const uniqueWorkLocations = Array.from(workLocationMap.values());
    const uniqueVendors = Array.from(vendorMap.values());

    return { work_locations: uniqueWorkLocations, vendors: uniqueVendors };
  }

  async vendorFilterQueryBuilder(hierarchyIdsArray: string[], labor_category_id?: any): Promise<string> {
    let query = `
      SELECT program_vendors.*
      FROM ${config_db}.program_vendors
      WHERE program_vendors.is_deleted = false
        AND program_vendors.program_id = :program_id
        AND status = 'Active'
    `;

    if (hierarchyIdsArray.length > 0) {
      const hierarchyFilter = hierarchyIdsArray
        .map(id => `JSON_CONTAINS(program_vendors.hierarchies, JSON_QUOTE('${id}'), '$')`)
        .join(" OR ");
      query += ` AND ((${hierarchyFilter}) OR program_vendors.all_hierarchy = true)`;
    }

    if (labor_category_id) {
      const laborFilter = `JSON_CONTAINS(program_vendors.program_industry, JSON_QUOTE(:labor_category_id), '$') OR program_vendors.is_labour_category = true`;
      query += ` AND (${laborFilter})`;
    }

    return query;
  }

  async getWorkLocationData(work_location_id: string): Promise<{ name: string, code: string }[]> {
    try {
      console.log("Fetching work location for ID:", work_location_id);
      if (!work_location_id) {
        console.log("Work location does not exist");
        return [];
      }

      const worklocationData = await sequelize.query(
        `SELECT name, code
             FROM ${config_db}.work_locations
             WHERE id = :work_location_id;`,
        {
          replacements: { work_location_id },
          type: QueryTypes.SELECT,
        }
      ) as [{ name: string, code: string }];

      return worklocationData;
    } catch (error) {
      console.error('Error fetching work location data:', error);
      throw error;
    }
  }
}

export default JobDistributionRepository;
