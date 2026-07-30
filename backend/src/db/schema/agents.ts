import { pgTable, uuid, varchar, text, timestamp, boolean, jsonb, integer, numeric } from "drizzle-orm/pg-core";
import { specialities, users } from "./auth.js";
import { 
  agentTypeEnum, 
  agentStatusEnum, 
  agentConfigOriginEnum, 
  sectionNameEnum, 
  executionTypeEnum, 
  executionStatusEnum 
} from "./enums.js";

export const agentTemplates = pgTable("plantillas_agente", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombrePlantilla: text("nombre_plantilla").notNull(),
  descripcion: text("descripcion"),
  tipo: agentTypeEnum("tipo").notNull(),
  estado: agentStatusEnum("estado").default("activo").notNull(),
  especialidadId: integer("especialidad_id").references(() => specialities.id, { onDelete: "set null" }),
  creadaPorId: uuid("creada_por_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  visibleParaTodosLosDoctores: boolean("visible_para_todos_los_doctores").default(true).notNull(),
  configuracionBase: jsonb("configuracion_base").default({}).notNull(),
  documentosReferencia: text("documentos_referencia").array(),
  dependencias: text("dependencias").array(),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
});

export const agentTemplatePrompts = pgTable("versiones_prompt_plantilla", {
  id: uuid("id").primaryKey().defaultRandom(),
  plantillaAgenteId: uuid("plantilla_agente_id").notNull().references(() => agentTemplates.id, { onDelete: "cascade" }),
  numeroVersion: integer("numero_version").notNull(),
  textoPrompt: text("texto_prompt").notNull(),
  nombreModelo: varchar("nombre_modelo", { length: 100 }),
  temperatura: numeric("temperatura", { precision: 3, scale: 2 }),
  configuracionExtra: jsonb("configuracion_extra").default({}).notNull(),
  esActiva: boolean("es_activa").default(true).notNull(),
  creadaPorId: uuid("creada_por_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});

export const doctorAgents = pgTable("agentes_doctor", {
  id: uuid("id").primaryKey().defaultRandom(),
  doctorId: uuid("doctor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  plantillaAgenteId: uuid("plantilla_agente_id").notNull().references(() => agentTemplates.id, { onDelete: "cascade" }),
  nombreVisible: text("nombre_visible"),
  estado: agentStatusEnum("estado").default("activo").notNull(),
  editablePorDoctor: boolean("editable_por_doctor").default(false).notNull(),
  usarEnConsultaEnVivo: boolean("usar_en_consulta_en_vivo").default(true).notNull(),
  usarEnResumenFinal: boolean("usar_en_resumen_final").default(true).notNull(),
  prioridad: integer("prioridad").default(1).notNull(),
  configuracionSobrescrita: jsonb("configuracion_sobrescrita"),
  observacionesAdmin: text("observaciones_admin"),
  asignadoPorId: uuid("asignado_por_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
});

export const doctorAgentSections = pgTable("secciones_habilitadas_agente_doctor", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenteDoctorId: uuid("agente_doctor_id")
    .notNull()
    .references(() => doctorAgents.id, { onDelete: "cascade" }),
  seccion: sectionNameEnum("seccion").notNull(),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});

export const doctorAgentPrompts = pgTable("versiones_prompt_doctor", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenteDoctorId: uuid("agente_doctor_id")
    .notNull()
    .references(() => doctorAgents.id, { onDelete: "cascade" }),
  numeroVersion: integer("numero_version").notNull(),
  textoPrompt: text("texto_prompt").notNull(),
  nombreModelo: varchar("nombre_modelo", { length: 100 }),
  temperatura: numeric("temperatura", { precision: 3, scale: 2 }),
  configuracionExtra: jsonb("configuracion_extra").default({}).notNull(),
  esActiva: boolean("es_activa").default(true).notNull(),
  creadaPorId: uuid("creada_por_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  origen: agentConfigOriginEnum("origen").default("administrador").notNull(),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});

import { consultations } from "./clinical.js";

export const agentExecutions = pgTable("ejecuciones_agente", {
  id: uuid("id").primaryKey().defaultRandom(),
  consultaId: uuid("consulta_id").notNull().references(() => consultations.id, { onDelete: "cascade" }),
  agenteDoctorId: uuid("agente_doctor_id").references(() => doctorAgents.id, { onDelete: "set null" }),
  versionPromptPlantillaId: uuid("version_prompt_plantilla_id").references(() => agentTemplatePrompts.id, { onDelete: "set null" }),
  versionPromptDoctorId: uuid("version_prompt_doctor_id").references(() => doctorAgentPrompts.id, { onDelete: "set null" }),
  tipo: executionTypeEnum("tipo").notNull(),
  estado: executionStatusEnum("estado").default("en_cola").notNull(),
  seccionObjetivo: sectionNameEnum("seccion_objetivo"),
  segmentoDesde: integer("segmento_desde"),
  segmentoHasta: integer("segmento_hasta"),
  nombreModeloUsado: varchar("nombre_modelo_usado", { length: 100 }),
  temperaturaUsada: numeric("temperatura_usada", { precision: 3, scale: 2 }),
  entradaJson: jsonb("entrada_json"),
  salidaJson: jsonb("salida_json"),
  salidaTexto: text("salida_texto"),
  tokensEntrada: integer("tokens_entrada"),
  tokensSalida: integer("tokens_salida"),
  tokensTotal: integer("tokens_total"),
  costoEstimadoUsd: numeric("costo_estimado_usd", { precision: 10, scale: 6 }),
  inicioEjecucion: timestamp("inicio_ejecucion", { withTimezone: true }),
  finEjecucion: timestamp("fin_ejecucion", { withTimezone: true }),
  latenciaMs: integer("latencia_ms"),
  mensajeError: text("mensaje_error"),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});
