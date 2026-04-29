import React, { useState } from "react";
import { useAgents } from "@/contexts/AgentsContext";
import { Agent } from "@/types/agents";
import { Button } from "@/components/ui/button";
import { AlertTriangle, FileText, Save, Settings, Loader2, ArrowLeft } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { AgentBasicInfo } from "./AgentBasicInfo";
import { AgentPromptEditor } from "./AgentPromptEditor";
import { AgentConfiguration } from "./AgentConfiguration";
import { Link } from "react-router-dom";

interface AgentFormProps {
  agentId: string;
}

export function AgentForm({ agentId }: AgentFormProps) {
  const { getAgentById, updateAgent, loading } = useAgents();
  const agent = getAgentById(agentId);

  const [formData, setFormData] = useState<Agent | undefined>(agent);
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    if (agent && !formData) {
      setFormData(agent);
    }
  }, [agent, formData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="flex flex-col items-center text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">Cargando agente...</p>
        </div>
      </div>
    );
  }

  if (!formData) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="flex flex-col items-center text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mb-4" />
          <h2 className="text-xl font-bold">Agente no encontrado</h2>
          <p className="text-sm text-muted-foreground mt-1">
            No se encontro un agente con el ID: {agentId}
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/agents">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver a Agentes
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const handleInputChange = (field: keyof Agent, value: Agent[keyof Agent]) => {
    setFormData(prev => {
      if (!prev) return prev;
      return { ...prev, [field]: value };
    });
  };

  const handleConfigChange = (key: string, value: unknown) => {
    setFormData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        configuracion: {
          ...(prev.configuracion || {}),
          [key]: value
        }
      };
    });
  };

  const handleSave = async () => {
    if (formData) {
      setIsSaving(true);
      try {
        await updateAgent(formData);
      } finally {
        setIsSaving(false);
      }
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9 shrink-0">
            <Link to="/agents">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">{formData.nombre}</h1>
            <p className="text-sm text-muted-foreground">{formData.descripcion}</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={isSaving} size="sm">
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {isSaving ? "Guardando..." : "Guardar"}
        </Button>
      </div>

      {/* Basic Info */}
      <section className="bg-card p-6 rounded-xl border border-border/40 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-base font-semibold">Informacion Basica</h2>
        </div>
        <Separator className="mb-5" />
        <AgentBasicInfo agent={formData} onInputChange={handleInputChange} />
      </section>

      {/* Prompt */}
      <section className="bg-card p-6 rounded-xl border border-border/40 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-base font-semibold">Prompt Base</h2>
        </div>
        <Separator className="mb-4" />
        <p className="text-xs text-muted-foreground mb-4 bg-muted/50 p-3 rounded-lg border border-border/40">
          Instrucciones base que definen el comportamiento del agente durante el procesamiento de consultas.
        </p>
        <AgentPromptEditor
          prompt={formData.prompt}
          onChange={(value) => handleInputChange('prompt', value)}
        />
      </section>

      {/* Configuration */}
      <section className="bg-card p-6 rounded-xl border border-border/40 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <Settings className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-base font-semibold">Configuracion Tecnica</h2>
        </div>
        <Separator className="mb-5" />
        <AgentConfiguration
          config={formData.configuracion}
          onConfigChange={handleConfigChange}
        />
      </section>
    </div>
  );
}
