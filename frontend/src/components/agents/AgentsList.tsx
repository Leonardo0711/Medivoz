import React from "react";
import { useAgents } from "@/contexts/AgentsContext";
import { AgentCard } from "./AgentCard";
import { Agent } from "@/types/agents";

export function AgentsList() {
  const { agents } = useAgents();

  return (
    <>
      {agents.map((agent: Agent) => (
        <AgentCard key={agent.id} agent={agent} />
      ))}
    </>
  );
}
