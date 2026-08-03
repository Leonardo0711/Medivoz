import { bigint, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { consultations } from "./clinical.js";

export type Pdqi9Scores = Record<
  | "actualizada"
  | "exacta"
  | "exhaustiva"
  | "util"
  | "organizada"
  | "comprensible"
  | "concisa"
  | "sintetizada"
  | "consistente",
  number
>;

export const pdqi9Evaluations = pgTable(
  "evaluaciones_pdqi9",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    consultaId: uuid("consulta_id")
      .notNull()
      .references(() => consultations.id, { onDelete: "cascade" }),
    evaluadorId: uuid("evaluador_id").references(() => users.id, { onDelete: "set null" }),
    notaMedivozAsistida: text("nota_medivoz_asistida").notNull(),
    notaEssi: text("nota_essi").notNull(),
    puntajesMedivoz: jsonb("puntajes_medivoz").$type<Pdqi9Scores>().notNull(),
    puntajesEssi: jsonb("puntajes_essi").$type<Pdqi9Scores>().notNull(),
    promedioMedivoz: numeric("promedio_medivoz", { precision: 4, scale: 2 }).notNull(),
    promedioEssi: numeric("promedio_essi", { precision: 4, scale: 2 }).notNull(),
    diferenciaPromedio: numeric("diferencia_promedio", { precision: 4, scale: 2 }).notNull(),
    duracionMedivozMs: bigint("duracion_medivoz_ms", { mode: "number" }).notNull(),
    duracionEdicionMedivozMs: bigint("duracion_edicion_medivoz_ms", {
      mode: "number",
    }).notNull(),
    duracionValidacionMedivozMs: bigint("duracion_validacion_medivoz_ms", {
      mode: "number",
    }).notNull(),
    comentarios: text("comentarios"),
    createdAt: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueEvaluationByReviewer: uniqueIndex("uq_evaluaciones_pdqi9_consulta_evaluador").on(
      table.consultaId,
      table.evaluadorId
    ),
  })
);
