import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { pdqi9Evaluations, Pdqi9Scores } from "../../db/schema/evaluations.js";
import { consultations } from "../../db/schema/clinical.js";
import { medicalRecords } from "../../db/schema/scribe.js";
import { SavePdqi9EvaluationInput } from "./evaluations.schema.js";
import { logger } from "../../core/utils/logger.js";

const averageScore = (scores: Pdqi9Scores) => {
  const values = Object.values(scores);
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 100) / 100;
};

const toNumber = (value: string | number | null) => (value === null ? null : Number(value));

export class EvaluationsService {
  async listAvailableConsultations() {
    const rows = await db
      .select({
        consultaId: consultations.id,
        codigoConsulta: consultations.codigoSesion,
        fecha: consultations.fecha,
        createdAt: consultations.createdAt,
        notaIa: medicalRecords.resumenSugeridoIa,
      })
      .from(consultations)
      .innerJoin(medicalRecords, eq(medicalRecords.consultaId, consultations.id))
      .where(
        sql`nullif(${medicalRecords.resumenSugeridoIa}, '') is not null`
      )
      .orderBy(desc(consultations.createdAt));

    return rows.map((row) => ({
      consultaId: row.consultaId,
      codigoConsulta: row.codigoConsulta,
      fecha: row.fecha || row.createdAt,
      notaIaCaracteres: (row.notaIa || "").length,
    }));
  }

  async getContext(consultaId: string, evaluadorId: string) {
    const [row] = await db
      .select({
        consultaId: consultations.id,
        codigoConsulta: consultations.codigoSesion,
        fecha: consultations.fecha,
        createdAt: consultations.createdAt,
        resumenSugeridoIa: medicalRecords.resumenSugeridoIa,
      })
      .from(consultations)
      .innerJoin(medicalRecords, eq(medicalRecords.consultaId, consultations.id))
      .where(eq(consultations.id, consultaId))
      .limit(1);

    if (!row) return null;
    const notaIa = (row.resumenSugeridoIa || "").trim();
    if (!notaIa) return null;

    const evaluation = await db.query.pdqi9Evaluations.findFirst({
      where: and(eq(pdqi9Evaluations.consultaId, consultaId), eq(pdqi9Evaluations.evaluadorId, evaluadorId)),
    });

    logger.info("[evaluations] context:loaded", {
      consultaId,
      evaluadorId,
      aiNoteChars: notaIa.length,
      hasEvaluation: Boolean(evaluation),
    });

    return {
      consultaId: row.consultaId,
      codigoConsulta: row.codigoConsulta,
      fecha: row.fecha || row.createdAt,
      notaIa,
      evaluacion: evaluation
        ? {
            id: evaluation.id,
            notaEssi: evaluation.notaEssi,
            puntajesIa: evaluation.puntajesIa,
            puntajesEssi: evaluation.puntajesEssi,
            promedioIa: toNumber(evaluation.promedioIa),
            promedioEssi: toNumber(evaluation.promedioEssi),
            diferenciaPromedio: toNumber(evaluation.diferenciaPromedio),
            comentarios: evaluation.comentarios,
            updatedAt: evaluation.updatedAt,
          }
        : null,
    };
  }

  async save(consultaId: string, evaluadorId: string, input: SavePdqi9EvaluationInput) {
    const context = await this.getContext(consultaId, evaluadorId);
    if (!context) throw new Error("No existe una ficha con resumen disponible para evaluar");

    const promedioIa = averageScore(input.puntajesIa as Pdqi9Scores);
    const promedioEssi = averageScore(input.puntajesEssi as Pdqi9Scores);
    const diferenciaPromedio = Math.round((promedioIa - promedioEssi) * 100) / 100;
    const payload = {
      notaIa: context.notaIa,
      notaEssi: input.notaEssi,
      puntajesIa: input.puntajesIa as Pdqi9Scores,
      puntajesEssi: input.puntajesEssi as Pdqi9Scores,
      promedioIa: String(promedioIa),
      promedioEssi: String(promedioEssi),
      diferenciaPromedio: String(diferenciaPromedio),
      comentarios: input.comentarios || null,
      updatedAt: new Date(),
    };

    const existing = await db.query.pdqi9Evaluations.findFirst({
      where: and(eq(pdqi9Evaluations.consultaId, consultaId), eq(pdqi9Evaluations.evaluadorId, evaluadorId)),
    });
    const [evaluation] = existing
      ? await db.update(pdqi9Evaluations).set(payload).where(eq(pdqi9Evaluations.id, existing.id)).returning()
      : await db
          .insert(pdqi9Evaluations)
          .values({ consultaId, evaluadorId, ...payload })
          .returning();

    logger.info("[evaluations] saved", {
      evaluationId: evaluation.id,
      consultaId,
      evaluadorId,
      essiNoteChars: input.notaEssi.length,
      promedioIa,
      promedioEssi,
      diferenciaPromedio,
    });

    return {
      id: evaluation.id,
      promedioIa,
      promedioEssi,
      diferenciaPromedio,
      updatedAt: evaluation.updatedAt,
    };
  }
}

export const evaluationsService = new EvaluationsService();
