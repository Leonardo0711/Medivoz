import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { profiles } from "../../db/schema/auth.js";
import { anamnesisTemplates, consultations, patients, temporalAudios } from "../../db/schema/clinical.js";
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

    if (trimmedQuery) {
      conditions.push(
        or(
          ilike(patients.nombre, `%${trimmedQuery}%`),
          ilike(patients.dni, `%${trimmedQuery}%`),
          ilike(patients.codigoPaciente, `%${trimmedQuery}%`)
        )!
      );
    }

    return await db.query.patients.findMany({
      where: and(...conditions),
      orderBy: [desc(patients.createdAt)],
    });
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
    if (safePacienteId) conditions.push(eq(consultations.pacienteId, safePacienteId));

    return await db.query.consultations.findMany({
      where: and(...conditions),
      orderBy: [desc(consultations.fecha)],
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
