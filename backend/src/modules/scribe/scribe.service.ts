import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { consultations } from "../../db/schema/clinical.js";
import { medicalRecords, medicalRecordSections } from "../../db/schema/scribe.js";

export class ScribeService {
  async getOrCreateRecord(consultaId: string, _data?: { pacienteId?: string; doctorId?: string }) {
    let [record] = await db
      .select()
      .from(medicalRecords)
      .where(eq(medicalRecords.consultaId, consultaId))
      .limit(1);

    if (!record) {
      [record] = await db
        .insert(medicalRecords)
        .values({
          consultaId,
        })
        .returning();
    }

    return record;
  }

  async getRecordByConsultationForDoctor(consultaId: string, doctorId: string) {
    const consultation = await db.query.consultations.findFirst({
      where: and(eq(consultations.id, consultaId), eq(consultations.doctorId, doctorId)),
    });

    if (!consultation) return null;
    return this.getRecordContent(consultaId);
  }

  async updateSection(
    fichaId: string,
    nombre: any,
    contenido: string,
    origen: any = "doctor",
    userId?: string
  ) {
    const [existing] = await db
      .select()
      .from(medicalRecordSections)
      .where(
        and(
          eq(medicalRecordSections.fichaId, fichaId),
          eq(medicalRecordSections.nombre, nombre)
        )
      )
      .limit(1);

    if (existing) {
      return await db
        .update(medicalRecordSections)
        .set({
          textoActual: contenido,
          updatedAt: new Date(),
          origenActualizacion: origen,
          usuarioId: userId,
          estado: "revisada",
        })
        .where(eq(medicalRecordSections.id, existing.id))
        .returning();
    }

    return await db
      .insert(medicalRecordSections)
      .values({
        fichaId,
        nombre,
        textoActual: contenido,
        origenActualizacion: origen,
        usuarioId: userId,
        estado: "revisada",
      })
      .returning();
  }

  async getRecordContent(consultaId: string) {
    const record = await db.query.medicalRecords.findFirst({
      where: eq(medicalRecords.consultaId, consultaId),
    });

    if (!record) return null;

    const sections = await db
      .select()
      .from(medicalRecordSections)
      .where(eq(medicalRecordSections.fichaId, record.id));

    return {
      ...record,
      sections,
    };
  }
}

export const scribeService = new ScribeService();
