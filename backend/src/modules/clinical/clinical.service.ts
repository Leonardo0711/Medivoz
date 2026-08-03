import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { profiles } from "../../db/schema/auth.js";
import { anamnesisTemplates, consultations, patients, temporalAudios } from "../../db/schema/clinical.js";
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

export class ClinicalService {
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
        consultasPendientesValidacion: sql<number>`(
          select count(*)
          from ${consultations} consulta_pendiente
          join ${medicalRecords} ficha_pendiente
            on ficha_pendiente.consulta_id = consulta_pendiente.id
          where consulta_pendiente.paciente_id = ${outerPatientId}
            and consulta_pendiente.doctor_id = ${doctorId}
            and (
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
        )`,
        seccionesPendientesIa: sql<number>`(
          select count(*)
          from ${consultations} consulta_seccion
          join ${medicalRecords} ficha_seccion on ficha_seccion.consulta_id = consulta_seccion.id
          join ${medicalRecordSections} seccion_pendiente on seccion_pendiente.ficha_medica_id = ficha_seccion.id
          where consulta_seccion.paciente_id = ${outerPatientId}
            and consulta_seccion.doctor_id = ${doctorId}
            and seccion_pendiente.estado = 'borrador_ia'
        )`,
        resumenesPendientes: sql<number>`(
          select count(*)
          from ${consultations} consulta_resumen
          join ${medicalRecords} ficha_resumen on ficha_resumen.consulta_id = consulta_resumen.id
          where consulta_resumen.paciente_id = ${outerPatientId}
            and consulta_resumen.doctor_id = ${doctorId}
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
      .where(and(...conditions))
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
    const plantillaAnamnesisId =
      data.plantillaAnamnesisId ?? (await this.getDefaultAnamnesisTemplateId(doctorId));

    const [newConsultation] = await db
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

    return {
      ...newConsultation,
      codigoSesion: newConsultation.codigoSesion,
    };
  }

  async updateConsultation(id: string, doctorId: string, data: any) {
    const updateValues: any = {
      updatedAt: new Date(),
    };

    if (data.estado !== undefined) updateValues.estado = data.estado;
    if (data.plantillaAnamnesisId !== undefined) {
      updateValues.plantillaAnamnesisId = data.plantillaAnamnesisId || null;
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
      columns: { especialidadId: true },
      where: eq(profiles.userId, doctorId),
    });

    if (!profile?.especialidadId) return null;

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
