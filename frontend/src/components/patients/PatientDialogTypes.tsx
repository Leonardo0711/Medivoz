
import * as z from "zod";

// Define form validation schema
export const patientFormSchema = z.object({
  nombre: z.string().min(2, { message: "El nombre debe tener al menos 2 caracteres" }),
  dni: z.string().optional(),
  edad: z.coerce.number().int().min(0).max(130).optional().nullable(),
});

export type PatientFormValues = z.infer<typeof patientFormSchema>;

export interface Patient {
  id: string;
  nombre: string;
  dni: string | null;
  codigoPaciente?: string | null;
  edad: number | null;
  ocupacion: string | null;
  procedencia: string | null;
  diagnostico: string | null;
  ultimaVisita?: string | null;
  ultima_visita?: string | null; // Added to fix type compatibility
  consultasPendientesValidacion?: number;
  seccionesPendientesIa?: number;
  resumenesPendientes?: number;
  notasEssiPendientes?: number;
}

export type PatientDialogMode = 'create' | 'edit';
