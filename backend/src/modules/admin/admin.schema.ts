import { z } from "zod";

export const listUsersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  rol: z.enum(["doctor", "evaluador", "administrador"]).optional(),
  estado: z.enum(["activa", "suspendida", "bloqueada"]).optional(),
}).strict();

export const createManagedUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12, "La contraseña debe tener al menos 12 caracteres"),
  nombreCompleto: z.string().trim().min(3).max(160),
  rol: z.enum(["doctor", "evaluador"]),
  especialidadId: z.number().int().min(1).nullable().optional(),
}).strict().superRefine((value, context) => {
  if (value.rol === "doctor" && !value.especialidadId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["especialidadId"],
      message: "Debe seleccionar la especialidad del doctor",
    });
  }
});

export const updateManagedUserStatusSchema = z.object({
  estado: z.enum(["activa", "suspendida"]),
}).strict();

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type CreateManagedUserInput = z.infer<typeof createManagedUserSchema>;
export type UpdateManagedUserStatusInput = z.infer<typeof updateManagedUserStatusSchema>;
