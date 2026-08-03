BEGIN;

CREATE TABLE IF NOT EXISTS sesiones_validacion_ficha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_medica_id uuid NOT NULL REFERENCES fichas_medicas(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  estado varchar(20) NOT NULL DEFAULT 'activa',
  iniciado_en timestamptz NOT NULL DEFAULT now(),
  ultima_actividad_en timestamptz NOT NULL DEFAULT now(),
  finalizado_en timestamptz,
  duracion_activa_ms integer NOT NULL DEFAULT 0 CHECK (duracion_activa_ms >= 0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_sesion_validacion_estado
    CHECK (estado IN ('activa', 'pausada', 'completada')),
  CONSTRAINT chk_sesion_validacion_finalizada
    CHECK (estado <> 'completada' OR finalizado_en IS NOT NULL)
);

COMMENT ON TABLE sesiones_validacion_ficha IS
  'Tiempo activo acumulado de validacion de la anamnesis. Inicia con el primer campo validado y se pausa al salir.';

CREATE INDEX IF NOT EXISTS idx_sesiones_validacion_ficha_ficha
  ON sesiones_validacion_ficha (ficha_medica_id, iniciado_en DESC);

CREATE INDEX IF NOT EXISTS idx_sesiones_validacion_ficha_doctor
  ON sesiones_validacion_ficha (doctor_id, iniciado_en DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sesiones_validacion_ficha_activa
  ON sesiones_validacion_ficha (ficha_medica_id, doctor_id)
  WHERE estado = 'activa';

COMMIT;
