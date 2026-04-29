
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Agent } from "@/types/agents";
import { toast } from "sonner";

interface AgentTestAreaProps {
  agent: Agent;
}

export function AgentTestArea({ agent }: AgentTestAreaProps) {
  const [testInput, setTestInput] = useState("");
  const [testOutput, setTestOutput] = useState("");
  const [isTesting, setIsTesting] = useState(false);

  const handleTest = () => {
    setIsTesting(true);
    // Simulación de procesamiento
    setTimeout(() => {
      setTestOutput(`Resultado del procesamiento:\n\nEntrada:\n${testInput}\n\nProcesado con ${agent?.tipo} usando configuración personalizada.\n\nAnálisis completado exitosamente.`);
      setIsTesting(false);
      toast.success("Prueba completada");
    }, 1500);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Texto de entrada</Label>
        <Textarea 
          value={testInput} 
          onChange={e => setTestInput(e.target.value)} 
          rows={5}
          placeholder="Ingrese un texto para probar el funcionamiento del agente..."
        />
      </div>
      
      <Button 
        onClick={handleTest} 
        disabled={isTesting || !testInput.trim()} 
        className="w-full"
      >
        {isTesting ? "Procesando..." : "Probar Agente"}
      </Button>
      
      {testOutput && (
        <div className="space-y-2 pt-4">
          <Label>Resultado</Label>
          <div className="p-3 bg-muted rounded-md whitespace-pre-wrap font-mono text-sm">
            {testOutput}
          </div>
        </div>
      )}
    </div>
  );
}
