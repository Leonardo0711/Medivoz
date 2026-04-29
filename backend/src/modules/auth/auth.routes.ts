import { FastifyInstance } from "fastify";
import { authService } from "./auth.service.js";
import { registerSchema, loginSchema, refreshTokenSchema } from "./auth.schema.js";
import { convertSchema } from "../../core/utils/schema.js";

export async function authRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/register
  app.post("/register", {
    schema: { body: convertSchema(registerSchema) }
  }, async (request, reply) => {
    try {
      const user = await authService.register(request.body as any);
      return reply.code(201).send({ message: "Usuario registrado con éxito", id: user.id });
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  // POST /api/v1/auth/login
  app.post("/login", {
    schema: { body: convertSchema(loginSchema) }
  }, async (request, reply) => {
    try {
      const { user, refreshToken } = await authService.login(request.body as any, {
        ip: request.ip,
        userAgent: request.headers["user-agent"]
      });

      const accessToken = app.jwt.sign({
        sub: user.id,
        email: user.email,
        rol: user.rol
      }, { expiresIn: "15m" });

      return { accessToken, refreshToken, user };
    } catch (error: any) {
      return reply.code(401).send({ error: error.message });
    }
  });

  // POST /api/v1/auth/refresh
  app.post("/refresh", {
    schema: { body: convertSchema(refreshTokenSchema) }
  }, async (request, reply) => {
    try {
      const { refreshToken } = request.body as any;
      const { user, refreshToken: rotatedRefreshToken } = await authService.refresh(refreshToken);

      const accessToken = app.jwt.sign({
        sub: user.id,
        email: user.email,
        rol: user.rol
      }, { expiresIn: "15m" });

      return { accessToken, refreshToken: rotatedRefreshToken, user };
    } catch (error: any) {
      return reply.code(401).send({ error: error.message });
    }
  });
}
