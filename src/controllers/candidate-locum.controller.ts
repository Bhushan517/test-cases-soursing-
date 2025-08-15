import { FastifyRequest, FastifyReply } from 'fastify';
import candidateLocumNameClearModel from '../models/candidate-locum.model';
import { CandidateLocumNameClearInterface } from '../interfaces/candidate-locum.interfaces';
import generateCustomUUID from '../utility/genrateTraceId';
import generatedCandidateLocumCode from '../plugins/candidate-locum-code';
import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../config/instance';
import { decodeToken } from '../middlewares/verifyToken';
import { databaseConfig } from '../config/db';
const config_db = databaseConfig.config.database_config;

export const createCandidateLocum = async (request: FastifyRequest<{ Params: { program_id: string } }>, reply: FastifyReply) => {
  const candidateLocum = request.body as CandidateLocumNameClearInterface;
  const traceId = generateCustomUUID();
   const user=request?.user;
  const userId = user.sub;
  const userType = user.user_type || "";
  const { program_id } = request.params;
  const locum_code = await generatedCandidateLocumCode(program_id);

  const candidateData = {
    ...candidateLocum,
    program_id,
    name_clear_id: locum_code,
    status: 'Pending Name Clear',
  };

  try {
    // const event_slug = "locum_name_clear";
    // const module_name = "Candidates";
    // const type = "workflow"
    // const placement_order = "0"
    // let is_updated = false;
    // let moduleId: any;
    // if (module_name) {
    //   const query = `
    //     SELECT id
    //     FROM ${config_db}.module
    //     WHERE name = :module_name
    //     AND is_workflow = true
    //     LIMIT 1;`;

    //   let moduleIds = await sequelize.query(query, {
    //     type: QueryTypes.SELECT,
    //     replacements: { module_name },
    //   });
    //   moduleId = moduleIds[0];
    // }

    // const module_ids = moduleId?.id || "";
    // let eventId: any;


    // if (module_ids && event_slug) {
    //   const query = `
    //     SELECT id
    //     FROM ${config_db}.event
    //     WHERE module_id = :module_ids
    //     AND slug = :event_slug
    //     AND is_enabled = true
    //     AND type = :type
    //     LIMIT 1;
    //   `;

    //   let eventIds = await sequelize.query(query, {
    //     type: QueryTypes.SELECT,
    //     replacements: { module_ids, event_slug, type },
    //   });
    //   eventId = eventIds[0];
    // }

    // const workflowQuery2 = workflowQuery(candidateLocum.hierarchy_ids);
    // const rows: any[] = await sequelize.query(workflowQuery2, {
    //   replacements: { module_id: module_ids, event_id: eventId?.id, program_id, placement_order },
    //   type: QueryTypes.SELECT,
    //   transaction
    // });

    const existingCandidate = await candidateLocumNameClearModel.findOne({
      where: {
        vendor_id: candidateLocum.vendor_id,
        npi: candidateLocum.npi,
      },
    });

    if (existingCandidate) {
      return reply.status(409).send({
        status_code: 409,
        trace_id: traceId,
        message: 'A candidate locum with the same NPI and Vendor ID already exists.',
      });
    }
    const candidate = await candidateLocumNameClearModel.create({
      ...candidateData,
      created_by: userId,
      updated_by: userId
    });

    // let job = { id: candidate.id };
    // let jobData = candidateLocum;
    // let jobDatas = candidateLocum;
    // jobData.userId = userId;
    // jobData.userType = userType;
    // await workflowTriggering(request, reply, program_id, rows, job, jobData, jobDatas, module_name, is_updated, null, event_slug);

    reply.status(201).send({
      status_code: 201,
      trace_id: traceId,
      id: candidate.id,
      message: 'Candidate locum Created Successfully.',
    });
  } catch (error: any) {

    reply.status(500).send({
      status_code: 500,
      message: 'An error occurred while creating candidate locum.',
      trace_id: traceId,
      error: error.message,
    });
  }
};

export const getAllCandidateLocum = async (
  request: FastifyRequest<{ Querystring: CandidateLocumNameClearInterface, Params: { program_id: string } }>,
  reply: FastifyReply
) => {
  const traceId = generateCustomUUID();
  const { program_id } = request.params;

  try {
    const {
      page,
      limit,
      first_name,
      name_clear_id,
      status,
      vendor_id,
      npi,
      worker_type,
      updated_on
    } = request.query;

    const pageNumber = parseInt(page ?? "1");
    const pageSize = parseInt(limit ?? "10");
    const offset = (pageNumber - 1) * pageSize;

    const whereCondition: any = {
      program_id,
      is_deleted: false
    };
    if (first_name) {
      whereCondition.first_name = { [Op.like]: `%${first_name}%` };
    }
    if (name_clear_id) {
      whereCondition.name_clear_id = name_clear_id;
    }
    if (status) {
      const statusArray = status.split(',').map(s => s.trim());
      whereCondition.status = { [Op.in]: statusArray };
    }
    if (vendor_id) {
      whereCondition.vendor_id = vendor_id;
    }
    if (npi) {
      whereCondition.npi = npi;
    }
    if (worker_type) {
      whereCondition.worker_type = worker_type;
    }
    if (updated_on) {
      whereCondition.updated_on = { [Op.eq]: updated_on };
    }

    const { rows: candidates, count } = await candidateLocumNameClearModel.findAndCountAll({
      where: whereCondition,
      limit: pageSize,
      offset,
      order: [["name_clear_id", "DESC"]],
    });

    const vendorIds = candidates.map(candidate => candidate.vendor_id).filter(Boolean);

    let vendors: any[] = [];
    if (vendorIds.length > 0) {
      vendors = await sequelize.query(
        `
        SELECT id, display_name
        FROM ${config_db}.program_vendors
        WHERE id IN (:vendorIds)
        `,
        {
          replacements: { vendorIds },
          type: QueryTypes.SELECT
        }
      );
    }

    const candidatesWithVendors = candidates.map(candidate => {
      const vendor = vendors.find(v => v.id === candidate.vendor_id);
      return {
        ...candidate.toJSON(),
        program_vendor: vendor ? { id: vendor.id, vendor_name: vendor.display_name } : null
      };
    });

    reply.status(200).send({
      status_code: 200,
      trace_id: traceId,
      message: 'Candidate locum retrieved successfully',
      total: count,
      page: pageNumber,
      limit: pageSize,
      candidate_locum: candidatesWithVendors,
    });
  } catch (error: any) {
    reply.status(500).send({
      status_code: 500,
      message: 'Failed to fetch candidate locum',
      trace_id: traceId,
      error: error.message,
    });
  }
};

export const getCandidateLocumById = async (
  request: FastifyRequest<{ Params: { program_id: string; id: string } }>,
  reply: FastifyReply
) => {
  const traceId = generateCustomUUID();
  const { program_id, id } = request.params;

  try {
    const candidates = await candidateLocumNameClearModel.findAll({
      where: {
        program_id,
        is_deleted: false,
      },
    });

    const candidate = candidates.find((c) => c.id === id);

    if (!candidate) {
      return reply.status(400).send({
        status_code: 400,
        trace_id: traceId,
        message: 'CandidateLocum not found',
        candidate_locum: [],
      });
    }
    const [programVendor] = await sequelize.query<{ id: string, display_name: string; }>(
      `
        SELECT id, display_name
        FROM ${config_db}.program_vendors
        WHERE tenant_id = :vendorId
        AND program_id = :programId
        `,
      {
        replacements: { vendorId: candidate.vendor_id, programId: candidate.program_id },
        type: QueryTypes.SELECT,
      }
    ) || [];

    const vendorAssociations = candidates.filter(
      (c) => c.npi === candidate.npi && c.id !== id
    );
    const transformCandidate = (candidate: candidateLocumNameClearModel) => ({
      id: candidate.id,
      program_id: candidate.program_id,
      worker_type: candidate.worker_type,
      npi: candidate.npi,
      first_name: candidate.first_name,
      middle_name: candidate.middle_name,
      last_name: candidate.last_name,
      rejection_reason: candidate.rejection_reason,
      notes: candidate.notes,
      name_clear_id: candidate.name_clear_id,
      status: candidate.status,
      created_on: candidate.created_on,
      updated_on: candidate.updated_on,
      is_deleted: candidate.is_deleted,
      vendor_id: programVendor
        ? {
          id: programVendor.id,
          vendor_name: programVendor.display_name,
        }
        : null,
    });

    const response = {
      ...transformCandidate(candidate),
      vendor_association: vendorAssociations.map(transformCandidate),
    };

    reply.status(200).send({
      status_code: 200,
      message: 'Fetch candicate_locum',
      trace_id: traceId,
      candidate_locum: response,
    });
  } catch (error: any) {
    reply.status(500).send({
      status_code: 500,
      message: 'Failed to fetch candidate locum',
      trace_id: traceId,
      error: error.message,
    });
  }
};

export const updateCandidateLocum = async (
  request: FastifyRequest<{ Params: { program_id: string; id: string }, Body: Partial<CandidateLocumNameClearInterface> }>,
  reply: FastifyReply
) => {
  const traceId = generateCustomUUID();
  const { program_id, id } = request.params;
  const updateData = request.body;

  try {
    const [updatedRows] = await candidateLocumNameClearModel.update(
      { ...updateData, updated_on: new Date() },
      { where: { id, program_id } }
    );

    if (updatedRows === 0) {
      return reply.status(404).send({
        status_code: 404,
        message: 'Candidate locum not found',
        trace_id: traceId,
      });
    }
    if (updateData.status === 'Approved') {
      const updatedCandidate = await candidateLocumNameClearModel.findOne({
        where: { id, program_id },
      });

      if (updatedCandidate?.npi) {
        await candidateLocumNameClearModel.update(
          { status: 'Rejected' },
          {
            where: {
              npi: updatedCandidate.npi,
              program_id,
              is_deleted: false,
              id: { [Op.ne]: id },
            },
          }
        );
      }
    }

    reply.status(200).send({
      status_code: 200,
      message: 'Candidate locum updated successfully',
      trace_id: traceId,
    });
  } catch (error) {
    reply.status(500).send({
      status_code: 500,
      message: 'Failed to update candidate locum',
      trace_id: traceId,
      error,
    });
  }
};


export async function deleteCandidateLocum(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const traceId = generateCustomUUID();

  try {
    const { program_id, id } = request.params as { program_id: string, id: string };
    const candidateLocum = await candidateLocumNameClearModel.findOne({ where: { program_id, id } });

    if (candidateLocum) {
      await candidateLocumNameClearModel.update({ is_deleted: true }, { where: { program_id, id } });

      reply.status(204).send({
        status_code: 204,
        message: 'Candidate locum deleted successfully',
        trace_id: traceId,
      });
    } else {
      reply.status(404).send({
        status_code: 404,
        message: 'Candidate locum not found',
        trace_id: traceId,
      });
    }
  } catch (error) {
    reply.status(500).send({
      status_code: 500,
      message: 'Failed to delete candidate locum',
      trace_id: traceId,
      error,
    });
  }
};
