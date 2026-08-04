import fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { env } from "./config/env.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { clinicalRoutes } from "./modules/clinical/clinical.routes.js";
import { scribeRoutes } from "./modules/scribe/scribe.routes.js";
import { agentsRoutes } from "./modules/agents/agents.routes.js";
import { evaluationsRoutes } from "./modules/evaluations/evaluations.routes.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";
import { setupSockets } from "./socket/index.js";
import { db } from "./db/index.js";
import { userRoles, users } from "./db/schema/auth.js";
import { eq } from "drizzle-orm";

export async function buildApp() {
  const app = fastify({
    // Audio upload is sent as base64 JSON; allow up to ~25MB source audio (+ overhead).
    bodyLimit: 40 * 1024 * 1024,
    logger: {
      transport:
        env.NODE_ENV === "development"
          ? {
              target: "pino-pretty",
              options: {
                translateTime: "HH:MM:ss Z",
                ignore: "pid,hostname",
              },
            }
          : undefined,
    },
  });

  // Accept direct binary uploads for audio files to avoid base64 overhead.
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });
  app.addContentTypeParser(/^audio\/.*/, { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  // Plugins
  await app.register(cors, {
    origin: env.FRONTEND_URL,
    credentials: true,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  // Health check
  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // Decorators
  app.decorate("authenticate", async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
      const userId = request.user?.sub;
      const [user, currentRoles] = userId
        ? await Promise.all([
            db.query.users.findFirst({
              columns: { estado: true },
              where: eq(users.id, userId),
            }),
            db.query.userRoles.findMany({
              columns: { rol: true },
              where: eq(userRoles.userId, userId),
            }),
          ])
        : [null, []];
      if (!user || user.estado !== "activa") {
        return reply.code(401).send({ error: "La cuenta no está activa" });
      }
      const currentRole = currentRoles.some((item) => item.rol === "administrador")
        ? "administrador"
        : currentRoles.some((item) => item.rol === "evaluador")
          ? "evaluador"
          : currentRoles.some((item) => item.rol === "doctor")
            ? "doctor"
            : null;
      if (!currentRole) {
        return reply.code(403).send({ error: "La cuenta no tiene un rol asignado" });
      }
      request.user.rol = currentRole;
    } catch (err) {
      if (!reply.sent) reply.send(err);
    }
  });

  // Routes
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(clinicalRoutes, { prefix: "/api/v1/clinical" });
  await app.register(scribeRoutes, { prefix: "/api/v1/scribe" });
  await app.register(agentsRoutes, { prefix: "/api/v1/agents" });
  await app.register(evaluationsRoutes, { prefix: "/api/v1/evaluations" });
  await app.register(adminRoutes, { prefix: "/api/v1/admin" });

  setupSockets(app);

  return app;
}
