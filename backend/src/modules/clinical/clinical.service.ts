import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { consultations, patients } from "../../db/schema/clinical.js";

const buildConsultationCode = () => {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `MED-${Date.now().toString(36).toUpperCase()}-${random}`.slice(0, 40);
};

const normalizeQueryText = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

export class ClinicalService {
  async listPatients(doctorId: string, query?: unknown) {
    const trimmedQuery = normalizeQueryText(query);
    const conditions = [eq(patients.doctorId, doctorId)];

    if (trimmedQuery) {
      conditions.push(
        or(
          ilike(patients.nombre, `%${trimmedQuery}%`),
          ilike(patients.dni, `%${trimmedQuery}%`)
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
    const dni = data.dni ?? data.identificacion;
    if (!dni) throw new Error("El DNI del paciente es obligatorio");

    const [newPatient] = await db
      .insert(patients)
      .values({
        doctorId,
        nombre: data.nombre,
        dni,
        edad: data.edad ?? null,
        ocupacion: data.ocupacion ?? data.metadata?.ocupacion ?? null,
        procedencia: data.procedencia ?? data.metadata?.procedencia ?? null,
        diagnostico: data.diagnostico ?? data.metadata?.diagnostico ?? null,
      })
      .returning();

    return newPatient;
  }

  async updatePatient(id: string, doctorId: string, data: any) {
    const updateValues: any = {
      updatedAt: new Date(),
    };

    if (data.nombre !== undefined) updateValues.nombre = data.nombre;
    if (data.dni !== undefined || data.identificacion !== undefined) {
      updateValues.dni = data.dni ?? data.identificacion;
    }
    if (data.edad !== undefined) updateValues.edad = data.edad;
    if (data.ocupacion !== undefined || data.metadata?.ocupacion !== undefined) {
      updateValues.ocupacion = data.ocupacion ?? data.metadata?.ocupacion ?? null;
    }
    if (data.procedencia !== undefined || data.metadata?.procedencia !== undefined) {
      updateValues.procedencia = data.procedencia ?? data.metadata?.procedencia ?? null;
    }
    if (data.diagnostico !== undefined || data.metadata?.diagnostico !== undefined) {
      updateValues.diagnostico = data.diagnostico ?? data.metadata?.diagnostico ?? null;
    }

    const [updated] = await db
      .update(patients)
      .set(updateValues)
      .where(and(eq(patients.id, id), eq(patients.doctorId, doctorId)))
      .returning();

    if (!updated) throw new Error("Paciente no encontrado o no autorizado");
    return updated;
  }

  async deletePatient(id: string, doctorId: string) {
    const [deleted] = await db
      .delete(patients)
      .where(and(eq(patients.id, id), eq(patients.doctorId, doctorId)))
      .returning();

    if (!deleted) throw new Error("Paciente no encontrado o no autorizado");
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

    const [newConsultation] = await db
      .insert(consultations)
      .values({
        doctorId,
        pacienteId: data.pacienteId,
        codigoSesion: buildConsultationCode(),
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
}

export const clinicalService = new ClinicalService();
