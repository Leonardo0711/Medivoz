import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { roleEnum, accountStatusEnum } from "./enums.js";

export const specialities = pgTable("catalogo_especialidades", {
  id: integer("id").primaryKey(),
  nombre: varchar("nombre_especialidad", { length: 120 }).notNull().unique(),
  activa: boolean("activa").default(true).notNull(),
  esAdministrativa: boolean("es_administrativa").default(false).notNull(),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("usuarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("correo_electronico", { length: 255 }).notNull().unique(),
  passwordHash: text("hash_contrasena").notNull(),
  estado: accountStatusEnum("estado_cuenta").default("activa").notNull(),
  ultimoLogin: timestamp("ultimo_acceso_en", { withTimezone: true }),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
});

export const profiles = pgTable("perfiles_usuario", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("usuario_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  nombreCompleto: text("nombre_completo").notNull(),
  especialidadId: integer("especialidad_id")
    .notNull()
    .references(() => specialities.id),
  // The foreign key is defined in DB/10_fichas_por_especialidad.sql. Keeping
  // this mapping reference-free avoids a circular module dependency with clinical.ts.
  plantillaAnamnesisPredeterminadaId: uuid("plantilla_anamnesis_predeterminada_id"),
  urlAvatar: text("url_avatar"),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
});

export const userRoles = pgTable("roles_usuario", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("usuario_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  rol: roleEnum("rol").notNull(),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sesiones_usuario", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("usuario_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  refreshTokenHash: text("refresh_token_hash").notNull(),
  ip: varchar("ip_origen", { length: 45 }),
  userAgent: text("agente_usuario"),
  dispositivo: text("nombre_dispositivo"),
  expiraEn: timestamp("expira_en", { withTimezone: true }).notNull(),
  ultimaActividad: timestamp("ultimo_uso_en", { withTimezone: true }),
  revocadaEn: timestamp("revocada_en", { withTimezone: true }),
  createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
});

export const userAudit = pgTable(
  "auditoria_usuarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    targetUserId: uuid("usuario_objetivo_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("accion", { length: 40 }).notNull(),
    previousStatus: accountStatusEnum("estado_anterior"),
    newStatus: accountStatusEnum("estado_nuevo"),
    details: jsonb("detalles").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_auditoria_usuarios_actor").on(table.actorId),
    index("idx_auditoria_usuarios_objetivo").on(table.targetUserId),
    index("idx_auditoria_usuarios_creado_en").on(table.createdAt),
  ]
);
