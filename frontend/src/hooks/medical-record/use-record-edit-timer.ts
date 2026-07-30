import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/utils/logger";
import { MedicalRecordFormData } from "./types";
import { startRecordEditSession, syncRecordEditSession } from "./record-operations-api";

const IDLE_TIMEOUT_MS = 60_000;
const HEARTBEAT_MS = 15_000;

type EditableField = keyof MedicalRecordFormData;

export type EditTimerSnapshot = {
  editSessionId: string | null;
  totalDurationMs: number;
  fieldDurationsMs: Partial<Record<EditableField, number>>;
};

export function useRecordEditTimer(consultationId: string | null) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isTiming, setIsTiming] = useState(false);
  const editSessionIdRef = useRef<string | null>(null);
  const startPromiseRef = useRef<Promise<string | null> | null>(null);
  const totalDurationRef = useRef(0);
  const fieldDurationsRef = useRef<Partial<Record<EditableField, number>>>({});
  const activeFieldRef = useRef<EditableField | null>(null);
  const lastTickRef = useRef(0);
  const lastActivityRef = useRef(0);
  const timingRef = useRef(false);

  const settle = useCallback((now: number) => {
    if (!timingRef.current) return;
    const activeUntil = Math.min(now, lastActivityRef.current + IDLE_TIMEOUT_MS);
    const delta = Math.max(0, activeUntil - lastTickRef.current);
    if (delta > 0) {
      totalDurationRef.current += delta;
      const field = activeFieldRef.current;
      if (field) {
        fieldDurationsRef.current[field] = (fieldDurationsRef.current[field] || 0) + delta;
      }
      setElapsedMs(totalDurationRef.current);
    }
    lastTickRef.current = now;
    if (now >= lastActivityRef.current + IDLE_TIMEOUT_MS) {
      timingRef.current = false;
      activeFieldRef.current = null;
      setIsTiming(false);
    }
  }, []);

  const ensureSession = useCallback(async () => {
    if (!consultationId) return null;
    if (editSessionIdRef.current) return editSessionIdRef.current;
    if (startPromiseRef.current) return startPromiseRef.current;

    startPromiseRef.current = startRecordEditSession(consultationId)
      .then((session) => {
        editSessionIdRef.current = session.id;
        totalDurationRef.current = Math.max(
          totalDurationRef.current,
          session.duracionActivaMs || 0
        );
        setElapsedMs(totalDurationRef.current);
        logger.info("Record edit timer started", {
          consultationId,
          editSessionId: session.id,
          restoredDurationMs: session.duracionActivaMs || 0,
        });
        return session.id;
      })
      .catch((error) => {
        logger.error("Could not start record edit timer", { consultationId, error });
        return null;
      })
      .finally(() => {
        startPromiseRef.current = null;
      });
    return startPromiseRef.current;
  }, [consultationId]);

  const markActivity = useCallback(
    (field: EditableField | null = null) => {
      const now = Date.now();
      settle(now);
      activeFieldRef.current = field;
      lastActivityRef.current = now;
      lastTickRef.current = now;
      if (!timingRef.current) {
        timingRef.current = true;
        setIsTiming(true);
      }
      void ensureSession();
    },
    [ensureSession, settle]
  );

  const snapshot = useCallback(async (): Promise<EditTimerSnapshot> => {
    settle(Date.now());
    const hasMeasuredActivity = timingRef.current || totalDurationRef.current > 0;
    const editSessionId = hasMeasuredActivity
      ? editSessionIdRef.current || (await ensureSession())
      : null;
    return {
      editSessionId,
      totalDurationMs: Math.round(totalDurationRef.current),
      fieldDurationsMs: { ...fieldDurationsRef.current },
    };
  }, [ensureSession, settle]);

  const clearFieldDuration = useCallback((field: EditableField) => {
    delete fieldDurationsRef.current[field];
  }, []);

  const resetAfterSave = useCallback(() => {
    editSessionIdRef.current = null;
    totalDurationRef.current = 0;
    fieldDurationsRef.current = {};
    activeFieldRef.current = null;
    timingRef.current = false;
    lastActivityRef.current = 0;
    lastTickRef.current = 0;
    setElapsedMs(0);
    setIsTiming(false);
  }, []);

  useEffect(() => {
    resetAfterSave();
  }, [consultationId, resetAfterSave]);

  useEffect(() => {
    const interval = window.setInterval(() => settle(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [settle]);

  useEffect(() => {
    if (!consultationId) return;
    const interval = window.setInterval(() => {
      settle(Date.now());
      const editSessionId = editSessionIdRef.current;
      if (!editSessionId) return;
      void syncRecordEditSession(
        consultationId,
        editSessionId,
        Math.round(totalDurationRef.current),
        "activa"
      ).catch((error) =>
        logger.warn("Could not sync record edit timer", { consultationId, error })
      );
    }, HEARTBEAT_MS);
    return () => window.clearInterval(interval);
  }, [consultationId, settle]);

  useEffect(() => {
    return () => {
      settle(Date.now());
      const editSessionId = editSessionIdRef.current;
      if (!consultationId || !editSessionId) return;
      void syncRecordEditSession(
        consultationId,
        editSessionId,
        Math.round(totalDurationRef.current),
        "pausada"
      ).catch(() => undefined);
    };
  }, [consultationId, settle]);

  return {
    elapsedMs,
    isTiming,
    markActivity,
    snapshot,
    clearFieldDuration,
    resetAfterSave,
  };
}
