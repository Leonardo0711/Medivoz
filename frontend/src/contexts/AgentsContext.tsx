import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Agent } from "@/types/agents";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import api from "@/lib/api";
import { logger } from "@/utils/logger";

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

const normalizeAgent = (agent: Partial<Agent>): Agent | null => {
  if (!agent.id || !agent.nombre || !agent.tipo || !agent.estado) return null;
  return {
    id: String(agent.id),
    nombre: String(agent.nombre),
    descripcion: String(agent.descripcion || ""),
    tipo: agent.tipo as Agent["tipo"],
    estado: agent.estado as Agent["estado"],
    prompt: typeof agent.prompt === "string" ? agent.prompt : "",
    documentos: Array.isArray(agent.documentos) ? (agent.documentos as string[]) : [],
    dependencias: Array.isArray(agent.dependencias) ? (agent.dependencias as string[]) : [],
    configuracion:
      agent.configuracion && typeof agent.configuracion === "object"
        ? (agent.configuracion as Record<string, unknown>)
        : {},
  };
};

export const AgentsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const loadAgents = useCallback(async () => {
    if (!user?.id) {
      setAgents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      logger.info("Loading IA agents from backend", { userId: user.id });
      const response = await api.get("/agents");
      const next = Array.isArray(response.data)
        ? response.data.map((item) => normalizeAgent(item)).filter((item): item is Agent => !!item)
        : [];
      setAgents(next);
      logger.info("IA agents loaded", {
        userId: user.id,
        count: next.length,
        activeCount: next.filter((agent) => agent.estado === "activo").length,
      });
    } catch (error) {
      logger.error("No se pudieron cargar los agentes IA", error);
      toast.error("No se pudieron cargar los agentes IA");
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const getAgentById = (id: string) => agents.find((agent) => agent.id === id);

  const updateAgent = async (updatedAgent: Agent) => {
    logger.info("Updating IA agent", {
      agentId: updatedAgent.id,
      tipo: updatedAgent.tipo,
      estado: updatedAgent.estado,
      hasPrompt: Boolean(updatedAgent.prompt?.trim()),
      configKeys: Object.keys(updatedAgent.configuracion || {}),
    });
    const response = await api.put(`/agents/${updatedAgent.id}`, {
      nombre: updatedAgent.nombre,
      descripcion: updatedAgent.descripcion,
      estado: updatedAgent.estado,
      prompt: updatedAgent.prompt || "",
      configuracion: updatedAgent.configuracion || {},
    });
    const normalized = normalizeAgent(response.data);
    if (!normalized) return;

    setAgents((prev) => prev.map((agent) => (agent.id === normalized.id ? normalized : agent)));
    logger.info("IA agent updated", {
      agentId: normalized.id,
      estado: normalized.estado,
      promptVersion: normalized.configuracion?.promptVersion,
    });
    toast.success("Agente actualizado. El pipeline IA usara esta version en las siguientes extracciones.");
  };

  const addAgent = async (_agent: Omit<Agent, "id">) => {
    toast.info("Por ahora se editan los agentes base conectados al pipeline.");
  };

  const deleteAgent = async (id: string) => {
    const agent = agents.find((item) => item.id === id);
    if (!agent) return;
    await updateAgent({ ...agent, estado: "inactivo" });
  };

  const reorderAgents = (newOrderIds: string[]) => {
    setAgents((prev) => {
      const reordered = newOrderIds
        .map((id) => prev.find((agent) => agent.id === id))
        .filter((agent): agent is Agent => !!agent);
      const remainder = prev.filter((agent) => !newOrderIds.includes(agent.id));
      return [...reordered, ...remainder];
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
