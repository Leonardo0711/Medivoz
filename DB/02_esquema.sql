-- =========================================================
-- MEDIVOZ - ESQUEMA COMPLETO POSTGRESQL (VERSION ACTUALIZADA)
-- =========================================================
-- Notas:
-- 1) Este script asume que ya estas dentro de la BD "medivoz".
-- 2) Es un script pensado para ejecucion inicial.
-- 3) Fase 1 se enfoca en anamnesis de primera consulta.
-- 4) Se mantiene la tabla pacientes para distinguir pacientes entre consultas,
--    sin exigir un perfil clinico longitudinal.
-- 5) El audio NO se guarda de forma permanente.
-- 6) El audio temporal se registra en BD solo para procesamiento/depuracion corta
--    y luego debe eliminarse desde un worker o tarea programada del backend.
-- 7) Se agrega manejo de sesiones por dispositivo mediante refresh tokens hasheados.
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================
-- ENUMS
-- =========================================================

CREATE TYPE rol_aplicacion AS ENUM (
  'doctor',
  'administrador'
);

CREATE TYPE estado_cuenta AS ENUM (
  'activa',
  'suspendida',
  'bloqueada'
);

CREATE TYPE estado_consulta AS ENUM (
  'en_espera',
  'en_curso',
  'pausada',
  'finalizada',
  'cancelada'
);

CREATE TYPE tipo_consulta AS ENUM (
  'primera_consulta',
  'control',
  'seguimiento',
  'interconsulta',
  'emergencia'
);

CREATE TYPE tipo_hablante AS ENUM (
  'doctor',
  'paciente',
  'familiar',
  'desconocido'
);

CREATE TYPE origen_transcripcion AS ENUM (
  'flujo_en_vivo',
  'archivo_subido',
  'edicion_manual',
  'fusion_sistema'
);

CREATE TYPE nombre_seccion AS ENUM (
  'motivo_consulta',
  'tiempo_enfermedad',
  'forma_inicio',
  'curso_enfermedad',
  'historia_cronologica',
  'antecedentes',
  'sintomas_principales',
  'estado_funcional_basal',
  'estudios_previos',
  'notas_adicionales'
);

CREATE TYPE estado_seccion AS ENUM (
  'vacia',
  'borrador_ia',
  'revisada',
  'bloqueada'
);

CREATE TYPE estado_ficha AS ENUM (
  'vacia',
  'generando',
  'borrador_ia',
  'en_revision',
  'finalizada',
  'error'
);

CREATE TYPE origen_actualizacion AS ENUM (
  'ia',
  'doctor',
  'manual',
  'sistema'
);

CREATE TYPE estado_ejecucion AS ENUM (
  'en_cola',
  'ejecutando',
  'exitosa',
  'fallida',
  'cancelada'
);

CREATE TYPE tipo_ejecucion AS ENUM (
  'transcripcion',
  'llenado_seccion',
  'refinamiento_seccion',
  'resumen_completo',
  'validacion'
);

CREATE TYPE tipo_agente AS ENUM (
  'transcriptor',
  'extractor',
  'resumidor',
  'validador'
);

CREATE TYPE estado_agente AS ENUM (
  'activo',
  'inactivo'
);

CREATE TYPE origen_configuracion_agente AS ENUM (
  'administrador',
  'doctor',
  'sistema'
);

CREATE TYPE estado_audio_temporal AS ENUM (
  'pendiente_procesamiento',
  'disponible',
  'marcado_para_borrado',
  'eliminado',
  'error_eliminacion'
);

-- =========================================================
-- TABLAS DE AUTENTICACION, PERFIL Y SESIONES
-- =========================================================

CREATE TABLE usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correo_electronico varchar(255) NOT NULL UNIQUE,
  hash_contrasena text NOT NULL,
  estado_cuenta estado_cuenta NOT NULL DEFAULT 'activa',
  ultimo_acceso_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE usuarios IS 'Tabla principal de autenticacion. El usuario se registra con correo y contrasena.';
COMMENT ON COLUMN usuarios.hash_contrasena IS 'Guardar solo hash seguro, nunca contrasena en texto plano.';

CREATE TABLE sesiones_usuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  refresh_token_hash text NOT NULL UNIQUE,
  ip_origen varchar(45),
  agente_usuario text,
  nombre_dispositivo text,
  expira_en timestamptz NOT NULL,
  ultimo_uso_en timestamptz,
  revocada_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_sesion_expira_despues_de_creacion
    CHECK (expira_en > creado_en)
);

COMMENT ON TABLE sesiones_usuario IS 'Sesiones de autenticacion por dispositivo o navegador. Guarda hash del refresh token, no el token plano.';
COMMENT ON COLUMN sesiones_usuario.refresh_token_hash IS 'Hash del refresh token. Nunca guardar el refresh token sin proteger.';
COMMENT ON COLUMN sesiones_usuario.agente_usuario IS 'User-Agent del navegador o app.';
COMMENT ON COLUMN sesiones_usuario.nombre_dispositivo IS 'Nombre amigable opcional del dispositivo o navegador.';

CREATE TABLE catalogo_especialidades (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre_especialidad varchar(120) NOT NULL UNIQUE,
  activa boolean NOT NULL DEFAULT true,
  es_administrativa boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogo_especialidades IS 'Catalogo cerrado de especialidades. Debe incluir una opcion administrativa para el admin.';

CREATE TABLE perfiles_usuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre_completo text NOT NULL,
  especialidad_id integer NOT NULL REFERENCES catalogo_especialidades(id),
  url_avatar text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE perfiles_usuario IS 'Perfil visible del usuario: nombre completo y especialidad elegida desde catalogo.';

CREATE TABLE roles_usuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rol rol_aplicacion NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_roles_usuario UNIQUE (usuario_id, rol)
);

COMMENT ON TABLE roles_usuario IS 'Rol del usuario. Los registros publicos deberian crear doctor por defecto.';

-- =========================================================
-- PLANTILLAS DE ANAMNESIS POR ESPECIALIDAD
-- =========================================================

CREATE TABLE plantillas_anamnesis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  especialidad_id integer NOT NULL REFERENCES catalogo_especialidades(id) ON DELETE RESTRICT,
  nombre_plantilla text NOT NULL,
  numero_version integer NOT NULL DEFAULT 1 CHECK (numero_version > 0),
  descripcion text NOT NULL DEFAULT '',
  es_activa boolean NOT NULL DEFAULT true,
  creada_por_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_plantillas_anamnesis_version UNIQUE (especialidad_id, numero_version)
);

COMMENT ON TABLE plantillas_anamnesis IS 'Plantilla de anamnesis por especialidad. En fase 1 todas pueden compartir la misma estructura.';

CREATE TABLE secciones_plantilla_anamnesis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plantilla_anamnesis_id uuid NOT NULL REFERENCES plantillas_anamnesis(id) ON DELETE CASCADE,
  seccion nombre_seccion NOT NULL,
  etiqueta_visible text NOT NULL,
  descripcion_ia text,
  orden integer NOT NULL CHECK (orden > 0),
  es_obligatoria boolean NOT NULL DEFAULT false,
  activa boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_secciones_plantilla_anamnesis_seccion UNIQUE (plantilla_anamnesis_id, seccion),
  CONSTRAINT uq_secciones_plantilla_anamnesis_orden UNIQUE (plantilla_anamnesis_id, orden)
);

COMMENT ON TABLE secciones_plantilla_anamnesis IS 'Secciones de una plantilla de anamnesis. Permite especializar la estructura mas adelante sin romper consultas previas.';

-- =========================================================
-- PACIENTES Y CONSULTAS
-- =========================================================

CREATE TABLE pacientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  codigo_paciente varchar(40) NOT NULL DEFAULT ('PAC-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  nombres_apellidos text NOT NULL,
  dni varchar(20),
  edad integer CHECK (edad IS NULL OR edad >= 0),
  ocupacion text,
  procedencia text,
  diagnostico_general text,
  ultima_visita timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_pacientes_doctor_codigo UNIQUE (doctor_id, codigo_paciente),
  CONSTRAINT uq_pacientes_doctor_dni UNIQUE (doctor_id, dni)
);

COMMENT ON TABLE pacientes IS 'Catalogo minimo de pacientes por doctor para fase 1. Permite distinguir pacientes sin exigir historia clinica longitudinal.';
COMMENT ON COLUMN pacientes.codigo_paciente IS 'Codigo interno para diferenciar pacientes aunque no se registre DNI.';

CREATE TABLE consultas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  paciente_id uuid NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  plantilla_anamnesis_id uuid REFERENCES plantillas_anamnesis(id) ON DELETE SET NULL,
  codigo_consulta varchar(40) NOT NULL UNIQUE,
  tipo_consulta tipo_consulta NOT NULL DEFAULT 'primera_consulta',
  estado estado_consulta NOT NULL DEFAULT 'en_espera',
  fecha_hora_consulta timestamptz,
  inicio_real timestamptz,
  fin_real timestamptz,
  transcripcion_completa text,
  version_transcripcion integer NOT NULL DEFAULT 1 CHECK (version_transcripcion > 0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_consulta_fin_mayor_inicio
    CHECK (
      inicio_real IS NULL
      OR fin_real IS NULL
      OR fin_real >= inicio_real
    )
);

COMMENT ON TABLE consultas IS 'Entidad central para la anamnesis de primera consulta en fase 1. El audio no se guarda de forma permanente.';

CREATE TABLE audios_temporales_consulta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id uuid NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
  ruta_almacenamiento text NOT NULL,
  tipo_mime varchar(100),
  duracion_ms integer CHECK (duracion_ms IS NULL OR duracion_ms >= 0),
  tamano_bytes bigint CHECK (tamano_bytes IS NULL OR tamano_bytes >= 0),
  hash_archivo text,
  estado estado_audio_temporal NOT NULL DEFAULT 'pendiente_procesamiento',
  motivo_conservacion text,
  expira_en timestamptz NOT NULL,
  borrado_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_audio_borrado_consistente
    CHECK (
      (estado <> 'eliminado' AND borrado_en IS NULL)
      OR (estado = 'eliminado' AND borrado_en IS NOT NULL)
    )
);

COMMENT ON TABLE audios_temporales_consulta IS 'Audio temporal de una consulta. Se usa para procesamiento o depuracion corta y luego debe eliminarse.';

CREATE TABLE segmentos_transcripcion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id uuid NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
  numero_secuencia integer NOT NULL,
  hablante tipo_hablante NOT NULL DEFAULT 'desconocido',
  origen origen_transcripcion NOT NULL DEFAULT 'flujo_en_vivo',
  inicio_ms integer CHECK (inicio_ms IS NULL OR inicio_ms >= 0),
  fin_ms integer CHECK (fin_ms IS NULL OR fin_ms >= 0),
  texto text NOT NULL,
  confianza numeric(5,4) CHECK (confianza IS NULL OR (confianza >= 0 AND confianza <= 1)),
  codigo_idioma varchar(10),
  carga_cruda jsonb,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_segmentos_transcripcion UNIQUE (consulta_id, numero_secuencia),
  CONSTRAINT chk_segmento_fin_mayor_inicio
    CHECK (
      inicio_ms IS NULL
      OR fin_ms IS NULL
      OR fin_ms >= inicio_ms
    )
);

COMMENT ON TABLE segmentos_transcripcion IS 'Transcripcion incremental de la consulta. Permite llenado en vivo.';

-- =========================================================
-- AGENTES Y PROMPTS
-- =========================================================

CREATE TABLE plantillas_agente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_plantilla text NOT NULL,
  descripcion text NOT NULL DEFAULT '',
  tipo tipo_agente NOT NULL,
  estado estado_agente NOT NULL DEFAULT 'activo',
  especialidad_id integer REFERENCES catalogo_especialidades(id) ON DELETE SET NULL,
  creada_por_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  visible_para_todos_los_doctores boolean NOT NULL DEFAULT true,
  configuracion_base jsonb NOT NULL DEFAULT '{}'::jsonb,
  documentos_referencia text[],
  dependencias text[],
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE plantillas_agente IS 'Plantilla maestra de un agente. Puede ser general o especifica para una especialidad.';
COMMENT ON COLUMN plantillas_agente.especialidad_id IS 'Null significa plantilla general para todas las especialidades.';

CREATE TABLE versiones_prompt_plantilla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plantilla_agente_id uuid NOT NULL REFERENCES plantillas_agente(id) ON DELETE CASCADE,
  numero_version integer NOT NULL CHECK (numero_version > 0),
  texto_prompt text NOT NULL,
  nombre_modelo varchar(100),
  temperatura numeric(3,2),
  configuracion_extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  es_activa boolean NOT NULL DEFAULT true,
  creada_por_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_versiones_prompt_plantilla UNIQUE (plantilla_agente_id, numero_version),
  CONSTRAINT chk_temp_prompt_plantilla
    CHECK (temperatura IS NULL OR (temperatura >= 0 AND temperatura <= 2))
);

COMMENT ON TABLE versiones_prompt_plantilla IS 'Historial del prompt base de cada plantilla de agente.';

CREATE TABLE agentes_doctor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  plantilla_agente_id uuid NOT NULL REFERENCES plantillas_agente(id) ON DELETE CASCADE,
  nombre_visible text,
  estado estado_agente NOT NULL DEFAULT 'activo',
  editable_por_doctor boolean NOT NULL DEFAULT false,
  usar_en_consulta_en_vivo boolean NOT NULL DEFAULT true,
  usar_en_resumen_final boolean NOT NULL DEFAULT true,
  prioridad integer NOT NULL DEFAULT 1 CHECK (prioridad > 0),
  configuracion_sobrescrita jsonb,
  observaciones_admin text,
  asignado_por_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_agentes_doctor UNIQUE (doctor_id, plantilla_agente_id)
);

COMMENT ON TABLE agentes_doctor IS 'Asignacion de una plantilla de agente a un doctor, con reglas de uso y personalizacion.';

CREATE TABLE secciones_habilitadas_agente_doctor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_doctor_id uuid NOT NULL REFERENCES agentes_doctor(id) ON DELETE CASCADE,
  seccion nombre_seccion NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_secciones_habilitadas_agente UNIQUE (agente_doctor_id, seccion)
);

COMMENT ON TABLE secciones_habilitadas_agente_doctor IS 'Secciones de la ficha en las que puede intervenir un agente de un doctor.';

CREATE TABLE versiones_prompt_doctor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_doctor_id uuid NOT NULL REFERENCES agentes_doctor(id) ON DELETE CASCADE,
  numero_version integer NOT NULL CHECK (numero_version > 0),
  texto_prompt text NOT NULL,
  nombre_modelo varchar(100),
  temperatura numeric(3,2),
  configuracion_extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  es_activa boolean NOT NULL DEFAULT true,
  creada_por_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  origen origen_configuracion_agente NOT NULL DEFAULT 'doctor',
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_versiones_prompt_doctor UNIQUE (agente_doctor_id, numero_version),
  CONSTRAINT chk_temp_prompt_doctor
    CHECK (temperatura IS NULL OR (temperatura >= 0 AND temperatura <= 2))
);

COMMENT ON TABLE versiones_prompt_doctor IS 'Prompts personalizados para un doctor especifico.';

CREATE TABLE ejecuciones_agente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id uuid NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
  agente_doctor_id uuid NOT NULL REFERENCES agentes_doctor(id) ON DELETE RESTRICT,
  version_prompt_plantilla_id uuid REFERENCES versiones_prompt_plantilla(id) ON DELETE SET NULL,
  version_prompt_doctor_id uuid REFERENCES versiones_prompt_doctor(id) ON DELETE SET NULL,
  tipo tipo_ejecucion NOT NULL,
  estado estado_ejecucion NOT NULL DEFAULT 'en_cola',
  seccion_objetivo nombre_seccion,
  segmento_desde integer CHECK (segmento_desde IS NULL OR segmento_desde > 0),
  segmento_hasta integer CHECK (segmento_hasta IS NULL OR segmento_hasta > 0),
  nombre_modelo_usado varchar(100),
  temperatura_usada numeric(3,2),
  entrada_json jsonb,
  salida_json jsonb,
  salida_texto text,
  inicio_ejecucion timestamptz,
  fin_ejecucion timestamptz,
  latencia_ms integer CHECK (latencia_ms IS NULL OR latencia_ms >= 0),
  mensaje_error text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_temp_ejecucion
    CHECK (temperatura_usada IS NULL OR (temperatura_usada >= 0 AND temperatura_usada <= 2)),
  CONSTRAINT chk_ejecucion_fin_mayor_inicio
    CHECK (
      inicio_ejecucion IS NULL
      OR fin_ejecucion IS NULL
      OR fin_ejecucion >= inicio_ejecucion
    ),
  CONSTRAINT chk_segmento_hasta_mayor_desde
    CHECK (
      segmento_desde IS NULL
      OR segmento_hasta IS NULL
      OR segmento_hasta >= segmento_desde
    )
);

COMMENT ON TABLE ejecuciones_agente IS 'Trazabilidad de cada ejecucion real de IA durante la consulta.';

-- =========================================================
-- FICHA MEDICA Y SECCIONES
-- =========================================================

CREATE TABLE fichas_medicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id uuid NOT NULL UNIQUE REFERENCES consultas(id) ON DELETE CASCADE,
  plantilla_anamnesis_id uuid REFERENCES plantillas_anamnesis(id) ON DELETE SET NULL,
  estado estado_ficha NOT NULL DEFAULT 'vacia',
  esta_finalizada boolean NOT NULL DEFAULT false,
  finalizada_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_ficha_finalizada_fecha
    CHECK (
      esta_finalizada = false
      OR finalizada_en IS NOT NULL
    )
);

COMMENT ON TABLE fichas_medicas IS 'Cabecera de la ficha medica derivada de una consulta. No duplica doctor ni paciente.';

CREATE TABLE secciones_ficha_medica (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_medica_id uuid NOT NULL REFERENCES fichas_medicas(id) ON DELETE CASCADE,
  seccion nombre_seccion NOT NULL,
  texto_sugerido_ia text,
  texto_actual text,
  estado estado_seccion NOT NULL DEFAULT 'vacia',
  confianza numeric(5,4) CHECK (confianza IS NULL OR (confianza >= 0 AND confianza <= 1)),
  ultimo_origen_actualizacion origen_actualizacion NOT NULL DEFAULT 'sistema',
  ultimo_usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  ultima_ejecucion_agente_id uuid REFERENCES ejecuciones_agente(id) ON DELETE SET NULL,
  revisada_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  revisada_en timestamptz,
  bloqueada_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  bloqueada_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_secciones_ficha_medica UNIQUE (ficha_medica_id, seccion)
);

COMMENT ON TABLE secciones_ficha_medica IS 'Estado actual de cada parte de la anamnesis. Separa sugerencia IA de texto aceptado.';

CREATE TABLE versiones_ficha_medica (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_medica_id uuid NOT NULL REFERENCES fichas_medicas(id) ON DELETE CASCADE,
  numero_version integer NOT NULL CHECK (numero_version > 0),
  origen origen_actualizacion NOT NULL,
  ejecucion_agente_id uuid REFERENCES ejecuciones_agente(id) ON DELETE SET NULL,
  creado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  instantanea jsonb NOT NULL,
  resumen_cambios text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_versiones_ficha_medica UNIQUE (ficha_medica_id, numero_version)
);

COMMENT ON TABLE versiones_ficha_medica IS 'Snapshot completo de la ficha medica en distintos momentos.';

CREATE TABLE cambios_seccion_ficha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seccion_ficha_id uuid NOT NULL REFERENCES secciones_ficha_medica(id) ON DELETE CASCADE,
  origen origen_actualizacion NOT NULL,
  ejecucion_agente_id uuid REFERENCES ejecuciones_agente(id) ON DELETE SET NULL,
  actualizado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  texto_anterior text,
  texto_nuevo text,
  texto_sugerido_ia text,
  distancia_edicion numeric(6,4) CHECK (distancia_edicion IS NULL OR (distancia_edicion >= 0 AND distancia_edicion <= 1)),
  duracion_edicion_ms integer CHECK (duracion_edicion_ms IS NULL OR duracion_edicion_ms >= 0),
  confianza numeric(5,4) CHECK (confianza IS NULL OR (confianza >= 0 AND confianza <= 1)),
  creado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE cambios_seccion_ficha IS 'Historial fino de cambios por seccion. Permite medir cuanto cambia el doctor la sugerencia IA y cuanto tarda.';

CREATE TABLE evidencias_seccion_ficha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seccion_ficha_id uuid NOT NULL REFERENCES secciones_ficha_medica(id) ON DELETE CASCADE,
  segmento_transcripcion_id uuid REFERENCES segmentos_transcripcion(id) ON DELETE SET NULL,
  texto_evidencia text NOT NULL,
  confianza numeric(5,4) CHECK (confianza IS NULL OR (confianza >= 0 AND confianza <= 1)),
  creado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE evidencias_seccion_ficha IS 'Evidencia ligera que vincula una seccion de anamnesis con los segmentos que la sustentan.';

CREATE TABLE eventos_consulta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id uuid NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
  tipo_evento varchar(60) NOT NULL,
  carga_evento jsonb,
  creado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE eventos_consulta IS 'Bitacora operativa y tecnica de la consulta.';

-- =========================================================
-- INDICES
-- =========================================================

CREATE INDEX idx_sesiones_usuario_usuario_id
  ON sesiones_usuario (usuario_id);

CREATE INDEX idx_sesiones_usuario_expira_en
  ON sesiones_usuario (expira_en);

CREATE INDEX idx_sesiones_usuario_revocada_en
  ON sesiones_usuario (revocada_en);

CREATE INDEX idx_perfiles_usuario_especialidad_id
  ON perfiles_usuario (especialidad_id);

CREATE INDEX idx_roles_usuario_usuario_id
  ON roles_usuario (usuario_id);

CREATE UNIQUE INDEX uq_plantillas_anamnesis_activa
  ON plantillas_anamnesis (especialidad_id)
  WHERE es_activa = true;

CREATE INDEX idx_plantillas_anamnesis_especialidad_id
  ON plantillas_anamnesis (especialidad_id);

CREATE INDEX idx_secciones_plantilla_anamnesis_plantilla
  ON secciones_plantilla_anamnesis (plantilla_anamnesis_id);

CREATE INDEX idx_secciones_plantilla_anamnesis_activa
  ON secciones_plantilla_anamnesis (activa);

CREATE INDEX idx_pacientes_doctor_id
  ON pacientes (doctor_id);

CREATE INDEX idx_pacientes_codigo_paciente
  ON pacientes (codigo_paciente);

CREATE INDEX idx_pacientes_nombres_apellidos
  ON pacientes (nombres_apellidos);

CREATE INDEX idx_consultas_doctor_id
  ON consultas (doctor_id);

CREATE INDEX idx_consultas_paciente_id
  ON consultas (paciente_id);

CREATE INDEX idx_consultas_plantilla_anamnesis_id
  ON consultas (plantilla_anamnesis_id);

CREATE INDEX idx_consultas_tipo_consulta
  ON consultas (tipo_consulta);

CREATE INDEX idx_consultas_estado
  ON consultas (estado);

CREATE INDEX idx_consultas_fecha_hora_consulta
  ON consultas (fecha_hora_consulta);

CREATE INDEX idx_audios_temporales_consulta_id
  ON audios_temporales_consulta (consulta_id);

CREATE INDEX idx_audios_temporales_estado
  ON audios_temporales_consulta (estado);

CREATE INDEX idx_audios_temporales_expira_en
  ON audios_temporales_consulta (expira_en);

CREATE INDEX idx_segmentos_transcripcion_consulta_id
  ON segmentos_transcripcion (consulta_id);

CREATE INDEX idx_segmentos_transcripcion_hablante
  ON segmentos_transcripcion (hablante);

CREATE INDEX idx_plantillas_agente_tipo
  ON plantillas_agente (tipo);

CREATE INDEX idx_plantillas_agente_estado
  ON plantillas_agente (estado);

CREATE INDEX idx_plantillas_agente_especialidad_id
  ON plantillas_agente (especialidad_id);

CREATE INDEX idx_plantillas_agente_creada_por_id
  ON plantillas_agente (creada_por_id);

CREATE INDEX idx_versiones_prompt_plantilla_plantilla_agente_id
  ON versiones_prompt_plantilla (plantilla_agente_id);

CREATE UNIQUE INDEX uq_versiones_prompt_plantilla_activa
  ON versiones_prompt_plantilla (plantilla_agente_id)
  WHERE es_activa = true;

CREATE INDEX idx_agentes_doctor_doctor_id
  ON agentes_doctor (doctor_id);

CREATE INDEX idx_agentes_doctor_plantilla_agente_id
  ON agentes_doctor (plantilla_agente_id);

CREATE INDEX idx_agentes_doctor_estado
  ON agentes_doctor (estado);

CREATE INDEX idx_secciones_habilitadas_agente_doctor_agente
  ON secciones_habilitadas_agente_doctor (agente_doctor_id);

CREATE INDEX idx_versiones_prompt_doctor_agente_doctor_id
  ON versiones_prompt_doctor (agente_doctor_id);

CREATE UNIQUE INDEX uq_versiones_prompt_doctor_activa
  ON versiones_prompt_doctor (agente_doctor_id)
  WHERE es_activa = true;

CREATE INDEX idx_ejecuciones_agente_consulta_id
  ON ejecuciones_agente (consulta_id);

CREATE INDEX idx_ejecuciones_agente_agente_doctor_id
  ON ejecuciones_agente (agente_doctor_id);

CREATE INDEX idx_ejecuciones_agente_estado
  ON ejecuciones_agente (estado);

CREATE INDEX idx_ejecuciones_agente_seccion_objetivo
  ON ejecuciones_agente (seccion_objetivo);

CREATE INDEX idx_secciones_ficha_medica_ficha
  ON secciones_ficha_medica (ficha_medica_id);

CREATE INDEX idx_secciones_ficha_medica_estado
  ON secciones_ficha_medica (estado);

CREATE INDEX idx_secciones_ficha_medica_revisada_por
  ON secciones_ficha_medica (revisada_por);

CREATE INDEX idx_versiones_ficha_medica_ficha
  ON versiones_ficha_medica (ficha_medica_id);

CREATE INDEX idx_cambios_seccion_ficha_seccion
  ON cambios_seccion_ficha (seccion_ficha_id);

CREATE INDEX idx_cambios_seccion_ficha_ejecucion
  ON cambios_seccion_ficha (ejecucion_agente_id);

CREATE INDEX idx_evidencias_seccion_ficha_seccion
  ON evidencias_seccion_ficha (seccion_ficha_id);

CREATE INDEX idx_evidencias_seccion_ficha_segmento
  ON evidencias_seccion_ficha (segmento_transcripcion_id);

CREATE INDEX idx_eventos_consulta_consulta
  ON eventos_consulta (consulta_id);

CREATE INDEX idx_eventos_consulta_tipo_evento
  ON eventos_consulta (tipo_evento);

CREATE INDEX idx_eventos_consulta_creado_en
  ON eventos_consulta (creado_en);

-- =========================================================
-- FUNCION Y TRIGGERS PARA actualizado_en
-- =========================================================

CREATE OR REPLACE FUNCTION fn_set_actualizado_en()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_usuarios_set_actualizado_en
BEFORE UPDATE ON usuarios
FOR EACH ROW
EXECUTE FUNCTION fn_set_actualizado_en();

CREATE TRIGGER trg_sesiones_usuario_set_actualizado_en
BEFORE UPDATE ON sesiones_usuario
FOR EACH ROW
EXECUTE FUNCTION fn_set_actualizado_en();

CREATE TRIGGER trg_catalogo_especialidades_set_actualizado_en
BEFORE UPDATE ON catalogo_especialidades
FOR EACH ROW
EXECUTE FUNCTION fn_set_actualizado_en();

CREATE TRIGGER trg_perfiles_usuario_set_actualizado_en
BEFORE UPDATE ON perfiles_usuario
FOR EACH ROW
EXECUTE FUNCTION fn_set_actualizado_en();

CREATE TRIGGER trg_plantillas_anamnesis_set_actualizado_en
BEFORE UPDATE ON plantillas_anamnesis
FOR EACH ROW
EXECUTE FUNCTION fn_set_actualizado_en();

CREATE TRIGGER trg_pacientes_set_actualizado_en
BEFORE UPDATE ON pacientes
FOR EACH ROW
EXECUTE FUNCTION fn_set_actualizado_en();

CREATE TRIGGER trg_consultas_set_actualizado_en
BEFORE UPDATE ON consultas
FOR EACH ROW
EXECUTE FUNCTION fn_set_actualizado_en();

CREATE TRIGGER trg_audios_temporales_consulta_set_actualizado_en
BEFORE UPDATE ON audios_temporales_consulta
FOR EACH ROW
EXECUTE FUNCTION fn_set_actualizado_en();

CREATE TRIGGER trg_segmentos_transcripcion_set_actualizado_en
BEFORE UPDATE ON segmentos_transcripcion
FOR EACH ROW
EXECUTE FUNCTION fn_set_actualizado_en();

CREATE TRIGGER trg_plantillas_agente_set_actualizado_en
BEFORE UPDATE ON plantillas_agente
FOR EACH ROW
EXECUTE FUNCTION fn_set_actualizado_en();

CREATE TRIGGER trg_agentes_doctor_set_actualizado_en
BEFORE UPDATE ON agentes_doctor
FOR EACH ROW
EXECUTE FUNCTION fn_set_actualizado_en();

CREATE TRIGGER trg_fichas_medicas_set_actualizado_en
BEFORE UPDATE ON fichas_medicas
FOR EACH ROW
EXECUTE FUNCTION fn_set_actualizado_en();

CREATE TRIGGER trg_secciones_ficha_medica_set_actualizado_en
BEFORE UPDATE ON secciones_ficha_medica
FOR EACH ROW
EXECUTE FUNCTION fn_set_actualizado_en();

-- =========================================================
-- FUNCION Y TRIGGER PARA pacientes.ultima_visita
-- =========================================================

CREATE OR REPLACE FUNCTION fn_recalcular_ultima_visita_paciente()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_paciente_id uuid;
BEGIN
  v_paciente_id := COALESCE(NEW.paciente_id, OLD.paciente_id);

  UPDATE pacientes
  SET ultima_visita = (
        SELECT MAX(COALESCE(c.fin_real, c.fecha_hora_consulta))
        FROM consultas c
        WHERE c.paciente_id = v_paciente_id
          AND c.estado = 'finalizada'
      ),
      actualizado_en = now()
  WHERE id = v_paciente_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_consultas_recalcular_ultima_visita
AFTER INSERT OR UPDATE OR DELETE ON consultas
FOR EACH ROW
EXECUTE FUNCTION fn_recalcular_ultima_visita_paciente();

-- =========================================================
-- FUNCION AUXILIAR PARA MARCAR AUDIOS VENCIDOS
-- =========================================================
-- Esta funcion no elimina archivos fisicos.
-- Solo marca en BD los audios vencidos para que un worker externo los borre.

CREATE OR REPLACE FUNCTION fn_marcar_audios_vencidos_para_borrado()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_afectados integer;
BEGIN
  UPDATE audios_temporales_consulta
  SET estado = 'marcado_para_borrado',
      actualizado_en = now()
  WHERE estado IN ('pendiente_procesamiento', 'disponible')
    AND expira_en <= now();

  GET DIAGNOSTICS v_afectados = ROW_COUNT;
  RETURN v_afectados;
END;
$$;

COMMENT ON FUNCTION fn_marcar_audios_vencidos_para_borrado() IS
'Marca en BD los audios vencidos para que un worker externo elimine el archivo real.';

-- =========================================================
-- FUNCION AUXILIAR PARA REVOCAR SESIONES DE UN USUARIO
-- =========================================================

CREATE OR REPLACE FUNCTION fn_revocar_sesiones_usuario(p_usuario_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_afectados integer;
BEGIN
  UPDATE sesiones_usuario
  SET revocada_en = now(),
      actualizado_en = now()
  WHERE usuario_id = p_usuario_id
    AND revocada_en IS NULL
    AND expira_en > now();

  GET DIAGNOSTICS v_afectados = ROW_COUNT;
  RETURN v_afectados;
END;
$$;

COMMENT ON FUNCTION fn_revocar_sesiones_usuario(uuid) IS
'Revoca todas las sesiones activas de un usuario. Util al bloquear cuenta o forzar cierre global de sesion.';

-- =========================================================
-- DATOS INICIALES - CATALOGO DE ESPECIALIDADES
-- =========================================================

INSERT INTO catalogo_especialidades (nombre_especialidad, activa, es_administrativa) VALUES
('Administracion del sistema', true, true),
('Medicina general', true, false),
('Neurologia', true, false),
('Pediatria', true, false),
('Cardiologia', true, false),
('Medicina interna', true, false),
('Ginecologia', true, false),
('Psiquiatria', true, false),
('Traumatologia', true, false),
('Dermatologia', true, false),
('Endocrinologia', true, false),
('Otorrinolaringologia', true, false),
('Oftalmologia', true, false),
('Urologia', true, false),
('Gastroenterologia', true, false),
('Neumologia', true, false);

-- =========================================================
-- DATOS INICIALES - PLANTILLAS DE ANAMNESIS FASE 1
-- =========================================================
-- Todas las especialidades clinicas parten con la misma estructura.
-- Mas adelante se crea una nueva version por especialidad si cambian campos,
-- orden, obligatoriedad o instrucciones de extraccion.

INSERT INTO plantillas_anamnesis (
  especialidad_id,
  nombre_plantilla,
  numero_version,
  descripcion,
  es_activa
)
SELECT
  id,
  'Anamnesis base - ' || nombre_especialidad,
  1,
  'Plantilla inicial de anamnesis para primera consulta. Misma estructura base en fase 1.',
  true
FROM catalogo_especialidades
WHERE activa = true
  AND es_administrativa = false;

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
WHERE p.es_activa = true;

-- =========================================================
-- EJEMPLO OPCIONAL: CREAR ADMIN MANUALMENTE
-- =========================================================
-- IMPORTANTE:
-- hash_contrasena debe venir ya hasheado desde tu backend (argon2id o bcrypt).
-- Este insert es solo un ejemplo de estructura, NO lo ejecutes con un hash falso.

-- INSERT INTO usuarios (correo_electronico, hash_contrasena, estado_cuenta)
-- VALUES ('admin@medivoz.com', 'HASH_GENERADO_EN_BACKEND', 'activa');

-- INSERT INTO perfiles_usuario (usuario_id, nombre_completo, especialidad_id)
-- SELECT u.id, 'Administrador Medivoz', c.id
-- FROM usuarios u
-- CROSS JOIN catalogo_especialidades c
-- WHERE u.correo_electronico = 'admin@medivoz.com'
--   AND c.nombre_especialidad = 'Administracion del sistema';

-- INSERT INTO roles_usuario (usuario_id, rol)
-- SELECT id, 'administrador'::rol_aplicacion
-- FROM usuarios
-- WHERE correo_electronico = 'admin@medivoz.com';

-- =========================================================
-- EJEMPLO OPCIONAL: CREAR UNA SESION MANUALMENTE
-- =========================================================
-- IMPORTANTE:
-- refresh_token_hash debe venir calculado desde tu backend.
-- No guardes el refresh token plano.

-- INSERT INTO sesiones_usuario (
--   usuario_id,
--   refresh_token_hash,
--   ip_origen,
--   agente_usuario,
--   nombre_dispositivo,
--   expira_en
-- )
-- SELECT
--   u.id,
--   'HASH_DEL_REFRESH_TOKEN',
--   '127.0.0.1',
--   'Mozilla/5.0',
--   'Chrome Windows',
--   now() + interval '30 days'
-- FROM usuarios u
-- WHERE u.correo_electronico = 'admin@medivoz.com';
