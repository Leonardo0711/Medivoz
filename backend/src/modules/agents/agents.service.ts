import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  agentTemplates,
  agentTemplatePrompts,
  doctorAgentPrompts,
  doctorAgents,
} from "../../db/schema/agents.js";
import { logger } from "../../core/utils/logger.js";

type AgentType = "transcriptor" | "extractor" | "resumidor" | "validador";

const defaultAgentDefinitions: Array<{
  nombre: string;
  descripcion: string;
  tipo: AgentType;
  prompt: string;
  configuracion: Record<string, unknown>;
  prioridad: number;
}> = [
  {
    nombre: "Transcriptor",
    descripcion: "Convierte la consulta medico-paciente en texto estructurado en tiempo real.",
    tipo: "transcriptor",
    prioridad: 1,
    prompt:
      "Transcribe en espanol medico, separando hablantes cuando sea posible, preservando dosis, fechas y terminologia clinica. No inventes contenido ausente.",
    configuracion: {
      modelo: "gpt-4o-mini-transcribe",
      temperatura: 0,
      identificaVoces: true,
    },
  },
  {
    nombre: "Extractor de Anamnesis",
    descripcion: "Extrae y resume la anamnesis por secciones con evidencia textual.",
    tipo: "extractor",
    prioridad: 2,
    prompt:
      "Extrae solo informacion presente en la transcripcion. No diagnostiques, no completes datos ausentes y marca vacio cuando no haya evidencia. Redacta tambien un resumen narrativo breve por cada seccion.",
    configuracion: {
      modelo: "gpt-4o-mini",
      temperatura: 0,
      formatoSalida: "json",
    },
  },
];

const toApiAgent = async (agent: typeof doctorAgents.$inferSelect) => {
  const template = await db.query.agentTemplates.findFirst({
    where: eq(agentTemplates.id, agent.plantillaAgenteId),
  });
  const prompt = await db.query.doctorAgentPrompts.findFirst({
    where: and(eq(doctorAgentPrompts.agenteDoctorId, agent.id), eq(doctorAgentPrompts.esActiva, true)),
    orderBy: [desc(doctorAgentPrompts.numeroVersion)],
  });

  return {
    id: agent.id,
    nombre: agent.nombreVisible || template?.nombrePlantilla || "Agente IA",
    descripcion: template?.descripcion || "",
    tipo: template?.tipo === "transcriptor" ? "Transcriptor" : "Extractor",
    estado: agent.estado,
    prompt: prompt?.textoPrompt || "",
    documentos: template?.documentosReferencia || [],
    dependencias: template?.dependencias || [],
    configuracion: {
      ...(template?.configuracionBase as Record<string, unknown> | null | undefined),
      ...(agent.configuracionSobrescrita as Record<string, unknown> | null | undefined),
      modelo: prompt?.nombreModelo || (agent.configuracionSobrescrita as any)?.modelo,
      temperatura: prompt?.temperatura || (agent.configuracionSobrescrita as any)?.temperatura,
      promptVersion: prompt?.numeroVersion || 1,
    },
  };
};

export class AgentsService {
  async ensureDefaultAgents(doctorId: string) {
    logger.info("[agents] ensure-default:start", { doctorId });
    const existing = await db
      .select({
        id: doctorAgents.id,
        tipo: agentTemplates.tipo,
      })
      .from(doctorAgents)
      .innerJoin(agentTemplates, eq(agentTemplates.id, doctorAgents.plantillaAgenteId))
      .where(eq(doctorAgents.doctorId, doctorId));

    const existingTypes = new Set(existing.map((row) => row.tipo));
    logger.info("[agents] ensure-default:existing", {
      doctorId,
      count: existing.length,
      types: Array.from(existingTypes),
    });
    for (const definition of defaultAgentDefinitions) {
      if (existingTypes.has(definition.tipo)) continue;

      const [template] = await db
        .insert(agentTemplates)
        .values({
          nombrePlantilla: definition.nombre,
          descripcion: definition.descripcion,
          tipo: definition.tipo,
          estado: "activo",
          creadaPorId: doctorId,
          visibleParaTodosLosDoctores: false,
          configuracionBase: definition.configuracion,
          documentosReferencia: [],
          dependencias: definition.tipo === "extractor" ? ["Transcriptor"] : [],
        })
        .returning();

      await db.insert(agentTemplatePrompts).values({
        plantillaAgenteId: template.id,
        numeroVersion: 1,
        textoPrompt: definition.prompt,
        nombreModelo: String(definition.configuracion.modelo || "gpt-4o-mini"),
        temperatura: String(definition.configuracion.temperatura ?? 0),
        configuracionExtra: {},
        esActiva: true,
        creadaPorId: doctorId,
      });

      const [doctorAgent] = await db
        .insert(doctorAgents)
        .values({
          doctorId,
          plantillaAgenteId: template.id,
          nombreVisible: definition.nombre,
          estado: "activo",
          editablePorDoctor: true,
          usarEnConsultaEnVivo: true,
          usarEnResumenFinal: true,
          prioridad: definition.prioridad,
          configuracionSobrescrita: definition.configuracion,
          asignadoPorId: doctorId,
        })
        .returning();

      await db.insert(doctorAgentPrompts).values({
        agenteDoctorId: doctorAgent.id,
        numeroVersion: 1,
        textoPrompt: definition.prompt,
        nombreModelo: String(definition.configuracion.modelo || "gpt-4o-mini"),
        temperatura: String(definition.configuracion.temperatura ?? 0),
        configuracionExtra: {},
        esActiva: true,
        creadaPorId: doctorId,
        origen: "sistema",
      });

      logger.info("[agents] ensure-default:created", {
        doctorId,
        tipo: definition.tipo,
        templateId: template.id,
        doctorAgentId: doctorAgent.id,
        model: definition.configuracion.modelo,
      });
    }
  }

  async listDoctorAgents(doctorId: string) {
    logger.info("[agents] list:start", { doctorId });
    await this.ensureDefaultAgents(doctorId);
    const rows = await db
      .select()
      .from(doctorAgents)
      .where(eq(doctorAgents.doctorId, doctorId))
      .orderBy(doctorAgents.prioridad, doctorAgents.createdAt);

    logger.info("[agents] list:rows", { doctorId, count: rows.length });
    return Promise.all(rows.map((row) => toApiAgent(row)));
  }

  async updateDoctorAgent(
    doctorId: string,
    agentId: string,
    data: {
      nombre?: string;
      descripcion?: string;
      estado?: "activo" | "inactivo";
      prompt?: string;
      configuracion?: Record<string, unknown>;
    }
  ) {
    const agent = await db.query.doctorAgents.findFirst({
      where: and(eq(doctorAgents.id, agentId), eq(doctorAgents.doctorId, doctorId)),
    });
    if (!agent) {
      logger.warn("[agents] update:not-found", { doctorId, agentId });
      return null;
    }

    const now = new Date();
    logger.info("[agents] update:start", {
      doctorId,
      agentId,
      estado: data.estado,
      hasPrompt: data.prompt !== undefined,
      configKeys: Object.keys(data.configuracion || {}),
    });
    await db
      .update(doctorAgents)
      .set({
        nombreVisible: data.nombre,
        estado: data.estado,
        configuracionSobrescrita: data.configuracion,
        updatedAt: now,
      })
      .where(eq(doctorAgents.id, agent.id));

    if (data.descripcion !== undefined) {
      await db
        .update(agentTemplates)
        .set({ descripcion: data.descripcion, updatedAt: now })
        .where(eq(agentTemplates.id, agent.plantillaAgenteId));
    }

    if (data.prompt !== undefined) {
      const latest = await db.query.doctorAgentPrompts.findFirst({
        where: eq(doctorAgentPrompts.agenteDoctorId, agent.id),
        orderBy: [desc(doctorAgentPrompts.numeroVersion)],
      });
      await db
        .update(doctorAgentPrompts)
        .set({ esActiva: false })
        .where(eq(doctorAgentPrompts.agenteDoctorId, agent.id));

      const model = String(data.configuracion?.modelo || latest?.nombreModelo || "gpt-4o-mini");
      const temperature = String(data.configuracion?.temperatura ?? latest?.temperatura ?? 0);
      await db.insert(doctorAgentPrompts).values({
        agenteDoctorId: agent.id,
        numeroVersion: Number(latest?.numeroVersion || 0) + 1,
        textoPrompt: data.prompt,
        nombreModelo: model,
        temperatura: temperature,
        configuracionExtra: {},
        esActiva: true,
        creadaPorId: doctorId,
        origen: "doctor",
      });
      logger.info("[agents] prompt-version:created", {
        doctorId,
        agentId,
        previousVersion: latest?.numeroVersion || 0,
        nextVersion: Number(latest?.numeroVersion || 0) + 1,
        model,
        temperature,
      });
    }

    const [updated] = await db
      .select()
      .from(doctorAgents)
      .where(eq(doctorAgents.id, agent.id))
      .limit(1);
    logger.info("[agents] update:done", { doctorId, agentId, updated: Boolean(updated) });
    return updated ? toApiAgent(updated) : null;
  }
}

export const agentsService = new AgentsService();
