
import * as z from "zod";

// Define form validation schema
export const patientFormSchema = z.object({
  nombre: z.string().min(2, { message: "El nombre debe tener al menos 2 caracteres" }),
  dni: z.string().min(1, { message: "El DNI es obligatorio" }),
  edad: z.coerce.number().optional().nullable(),
  ocupacion: z.string().optional(),
  procedencia: z.string().optional(),
  diagnostico: z.string().optional(),
});

export type PatientFormValues = z.infer<typeof patientFormSchema>;

export interface Patient {
  id: string;
  nombre: string;
  dni: string;
  edad: number | null;
  ocupacion: string | null;
  procedencia: string | null;
  diagnostico: string | null;
  ultima_visita?: string | null; // Added to fix type compatibility
}

export type PatientDialogMode = 'create' | 'edit';
