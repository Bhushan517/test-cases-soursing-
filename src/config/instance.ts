import { Sequelize } from 'sequelize';
import { databaseConfig, initializeDatabase } from './db';

let sequelize: Sequelize;
let isInitializing = false;
let initializationPromise: Promise<void> | null = null;

const initializeSequelize = async () => {
  await initializeDatabase();
  sequelize = new Sequelize(
    databaseConfig.config.database,
    databaseConfig.config.user,
    databaseConfig.config.password,
    {
      host: databaseConfig.config.host,
      port: databaseConfig.config.port,
      dialect: 'mysql',
      logging: false,
      pool: {
        max: 100,
        min: 5,
        acquire: 60000,
        idle: 20000,
      },
      retry: {
        max: databaseConfig.config.reconnect.max || 3,
        backoffBase: databaseConfig.config.reconnect.delay || 1000,
      }
    }
  );
  await sequelize.sync({ alter: true });
};

interface DatabaseConnectionStatus {
  connected: boolean;
  message: string;
  database: string;
  error?: string;
}

const checkDatabaseConnection = async (): Promise<DatabaseConnectionStatus> => {
  if (!sequelize) {
    return {
      connected: false,
      message: 'Database not initialized',
      database: databaseConfig.config?.database || 'unknown'
    };
  }

  try {
    // Set a timeout for the authentication request
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Database connection timeout')), 5000);
    });

    // Race the authentication against the timeout
    await Promise.race([
      sequelize.authenticate(),
      timeoutPromise
    ]);

    return {
      connected: true,
      message: 'Database connected successfully',
      database: databaseConfig.config.database
    };
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    return {
      connected: false,
      message: 'Database connection failed',
      database: databaseConfig.config?.database || 'unknown',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

export { sequelize, checkDatabaseConnection, initializeSequelize };