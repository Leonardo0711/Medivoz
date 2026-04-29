import { z } from "zod";

const patientMetadataSchema = z.object({
  ocupacion: z.string().nullable().optional(),
  procedencia: z.string().nullable().optional(),
  diagnostico: z.string().nullable().optional(),
}).optional();

export const createPatientSchema = z.object({
  nombre: z.string().min(1),
  dni: z.string().optional(),
  identificacion: z.string().optional(),
  edad: z.number().int().nonnegative().nullable().optional(),
  ocupacion: z.string().nullable().optional(),
  procedencia: z.string().nullable().optional(),
  diagnostico: z.string().nullable().optional(),
  metadata: patientMetadataSchema,
});

export const updatePatientSchema = createPatientSchema.partial();

export const createConsultationSchema = z.object({
  pacienteId: z.string().uuid(),
  estado: z.enum(["en_espera", "en_curso", "pausada", "finalizada", "cancelada"]).optional(),
  fecha: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const updateConsultationSchema = z.object({
  estado: z.enum(["en_espera", "en_curso", "pausada", "finalizada", "cancelada"]).optional(),
  fecha: z.string().optional(),
  inicioReal: z.string().optional(),
  finReal: z.string().optional(),
  transcripcionCompleta: z.string().optional(),
});
