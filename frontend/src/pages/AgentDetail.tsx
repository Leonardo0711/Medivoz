import { useParams } from "react-router-dom";
import { AgentsProvider } from "@/contexts/AgentsContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { AgentForm } from "@/components/agents/AgentForm";

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();

  return (
    <AgentsProvider>
      <div className="flex min-h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="app-content flex-1 overflow-auto">
          <div className="mx-auto max-w-7xl px-4 py-7 md:px-8 md:py-8">
            <AgentForm agentId={id || ""} />
          </div>
        </div>
      </div>
    </AgentsProvider>
  );
}
