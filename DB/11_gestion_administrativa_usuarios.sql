BEGIN;

CREATE TABLE IF NOT EXISTS auditoria_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_objetivo_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  accion varchar(40) NOT NULL,
  estado_anterior estado_cuenta,
  estado_nuevo estado_cuenta,
  detalles jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_usuarios_actor
  ON auditoria_usuarios (actor_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuarios_objetivo
  ON auditoria_usuarios (usuario_objetivo_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuarios_creado_en
  ON auditoria_usuarios (creado_en);

COMMENT ON TABLE auditoria_usuarios IS
  'Registra altas, ediciones, cambios de rol, suspensiones y reactivaciones realizadas desde la gestion administrativa.';
COMMENT ON COLUMN auditoria_usuarios.detalles IS
  'Metadatos no sensibles del cambio. Nunca debe contener contrasenas ni tokens.';

COMMIT;
