import { z } from "zod";
import { createEvaluatorSchema } from "../evaluations/evaluations.schema.js";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  nombreCompleto: z.string().min(3),
  especialidadId: z.union([z.number().int().min(1), z.string().min(1)]),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export { createEvaluatorSchema };

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type CreateEvaluatorInput = z.infer<typeof createEvaluatorSchema>;
