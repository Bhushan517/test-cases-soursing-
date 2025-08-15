import fp from 'fastify-plugin';
import pino from 'pino';

export default fp(async (fastify) => {
  fastify.register(require('fastify-pino'), {
    logger: pino(),
  });
});