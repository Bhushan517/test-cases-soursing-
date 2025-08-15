export function mockDbConfig() {
  jest.mock('../../src/config/db', () => ({
    databaseConfig: {
      config: {
        database_config: {},
      },
    },
  }));
} 