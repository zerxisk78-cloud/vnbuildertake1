import { createFileRoute, Link, Outlet, useLocation, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft, Bot, BookOpen, Download, Image, Layers, Sparkles, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { buildRenpyProject } from "@/lib/renpy";
import { bridge } from "@/lib/bridge";
import { toast } from "sonner";

export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectLayout,
});

const tabs = [
  { to: "overview", label: "Overview", Icon: Layers },
  { to: "scenes", label: "Scenes", Icon: Sparkles },
  { to: "characters", label: "Characters", Icon: Users },
  { to: "lorebook", label: "Lorebook", Icon: BookOpen },
  { to: "assets", label: "Assets", Icon: Image },
  { to: "ai", label: "Builder AI", Icon: Bot },
];

function ProjectLayout() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const { loaded, load, getProject } = useStore();
  const loc = useLocation();

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const project = getProject(projectId);

  async function exportRenpy() {
    if (!project) return;
    const files = buildRenpyProject(project);
    const result = await bridge.exportRenpy(project.id, files);
    if (result) toast.success(`Exported: ${result}`);
  }

  return (
    <AppShell>
      <div className="flex h-screen min-h-0 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" /> Projects
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">
              {project?.name ?? "Loading…"}
            </div>
            <div className="text-xs text-muted-foreground">
              {project?.genre} · {project?.scenes.length ?? 0} scenes
            </div>
          </div>
          <Button size="sm" onClick={exportRenpy} disabled={!project}>
            <Download className="mr-1 h-4 w-4" /> Export Ren'Py
          </Button>
        </header>
        <nav className="flex gap-1 border-b border-border px-4">
          {tabs.map((t) => {
            const href = `/projects/${projectId}/${t.to}`;
            const active = loc.pathname.endsWith(`/${t.to}`);
            return (
              <Link
                key={t.to}
                to={"/projects/$projectId/" + t.to as "/projects/$projectId/scenes"}
                params={{ projectId }}
                className={cn(
                  "flex items-center gap-1 border-b-2 px-3 py-2 text-sm transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <t.Icon className="h-4 w-4" />
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1 min-h-0 overflow-hidden">
          {!project ? (
            <div className="p-10 text-sm text-muted-foreground">Project not found.</div>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </AppShell>
  );
}
