import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Agent } from "@/types/agents";

interface AgentBasicInfoProps {
  agent: Agent;
  onInputChange: (field: keyof Agent, value: Agent[keyof Agent]) => void;
}

export function AgentBasicInfo({ agent, onInputChange }: AgentBasicInfoProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Nombre del Agente</Label>
        <Input
          value={agent.nombre}
          onChange={e => onInputChange('nombre', e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Descripcion</Label>
        <Textarea
          value={agent.descripcion}
          onChange={e => onInputChange('descripcion', e.target.value)}
          rows={2}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-2">
          <Label>Tipo de Agente</Label>
          <Select
            value={agent.tipo}
            onValueChange={v => onInputChange('tipo', v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Transcriptor">Transcriptor</SelectItem>
              <SelectItem value="Extractor">Extractor</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Estado</Label>
          <div className="flex items-center gap-3 h-10 px-3 rounded-md border bg-background">
            <Switch
              checked={agent.estado === "activo"}
              onCheckedChange={v => onInputChange('estado', v ? 'activo' : 'inactivo')}
            />
            <span className="text-sm font-medium">
              {agent.estado === "activo" ? "Activo" : "Inactivo"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
