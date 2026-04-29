import { pgTable, uuid, varchar, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { users } from "./auth.js";
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
  nombre: varchar("nombre", { length: 100 }).notNull().unique(),
  tipo: agentTypeEnum("tipo").notNull(),
  descripcion: text("descripcion"),
  configuracionBase: jsonb("configuracion_base").notNull(),
  activo: boolean("activo").default(true).notNull(),
  creadoPor: uuid("creado_por").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const agentTemplatePrompts = pgTable("versiones_prompt_plantilla", {
  id: uuid("id").primaryKey().defaultRandom(),
  plantillaId: uuid("plantilla_id").notNull().references(() => agentTemplates.id, { onDelete: "cascade" }),
  version: varchar("version", { length: 20 }).notNull(),
  systemPrompt: text("system_prompt").notNull(),
  userPromptTemplate: text("user_prompt_template"),
  configuracionModelo: jsonb("configuracion_modelo"),
  esActiva: boolean("es_activa").default(false).notNull(),
  creadoPor: uuid("creado_por").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const doctorAgents = pgTable("agentes_doctor", {
  id: uuid("id").primaryKey().defaultRandom(),
  doctorId: uuid("doctor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  plantillaId: uuid("plantilla_id").notNull().references(() => agentTemplates.id),
  nombrePersonalizado: varchar("nombre_personalizado", { length: 100 }),
  configuracionPersonalizada: jsonb("configuracion_personalizada"),
  estado: agentStatusEnum("estado").default("activo").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const doctorAgentSections = pgTable("secciones_habilitadas_agente_doctor", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenteDoctorId: uuid("agente_doctor_id")
    .notNull()
    .references(() => doctorAgents.id, { onDelete: "cascade" }),
  seccion: sectionNameEnum("seccion").notNull(),
  prioridad: integer("prioridad").default(0),
  configuracionExtraccion: jsonb("configuracion_extraccion"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const doctorAgentPrompts = pgTable("versiones_prompt_doctor", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenteDoctorId: uuid("agente_doctor_id")
    .notNull()
    .references(() => doctorAgents.id, { onDelete: "cascade" }),
  systemPrompt: text("system_prompt").notNull(),
  userPromptTemplate: text("user_prompt_template"),
  configuracionModelo: jsonb("configuracion_modelo"),
  origen: agentConfigOriginEnum("origen").default("administrador").notNull(),
  esActiva: boolean("es_activa").default(true).notNull(),
  creadoPor: uuid("creado_por").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

import { consultations } from "./clinical.js";
import { integer } from "drizzle-orm/pg-core";

export const agentExecutions = pgTable("ejecuciones_agente", {
  id: uuid("id").primaryKey().defaultRandom(),
  consultaId: uuid("consulta_id").notNull().references(() => consultations.id, { onDelete: "cascade" }),
  agenteDoctorId: uuid("agente_doctor_id").references(() => doctorAgents.id),
  tipo: executionTypeEnum("tipo").notNull(),
  estado: executionStatusEnum("estado").default("en_cola").notNull(),
  inputData: jsonb("input_data"),
  outputData: jsonb("output_data"),
  promptUsadoId: uuid("prompt_usado_id"),
  error: text("error"),
  duracionMs: integer("duracion_ms"),
  tokensInput: integer("tokens_input"),
  tokensOutput: integer("tokens_output"),
  costoEstimado: numeric("costo_estimado", { precision: 10, scale: 6 }),
  ejecutadoAt: timestamp("ejecutado_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

import { numeric } from "drizzle-orm/pg-core";
