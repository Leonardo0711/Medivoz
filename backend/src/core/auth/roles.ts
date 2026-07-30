import { FastifyReply, FastifyRequest } from "fastify";

export const applicationRoles = ["doctor", "evaluador", "administrador"] as const;
export type ApplicationRole = (typeof applicationRoles)[number];

export const requireRoles = (...allowedRoles: ApplicationRole[]) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    const role = (request.user as { rol?: ApplicationRole } | undefined)?.rol;
    if (role && allowedRoles.includes(role)) return;

    return reply.code(403).send({ error: "No tienes permiso para realizar esta accion" });
  };

export const requireClinicalAccess = requireRoles("doctor", "administrador");
export const requireEvaluationAccess = requireRoles("evaluador", "administrador");
