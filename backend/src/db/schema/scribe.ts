import { boolean, jsonb, numeric, pgTable, text, timestamp, uuid, varchar, integer } from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { consultations } from "./clinical.js";
import {
  speakerTypeEnum,
  transcriptionOriginEnum,
  sectionNameEnum,
  sectionStatusEnum,
  updateOriginEnum,
} from "./enums.js";

export const transcriptionSegments = pgTable("segmentos_transcripcion", {
  id: uuid("id").primaryKey().defaultRandom(),
  consultaId: uuid("consulta_id").notNull().references(() => consultations.id, { onDelete: "cascade" }),
  numeroSecuencia: integer("numero_secuencia").notNull(),
  hablante: speakerTypeEnum("hablante").default("desconocido").notNull(),
  origen: transcriptionOriginEnum("origen").default("flujo_en_vivo").notNull(),
  inicioMs: integer("inicio_ms"),
  finMs: integer("fin_ms"),
  texto: text("texto").notNull(),
  confianza: numeric("confianza", { precision: 5, scale: 4 }),
  codigoIdioma: varchar("codigo_idioma", { length: 10 }),
  cargaCruda: jsonb("carga_cruda"),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
});

export const medicalRecords = pgTable("fichas_medicas", {
  id: uuid("id").primaryKey().defaultRandom(),
  consultaId: uuid("consulta_id").notNull().references(() => consultations.id, { onDelete: "cascade" }),
  estaFinalizada: boolean("esta_finalizada").default(false).notNull(),
  finalizadaEn: timestamp("finalizada_en", { withTimezone: true }),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
});

export const medicalRecordSections = pgTable("secciones_ficha_medica", {
  id: uuid("id").primaryKey().defaultRandom(),
  fichaId: uuid("ficha_medica_id").notNull().references(() => medicalRecords.id, { onDelete: "cascade" }),
  nombre: sectionNameEnum("seccion").notNull(),
  textoActual: text("texto_actual"),
  estado: sectionStatusEnum("estado").default("vacia").notNull(),
  confianza: numeric("confianza", { precision: 5, scale: 4 }),
  origenActualizacion: updateOriginEnum("ultimo_origen_actualizacion").default("sistema").notNull(),
  usuarioId: uuid("ultimo_usuario_id").references(() => users.id, { onDelete: "set null" }),
  ultimaEjecucionAgenteId: uuid("ultima_ejecucion_agente_id"),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
});

export const medicalRecordVersions = pgTable("versiones_ficha_medica", {
  id: uuid("id").primaryKey().defaultRandom(),
  fichaId: uuid("ficha_medica_id").notNull().references(() => medicalRecords.id, { onDelete: "cascade" }),
  version: integer("numero_version").notNull(),
  origen: updateOriginEnum("origen").notNull(),
  ejecucionAgenteId: uuid("ejecucion_agente_id"),
  creadoPor: uuid("creado_por").references(() => users.id, { onDelete: "set null" }),
  contenidoSnapshot: jsonb("instantanea").notNull(),
  resumenCambios: text("resumen_cambios"),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});

export const medicalRecordChanges = pgTable("cambios_seccion_ficha", {
  id: uuid("id").primaryKey().defaultRandom(),
  seccionId: uuid("seccion_ficha_id").notNull().references(() => medicalRecordSections.id, { onDelete: "cascade" }),
  origen: updateOriginEnum("origen").notNull(),
  ejecucionAgenteId: uuid("ejecucion_agente_id"),
  autorId: uuid("actualizado_por").references(() => users.id, { onDelete: "set null" }),
  contenidoAnterior: text("texto_anterior"),
  contenidoNuevo: text("texto_nuevo"),
  confianza: numeric("confianza", { precision: 5, scale: 4 }),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});
