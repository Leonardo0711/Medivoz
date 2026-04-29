
export interface MedicalRecordData {
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

export interface AutoFillState {
  isAutoFilling: boolean;
  autoFillData: MedicalRecordData | null;
}
