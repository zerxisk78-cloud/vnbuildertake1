import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useStore } from "@/lib/store";
import type { Scene } from "@/lib/types";

export const Route = createFileRoute("/projects/$projectId/graph")({
  component: GraphPage,
});

function GraphPage() {
  const { projectId } = useParams({ from: "/projects/$projectId/graph" });
  const project = useStore((s) => s.getProject(projectId))!;
  const navigate = useNavigate();

  const { nodes, edges } = useMemo(() => buildGraph(project.scenes), [project.scenes]);

  if (project.scenes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-sm text-muted-foreground">
        Add scenes to see the branching graph.
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        onNodeClick={(_, n) => {
          navigate({
            to: "/projects/$projectId/scenes",
            params: { projectId },
            search: { scene: n.id } as never,
          });
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}

function buildGraph(scenes: Scene[]): { nodes: Node[]; edges: Edge[] } {
  // Layered layout: sequential left→right, with choice branches offset vertically.
  const nodes: Node[] = scenes.map((s, i) => ({
    id: s.id,
    position: { x: i * 260, y: (i % 3) * 120 },
    data: {
      label: (
        <div className="text-left">
          <div className="text-xs font-semibold">{s.title}</div>
          <div className="text-[10px] text-muted-foreground">{s.lines.length} lines</div>
        </div>
      ),
    },
    style: {
      background: "hsl(var(--card))",
      border: "1px solid hsl(var(--border))",
      color: "hsl(var(--card-foreground))",
      borderRadius: 8,
      padding: 8,
      minWidth: 160,
    },
  }));

  const edges: Edge[] = [];
  // Sequential fallback edges (next scene after this one) — dashed
  for (let i = 0; i < scenes.length - 1; i++) {
    edges.push({
      id: `seq-${scenes[i].id}-${scenes[i + 1].id}`,
      source: scenes[i].id,
      target: scenes[i + 1].id,
      style: { strokeDasharray: "4 4", opacity: 0.4 },
    });
  }
  // Explicit choice edges
  for (const s of scenes) {
    for (const l of s.lines) {
      if (l.type !== "choice") continue;
      for (const c of l.choices ?? []) {
        if (!c.gotoSceneId) continue;
        edges.push({
          id: `c-${s.id}-${c.id}-${c.gotoSceneId}`,
          source: s.id,
          target: c.gotoSceneId,
          label: c.label || "choice",
          animated: true,
          style: { stroke: "hsl(var(--primary))" },
        });
      }
    }
  }
  return { nodes, edges };
}
