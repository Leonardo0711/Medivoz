import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { pdqi9Evaluations, Pdqi9Scores } from "../../db/schema/evaluations.js";
import { consultations } from "../../db/schema/clinical.js";
import { medicalRecordEditSessions, medicalRecordSections, medicalRecords } from "../../db/schema/scribe.js";
import { SavePdqi9EvaluationInput } from "./evaluations.schema.js";
import { logger } from "../../core/utils/logger.js";

const averageScore = (scores: Pdqi9Scores) => {
  const values = Object.values(scores);
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 100) / 100;
};

const toNumber = (value: string | number | null) => (value === null ? null : Number(value));

export class EvaluationsService {
  async listAvailableConsultations(evaluadorId: string) {
    const rows = await db
      .select({
        consultaId: consultations.id,
        fichaId: medicalRecords.id,
        codigoConsulta: consultations.codigoSesion,
        fecha: consultations.fecha,
        createdAt: consultations.createdAt,
        notaMedivozAsistida: medicalRecords.resumenActual,
        notaEssi: medicalRecords.notaEssi,
        seccionesTotales: sql<number>`(
          select count(*)
          from ${medicalRecordSections}
          where ${medicalRecordSections.fichaId} = ${medicalRecords.id}
        )`,
        seccionesRevisadas: sql<number>`(
          select count(*)
          from ${medicalRecordSections}
          where ${medicalRecordSections.fichaId} = ${medicalRecords.id}
            and ${medicalRecordSections.estado} in ('revisada', 'bloqueada')
        )`,
        seccionesPendientesIa: sql<number>`(
          select count(*)
          from ${medicalRecordSections}
          where ${medicalRecordSections.fichaId} = ${medicalRecords.id}
            and ${medicalRecordSections.estado} = 'borrador_ia'
        )`,
        evaluacionId: sql<string | null>`(
          select ${pdqi9Evaluations.id}
          from ${pdqi9Evaluations}
          where ${pdqi9Evaluations.consultaId} = ${consultations.id}
            and ${pdqi9Evaluations.evaluadorId} = ${evaluadorId}
          limit 1
        )`,
      })
      .from(consultations)
      .innerJoin(medicalRecords, eq(medicalRecords.consultaId, consultations.id))
      .orderBy(desc(consultations.createdAt));

    return rows.map((row) => {
      const notaMedivozCaracteres = (row.notaMedivozAsistida || "").trim().length;
      const notaEssiCaracteres = (row.notaEssi || "").trim().length;
      const seccionesPendientesIa = Number(row.seccionesPendientesIa || 0);
      const motivosPendientes: string[] = [];

      if (seccionesPendientesIa > 0) {
        motivosPendientes.push(
          `${seccionesPendientesIa} ${seccionesPendientesIa === 1 ? "sección" : "secciones"} con IA sin validar`
        );
      }
      if (!notaMedivozCaracteres) motivosPendientes.push("Falta confirmar el resumen Medivoz");
      if (!notaEssiCaracteres) motivosPendientes.push("Falta pegar la nota ESSI");

      const estaLista = motivosPendientes.length === 0;
      return {
        consultaId: row.consultaId,
        codigoConsulta: row.codigoConsulta,
        fecha: row.fecha || row.createdAt,
        notaMedivozCaracteres,
        notaEssiCaracteres,
        seccionesTotales: Number(row.seccionesTotales || 0),
        seccionesRevisadas: Number(row.seccionesRevisadas || 0),
        seccionesPendientesIa,
        motivosPendientes,
        estado: estaLista ? (row.evaluacionId ? "evaluada" : "lista") : "pendiente_validacion",
      };
    });
  }

  async getContext(consultaId: string, evaluadorId: string) {
    const [row] = await db
      .select({
        consultaId: consultations.id,
        fichaId: medicalRecords.id,
        codigoConsulta: consultations.codigoSesion,
        fecha: consultations.fecha,
        createdAt: consultations.createdAt,
        resumenActual: medicalRecords.resumenActual,
        notaEssi: medicalRecords.notaEssi,
      })
      .from(consultations)
      .innerJoin(medicalRecords, eq(medicalRecords.consultaId, consultations.id))
      .where(eq(consultations.id, consultaId))
      .limit(1);

    if (!row) return null;
    const notaMedivozAsistida = (row.resumenActual || "").trim();
    const notaEssi = (row.notaEssi || "").trim();
    if (!notaMedivozAsistida || !notaEssi) return null;

    const [{ seccionesPendientesIa }] = await db
      .select({
        seccionesPendientesIa: sql<number>`count(*)`,
      })
      .from(medicalRecordSections)
      .where(
        and(
          eq(medicalRecordSections.fichaId, row.fichaId),
          eq(medicalRecordSections.estado, "borrador_ia")
        )
      );
    if (Number(seccionesPendientesIa || 0) > 0) return null;

    const [editMetrics] = await db
      .select({ duracionMedivozMs: sql<number>`coalesce(sum(${medicalRecordEditSessions.duracionActivaMs}), 0)` })
      .from(medicalRecordEditSessions)
      .where(eq(medicalRecordEditSessions.fichaId, row.fichaId));

    const evaluation = await db.query.pdqi9Evaluations.findFirst({
      where: and(eq(pdqi9Evaluations.consultaId, consultaId), eq(pdqi9Evaluations.evaluadorId, evaluadorId)),
    });

    logger.info("[evaluations] context:loaded", {
      consultaId,
      evaluadorId,
      medivozNoteChars: notaMedivozAsistida.length,
      duracionMedivozMs: editMetrics?.duracionMedivozMs || 0,
      hasEvaluation: Boolean(evaluation),
    });

    return {
      consultaId: row.consultaId,
      codigoConsulta: row.codigoConsulta,
      fecha: row.fecha || row.createdAt,
      notaMedivozAsistida,
      notaEssi,
      duracionMedivozMs: Number(editMetrics?.duracionMedivozMs || 0),
      evaluacion: evaluation
        ? {
            id: evaluation.id,
            notaEssi: evaluation.notaEssi,
            puntajesMedivoz: evaluation.puntajesMedivoz,
            puntajesEssi: evaluation.puntajesEssi,
            promedioMedivoz: toNumber(evaluation.promedioMedivoz),
            promedioEssi: toNumber(evaluation.promedioEssi),
            diferenciaPromedio: toNumber(evaluation.diferenciaPromedio),
            duracionMedivozMs: evaluation.duracionMedivozMs,
            duracionEssiMs: evaluation.duracionEssiMs,
            diferenciaTiempoMs: evaluation.diferenciaTiempoMs,
            comentarios: evaluation.comentarios,
            updatedAt: evaluation.updatedAt,
          }
        : null,
    };
  }

  async save(consultaId: string, evaluadorId: string, input: SavePdqi9EvaluationInput) {
    const context = await this.getContext(consultaId, evaluadorId);
    if (!context) throw new Error("No existe una ficha validada y completa disponible para evaluar");

    const promedioMedivoz = averageScore(input.puntajesMedivoz as Pdqi9Scores);
    const promedioEssi = averageScore(input.puntajesEssi as Pdqi9Scores);
    const diferenciaPromedio = Math.round((promedioMedivoz - promedioEssi) * 100) / 100;
    const duracionMedivozMs = context.duracionMedivozMs;
    const diferenciaTiempoMs = duracionMedivozMs - input.duracionEssiMs;
    const payload = {
      notaMedivozAsistida: context.notaMedivozAsistida,
      notaEssi: context.notaEssi,
      puntajesMedivoz: input.puntajesMedivoz as Pdqi9Scores,
      puntajesEssi: input.puntajesEssi as Pdqi9Scores,
      promedioMedivoz: String(promedioMedivoz),
      promedioEssi: String(promedioEssi),
      diferenciaPromedio: String(diferenciaPromedio),
      duracionMedivozMs,
      duracionEssiMs: input.duracionEssiMs,
      diferenciaTiempoMs,
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
      essiNoteChars: context.notaEssi.length,
      promedioMedivoz,
      promedioEssi,
      diferenciaPromedio,
      duracionMedivozMs,
      duracionEssiMs: input.duracionEssiMs,
    });

    return {
      id: evaluation.id,
      promedioMedivoz,
      promedioEssi,
      diferenciaPromedio,
      updatedAt: evaluation.updatedAt,
    };
  }
}

export const evaluationsService = new EvaluationsService();
