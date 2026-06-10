import { createFileRoute, useParams } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/projects/$projectId/overview")({
  component: Overview,
});

function Overview() {
  const { projectId } = useParams({ from: "/projects/$projectId/overview" });
  const project = useStore((s) => s.getProject(projectId));
  if (!project) return null;
  const lineCount = project.scenes.reduce((n, s) => n + s.lines.length, 0);
  return (
    <div className="space-y-6 overflow-y-auto p-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Scenes" value={project.scenes.length} />
        <Stat label="Lines" value={lineCount} />
        <Stat label="Characters" value={project.characters.length} />
        <Stat label="Lore entries" value={project.lorebook.length} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">About</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {project.description || "Add a description from the Projects page."}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scene flow</CardTitle>
        </CardHeader>
        <CardContent>
          {project.scenes.length === 0 ? (
            <div className="text-sm text-muted-foreground">No scenes yet.</div>
          ) : (
            <ol className="space-y-2">
              {project.scenes.map((s, i) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="text-xs text-muted-foreground">{i + 1}.</span>
                  <span className="flex-1">{s.title}</span>
                  <span className="text-xs text-muted-foreground">{s.lines.length} lines</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
