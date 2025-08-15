import { mockDbConfig } from '../utils/mockDbConfig';
mockDbConfig();
jest.mock('../../src/repositories/offer.repository');
jest.mock('../../src/config/instance', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../src/controllers/job.controller', () => ({ getJobIdsForUserType: jest.fn() }));

import { OfferService } from '../../src/services/offer.service';
import OfferRepository from '../../src/repositories/offer.repository';
import { sequelize } from '../../src/config/instance';
import * as jobController from '../../src/controllers/job.controller';
import { Status } from '../../src/utility/enum/status_enum';

describe('OfferService', () => {
  let offerService: OfferService;
  let mockOfferRepository: jest.Mocked<OfferRepository>;

  beforeEach(() => {
    offerService = new OfferService();
    mockOfferRepository = (offerService as any).offerRepository;
    jest.clearAllMocks();
    mockOfferRepository.buildOfferFilters = jest.fn().mockImplementation((query, baseReplacements) => ({
      filters: [],
      replacements: { ...baseReplacements }
    }));
    mockOfferRepository.getOfferCount = jest.fn().mockResolvedValue(3);
    mockOfferRepository.getOffers = jest.fn().mockResolvedValue([
      { id: 1, status: Status.PENDING_REVIEW, parent_offer_id: null },
      { id: 2, status: Status.ACCEPTED, parent_offer_id: null }
    ]);
  });

  describe('getOfferActionFlags - Positive Test Cases', () => {
    let offerService: OfferService;
    const allFlags = [
      'schedule_another_interview',
      'create_offer',
      'accept_offer',
      'reject_offer',
      'counter_offer',
      'edit_offer',
      'withdraw',
      'withdraw_candidate',
      'reject_candidate',
      'withdraw_counter_offer',
      'edit_counter_offer',
    ];

    beforeAll(() => {
      offerService = new OfferService();
    });

    test('should return correct flags for INTERVIEW_COMPLETED status with client user', () => {
      const result = offerService.getOfferActionFlags(Status.INTERVIEW_COMPLETED, 'client', '');
      const expected: Record<string, boolean> = {
        schedule_another_interview: true,
        create_offer: true,
      };
      allFlags.forEach(flag => {
        if (expected[flag]) {
          expect(result[flag]).toBe(true);
        } else {
          expect(result[flag]).toBe(false);
        }
      });
    });

    test('should return correct flags for COUNTER_OFFER status with vendor user', () => {
      const result = offerService.getOfferActionFlags(Status.COUNTER_OFFER, 'vendor', '');
      const expected: Record<string, boolean> = {
        accept_offer: true,
        reject_offer: true,
        counter_offer: true,
      };
      allFlags.forEach(flag => {
        if (expected[flag]) {
          expect(result[flag]).toBe(true);
        } else {
          expect(result[flag]).toBe(false);
        }
      });
    });

    test('should return correct flags for COUNTER_OFFER status with client user', () => {
      const result = offerService.getOfferActionFlags(Status.COUNTER_OFFER, 'client', '');
      const expected: Record<string, boolean> = {
        withdraw: true,
      };
      allFlags.forEach(flag => {
        if (expected[flag]) {
          expect(result[flag]).toBe(true);
        } else {
          expect(result[flag]).toBe(false);
        }
      });
    });

    test('should return correct flags for PENDING_ACCEPTANCE with parent_offer_id (client)', () => {
      const result = offerService.getOfferActionFlags(Status.PENDING_ACCEPTANCE, 'client', 'parent123');
      const expected: Record<string, boolean> = {
        accept_offer: true,
        reject_offer: true,
      };
      allFlags.forEach(flag => {
        if (expected[flag]) {
          expect(result[flag]).toBe(true);
        } else {
          expect(result[flag]).toBe(false);
        }
      });
    });

    test('should return correct flags for PENDING_ACCEPTANCE with parent_offer_id (vendor)', () => {
      const result = offerService.getOfferActionFlags(Status.PENDING_ACCEPTANCE, 'vendor', 'parent123');
      const expected: Record<string, boolean> = {
        withdraw_counter_offer: true,
      };
      allFlags.forEach(flag => {
        if (expected[flag]) {
          expect(result[flag]).toBe(true);
        } else {
          expect(result[flag]).toBe(false);
        }
      });
    });

    test('should return correct flags for PENDING_ACCEPTANCE without parent_offer_id (client)', () => {
      const result = offerService.getOfferActionFlags(Status.PENDING_ACCEPTANCE, 'client', '');
      const expected: Record<string, boolean> = {
        withdraw: true,
      };
      allFlags.forEach(flag => {
        if (expected[flag]) {
          expect(result[flag]).toBe(true);
        } else {
          expect(result[flag]).toBe(false);
        }
      });
    });

    test('should return correct flags for PENDING_ACCEPTANCE without parent_offer_id (vendor)', () => {
      const result = offerService.getOfferActionFlags(Status.PENDING_ACCEPTANCE, 'vendor', '');
      const expected: Record<string, boolean> = {
        accept_offer: true,
        reject_offer: true,
        counter_offer: true,
      };
      allFlags.forEach(flag => {
        if (expected[flag]) {
          expect(result[flag]).toBe(true);
        } else {
          expect(result[flag]).toBe(false);
        }
      });
    });

    test('should handle case-insensitive user types', () => {
      const result1 = offerService.getOfferActionFlags(Status.INTERVIEW_COMPLETED, 'CLIENT', '');
      const result2 = offerService.getOfferActionFlags(Status.INTERVIEW_COMPLETED, 'client', '');
      expect(result1).toEqual(result2);
    });

    test('should handle whitespace in user types', () => {
      const result = offerService.getOfferActionFlags(Status.INTERVIEW_COMPLETED, ' client ', '');
      const expected: Record<string, boolean> = {
        schedule_another_interview: true,
        create_offer: true,
      };
      allFlags.forEach(flag => {
        if (expected[flag]) {
          expect(result[flag]).toBe(true);
        } else {
          expect(result[flag]).toBe(false);
        }
      });
    });
  });

  describe('getOfferActionFlags - Negative Test Cases', () => {
    let offerService: OfferService;
    const allFlags = [
      'schedule_another_interview',
      'create_offer',
      'accept_offer',
      'reject_offer',
      'counter_offer',
      'edit_offer',
      'withdraw',
      'withdraw_candidate',
      'reject_candidate',
      'withdraw_counter_offer',
      'edit_counter_offer',
    ];

    beforeAll(() => {
      offerService = new OfferService();
    });

    test('should return all false flags for invalid user type', () => {
      const result = offerService.getOfferActionFlags(Status.INTERVIEW_COMPLETED, 'invalid_user', '');
      allFlags.forEach(flag => {
        expect(result[flag]).toBe(false);
      });
    });

    test('should return all false flags for invalid status', () => {
      const result = offerService.getOfferActionFlags('INVALID_STATUS', 'client', '');
      allFlags.forEach(flag => {
        expect(result[flag]).toBe(false);
      });
    });

    test('should handle null user type', () => {
      const result = offerService.getOfferActionFlags(Status.INTERVIEW_COMPLETED, null as any, '');
      allFlags.forEach(flag => {
        expect(result[flag]).toBe(false);
      });
    });

    test('should handle undefined user type', () => {
      const result = offerService.getOfferActionFlags(Status.INTERVIEW_COMPLETED, undefined as any, '');
      allFlags.forEach(flag => {
        expect(result[flag]).toBe(false);
      });
    });

    test('should handle empty string user type', () => {
      const result = offerService.getOfferActionFlags(Status.INTERVIEW_COMPLETED, '', '');
      allFlags.forEach(flag => {
        expect(result[flag]).toBe(false);
      });
    });
  });

  describe('getAllOffers - Positive Test Cases', () => {
    test('should return paginated offers for client user', async () => {
      // Arrange
      const mockRequest: any = {
        query: { page: '1', limit: '5' },
        params: { program_id: 'prog1' },
        user: { sub: 'user1', userType: 'client' },
      };

      const userData = [{ user_type: 'client', tenant_id: 'tenant1' }];
      mockOfferRepository.findUser.mockResolvedValue(userData);
      (jobController.getJobIdsForUserType as jest.Mock).mockResolvedValue(['job1', 'job2']);
      mockOfferRepository.getOfferCount.mockResolvedValue(3);
      mockOfferRepository.getOffers.mockResolvedValue([
        { id: 1, status: Status.PENDING_REVIEW, parent_offer_id: null },
        { id: 2, status: Status.ACCEPTED, parent_offer_id: null }
      ]);
      mockOfferRepository.getAllOffersCountQuery.mockResolvedValue('SELECT 1 as total_count');
      (sequelize.query as jest.Mock).mockImplementation((sql) => {
        if (sql === 'SELECT 1 as total_count') {
          return Promise.resolve([{ total_count: 3 }]);
        }
        return Promise.resolve([
          { id: 1, status: Status.PENDING_REVIEW, parent_offer_id: null },
          { id: 2, status: Status.ACCEPTED, parent_offer_id: null },
        ]);
      });
      mockOfferRepository.getAllOffersQuery.mockResolvedValue('SELECT * FROM offers');

      // Act
      const result = await offerService.getAllOffers(mockRequest);

      // Assert
      expect(result.items_per_page).toBe(5);
      expect(result.total_pages).toBe(1);
      expect(result.total_records).toBe(3);
      expect(Array.isArray(result.offers)).toBe(true); // Ensure offers is an array
      expect(result.offers).toHaveLength(2);
      expect(result.offers?.[0]).toHaveProperty('actions');
      expect(mockOfferRepository.findUser).toHaveBeenCalledWith('prog1', 'user1');
    });




    

    test('should handle vendor user with vendor_id', async () => {
      // Arrange
      const mockRequest: any = {
        query: { page: '1', limit: '10' },
        params: { program_id: 'prog1' },
        user: { sub: 'user1', userType: 'vendor' },
      };

      const userData = [{ user_type: 'vendor', tenant_id: 'vendor_tenant' }];
      const vendorData = [{ id: 'vendor123' }];
      
      mockOfferRepository.findUser.mockResolvedValue(userData);
      mockOfferRepository.findVendor.mockResolvedValue(vendorData);
      (jobController.getJobIdsForUserType as jest.Mock).mockResolvedValue(['job1']);
      mockOfferRepository.getOfferCount.mockResolvedValue(1);
      mockOfferRepository.getOffers.mockResolvedValue([
        { id: 1, status: Status.COUNTER_OFFER, parent_offer_id: null }
      ]);
      mockOfferRepository.getAllOffersCountQuery.mockResolvedValue('SELECT 1 as total_count');
      (sequelize.query as jest.Mock).mockImplementation((sql) => {
        if (sql === 'SELECT 1 as total_count') {
          return Promise.resolve([{ total_count: 1 }]);
        }
        return Promise.resolve([{ id: 1, status: Status.COUNTER_OFFER, parent_offer_id: null }]);
      });
      mockOfferRepository.getAllOffersQuery.mockResolvedValue('SELECT * FROM offers');

      // Act
      const result = await offerService.getAllOffers(mockRequest);

      // Assert
      expect(result.total_records).toBe(1);
      expect(mockOfferRepository.findVendor).toHaveBeenCalledWith('prog1', 'vendor_tenant');
    });

    test('should handle MSP user with hierarchy', async () => {
      // Arrange
      const mockRequest: any = {
        query: { page: '1', limit: '10' },
        params: { program_id: 'prog1' },
        user: { sub: 'user1', userType: 'msp' },
      };

      const userData = [{ user_type: 'msp', tenant_id: 'msp_tenant', is_all_hierarchy_associate: true }];
      const hierarchyIds = ['hierarchy1', 'hierarchy2'];
      
      mockOfferRepository.findUser.mockResolvedValue(userData);
      mockOfferRepository.findHierarchyIdsByManagedBy.mockResolvedValue(hierarchyIds);
      (jobController.getJobIdsForUserType as jest.Mock).mockResolvedValue(['job1']);
      mockOfferRepository.getOfferCount.mockResolvedValue(1);
      mockOfferRepository.getOffers.mockResolvedValue([
        { id: 1, status: Status.PENDING_APPROVAL, parent_offer_id: null }
      ]);
      mockOfferRepository.getAllOffersCountQuery.mockResolvedValue('SELECT 1 as total_count');
      (sequelize.query as jest.Mock).mockImplementation((sql) => {
        if (sql === 'SELECT 1 as total_count') {
          return Promise.resolve([{ total_count: 1 }]);
        }
        return Promise.resolve([{ id: 1, status: Status.PENDING_APPROVAL, parent_offer_id: null }]);
      });
      mockOfferRepository.getAllOffersQuery.mockResolvedValue('SELECT * FROM offers');

      // Act
      const result = await offerService.getAllOffers(mockRequest);

      // Assert
      expect(result.total_records).toBe(1);
      expect(mockOfferRepository.findHierarchyIdsByManagedBy).toHaveBeenCalledWith('prog1', 'msp_tenant');
    });

    test('should handle filters correctly', async () => {
      // Arrange
      const mockRequest: any = {
        query: { 
          page: '1', 
          limit: '10',
          job_id: 'job123',
          status: Status.PENDING_REVIEW,
          candidate_name: 'John Doe'
        },
        params: { program_id: 'prog1' },
        user: { sub: 'user1', userType: 'client' },
      };

      const userData = [{ user_type: 'client', tenant_id: 'tenant1' }];
      mockOfferRepository.findUser.mockResolvedValue(userData);
      (jobController.getJobIdsForUserType as jest.Mock).mockResolvedValue(['job1', 'job2']);
      mockOfferRepository.getOfferCount.mockResolvedValue(1);
      mockOfferRepository.getOffers.mockResolvedValue([
        { id: 1, status: Status.PENDING_REVIEW, parent_offer_id: null }
      ]);
      mockOfferRepository.getAllOffersCountQuery.mockResolvedValue('SELECT 1 as total_count');
      (sequelize.query as jest.Mock).mockResolvedValue([{ total_count: 1 }]);
      mockOfferRepository.getAllOffersQuery.mockResolvedValue('SELECT * FROM offers');

      // Act
      await offerService.getAllOffers(mockRequest);

      // Assert
      expect(mockOfferRepository.getOfferCount).toHaveBeenCalled();
      expect(mockOfferRepository.getOffers).toHaveBeenCalled();
    });
  });

  describe('getAllOffers - Negative Test Cases', () => {
    test('should handle repository findUser failure', async () => {
      // Arrange
      const mockRequest: any = {
        query: { page: '1', limit: '10' },
        params: { program_id: 'prog1' },
        user: { sub: 'user1', userType: 'client' },
      };

      mockOfferRepository.findUser.mockRejectedValue(new Error('Database connection failed'));

      // Act & Assert
      await expect(offerService.getAllOffers(mockRequest)).resolves.toEqual(
        expect.objectContaining({ error: 'Database connection failed', status_code: 400 })
      );
    });

    test('should handle invalid page parameter', async () => {
      // Arrange
      const mockRequest: any = {
        query: { page: 'invalid', limit: '10' },
        params: { program_id: 'prog1' },
        user: { sub: 'user1', userType: 'client' },
      };

      const userData = [{ user_type: 'client', tenant_id: 'tenant1' }];
      mockOfferRepository.findUser.mockResolvedValue(userData);
      (jobController.getJobIdsForUserType as jest.Mock).mockResolvedValue(['job1']);
      mockOfferRepository.getOfferCount.mockResolvedValue(0);
      mockOfferRepository.getOffers.mockResolvedValue([]);
      mockOfferRepository.getAllOffersCountQuery.mockResolvedValue('SELECT 1 as total_count');
      (sequelize.query as jest.Mock).mockResolvedValue([{ total_count: 0 }]);
      mockOfferRepository.getAllOffersQuery.mockResolvedValue('SELECT * FROM offers');

      // Act
      const result = await offerService.getAllOffers(mockRequest);

      // Assert
      expect(result.current_page).toBe(NaN); // parseInt('invalid') returns NaN
      expect(result.total_records).toBe(0);
    });

    test('should handle invalid limit parameter', async () => {
      // Arrange
      const mockRequest: any = {
        query: { page: '1', limit: 'invalid' },
        params: { program_id: 'prog1' },
        user: { sub: 'user1', userType: 'client' },
      };

      const userData = [{ user_type: 'client', tenant_id: 'tenant1' }];
      mockOfferRepository.findUser.mockResolvedValue(userData);
      (jobController.getJobIdsForUserType as jest.Mock).mockResolvedValue(['job1']);
      mockOfferRepository.getOfferCount.mockResolvedValue(0);
      mockOfferRepository.getOffers.mockResolvedValue([]);
      mockOfferRepository.getAllOffersCountQuery.mockResolvedValue('SELECT 1 as total_count');
      (sequelize.query as jest.Mock).mockResolvedValue([{ total_count: 0 }]);
      mockOfferRepository.getAllOffersQuery.mockResolvedValue('SELECT * FROM offers');

      // Act
      const result = await offerService.getAllOffers(mockRequest);

      // Assert
      expect(result.items_per_page).toBe(NaN); // parseInt('invalid') returns NaN
    });

    test('should handle empty results', async () => {
      // Arrange
      const mockRequest: any = {
        query: { page: '1', limit: '10' },
        params: { program_id: 'prog1' },
        user: { sub: 'user1', userType: 'client' },
      };

      const userData = [{ user_type: 'client', tenant_id: 'tenant1' }];
      mockOfferRepository.findUser.mockResolvedValue(userData);
      (jobController.getJobIdsForUserType as jest.Mock).mockResolvedValue([]);
      mockOfferRepository.getOfferCount.mockResolvedValue(0);
      mockOfferRepository.getOffers.mockResolvedValue([]);
      mockOfferRepository.getAllOffersCountQuery.mockResolvedValue('SELECT 1 as total_count');
      (sequelize.query as jest.Mock).mockResolvedValue([{ total_count: 0 }]);
      mockOfferRepository.getAllOffersQuery.mockResolvedValue('SELECT * FROM offers');

      // Act
      const result = await offerService.getAllOffers(mockRequest);

      // Assert
      expect(result.total_records).toBe(0);
      expect(result.offers).toEqual([]);
      expect(result.total_pages).toBe(0);
    });

    test('should handle missing user data', async () => {
      // Arrange
      const mockRequest: any = {
        query: { page: '1', limit: '10' },
        params: { program_id: 'prog1' },
        user: { sub: 'user1', userType: 'client' },
      };

      mockOfferRepository.findUser.mockResolvedValue([]);
      mockOfferRepository.getOfferCount.mockResolvedValue(0);
      mockOfferRepository.getOffers.mockResolvedValue([]);
      mockOfferRepository.getAllOffersCountQuery.mockResolvedValue('SELECT 1 as total_count');
      (sequelize.query as jest.Mock).mockResolvedValue([{ total_count: 0 }]);
      mockOfferRepository.getAllOffersQuery.mockResolvedValue('SELECT * FROM offers');

      // Act
      const result = await offerService.getAllOffers(mockRequest);

      // Assert
      expect(result.total_records).toBe(0);
      expect(result.offers).toEqual([]);
    });

    test('should handle missing user type', async () => {
      // Arrange
      const mockRequest: any = {
        query: { page: '1', limit: '10' },
        params: { program_id: 'prog1' },
        user: { sub: 'user1' }, // No userType
      };

      const userData = [{ tenant_id: 'tenant1' }]; // No user_type
      mockOfferRepository.findUser.mockResolvedValue(userData);
      (jobController.getJobIdsForUserType as jest.Mock).mockResolvedValue(['job1']);
      mockOfferRepository.getOfferCount.mockResolvedValue(0);
      mockOfferRepository.getOffers.mockResolvedValue([]);
      mockOfferRepository.getAllOffersCountQuery.mockResolvedValue('SELECT 1 as total_count');
      (sequelize.query as jest.Mock).mockResolvedValue([{ total_count: 0 }]);
      mockOfferRepository.getAllOffersQuery.mockResolvedValue('SELECT * FROM offers');

      // Act
      const result = await offerService.getAllOffers(mockRequest);

      // Assert
      expect(result.total_records).toBe(0);
    });

    test('should handle vendor findVendor failure', async () => {
      // Arrange
      const mockRequest: any = {
        query: { page: '1', limit: '10' },
        params: { program_id: 'prog1' },
        user: { sub: 'user1', userType: 'vendor' },
      };

      const userData = [{ user_type: 'vendor', tenant_id: 'vendor_tenant' }];
      mockOfferRepository.findUser.mockResolvedValue(userData);
      mockOfferRepository.findVendor.mockRejectedValue(new Error('Vendor not found'));

      // Act & Assert
      await expect(offerService.getAllOffers(mockRequest)).resolves.toEqual(
        expect.objectContaining({ error: 'Vendor not found', status_code: 400 })
      );
    });

    test('should handle MSP hierarchy failure', async () => {
      // Arrange
      const mockRequest: any = {
        query: { page: '1', limit: '10' },
        params: { program_id: 'prog1' },
        user: { sub: 'user1', userType: 'msp' },
      };

      const userData = [{ user_type: 'msp', tenant_id: 'msp_tenant', is_all_hierarchy_associate: true }];
      mockOfferRepository.findUser.mockResolvedValue(userData);
      mockOfferRepository.findHierarchyIdsByManagedBy.mockRejectedValue(new Error('Hierarchy lookup failed'));

      // Act & Assert
      await expect(offerService.getAllOffers(mockRequest)).resolves.toEqual(
        expect.objectContaining({ error: 'Hierarchy lookup failed', status_code: 400 })
      );
    });
  });

  describe('Edge Cases', () => {
    test('should handle very large page numbers', async () => {
      // Arrange
      const mockRequest: any = {
        query: { page: '999999', limit: '10' },
        params: { program_id: 'prog1' },
        user: { sub: 'user1', userType: 'client' },
      };

      const userData = [{ user_type: 'client', tenant_id: 'tenant1' }];
      mockOfferRepository.findUser.mockResolvedValue(userData);
      (jobController.getJobIdsForUserType as jest.Mock).mockResolvedValue(['job1']);
      mockOfferRepository.getOfferCount.mockResolvedValue(0);
      mockOfferRepository.getOffers.mockResolvedValue([]);
      mockOfferRepository.getAllOffersCountQuery.mockResolvedValue('SELECT 1 as total_count');
      (sequelize.query as jest.Mock).mockResolvedValue([{ total_count: 0 }]);
      mockOfferRepository.getAllOffersQuery.mockResolvedValue('SELECT * FROM offers');

      // Act
      const result = await offerService.getAllOffers(mockRequest);

      // Assert
      expect(result.current_page).toBe(999999);
      expect(result.total_pages).toBe(0);
    });

    test('should handle very large limit values', async () => {
      // Arrange
      const mockRequest: any = {
        query: { page: '1', limit: '999999' },
        params: { program_id: 'prog1' },
        user: { sub: 'user1', userType: 'client' },
      };

      const userData = [{ user_type: 'client', tenant_id: 'tenant1' }];
      mockOfferRepository.findUser.mockResolvedValue(userData);
      (jobController.getJobIdsForUserType as jest.Mock).mockResolvedValue(['job1']);
      mockOfferRepository.getOfferCount.mockResolvedValue(0);
      mockOfferRepository.getOffers.mockResolvedValue([]);
      mockOfferRepository.getAllOffersCountQuery.mockResolvedValue('SELECT 1 as total_count');
      (sequelize.query as jest.Mock).mockResolvedValue([{ total_count: 1 }]);
      mockOfferRepository.getAllOffersQuery.mockResolvedValue('SELECT * FROM offers');

      // Act
      const result = await offerService.getAllOffers(mockRequest);

      // Assert
      expect(result.items_per_page).toBe(999999);
    });

    test('should handle special characters in filters', async () => {
      // Arrange
      const mockRequest: any = {
        query: { 
          page: '1', 
          limit: '10',
          candidate_name: 'John\'s "Special" Name & Co.'
        },
        params: { program_id: 'prog1' },
        user: { sub: 'user1', userType: 'client' },
      };

      const userData = [{ user_type: 'client', tenant_id: 'tenant1' }];
      mockOfferRepository.findUser.mockResolvedValue(userData);
      (jobController.getJobIdsForUserType as jest.Mock).mockResolvedValue(['job1']);
      mockOfferRepository.getOfferCount.mockResolvedValue(0);
      mockOfferRepository.getOffers.mockResolvedValue([]);
      mockOfferRepository.getAllOffersCountQuery.mockResolvedValue('SELECT 1 as total_count');
      (sequelize.query as jest.Mock).mockResolvedValue([{ total_count: 0 }]);
      mockOfferRepository.getAllOffersQuery.mockResolvedValue('SELECT * FROM offers');

      // Act
      const result = await offerService.getAllOffers(mockRequest);

      // Assert
      expect(result.total_records).toBe(0);
    });
  });
}); 