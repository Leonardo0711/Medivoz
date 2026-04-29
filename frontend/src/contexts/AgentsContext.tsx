import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Agent } from "@/types/agents";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { logger } from "@/utils/logger";

const defaultAgents: Omit<Agent, "id">[] = [
  {
    nombre: "Transcriptor",
    descripcion: "Convierte la consulta medico-paciente en texto estructurado en tiempo real.",
    tipo: "Transcriptor",
    estado: "activo",
    prompt:
      "Transcribe en espanol medico, separando hablantes (MEDICO/PACIENTE/FAMILIAR), preservando dosis, fechas y terminologia clinica.",
    documentos: [],
    dependencias: [],
    configuracion: {
      modelo: "gpt-4o",
      temperatura: 0.2,
      identificaVoces: true,
    },
  },
  {
    nombre: "Extractor de Sintomas",
    descripcion: "Estructura la anamnesis y extrae datos clave para la ficha medica.",
    tipo: "Extractor",
    estado: "activo",
    prompt:
      "Extrae motivo de consulta, tiempo, forma de inicio, curso, historia cronologica, antecedentes, sintomas y estudios previos.",
    documentos: [],
    dependencias: ["Transcriptor"],
    configuracion: {
      modelo: "gpt-4o",
      temperatura: 0.2,
      formatoSalida: "json",
    },
  },
];

type AgentsContextValue = {
  agents: Agent[];
  loading: boolean;
  getAgentById: (id: string) => Agent | undefined;
  updateAgent: (updatedAgent: Agent) => Promise<void>;
  addAgent: (agent: Omit<Agent, "id">) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
  reorderAgents: (newOrderIds: string[]) => void;
};

const AgentsContext = createContext<AgentsContextValue | undefined>(undefined);

const getStorageKey = (userId: string) => `medivoz_agents_${userId}`;

const newId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `agent_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeAgent = (agent: Partial<Agent>): Agent | null => {
  if (!agent.id || !agent.nombre || !agent.descripcion || !agent.tipo || !agent.estado) {
    return null;
  }

  return {
    id: String(agent.id),
    nombre: String(agent.nombre),
    descripcion: String(agent.descripcion),
    tipo: agent.tipo as Agent["tipo"],
    estado: agent.estado as Agent["estado"],
    prompt: typeof agent.prompt === "string" ? agent.prompt : undefined,
    documentos: Array.isArray(agent.documentos) ? (agent.documentos as string[]) : undefined,
    dependencias: Array.isArray(agent.dependencias) ? (agent.dependencias as string[]) : undefined,
    configuracion:
      agent.configuracion && typeof agent.configuracion === "object"
        ? (agent.configuracion as Record<string, unknown>)
        : undefined,
  };
};

const seedAgents = () => defaultAgents.map((agent) => ({ ...agent, id: newId() }));

export const AgentsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const userId = user?.id;

  const persistAgents = useMemo(() => {
    return (nextAgents: Agent[]) => {
      if (!userId) return;
      try {
        localStorage.setItem(getStorageKey(userId), JSON.stringify(nextAgents));
      } catch (error) {
        logger.error("Error saving agents to local storage:", error);
      }
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setAgents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const raw = localStorage.getItem(getStorageKey(userId));
      if (!raw) {
        const seeded = seedAgents();
        setAgents(seeded);
        persistAgents(seeded);
        setLoading(false);
        return;
      }

      const parsed = JSON.parse(raw);
      const safeAgents = Array.isArray(parsed)
        ? parsed.map((item) => normalizeAgent(item)).filter((item): item is Agent => !!item)
        : [];

      if (safeAgents.length === 0) {
        const seeded = seedAgents();
        setAgents(seeded);
        persistAgents(seeded);
      } else {
        setAgents(safeAgents);
      }
    } catch (error) {
      logger.error("Error loading agents:", error);
      const seeded = seedAgents();
      setAgents(seeded);
      persistAgents(seeded);
      toast.error("No se pudieron cargar los agentes previos. Se restauraron los agentes base.");
    } finally {
      setLoading(false);
    }
  }, [persistAgents, userId]);

  const getAgentById = (id: string) => agents.find((agent) => agent.id === id);

  const updateAgent = async (updatedAgent: Agent) => {
    setAgents((prev) => {
      const next = prev.map((agent) => (agent.id === updatedAgent.id ? updatedAgent : agent));
      persistAgents(next);
      return next;
    });
    toast.success("Agente actualizado correctamente");
  };

  const addAgent = async (agent: Omit<Agent, "id">) => {
    const newAgent: Agent = { ...agent, id: newId() };
    setAgents((prev) => {
      const next = [...prev, newAgent];
      persistAgents(next);
      return next;
    });
    toast.success("Agente creado correctamente");
  };

  const deleteAgent = async (id: string) => {
    setAgents((prev) => {
      const next = prev.filter((agent) => agent.id !== id);
      persistAgents(next);
      return next;
    });
    toast.success("Agente eliminado");
  };

  const reorderAgents = (newOrderIds: string[]) => {
    setAgents((prev) => {
      const reordered = newOrderIds
        .map((id) => prev.find((agent) => agent.id === id))
        .filter((agent): agent is Agent => !!agent);
      const remainder = prev.filter((agent) => !newOrderIds.includes(agent.id));
      const next = [...reordered, ...remainder];
      persistAgents(next);
      return next;
    });
  };

  const value: AgentsContextValue = {
    agents,
    loading,
    getAgentById,
    updateAgent,
    addAgent,
    deleteAgent,
    reorderAgents,
  };

  return <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>;
};

export const useAgents = () => {
  const context = useContext(AgentsContext);
  if (context === undefined) {
    throw new Error("useAgents must be used within an AgentsProvider");
  }
  return context;
};
