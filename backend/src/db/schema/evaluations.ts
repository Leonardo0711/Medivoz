import { jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
    notaIa: text("nota_ia").notNull(),
    notaEssi: text("nota_essi").notNull(),
    puntajesIa: jsonb("puntajes_ia").$type<Pdqi9Scores>().notNull(),
    puntajesEssi: jsonb("puntajes_essi").$type<Pdqi9Scores>().notNull(),
    promedioIa: numeric("promedio_ia", { precision: 4, scale: 2 }).notNull(),
    promedioEssi: numeric("promedio_essi", { precision: 4, scale: 2 }).notNull(),
    diferenciaPromedio: numeric("diferencia_promedio", { precision: 4, scale: 2 }).notNull(),
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
