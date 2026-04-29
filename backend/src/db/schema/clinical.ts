import { pgTable, uuid, varchar, text, timestamp, integer, bigint } from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { consultationStatusEnum, temporalAudioStatusEnum } from "./enums.js";

export const patients = pgTable("pacientes", {
  id: uuid("id").primaryKey().defaultRandom(),
  doctorId: uuid("doctor_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  nombre: text("nombres_apellidos").notNull(),
  dni: varchar("dni", { length: 20 }).notNull(),
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
  codigoSesion: varchar("codigo_consulta", { length: 40 }).notNull(),
  estado: consultationStatusEnum("estado").default("en_espera").notNull(),
  fecha: timestamp("fecha_hora_consulta", { withTimezone: true }),
  inicioReal: timestamp("inicio_real", { withTimezone: true }),
  finReal: timestamp("fin_real", { withTimezone: true }),
  transcripcion: text("transcripcion_completa"),
  versionTranscripcion: integer("version_transcripcion").default(1).notNull(),
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
