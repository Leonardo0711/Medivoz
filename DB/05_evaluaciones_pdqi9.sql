BEGIN;

ALTER TYPE rol_aplicacion ADD VALUE IF NOT EXISTS 'evaluador';

COMMIT;

BEGIN;

INSERT INTO catalogo_especialidades (nombre_especialidad, activa, es_administrativa)
VALUES ('Evaluacion clinica', true, true)
ON CONFLICT (nombre_especialidad) DO UPDATE
SET activa = EXCLUDED.activa,
    es_administrativa = EXCLUDED.es_administrativa,
    actualizado_en = now();

CREATE TABLE IF NOT EXISTS evaluaciones_pdqi9 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id uuid NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
  evaluador_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  nota_medivoz_asistida text NOT NULL,
  nota_essi text NOT NULL,
  puntajes_medivoz jsonb NOT NULL,
  puntajes_essi jsonb NOT NULL,
  promedio_medivoz numeric(4,2) NOT NULL CHECK (promedio_medivoz >= 1 AND promedio_medivoz <= 5),
  promedio_essi numeric(4,2) NOT NULL CHECK (promedio_essi >= 1 AND promedio_essi <= 5),
  diferencia_promedio numeric(4,2) NOT NULL CHECK (diferencia_promedio >= -4 AND diferencia_promedio <= 4),
  duracion_medivoz_ms bigint NOT NULL DEFAULT 0 CHECK (duracion_medivoz_ms >= 0),
  duracion_essi_ms bigint NOT NULL DEFAULT 0 CHECK (duracion_essi_ms >= 0),
  diferencia_tiempo_ms bigint NOT NULL DEFAULT 0,
  comentarios text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_evaluaciones_pdqi9_consulta_evaluador UNIQUE (consulta_id, evaluador_id)
);

CREATE INDEX IF NOT EXISTS idx_evaluaciones_pdqi9_consulta
  ON evaluaciones_pdqi9 (consulta_id);

CREATE INDEX IF NOT EXISTS idx_evaluaciones_pdqi9_evaluador
  ON evaluaciones_pdqi9 (evaluador_id, actualizado_en DESC);

COMMIT;
