import { boolean, pgTable, uuid, varchar, text, timestamp, integer, bigint, numeric } from "drizzle-orm/pg-core";
import { specialities, users } from "./auth.js";
import {
  anamnesisPhaseStatusEnum,
  consultationStatusEnum,
  consultationTypeEnum,
  sectionNameEnum,
  temporalAudioStatusEnum,
} from "./enums.js";

export const anamnesisTemplates = pgTable("plantillas_anamnesis", {
  id: uuid("id").primaryKey().defaultRandom(),
  especialidadId: integer("especialidad_id").notNull().references(() => specialities.id, { onDelete: "restrict" }),
  nombrePlantilla: text("nombre_plantilla").notNull(),
  numeroVersion: integer("numero_version").default(1).notNull(),
  descripcion: text("descripcion").default("").notNull(),
  esActiva: boolean("es_activa").default(true).notNull(),
  creadaPorId: uuid("creada_por_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
});

export const anamnesisTemplateSections = pgTable("secciones_plantilla_anamnesis", {
  id: uuid("id").primaryKey().defaultRandom(),
  plantillaAnamnesisId: uuid("plantilla_anamnesis_id")
    .notNull()
    .references(() => anamnesisTemplates.id, { onDelete: "cascade" }),
  seccion: sectionNameEnum("seccion").notNull(),
  etiquetaVisible: text("etiqueta_visible").notNull(),
  descripcionIa: text("descripcion_ia"),
  orden: integer("orden").notNull(),
  esObligatoria: boolean("es_obligatoria").default(false).notNull(),
  activa: boolean("activa").default(true).notNull(),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});

export const patients = pgTable("pacientes", {
  id: uuid("id").primaryKey().defaultRandom(),
  doctorId: uuid("doctor_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  codigoPaciente: varchar("codigo_paciente", { length: 40 }).notNull(),
  nombre: text("nombres_apellidos").notNull(),
  dni: varchar("dni", { length: 20 }),
  edad: integer("edad"),
  ocupacion: text("ocupacion"),
  procedencia: text("procedencia"),
  diagnostico: text("diagnostico_general"),
  ultimaVisita: timestamp("ultima_visita", { withTimezone: true }),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
});

export const consultations = pgTable("consultas", {
  id: uuid("id").primaryKey().defaultRandom(),
  doctorId: uuid("doctor_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  pacienteId: uuid("paciente_id").notNull().references(() => patients.id, { onDelete: "restrict" }),
  plantillaAnamnesisId: uuid("plantilla_anamnesis_id").references(() => anamnesisTemplates.id, { onDelete: "set null" }),
  codigoSesion: varchar("codigo_consulta", { length: 40 }).notNull(),
  tipoConsulta: consultationTypeEnum("tipo_consulta").default("primera_consulta").notNull(),
  estado: consultationStatusEnum("estado").default("en_espera").notNull(),
  fecha: timestamp("fecha_hora_consulta", { withTimezone: true }),
  inicioReal: timestamp("inicio_real", { withTimezone: true }),
  finReal: timestamp("fin_real", { withTimezone: true }),
  transcripcion: text("transcripcion_completa"),
  versionTranscripcion: integer("version_transcripcion").default(1).notNull(),
  estadoAnamnesis: anamnesisPhaseStatusEnum("estado_anamnesis").default("no_iniciada").notNull(),
  segmentoInicioAnamnesis: integer("segmento_inicio_anamnesis"),
  segmentoFinAnamnesis: integer("segmento_fin_anamnesis"),
  confianzaCierreAnamnesis: numeric("confianza_cierre_anamnesis", { precision: 5, scale: 4 }),
  motivoCierreAnamnesis: text("motivo_cierre_anamnesis"),
  anamnesisDetectadaEn: timestamp("anamnesis_detectada_en", { withTimezone: true }),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
});

export const temporalAudios = pgTable("audios_temporales_consulta", {
  id: uuid("id").primaryKey().defaultRandom(),
  consultaId: uuid("consulta_id").notNull().references(() => consultations.id, { onDelete: "cascade" }),
  rutaArchivo: text("ruta_almacenamiento").notNull(),
  tipoMime: varchar("tipo_mime", { length: 100 }),
  duracionMs: integer("duracion_ms"),
  tamanoBytes: bigint("tamano_bytes", { mode: "number" }),
  hashArchivo: text("hash_archivo"),
  estado: temporalAudioStatusEnum("estado").default("pendiente_procesamiento").notNull(),
  motivoConservacion: text("motivo_conservacion"),
  expiraEn: timestamp("expira_en", { withTimezone: true }).notNull(),
  borradoEn: timestamp("borrado_en", { withTimezone: true }),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
});
