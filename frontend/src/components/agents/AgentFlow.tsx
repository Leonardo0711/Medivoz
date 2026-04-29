import React, { useEffect, useMemo } from "react";
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, Node, Edge } from "reactflow";
import "reactflow/dist/style.css";
import { useAgents } from "@/contexts/AgentsContext";

interface AgentFlowProps {
  readOnly?: boolean;
}

const nodeColors: Record<string, string> = {
  Transcriptor: "#3B82F6",
  Extractor: "#10B981",
};

export function AgentFlow({ readOnly = false }: AgentFlowProps) {
  const { agents, loading } = useAgents();

  const { builtNodes, builtEdges } = useMemo(() => {
    if (!agents.length) return { builtNodes: [], builtEdges: [] };

    // Sort: Transcriptor first, then Extractor
    const sorted = [...agents].sort((a, b) => {
      if (a.tipo === "Transcriptor" && b.tipo !== "Transcriptor") return -1;
      if (a.tipo !== "Transcriptor" && b.tipo === "Transcriptor") return 1;
      return 0;
    });

    const spacing = 300;
    const nodes: Node[] = sorted.map((agent, i) => ({
      id: agent.id,
      data: { label: agent.nombre, type: agent.tipo },
      position: { x: 80 + spacing * i, y: 120 },
      style: {
        background: nodeColors[agent.tipo] ?? "#64748b",
        color: "white",
        border: "none",
        borderRadius: "12px",
        padding: "14px 20px",
        fontSize: "14px",
        fontWeight: 600,
        width: 200,
        textAlign: "center" as const,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      },
    }));

    // Auto-connect in pipeline order
    const edges: Edge[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      edges.push({
        id: `pipe-${sorted[i].id}-${sorted[i + 1].id}`,
        source: sorted[i].id,
        target: sorted[i + 1].id,
        animated: true,
        style: { stroke: "#3DB7E4", strokeWidth: 2 },
        label: "output",
        labelStyle: { fontSize: 11, fill: "#94a3b8" },
      });
    }

    return { builtNodes: nodes, builtEdges: edges };
  }, [agents]);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Sync when agents load from DB
  useEffect(() => {
    if (builtNodes.length > 0) {
      setNodes(builtNodes);
      setEdges(builtEdges);
    }
  }, [builtNodes, builtEdges, setNodes, setEdges]);

  if (loading || !agents.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          {loading ? "Cargando agentes..." : "No hay agentes configurados"}
        </p>
        {!loading && (
          <p className="max-w-xl text-xs text-muted-foreground/80">
            La transcripcion y el autollenado clinico base siguen funcionando. Esta vista es para
            orquestar agentes personalizados cuando quieras ajustar prompts o flujos avanzados.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        panOnScroll
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e2e8f0" gap={20} size={1} />
        {!readOnly && <Controls />}
        <MiniMap
          nodeStrokeColor={(n) => nodeColors[n.data?.type] || "#eee"}
          nodeColor={(n) => nodeColors[n.data?.type] || "#eee"}
          maskColor="rgba(0, 0, 0, 0.08)"
          style={{ borderRadius: 8 }}
        />
      </ReactFlow>
    </div>
  );
}
