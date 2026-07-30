BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluaciones_pdqi9' AND column_name = 'nota_ia')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluaciones_pdqi9' AND column_name = 'nota_medivoz_asistida') THEN
    ALTER TABLE evaluaciones_pdqi9 RENAME COLUMN nota_ia TO nota_medivoz_asistida;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluaciones_pdqi9' AND column_name = 'puntajes_ia')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluaciones_pdqi9' AND column_name = 'puntajes_medivoz') THEN
    ALTER TABLE evaluaciones_pdqi9 RENAME COLUMN puntajes_ia TO puntajes_medivoz;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluaciones_pdqi9' AND column_name = 'promedio_ia')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluaciones_pdqi9' AND column_name = 'promedio_medivoz') THEN
    ALTER TABLE evaluaciones_pdqi9 RENAME COLUMN promedio_ia TO promedio_medivoz;
  END IF;
END $$;

ALTER TABLE evaluaciones_pdqi9
  ADD COLUMN IF NOT EXISTS duracion_medivoz_ms bigint NOT NULL DEFAULT 0 CHECK (duracion_medivoz_ms >= 0),
  ADD COLUMN IF NOT EXISTS duracion_essi_ms bigint NOT NULL DEFAULT 0 CHECK (duracion_essi_ms >= 0),
  ADD COLUMN IF NOT EXISTS diferencia_tiempo_ms bigint NOT NULL DEFAULT 0;

COMMIT;
