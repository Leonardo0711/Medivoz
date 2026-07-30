import { FastifyInstance } from "fastify";
import { convertSchema } from "../../core/utils/schema.js";
import { requireEvaluationAccess } from "../../core/auth/roles.js";
import { logger } from "../../core/utils/logger.js";
import { evaluationsService } from "./evaluations.service.js";
import { savePdqi9EvaluationSchema } from "./evaluations.schema.js";

export async function evaluationsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) return;
    return requireEvaluationAccess(request, reply);
  });

  app.get("/consultations", async () => evaluationsService.listAvailableConsultations());

  app.get("/consultations/:consultaId", async (request, reply) => {
    const evaluadorId = (request.user as any).sub;
    const { consultaId } = request.params as { consultaId: string };
    const context = await evaluationsService.getContext(consultaId, evaluadorId);
    if (!context) return reply.code(404).send({ error: "Ficha no disponible para evaluacion" });
    return context;
  });

  app.put(
    "/consultations/:consultaId",
    { schema: { body: convertSchema(savePdqi9EvaluationSchema) } },
    async (request, reply) => {
      const evaluadorId = (request.user as any).sub;
      const { consultaId } = request.params as { consultaId: string };
      try {
        return await evaluationsService.save(consultaId, evaluadorId, request.body as any);
      } catch (error: any) {
        logger.error("[evaluations] save:failed", {
          consultaId,
          evaluadorId,
          message: error?.message || "unknown",
        });
        return reply.code(400).send({ error: error?.message || "No se pudo guardar la evaluacion" });
      }
    }
  );
}
