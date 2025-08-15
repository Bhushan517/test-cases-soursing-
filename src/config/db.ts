import dotenv from 'dotenv';
import { getSecretsManager } from './secrets-manager';
import Constants from './constant';

dotenv.config();

let config: any;

export const initializeDatabase = async () => {
  try {
    if (!config) {
      config = await getSecretsManager();
      console.log('Database configuration initialized successfully');
    }
  } catch (error) {
    console.error('Error initializing database configuration:', error);
    throw error;
  }
};

export const databaseConfig = {
  get config() {
    if (!config) {
      throw new Error('Database configuration has not been initialized.');
    }
    return {
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database,
      port: config.port,
      notification_url: config.notification_url,
      database_config: config.database_config,
      config_url: config.config_url,
      credentialing_url: config.credentialing_url,
      database_auth: config.database_auth,
      auth_url: config.auth_url,
      app_origin: config.app_origin,
      keycloak_subdomain: config.keycloak_subdomain,
      client_id: config.client_id,
      client_secret: config.client_secret,
      teai_url: config.teai_url,
      app_lang: Constants.LANGUAGE,
      ui_base_url: config.ui_base_url,
      outlook_secret_id: config.outlook_secret_id,
      outlook_secret_value: config.outlook_secret_value,
      outlook_redirect_uri: config.outlook_redirect_uri,
      encryption_key: config.encryption_key,
      ai_url: config.ai_url,
      api_public_url : config.api_public_url,
      root_tenant_id : config.root_tenant_id,
      reconnect: {
        max: 10,
        delay: 1000,
      },
    };
  },
};
