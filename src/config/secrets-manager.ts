import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import * as dotenv from "dotenv";

dotenv.config();

const secretName = process.env.SECRET_NAME;
const region = process.env.REGION;

const secretsManager = new SecretsManagerClient({ region });

export const getSecretsManager = async () => {
    if (process.env.NODE_ENV === 'local') {
        return {
            host: process.env.DATABASE_HOST,
            port: process.env.DATABASE_PORT,
            user: process.env.DATABASE_USER,
            password: process.env.DATABASE_PASSWORD,
            database: process.env.DATABASE_NAME,
            notification_url: process.env.NOTIFICATION_URL,
            database_config: process.env.DATABASE_CONFIGURATOR,
            config_url: process.env.CONFIG_URL,
            credentialing_url: process.env.CREDENTIALING_URL,
            database_auth: process.env.DATABASE_AUTH,
            auth_url: process.env.AUTH_URL,
            keycloak_subdomain: process.env.KC_AUTH_URL,
            keycloak_client_id: process.env.KC_CLIENT_ID,
            keycloak_client_secret: process.env.KC_CLIENT_SECRET,
            keycloak_realm: process.env.KC_REALM,
            app_origin: process.env.KC_URL,
            teai_url: process.env.TEAI_URL,
            ui_base_url: process.env.UI_BASE_URL,
            outlook_secret_id : process.env.SECRET_ID,
            outlook_secret_value : process.env.SECRET_VALUE,
            outlook_redirect_uri: process.env.REDIRECT_URI,
            encryption_key: process.env.ENCRYPTION_KEY,
            ai_url: process.env.AI_URL,
            api_public_url: process.env.API_PUBLIC_URL,
            root_tenant_id: process.env.ROOT_TENANT_ID

        };
    }
    try {
        const command = new GetSecretValueCommand({ SecretId: secretName });
        const data = await secretsManager.send(command);
        if (data.SecretString) {
            const secret = JSON.parse(data.SecretString);
            return {
                host: secret.DATABASE_HOST,
                port: secret.DATABASE_PORT,
                user: secret.DATABASE_USER,
                password: secret.DATABASE_PASSWORD,
                database: secret.DATABASE_NAME,
                notification_url: secret.NOTIFICATION_URL,
                database_config: secret.DATABASE_CONFIGURATOR,
                config_url: secret.CONFIG_URL,
                credentialing_url: secret.CREDENTIALING_URL,
                database_auth: secret.DATABASE_AUTH,
                auth_url: secret.AUTH_URL,
                keycloak_subdomain: secret.KC_AUTH_URL,
                app_origin: secret.KC_URL,
                keycloak_client_id: secret.KC_CLIENT_ID,
                keycloak_client_secret: secret.KC_CLIENT_SECRET,
                keycloak_realm: secret.KC_REALM,
                teai_url: secret.TEAI_URL,
                ui_base_url: secret.UI_BASE_URL,
                outlook_secret_id: secret.Secret_ID,
                outlook_redirect_uri: secret.REDIRECT_URI,
                outlook_secret_value: secret.Secret_Value,
                encryption_key: secret.ENCRYPTION_KEY,
                ai_url:secret.AI_URL,
                api_public_url:secret.API_PUBLIC_URL,
                root_tenant_id: secret.ROOT_TENANT_ID

            };
        } else {
            throw new Error("Secret is in an invalid format (no SecretString found)");
        }
    } catch (err: any) {
        console.error("Failed to retrieve database configuration from Secrets Manager:", err.message || err);
        throw err;
    }
};
