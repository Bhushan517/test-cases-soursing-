import { FastifyRequest, FastifyReply } from "fastify";
import OfferModel from "../models/offer.model";
import { OfferInterface } from "../interfaces/offer.interface";
import generateCustomUUID from "../utility/genrateTraceId";
import { sequelize } from "../config/instance";
import { Op, QueryTypes, Transaction } from "sequelize";
import {
  calculateBudget,
  calculateWorkingDaysWithHolidays,
  getJobIdsForUserType,
} from "./job.controller";
import { accuracyType, JobInterface } from "../interfaces/job.interface";
import OfferCustomFieldModel from "../models/offer-custom-fields.model";
import OfferMasterDataModel from "../models/offer-master-data.model";
import SubmissionCandidateModel from "../models/submission-candidate.model";
import OfferHierachy from "../models/offer-hierarchy.model";
import OfferRepository from "../repositories/offer.repository";
import { ApprovalworkflowQuery, jobWorkflowQuery } from "../utility/queries";
import { createWorkflowStepsByChecklistTaskMapping, getSubsequentTrigger, getChecklistTaskMappings, OFFER_CREATION, getBaseTriggersStepCounts } from '../utility/onboarding-util';
import { decodeToken } from "../middlewares/verifyToken";
import { credentialingService } from "../external-services/credentialing-service";
import { logger } from "../utility/loggerServices";
import InterviewRepository from "../repositories/interview.repository";
const interviewRepository = new InterviewRepository();
import { notifyJobManager, getJobData, getOfferData, getCandidate, determineUserType, getProgramVendorsEmail } from '../utility/notification-helper'; // Adjust the path accordingly
import axios from 'axios';
import { createAssignment, fetchCustomFields, fetchMasterData, fetchRates, formatShiftDateFromTimestamp, generateAssignmentPayload, mapFeeDetails } from "../utility/assignment_save";
import generateSlug from "../plugins/slugGenerate";
import JobModel from "../models/job.model";
import { databaseConfig } from '../config/db';
import JobRepository from "../repositories/job.repository";
import { NotificationEventCode } from "../utility/notification-event-code";
import { fetchEventId, fetchManagerIds, fetchModuleId, fetchWorkflow, getEventIdFromModule, getPendingWorkflow, getUsersStatus, updateExternalWorkflow, updateWorkflowLevels, workflowTriggering } from "../utility/job_workflow";
import GlobalRepository from "../repositories/global.repository";
import { Status } from "../utility/enum/status_enum";
import OfferNotificationService from "../notification/offer-notification-service";
const offerNotificationService = new OfferNotificationService();
import { CandidateHistoryService } from "../utility/candidate_history_helper";
import { OfferService } from "../services/offer.service";
import { handleError } from "../utility/errorHandler";
import Reply from "../utility/response.utility";
import messages from "../language/language";
import JobDistributionModel from "../models/job-distribution.model";

const jobRepository = new JobRepository();
const config_db = databaseConfig.config.database_config;
const offerRepository = new OfferRepository();
const candidateHistoryService = new CandidateHistoryService(sequelize);
const offerService = new OfferService();

export async function getAllOffers(request: any, reply: any) {
  const response = new Reply("offers");
  const traceId = generateCustomUUID();

  try {
    const result = await offerService.getAllOffers(request);

    if (!result || result.status_code !== 200) {
      throw new Error(result?.error || 'Unknown error');
    }

    response.statusCode = 200;
    response.message = messages.OFFER_FETCHED_SUCCESSFULLY;
    response.setMainData(result.offers || []);
    response.total_records = result.total_records;
    response.total_pages = result.total_pages;
    response.current_page = result.current_page;
    response.page_size = result.page_size;
    response.items_per_page = result.items_per_page;
    response.traceId = traceId;

    return response.sendResponse(reply);
  } catch (error: any) {
    console.error(`trace_id: ${traceId}, Error:`, error);
    response.statusCode = 500;
    response.message = messages.OFFER_FETCH_FAILED;
    response.error = (error.message || error).replace('Error: ', '');
    response.traceId = traceId;
    return response.sendResponse(reply);
  }
}

export async function offerAdvanceFilter(
  request: FastifyRequest<{
    Body: { OfferInterface: OfferInterface, use_user_hierarchy: boolean, job_id?: string, job_ids?: string[], candidate_name?: string, status?: string[], updated_on?: string, created_on?: string, candidate_unique_id?: string, page?: string, limit?: string, program_id: string, [key: string]: any; };
  }>,
  reply: FastifyReply
) {
  const response = new Reply("offers");
  const traceId = generateCustomUUID();
  try {
    const result = await offerService.offerAdvanceFilter({
      body: request.body,
      user: request.user,
      params: request.params
    });
    if (!result || result.status_code !== 200) {
      throw new Error(result?.error || 'Unknown error');
    }
    response.statusCode = 200;
    response.message = messages.OFFER_FETCHED_SUCCESSFULLY;
    response.setMainData(result.offers || []);
    response.total_records = result.total_records;
    response.total_pages = result.total_pages;
    response.current_page = result.current_page;
    response.page_size = result.page_size;
    response.items_per_page = result.items_per_page;
    response.traceId = traceId;
    return response.sendResponse(reply);
  } catch (error: any) {
    console.error(`trace_id: ${traceId}, Error:`, error);
    response.statusCode = 500;
    response.message = messages.OFFER_FETCH_FAILED;
    response.error = (error.message || error).replace('Error: ', '');
    response.traceId = traceId;
    return response.sendResponse(reply);
  }
}

export async function getOfferById(request: FastifyRequest, reply: FastifyReply) {
  try {
    const result = await offerService.getOfferById(request, reply);
    
    return reply.status(result.status_code).send({
      status_code: result.status_code,
      trace_id: result.trace_id,
      message: result.message,
      offer: result.offer,
    });
  } catch (error: any) {
    return reply.status(error.status_code || 500).send({
      trace_id: error.trace_id,
      message: error.message,
      error: error.error,
    });
  }
}

export async function getCounterOffer(request: FastifyRequest, reply: FastifyReply) {
  try {
    const result = await offerService.getCounterOffer(request, reply);
    
    return reply.status(result.status_code).send({
      trace_id: result.trace_id,
      message: result.message,
      counter_offer: result.counter_offer,
      ...(result.error && { error: result.error })
    });
  } catch (error: any) {
    return reply.status(error.status_code || 500).send({
      trace_id: error.trace_id,
      message: error.message,
      error: error.error || error,
    });
  }
}

export async function createOffer(request: FastifyRequest, reply: FastifyReply) {
  try {
    const result = await offerService.createOffer(request, reply);
    
    return reply.status(result.status_code).send({
      status_code: result.status_code,
      trace_id: result.trace_id,
      message: result.message,
      ...(result.id && { id: result.id }),
      ...(result.error && { error: result.error })
    });
  } catch (error: any) {
    return reply.status(error.status_code || 500).send({
      trace_id: error.trace_id,
      message: error.message,
      error: error.error || error,
    });
  }
}




export async function updateWorkflowReview(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { program_id, id, job_workflow_id } = request.params as { program_id: string, id: string, job_workflow_id: string };
  // const { id } = request.params as { id: string };
  const dataToUpdate: any = request.body as OfferInterface;
  const traceId = generateCustomUUID();
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ message: 'Unauthorized - Token not found' });
  }
  const token = authHeader.split(' ')[1];
  const user = await decodeToken(token);
  const userId: any = user?.sub;
  const isSuperUser = user?.userType === "super_user";
  if (!user) {
    return reply.status(401).send({ message: 'Unauthorized - Invalid token' });
  }
  const transaction = await sequelize.transaction();

  try {
    const userResult = await getUsersStatus(sequelize, userId);
    let userData = userResult[0] as any
    const offer: any = await OfferModel.findOne({ where: { program_id, id }, transaction });
    let isUpdatedFlag
    if (!offer) {
      await transaction.rollback();
      return reply.status(400).send({
        trace_id: traceId,
        message: "Job Offer Not Found",
        offer: [],
      });
    }
    const updates = dataToUpdate.updates; // Single object
    console.log('updates:', updates)
    if (updates) {
      const query = `
      SELECT *
      FROM ${config_db}.workflow
      WHERE id = :job_workflow_id
      AND program_id = :program_id
      LIMIT 1;
  `;
      let result: any
      const workflowData = await sequelize.query(query, {
        type: QueryTypes.SELECT,
        replacements: {
          job_workflow_id, program_id,
        },
      });

      let workflow: any = workflowData[0];
      let impersonator_id: any
      if (user.impersonator) {
        impersonator_id = user.impersonator.id || null
      }
      // const workflow = await JobWorkFlowModel.findOne({ where: { id: job_workflow_id, program_id: program_id } });
      if (!workflow) {
        return reply.status(200).send({
          status_code: 200,
          message: "Workflow data not found!",
          trace_id: traceId,
        });
      }

      let levels = workflow.levels || [];
      const updatedLevels = await updateWorkflowLevels(
        workflow,
        updates,
        userData,
        impersonator_id,
        isSuperUser,
        sequelize
      );
      let allLevelsAfterFirstCompleted = true;
      let workflowStatus = "completed";

      for (const level of levels) {
        if (level.status === "pending") {
          allLevelsAfterFirstCompleted = false;
          break;
        }
      }


      workflowStatus = allLevelsAfterFirstCompleted ? "completed" : "pending";
      workflow.status = workflowStatus;
      console.log('workflowStatus', workflowStatus);
      workflow.status = workflowStatus;

      if (updatedLevels) {
        const workflow_update = await updateExternalWorkflow(
          workflow,
          workflowStatus,
          program_id,
          job_workflow_id,
          authHeader
        );
        console.log('workflow_update', workflow_update);
      }

      const jobs = await getJobData(sequelize, offer.dataValues.job_id)
      console.log("Job data :", jobs)
      const offers = await getOfferData(sequelize, id)
      console.log("offer data :", offers)
      let offerInterface = request.body as OfferInterface
      const job = `SELECT * FROM jobs WHERE id = :jobId LIMIT 1;`;
      const jobRequest: any = await sequelize.query(job, {
        type: QueryTypes.SELECT,
        replacements: { jobId: updates.job_id },
      });

      let jobDatas = jobRequest[0];

      const job_max_bill_rate = jobDatas?.max_bill_rate
      const offer_max_bill_rate = dataToUpdate?.financial_details?.billRateValue?.bill_rate
      let is_offer_rate_greater = false

      if (Number(offer_max_bill_rate) > Number(job_max_bill_rate)) {
        is_offer_rate_greater = true;
      }

      const managers = await fetchManagerIds(dataToUpdate);

      jobDatas.is_offer_rate_greater = is_offer_rate_greater;
      dataToUpdate.is_offer_rate_greater = is_offer_rate_greater;
      dataToUpdate.job_managers = managers?.job_manager_id;
      dataToUpdate.timesheet_manager_id = managers?.timesheet_manager_id
      dataToUpdate.expense_manager_id = managers?.expense_manager_id
      dataToUpdate.duration = dataToUpdate?.financial_details?.billRateValue?.duration_in_days
      dataToUpdate.offer_budget = dataToUpdate?.financial_details?.billRateValue?.budget
      let allPayload = {
        program_id: program_id,
        hierarchy_ids: offerInterface.hierarchy,
        user_type: ['msp']

      }
      const payload: any = {
        job_id: jobs[0].job_id,
        offer_id: offers[0].offer_code
      };
      const jobData = await JobModel.findOne({ where: { id: offer.dataValues.job_id, program_id: program_id } });
      const submission = await SubmissionCandidateModel.findOne({ where: { candidate_id: offer.dataValues.candidate_id, program_id: program_id, job_id: offer.dataValues.job_id } })

      const handleWorkflowCompletion = async (workflow: any, request: FastifyRequest, reply: FastifyReply, offer: any, sequelize: any, program_id: string, user: any, traceId: string, token: string) => {
        let result: any;
        if (workflow.events === "counter_offer") {
          // result = await updateOfferStatusForWorkflow(request, reply, offer, submission, sequelize);
          // await offer.update({ status: result.status })
          // await submission?.update({ status: result.submissionStatus })
          const eventCode = "COUTNER_OFFER_REVIEW_COMPLETE"

          //send notification to manager,msp ,vendor users
          offerNotificationService.sendNotificationsForUserType(request, reply, program_id, jobData?.dataValues.job_manager_id, eventCode, payload, allPayload, updates)
        } else if (workflow.events === "create_offer") {

          // result = await updateOfferStatusForWorkflow(request, reply, offer, submission, sequelize);
          // console.log('After workflow done status result', result);
          // await offer.update({ status: result.status })
          // await submission?.update({ status: result.submissionStatus })


          const eventCode = "OFFER_REVIEW_COMPLETE"
          //send notification to manager,msp ,vendor users
          offerNotificationService.sendNotificationsForUserType(request, reply, program_id, jobData?.dataValues.job_manager_id, eventCode, payload, allPayload, updates)
        }
        return result;
      };
      if (updates) {
        const workflow = await fetchWorkflow(sequelize, program_id, job_workflow_id);
        if (!workflow) {
          return reply.status(404).send({
            status_code: 404,
            message: "Workflow data not found!",
            trace_id: traceId,
          });
        }
        console.log("workflow 23", workflow);


        if (updatedLevels) {
          if (workflowStatus === "completed") {
            let workflow_slug = workflow.events;
            console.log("workflow_slug", workflow_slug);
            console.log("workflow.flow_type", workflow.flow_type);


            if (workflow.flow_type?.toLowerCase() === 'review') {
              const oldData = { program_id: offer?.program_id, candidate_id: offer?.candidate_id, vendor_id: submission?.vendor_id, job_id: submission?.job_id, status: submission?.dataValues.status, updated_by: userId };
              const newData = { program_id: offer?.program_id, candidate_id: offer?.candidate_id, vendor_id: submission?.vendor_id, status: "review", job_id: submission?.job_id, updated_by: userId };

              let action = "Offer Reviewed";
              if (workflow_slug === "counter_offer") {
                action = dataToUpdate.status === "approved" ? "Counter Offer Approved" : "Counter Offer Reviewed";
              } else if (workflow_slug === "create_offer") {
                action = dataToUpdate.status === "approved" ? "Offer Approved" : "Offer Reviewed";
              }
              await candidateHistoryService.handleCandidateHistory({ program_id, oldData, newData, action, });

              console.log('Inside the apporval trigger for workflow.')

              const EVENT_SLUG = workflow_slug;
              const module_name = "Offers";
              const approval_method = 'approval'
              const TYPE = "workflow"
              const placement_order = "0"
              const moduleId = await fetchModuleId(module_name);
              console.log('moduleId', moduleId);
              const eventId = await fetchEventId(moduleId, EVENT_SLUG, TYPE);
              console.log('eventId', eventId)

              const workflow: any = await getPendingWorkflow(dataToUpdate, moduleId, eventId, program_id, placement_order, approval_method)
              console.log('workflow pending', workflow);


              if (dataToUpdate.status != "approved") {
                console.log('inside the  status of ')
                console.log("workflow", workflow);

                const event_slug = workflow_slug;
                let hasEmptyLevels = workflow?.rows.some((row: any) =>
                  !row.levels ||
                  row?.levels?.length === 0 ||
                  row.levels?.every((level: any) => !level?.recipient_types || level?.recipient_types?.length === 0)
                );
                console.log('has empty levelsss', hasEmptyLevels);
                if (!hasEmptyLevels) {

                  let jobs = await workflowTriggering(request, reply, program_id, workflow?.rows, offer, dataToUpdate, jobDatas, module_name, false, dataToUpdate.job_id, event_slug);

                  if (jobs) {
                    if (jobs.workflow_status === "completed") {
                      await offer.update({ status: "Pending Acceptance" });
                      await submission?.update({ status: "Offer Pending Acceptance" })
                      if (event_slug?.toLowerCase() === "counter_offer") {
                        await approveCounterOffer(offer, transaction, userId);
                      }
                    } else {
                      await offer.update({ status: "Pending Approval" });
                      await submission?.update({ status: "Offer Pending Approval" })
                      if (event_slug?.toLowerCase() === "counter_offer") {
                        await offer.update({ status: "Pending Approval" });
                        await submission?.update({ status: "Counter Offer Pending Approval" })
                      }
                    }
                  } else {
                    await offer.update({ status: "Pending Acceptance" });
                    await submission?.update({ status: "Offer Pending Acceptance" })
                    if (event_slug?.toLowerCase() === "counter_offer") {
                      await approveCounterOffer(offer, transaction, userId);
                    }
                  }
                }
              }
            }
            result = await handleWorkflowCompletion(workflow, request, reply, offer, sequelize, program_id, user, traceId, token);
          }
        }

      }
      if (workflow?.events !== "counter_offer") {
        await offer.update({ ...dataToUpdate, status: result?.status, updated_on: Date.now() });
      }
    }

    await transaction.commit();
    return reply.status(200).send({
      status_code: 200,
      trace_id: traceId,
      message: "offer reviwed Successfully.",
      id: id,
    });
  } catch (error: any) {
    console.log(error);

    await transaction.rollback();
    return reply.status(500).send({
      trace_id: traceId,
      message: "Internal Server Error",
      error: error.message,
    });
  }
}
export async function updateOfferStatusForWorkflow(request: FastifyRequest, reply: FastifyReply, existingJob: any, submission: any, sequelize: any) {
  try {
    // Query the workflow table to find data for the given existingJob ID
    const workflowQuery = `
            SELECT id, workflow_trigger_id, flow_type
            FROM ${config_db}.workflow
            WHERE workflow_trigger_id = :workflow_trigger_id
             AND is_updated=false
             AND is_deleted=false
             AND is_enabled=true
        `;

    const workflows = await sequelize.query(workflowQuery, {
      type: QueryTypes.SELECT,
      replacements: { workflow_trigger_id: existingJob.id },
    });

    if (!workflows.length) {
      return { message: 'No workflows found for the given ID', updated: false };
    }


    let updatedStatus = "Pending Acceptance";
    let submissionStatus = "Offer Pending Acceptance"
    for (const workflow of workflows) {
      if (workflow.flow_type == 'Approval' && workflow.status !== 'completed') {
        await existingJob.update({ status: "Pending Approval" });
        await submission.update({ status: "Offer Pending Approval" });
        updatedStatus = "Pending Approval";
        submissionStatus = "Offer Pending Approval";
        break;
      }
    }

    // If no workflow with 'Approval' was found, set status to 'OPEN'
    if (updatedStatus === "Pending Acceptance") {
      await existingJob.update({ status: "Pending Acceptance" });
      await submission.update({ status: "Offer Pending Acceptance" });
      updatedStatus = "Pending Acceptance";
      submissionStatus = "Offer Pending Acceptance";
    }


    if (updatedStatus) {
      return {
        // message: 'Job status updated successfully',
        status: updatedStatus,
        submissionStatus: submissionStatus,
        updated: true,
      };
    }

    return {
      message: 'No updates were made as the flow_type is not Approval',
      updated: false,
    };
  } catch (error) {
    console.error('Error updating job status:', error);
    return { message: 'Error updating job status', error, updated: false };
  }
}
export async function fetchUsersBasedOnHierarchy(allPayload: { hierarchy_ids: any[], program_id: any }) {
  try {
    const { hierarchy_ids, program_id } = allPayload;

    // Query to fetch users based on hierarchy_ids and program_id
    const query = `
        SELECT u.*
       FROM ${config_db}.user u
        WHERE u.program_id = :program_id
        AND u.user_type IN ('msp', 'vendor')
        AND (
            u.is_all_hierarchy_associate = true
            OR (
                u.is_all_hierarchy_associate = false
                AND EXISTS (
                    SELECT 1
                    FROM JSON_TABLE(
                        u.associate_hierarchy_ids,
                        '$[*]' COLUMNS (hierarchy_id INT PATH '$')
                    ) AS jt
                    WHERE jt.hierarchy_id IN (:hierarchy_ids)
                )
            )
        );
    `;

    const users = await sequelize.query(query, {
      type: QueryTypes.SELECT,
      replacements: {
        program_id: program_id,
        hierarchy_ids: hierarchy_ids,
      },
    });

    console.log("users", users);


    return users; // Return the list of users that match the criteria.
  } catch (error) {
    console.error("Error fetching users:", error);
    throw new Error("Error fetching users based on hierarchy and program_id.");
  }
}



export async function updateOffer(request: FastifyRequest, reply: FastifyReply) {
  const traceId = generateCustomUUID();
  const updateData = request.body as any;
  const transaction = await sequelize.transaction();
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ status_code: 401, message: 'Unauthorized - Token not found' });
  }
  const token = authHeader.split(' ')[1];
  const user = request.user
  const userId = user?.sub
  const { id, program_id } = request.params as { id: string, program_id: string };
  const userData = await offerRepository.findUser(program_id, userId);

  if (user?.userType !== "super_user" && (!userData || userData.length === 0)) {
    await transaction?.rollback();
    return reply.status(400).send({
      status_code: 400,
      trace_id: traceId,
      message: "User not found",
    });
  }

  let userType = user?.userType ?? userData[0]?.user_type ?? "";

  try {
    const dataToUpdate = request.body as OfferInterface;

    const offer = await OfferModel.findOne({ where: { id, program_id } });

    if (!offer) {
      await transaction.rollback();
      return reply.status(400).send({
        trace_id: traceId,
        message: "Job Offer Not Found",
        offer: [],
      });
    }
    const jobId = offer.job_id
    if (userType === "vendor") {
      await checkDistributionStatusForVendor(program_id, userType, jobId, userData, reply, traceId)
    }

    if (dataToUpdate.status?.toLocaleUpperCase() === "APPROVE") {
      if (offer.status?.toLocaleUpperCase() !== "PENDING APPROVAL") {
        throw new Error("Offer is not in pending approval status.");
      }
      try {
        await approveCounterOffer(offer, transaction, userId);
      } catch (approveError: any) {
        await transaction.rollback();
        console.log(approveError);

        return reply.status(400).send({
          trace_id: traceId,
          message: "Failed to approve the counter offer.",
          error: approveError.message,
        });
      }
    }

    if (dataToUpdate.status?.toUpperCase() === "ACCEPTED") {

      if (offer.status?.toUpperCase() === "ACCEPTED") {
        await transaction.rollback();
        return reply.status(200).send({
          trace_id: traceId,
          message: "Offer has already been accepted.",
        });
      }

      try {
        await acceptOffer(offer, userId, transaction, token);
        offerNotificationService.handleOfferStatusNotification(token, sequelize, program_id, offer, user, traceId, NotificationEventCode.OFFER_ACCEPT);
      } catch (acceptError: any) {
        await transaction.rollback();
        return reply.status(400).send({
          trace_id: traceId,
          message: "Failed to accept the offer.",
          error: acceptError.message,
        });
      }
    }


    if (dataToUpdate.status?.toUpperCase() === "REJECTED") {
      if (offer.status.toUpperCase() === "REJECTED") {
        await transaction.rollback();
        return reply.status(200).send({
          trace_id: traceId,
          message: "Offer has already been rejected.",
        });
      }
      await rejectOffer(offer, transaction, userId, request.headers?.authorization!, updateData);
      offerNotificationService.handleOfferStatusNotification(token, sequelize, program_id, offer, user, traceId, NotificationEventCode.OFFER_REJECT);
    }

    if (dataToUpdate.status?.toUpperCase() === "WITHDRAW") {
      if (offer.status?.toUpperCase() === "WITHDRAW") {
        await transaction.rollback();
        return reply.status(200).send({
          trace_id: traceId,
          message: "Offer has already been withdrawn.",
        });
      }
      try {
        await withdrawOffer(offer, transaction, userId, dataToUpdate);
      } catch (withdrawError: any) {
        await transaction.rollback();
        return reply.status(400).send({
          trace_id: traceId,
          message: "Failed to withdraw the offer.",
          error: withdrawError.message,
        });
      }
      offerNotificationService.handleOfferWithdrawalNotification(token, sequelize, program_id, offer, user, traceId);

    }

    await transaction.commit();

    return reply.status(200).send({
      status_code: 200,
      trace_id: traceId,
      message: "Data Updated Successfully.",
      id: id,
    });

  } catch (error: any) {
    console.error(`trace_id : ${traceId}, Error : `, error);
    await transaction.rollback();
    return reply.status(500).send({
      trace_id: traceId,
      message: "Internal Server Error",
      error: error.message,
      stack: error.stack
    });
  }
}




async function approveCounterOffer(offer: any, transaction: any, userId: string) {

  const { program_id, parent_offer_id, candidate_id, job_id } = offer;

  const parentOffer = await OfferModel.findOne({
    where: { id: parent_offer_id },
    transaction,
  });

  if (!parentOffer) {
    throw new Error("Parent offer not found.");
  }

  await offer.update(
    { status: "CLOSED", updated_by: userId, is_enabled: false },
    { transaction }
  );

  const customFields = await OfferCustomFieldModel.findAll({
    where: { offer_id: offer.id },
    transaction,
  });

  if (customFields?.length > 0) {
    await OfferCustomFieldModel.destroy({
      where: { offer_id: parent_offer_id },
      transaction,
    });

    await processCustomFields(
      parent_offer_id,
      customFields.map((field) => ({
        id: field.custom_field_id,
        value: field.value,
      })),
      transaction
    );
  }

  const foundationData = await OfferMasterDataModel.findAll({
    where: { offer_id: offer.id },
    transaction,
  });

  if (foundationData?.length > 0) {
    await processFoundationalData(
      parent_offer_id,
      foundationData.map((item) => ({
        foundation_data_type_id: item.foundation_data_type_id,
        foundation_data_ids: item.foundation_data_ids,
      })),
      transaction
    );
  }

  if (candidate_id) {
    await SubmissionCandidateModel.update(
      { status: "Offer Pending Acceptance" },
      {
        where: { candidate_id, program_id, job_id },
        transaction,
      }
    );
  }

  const offerData = offer.get({ plain: true });
  delete offerData.id;
  await parentOffer.update(
    {
      ...offerData,
      status: "Pending Acceptance",
      parent_offer_id: null,
    },
    { transaction }
  );

}

async function acceptOffer(offer: any, userId: string, transaction: any, token: any) {
  try {
    const job = await JobModel.findByPk(offer.job_id, { transaction });
    const program_id = offer.program_id;

    if (job?.status === "FILLED") {
      throw new Error("Offer cannot be accepted as the job is already filled.");
    }
    const candidateId = offer?.candidate_id;
    const vendorId = offer?.vendor_id;
    const oldStatus = offer?.status;
    if (offer.parent_offer_id) {
      await handleAcceptedStatus(offer, userId, transaction, token);
      const parentOffer = await OfferModel.findOne({
        where: { id: offer.parent_offer_id },
        transaction,
      });

      if (parentOffer) {
        await offer.update(
          { status: "CLOSED", updated_by: userId },
          { transaction }
        );

        const offerData = offer.get({ plain: true });
        delete offerData.id;

        await parentOffer.update(
          {
            ...offerData,
            status: "Accepted",
            parent_offer_id: null,
            created_by: parentOffer.created_by,
            created_on: parentOffer.created_on
          },
          { transaction }
        );

        if (offer.candidate_id) {
          await SubmissionCandidateModel.update(
            { status: "Offer Accepted" },
            {
              where: {
                candidate_id: offer.candidate_id,
                program_id,
                job_id: offer.job_id,
              },
              transaction,
            }
          );
          const oldData = { candidate_id: candidateId, vendor_id: vendorId, status: oldStatus, job_id: offer?.job_id, updated_by: userId };
          const newData = { candidate_id: candidateId, vendor_id: vendorId, status: "Accepted", job_id: offer?.job_id, updated_by: userId };
          await candidateHistoryService.handleCandidateHistory({ program_id, oldData, newData, action: "Offer Accepted" });
        }
      } else {
        console.warn("Parent offer not found.");
      }
    } else {
      await offer.update(
        { status: "Accepted", updated_by: userId },
        { transaction }
      );

      if (offer.candidate_id) {
        await SubmissionCandidateModel.update(
          { status: "Offer Accepted" },
          {
            where: {
              candidate_id: offer.candidate_id,
              program_id,
              job_id: offer.job_id,
            },
            transaction,
          }
        );
        const oldData = { candidate_id: candidateId, vendor_id: vendorId, status: oldStatus, job_id: offer?.job_id, updated_by: userId };
        const newData = { candidate_id: candidateId, vendor_id: vendorId, status: "Accepted", job_id: offer?.job_id, updated_by: userId };
        await candidateHistoryService.handleCandidateHistory({ program_id, oldData, newData, action: "Submission Offer Accepted" });
      }
      await handleAcceptedStatus(offer, userId, transaction, token);
    }
  } catch (error) {
    console.error("Error in acceptOffer:", error);
    throw error;
  }
}

async function rejectOffer(offer: any, transaction: any, userId: string, authorization: string, updateData: any) {
  const oldStatus = offer.dataValues.status
  const reason = updateData?.reason;
  await offer.update({ status: "Rejected", updated_by: userId, }, { transaction });
  const newStatus = offer.dataValues.status;
  const candidateId = offer.candidate_id;
  const vendorId = offer.vendor_id;
  const job_id = offer?.job_id;
  const oldData = { candidate_id: candidateId, vendor_id: vendorId, status: oldStatus, job_id: job_id, updated_by: userId };
  const newData = { candidate_id: candidateId, reason, vendor_id: vendorId, status: newStatus, job_id: job_id, updated_by: userId };
  await candidateHistoryService.handleCandidateHistory({ program_id: offer.dataValues.program_id, oldData, newData, action: 'Offer Rejected' });

  if (offer.parent_offer_id && candidateId) {
    await SubmissionCandidateModel.update(
      { status: "Counter Offer Rejected" },
      { where: { candidate_id: candidateId, program_id: offer?.program_id, job_id: offer.job_id }, transaction }
    );
    const newStatus = "Counter Offer Rejected";
    const newData = { candidate_id: candidateId, reason, vendor_id: vendorId, status: newStatus, job_id: job_id, updated_by: userId };
    await candidateHistoryService.handleCandidateHistory({ program_id: offer.dataValues.program_id, oldData, newData, action: 'Counter Offer Rejected' });

  } else {
    await SubmissionCandidateModel.update(
      { status: "Offer Rejected" },
      { where: { candidate_id: candidateId, program_id: offer.program_id, job_id: offer.job_id }, transaction }
    );

    const newStatus = "Offer Rejected";
    const newData = { candidate_id: candidateId, reason, vendor_id: vendorId, status: newStatus, job_id: job_id, updated_by: userId };
    await candidateHistoryService.handleCandidateHistory({ program_id: offer.dataValues.program_id, oldData, newData, action: 'Submission Offer Rejected' });

  }
  const workflowId = offer.onboarding_flow_id;
  const tenantId = offer.program_id;

  if (workflowId && tenantId) {
    try {
      await credentialingService.terminateOnboarding(workflowId, tenantId, authorization);
    } catch (error) {
      console.error(`Failed to terminate onboarding for workflow ID ${workflowId}:`, error);
    }
  }
}

async function withdrawOffer(offer: any, transaction: any, userId: string, dataToUpdate: any) {
  const offerStatus = offer.dataValues?.status ?? offer.status ?? '';
  const reason = dataToUpdate?.reason;
  if (offerStatus.toUpperCase() == "PENDING REVIEW" && offerStatus.toUpperCase() == "PENDING APPROVAL") {
    throw new Error(`Cannot withdraw the offer because it is in the '${offerStatus}' state.`);
  }

  if (offerStatus.toUpperCase() == "COUNTER PENDING REVIEW" && offerStatus.toUpperCase() == "COUNTER PENDING APPROVAL") {
    throw new Error(`Cannot withdraw the counter offer because it is in the '${offerStatus}' state.`);
  }
  const vendorId = offer?.vendor_id;
  if (offer.parent_offer_id) {

    const oldData = { candidate_id: offer?.candidate_id, vendor_id: vendorId, status: offerStatus, job_id: offer?.job_id, updated_by: userId };
    const newData = { candidate_id: offer?.candidate_id, reason, vendor_id: vendorId, status: "Withdraw", job_id: offer?.job_id, updated_by: userId };

    await offer.update(
      { status: "Withdraw", updated_by: userId },
      { where: { parent_offer_id: offer.id, program_id: offer.program_id, job_id: offer.job_id }, transaction }
    );
    await candidateHistoryService.handleCandidateHistory({ program_id: offer.program_id, oldData, newData, action: 'Counter Offer Withdrawn' });

    const Offer = await OfferModel.findOne({
      where: { id: offer.parent_offer_id },
      transaction
    });

    await Offer?.update(
      {
        status: "Pending Acceptance"
      },
      {
        transaction,
      }
    );

    const candidateId = offer.candidate_id;
    if (candidateId) {
      await SubmissionCandidateModel.update(
        { status: "Offer Pending Acceptance" },
        {
          where: {
            candidate_id: candidateId,
            program_id: offer.program_id,
            job_id: offer.job_id
          },
          transaction,
        }
      );
    }
  } else {
    const oldData = { candidate_id: offer?.dataValues?.candidate_id, vendor_id: vendorId, status: offerStatus, job_id: offer?.job_id, updated_by: userId };
    await offer.update(
      { status: "Withdraw", updated_by: userId, updated_on: Date.now() },
      { where: { id: offer.id, program_id: offer.program_id, job_id: offer.job_id } },
      { transaction }
    );
    const newData = { candidate_id: offer?.dataValues?.candidate_id, reason, vendor_id: vendorId, status: "Withdraw", job_id: offer?.job_id, updated_by: userId };
    await candidateHistoryService.handleCandidateHistory({ program_id: offer.program_id, oldData, newData, action: 'Offer Withdrawn' });

    const candidateId = offer.candidate_id;
    if (candidateId) {
      await SubmissionCandidateModel.update(
        { status: "Offer Withdrawn" },
        {
          where: {
            candidate_id: candidateId,
            program_id: offer.program_id,
            job_id: offer.job_id
          },
          transaction,
        }
      );
    }
  }
}

export async function updateOfferRelease(request: FastifyRequest, reply: FastifyReply) {
  const { id, program_id } = request.params as { id: string, program_id: string };
  const { status } = request.body as OfferInterface;
  const traceId = generateCustomUUID();

  const transaction = await sequelize.transaction();
  const user = request?.user;
  const userId = user?.sub

  try {
    logger({
      trace_id: traceId,
      eventname: "updateOffer",
      status: "info",
      description: `Request received to update offer with ID: ${id}`,
      data: request.body,
      action: request.method,
      url: request.url,
    });

    const offer = await OfferModel.findByPk(id, { transaction });

    if (!offer) {
      await transaction.rollback();
      return reply.status(400).send({
        trace_id: traceId,
        message: "Job Offer Not Found",
        offer: [],
      });
    }
    const oldStatus = offer?.status;
    logger({
      trace_id: traceId,
      eventname: "updateOffer",
      status: "info",
      description: `Offer found with ID: ${id}, current status: ${offer}`,
      data: { id, currentStatus: offer },
      action: request.method,
      url: request.url,
    });
    if (status == "Pending Acceptance") {
      await OfferModel.update(
        { status: "Pending Acceptance" },
        { where: { id, program_id } }
      );
      const candidateId = offer.candidate_id;
      if (candidateId) {
        await SubmissionCandidateModel.update(
          { status: "Offer Pending Acceptance" },
          { where: { candidate_id: candidateId, program_id: program_id, job_id: offer.job_id }, transaction }
        );

        const oldData = { status: oldStatus, candidate_id: candidateId, job_id: offer?.job_id, updated_by: userId };
        const newData = { status: "Pending Acceptance", candidate_id: candidateId, job_id: offer?.job_id, updated_by: userId };
        await candidateHistoryService.handleCandidateHistory({ program_id, oldData, newData, action: "Offer Approved" });

      }
    }
    await transaction.commit();

    logger({
      trace_id: traceId,
      eventname: "updateOffer",
      status: "success",
      description: `Successfully updated offer with ID: ${id}`,
      data: { id, newStatus: status },
      action: request.method,
      url: request.url,
    });

    return reply.status(200).send({
      status_code: 200,
      trace_id: traceId,
      message: "Data Updated Successfully.",
      id: id,
    });
  } catch (error: any) {

    logger({
      trace_id: traceId,
      eventname: "updateOffer",
      status: "error",
      description: `Error occurred while updating offer with ID: ${id}. Error: ${error.message}`,
      data: { id, error: error.message },
      action: request.method,
      url: request.url,
    });

    await transaction.rollback();
    return reply.status(500).send({
      trace_id: traceId,
      message: "Internal Server Error",
      error: error.message,
    });
  }
}

export async function deleteOffer(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { id } = request.params as { id: string };
  const traceId = generateCustomUUID();
  const user = request?.user;
  const userId = user?.sub
  try {
    const field = await OfferModel.findByPk(id);
    if (field) {
      await field.update({
        is_deleted: true, updated_by: userId,
      });
      reply.status(200).send({
        status_code: 200,
        trace_id: traceId,
        message: "Job Offer Deleted Successfully",
        id: id,
      });
    } else {
      reply
        .status(200)
        .send({ trace_id: traceId, message: "Job Offers Not Found", data: [] });
    }
  } catch (error) {
    console.error(`trace_id : ${traceId}, Error : `, error);
    reply
      .status(500)
      .send({ trace_id: traceId, message: "Internal Server Error" });
  }
}

export async function financialDetailsCalculation(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const traceId = generateCustomUUID();
  try {
    const { program_id } = request.params as { program_id: string };

    const {
      rate_amount,
      markup,
      rate_model,
      hours_per_day,
      week_working_days,
      num_resources = 1,
      additional_type,
      additional_value,
      unit_of_measure,
      start_date,
      end_date
    } = request.body as JobInterface;

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    const { totalWeeks, remainingDays } = calculateWorkingDaysWithHolidays(startDate, endDate);

    let workingUnits = unit_of_measure?.toLowerCase() === 'daily' ? `${Math.floor((totalWeeks * week_working_days) + remainingDays)} Day${totalWeeks === 1 ? '' : 's'}` : `${(Math.floor(totalWeeks * week_working_days) + remainingDays) * hours_per_day} Hour${totalWeeks === 1 ? '' : 's'}`;
    const formatted_weeks_days = `${totalWeeks} Week${totalWeeks === 1 ? '' : 's'} ${remainingDays} Day${remainingDays === 1 ? '' : 's'}`;

    const total_weeks = totalWeeks;
    const formattedDays = remainingDays;

    const configData = await GlobalRepository.accuracyConfiguration(program_id, accuracyType.CONFIG_MODEL);
    const formatWithAccuracy = (value: any, title: string): string => {
      return GlobalRepository.findAndCalculate(configData, title, value);
    };

    const budget = calculateBudget(
      rate_amount,
      markup,
      rate_model,
      hours_per_day,
      week_working_days,
      total_weeks,
      formattedDays,
      num_resources,
      additional_type,
      additional_value,
      unit_of_measure,
      configData
    );

    reply.status(200).send({
      trace_id: traceId,
      code: 200,
      message: "success",
      data: {
        workingUnits,
        formatted_weeks_days,
        bill_rate: budget.bill_rate,
        pay_rate: budget.pay_rate,
        markup: budget.markup,
        additional_amount: budget.additional_amount,
        budget: budget.single_net_budget
      },
    });
  } catch (error: any) {
    reply.status(500).send({
      trace_id: traceId,
      message: "Internal Server Error",
      error: error.message
    });
  }
}

export async function getOffersForCandidate(request: FastifyRequest, reply: FastifyReply) {
  const { program_id } = request.params as { program_id: string };
  const { candidate_id, job_id } = request.query as {
    candidate_id?: string;
    job_id?: string;
  };

  const traceId = generateCustomUUID();

  // Validate if mandatory query parameters are present
  if (!candidate_id || !job_id) {
    return reply.status(400).send({
      trace_id: traceId,
      message: "Candidate ID and Job ID are required query parameters.",
    });
  }

  try {
    const user = request?.user;
    const userId = user.sub;

    const userData = await offerRepository.findUser(program_id, userId);
    const user_type = userData[0]?.user_type?.toLowerCase() ?? user.userType;

    let offers = (await offerRepository.getOffersForCandidateQuery(
      candidate_id,
      job_id,
      program_id
    )) as any;
    const sortedCustomFields = offers[0].custom_fields?.sort((a: any, b: any) => {
       return a.seq_number - b.seq_number;
   }) || [];
    if (user_type === "vendor") {
      offers = offers.filter(
        (offer: any) =>
          !["PENDING APPROVAL", "PENDING REVIEW"].includes(
            offer.status?.toUpperCase()
          )
      );

      if (!offers.length) {
        return reply.status(200).send({
          trace_id: traceId,
          message: "Offer details are unavailable for the vendor.",
          offer: [],
        });
      }
    }

    if (!offers || offers.length === 0) {
      return reply.status(200).send({
        trace_id: traceId,
        offer: [],
        message: "No offers found for the specified candidate and job.",
      });
    }

    const status = offers[0].status ?? null;
    const parent_offer_id = offers[0].parent_offer_id ?? null;
    const actions = offerService.getOfferActionFlags(
      status,
      user_type,
      parent_offer_id
    );

    return reply.status(200).send({
      trace_id: traceId,
      message: "Offer found for the specified candidate and job.",
      offer: { ...offers[0], custom_fields: sortedCustomFields, actions },
    });
  } catch (error: any) {
    return reply.status(500).send({
      trace_id: traceId,
      message: error.message,
      error: error,
    });
  }
}

export async function getStatistics(request: FastifyRequest, reply: FastifyReply) {

  const { program_id } = request.params as { program_id: string };

  const { type } = request.query as { type?: string };
  const user = request?.user;

  const userId = user?.sub;

  const userType = user?.userType?.toLowerCase();

  const userData = await offerRepository.findUser(program_id, userId);

  const tenantId = userData[0]?.tenant_id;

  const user_type = userData[0]?.user_type?.toLowerCase();

  const hierarchyIdsArray = userData[0]?.associate_hierarchy_ids || [];

  const job_ids = await jobRepository.getJobIdsWithHierarchies(program_id, hierarchyIdsArray);

  let vendor_id: string | undefined;

  if (user_type === "vendor") {

    const vendor = await jobRepository.findVendor(program_id, tenantId);

    vendor_id = vendor?.[0]?.id;

  }

  const transformData = (statistics: any, type: string): { data: Array<Record<string, any>>; total: number } => {
    let statuses;

    if (type === "offers") {
      statuses = [
        { status: "Pending Review", key: "pending_review_count", colorKey: "#FF6430" },
        { status: "Pending Approval", key: "pending_approval_count", colorKey: "#FF6430" },
        { status: "Rejected", key: "rejected_count", colorKey: "#FF6874" },
        { status: "Withdrawn", key: "withdraw_count", colorKey: "#FF9F18" },
        { status: "Accepted", key: "accepted_count", colorKey: "#00B578" },
        { status: "Pending Acceptance", key: "released_count", colorKey: "#0095FF" },
      ];
    } else if (type === "interviews") {
      statuses = [
        { status: "Rejected", key: "rejected_count", colorKey: "#FF6874" },
        { status: "Cancelled", key: "cancelled_count", colorKey: "#FF6430" },
        { status: "Completed", key: "completed_count", colorKey: "#00B578" },
        { status: "Pending Confirmation", key: "pending_confirmation_count", colorKey: "#FF9F18" },
        { status: "Accepted", key: "accepted_count", colorKey: "#00B578" },
        { status: "Pending Acceptance", key: "pending_acceptance_count", colorKey: "#FF6430" },
      ];
    } else {
      throw new Error("Invalid type parameter. Use 'offers' or 'interviews'.");
    }

    const total = statistics.total ?? 0;

    // Filter statuses to only include those present in statistics
    const data = statuses
      .filter(({ key }) => statistics[key])
      .map(({ status, key, colorKey }) => ({
        status,
        count: statistics[key],
        color: colorKey,
        slug: generateSlug(status, { lowercase: true }),
      }));

    return { data, total };
  };

  try {

    let statistics;

    let data, total;

    if (type === "offers") {

      console.log("userType:", user_type);

      if (userType === "super_user") {

        statistics = await offerRepository.getSoursingStatisticsCountForSuperAdmin(program_id);

      } else if (user_type === "client" || user_type === "msp") {

        statistics = await offerRepository.getSourcingStatistics(program_id, hierarchyIdsArray);

      } else if (user_type === "vendor") {

        statistics = await offerRepository.getSoursingStatisticsCountForVendor(vendor_id, program_id);

        console.log("offerStatistics", statistics);

      } else {

        return reply.status(403).send({ message: "Forbidden - User does not have required access" });

      }

      ({ data, total } = transformData(statistics, "offers"));

    } else if (type === "interviews") {

      if (userType === "super_user") {

        statistics = await interviewRepository.getSoursingStatisticsCountsForSuperAdmin(program_id);

      } else if (user_type === "client" || user_type === "msp") {

        statistics = await interviewRepository.getSourcingStatisticsCountsForClient(program_id, job_ids);

      } else if (user_type === "vendor") {

        statistics = await interviewRepository.getSoursingStatisticsCountsForVendor(vendor_id, program_id);

      } else {

        return reply.status(403).send({ message: "Forbidden - User does not have required access" });

      }

      ({ data, total } = transformData(statistics, "interviews"));

    } else {

      return reply.status(400).send({ message: "Invalid type parameter. Use 'offers' or 'interviews'." });

    }

    return reply.status(200).send({

      message: "Statistics fetched successfully.",

      total_count: total,

      data,

    });

  } catch (error) {
    console.error("Error fetching statistics:", error);
    return reply.status(500).send({ message: "An error occurred while fetching statistics." });
  }
}

async function handleAcceptedStatus(offer: any, userId: string, transaction: any, token: any) {
  const candidateId = offer.candidate_id;
  const programId = offer.program_id;
  const customFields = await fetchCustomFields(offer, transaction);
  const masterData = await fetchMasterData(offer, transaction);
  const mappedRates = await fetchRates(offer, transaction);
  console.log("mappedRates is", JSON.stringify(mappedRates, null, 2));


  const mappedFees = await mapFeeDetails(offer, transaction);
  const assignmentPayload = await generateAssignmentPayload(
    offer,
    candidateId,
    programId,
    customFields,
    masterData,
    userId,
    mappedRates,
    mappedFees
  );
  createAssignment(assignmentPayload, programId, token);
}

export async function updateOfferById(request: FastifyRequest, reply: FastifyReply) {
  const { id, program_id } = request.params as { id: string, program_id: string };
  const dataToUpdate: any = request.body as OfferInterface;
  const traceId = generateCustomUUID();

  const transaction = await sequelize.transaction();
  const user = request?.user;
  const userId = user?.sub

  try {

    const offer = await OfferModel.findOne({ where: { id: id, program_id: program_id }, transaction });

    if (!offer) {
      await transaction.rollback();
      return reply.status(400).send({
        trace_id: traceId,
        message: "Job Offer Not Found",
        offer: [],
      });
    }

    let oldStatus: any;
    let newStatus: any;

    if (dataToUpdate.parent_offer_id) {

      await offer.update({ ...dataToUpdate, status: "Pending Approval", updated_on: Date.now(), updated_by: userId });
      newStatus = offer?.dataValues?.status;
      await SubmissionCandidateModel.update(
        { status: "Counter Offer Pending Approval" },
        { where: { id: dataToUpdate.submission_id } }
      );
    } else {
      oldStatus = offer.dataValues.status;
      await offer.update({ ...dataToUpdate, status: "Pending Acceptance", updated_on: Date.now(), updated_by: userId });
      newStatus = offer?.dataValues?.status;
      await SubmissionCandidateModel.update(
        { status: "Offer Pending Acceptance" },
        { where: { id: dataToUpdate.submission_id } }
      );
    }


    if (dataToUpdate.foundational_data) {
      await OfferMasterDataModel.destroy({ where: { offer_id: offer.id }, transaction });
      await processFoundationalData(
        offer.id,
        dataToUpdate.foundational_data,
        transaction
      );
    }

    if (dataToUpdate.custom_fields) {
      await OfferCustomFieldModel.destroy({ where: { offer_id: offer.id }, transaction });
      await processCustomFields(offer.id, dataToUpdate.custom_fields, transaction);
    }

    if (dataToUpdate.hierarchy) {
      await OfferHierachy.destroy({ where: { offer_id: offer.id }, transaction });
      if (dataToUpdate.hierarchy && Array.isArray(dataToUpdate.hierarchy)) {
        for (const hierarchyId of dataToUpdate.hierarchy) {
          await OfferHierachy.create(
            {
              offer_id: offer.id,
              hierarchy: hierarchyId,
            },
            { transaction }
          );
        }
      }
    }

    const {
      job_id: workflow_job_id,
      status: offerStatus,
      submission_id,
      hierarchy_ids,
      module_id: existingModuleId,
      parent_offer_id
    } = dataToUpdate;

    const event_slug = parent_offer_id ? "counter_offer" : "create_offer";
    const module_name = "Offers";
    const type = "workflow";
    const placement_order = "0";
    const is_updated = false;

    const { moduleId, eventId } = await getEventIdFromModule(module_name, event_slug, type);
    const module_id = moduleId ?? "";
    const event_id = eventId ?? "";

    const [jobDatas]: any = await sequelize.query(`SELECT * FROM jobs WHERE id = :jobId LIMIT 1;`, {
      type: QueryTypes.SELECT,
      replacements: { jobId: workflow_job_id },
    });
    if (!jobDatas) {
      return reply.status(400).send({ message: "Job not found for the provided job ID." });
    }

    const job = { event_title: jobDatas.job_id, job_id: workflow_job_id, id };
    const jobData = dataToUpdate;

    const weekCount = parseInt(dataToUpdate?.financial_details?.billRateValue?.formatted_weeks_days?.match(/(\d+)\s+Weeks?/)?.[1] || "0");
    jobData.duration = weekCount;
    jobDatas.duration = weekCount;
    let rows: any[] = await sequelize.query(jobWorkflowQuery(hierarchy_ids), {
      replacements: { module_id, event_id, program_id, placement_order },
      type: QueryTypes.SELECT,
    });

    const offers = await OfferModel.findOne({ where: { id }, transaction });

    const updateStatus = async (candidateStatus: string, offerStatus: string) => {
      await SubmissionCandidateModel.update(
        { status: candidateStatus },
        { where: { id: submission_id }, transaction }
      );

      await offers?.update({ status: offerStatus }, { transaction });
      const newStatus = offerStatus;
      const oldData = { candidate_id: offer?.candidate_id, vendor_id: offer?.vendor_id, status: oldStatus, job_id: offer?.job_id, updated_by: userId };
      const newData = { candidate_id: offer?.candidate_id, vendor_id: offer?.vendor_id, status: newStatus, job_id: offer?.job_id, updated_by: userId };
      await candidateHistoryService.handleCandidateHistory({ program_id: offer?.program_id, oldData, newData, action: 'Offer Edited' });

    };


    const applyWorkflowStatus = async (flowType: string | undefined) => {
      const flow = flowType?.toLowerCase();

      if (parent_offer_id) {
        if (flow === "approval") return updateStatus("Counter Offer Pending Approval", "Pending Approval");
        if (flow === "review") return updateStatus("Counter Offer Pending Review", "Pending Review");
      } else {
        if (flow === "approval") return updateStatus("Offer Pending Approval", "Pending Approval");
        if (flow === "review") return updateStatus("Offer Pending Review", "Pending Review");
      }
    };


    let workflow = await workflowTriggering(
      request, reply, program_id, rows, job, jobData, jobDatas, module_name,
      is_updated, workflow_job_id, event_slug
    );


    if (!workflow) {
      rows = await sequelize.query(ApprovalworkflowQuery(hierarchy_ids), {
        replacements: { module_id, event_id, program_id, placement_order },
        type: QueryTypes.SELECT,
        transaction,
      });

      workflow = await workflowTriggering(
        request, reply, program_id, rows, job, jobData, jobDatas, module_name,
        is_updated, workflow_job_id, event_slug
      );

      if (workflow) {
        if (workflow.workflow?.workflow_status === "completed") {
          if (!parent_offer_id) await updateStatus("Offer Pending Acceptance", "Pending Acceptance");
          if (parent_offer_id) await updateStatus("Counter Offer Pending Approval", "Pending Approval")
        } else {
          await applyWorkflowStatus(rows[0]?.flow_type);
        }
      } else {
        const oldData = { candidate_id: offer?.candidate_id, vendor_id: offer?.vendor_id, status: oldStatus, job_id: offer?.job_id, updated_by: userId };
        const newData = { candidate_id: offer?.candidate_id, vendor_id: offer?.vendor_id, status: newStatus, job_id: offer?.job_id, updated_by: userId };
        await candidateHistoryService.handleCandidateHistory({ program_id: offer.program_id, oldData, newData, action: 'Offer Edited' });
      }
    } else {
      await applyWorkflowStatus(rows[0]?.flow_type);
    }



    logger({
      trace_id: traceId,
      eventname: "updateOffer",
      status: "info",
      description: `Request received to update offer with ID: ${id}`,
      data: request.body,
      action: request.method,
      url: request.url,
    });

    await transaction.commit();

    logger({
      trace_id: traceId,
      eventname: "updateOffer",
      status: "success",
      description: `Successfully updated offer with ID: ${id}`,
      data: { id },
      action: request.method,
      url: request.url,
    });

    return reply.status(200).send({
      status_code: 200,
      trace_id: traceId,
      message: "Data Updated Successfully.",
      id: id,
    });
  } catch (error: any) {

    logger({
      trace_id: traceId,
      eventname: "updateOffer",
      status: "error",
      description: `Error occurred while updating offer with ID: ${id}. Error: ${error.message}`,
      data: { id, error: error.message },
      action: request.method,
      url: request.url,
    });

    await transaction.rollback();
    return reply.status(500).send({
      trace_id: traceId,
      message: "Internal Server Error",
      error: error.message,
    });
  }
}