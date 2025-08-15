import fastify from "fastify";
import dotenv from "dotenv";
import cors from "@fastify/cors";
import { checkDatabaseConnection, initializeSequelize, sequelize } from "./config/instance";
import keycloak, { KeycloakOptions } from 'fastify-keycloak-adapter';
import { databaseConfig } from './config/db';
import { handleRouteSecurity } from "./utility/securityUtils";
import LoadSwagger from './config/swagger';

dotenv.config();

const app = fastify({
  logger: {
    level: "info",
    transport: {
      target: "pino-pretty"
    }
  }
});

app.register(cors, {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

app.get("/", async (request, reply) => {
  reply.send({ message: "Welcome to v4-sourcing-api-dev service" });
});

const start = async () => {
  try {
    // Initialize database with retry logic
    let dbConnected = false;
    let retryCount = 0;
    const maxRetries = 5;

    while (!dbConnected && retryCount < maxRetries) {
      try {
        await initializeSequelize();
        const dbStatus = await checkDatabaseConnection();

        if (dbStatus.connected) {
          dbConnected = true;
          console.log(`Database connected successfully on attempt ${retryCount + 1}`);
        } else {
          retryCount++;
          console.log(`Database connection failed (attempt ${retryCount}/${maxRetries}): ${dbStatus.message}`);

          if (retryCount < maxRetries) {
            // Exponential backoff: 2^retryCount * 1000ms (1s, 2s, 4s, 8s, 16s)
            const delay = Math.min(Math.pow(2, retryCount) * 1000, 30000);
            console.log(`Retrying in ${delay / 1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      } catch (error) {
        retryCount++;
        console.error(`Error initializing database (attempt ${retryCount}/${maxRetries}):`, error);

        if (retryCount < maxRetries) {
          const delay = Math.min(Math.pow(2, retryCount) * 1000, 30000);
          console.log(`Retrying in ${delay / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    if (!dbConnected) {
      throw new Error(`Failed to connect to database after ${maxRetries} attempts`);
    }

    const config = databaseConfig.config;
    const opts: KeycloakOptions = {
      appOrigin: config.app_origin,
      keycloakSubdomain: config.keycloak_subdomain,
      clientId: config.client_id,
      clientSecret: config.client_secret,
      bypassFn: (req: any) => handleRouteSecurity(req),
      unauthorizedHandler: (request: any, reply: any) => {
        const authHeader = request.headers?.authorization;
        if (!(authHeader?.startsWith("Bearer "))) {
          reply.status(401).send({
            statusCode: 401,
            error: "Unauthorized",
            message: "Token not found",
          });
        } else {
          reply.status(401).send({
            statusCode: 401,
            error: "Unauthorized",
            message: "Access denied. You are not authorized to perform this action.",
          });
        }
      },
    };

    try {
    app.register(keycloak, opts);
      console.log("Keycloak plugin registered successfully");
    } catch (error) {
      console.error("Failed to register Keycloak plugin:", error);
      // Continue server startup even if Keycloak fails
    }

    await LoadSwagger(app);

    app.get("/sourcing/health-check", async (request: any, reply: any) => {
      try {
        app.log.info(`Route Trace ID: ${request.traceId || "N/A"}`);

        // Just check the connection, don't reinitialize
        const connectionStatus = await checkDatabaseConnection();

        app.log.info(`Database connection status: ${connectionStatus.connected ? "connected" : "disconnected"}`);

        return reply.status(connectionStatus.connected ? 200 : 503).send({
          "message": "Health Check Page",
          "name": "Sourcing API",
          "version": '1.0.0',
          "status": connectionStatus.connected ? 200 : 503, // Match status code with connection status
          "dependencies": [
            {
              "type": "database-mysql",
              "status": connectionStatus.connected,
              "required": true
            },
          ],
          timestamp: new Date().toUTCString()
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message: "Failed to check database connection",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    const registerRoutes = require("./routes").default;
    app.register(registerRoutes);

    // Add a database ping interval to keep connections alive
    const pingInterval = setInterval(async () => {
      try {
        const status = await checkDatabaseConnection();
        if (!status.connected) {
          app.log.warn('Database ping failed, attempting to reconnect...');
          await initializeSequelize();
        }
      } catch (error) {
        app.log.error('Error during database ping:', error);
      }
    }, 30000); // Ping every 30 seconds

    app.addHook('onClose', async () => {
      app.log.info('Server shutting down, closing resources...');

      // Clear the ping interval
      clearInterval(pingInterval);

      try {
        if (sequelize) {
          await sequelize.close();
          app.log.info('Database connections closed successfully');
        }
        app.log.info('All resources closed successfully');
      } catch (error) {
        app.log.error(`Error during shutdown: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    const port = 8002;
    app.listen({ port, host: "0.0.0.0" }, (err) => {
      if (err) throw err;
      app.log.info(`🚀 Server is running on http://localhost:${port}`);
    });

    app.log.info(`Server listening on port ${port}`);

  } catch (error) {
    console.log('Failed to start application:', error);
    process.exit(1);
  }
};

start();
