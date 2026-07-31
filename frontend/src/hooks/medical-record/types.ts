
export interface MedicalRecordFormData {
  motivo_consulta: string;
  tiempo_enfermedad: string;
  forma_inicio: string;
  curso_enfermedad: string;
  historia_cronologica: string;
  antecedentes: string;
  sintomas_principales: string;
  estado_funcional_basal: string;
  estudios_previos: string;
  notas_adicionales: string;
}

export interface PatientData {
  nombre: string;
  edad: number | null;
  ocupacion: string | null;
  procedencia: string | null;
}

export interface SectionMeta {
  nombre: keyof MedicalRecordFormData;
  textoSugeridoIa: string | null;
  textoActual: string | null;
  resumenSugeridoIa: string | null;
  resumenActual: string | null;
  estado: "vacia" | "borrador_ia" | "revisada" | "bloqueada";
  confianza: string | null;
  origenDato: string | null;
}

export type SectionMetaMap = Partial<Record<keyof MedicalRecordFormData, SectionMeta>>;

export interface RecordSummaryData {
  resumenSugeridoIa: string;
  resumenActual: string;
  notaEssi: string;
}
