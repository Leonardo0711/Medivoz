import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { profiles, specialities } from "../../db/schema/auth.js";
import { anamnesisTemplateSections, anamnesisTemplates, consultations, patients, temporalAudios } from "../../db/schema/clinical.js";
import { medicalRecords, medicalRecordSections } from "../../db/schema/scribe.js";
import { logger } from "../../core/utils/logger.js";
import { audioTemporalService } from "../scribe/audio-temporal.service.js";

const buildConsultationCode = () => {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `MED-${Date.now().toString(36).toUpperCase()}-${random}`.slice(0, 40);
};

const normalizeQueryText = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const buildPatientCode = () => {
  const random = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `PAC-${random}`.slice(0, 40);
};

const availableTemplateSpecialities = [
  "Hematologia",
  "Neurologia",
  "Psiquiatria",
  "Reumatologia",
  "Endocrinologia",
] as const;

export class ClinicalService {
  private async getAvailableAnamnesisTemplate(templateId: string) {
    const [template] = await db
      .select({
        id: anamnesisTemplates.id,
        especialidadId: anamnesisTemplates.especialidadId,
        especialidad: specialities.nombre,
        nombre: anamnesisTemplates.nombrePlantilla,
        descripcion: anamnesisTemplates.descripcion,
        numeroVersion: anamnesisTemplates.numeroVersion,
      })
      .from(anamnesisTemplates)
      .innerJoin(specialities, eq(anamnesisTemplates.especialidadId, specialities.id))
      .where(
        and(
          eq(anamnesisTemplates.id, templateId),
          eq(anamnesisTemplates.esActiva, true),
          eq(specialities.activa, true),
          inArray(specialities.nombre, [...availableTemplateSpecialities])
        )
      )
      .limit(1);

    if (!template) throw new Error("La ficha seleccionada no esta disponible");
    return template;
  }

  async listAnamnesisTemplates(doctorId: string) {
    const profile = await db.query.profiles.findFirst({
      columns: {
        especialidadId: true,
        plantillaAnamnesisPredeterminadaId: true,
      },
      where: eq(profiles.userId, doctorId),
    });

    if (!profile) throw new Error("Perfil de doctor no encontrado");

    const templateRows = await db
      .select({
        id: anamnesisTemplates.id,
        especialidadId: anamnesisTemplates.especialidadId,
        especialidad: specialities.nombre,
        nombre: anamnesisTemplates.nombrePlantilla,
        descripcion: anamnesisTemplates.descripcion,
        numeroVersion: anamnesisTemplates.numeroVersion,
      })
      .from(anamnesisTemplates)
      .innerJoin(specialities, eq(anamnesisTemplates.especialidadId, specialities.id))
      .where(
        and(
          eq(anamnesisTemplates.esActiva, true),
          eq(specialities.activa, true),
          inArray(specialities.nombre, [...availableTemplateSpecialities])
        )
      )
      .orderBy(asc(specialities.nombre));

    const sectionRows = templateRows.length
      ? await db
          .select({
            plantillaId: anamnesisTemplateSections.plantillaAnamnesisId,
            seccion: anamnesisTemplateSections.seccion,
            etiqueta: anamnesisTemplateSections.etiquetaVisible,
            descripcionIa: anamnesisTemplateSections.descripcionIa,
            orden: anamnesisTemplateSections.orden,
            esObligatoria: anamnesisTemplateSections.esObligatoria,
          })
          .from(anamnesisTemplateSections)
          .where(
            and(
              inArray(anamnesisTemplateSections.plantillaAnamnesisId, templateRows.map((row) => row.id)),
              eq(anamnesisTemplateSections.activa, true)
            )
          )
          .orderBy(asc(anamnesisTemplateSections.orden))
      : [];

    const sectionsByTemplate = new Map<string, typeof sectionRows>();
    for (const section of sectionRows) {
      const current = sectionsByTemplate.get(section.plantillaId) || [];
      current.push(section);
      sectionsByTemplate.set(section.plantillaId, current);
    }

    const fallbackDefaultId = templateRows.find(
      (template) => template.especialidadId === profile.especialidadId
    )?.id ?? null;
    const defaultId = templateRows.some(
      (template) => template.id === profile.plantillaAnamnesisPredeterminadaId
    )
      ? profile.plantillaAnamnesisPredeterminadaId
      : fallbackDefaultId;

    return templateRows.map((template) => ({
      ...template,
      esPredeterminada: template.id === defaultId,
      secciones: sectionsByTemplate.get(template.id) || [],
    }));
  }

  async setDefaultAnamnesisTemplate(doctorId: string, templateId: string) {
    const template = await this.getAvailableAnamnesisTemplate(templateId);
    const [profile] = await db
      .update(profiles)
      .set({
        plantillaAnamnesisPredeterminadaId: template.id,
        updatedAt: new Date(),
      })
      .where(eq(profiles.userId, doctorId))
      .returning({ userId: profiles.userId });

    if (!profile) throw new Error("Perfil de doctor no encontrado");
    return { plantillaAnamnesisId: template.id };
  }

  async listPatients(doctorId: string, query?: unknown) {
    const trimmedQuery = normalizeQueryText(query);
    const conditions = [eq(patients.doctorId, doctorId)];
    const outerPatientId = sql.raw('"pacientes"."id"');

    if (trimmedQuery) {
      conditions.push(
        or(
          ilike(patients.nombre, `%${trimmedQuery}%`),
          ilike(patients.dni, `%${trimmedQuery}%`),
          ilike(patients.codigoPaciente, `%${trimmedQuery}%`)
        )!
      );
    }

    const rows = await db
      .select({
        id: patients.id,
        doctorId: patients.doctorId,
        codigoPaciente: patients.codigoPaciente,
        nombre: patients.nombre,
        dni: patients.dni,
        edad: patients.edad,
        ocupacion: patients.ocupacion,
        procedencia: patients.procedencia,
        diagnostico: patients.diagnostico,
        ultimaVisita: patients.ultimaVisita,
        createdAt: patients.createdAt,
        updatedAt: patients.updatedAt,
        consultasPendientesValidacion: sql<number>`coalesce((
          select case when
            (
              nullif(btrim(ficha_pendiente.resumen_actual), '') is not null
              or nullif(btrim(ficha_pendiente.resumen_sugerido_ia), '') is not null
              or nullif(btrim(ficha_pendiente.nota_essi), '') is not null
              or exists (
                select 1 from ${medicalRecordSections} seccion_con_datos
                where seccion_con_datos.ficha_medica_id = ficha_pendiente.id
                  and (
                    nullif(btrim(seccion_con_datos.texto_actual), '') is not null
                    or nullif(btrim(seccion_con_datos.texto_sugerido_ia), '') is not null
                  )
              )
            )
            and (
              nullif(btrim(ficha_pendiente.resumen_actual), '') is null
              or nullif(btrim(ficha_pendiente.nota_essi), '') is null
              or exists (
                select 1 from ${medicalRecordSections} seccion_pendiente
                where seccion_pendiente.ficha_medica_id = ficha_pendiente.id
                  and seccion_pendiente.estado = 'borrador_ia'
              )
            )
            then 1 else 0 end
          from ${consultations} consulta_pendiente
          join ${medicalRecords} ficha_pendiente
            on ficha_pendiente.consulta_id = consulta_pendiente.id
          where consulta_pendiente.paciente_id = ${outerPatientId}
            and consulta_pendiente.doctor_id = ${doctorId}
          order by consulta_pendiente.creado_en desc, consulta_pendiente.id desc
          limit 1
        ), 0)`,
        seccionesPendientesIa: sql<number>`(
          select count(*)
          from ${consultations} consulta_seccion
          join ${medicalRecords} ficha_seccion on ficha_seccion.consulta_id = consulta_seccion.id
          join ${medicalRecordSections} seccion_pendiente on seccion_pendiente.ficha_medica_id = ficha_seccion.id
          where consulta_seccion.paciente_id = ${outerPatientId}
            and consulta_seccion.doctor_id = ${doctorId}
            and seccion_pendiente.estado = 'borrador_ia'
            and consulta_seccion.id = (
              select consulta_vigente.id
              from ${consultations} consulta_vigente
              where consulta_vigente.paciente_id = ${outerPatientId}
                and consulta_vigente.doctor_id = ${doctorId}
              order by consulta_vigente.creado_en desc, consulta_vigente.id desc
              limit 1
            )
        )`,
        resumenesPendientes: sql<number>`(
          select count(*)
          from ${consultations} consulta_resumen
          join ${medicalRecords} ficha_resumen on ficha_resumen.consulta_id = consulta_resumen.id
          where consulta_resumen.paciente_id = ${outerPatientId}
            and consulta_resumen.doctor_id = ${doctorId}
            and consulta_resumen.id = (
              select consulta_vigente.id
              from ${consultations} consulta_vigente
              where consulta_vigente.paciente_id = ${outerPatientId}
                and consulta_vigente.doctor_id = ${doctorId}
              order by consulta_vigente.creado_en desc, consulta_vigente.id desc
              limit 1
            )
            and nullif(btrim(ficha_resumen.resumen_actual), '') is null
            and exists (
              select 1 from ${medicalRecordSections} seccion_resumen
              where seccion_resumen.ficha_medica_id = ficha_resumen.id
                and (
                  nullif(btrim(seccion_resumen.texto_actual), '') is not null
                  or nullif(btrim(seccion_resumen.texto_sugerido_ia), '') is not null
                )
            )
        )`,
        notasEssiPendientes: sql<number>`(
          select count(*)
          from ${consultations} consulta_essi
          join ${medicalRecords} ficha_essi on ficha_essi.consulta_id = consulta_essi.id
          where consulta_essi.paciente_id = ${outerPatientId}
            and consulta_essi.doctor_id = ${doctorId}
            and consulta_essi.id = (
              select consulta_vigente.id
              from ${consultations} consulta_vigente
              where consulta_vigente.paciente_id = ${outerPatientId}
                and consulta_vigente.doctor_id = ${doctorId}
              order by consulta_vigente.creado_en desc, consulta_vigente.id desc
              limit 1
            )
            and nullif(btrim(ficha_essi.resumen_actual), '') is not null
            and nullif(btrim(ficha_essi.nota_essi), '') is null
        )`,
      })
      .from(patients)
      .where(and(...conditions))
      .orderBy(desc(patients.createdAt));

    return rows.map((row) => ({
      ...row,
      consultasPendientesValidacion: Number(row.consultasPendientesValidacion || 0),
      seccionesPendientesIa: Number(row.seccionesPendientesIa || 0),
      resumenesPendientes: Number(row.resumenesPendientes || 0),
      notasEssiPendientes: Number(row.notasEssiPendientes || 0),
    }));
  }

  async getPatientById(id: string, doctorId: string) {
    const patient = await db.query.patients.findFirst({
      where: and(eq(patients.id, id), eq(patients.doctorId, doctorId)),
    });

    if (!patient) throw new Error("Paciente no encontrado");
    return patient;
  }

  async createPatient(doctorId: string, data: any) {
    const dni = normalizeQueryText(data.dni) || null;

    const [newPatient] = await db
      .insert(patients)
      .values({
        doctorId,
        codigoPaciente: buildPatientCode(),
        nombre: data.nombre,
        dni,
        edad: data.edad ?? null,
      })
      .returning();

    return newPatient;
  }

  async updatePatient(id: string, doctorId: string, data: any) {
    const updateValues: any = {
      updatedAt: new Date(),
    };

    if (data.nombre !== undefined) updateValues.nombre = data.nombre;
    if (data.dni !== undefined) updateValues.dni = normalizeQueryText(data.dni) || null;
    if (data.edad !== undefined) updateValues.edad = data.edad;

    const [updated] = await db
      .update(patients)
      .set(updateValues)
      .where(and(eq(patients.id, id), eq(patients.doctorId, doctorId)))
      .returning();

    if (!updated) throw new Error("Paciente no encontrado o no autorizado");
    return updated;
  }

  async deletePatient(id: string, doctorId: string) {
    const patient = await db.query.patients.findFirst({
      where: and(eq(patients.id, id), eq(patients.doctorId, doctorId)),
    });
    if (!patient) throw new Error("Paciente no encontrado o no autorizado");

    const audioRows = await db
      .select({ rutaArchivo: temporalAudios.rutaArchivo })
      .from(temporalAudios)
      .innerJoin(consultations, eq(temporalAudios.consultaId, consultations.id))
      .where(eq(consultations.pacienteId, patient.id));

    const deleted = await db.transaction(async (tx) => {
      await tx.delete(consultations).where(eq(consultations.pacienteId, patient.id));
      const [deletedPatient] = await tx
        .delete(patients)
        .where(and(eq(patients.id, patient.id), eq(patients.doctorId, doctorId)))
        .returning();
      if (!deletedPatient) throw new Error("Paciente no encontrado o no autorizado");
      return deletedPatient;
    });

    const cleanupResults = await Promise.allSettled(
      audioRows.map(({ rutaArchivo }) => audioTemporalService.deletePhysicalFile(rutaArchivo))
    );
    const failedAudioCleanup = cleanupResults.filter((result) => result.status === "rejected").length;
    logger.info("[clinical] patient:deleted", {
      patientId: patient.id,
      doctorId,
      audioFiles: audioRows.length,
      failedAudioCleanup,
    });
    if (failedAudioCleanup > 0) {
      logger.warn("[clinical] patient:audio-cleanup-incomplete", {
        patientId: patient.id,
        failedAudioCleanup,
      });
    }
    return deleted;
  }

  async listConsultations(doctorId: string, pacienteId?: unknown) {
    const conditions = [eq(consultations.doctorId, doctorId)];
    const safePacienteId = normalizeQueryText(pacienteId);
    const outerMedicalRecordId = sql.raw('"fichas_medicas"."id"');
    if (safePacienteId) conditions.push(eq(consultations.pacienteId, safePacienteId));

    const rows = await db
      .select({
        id: consultations.id,
        doctorId: consultations.doctorId,
        pacienteId: consultations.pacienteId,
        plantillaAnamnesisId: consultations.plantillaAnamnesisId,
        codigoSesion: consultations.codigoSesion,
        tipoConsulta: consultations.tipoConsulta,
        estado: consultations.estado,
        fecha: consultations.fecha,
        inicioReal: consultations.inicioReal,
        finReal: consultations.finReal,
        transcripcion: consultations.transcripcion,
        versionTranscripcion: consultations.versionTranscripcion,
        estadoAnamnesis: consultations.estadoAnamnesis,
        segmentoInicioAnamnesis: consultations.segmentoInicioAnamnesis,
        segmentoFinAnamnesis: consultations.segmentoFinAnamnesis,
        confianzaCierreAnamnesis: consultations.confianzaCierreAnamnesis,
        motivoCierreAnamnesis: consultations.motivoCierreAnamnesis,
        anamnesisDetectadaEn: consultations.anamnesisDetectadaEn,
        createdAt: consultations.createdAt,
        updatedAt: consultations.updatedAt,
        fichaId: medicalRecords.id,
        resumenActual: medicalRecords.resumenActual,
        resumenSugeridoIa: medicalRecords.resumenSugeridoIa,
        notaEssi: medicalRecords.notaEssi,
        seccionesConDatos: sql<number>`(
          select count(*) from ${medicalRecordSections} seccion_con_datos
          where seccion_con_datos.ficha_medica_id = ${outerMedicalRecordId}
            and (
              nullif(btrim(seccion_con_datos.texto_actual), '') is not null
              or nullif(btrim(seccion_con_datos.texto_sugerido_ia), '') is not null
            )
        )`,
        seccionesPendientesIa: sql<number>`(
          select count(*) from ${medicalRecordSections} seccion_pendiente
          where seccion_pendiente.ficha_medica_id = ${outerMedicalRecordId}
            and seccion_pendiente.estado = 'borrador_ia'
        )`,
      })
      .from(consultations)
      .leftJoin(medicalRecords, eq(medicalRecords.consultaId, consultations.id))
      .where(
        and(
          ...conditions,
          sql`not exists (
            select 1
            from ${consultations} consulta_mas_reciente
            where consulta_mas_reciente.paciente_id = "consultas"."paciente_id"
              and consulta_mas_reciente.doctor_id = "consultas"."doctor_id"
              and (
                consulta_mas_reciente.creado_en > "consultas"."creado_en"
                or (
                  consulta_mas_reciente.creado_en = "consultas"."creado_en"
                  and consulta_mas_reciente.id > "consultas"."id"
                )
              )
          )`
        )
      )
      .orderBy(desc(consultations.fecha));

    return rows.map(({ fichaId, resumenActual, resumenSugeridoIa, notaEssi, ...row }) => {
      const seccionesConDatos = Number(row.seccionesConDatos || 0);
      const seccionesPendientesIa = Number(row.seccionesPendientesIa || 0);
      const tieneResumen = Boolean(resumenActual?.trim());
      const tieneNotaEssi = Boolean(notaEssi?.trim());
      const tieneDatosFicha = Boolean(
        fichaId &&
          (seccionesConDatos > 0 || resumenActual?.trim() || resumenSugeridoIa?.trim() || notaEssi?.trim())
      );
      const motivosPendientes: string[] = [];

      if (tieneDatosFicha && seccionesPendientesIa > 0) {
        motivosPendientes.push(
          `${seccionesPendientesIa} ${seccionesPendientesIa === 1 ? "sección IA" : "secciones IA"} sin validar`
        );
      }
      if (tieneDatosFicha && !tieneResumen) motivosPendientes.push("Falta confirmar el resumen Medivoz");
      if (tieneDatosFicha && !tieneNotaEssi) motivosPendientes.push("Falta pegar la nota ESSI");

      return {
        ...row,
        seccionesConDatos,
        seccionesPendientesIa,
        requiereValidacion: motivosPendientes.length > 0,
        motivosPendientes,
      };
    });
  }

  async getConsultationById(id: string, doctorId: string) {
    const consultation = await db.query.consultations.findFirst({
      where: and(eq(consultations.id, id), eq(consultations.doctorId, doctorId)),
    });

    if (!consultation) throw new Error("Consulta no encontrada");
    return consultation;
  }

  async createConsultation(doctorId: string, data: any) {
    await this.getPatientById(data.pacienteId, doctorId);
    const plantillaAnamnesisId = data.plantillaAnamnesisId
      ? (await this.getAvailableAnamnesisTemplate(data.plantillaAnamnesisId)).id
      : await this.getDefaultAnamnesisTemplateId(doctorId);

    return db.transaction(async (tx) => {
      const lockKey = `${doctorId}:${data.pacienteId}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

      const [existingConsultation] = await tx
        .select()
        .from(consultations)
        .where(and(eq(consultations.doctorId, doctorId), eq(consultations.pacienteId, data.pacienteId)))
        .orderBy(desc(consultations.createdAt), desc(consultations.id))
        .limit(1);

      if (existingConsultation) {
        logger.info("[clinical] consultation:reused", {
          consultationId: existingConsultation.id,
          patientId: data.pacienteId,
          doctorId,
        });
        return { ...existingConsultation, reutilizada: true };
      }

      const [newConsultation] = await tx
        .insert(consultations)
        .values({
          doctorId,
          pacienteId: data.pacienteId,
          plantillaAnamnesisId,
          codigoSesion: buildConsultationCode(),
          tipoConsulta: data.tipoConsulta ?? "primera_consulta",
          estado: data.estado ?? "en_espera",
          fecha: data.fecha ? new Date(data.fecha) : new Date(),
        })
        .returning();

      logger.info("[clinical] consultation:created", {
        consultationId: newConsultation.id,
        patientId: data.pacienteId,
        doctorId,
      });
      return { ...newConsultation, reutilizada: false };
    });
  }

  async updateConsultation(id: string, doctorId: string, data: any) {
    const updateValues: any = {
      updatedAt: new Date(),
    };

    if (data.estado !== undefined) updateValues.estado = data.estado;
    if (data.plantillaAnamnesisId !== undefined) {
      const currentConsultation = await db.query.consultations.findFirst({
        columns: {
          plantillaAnamnesisId: true,
          transcripcion: true,
          estadoAnamnesis: true,
        },
        where: and(eq(consultations.id, id), eq(consultations.doctorId, doctorId)),
      });
      if (!currentConsultation) throw new Error("Consulta no encontrada o no autorizada");

      const nextTemplateId = data.plantillaAnamnesisId
        ? (await this.getAvailableAnamnesisTemplate(data.plantillaAnamnesisId)).id
        : null;
      const templateChanged = currentConsultation.plantillaAnamnesisId !== nextTemplateId;

      if (templateChanged) {
        const existingRecord = await db.query.medicalRecords.findFirst({
          columns: { id: true },
          where: eq(medicalRecords.consultaId, id),
        });
        if (
          existingRecord ||
          currentConsultation.transcripcion?.trim() ||
          currentConsultation.estadoAnamnesis !== "no_iniciada"
        ) {
          throw new Error("La ficha no puede cambiarse despues de iniciar la documentacion");
        }
      }

      updateValues.plantillaAnamnesisId = nextTemplateId;
    }
    if (data.tipoConsulta !== undefined) updateValues.tipoConsulta = data.tipoConsulta;
    if (data.fecha !== undefined) updateValues.fecha = data.fecha ? new Date(data.fecha) : null;
    if (data.inicioReal !== undefined) {
      updateValues.inicioReal = data.inicioReal ? new Date(data.inicioReal) : null;
    }
    if (data.finReal !== undefined) {
      updateValues.finReal = data.finReal ? new Date(data.finReal) : null;
    }
    if (data.transcripcionCompleta !== undefined) {
      updateValues.transcripcion = data.transcripcionCompleta;
    }

    const [updated] = await db
      .update(consultations)
      .set(updateValues)
      .where(and(eq(consultations.id, id), eq(consultations.doctorId, doctorId)))
      .returning();

    if (!updated) throw new Error("Consulta no encontrada o no autorizada");

    if (data.estado === "finalizada") {
      await db
        .update(patients)
        .set({ ultimaVisita: new Date() })
        .where(eq(patients.id, updated.pacienteId));
    }

    return updated;
  }

  async getDefaultAnamnesisTemplateId(doctorId: string) {
    const profile = await db.query.profiles.findFirst({
      columns: {
        especialidadId: true,
        plantillaAnamnesisPredeterminadaId: true,
      },
      where: eq(profiles.userId, doctorId),
    });

    if (!profile?.especialidadId) return null;

    if (profile.plantillaAnamnesisPredeterminadaId) {
      try {
        return (await this.getAvailableAnamnesisTemplate(profile.plantillaAnamnesisPredeterminadaId)).id;
      } catch {
        // Fall back to the registered speciality if an old preference is no longer active.
      }
    }

    const template = await db.query.anamnesisTemplates.findFirst({
      columns: { id: true },
      where: and(
        eq(anamnesisTemplates.especialidadId, profile.especialidadId),
        eq(anamnesisTemplates.esActiva, true)
      ),
      orderBy: [desc(anamnesisTemplates.numeroVersion)],
    });

    return template?.id ?? null;
  }
}

export const clinicalService = new ClinicalService();
