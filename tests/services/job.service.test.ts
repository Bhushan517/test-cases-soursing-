import { mockDbConfig } from '../utils/mockDbConfig';
mockDbConfig();
import JobRepository from '../../src/repositories/job.repository';
import { JobService } from '../../src/services/job.service';
import { JobInterface } from '../../src/interfaces/job.interface';

jest.mock('../../src/repositories/job.repository');

const mockJob: JobInterface = {
  upsert: jest.fn(),
  job_id: false,
  id: '1',
  program_id: 'prog1',
  job_manager_id: 'jm1',
  job_type: 'type1',
  job_template_id: 'tmpl1',
  hierarchy_ids: [],
  work_location_id: 'loc1',
  checklist_entity_id: 'chk1',
  checklist_version: 1,
  labor_category_id: 'lab1',
  description: 'desc',
  additional_attachments: [],
  job_leval: 'level1',
  pri_identified_candidates: null,
  credentials: null,
  rate_configuration: null,
  budgets: null,
  primary_hierarchy: 'h1',
  rate_details: null,
  qualifications: null,
  foundational_data: null,
  custom_fields: null,
  start_date: '2024-01-01',
  end_date: '2024-12-31',
  no_positions: 1,
  expense_allowed: false,
  currency: 'USD',
  unit_of_measure: 'hour',
  min_bill_rate: 1,
  max_bill_rate: 2,
  allow_per_identified_candidates: false,
  is_enabled: true,
  min_rate: 1,
  max_rate: 2,
  program_industry: 'industry',
  hierarchy: [],
  work_locations: 'loc1',
  rate_model: 'pay_rate',
  hours_per_day: 8,
  week_working_days: 5,
  num_resources: 1,
  additional_type: 'fixed',
  additional_value: 0,
  working_days: [],
  rate: JSON.parse('{}'),
  financial_calculation: JSON.parse('{}'),
  event_id: 'e1',
  module_id: 'm1',
  pay_rate: 1,
  markup: 1,
  total_weeks: 1,
  formattedDays: 1,
  min_markup: 1,
  max_markup: 1,
  avg_markup: 1,
  rate_amount: 1,
  vendor_id: 'v1',
  candidates: null,
  customFields: null,
  foundationDataTypes: null,
  rates: null,
  expenses: null,
  total_count: 2,
  ot_exempt: false,
  net_budget: '100',
  source: 'TEMPLATE',
  closed_reason: '',
  closed_note: '',
  closed_at: null,
  allow_per_identified_s: false,
  userType: undefined,
  userId: undefined,
  managed_by: undefined,
  duration: undefined
};

const mockJob2: JobInterface = { ...mockJob, id: '2' };

const mockJobRepository = JobRepository as jest.MockedClass<typeof JobRepository>;

describe('JobService', () => {
  let jobService: JobService;
  let jobRepositoryInstance: jest.Mocked<JobRepository>;

  beforeEach(() => {
    jobService = new JobService();
    jobRepositoryInstance = (jobService as any).jobRepository;
    jest.clearAllMocks();
  });

  describe('getJobs - Positive Test Cases', () => {
    test('should return jobs for super_user', async () => {
      jobRepositoryInstance.getAllJob.mockResolvedValue([
        { ...mockJob },
        { ...mockJob2 }
      ]);
      jobRepositoryInstance.findUser.mockResolvedValue([]);

      const params = { program_id: 'prog1', user: { userType: 'super_user', sub: 'user1' } };
      const result = await jobService.getJobs(params);
      expect(result.jobs.length).toBe(2);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.pages).toBe(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
      expect(jobRepositoryInstance.getAllJob).toHaveBeenCalledWith('prog1', 10, 0);
    });

    test('should return jobs for CLIENT with all hierarchy', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([
        { user_type: 'CLIENT', associate_hierarchy_ids: [], is_all_hierarchy_associate: true }
      ]);
      jobRepositoryInstance.getAllJob.mockResolvedValue([
        { ...mockJob }
      ]);

      const params = { program_id: 'prog1', user: { sub: 'user1' } };
      const result = await jobService.getJobs(params);
      expect(result.jobs.length).toBe(1);
      expect(result.pagination.total).toBe(2);
      expect(jobRepositoryInstance.getAllJob).toHaveBeenCalled();
    });

    test('should return jobs for CLIENT with specific hierarchies', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([
        { user_type: 'CLIENT', associate_hierarchy_ids: ['h1', 'h2'], is_all_hierarchy_associate: false }
      ]);
      jobRepositoryInstance.getAllJobWithHierarchies.mockResolvedValue([
        { ...mockJob }
      ]);

      const params = { program_id: 'prog1', user: { sub: 'user1' } };
      const result = await jobService.getJobs(params);
      expect(result.jobs.length).toBe(1);
      expect(result.pagination.total).toBe(2);
      expect(jobRepositoryInstance.getAllJobWithHierarchies).toHaveBeenCalledWith('prog1', ['h1', 'h2'], 10, 0);
    });

    test('should return jobs for VENDOR', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([
        { user_type: 'VENDOR', tenant_id: 'tenant1' }
      ]);
      jobRepositoryInstance.getVendorJobs.mockResolvedValue([
        { ...mockJob }
      ]);

      const params = { program_id: 'prog1', user: { sub: 'user1' } };
      const result = await jobService.getJobs(params);
      expect(result.jobs.length).toBe(1);
      expect(result.pagination.total).toBe(2);
      expect(jobRepositoryInstance.getVendorJobs).toHaveBeenCalledWith('prog1', 'tenant1', 10, 0, false);
    });

    test('should return jobs for MSP with all hierarchy', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([
        { user_type: 'MSP', tenant_id: 'tenant1', is_all_hierarchy_associate: true, associate_hierarchy_ids: [] }
      ]);
      jobRepositoryInstance.getAllJobWithHierarchies.mockResolvedValue([
        { ...mockJob }
      ]);

      const params = { program_id: 'prog1', user: { sub: 'user1' } };
      const result = await jobService.getJobs(params);
      expect(result.jobs.length).toBe(1);
      expect(result.pagination.total).toBe(2);
      expect(jobRepositoryInstance.getAllJobWithHierarchies).toHaveBeenCalledWith('prog1', [], 10, 0, true, 'tenant1');
    });

    test('should return jobs for MSP with specific hierarchies', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([
        { user_type: 'MSP', tenant_id: 'tenant1', is_all_hierarchy_associate: false, associate_hierarchy_ids: ['h1'] }
      ]);
      jobRepositoryInstance.getAllJobWithHierarchies.mockResolvedValue([
        { ...mockJob }
      ]);

      const params = { program_id: 'prog1', user: { sub: 'user1' } };
      const result = await jobService.getJobs(params);
      expect(result.jobs.length).toBe(1);
      expect(result.pagination.total).toBe(2);
      expect(jobRepositoryInstance.getAllJobWithHierarchies).toHaveBeenCalledWith('prog1', ['h1'], 10, 0, true);
    });

    test('should handle is_new_request as string', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([
        { user_type: 'VENDOR', tenant_id: 'tenant1' }
      ]);
      jobRepositoryInstance.getVendorJobs.mockResolvedValue([
        { ...mockJob }
      ]);

      const params = { program_id: 'prog1', user: { sub: 'user1' }, is_new_request: 'true' };
      const result = await jobService.getJobs(params);
      expect(result.jobs.length).toBe(1);
      expect(jobRepositoryInstance.getVendorJobs).toHaveBeenCalledWith('prog1', 'tenant1', 10, 0, true);
    });

    test('should return jobs for CLIENT with undefined hierarchyIdsArray', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([
        { user_type: 'CLIENT', is_all_hierarchy_associate: false }
      ]);
      jobRepositoryInstance.getAllJobWithHierarchies.mockResolvedValue([
        { ...mockJob }
      ]);
      const params = { program_id: 'prog1', user: { sub: 'user1' } };
      const result = await jobService.getJobs(params);
      expect(result.jobs.length).toBe(1);
      expect(result.pagination.total).toBe(2);
      expect(jobRepositoryInstance.getAllJobWithHierarchies).toHaveBeenCalledWith('prog1', [], 10, 0);
    });

    test('should return jobs for MSP with isAllHierarchy true but no tenantId', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([
        { user_type: 'MSP', is_all_hierarchy_associate: true, associate_hierarchy_ids: [] }
      ]);
      jobRepositoryInstance.getAllJobWithHierarchies.mockResolvedValue([
        { ...mockJob }
      ]);
      const params = { program_id: 'prog1', user: { sub: 'user1' } };
      const result = await jobService.getJobs(params);
      expect(result.jobs.length).toBe(1);
      expect(result.pagination.total).toBe(2);
      expect(jobRepositoryInstance.getAllJobWithHierarchies).toHaveBeenCalledWith('prog1', [], 10, 0, true, undefined);
    });

    test('should handle pagination correctly', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([
        { user_type: 'CLIENT', associate_hierarchy_ids: [], is_all_hierarchy_associate: true }
      ]);
      jobRepositoryInstance.getAllJob.mockResolvedValue([
        { ...mockJob, total_count: 25 }
      ]);

      const params = { program_id: 'prog1', user: { sub: 'user1' }, page: 2, limit: 10 };
      const result = await jobService.getJobs(params);
      expect(result.jobs.length).toBe(1);
      expect(result.pagination.total).toBe(25);
      expect(result.pagination.pages).toBe(3);
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(10);
      expect(jobRepositoryInstance.getAllJob).toHaveBeenCalledWith('prog1', 10, 10);
    });
  });

  describe('getJobs - Negative Test Cases', () => {
    test('should return empty jobs if user not found', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([]);
      const params = { program_id: 'prog1', user: { sub: 'user1' } };
      const result = await jobService.getJobs(params);
      expect(result.jobs).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.pages).toBe(0);
    });

    test('should handle repository error', async () => {
      jobRepositoryInstance.findUser.mockRejectedValue(new Error('DB error'));
      const params = { program_id: 'prog1', user: { sub: 'user1' } };
      await expect(jobService.getJobs(params)).rejects.toThrow('DB error');
    });

    test('should return empty jobs for VENDOR with missing tenantId', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([
        { user_type: 'VENDOR' }
      ]);
      jobRepositoryInstance.getVendorJobs.mockResolvedValue([]);
      const params = { program_id: 'prog1', user: { sub: 'user1' } };
      const result = await jobService.getJobs(params);
      expect(result.jobs).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    test('should return empty jobs if user_type is missing in userData', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([
        { tenant_id: 'tenant1' }
      ]);
      const params = { program_id: 'prog1', user: { sub: 'user1' } };
      const result = await jobService.getJobs(params);
      expect(result.jobs).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    test('should return empty jobs if user param is missing', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([]);
      const params = { program_id: 'prog1' };
      const result = await jobService.getJobs(params);
      expect(result.jobs).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    test('should return empty jobs for unknown userType', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([
        { user_type: 'UNKNOWN', tenant_id: 'tenant1' }
      ]);
      const params = { program_id: 'prog1', user: { sub: 'user1' } };
      const result = await jobService.getJobs(params);
      expect(result.jobs).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    test('should return empty jobs if userData is null', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue(null);
      const params = { program_id: 'prog1', user: { sub: 'user1' } };
      const result = await jobService.getJobs(params);
      expect(result.jobs).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    test('should return empty jobs if repository returns empty array', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([
        { user_type: 'CLIENT', associate_hierarchy_ids: [], is_all_hierarchy_associate: true }
      ]);
      jobRepositoryInstance.getAllJob.mockResolvedValue([]);
      const params = { program_id: 'prog1', user: { sub: 'user1' } };
      const result = await jobService.getJobs(params);
      expect(result.jobs).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe('getJobs - Edge Cases', () => {
    test('should handle invalid page and limit', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([
        { user_type: 'CLIENT', associate_hierarchy_ids: [], is_all_hierarchy_associate: true }
      ]);
      jobRepositoryInstance.getAllJob.mockResolvedValue([
        { ...mockJob }
      ]);
      const params = { program_id: 'prog1', user: { sub: 'user1' }, page: 'invalid', limit: 'invalid' };
      const result = await jobService.getJobs(params);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
    });

    test('should handle large page and limit', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([
        { user_type: 'CLIENT', associate_hierarchy_ids: [], is_all_hierarchy_associate: true }
      ]);
      jobRepositoryInstance.getAllJob.mockResolvedValue([
        { ...mockJob, total_count: 1000000 }
      ]);
      const params = { program_id: 'prog1', user: { sub: 'user1' }, page: '999999', limit: '999999' };
      const result = await jobService.getJobs(params);
      expect(result.pagination.page).toBe(999999);
      expect(result.pagination.limit).toBe(999999);
    });

    test('should handle zero total_count', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([
        { user_type: 'CLIENT', associate_hierarchy_ids: [], is_all_hierarchy_associate: true }
      ]);
      jobRepositoryInstance.getAllJob.mockResolvedValue([
        { ...mockJob, total_count: 0 }
      ]);
      const params = { program_id: 'prog1', user: { sub: 'user1' } };
      const result = await jobService.getJobs(params);
      expect(result.jobs.length).toBe(1);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.pages).toBe(0);
    });

    test('should handle undefined total_count', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([
        { user_type: 'CLIENT', associate_hierarchy_ids: [], is_all_hierarchy_associate: true }
      ]);
      jobRepositoryInstance.getAllJob.mockResolvedValue([
        { ...mockJob, total_count: undefined as any }
      ]);
      const params = { program_id: 'prog1', user: { sub: 'user1' } };
      const result = await jobService.getJobs(params);
      expect(result.jobs.length).toBe(1);
      expect(result.pagination.total).toBe(0);
    });

    test('should handle is_new_request as boolean', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([
        { user_type: 'VENDOR', tenant_id: 'tenant1' }
      ]);
      jobRepositoryInstance.getVendorJobs.mockResolvedValue([
        { ...mockJob }
      ]);

      const params = { program_id: 'prog1', user: { sub: 'user1' }, is_new_request: true };
      const result = await jobService.getJobs(params);
      expect(result.jobs.length).toBe(1);
      expect(jobRepositoryInstance.getVendorJobs).toHaveBeenCalledWith('prog1', 'tenant1', 10, 0, true);
    });

    test('should handle is_new_request as false string', async () => {
      jobRepositoryInstance.findUser.mockResolvedValue([
        { user_type: 'VENDOR', tenant_id: 'tenant1' }
      ]);
      jobRepositoryInstance.getVendorJobs.mockResolvedValue([
        { ...mockJob }
      ]);

      const params = { program_id: 'prog1', user: { sub: 'user1' }, is_new_request: 'false' };
      const result = await jobService.getJobs(params);
      expect(result.jobs.length).toBe(1);
      expect(jobRepositoryInstance.getVendorJobs).toHaveBeenCalledWith('prog1', 'tenant1', 10, 0, false);
    });
  });
}); 