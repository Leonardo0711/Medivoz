BEGIN;

ALTER TABLE fichas_medicas
  ADD COLUMN IF NOT EXISTS nota_essi text;

COMMENT ON COLUMN fichas_medicas.nota_essi IS
  'Texto exacto pegado por el doctor desde ESSI para la comparacion PDQI-9.';

COMMIT;
