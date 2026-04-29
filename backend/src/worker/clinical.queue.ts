import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";

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
  const existing = await clinicalExtractionQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "waiting" || state === "delayed" || state === "prioritized") {
      await existing.updateData(mergeJobData(existing.data, payload));
      return { queued: false, coalesced: true, jobId, state };
    }
    if (state === "active") {
      return { queued: false, coalesced: false, jobId, state };
    }
  }

  await clinicalExtractionQueue.add("extract", payload, {
    jobId,
    attempts: 2,
    backoff: { type: "exponential", delay: 1500 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });

  return { queued: true, coalesced: false, jobId, state: "queued" };
};

export const enqueueClinicalExtraction = async (payload: ClinicalExtractionJobData) => {
  const section = payload.seccionObjetivo || "all";
  const baseJobId = `extract:${payload.consultaId}:${section}`;

  const firstAttempt = await upsertQueueJob(baseJobId, payload);
  if (firstAttempt.queued || firstAttempt.coalesced || firstAttempt.state !== "active") {
    return firstAttempt;
  }

  return upsertQueueJob(`${baseJobId}:pending`, payload);
};

