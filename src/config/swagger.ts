import type { FastifyInstance } from 'fastify'
import Swagger from '@fastify/swagger'
import SwaggerUi from '@fastify/swagger-ui'
const configSwagger = {
    swagger: {
        info: {
            title: 'Sourcing API',
            description: 'API documentation for Sourcing API',
            version: '1.0.0',
        },
        externalDocs: {
            url: 'https://swagger.io',
            description: 'Find more info here',
        },
        security: [
            {
                bearerAuth: [],
            },
        ],
        securityDefinitions: {
            bearerAuth: {
                type: 'apiKey' as 'apiKey',
                name: 'Authorization',
                in: 'header',
                description:
                    'JWT Authorization header using the Bearer scheme. Example: "Authorization: Bearer {token}"',
            },
        },
        schemes: ['http','https'], 
        consumes: ['application/json'],
        produces: ['application/json']
    },
}
const configSwaggerUi = {
    routePrefix: '/sourcing/docs',
    uiConfig: {
        docExpansion: 'list' as 'list' | 'full' | 'none',
        deepLinking: false
    },
    uiHooks: {
        onRequest: function (request: any, reply: any, next: any) {
            next()
        },
        preHandler: function (request: any, reply: any, next: any) {
            next()
        },
    },
    staticCSP: true,
    transformStaticCSP: (header: any) => header,
}

export default async function LoadSwagger(instance: FastifyInstance) {
    await instance.register(Swagger, configSwagger)
    await instance.register(SwaggerUi, configSwaggerUi)
}