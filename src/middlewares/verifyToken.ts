import { FastifyRequest, FastifyReply } from "fastify";
import jwt, { JwtPayload } from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

declare module 'fastify' {
  interface FastifyRequest {
    user?: any;
  }

}

export const verifyToken = async (request: FastifyRequest, reply: FastifyReply) => {
  const authHeader = request.headers?.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];

    try {
      const decodedToken = jwt.decode(token) as JwtPayload;
      request.user = decodedToken;
    } catch (error) {
      return reply.status(401).send({
        status: "Failed",
        errorMessage: "Unauthorized - Invalid token",
      });
    }
  } else {
    return reply.status(401).send({
      status: "Failed",
      message: "Unauthorized - Token not found",
    });
  }
};

export const decodeToken = async (token: string) => {
  try {
    const decoded = jwt.decode(token) as JwtPayload;
    return decoded;
  } catch (error) {
    console.error('Token decoding error:', (error as any).message);
    throw new Error('Token decoding failed');
  }
};