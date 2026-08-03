import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/utils/logger";
import {
  getRecordValidationSession,
  startRecordValidationSession,
  syncRecordValidationSession,
} from "./record-operations-api";

const HEARTBEAT_MS = 15_000;

export function useRecordValidationTimer(consultationId: string | null) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isTiming, setIsTiming] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const validationSessionIdRef = useRef<string | null>(null);
  const activationPromiseRef = useRef<Promise<string | null> | null>(null);
  const totalDurationRef = useRef(0);
  const previousSessionsDurationRef = useRef(0);
  const lastTickRef = useRef(0);
  const timingRef = useRef(false);
  const startedRef = useRef(false);
  const completedRef = useRef(false);

  const currentSessionDuration = useCallback(
    () => Math.round(Math.max(0, totalDurationRef.current - previousSessionsDurationRef.current)),
    []
  );

  const settle = useCallback((now: number) => {
    if (!timingRef.current || !lastTickRef.current) return;
    const delta = Math.max(0, now - lastTickRef.current);
    if (delta > 0) {
      totalDurationRef.current += delta;
      setElapsedMs(totalDurationRef.current);
    }
    lastTickRef.current = now;
  }, []);

  const activateSession = useCallback(async () => {
    if (!consultationId) return null;
    if (activationPromiseRef.current) return activationPromiseRef.current;

    activationPromiseRef.current = startRecordValidationSession(consultationId)
      .then((session) => {
        const accumulated = session.duracionAcumuladaMs ?? session.duracionActivaMs ?? 0;
        validationSessionIdRef.current = session.id;
        previousSessionsDurationRef.current = Math.max(
          0,
          accumulated - (session.duracionActivaMs || 0)
        );
        totalDurationRef.current = Math.max(totalDurationRef.current, accumulated);
        setElapsedMs(totalDurationRef.current);
        startedRef.current = true;
        completedRef.current = false;
        setHasStarted(true);
        logger.info("Record validation timer activated", {
          consultationId,
          validationSessionId: session.id,
          restoredDurationMs: accumulated,
        });
        return session.id;
      })
      .catch((error) => {
        logger.error("Could not start record validation timer", { consultationId, error });
        return null;
      })
      .finally(() => {
        activationPromiseRef.current = null;
      });
    return activationPromiseRef.current;
  }, [consultationId]);

  const start = useCallback(async () => {
    if (!consultationId || timingRef.current) return validationSessionIdRef.current;
    const now = Date.now();
    timingRef.current = true;
    startedRef.current = true;
    completedRef.current = false;
    lastTickRef.current = now;
    setHasStarted(true);
    setIsTiming(true);
    const sessionId = await activateSession();
    if (!sessionId) {
      timingRef.current = false;
      setIsTiming(false);
    }
    return sessionId;
  }, [activateSession, consultationId]);

  const syncAndStop = useCallback(
    async (state: "pausada" | "completada") => {
      settle(Date.now());
      timingRef.current = false;
      lastTickRef.current = 0;
      setIsTiming(false);
      if (!startedRef.current) return;

      const sessionId = validationSessionIdRef.current || (await activationPromiseRef.current);
      if (!consultationId || !sessionId) return;
      await syncRecordValidationSession(
        consultationId,
        sessionId,
        currentSessionDuration(),
        state
      );
      completedRef.current = state === "completada";
    },
    [consultationId, currentSessionDuration, settle]
  );

  const pause = useCallback(() => syncAndStop("pausada"), [syncAndStop]);
  const complete = useCallback(() => syncAndStop("completada"), [syncAndStop]);

  useEffect(() => {
    validationSessionIdRef.current = null;
    activationPromiseRef.current = null;
    totalDurationRef.current = 0;
    previousSessionsDurationRef.current = 0;
    lastTickRef.current = 0;
    timingRef.current = false;
    startedRef.current = false;
    completedRef.current = false;
    setElapsedMs(0);
    setIsTiming(false);
    setHasStarted(false);
    if (!consultationId) return;

    let cancelled = false;
    void getRecordValidationSession(consultationId)
      .then(async (session) => {
        if (cancelled || !session) return;
        const accumulated = session.duracionAcumuladaMs ?? session.duracionActivaMs ?? 0;
        validationSessionIdRef.current = session.id;
        previousSessionsDurationRef.current = Math.max(
          0,
          accumulated - (session.duracionActivaMs || 0)
        );
        totalDurationRef.current = accumulated;
        startedRef.current = true;
        completedRef.current = session.estado === "completada";
        setElapsedMs(accumulated);
        setHasStarted(true);
        if (session.estado !== "completada") await start();
      })
      .catch((error) =>
        logger.warn("Could not restore record validation timer", { consultationId, error })
      );
    return () => {
      cancelled = true;
    };
  }, [consultationId, start]);

  useEffect(() => {
    const interval = window.setInterval(() => settle(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [settle]);

  useEffect(() => {
    if (!consultationId) return;
    const interval = window.setInterval(() => {
      settle(Date.now());
      const validationSessionId = validationSessionIdRef.current;
      if (!validationSessionId || !timingRef.current) return;
      void syncRecordValidationSession(
        consultationId,
        validationSessionId,
        currentSessionDuration(),
        "activa"
      ).catch((error) =>
        logger.warn("Could not sync record validation timer", { consultationId, error })
      );
    }, HEARTBEAT_MS);
    return () => window.clearInterval(interval);
  }, [consultationId, currentSessionDuration, settle]);

  useEffect(() => {
    if (!consultationId) return;
    const onVisibilityChange = () => {
      if (document.hidden) {
        void pause();
      } else if (startedRef.current && !completedRef.current) {
        void start();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [consultationId, pause, start]);

  useEffect(() => {
    return () => {
      if (!startedRef.current || completedRef.current) return;
      settle(Date.now());
      timingRef.current = false;
      const validationSessionId = validationSessionIdRef.current;
      if (!consultationId || !validationSessionId) return;
      void syncRecordValidationSession(
        consultationId,
        validationSessionId,
        currentSessionDuration(),
        "pausada"
      ).catch(() => undefined);
    };
  }, [consultationId, currentSessionDuration, settle]);

  return {
    elapsedMs,
    isTiming,
    hasStarted,
    start,
    pause,
    complete,
  };
}
