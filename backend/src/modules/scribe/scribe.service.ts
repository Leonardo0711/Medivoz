import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { anamnesisTemplateSections, consultations } from "../../db/schema/clinical.js";
import {
  medicalRecords,
  medicalRecordChanges,
  medicalRecordEditSessions,
  medicalRecordSectionEvidence,
  medicalRecordSections,
  medicalRecordVersions,
} from "../../db/schema/scribe.js";
import { logger } from "../../core/utils/logger.js";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbExecutor = typeof db | DbTransaction;

const normalizedEditDistance = (a?: string | null, b?: string | null) => {
  const left = (a || "").trim();
  const right = (b || "").trim();
  if (!left) return null;
  const maxLen = Math.max(left.length, right.length);
  if (maxLen === 0) return "0";

  const prev = Array.from({ length: right.length + 1 }, (_, i) => i);
  const curr = Array.from({ length: right.length + 1 }, () => 0);

  for (let i = 1; i <= left.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= right.length; j += 1) prev[j] = curr[j];
  }

  return (prev[right.length] / maxLen).toFixed(4);
};

const fallbackSummaryOrder = [
  "motivo_consulta",
  "tiempo_enfermedad",
  "forma_inicio",
  "curso_enfermedad",
  "sintomas_principales",
];

const supportingSummaryOrder = [
  "antecedentes",
  "estado_funcional_basal",
  "estudios_previos",
  "notas_adicionales",
];

const compactSummaryParts = (parts: Array<string | null | undefined>) =>
  parts
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

export class ScribeService {
  private async markRecordInReview(fichaId: string, executor: DbExecutor = db) {
    const now = new Date();
    const [updated] = await executor
      .update(medicalRecords)
      .set({
        estado: "en_revision",
        estaFinalizada: false,
        finalizadaEn: null,
        updatedAt: now,
      })
      .where(eq(medicalRecords.id, fichaId))
      .returning();

    return updated;
  }

  async getOrCreateRecord(
    consultaId: string,
    _data?: { pacienteId?: string | null; doctorId?: string | null },
    executor: DbExecutor = db
  ) {
    logger.info("[scribe] record:get-or-create:start", { consultaId });
    let [record] = await executor
      .select()
      .from(medicalRecords)
      .where(eq(medicalRecords.consultaId, consultaId))
      .limit(1);

    if (!record) {
      logger.info("[scribe] record:create:start", { consultaId });
      const consultation = await executor.query.consultations.findFirst({
        columns: { plantillaAnamnesisId: true },
        where: eq(consultations.id, consultaId),
      });

      [record] = await executor
        .insert(medicalRecords)
        .values({
          consultaId,
          plantillaAnamnesisId: consultation?.plantillaAnamnesisId ?? null,
          estado: "vacia",
        })
        .returning();
      logger.info("[scribe] record:create:done", {
        consultaId,
        fichaId: record.id,
        plantillaAnamnesisId: record.plantillaAnamnesisId,
      });
    } else {
      logger.info("[scribe] record:found", {
        consultaId,
        fichaId: record.id,
        estado: record.estado,
      });
    }

    return record;
  }

  async updateRecordSummary(
    fichaId: string,
    options: {
      resumenSugeridoIa?: string | null;
      resumenActual?: string | null;
      notaEssi?: string | null;
      origen?: "ia" | "doctor" | "manual" | "sistema";
    },
    executor: DbExecutor = db
  ) {
    const now = new Date();
    const values: Partial<typeof medicalRecords.$inferInsert> = {
      updatedAt: now,
    };

    if (options.resumenSugeridoIa !== undefined) {
      values.resumenSugeridoIa = options.resumenSugeridoIa;
    }
    if (options.resumenActual !== undefined) {
      values.resumenActual = options.resumenActual;
    }
    if (options.notaEssi !== undefined) {
      values.notaEssi = options.notaEssi;
    }

    const [updated] = await executor
      .update(medicalRecords)
      .set(values)
      .where(eq(medicalRecords.id, fichaId))
      .returning();

    logger.info("[scribe] record-summary:update", {
      fichaId,
      origin: options.origen || "sistema",
      hasSuggestedSummary: Boolean(updated?.resumenSugeridoIa?.trim()),
      hasCurrentSummary: Boolean(updated?.resumenActual?.trim()),
      hasEssiNote: Boolean(updated?.notaEssi?.trim()),
    });

    return updated;
  }

  async createRecordVersion(
    fichaId: string,
    options: {
      origen: "ia" | "doctor" | "manual" | "sistema";
      userId?: string | null;
      ejecucionAgenteId?: string | null;
      resumenCambios?: string | null;
    },
    executor: DbExecutor = db
  ): Promise<typeof medicalRecordVersions.$inferSelect | null> {
    if (executor === db) {
      return db.transaction((tx) => this.createRecordVersion(fichaId, options, tx));
    }

    await executor.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`medical-record-version:${fichaId}`}, 0))`
    );

    const [record] = await executor.select().from(medicalRecords).where(eq(medicalRecords.id, fichaId)).limit(1);
    if (!record) return null;

    const sections = await executor
      .select()
      .from(medicalRecordSections)
      .where(eq(medicalRecordSections.fichaId, fichaId));

    const [{ nextVersion }] = await executor
      .select({
        nextVersion: sql<number>`coalesce(max(${medicalRecordVersions.version}), 0) + 1`,
      })
      .from(medicalRecordVersions)
      .where(eq(medicalRecordVersions.fichaId, fichaId));

    const snapshot = {
      ficha: {
        id: record.id,
        consultaId: record.consultaId,
        estado: record.estado,
        resumenSugeridoIa: record.resumenSugeridoIa,
        resumenActual: record.resumenActual,
        notaEssi: record.notaEssi,
        estaFinalizada: record.estaFinalizada,
      },
      secciones: sections.map((section) => ({
        id: section.id,
        nombre: section.nombre,
        textoSugeridoIa: section.textoSugeridoIa,
        textoActual: section.textoActual,
        resumenSugeridoIa: section.resumenSugeridoIa,
        resumenActual: section.resumenActual,
        estado: section.estado,
        confianza: section.confianza,
        origenDato: section.origenDato,
        origenActualizacion: section.origenActualizacion,
        revisadaEn: section.revisadaEn,
      })),
    };

    const [version] = await executor
      .insert(medicalRecordVersions)
      .values({
        fichaId,
        version: Number(nextVersion || 1),
        origen: options.origen,
        ejecucionAgenteId: options.ejecucionAgenteId ?? null,
        creadoPor: options.userId ?? null,
        contenidoSnapshot: snapshot,
        resumenCambios: options.resumenCambios ?? null,
      })
      .returning();

    logger.info("[scribe] record-version:created", {
      fichaId,
      version: version.version,
      origin: options.origen,
      sectionCount: sections.length,
      summaryChars: options.resumenCambios?.length || 0,
    });

    return version;
  }

  async saveRecord(input: {
    consultaId: string;
    pacienteId?: string | null;
    doctorId: string;
    secciones: Array<{
      nombre: typeof medicalRecordSections.$inferInsert.nombre;
      contenido: string;
      textoSugeridoIa?: string | null;
      resumenSugeridoIa?: string | null;
      resumenActual?: string | null;
      duracionEdicionMs?: number | null;
      confianza?: string | null;
      origenDato?: string | null;
    }>;
    resumenSugeridoIa?: string | null;
    resumenActual?: string | null;
    notaEssi?: string | null;
    sesionEdicionId?: string | null;
    duracionEdicionTotalMs?: number | null;
  }) {
    return db.transaction(async (tx) => {
      const record = await this.getOrCreateRecord(
        input.consultaId,
        { pacienteId: input.pacienteId, doctorId: input.doctorId },
        tx
      );
      const results = [];

      for (const section of input.secciones) {
        results.push(
          await this.updateSection(
            record.id,
            section.nombre,
            section.contenido,
            "doctor",
            input.doctorId,
            {
              textoSugeridoIa: section.textoSugeridoIa ?? null,
              resumenSugeridoIa: section.resumenSugeridoIa ?? null,
              resumenActual: section.resumenActual ?? null,
              duracionEdicionMs: section.duracionEdicionMs ?? null,
              sesionEdicionId: input.sesionEdicionId ?? null,
              confianza: section.confianza ?? null,
              origenDato: section.origenDato ?? null,
            },
            tx
          )
        );
      }

      if (
        input.resumenSugeridoIa !== undefined ||
        input.resumenActual !== undefined ||
        input.notaEssi !== undefined
      ) {
        await this.updateRecordSummary(
          record.id,
          {
            resumenSugeridoIa: input.resumenSugeridoIa ?? undefined,
            resumenActual: input.resumenActual ?? undefined,
            notaEssi: input.notaEssi,
            origen: "doctor",
          },
          tx
        );
      }

      const now = new Date();
      const [finalizedRecord] = await tx
        .update(medicalRecords)
        .set({
          estado: "finalizada",
          estaFinalizada: true,
          finalizadaEn: now,
          updatedAt: now,
        })
        .where(eq(medicalRecords.id, record.id))
        .returning();

      await this.createRecordVersion(
        record.id,
        {
          origen: "doctor",
          userId: input.doctorId,
          resumenCambios: `Doctor guardo ficha con ${results.length} seccion(es)`,
        },
        tx
      );

      if (input.sesionEdicionId) {
        await tx
          .update(medicalRecordEditSessions)
          .set({
            estado: "completada",
            duracionActivaMs: input.duracionEdicionTotalMs ?? 0,
            ultimaActividadEn: now,
            finalizadoEn: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(medicalRecordEditSessions.id, input.sesionEdicionId),
              eq(medicalRecordEditSessions.fichaId, record.id),
              eq(medicalRecordEditSessions.doctorId, input.doctorId)
            )
          );
      }

      logger.info("[scribe] record:save:committed", {
        consultaId: input.consultaId,
        fichaId: record.id,
        updatedSections: results.length,
        finalized: true,
      });
      return { record: finalizedRecord || record, results };
    });
  }

  async refreshSuggestedRecordSummary(fichaId: string) {
    const sections = await db
      .select({
        nombre: medicalRecordSections.nombre,
        resumenSugeridoIa: medicalRecordSections.resumenSugeridoIa,
        resumenActual: medicalRecordSections.resumenActual,
        textoSugeridoIa: medicalRecordSections.textoSugeridoIa,
      })
      .from(medicalRecordSections)
      .where(eq(medicalRecordSections.fichaId, fichaId));

    const byName = new Map(sections.map((section) => [String(section.nombre), section]));
    const sectionSummary = (name: string) => {
      const section = byName.get(name);
      return section?.resumenSugeridoIa || section?.resumenActual || section?.textoSugeridoIa;
    };
    const chronologicalHistory = sectionSummary("historia_cronologica");
    const summary = compactSummaryParts(
      chronologicalHistory
        ? [chronologicalHistory, ...supportingSummaryOrder.map(sectionSummary)]
        : [...fallbackSummaryOrder, ...supportingSummaryOrder].map(sectionSummary)
    );

    if (!summary) return null;
    return this.updateRecordSummary(fichaId, {
      resumenSugeridoIa: summary,
      origen: "ia",
    });
  }

  async getRecordByConsultationForDoctor(consultaId: string, doctorId: string) {
    const consultation = await db.query.consultations.findFirst({
      where: and(eq(consultations.id, consultaId), eq(consultations.doctorId, doctorId)),
    });

    if (!consultation) {
      logger.warn("[scribe] record:get:not-authorized", { consultaId, doctorId });
      return null;
    }
    return this.getRecordContent(consultaId);
  }

  async updateSection(
    fichaId: string,
    nombre: any,
    contenido: string,
    origen: any = "doctor",
    userId?: string,
    options?: {
      textoSugeridoIa?: string | null;
      resumenSugeridoIa?: string | null;
      resumenActual?: string | null;
      duracionEdicionMs?: number | null;
      sesionEdicionId?: string | null;
      confianza?: string | null;
      origenDato?: string | null;
    },
    executor: DbExecutor = db
  ) {
    const [existing] = await executor
      .select()
      .from(medicalRecordSections)
      .where(
        and(
          eq(medicalRecordSections.fichaId, fichaId),
          eq(medicalRecordSections.nombre, nombre)
        )
      )
      .limit(1);

    const textoSugeridoIa = options?.textoSugeridoIa ?? existing?.textoSugeridoIa ?? null;
    const resumenSugeridoIa = options?.resumenSugeridoIa ?? existing?.resumenSugeridoIa ?? null;
    const resumenActual = options?.resumenActual ?? existing?.resumenActual ?? null;
    const origenDato = options?.origenDato ?? existing?.origenDato ?? null;
    const distanciaEdicion =
      origen === "doctor" || origen === "manual"
        ? normalizedEditDistance(textoSugeridoIa, contenido)
        : null;
    const now = new Date();
    logger.info("[scribe] section:update:start", {
      fichaId,
      section: nombre,
      exists: Boolean(existing),
      origen,
      hasContent: Boolean(contenido?.trim()),
      hasSummary: Boolean(resumenActual?.trim()),
      hasIaSuggestion: Boolean(textoSugeridoIa?.trim()),
      duracionEdicionMs: options?.duracionEdicionMs ?? null,
    });

    if (existing) {
      const [updated] = await executor
        .update(medicalRecordSections)
        .set({
          textoActual: contenido,
          textoSugeridoIa,
          resumenSugeridoIa,
          resumenActual,
          updatedAt: now,
          origenActualizacion: origen,
          usuarioId: userId,
          revisadaPor: userId,
          revisadaEn: now,
          estado: "revisada",
          confianza: options?.confianza ?? existing.confianza,
          origenDato,
        })
        .where(eq(medicalRecordSections.id, existing.id))
        .returning();

      await executor.insert(medicalRecordChanges).values({
        seccionId: existing.id,
        origen,
        autorId: userId,
        contenidoAnterior: existing.textoActual,
        contenidoNuevo: contenido,
        textoSugeridoIa,
        resumenAnterior: existing.resumenActual,
        resumenNuevo: resumenActual,
        resumenSugeridoIa,
        origenDato,
        distanciaEdicion,
        duracionEdicionMs: options?.duracionEdicionMs ?? null,
        sesionEdicionId: options?.sesionEdicionId ?? null,
        confianza: options?.confianza ?? existing.confianza,
      });

      logger.info("[scribe] section:update:done", {
        fichaId,
        sectionId: updated.id,
        section: nombre,
        estado: updated.estado,
        distanciaEdicion,
        confidence: options?.confianza ?? existing.confianza,
      });
      return [updated];
    }

    const [created] = await executor
      .insert(medicalRecordSections)
      .values({
        fichaId,
        nombre,
        textoSugeridoIa,
        textoActual: contenido,
        resumenSugeridoIa,
        resumenActual,
        origenActualizacion: origen,
        usuarioId: userId,
        revisadaPor: userId,
        revisadaEn: now,
        estado: "revisada",
        confianza: options?.confianza ?? null,
        origenDato,
      })
      .returning();

    await executor.insert(medicalRecordChanges).values({
      seccionId: created.id,
      origen,
      autorId: userId,
      contenidoAnterior: null,
      contenidoNuevo: contenido,
      textoSugeridoIa,
      resumenAnterior: null,
      resumenNuevo: resumenActual,
      resumenSugeridoIa,
      origenDato,
      distanciaEdicion,
      duracionEdicionMs: options?.duracionEdicionMs ?? null,
      sesionEdicionId: options?.sesionEdicionId ?? null,
      confianza: options?.confianza ?? null,
    });

    logger.info("[scribe] section:create:done", {
      fichaId,
      sectionId: created.id,
      section: nombre,
      estado: created.estado,
      distanciaEdicion,
    });
    return [created];
  }

  async suggestSectionFromIa(
    fichaId: string,
    nombre: any,
    sugerencia: string,
    options?: {
      ejecucionAgenteId?: string | null;
      ultimaEjecucionAgenteId?: string | null;
      confianza?: string | null;
      resumenSugeridoIa?: string | null;
      origenDato?: string | null;
      evidencias?: Array<{ segmentoTranscripcionId?: string | null; textoEvidencia: string; confianza?: string | null }>;
    }
  ) {
    return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(medicalRecordSections)
      .where(
        and(
          eq(medicalRecordSections.fichaId, fichaId),
          eq(medicalRecordSections.nombre, nombre)
        )
      )
      .limit(1);

    if (existing?.estado === "bloqueada" || existing?.estado === "revisada") {
      logger.info("[scribe] ia-suggestion:skip-locked-or-reviewed", {
        fichaId,
        section: nombre,
        sectionId: existing.id,
        estado: existing.estado,
      });
      return existing;
    }

    const values = {
      fichaId,
      nombre,
      textoSugeridoIa: sugerencia,
      resumenSugeridoIa: options?.resumenSugeridoIa ?? existing?.resumenSugeridoIa ?? null,
      origenDato: options?.origenDato ?? existing?.origenDato ?? null,
      estado: "borrador_ia" as const,
      origenActualizacion: "ia" as const,
      ultimaEjecucionAgenteId: options?.ejecucionAgenteId ?? options?.ultimaEjecucionAgenteId ?? null,
      confianza: options?.confianza ?? existing?.confianza ?? null,
      updatedAt: new Date(),
    };

    const [section] = existing
      ? await tx
          .update(medicalRecordSections)
          .set(values)
          .where(eq(medicalRecordSections.id, existing.id))
          .returning()
      : await tx.insert(medicalRecordSections).values(values).returning();

    await tx
      .update(medicalRecords)
      .set({
        estado: "borrador_ia",
        estaFinalizada: false,
        finalizadaEn: null,
        updatedAt: new Date(),
      })
      .where(eq(medicalRecords.id, fichaId));

    logger.info("[scribe] ia-suggestion:stored", {
      fichaId,
      sectionId: section.id,
      section: nombre,
      created: !existing,
      confidence: options?.confianza ?? existing?.confianza ?? null,
      hasSummary: Boolean(options?.resumenSugeridoIa?.trim()),
      executionId: options?.ejecucionAgenteId ?? options?.ultimaEjecucionAgenteId ?? null,
    });

    if (options?.evidencias?.length) {
      const evidenceRows = options.evidencias
        .filter((item) => item.textoEvidencia?.trim())
        .map((item) => ({
          seccionId: section.id,
          segmentoTranscripcionId: item.segmentoTranscripcionId ?? null,
          textoEvidencia: item.textoEvidencia.trim(),
          confianza: item.confianza ?? null,
          origenDato: options.origenDato ?? null,
        }));
      if (evidenceRows.length) {
        await tx.insert(medicalRecordSectionEvidence).values(evidenceRows);
        logger.info("[scribe] evidence:stored", {
          sectionId: section.id,
          section: nombre,
          count: evidenceRows.length,
        });
      }
    }

    return section;
    });
  }

  async startEditSession(consultaId: string, doctorId: string) {
    const consultation = await db.query.consultations.findFirst({
      where: and(eq(consultations.id, consultaId), eq(consultations.doctorId, doctorId)),
    });
    if (!consultation) return null;

    const record = await this.getOrCreateRecord(consultaId, { doctorId });
    await this.markRecordInReview(record.id);
    const [active] = await db
      .select()
      .from(medicalRecordEditSessions)
      .where(
        and(
          eq(medicalRecordEditSessions.fichaId, record.id),
          eq(medicalRecordEditSessions.doctorId, doctorId),
          eq(medicalRecordEditSessions.estado, "activa")
        )
      )
      .limit(1);

    if (active) return active;

    const [created] = await db
      .insert(medicalRecordEditSessions)
      .values({ fichaId: record.id, doctorId, estado: "activa" })
      .returning();
    logger.info("[scribe] edit-session:started", {
      consultaId,
      fichaId: record.id,
      editSessionId: created.id,
      doctorId,
    });
    return created;
  }

  async syncEditSession(
    consultaId: string,
    doctorId: string,
    editSessionId: string,
    input: { duracionActivaMs: number; estado?: "activa" | "pausada" | "completada" }
  ) {
    const consultation = await db.query.consultations.findFirst({
      where: and(eq(consultations.id, consultaId), eq(consultations.doctorId, doctorId)),
    });
    if (!consultation) return null;

    const record = await this.getOrCreateRecord(consultaId, { doctorId });
    const [existing] = await db
      .select()
      .from(medicalRecordEditSessions)
      .where(
        and(
          eq(medicalRecordEditSessions.id, editSessionId),
          eq(medicalRecordEditSessions.fichaId, record.id),
          eq(medicalRecordEditSessions.doctorId, doctorId)
        )
      )
      .limit(1);
    if (!existing) return null;

    const now = new Date();
    const nextState = input.estado ?? existing.estado;
    const [updated] = await db
      .update(medicalRecordEditSessions)
      .set({
        estado: nextState,
        duracionActivaMs: Math.max(existing.duracionActivaMs, input.duracionActivaMs),
        ultimaActividadEn: now,
        finalizadoEn: nextState === "completada" ? now : existing.finalizadoEn,
        updatedAt: now,
      })
      .where(eq(medicalRecordEditSessions.id, existing.id))
      .returning();

    logger.info("[scribe] edit-session:synced", {
      consultaId,
      editSessionId,
      state: updated.estado,
      activeDurationMs: updated.duracionActivaMs,
    });
    return updated;
  }

  async getEditMetrics(consultaId: string, doctorId: string) {
    const consultation = await db.query.consultations.findFirst({
      where: and(eq(consultations.id, consultaId), eq(consultations.doctorId, doctorId)),
    });
    if (!consultation) return null;

    const record = await this.getOrCreateRecord(consultaId, { doctorId });
    const sessions = await db
      .select()
      .from(medicalRecordEditSessions)
      .where(eq(medicalRecordEditSessions.fichaId, record.id));
    const changes = await db
      .select({
        section: medicalRecordSections.nombre,
        editSessionId: medicalRecordChanges.sesionEdicionId,
        editDistance: medicalRecordChanges.distanciaEdicion,
        editDurationMs: medicalRecordChanges.duracionEdicionMs,
        createdAt: medicalRecordChanges.createdAt,
      })
      .from(medicalRecordChanges)
      .innerJoin(medicalRecordSections, eq(medicalRecordChanges.seccionId, medicalRecordSections.id))
      .where(eq(medicalRecordSections.fichaId, record.id));

    const measuredChanges = changes.filter((change) => change.editDistance !== null);
    const totalChangePercentage = measuredChanges.reduce(
      (sum, change) => sum + Number(change.editDistance) * 100,
      0
    );

    return {
      fichaId: record.id,
      totalActiveEditTimeMs: sessions.reduce((sum, session) => sum + session.duracionActivaMs, 0),
      editSessionCount: sessions.length,
      measuredChangeCount: measuredChanges.length,
      averageChangePercentage: measuredChanges.length
        ? Number((totalChangePercentage / measuredChanges.length).toFixed(2))
        : null,
      sessions,
      changes: changes.map((change) => ({
        ...change,
        changePercentage: change.editDistance === null
          ? null
          : Number((Number(change.editDistance) * 100).toFixed(2)),
      })),
    };
  }

  async reviewSection(
    consultaId: string,
    doctorId: string,
    nombre: any,
    action: "accept" | "reject" | "block",
    options?: {
      contenido?: string | null;
      resumenActual?: string | null;
      duracionEdicionMs?: number | null;
      sesionEdicionId?: string | null;
    }
  ) {
    const consultation = await db.query.consultations.findFirst({
      where: and(eq(consultations.id, consultaId), eq(consultations.doctorId, doctorId)),
    });
    if (!consultation) {
      logger.warn("[scribe] section:review:not-authorized", { consultaId, doctorId, section: nombre, action });
      return null;
    }

    const record = await this.getOrCreateRecord(consultaId);
    logger.info("[scribe] section:review:start", {
      consultaId,
      fichaId: record.id,
      section: nombre,
      action,
      hasContentPayload: Boolean(options?.contenido?.trim()),
      hasSummaryPayload: Boolean(options?.resumenActual?.trim()),
    });
    const [section] = await db
      .select()
      .from(medicalRecordSections)
      .where(and(eq(medicalRecordSections.fichaId, record.id), eq(medicalRecordSections.nombre, nombre)))
      .limit(1);
    if (!section) {
      if (action === "accept" && !options?.contenido?.trim() && !options?.resumenActual?.trim()) {
        logger.warn("[scribe] section:review:empty-rejected", {
          consultaId,
          fichaId: record.id,
          section: nombre,
          action,
        });
        return null;
      }
      if (action !== "accept" && action !== "block") return null;
      const created = await db.transaction(async (tx) => {
        const [createdSection] = await this.updateSection(
          record.id,
          nombre,
          options?.contenido || "",
          "doctor",
          doctorId,
          {
            resumenActual: options?.resumenActual || null,
            duracionEdicionMs: options?.duracionEdicionMs ?? null,
            sesionEdicionId: options?.sesionEdicionId ?? null,
          },
          tx
        );
        await this.markRecordInReview(record.id, tx);
        await this.createRecordVersion(
          record.id,
          {
            origen: "doctor",
            userId: doctorId,
            resumenCambios: `Doctor creo y valido seccion ${String(nombre)}`,
          },
          tx
        );
        return createdSection;
      });
      logger.info("[scribe] section:review:create-missing", {
        consultaId,
        fichaId: record.id,
        section: nombre,
        action,
        created: Boolean(created),
      });
      return created || null;
    }

    const now = new Date();
    if (action === "accept") {
      const acceptedText = options?.contenido || section.textoSugeridoIa || section.textoActual || "";
      const acceptedSummary = options?.resumenActual || section.resumenSugeridoIa || section.resumenActual || "";
      if (!acceptedText.trim() && !acceptedSummary.trim()) {
        logger.warn("[scribe] section:review:empty-existing-rejected", {
          consultaId,
          fichaId: record.id,
          sectionId: section.id,
          section: nombre,
        });
        return null;
      }
      const updated = await db.transaction(async (tx) => {
        const [updatedSection] = await tx
          .update(medicalRecordSections)
          .set({
            textoActual: acceptedText,
            textoSugeridoIa: null,
            resumenActual: acceptedSummary,
            resumenSugeridoIa: null,
            estado: "revisada",
            origenDato: section.origenDato,
            revisadaPor: doctorId,
            revisadaEn: now,
            origenActualizacion: "doctor",
            usuarioId: doctorId,
            updatedAt: now,
          })
          .where(eq(medicalRecordSections.id, section.id))
          .returning();

        await tx.insert(medicalRecordChanges).values({
          seccionId: section.id,
          origen: "doctor",
          autorId: doctorId,
          contenidoAnterior: section.textoActual,
          contenidoNuevo: acceptedText,
          textoSugeridoIa: section.textoSugeridoIa,
          resumenAnterior: section.resumenActual,
          resumenNuevo: acceptedSummary,
          resumenSugeridoIa: section.resumenSugeridoIa,
          origenDato: section.origenDato,
          distanciaEdicion: normalizedEditDistance(section.textoSugeridoIa, acceptedText),
          duracionEdicionMs: options?.duracionEdicionMs ?? null,
          sesionEdicionId: options?.sesionEdicionId ?? null,
          confianza: section.confianza,
        });
        await this.markRecordInReview(record.id, tx);
        await this.createRecordVersion(
          record.id,
          {
            origen: "doctor",
            userId: doctorId,
            resumenCambios: `Doctor valido seccion ${String(nombre)}`,
          },
          tx
        );
        return updatedSection;
      });
      logger.info("[scribe] section:review:accepted", {
        consultaId,
        fichaId: record.id,
        sectionId: updated.id,
        section: nombre,
          hasSummary: Boolean(acceptedSummary.trim()),
          usedPayloadContent: Boolean(options?.contenido?.trim()),
      });
      return updated;
    }

    if (action === "reject") {
      const updated = await db.transaction(async (tx) => {
        const [updatedSection] = await tx
          .update(medicalRecordSections)
          .set({
            textoSugeridoIa: null,
            resumenSugeridoIa: null,
            estado: section.textoActual ? "revisada" : "vacia",
            origenActualizacion: "doctor",
            usuarioId: doctorId,
            updatedAt: now,
          })
          .where(eq(medicalRecordSections.id, section.id))
          .returning();

        await tx.insert(medicalRecordChanges).values({
          seccionId: section.id,
          origen: "doctor",
          autorId: doctorId,
          contenidoAnterior: section.textoActual,
          contenidoNuevo: section.textoActual,
          textoSugeridoIa: section.textoSugeridoIa,
          resumenAnterior: section.resumenActual,
          resumenNuevo: section.resumenActual,
          resumenSugeridoIa: section.resumenSugeridoIa,
          origenDato: section.origenDato,
          distanciaEdicion: section.textoSugeridoIa
            ? normalizedEditDistance(section.textoSugeridoIa, section.textoActual)
            : null,
          duracionEdicionMs: options?.duracionEdicionMs ?? null,
          sesionEdicionId: options?.sesionEdicionId ?? null,
          confianza: section.confianza,
        });
        await this.markRecordInReview(record.id, tx);
        await this.createRecordVersion(
          record.id,
          {
            origen: "doctor",
            userId: doctorId,
            resumenCambios: `Doctor rechazo sugerencia IA de seccion ${String(nombre)}`,
          },
          tx
        );
        return updatedSection;
      });
      logger.info("[scribe] section:review:rejected", {
        consultaId,
        fichaId: record.id,
        sectionId: updated.id,
        section: nombre,
        nextEstado: updated.estado,
      });
      return updated;
    }

    const updated = await db.transaction(async (tx) => {
      const [updatedSection] = await tx
        .update(medicalRecordSections)
        .set({
          estado: "bloqueada",
          bloqueadaPor: doctorId,
          bloqueadaEn: now,
          usuarioId: doctorId,
          updatedAt: now,
        })
        .where(eq(medicalRecordSections.id, section.id))
        .returning();

      await tx.insert(medicalRecordChanges).values({
        seccionId: section.id,
        origen: "doctor",
        autorId: doctorId,
        contenidoAnterior: section.textoActual,
        contenidoNuevo: section.textoActual,
        textoSugeridoIa: section.textoSugeridoIa,
        resumenAnterior: section.resumenActual,
        resumenNuevo: section.resumenActual,
        resumenSugeridoIa: section.resumenSugeridoIa,
        origenDato: section.origenDato,
        distanciaEdicion: null,
        duracionEdicionMs: options?.duracionEdicionMs ?? null,
        sesionEdicionId: options?.sesionEdicionId ?? null,
        confianza: section.confianza,
      });
      await this.markRecordInReview(record.id, tx);
      await this.createRecordVersion(
        record.id,
        {
          origen: "doctor",
          userId: doctorId,
          resumenCambios: `Doctor bloqueo seccion ${String(nombre)}`,
        },
        tx
      );
      return updatedSection;
    });
    logger.info("[scribe] section:review:blocked", {
      consultaId,
      fichaId: record.id,
      sectionId: updated.id,
      section: nombre,
    });
    return updated;
  }

  async validateRecord(consultaId: string, doctorId: string) {
    const consultation = await db.query.consultations.findFirst({
      where: and(eq(consultations.id, consultaId), eq(consultations.doctorId, doctorId)),
    });
    if (!consultation) {
      logger.warn("[scribe] validation:not-authorized", { consultaId, doctorId });
      return null;
    }

    const record = await this.getOrCreateRecord(consultaId, {
      pacienteId: consultation.pacienteId,
      doctorId,
    });

    const templateSections = consultation.plantillaAnamnesisId
      ? await db
          .select({
            seccion: anamnesisTemplateSections.seccion,
            etiquetaVisible: anamnesisTemplateSections.etiquetaVisible,
            esObligatoria: anamnesisTemplateSections.esObligatoria,
          })
          .from(anamnesisTemplateSections)
          .where(
            and(
              eq(anamnesisTemplateSections.plantillaAnamnesisId, consultation.plantillaAnamnesisId),
              eq(anamnesisTemplateSections.activa, true)
            )
          )
      : [];

    const sections = await db
      .select({
        nombre: medicalRecordSections.nombre,
        textoActual: medicalRecordSections.textoActual,
        textoSugeridoIa: medicalRecordSections.textoSugeridoIa,
        estado: medicalRecordSections.estado,
      })
      .from(medicalRecordSections)
      .where(eq(medicalRecordSections.fichaId, record.id));

    const sectionMap = new Map(sections.map((section) => [String(section.nombre), section]));
    const missingRequired = templateSections
      .filter((item) => item.esObligatoria)
      .filter((item) => {
        const section = sectionMap.get(String(item.seccion));
        return !(section?.textoActual || section?.textoSugeridoIa || "").trim();
      })
      .map((item) => ({
        seccion: item.seccion,
        etiqueta: item.etiquetaVisible,
        mensaje: `Falta completar ${item.etiquetaVisible}`,
      }));

    const pendingReview = sections
      .filter((section) => section.estado === "borrador_ia")
      .map((section) => ({
        seccion: section.nombre,
        mensaje: "Tiene sugerencia IA pendiente de validar",
      }));

    const result = {
      ok: missingRequired.length === 0 && pendingReview.length === 0,
      missingRequired,
      pendingReview,
    };
    logger.info("[scribe] validation:done", {
      consultaId,
      fichaId: record.id,
      ok: result.ok,
      missingRequired: missingRequired.length,
      pendingReview: pendingReview.length,
      templateSections: templateSections.length,
      currentSections: sections.length,
    });
    return result;
  }

  async getRecordContent(consultaId: string) {
    const record = await db.query.medicalRecords.findFirst({
      where: eq(medicalRecords.consultaId, consultaId),
    });

    if (!record) {
      logger.info("[scribe] record-content:not-found", { consultaId });
      return null;
    }

    const sections = await db
      .select()
      .from(medicalRecordSections)
      .where(eq(medicalRecordSections.fichaId, record.id));

    logger.info("[scribe] record-content:loaded", {
      consultaId,
      fichaId: record.id,
      sectionCount: sections.length,
      pendingCount: sections.filter((section) => section.estado === "borrador_ia").length,
      reviewedCount: sections.filter((section) => section.estado === "revisada").length,
      lockedCount: sections.filter((section) => section.estado === "bloqueada").length,
    });

    return {
      ...record,
      sections,
    };
  }
}

export const scribeService = new ScribeService();
