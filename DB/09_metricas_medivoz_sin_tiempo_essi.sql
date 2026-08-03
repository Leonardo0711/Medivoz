BEGIN;

ALTER TABLE evaluaciones_pdqi9
  ADD COLUMN IF NOT EXISTS duracion_edicion_medivoz_ms bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duracion_validacion_medivoz_ms bigint NOT NULL DEFAULT 0;

UPDATE evaluaciones_pdqi9
SET duracion_edicion_medivoz_ms = duracion_medivoz_ms
WHERE duracion_edicion_medivoz_ms = 0
  AND duracion_medivoz_ms > 0;

ALTER TABLE evaluaciones_pdqi9
  DROP COLUMN IF EXISTS diferencia_tiempo_ms,
  DROP COLUMN IF EXISTS duracion_essi_ms;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_evaluacion_duracion_edicion_medivoz'
  ) THEN
    ALTER TABLE evaluaciones_pdqi9
      ADD CONSTRAINT chk_evaluacion_duracion_edicion_medivoz
      CHECK (duracion_edicion_medivoz_ms >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_evaluacion_duracion_validacion_medivoz'
  ) THEN
    ALTER TABLE evaluaciones_pdqi9
      ADD CONSTRAINT chk_evaluacion_duracion_validacion_medivoz
      CHECK (duracion_validacion_medivoz_ms >= 0);
  END IF;
END;
$$;

COMMENT ON COLUMN evaluaciones_pdqi9.duracion_medivoz_ms IS
  'Tiempo total asistido: edicion mas validacion activa.';
COMMENT ON COLUMN evaluaciones_pdqi9.duracion_edicion_medivoz_ms IS
  'Tiempo activo acumulado mientras el medico modifica campos Medivoz.';
COMMENT ON COLUMN evaluaciones_pdqi9.duracion_validacion_medivoz_ms IS
  'Tiempo acumulado desde la primera validacion, pausado al salir de la ficha.';

COMMIT;
