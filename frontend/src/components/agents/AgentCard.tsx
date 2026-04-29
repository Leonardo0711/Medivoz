import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Agent } from "@/types/agents";
import { Link } from "react-router-dom";
import { Edit, Bot, Sparkles, Activity, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const agentTypeColors: Record<string, string> = {
  "Transcriptor": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-100 border-blue-200 dark:border-blue-800",
  "Extractor": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-100 border-green-200 dark:border-green-800"
};

const agentIcons: Record<string, React.ReactNode> = {
  "Transcriptor": <Bot className="h-5 w-5" />,
  "Extractor": <Sparkles className="h-5 w-5" />
};

interface AgentCardProps {
  agent: Agent;
}

export function AgentCard({ agent }: AgentCardProps) {
  const isActive = agent.estado === "activo";
  
  return (
    <Card className="h-full w-full max-w-[450px] mx-auto transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border-border/50 overflow-hidden group relative flex flex-col">
      <div className={cn(
        "absolute top-0 left-0 w-1 h-full transition-colors duration-300",
        agent.tipo === "Transcriptor" ? "bg-blue-500 group-hover:bg-blue-600" : "bg-green-500 group-hover:bg-green-600"
      )} />
      
      <CardHeader className="pb-4 pl-6">
        <div className="flex justify-between items-start gap-4">
          <div className="space-y-2">
             <div className="flex items-center gap-3">
                <span className={cn(
                  "p-2.5 rounded-lg flex items-center justify-center transition-colors shadow-sm",
                  agent.tipo === "Transcriptor" ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400" : "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400"
                )}>
                  {agentIcons[agent.tipo] || <Bot className="h-6 w-6" />}
                </span>
                <CardTitle className="text-xl font-bold">{agent.nombre}</CardTitle>
             </div>
             <Badge variant="outline" className={cn("font-medium border", agentTypeColors[agent.tipo])}>
            {agent.tipo}
          </Badge>
          </div>
          <Badge 
            variant={isActive ? "default" : "secondary"} 
            className={cn(
              "flex items-center gap-1.5 pl-2 pr-2.5 py-1 transition-colors rounded-full",
              isActive 
                ? "bg-green-500 hover:bg-green-600 text-white border-transparent shadow-sm" 
                : "text-muted-foreground bg-muted border-transparent"
            )}
          >
            {isActive && <Activity className="h-3 w-3 animate-pulse" />}
            {isActive ? "Activo" : "Inactivo"}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pl-6 flex flex-col flex-1 justify-between gap-6">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {agent.descripcion}
        </p>
        
        <div className="mt-auto pt-4">
          <Button variant="outline" asChild className="w-full group/btn justify-between hover:border-primary/50 hover:bg-primary/5 transition-all h-10">
          <Link to={`/agents/${agent.id}`}>
              <span className="flex items-center font-medium">
                 <Edit className="h-4 w-4 mr-2 text-muted-foreground group-hover/btn:text-primary transition-colors" />
                 Configurar Agente
              </span>
              <ArrowRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover/btn:opacity-100 group-hover/btn:translate-x-0 transition-all duration-300 text-primary" />
          </Link>
        </Button>
        </div>
      </CardContent>
    </Card>
  );
}
