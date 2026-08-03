BEGIN;

-- Preferencia personal del doctor. La ficha elegida puede pertenecer a cualquiera
-- de las cinco especialidades clinicas habilitadas.
ALTER TABLE perfiles_usuario
  ADD COLUMN IF NOT EXISTS plantilla_anamnesis_predeterminada_id uuid
    REFERENCES plantillas_anamnesis(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_perfiles_usuario_plantilla_predeterminada
  ON perfiles_usuario (plantilla_anamnesis_predeterminada_id);

COMMENT ON COLUMN perfiles_usuario.plantilla_anamnesis_predeterminada_id IS
  'Ficha de anamnesis que se selecciona inicialmente al abrir una consulta del doctor.';

-- Nombres y contexto general de las cinco fichas disponibles.
UPDATE plantillas_anamnesis p
SET nombre_plantilla = 'Ficha de ' || e.nombre_especialidad,
    descripcion = CASE e.nombre_especialidad
      WHEN 'Hematologia' THEN 'Anamnesis orientada a citopenias, sangrado, trombosis, síntomas constitucionales y antecedentes hematológicos.'
      WHEN 'Neurologia' THEN 'Anamnesis orientada al inicio temporal, déficit focal, síntomas neurológicos, episodios paroxísticos y estado funcional.'
      WHEN 'Psiquiatria' THEN 'Anamnesis orientada a síntomas afectivos, ansiosos, psicóticos y cognitivos, funcionamiento, consumo y evaluación de riesgo.'
      WHEN 'Reumatologia' THEN 'Anamnesis orientada al patrón articular, rigidez, dolor inflamatorio o mecánico, manifestaciones sistémicas y limitación funcional.'
      WHEN 'Endocrinologia' THEN 'Anamnesis orientada a síntomas metabólicos y hormonales, evolución ponderal, tratamientos y estudios endocrinológicos.'
      ELSE p.descripcion
    END,
    actualizado_en = now()
FROM catalogo_especialidades e
WHERE e.id = p.especialidad_id
  AND p.es_activa = true
  AND e.nombre_especialidad IN ('Hematologia', 'Neurologia', 'Psiquiatria', 'Reumatologia', 'Endocrinologia');

-- Se conserva la estructura de diez campos de la ficha base. Solo cambian las
-- etiquetas de apoyo y las instrucciones que recibe la IA para cada especialidad.
WITH contexto(especialidad, seccion, etiqueta, instruccion) AS (
  VALUES
    ('Hematologia', 'motivo_consulta', 'Motivo de consulta', 'Precisar la queja hematológica principal: anemia o citopenia, sangrado, trombosis, adenopatías, esplenomegalia o hallazgo de laboratorio.'),
    ('Hematologia', 'tiempo_enfermedad', 'Tiempo de enfermedad', 'Registrar duración y fecha aproximada de inicio de síntomas, sangrado, alteraciones hematológicas o hallazgos de laboratorio.'),
    ('Hematologia', 'forma_inicio', 'Forma de inicio', 'Describir si el inicio fue súbito, gradual, incidental por laboratorio o relacionado con exposición, infección o tratamiento.'),
    ('Hematologia', 'curso_enfermedad', 'Curso hematológico', 'Identificar evolución estable, progresiva, recurrente o fluctuante y respuesta a transfusiones o tratamientos previos.'),
    ('Hematologia', 'historia_cronologica', 'Historia hematológica cronológica', 'Ordenar síntomas, resultados relevantes, episodios de sangrado o trombosis, transfusiones, biopsias y tratamientos con sus respuestas.'),
    ('Hematologia', 'antecedentes', 'Antecedentes hematológicos', 'Priorizar enfermedades hematológicas u oncológicas, trombosis, sangrado, transfusiones, fármacos, exposiciones y antecedentes familiares.'),
    ('Hematologia', 'sintomas_principales', 'Síntomas hematológicos relevantes', 'Extraer fatiga, palidez, disnea, fiebre, infecciones, equimosis, sangrado, pérdida de peso, sudoración nocturna, dolor óseo o adenopatías.'),
    ('Hematologia', 'estado_funcional_basal', 'Estado funcional basal', 'Registrar tolerancia al esfuerzo, autonomía y cambio funcional atribuible a fatiga, anemia, dolor u otros síntomas.'),
    ('Hematologia', 'estudios_previos', 'Estudios hematológicos previos', 'Priorizar hemograma y tendencias, frotis, coagulación, hierro, hemólisis, médula ósea, citometría, imágenes y anatomía patológica.'),
    ('Hematologia', 'notas_adicionales', 'Notas hematológicas adicionales', 'Registrar grupo sanguíneo, reacciones transfusionales, accesos, profilaxis, embarazo u otros datos hematológicos relevantes.'),

    ('Neurologia', 'motivo_consulta', 'Motivo de consulta', 'Precisar la queja neurológica principal y el déficit o episodio que motiva la consulta.'),
    ('Neurologia', 'tiempo_enfermedad', 'Tiempo de enfermedad', 'Registrar hora o fecha de inicio y, en síntomas agudos, la última vez visto en estado normal.'),
    ('Neurologia', 'forma_inicio', 'Forma de inicio neurológico', 'Distinguir inicio súbito, subagudo, gradual, episódico o insidioso y circunstancias desencadenantes.'),
    ('Neurologia', 'curso_enfermedad', 'Curso neurológico', 'Identificar curso monopásico, recurrente, progresivo, fluctuante o paroxístico y recuperación entre episodios.'),
    ('Neurologia', 'historia_cronologica', 'Historia neurológica cronológica', 'Ordenar inicio, lateralidad, progresión, duración, recuperación, recurrencias y síntomas neurológicos asociados.'),
    ('Neurologia', 'antecedentes', 'Antecedentes neurológicos', 'Priorizar eventos cerebrovasculares, crisis, migraña, trauma, infecciones, neurocirugía, fármacos, tóxicos y antecedentes familiares.'),
    ('Neurologia', 'sintomas_principales', 'Síntomas neurológicos relevantes', 'Extraer déficit motor o sensitivo, alteración del lenguaje, conciencia, memoria, marcha, visión, cefalea, vértigo, crisis y esfínteres.'),
    ('Neurologia', 'estado_funcional_basal', 'Estado neurológico funcional basal', 'Registrar independencia previa, marcha, ayudas, actividades básicas y cambio respecto del estado neurológico habitual.'),
    ('Neurologia', 'estudios_previos', 'Estudios neurológicos previos', 'Priorizar neuroimágenes, EEG, EMG, punción lumbar, pruebas cognitivas, vasculares y resultados relevantes.'),
    ('Neurologia', 'notas_adicionales', 'Notas neurológicas adicionales', 'Registrar lateralidad, dominancia, testigos del episodio, adherencia y otros datos neurológicos no incluidos.'),

    ('Psiquiatria', 'motivo_consulta', 'Motivo de consulta', 'Recoger el motivo en palabras del paciente y el contexto de derivación o consulta, diferenciando la perspectiva familiar cuando exista.'),
    ('Psiquiatria', 'tiempo_enfermedad', 'Tiempo de enfermedad', 'Registrar duración del episodio actual y edad o fecha de inicio de síntomas psiquiátricos relevantes.'),
    ('Psiquiatria', 'forma_inicio', 'Forma de inicio', 'Describir inicio agudo, gradual o insidioso y su relación con estresores, sustancias, enfermedad o cambios de medicación.'),
    ('Psiquiatria', 'curso_enfermedad', 'Curso psiquiátrico', 'Identificar curso episódico, recurrente, crónico, progresivo o fluctuante, remisiones y respuesta a tratamientos.'),
    ('Psiquiatria', 'historia_cronologica', 'Historia psiquiátrica cronológica', 'Ordenar síntomas, estresores, cambios conductuales, episodios previos, atenciones, hospitalizaciones y tratamientos.'),
    ('Psiquiatria', 'antecedentes', 'Antecedentes psiquiátricos', 'Priorizar diagnósticos previos referidos, hospitalizaciones, psicofármacos, psicoterapia, intentos autolesivos, consumo y antecedentes familiares.'),
    ('Psiquiatria', 'sintomas_principales', 'Síntomas psiquiátricos relevantes', 'Extraer ánimo, ansiedad, sueño, apetito, energía, cognición, síntomas psicóticos, maniformes, obsesivos, traumáticos y consumo.'),
    ('Psiquiatria', 'estado_funcional_basal', 'Funcionamiento psicosocial basal', 'Registrar funcionamiento familiar, social, académico, laboral, autocuidado y cambios respecto de la línea de base.'),
    ('Psiquiatria', 'estudios_previos', 'Evaluaciones y estudios previos', 'Registrar escalas, evaluaciones psicológicas, laboratorios, neuroimágenes u otros estudios usados para descartar causas orgánicas.'),
    ('Psiquiatria', 'notas_adicionales', 'Riesgo y notas adicionales', 'Priorizar ideación o conducta suicida o violenta, vulnerabilidad, acceso a medios, factores protectores, red de apoyo, juicio e insight.'),

    ('Reumatologia', 'motivo_consulta', 'Motivo de consulta', 'Precisar dolor, rigidez, tumefacción, debilidad, manifestación sistémica o seguimiento de enfermedad reumatológica.'),
    ('Reumatologia', 'tiempo_enfermedad', 'Tiempo de enfermedad', 'Registrar duración del cuadro y de la rigidez matutina, brotes y fecha del último cambio clínico.'),
    ('Reumatologia', 'forma_inicio', 'Forma de inicio', 'Describir inicio agudo, subagudo o insidioso, articulación inicial, simetría y desencadenantes.'),
    ('Reumatologia', 'curso_enfermedad', 'Curso reumatológico', 'Identificar patrón aditivo, migratorio, intermitente o progresivo, brotes, remisiones y respuesta terapéutica.'),
    ('Reumatologia', 'historia_cronologica', 'Historia reumatológica cronológica', 'Ordenar patrón articular, rigidez, limitación, manifestaciones extraarticulares, brotes, tratamientos y respuestas.'),
    ('Reumatologia', 'antecedentes', 'Antecedentes reumatológicos', 'Priorizar autoinmunidad, psoriasis, uveítis, infecciones, trombosis, pérdidas gestacionales, fármacos y antecedentes familiares.'),
    ('Reumatologia', 'sintomas_principales', 'Síntomas reumatológicos relevantes', 'Extraer distribución articular, rigidez, entesitis, Raynaud, sicca, lesiones cutáneas, fiebre, fatiga y síntomas orgánicos.'),
    ('Reumatologia', 'estado_funcional_basal', 'Capacidad funcional basal', 'Registrar actividades básicas, marcha, prensión, trabajo, ayudas técnicas y limitación funcional actual.'),
    ('Reumatologia', 'estudios_previos', 'Estudios reumatológicos previos', 'Priorizar reactantes de fase aguda, autoanticuerpos, complemento, orina, imágenes articulares y capilaroscopia.'),
    ('Reumatologia', 'notas_adicionales', 'Notas reumatológicas adicionales', 'Registrar vacunas, infecciones antes de inmunosupresión, embarazo, adherencia y seguridad de tratamientos.'),

    ('Endocrinologia', 'motivo_consulta', 'Motivo de consulta', 'Precisar síntoma metabólico u hormonal, alteración de laboratorio, lesión glandular o seguimiento endocrinológico.'),
    ('Endocrinologia', 'tiempo_enfermedad', 'Tiempo de enfermedad', 'Registrar duración de síntomas, cambios de peso y fecha de alteraciones hormonales o metabólicas.'),
    ('Endocrinologia', 'forma_inicio', 'Forma de inicio', 'Describir inicio súbito, gradual, posparto, farmacológico, incidental o asociado a cambios ponderales.'),
    ('Endocrinologia', 'curso_enfermedad', 'Curso endocrinológico', 'Identificar progresión, fluctuación, descompensaciones y respuesta a tratamiento o cambios de dosis.'),
    ('Endocrinologia', 'historia_cronologica', 'Historia endocrinológica cronológica', 'Ordenar síntomas, peso, sed, diuresis, energía, ciclos, crecimiento, resultados hormonales y tratamientos.'),
    ('Endocrinologia', 'antecedentes', 'Antecedentes endocrinológicos', 'Priorizar diabetes, tiroides, hipófisis, suprarrenal, gónadas, osteoporosis, cirugías, radiación, fármacos y antecedentes familiares.'),
    ('Endocrinologia', 'sintomas_principales', 'Síntomas endocrinológicos relevantes', 'Extraer poliuria, polidipsia, cambios de peso o apetito, intolerancia térmica, palpitaciones, debilidad, cambios cutáneos, menstruales o sexuales.'),
    ('Endocrinologia', 'estado_funcional_basal', 'Estado funcional basal', 'Registrar actividad, ejercicio, autonomía y limitaciones por fatiga, debilidad, neuropatía o complicaciones metabólicas.'),
    ('Endocrinologia', 'estudios_previos', 'Estudios endocrinológicos previos', 'Priorizar glucosa, HbA1c, perfil tiroideo, cortisol, ejes hormonales, electrolitos, densitometría e imágenes glandulares.'),
    ('Endocrinologia', 'notas_adicionales', 'Notas endocrinológicas adicionales', 'Registrar automonitoreo, hipoglucemias, técnica y adherencia, dieta, embarazo y educación endocrinológica relevante.')
)
UPDATE secciones_plantilla_anamnesis s
SET etiqueta_visible = c.etiqueta,
    descripcion_ia = c.instruccion
FROM contexto c
JOIN catalogo_especialidades e ON e.nombre_especialidad = c.especialidad
JOIN plantillas_anamnesis p ON p.especialidad_id = e.id AND p.es_activa = true
WHERE s.plantilla_anamnesis_id = p.id
  AND s.seccion::text = c.seccion;

-- Los perfiles existentes y los nuevos registros sin preferencia parten de la
-- ficha correspondiente a la especialidad con la que se registraron.
UPDATE perfiles_usuario perfil
SET plantilla_anamnesis_predeterminada_id = (
      SELECT p.id
      FROM plantillas_anamnesis p
      WHERE p.especialidad_id = perfil.especialidad_id
        AND p.es_activa = true
      ORDER BY p.numero_version DESC
      LIMIT 1
    ),
    actualizado_en = now()
WHERE perfil.plantilla_anamnesis_predeterminada_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM plantillas_anamnesis p
    WHERE p.especialidad_id = perfil.especialidad_id
      AND p.es_activa = true
  );

COMMIT;
