import { pgEnum } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("rol_aplicacion", ["doctor", "administrador"]);

export const accountStatusEnum = pgEnum("estado_cuenta", [
  "activa",
  "suspendida",
  "bloqueada",
]);

export const consultationStatusEnum = pgEnum("estado_consulta", [
  "en_espera",
  "en_curso",
  "pausada",
  "finalizada",
  "cancelada",
]);

export const speakerTypeEnum = pgEnum("tipo_hablante", [
  "doctor",
  "paciente",
  "familiar",
  "desconocido",
]);

export const transcriptionOriginEnum = pgEnum("origen_transcripcion", [
  "flujo_en_vivo",
  "archivo_subido",
  "edicion_manual",
  "fusion_sistema",
]);

export const sectionNameEnum = pgEnum("nombre_seccion", [
  "motivo_consulta",
  "tiempo_enfermedad",
  "forma_inicio",
  "curso_enfermedad",
  "historia_cronologica",
  "antecedentes",
  "sintomas_principales",
  "estado_funcional_basal",
  "estudios_previos",
  "notas_adicionales",
]);

export const sectionStatusEnum = pgEnum("estado_seccion", [
  "vacia",
  "borrador_ia",
  "revisada",
  "bloqueada",
]);

export const updateOriginEnum = pgEnum("origen_actualizacion", [
  "ia",
  "doctor",
  "manual",
  "sistema",
]);

export const executionStatusEnum = pgEnum("estado_ejecucion", [
  "en_cola",
  "ejecutando",
  "exitosa",
  "fallida",
  "cancelada",
]);

export const executionTypeEnum = pgEnum("tipo_ejecucion", [
  "transcripcion",
  "llenado_seccion",
  "refinamiento_seccion",
  "resumen_completo",
  "validacion",
]);

export const agentTypeEnum = pgEnum("tipo_agente", [
  "transcriptor",
  "extractor",
  "resumidor",
  "validador",
]);

export const agentStatusEnum = pgEnum("estado_agente", ["activo", "inactivo"]);

export const agentConfigOriginEnum = pgEnum("origen_configuracion_agente", [
  "administrador",
  "doctor",
  "sistema",
]);

export const temporalAudioStatusEnum = pgEnum("estado_audio_temporal", [
  "pendiente_procesamiento",
  "disponible",
  "marcado_para_borrado",
  "eliminado",
  "error_eliminacion",
]);
