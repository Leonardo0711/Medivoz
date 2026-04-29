
import React from "react";
import { Textarea } from "@/components/ui/textarea";

interface AgentPromptEditorProps {
  prompt: string | undefined;
  onChange: (value: string) => void;
}

export function AgentPromptEditor({ prompt, onChange }: AgentPromptEditorProps) {
  return (
    <div className="space-y-2">
      <Textarea 
        value={prompt || ''} 
        onChange={e => onChange(e.target.value)} 
        rows={10}
        placeholder="Ingrese el prompt base que el agente utilizará..."
        className="font-mono text-sm resize-y min-h-[200px] focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <p className="text-xs text-muted-foreground">
        Este prompt define las instrucciones y comportamiento del agente. Sea específico en la tarea que debe realizar.
      </p>
    </div>
  );
}
