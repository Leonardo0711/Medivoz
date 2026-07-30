BEGIN;

INSERT INTO catalogo_especialidades (nombre_especialidad, activa, es_administrativa)
VALUES
  ('Neurologia', true, false),
  ('Endocrinologia', true, false),
  ('Psiquiatria', true, false),
  ('Reumatologia', true, false),
  ('Hematologia', true, false)
ON CONFLICT (nombre_especialidad) DO UPDATE
SET activa = EXCLUDED.activa,
    es_administrativa = EXCLUDED.es_administrativa,
    actualizado_en = now();

UPDATE catalogo_especialidades
SET activa = CASE
  WHEN es_administrativa THEN true
  WHEN nombre_especialidad IN (
    'Neurologia',
    'Endocrinologia',
    'Psiquiatria',
    'Reumatologia',
    'Hematologia'
  ) THEN true
  ELSE false
END,
actualizado_en = now();

-- Garantiza que cada especialidad habilitada tenga una plantilla utilizable.
-- Si ya existe una plantilla activa, este bloque no crea otra version.
INSERT INTO plantillas_anamnesis (
  especialidad_id,
  nombre_plantilla,
  numero_version,
  descripcion,
  es_activa
)
SELECT
  c.id,
  'Anamnesis base - ' || c.nombre_especialidad,
  COALESCE(MAX(p.numero_version), 0) + 1,
  'Plantilla inicial de anamnesis para primera consulta. Misma estructura base en fase 1.',
  true
FROM catalogo_especialidades c
LEFT JOIN plantillas_anamnesis p ON p.especialidad_id = c.id
WHERE c.nombre_especialidad IN (
  'Neurologia',
  'Endocrinologia',
  'Psiquiatria',
  'Reumatologia',
  'Hematologia'
)
AND NOT EXISTS (
  SELECT 1
  FROM plantillas_anamnesis activa
  WHERE activa.especialidad_id = c.id
    AND activa.es_activa = true
)
GROUP BY c.id, c.nombre_especialidad;

INSERT INTO secciones_plantilla_anamnesis (
  plantilla_anamnesis_id,
  seccion,
  etiqueta_visible,
  descripcion_ia,
  orden,
  es_obligatoria,
  activa
)
SELECT
  p.id,
  s.seccion::nombre_seccion,
  s.etiqueta_visible,
  s.descripcion_ia,
  s.orden,
  s.es_obligatoria,
  true
FROM plantillas_anamnesis p
JOIN catalogo_especialidades c ON c.id = p.especialidad_id
CROSS JOIN (
  VALUES
    ('motivo_consulta', 'Motivo de consulta', 'Motivo principal expresado por el paciente, idealmente en una frase.', 1, true),
    ('tiempo_enfermedad', 'Tiempo de enfermedad', 'Tiempo de evolucion o duracion desde el inicio de sintomas.', 2, true),
    ('forma_inicio', 'Forma de inicio', 'Modo de inicio del problema: subito, gradual, insidioso u otro.', 3, false),
    ('curso_enfermedad', 'Curso de la enfermedad', 'Evolucion del cuadro: progresivo, estacionario, fluctuante, regresivo u otro.', 4, false),
    ('historia_cronologica', 'Historia cronologica', 'Narrativa clinica ordenada de la enfermedad actual con sintomas relevantes.', 5, true),
    ('sintomas_principales', 'Sintomas principales', 'Sintomas destacados mencionados durante la consulta.', 6, false),
    ('antecedentes', 'Antecedentes', 'Antecedentes personales, familiares o datos previos relevantes mencionados en la consulta.', 7, false),
    ('estado_funcional_basal', 'Estado funcional basal', 'Nivel funcional previo referido durante la consulta.', 8, false),
    ('estudios_previos', 'Estudios previos mencionados', 'Examenes o estudios mencionados por el paciente o medico.', 9, false),
    ('notas_adicionales', 'Notas adicionales', 'Informacion complementaria que no encaja en las secciones anteriores.', 10, false)
) AS s(seccion, etiqueta_visible, descripcion_ia, orden, es_obligatoria)
WHERE p.es_activa = true
  AND c.nombre_especialidad IN (
    'Neurologia',
    'Endocrinologia',
    'Psiquiatria',
    'Reumatologia',
    'Hematologia'
  )
ON CONFLICT DO NOTHING;

COMMIT;
