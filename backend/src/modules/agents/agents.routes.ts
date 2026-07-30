import { FastifyInstance } from "fastify";
import { z } from "zod";
import { convertSchema } from "../../core/utils/schema.js";
import { agentsService } from "./agents.service.js";

const updateAgentSchema = z.object({
  nombre: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  estado: z.enum(["activo", "inactivo"]).optional(),
  prompt: z.string().optional(),
  configuracion: z.record(z.unknown()).optional(),
});

export async function agentsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/", async (request) => {
    const doctorId = (request.user as any).sub;
    return agentsService.listDoctorAgents(doctorId);
  });

  app.put(
    "/:agentId",
    {
      schema: { body: convertSchema(updateAgentSchema) },
    },
    async (request, reply) => {
      const doctorId = (request.user as any).sub;
      const { agentId } = request.params as any;
      const updated = await agentsService.updateDoctorAgent(doctorId, agentId, request.body as any);
      if (!updated) return reply.code(404).send({ error: "Agente no encontrado" });
      return updated;
    }
  );
}
