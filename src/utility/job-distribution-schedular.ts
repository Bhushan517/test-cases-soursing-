import cron from 'node-cron';
import { QueryTypes } from 'sequelize';
import JobDistributionModel from "../models/job-distribution.model";
import JobModel from "../models/job.model";
import SubmissionCandidateModel from "../models/submission-candidate.model";
import { sequelize } from '../config/instance';
import { databaseConfig } from '../config/db';

const config_db = databaseConfig.config.database_config;

export function runJobDistributionSchedular() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      console.log("[CronJob] Running Job Distribution Scheduler...");

      const jobDistributions = await JobDistributionModel.findAll({
        where: { status: 'scheduled' },
      });

      for (const jobDist of jobDistributions) {
        const job = await JobModel.findOne({ where: { id: jobDist.job_id } });
        if (!job) continue;

        const [jobTemplate] = await sequelize.query<{ distribution_schedule: any, id: any }>(
          `SELECT * FROM ${config_db}.job_templates WHERE id = :jobTemplateId LIMIT 1`,
          {
            replacements: { jobTemplateId: job.job_template_id },
            type: QueryTypes.SELECT,
          }
        );
        if (!jobTemplate) continue;

        const [vendorScheduleDetail] = await sequelize.query<{ condition: any, measure_unit: string, duration: number, id: any }>(
          `SELECT * FROM ${config_db}.vendor_dist_schedule_details
           WHERE distribution_id = :distributionId
           AND (
            JSON_CONTAINS(vendors, JSON_ARRAY(:vendorId)) 
            OR JSON_CONTAINS(vendor_group_ids, JSON_ARRAY(:vendorGroupId))
           )
           LIMIT 1`,
          {
            replacements: {
              distributionId: jobTemplate.distribution_schedule,
              vendorId: jobDist.vendor_id,
              vendorGroupId: jobDist.vendor_group_id
            },
            type: QueryTypes.SELECT,
          }
        );
        if (!vendorScheduleDetail) continue;

        const { condition, measure_unit, duration } = vendorScheduleDetail;

        const now = Date.now();
        const createdOn = Number(jobDist.created_on);
        const diffInMs = now - createdOn;

        let shouldDistributeByTime = false;

        if (measure_unit && duration) {
          switch (measure_unit.toLowerCase()) {
            case 'hours':
              shouldDistributeByTime = diffInMs >= duration * 60 * 60 * 1000;
              break;
            case 'days':
              shouldDistributeByTime = diffInMs >= duration * 24 * 60 * 60 * 1000;
              break;
            case 'weeks':
              shouldDistributeByTime = diffInMs >= duration * 7 * 24 * 60 * 60 * 1000;
              break;
            default:
              console.log(`[CronJob] Unknown measure_unit: ${measure_unit}`);
          }
        }

        let shouldDistributeByCondition = condition ? false : true;

        if (condition) {
          const submissionCount = await SubmissionCandidateModel.count({
            where: { job_id: jobDist.job_id },
          });

          const { field, value, operator } = condition;
          const lowerCaseField = field ? field.toLowerCase() : '';

          shouldDistributeByCondition = (lowerCaseField == 'submissions') ? false : true;

          if (lowerCaseField === 'submissions') {
            switch (operator) {
              case '>':
                shouldDistributeByCondition = submissionCount > value;
                break;
              case '<':
                shouldDistributeByCondition = submissionCount < value;
                break;
              case '=':
                shouldDistributeByCondition = submissionCount == value;
                break;
              default:
                console.log(`[CronJob] Unknown operator: ${operator}`);
            }
          }
        }

        if (shouldDistributeByCondition && shouldDistributeByTime) {
          await JobDistributionModel.update(
            {
              status: 'distributed',
              distribution_date: Date.now(),
              opt_status_date: jobDist.opt_status ? Date.now() : null
            },
            { where: { id: jobDist.id } }
          );
          console.log(`[CronJob] Job Distribution ${jobDist.id} marked as 'distributed'`);
        }
      }

      console.log('[CronJob] Job Distribution Scheduler completed.');

    } catch (error) {
      console.error('[CronJob] Error running job distribution scheduler:', error);
    }
  });
}
