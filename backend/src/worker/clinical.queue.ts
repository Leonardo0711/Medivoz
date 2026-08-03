import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { logger } from "../core/utils/logger.js";

export type ClinicalExtractionJobData = {
  consultaId: string;
  segmentoDesde?: number | null;
  segmentoHasta?: number | null;
  seccionObjetivo?: string | null;
  versionTranscripcionBase?: number | null;
  trigger?: string;
};

export const clinicalExtractionQueue = new Queue<ClinicalExtractionJobData>("clinical-extraction", {
  connection: redisConnection,
});

export const getClinicalExtractionJobStatus = async (jobId: string, consultaId: string) => {
  const job = await clinicalExtractionQueue.getJob(jobId);
  if (!job || job.data.consultaId !== consultaId) return null;

  const state = await job.getState();
  const failedReason = job.failedReason || "";
  const failureCode = failedReason.includes("truncada por limite")
    ? "output_truncated"
    : failedReason.includes("JSON invalida")
      ? "invalid_ai_response"
      : state === "failed"
        ? "extraction_failed"
        : null;

  return {
    jobId,
    state,
    attemptsMade: job.attemptsMade,
    failureCode,
  };
};

const mergeRanges = (a?: number | null, b?: number | null, mode: "min" | "max" = "min") => {
  const x = Number(a || 0);
  const y = Number(b || 0);
  if (!x) return y || null;
  if (!y) return x || null;
  return mode === "min" ? Math.min(x, y) : Math.max(x, y);
};

const mergeJobData = (
  prev: ClinicalExtractionJobData,
  next: ClinicalExtractionJobData
): ClinicalExtractionJobData => {
  return {
    consultaId: next.consultaId,
    segmentoDesde: mergeRanges(prev.segmentoDesde, next.segmentoDesde, "min"),
    segmentoHasta: mergeRanges(prev.segmentoHasta, next.segmentoHasta, "max"),
    seccionObjetivo: next.seccionObjetivo || prev.seccionObjetivo || null,
    versionTranscripcionBase: mergeRanges(
      prev.versionTranscripcionBase,
      next.versionTranscripcionBase,
      "max"
    ),
    trigger: next.trigger || prev.trigger || "unknown",
  };
};

const upsertQueueJob = async (
  jobId: string,
  payload: ClinicalExtractionJobData
): Promise<{ queued: boolean; coalesced: boolean; jobId: string; state: string }> => {
  logger.info("[clinical-queue] upsert:start", {
    jobId,
    consultaId: payload.consultaId,
    section: payload.seccionObjetivo || "all",
    segmentoDesde: payload.segmentoDesde || null,
    segmentoHasta: payload.segmentoHasta || null,
    trigger: payload.trigger || "unknown",
  });
  const existing = await clinicalExtractionQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "waiting" || state === "delayed" || state === "prioritized") {
      await existing.updateData(mergeJobData(existing.data, payload));
      logger.info("[clinical-queue] upsert:coalesced", { jobId, state });
      return { queued: false, coalesced: true, jobId, state };
    }
    if (state === "active") {
      logger.info("[clinical-queue] upsert:active-existing", { jobId, state });
      return { queued: false, coalesced: false, jobId, state };
    }
    if (state === "completed" || state === "failed") {
      await existing.remove();
      logger.info("[clinical-queue] upsert:removed-finished-existing", { jobId, state });
    }
  }

  await clinicalExtractionQueue.add("extract", payload, {
    jobId,
    attempts: 2,
    backoff: { type: "exponential", delay: 1500 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });

  logger.info("[clinical-queue] upsert:queued", { jobId });
  return { queued: true, coalesced: false, jobId, state: "queued" };
};

export const enqueueClinicalExtraction = async (payload: ClinicalExtractionJobData) => {
  const section = payload.seccionObjetivo || "all";
  const safeSection = section.replace(/[^a-zA-Z0-9_-]/g, "-");
  const baseJobId = `extract-${payload.consultaId}-${safeSection}`;

  const firstAttempt = await upsertQueueJob(baseJobId, payload);
  if (firstAttempt.queued || firstAttempt.coalesced || firstAttempt.state !== "active") {
    return firstAttempt;
  }

  logger.info("[clinical-queue] enqueue:active-primary-using-pending", {
    consultaId: payload.consultaId,
    section,
  });
  return upsertQueueJob(`${baseJobId}-pending`, payload);
};
