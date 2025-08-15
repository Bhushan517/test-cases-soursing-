import { QueryTypes } from "sequelize";
import { sequelize } from "../config/instance";
import {
  Interview,
  JobInterviewData,
  UserInterface,
} from "../interfaces/interview.interface";
import { databaseConfig } from '../config/db';
const config_db = databaseConfig.config.database_config;

class InterviewRepository {

  async getAllInterviewsWithFilters(replacements: any): Promise<any[]> {
    const sql = `
        WITH
        latest_interviews AS (
          SELECT i.*, jm.job_template_id, jtm.template_name, c.first_name, c.last_name,
          jm.job_id AS jm_job_id, sc.unique_id,
          ROW_NUMBER() OVER (
            PARTITION BY i.job_id, i.submit_candidate_id
            ORDER BY i.revision DESC
          ) AS rn
          FROM interviews i
          LEFT JOIN jobs jm ON i.job_id = jm.id  
          LEFT JOIN ${config_db}.job_templates jtm ON jm.job_template_id = jtm.id  
          LEFT JOIN submission_candidate sc ON i.submission_id = sc.id
          LEFT JOIN ${config_db}.candidates c ON i.submit_candidate_id = c.id  
          WHERE i.program_id = :program_id
          ${replacements.job_id ? "AND i.job_id = :job_id" : ""}
          ${replacements.vendor_id ? "AND i.vendor_id = :vendor_id" : ""}
        ),
        filtered_interviews AS (
            SELECT * FROM latest_interviews AS ji
            WHERE rn = 1
            ${replacements.is_vendor_user ? "AND ji.status != 'DRAFT'" : ""}
            ${replacements.title ? "AND ji.title LIKE CONCAT('%', :title, '%')" : ""}
            ${replacements.created_on ? "AND ji.created_on >= :created_on" : ""}
            ${replacements.updated_on ? "AND ji.updated_on >= :updated_on" : ""}
            ${Array.isArray(replacements.job_ids) && replacements.job_ids.length > 0 ? "AND ji.job_id IN (:job_ids)" : ""}
            ${replacements.interview_date ? "AND EXISTS (SELECT 1 FROM interview_schedules s WHERE s.interview_id = ji.id AND s.interview_date >= :interview_date)" : ""}
            ${replacements.duration ? "AND EXISTS (SELECT 1 FROM interview_schedules s WHERE s.interview_id = ji.id AND s.duration LIKE CONCAT('%', :duration, '%'))" : ""}
            ${Array.isArray(replacements.interview_type) && replacements.interview_type.length > 0 ? "AND ji.interview_type IN (:interview_type)" : ""}
            ${Array.isArray(replacements.status) && replacements.status.length > 0 ? "AND ji.status IN (:status)" : ""}
            ${Array.isArray(replacements.interviewer) && replacements.interviewer.length > 0 ? "AND EXISTS (SELECT 1 FROM interview_participants p WHERE p.interview_id = ji.id AND p.participant_id IN (:interviewer) AND p.is_interviewer = 1)" : ""}
            ${replacements.start_time ? "AND EXISTS (SELECT 1 FROM interview_schedules s WHERE s.interview_id = ji.id AND s.start_time >= :start_time)" : ""}
            ${replacements.job_unique_id ? "AND ji.jm_job_id LIKE CONCAT('%', :job_unique_id, '%')" : ""}
            ${replacements.job_name ? "AND ji.template_name LIKE CONCAT('%', :job_name, '%')" : ""}
            ${replacements.submission_unique_id ? "AND ji.unique_id LIKE CONCAT('%', :submission_unique_id, '%')" : ""}
            ${replacements.candidate_name ? "AND REPLACE(CONCAT(ji.first_name, ji.last_name), ' ', '') LIKE CONCAT('%', REPLACE(:candidate_name, ' ', ''), '%')" : ""}
        ),
        total_records AS (
            SELECT COUNT(*) AS total FROM filtered_interviews WHERE rn = 1
        ),
        schedules_agg AS (
            SELECT
                s.interview_id,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'id', s.id,
                        'duration', s.duration,
                        'interview_date', s.interview_date,
                        'start_time', s.start_time,
                        'end_time', s.end_time,
                        'status', s.status
                    )
                ) AS schedules
            FROM interview_schedules s
            GROUP BY s.interview_id
        ),
        attendees_agg AS (
            SELECT
                aa.interview_id,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'additional_attendee_id', aa.id,
                        'candidate_phone', aa.candidate_phone,
                        'is_interviewer', CASE WHEN aa.is_interviewer = 1 THEN true ELSE false END,
                        'external_participant_email', aa.external_participant_email,
                        'user_id', u.user_id,
                        'participants_details', JSON_OBJECT(
                            'first_name', u.first_name,
                            'last_name', u.last_name
                        )
                    )
                ) AS additional_attendees
            FROM interview_participants aa
            LEFT JOIN ${config_db}.user u ON aa.participant_id = u.user_id
            GROUP BY aa.interview_id
        ),
        feedback_agg AS (
            SELECT
                ifb.interview_id,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'id', ifb.id,
                        'outcome', ifb.outcome,
                        'rating', ifb.rating,
                        'vendor_notes', ifb.vendor_notes
                    )
                ) AS interview_feedback
            FROM interview_reviews ifb
            GROUP BY ifb.interview_id
        )
        SELECT
            ji.id,
            ji.job_id,
            ji.status,
            ji.title,
            ji.created_on,
            ji.interview_type,
            ji.program_id,
            ji.vendor_id,
            ji.submit_candidate_id,
            ji.interview_Id AS interview_unique_id,
            ji.submission_id AS submission_id,
            sc.unique_id AS submission_unique_id,
            CONCAT(c.first_name, ' ', c.last_name) AS candidate_name,
            JSON_OBJECT(
                'id', jm.id,
                'job_id', jm.job_id,
                'job_status', jm.status,
                'job_templates', JSON_OBJECT(
                    'template_name', jtm.template_name,
                    'id', jtm.id
                )
            ) AS job,
            schedules_agg.schedules,
            attendees_agg.additional_attendees,
            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM offers o
                    WHERE o.program_id = ji.program_id
                      AND o.job_id = ji.job_id
                      AND o.candidate_id = ji.submit_candidate_id
                ) THEN TRUE
                ELSE FALSE
            END AS offer_flag,
                (
                    SELECT o.status
                    FROM offers o
                    WHERE o.program_id = ji.program_id
                      AND o.job_id = ji.job_id
                      AND o.candidate_id = ji.submit_candidate_id
                      LIMIT 1
            ) AS offer_status,
            CAST((SELECT total FROM total_records) AS UNSIGNED) AS total_records,
            CAST(CEIL((SELECT total FROM total_records) / :limit) AS UNSIGNED) AS items_per_page
        FROM filtered_interviews ji
        LEFT JOIN schedules_agg ON ji.id = schedules_agg.interview_id
        LEFT JOIN attendees_agg ON ji.id = attendees_agg.interview_id
        LEFT JOIN feedback_agg ON ji.id = feedback_agg.interview_id
        LEFT JOIN jobs jm ON ji.job_id = jm.id
        LEFT JOIN ${config_db}.job_templates jtm ON jm.job_template_id = jtm.id
        LEFT JOIN submission_candidate sc ON ji.submission_id = sc.id
        LEFT JOIN ${config_db}.candidates c ON ji.submit_candidate_id = c.id
        WHERE ji.rn = 1
        ORDER BY ji.updated_on DESC
        LIMIT :limit OFFSET :offset;
    `;

    const result = await sequelize.query<JobInterviewData>(sql, {
      replacements,
      type: QueryTypes.SELECT,
    });

    result.forEach((interview) => {
      interview.additional_attendees = interview.additional_attendees.map(
        (attendee: { is_interviewer: number }) => ({
          ...attendee,
          is_interviewer: attendee.is_interviewer === 1,
        })
      );

      interview.offer_flag = !!interview.offer_flag;
    });

    return result;
  }

  async getAllInterviews(replacements: any): Promise<any[]> {
    const sql = `
    WITH
    filtered_interviews AS (
        SELECT ji.*,
        ROW_NUMBER() OVER (
          PARTITION BY ji.job_id, ji.submit_candidate_id
          ORDER BY ji.revision DESC
        ) AS rn
        FROM interviews ji
        WHERE ji.program_id = :program_id
        ${replacements.job_id ? "AND ji.job_id = :job_id" : ""}
        ${replacements.vendor_id ? "AND ji.vendor_id = :vendor_id" : ""}
        ${replacements.is_vendor_user ? "AND ji.status != 'DRAFT'" : ""}
        ${Array.isArray(replacements.job_ids) && replacements.job_ids.length > 0 ? "AND ji.job_id IN (:job_ids)" : ""}
    ),
    total_count AS (
        SELECT COUNT(*) AS total FROM filtered_interviews WHERE rn = 1
    ),
    schedules_agg AS (
        SELECT s.interview_id,
            JSON_ARRAYAGG(
                JSON_OBJECT(
                    'id', s.id,
                    'duration', s.duration,
                    'interview_date', s.interview_date,
                    'start_time', s.start_time,
                    'end_time', s.end_time,
                    'status', s.status
                )
            ) AS schedules
        FROM interview_schedules s
        GROUP BY s.interview_id
    ),
    attendees_agg AS (
        SELECT aa.interview_id,
            JSON_ARRAYAGG(
                JSON_OBJECT(
                    'additional_attendee_id', aa.id,
                    'candidate_phone', aa.candidate_phone,
                    'is_interviewer', CASE WHEN aa.is_interviewer = 1 THEN true ELSE false END,
                    'external_participant_email', aa.external_participant_email,
                    'user_id', u.user_id,
                    'participants_details', JSON_OBJECT(
                        'first_name', u.first_name,
                        'last_name', u.last_name
                    )
                )
            ) AS additional_attendees
        FROM interview_participants aa
        LEFT JOIN ${config_db}.user u ON aa.participant_id = u.user_id AND u.program_id=:program_id
        GROUP BY aa.interview_id
    ),
    feedback_agg AS (
        SELECT ifb.interview_id,
            JSON_ARRAYAGG(
                JSON_OBJECT(
                    'id', ifb.id,
                    'outcome', ifb.outcome,
                    'rating', ifb.rating,
                    'vendor_notes', ifb.vendor_notes
                )
            ) AS interview_feedback
        FROM interview_reviews ifb
        GROUP BY ifb.interview_id
    )
    SELECT
        ji.id,
        ji.job_id,
        ji.status,
        ji.title,
        ji.created_on,
        ji.interview_type,
        ji.program_id,
        ji.vendor_id,
        ji.submit_candidate_id,
        ji.interview_Id AS interview_unique_id,
        ji.submission_id AS submission_id,
        sc.unique_id AS submission_unique_id,
        CONCAT(c.first_name, ' ', c.last_name) AS candidate_name,
        c.do_not_rehire,
        c.do_not_rehire_reason,
        c.do_not_rehire_notes,
        JSON_OBJECT(
              'id', jm.id,
              'job_id', jm.job_id,
              'job_status',jm.status,
              'primary_hierarchy',JSON_OBJECT(
                  'id',h.id,
                  'name',h.name,
                  'is_vendor_neutral_program',h.is_vendor_neutral_program
               ),
              'job_templates', JSON_OBJECT(
                  'template_name', jtm.template_name,
                  'id', jtm.id
              )
        ) AS job,
        schedules_agg.schedules,
        attendees_agg.additional_attendees,
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM offers o
                WHERE o.program_id = ji.program_id
                  AND o.job_id = ji.job_id
                  AND o.candidate_id = ji.submit_candidate_id
            ) THEN TRUE
            ELSE FALSE
        END AS offer_flag,
        (
        SELECT o.status
        FROM offers o
        WHERE o.program_id = ji.program_id
        AND o.job_id = ji.job_id
        AND o.candidate_id = ji.submit_candidate_id
        LIMIT 1
        ) AS offer_status,
        CAST((SELECT total FROM total_count) AS UNSIGNED) AS total_records,
        CAST(CEIL((SELECT total FROM total_count) / :limit) AS UNSIGNED) AS items_per_page
    FROM filtered_interviews ji
    LEFT JOIN schedules_agg ON ji.id = schedules_agg.interview_id
    LEFT JOIN attendees_agg ON ji.id = attendees_agg.interview_id
    LEFT JOIN feedback_agg ON ji.id = feedback_agg.interview_id
    LEFT JOIN jobs jm ON ji.job_id = jm.id
    LEFT JOIN ${config_db}.job_templates jtm ON jm.job_template_id = jtm.id
    LEFT JOIN ${config_db}.hierarchies h ON h.id = jm.primary_hierarchy
    LEFT JOIN submission_candidate sc ON ji.submission_id = sc.id
    LEFT JOIN ${config_db}.candidates c ON ji.submit_candidate_id = c.id
    WHERE ji.rn = 1
    ORDER BY ji.updated_on DESC
    LIMIT :limit OFFSET :offset;
  `;

    const result = await sequelize.query<JobInterviewData>(sql, {
      replacements,
      type: QueryTypes.SELECT,
    });

    result.forEach((interview) => {
      if (interview.job?.primary_hierarchy) {
        interview.job.primary_hierarchy.is_vendor_neutral_program =
          interview.job.primary_hierarchy.is_vendor_neutral_program === 1;
      }
      interview.additional_attendees = interview.additional_attendees.map(
        (attendee: { is_interviewer: number }) => ({
          ...attendee,
          is_interviewer: attendee.is_interviewer === 1,
        })
      );

      interview.offer_flag = !!interview.offer_flag;
    });

    return result;
  }

  async getInterviewById(id: string, program_id: string) {
    const sql = `
    WITH schedules_agg AS (
        SELECT s.interview_id,
            JSON_ARRAYAGG(
                JSON_OBJECT(
                    'id', s.id,
                    'duration', s.duration,
                    'interview_date', s.interview_date,
                    'start_time', s.start_time,
                    'end_time', s.end_time,
                    'status', s.status
                )
            ) AS schedules
        FROM interview_schedules s
        WHERE s.interview_id = :id
        GROUP BY s.interview_id
    ),
    attendees_agg AS (
        SELECT aa.interview_id,
            JSON_ARRAYAGG(
                JSON_OBJECT(
                    'additional_attendee_id', aa.id,
                    'candidate_phone', aa.candidate_phone,
                    'is_interviewer', CASE WHEN aa.is_interviewer = 1 THEN true ELSE false END,
                    'external_participant_email', aa.external_participant_email,
                    'user_id',u.user_id,
                    'candidate_phone',aa.candidate_phone,
                    'participants_details', JSON_OBJECT(
                        'first_name', u.first_name,
                        'last_name', u.last_name
                    )
                )
            ) AS additional_attendees
        FROM interview_participants aa
        LEFT JOIN ${config_db}.user u ON aa.participant_id = u.user_id AND u.program_id = :program_id
        WHERE aa.interview_id = :id
        GROUP BY aa.interview_id
    ),
    feedback_agg AS (
        SELECT ifb.interview_id,
            JSON_ARRAYAGG(
                JSON_OBJECT(
                    'id', ifb.id,
                    'outcome', ifb.outcome,
                    'rating', ifb.rating,
                    'vendor_notes', ifb.vendor_notes
                )
            ) AS interview_feedback
        FROM interview_reviews ifb
        WHERE ifb.interview_id = :id
        GROUP BY ifb.interview_id
    ),
    custom_fields_agg AS (
        SELECT cfa.interview_id,
            JSON_ARRAYAGG(
                JSON_OBJECT(
                    'id', cf.id,
                    'name', cf.name,
                    'label', cf.label,
                    'value', cfa.value,
                    'custom_field_id',cfa.custom_field_id,
                    'interview_id',cfa.interview_id
                )
            ) AS custom_fields
        FROM interview_custom_fields cfa
        LEFT JOIN ${config_db}.custom_fields cf ON cfa.custom_field_id = cf.id
        WHERE cfa.interview_id = :id
        GROUP BY cfa.interview_id
    )
    SELECT
        ji.*,
        sc.unique_id AS submission_unique_id,
        CONCAT(c.first_name, ' ', c.last_name) AS candidate_name,
        JSON_OBJECT(
                'id', c.id,
                'first_name', c.first_name,
                'middle_name', c.middle_name,
                'last_name', c.last_name,
                'do_not_rehire', c.do_not_rehire,
                'do_not_rehire_reason', c.do_not_rehire_reason,
                'do_not_rehire_notes', c.do_not_rehire_notes
        ) AS candidate,
        JSON_OBJECT(
                'id', jm.id,
                'job_id', jm.job_id,
                'job_status',jm.status,
                'job_templates', JSON_OBJECT(
                    'template_name', jtm.template_name,
                    'id', jtm.id
                )
          ) AS job,
        schedules_agg.schedules,
        attendees_agg.additional_attendees,
        feedback_agg.interview_feedback,
        -- Add location details here
        JSON_OBJECT(
            'id', wl.id,
            'name', wl.name
        ) AS location,
        -- Add custom fields here
        custom_fields_agg.custom_fields
    FROM interviews ji
    LEFT JOIN schedules_agg ON ji.id = schedules_agg.interview_id
    LEFT JOIN attendees_agg ON ji.id = attendees_agg.interview_id
    LEFT JOIN feedback_agg ON ji.id = feedback_agg.interview_id
    LEFT JOIN jobs jm ON ji.job_id = jm.id
    LEFT JOIN ${config_db}.job_templates jtm ON jm.job_template_id = jtm.id
    LEFT JOIN submission_candidate sc ON ji.submission_id = sc.id
    LEFT JOIN ${config_db}.candidates c ON ji.submit_candidate_id = c.id
    LEFT JOIN ${config_db}.work_locations wl ON ji.location = wl.id  -- Join with work_location table to fetch location details
    LEFT JOIN custom_fields_agg ON ji.id = custom_fields_agg.interview_id  -- Join with custom fields aggregation
    WHERE ji.program_id = :program_id AND ji.id = :id
    LIMIT 1;
    `;

    const replacements = {
      id,
      program_id,
    };

    const result = await sequelize.query<JobInterviewData>(sql, {
      replacements,
      type: QueryTypes.SELECT,
    });

    if (result[0] && result[0].additional_attendees) {
      result[0].additional_attendees.forEach(
        (attendee: { is_interviewer: number | boolean }) => {
          attendee.is_interviewer = attendee.is_interviewer === 1;
        }
      );
    }

    return result[0];
  }

  async getInterviewsForCandidate(
    job_id: string,
    candidate_id: string,
    program_id: string,
  ): Promise<Interview[]> {
    const sql = `
    WITH schedules_agg AS (
        SELECT DISTINCT s.interview_id,
            JSON_ARRAYAGG(
               JSON_OBJECT(
                    'id', s.id,
                    'duration', s.duration,
                    'interview_date', s.interview_date,
                    'start_time', s.start_time,
                    'end_time', s.end_time,
                    'status', s.status
                )
            ) AS schedules
        FROM interview_schedules s
        WHERE s.interview_id IN (
            SELECT ji.id
            FROM interviews ji
            WHERE ji.program_id = :program_id
            AND ji.submit_candidate_id = :candidate_id
            AND ji.job_id = :job_id
        )
        GROUP BY s.interview_id
    ),
    attendees_agg AS (
        SELECT DISTINCT aa.interview_id,
            JSON_ARRAYAGG(
               JSON_OBJECT(
                    'id', aa.id,
                    'candidate_phone', aa.candidate_phone,
                    'external_participant_email', aa.external_participant_email,
                    'is_interviewer', CASE WHEN aa.is_interviewer = 1 THEN true ELSE false END,
                    'user_id',u.user_id,
                    'participants_details', JSON_OBJECT(
                        'first_name', u.first_name,
                        'last_name', u.last_name
                    )
                )
            ) AS additional_attendees
        FROM interview_participants aa
        LEFT JOIN ${config_db}.user u ON aa.participant_id = u.user_id AND u.program_id = :program_id
        WHERE aa.interview_id IN (
            SELECT ji.id
            FROM interviews ji
            WHERE ji.program_id = :program_id
            AND ji.submit_candidate_id = :candidate_id
            AND ji.job_id = :job_id
        )
        GROUP BY aa.interview_id
    ),
    feedback_agg AS (
        SELECT DISTINCT ifb.interview_id,
           JSON_ARRAYAGG(
                JSON_OBJECT(
                    'id', ifb.id,
                    'outcome', ifb.outcome,
                    'rating', ifb.rating,
                    'vendor_notes', ifb.vendor_notes
                )
            ) AS interview_feedback
        FROM interview_reviews ifb
        WHERE ifb.interview_id IN (
            SELECT ji.id
            FROM interviews ji
            WHERE ji.program_id = :program_id
            AND ji.submit_candidate_id = :candidate_id
            AND ji.job_id = :job_id
        )
        GROUP BY ifb.interview_id
    ),
    custom_fields_agg AS (
        SELECT cfa.interview_id,
            JSON_ARRAYAGG(
                JSON_OBJECT(
                    'id', cf.id,
                    'name', cf.name,
                    'label', cf.label
                )
            ) AS custom_fields
        FROM interview_custom_fields cfa
        LEFT JOIN ${config_db}.custom_fields cf ON cfa.custom_field_id = cf.id
        WHERE cfa.interview_id IN (
            SELECT ji.id
            FROM interviews ji
            WHERE ji.program_id = :program_id
            AND ji.submit_candidate_id = :candidate_id
            AND ji.job_id = :job_id
        )
        GROUP BY cfa.interview_id
    ),
    location_agg AS (
        SELECT ji.id,
            JSON_OBJECT(
                'id', wl.id,
                'name', wl.name
            ) AS location
        FROM interviews ji
        LEFT JOIN ${config_db}.work_locations wl ON ji.location = wl.id
        WHERE ji.program_id = :program_id
        AND ji.submit_candidate_id = :candidate_id
        AND ji.job_id = :job_id
    ),
    created_by_user_agg AS (
      SELECT
        u.user_id,
        u.program_id AS user_program_id,
        u.user_type,
        JSON_OBJECT(
          'user_id', u.user_id,
          'first_name', u.first_name,
          'last_name', u.last_name
        ) AS created_by
      FROM ${config_db}.user u
    )
    SELECT DISTINCT
        ji.*,
        schedules_agg.schedules,
        attendees_agg.additional_attendees,
        feedback_agg.interview_feedback,
        CASE
        WHEN created_by_user_agg.user_type = 'super_user' THEN created_by_user_agg.created_by
        WHEN created_by_user_agg.user_program_id = :program_id THEN created_by_user_agg.created_by
        ELSE NULL
        END AS created_by
    FROM interviews ji
    LEFT JOIN schedules_agg ON ji.id = schedules_agg.interview_id
    LEFT JOIN attendees_agg ON ji.id = attendees_agg.interview_id
    LEFT JOIN feedback_agg ON ji.id = feedback_agg.interview_id
    LEFT JOIN created_by_user_agg ON ji.created_by = created_by_user_agg.user_id
    WHERE ji.program_id = :program_id
    AND ji.submit_candidate_id = :candidate_id
    AND ji.job_id = :job_id
    GROUP BY ji.id;
    `;

    const replacements = {
      program_id,
      candidate_id,
      job_id,
    };

    const interviews = await sequelize.query<Interview>(sql, {
      replacements,
      type: QueryTypes.SELECT,
    });

    interviews.forEach((interview) => {
      if (interview.additional_attendees) {
        interview.additional_attendees.forEach((attendee) => {
          attendee.is_interviewer =
            !!(attendee.is_interviewer as unknown as number);
        });
      }
    });

    return interviews;
  }

  async programQuery(program_id: string): Promise<{
    unique_id: string; name: string
  }[]> {
    const query = `
              SELECT
                  programs.name,
                  programs.unique_id
              FROM ${config_db}.programs
              WHERE programs.id = :program_id;
          `;

    const data = await sequelize.query<{ name: string, unique_id: string }>(query, {
      replacements: { program_id },
      type: QueryTypes.SELECT,
    });

    return data;
  }

  async findUser(participant_id: string, program_id: string): Promise<UserInterface | undefined> {
    const userQuery = `
          SELECT first_name, last_name
          FROM ${config_db}.user
          WHERE user_id = :participant_id AND program_id =:program_id
          LIMIT 1;
        `;

    const [user] = await sequelize.query<UserInterface>(userQuery, {
      replacements: { participant_id, program_id },
      type: QueryTypes.SELECT,
    });

    return user;
  }

  async findInterviewDataForVendor(
    program_id: string,
    vendor_id: string,
  ): Promise<any> {
    const query = `
      SELECT
    i.id,
    i.title,
    MAX(DATE(s.start_time)) AS start_date,
    MAX(DATE(s.end_time)) AS end_date,
    MAX(s.interview_date) AS interview_date,
    i.status,
    CONCAT_WS(' ', c.first_name, c.last_name) AS candidate_name
FROM interviews i
LEFT JOIN interview_schedules s ON i.id = s.interview_id
LEFT JOIN ${config_db}.candidates c ON i.submit_candidate_id = c.id
WHERE i.program_id = :program_id
  AND i.vendor_id = :vendor_id
GROUP BY i.id, i.title, i.status, candidate_name;

    `;
    const result = await sequelize.query(query, {
      replacements: { program_id, vendor_id },
      type: QueryTypes.SELECT,
    });
    return result;
  }

  async findInterviewDataForClient(
    program_id: string,
    job_ids: string[],
  ): Promise<any> {
    if (!job_ids || job_ids.length === 0) {
    return []; 
  }
    const query = `
      SELECT
    i.id,
    i.title,
    MAX(DATE(s.start_time)) AS start_date,
    MAX(DATE(s.end_time)) AS end_date,
    MAX(s.interview_date) AS interview_date,
    i.status,
    CONCAT_WS(' ', c.first_name, c.last_name) AS candidate_name
FROM interviews i
LEFT JOIN interview_schedules s ON i.id = s.interview_id
LEFT JOIN ${config_db}.candidates c ON i.submit_candidate_id = c.id
WHERE i.program_id = :program_id
AND i.job_id IN (:job_ids)
GROUP BY i.id, i.title, i.status;

    `;
    const result = await sequelize.query(query, {
      replacements: { program_id, job_ids },
      type: QueryTypes.SELECT,
    });
    return result;
  }

  async findInterviewDataForSuperAdmin(
    program_id: string,
  ): Promise<any> {
    const query = `
      SELECT
    i.id,
    i.title,
    MAX(DATE(s.start_time)) AS start_date,
    MAX(DATE(s.end_time)) AS end_date,
    MAX(s.interview_date) AS interview_date,
    i.status,
    CONCAT_WS(' ', c.first_name, c.last_name) AS candidate_name
FROM interviews i
LEFT JOIN interview_schedules s ON i.id = s.interview_id
LEFT JOIN ${config_db}.candidates c ON i.submit_candidate_id = c.id
WHERE i.program_id = :program_id
GROUP BY i.id, i.title, i.status, candidate_name;

    `;
    const result = await sequelize.query(query, {
      replacements: { program_id },
      type: QueryTypes.SELECT,
    });
    return result;
  }
  // dashboard statstics
  async getSoursingStatisticsCountsForVendor(vendor_id: string | undefined, program_id: string) {
    const queryInterviews = `
  SELECT
  'interviews' AS source,
  COUNT(*) AS total,
  SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_count,
  SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancled_count,
  SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_count,
  SUM(CASE WHEN status = 'PENDING_CONFIRMATION' THEN 1 ELSE 0 END) AS pending_confirmation_count,
  SUM(CASE WHEN status = 'ACCEPTED' THEN 1 ELSE 0 END) AS accepted_count,
  SUM(CASE WHEN status = 'PENDING_ACCEPTANCE' THEN 1 ELSE 0 END) AS pending_acceptance_count
FROM interviews
  WHERE vendor_id = ? AND program_id = ? AND is_deleted = false;
`;

    const [interviewStatistics] = await sequelize.query(queryInterviews, {
      replacements: [vendor_id, program_id],
      type: QueryTypes.SELECT,
    });
    return interviewStatistics;
  }
  async getSoursingStatisticsCountsForSuperAdmin(program_id: string) {
    const queryInterviews = `
  SELECT
  'interviews' AS source,
  COUNT(*) AS total,
  SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_count,
  SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS canceled_count,
  SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_count,
  SUM(CASE WHEN status = 'PENDING_CONFIRMATION' THEN 1 ELSE 0 END) AS pending_confirmation_count,
  SUM(CASE WHEN status = 'ACCEPTED' THEN 1 ELSE 0 END) AS accepted_count,
  SUM(CASE WHEN status = 'PENDING_ACCEPTANCE' THEN 1 ELSE 0 END) AS pending_acceptance_count
FROM interviews
  WHERE program_id = ?
  AND is_deleted = false;
`;

    const [interviewStatistics] = await sequelize.query(queryInterviews, {
      replacements: [program_id],
      type: QueryTypes.SELECT,
    });
    return interviewStatistics;
  }
  async getSourcingStatisticsCountsForClient(program_id: string, job_ids: string[]) {
    const queryInterviews = `
      SELECT
        'interviews' AS source,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_count,
        SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancled_count,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_count,
        SUM(CASE WHEN status = 'PENDING_CONFIRMATION' THEN 1 ELSE 0 END) AS pending_confirmation_count,
        SUM(CASE WHEN status = 'ACCEPTED' THEN 1 ELSE 0 END) AS accepted_count,
        SUM(CASE WHEN status = 'PENDING_ACCEPTANCE' THEN 1 ELSE 0 END) AS pending_acceptance_count
      FROM interviews
      WHERE program_id = :program_id
      AND is_deleted = false
      AND job_id IN (:job_ids);
    `;

    const [interviewStatistics] = await sequelize.query(queryInterviews, {
      replacements: { program_id, job_ids },
      type: QueryTypes.SELECT,
    });

    return interviewStatistics;
  }

  async getStatusCountInterviews(vendor_id: string | undefined, program_id: string): Promise<any> {
    const query = `
        SELECT
            CAST(SUM(CASE WHEN status = 'PENDING_ACCEPTANCE' THEN 1 ELSE 0 END) AS SIGNED) AS pending_acceptance_count,
            CAST(SUM(CASE WHEN status = 'ACCEPTED' THEN 1 ELSE 0 END) AS SIGNED) AS accepted_count
        FROM interviews
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
            CAST(SUM(CASE WHEN status = 'PENDING_CONFIRMATION' THEN 1 ELSE 0 END) AS SIGNED) AS pending_confirmation_count,
            CAST(SUM(CASE WHEN status = 'ACCEPTED' THEN 1 ELSE 0 END) AS SIGNED) AS accepted_count
        FROM interviews
        WHERE  program_id = :program_id
        AND is_deleted = false
          `;
    const [result] = await sequelize.query(query, {
      replacements: { program_id },
      type: QueryTypes.SELECT,
    });
    return result;
  }

  async getStatusCountClientInterview(program_id: string, job_ids: string[]): Promise<any> {
    if (!job_ids || job_ids.length === 0) {
    return {
      pending_confirmation_count: 0,
      accepted_count: 0
    };
  }
    const query = `
      SELECT
          COUNT(CASE WHEN i.status = 'PENDING_CONFIRMATION' THEN 1 END) AS pending_confirmation_count,
          COUNT(CASE WHEN i.status = 'ACCEPTED' THEN 1 END) AS accepted_count
      FROM interviews i
      WHERE i.program_id = :program_id
      AND i.is_deleted = false
      AND i.job_id IN (:job_ids);
    `;

    const result = await sequelize.query(query, {
      replacements: { program_id, job_ids },
      type: QueryTypes.SELECT,
    });
    return result.length > 0 ? result[0] : { pending_confirmation_count: 0, accepted_count: 0 };
  }

}

export default InterviewRepository;
