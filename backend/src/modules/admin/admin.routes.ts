import { FastifyInstance } from "fastify";
import { requireRoles } from "../../core/auth/roles.js";
import { convertSchema } from "../../core/utils/schema.js";
import { adminService } from "./admin.service.js";
import {
  createManagedUserSchema,
  listUsersQuerySchema,
  updateManagedUserStatusSchema,
} from "./admin.schema.js";

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) return;
    return requireRoles("administrador")(request, reply);
  });

  app.get("/users", {
    schema: { querystring: convertSchema(listUsersQuerySchema) },
  }, async (request) => adminService.listUsers(request.query as any));

  app.post("/users", {
    schema: { body: convertSchema(createManagedUserSchema) },
  }, async (request, reply) => {
    try {
      const actorId = (request.user as any).sub;
      return reply.code(201).send(await adminService.createUser(actorId, request.body as any));
    } catch (error: any) {
      const message = error?.message || "No se pudo crear el usuario";
      const conflict = message.includes("registrado") || message.includes("duplicate key");
      return reply.code(conflict ? 409 : 400).send({ error: message });
    }
  });

  app.patch("/users/:id/status", {
    schema: { body: convertSchema(updateManagedUserStatusSchema) },
  }, async (request, reply) => {
    try {
      const actorId = (request.user as any).sub;
      const { id } = request.params as { id: string };
      return await adminService.updateUserStatus(actorId, id, request.body as any);
    } catch (error: any) {
      const message = error?.message || "No se pudo actualizar el usuario";
      return reply.code(message.includes("no encontrado") ? 404 : 400).send({ error: message });
    }
  });
}
