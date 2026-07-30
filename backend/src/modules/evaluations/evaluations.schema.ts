import { z } from "zod";

export const pdqi9Dimensions = [
  "actualizada",
  "exacta",
  "exhaustiva",
  "util",
  "organizada",
  "comprensible",
  "concisa",
  "sintetizada",
  "consistente",
] as const;

const pdqi9ScoresSchema = z.object(
  Object.fromEntries(pdqi9Dimensions.map((dimension) => [dimension, z.number().int().min(1).max(5)])) as Record<
    (typeof pdqi9Dimensions)[number],
    z.ZodNumber
  >
);

export const savePdqi9EvaluationSchema = z.object({
  notaEssi: z.string().trim().min(20).max(30_000),
  puntajesMedivoz: pdqi9ScoresSchema,
  puntajesEssi: pdqi9ScoresSchema,
  duracionEssiMs: z.number().int().min(0).max(12 * 60 * 60 * 1_000),
  comentarios: z.string().trim().max(5_000).optional().nullable(),
});

export const createEvaluatorSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(128),
  nombreCompleto: z.string().trim().min(3).max(160),
});

export type SavePdqi9EvaluationInput = z.infer<typeof savePdqi9EvaluationSchema>;
export type CreateEvaluatorInput = z.infer<typeof createEvaluatorSchema>;
