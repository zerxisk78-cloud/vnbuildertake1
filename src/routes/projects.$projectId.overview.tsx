import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { Hammer, Download, Play, Loader2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStore } from "@/lib/store";
import { bridge, isElectron } from "@/lib/bridge";
import { buildRenpyProject, buildAssetManifest } from "@/lib/renpy";
import { toast } from "sonner";

export const Route = createFileRoute("/projects/$projectId/overview")({
  component: Overview,
});

function Overview() {
  const { projectId } = useParams({ from: "/projects/$projectId/overview" });
  const project = useStore((s) => s.getProject(projectId));
  const [busy, setBusy] = useState<"export" | "test" | "build" | null>(null);
  const [lastDir, setLastDir] = useState<string | null>(null);

  if (!project) return null;
  const lineCount = project.scenes.reduce((n, s) => n + s.lines.length, 0);
  const voicedCount = project.scenes.reduce(
    (n, s) => n + s.lines.filter((l) => l.voiceUrl).length,
    0,
  );

  async function exportProject(): Promise<string | null> {
    const files = buildRenpyProject(project!);
    const dir = await bridge.exportRenpy(project!.id, files);
    if (!dir) return null;
    if (isElectron()) {
      const manifest = buildAssetManifest(project!);
      if (manifest.length) {
        toast.info(`Downloading ${manifest.length} asset${manifest.length === 1 ? "" : "s"}…`);
        const results = await bridge.downloadAssets(dir, manifest);
        const failed = results.filter((r) => !r.ok);
        if (failed.length) {
          toast.warning(`${failed.length} asset(s) failed — see console`);
          console.warn("Asset download failures:", failed);
        } else {
          toast.success("All assets downloaded");
        }
      }
      setLastDir(dir);
    } else {
      toast.success("Ren'Py text preview downloaded (desktop app needed for full export)");
    }
    return dir;
  }

  return (
    <div className="space-y-6 overflow-y-auto p-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Scenes" value={project.scenes.length} />
        <Stat label="Lines" value={lineCount} />
        <Stat label="Voiced" value={voicedCount} />
        <Stat label="Characters" value={project.characters.length} />
        <Stat label="Assets" value={project.assets.length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Build &amp; ship</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy !== null}
              onClick={async () => {
                setBusy("export");
                try {
                  await exportProject();
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "export" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-1 h-4 w-4" />
              )}
              Export Ren'Py project
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null || !isElectron()}
              onClick={async () => {
                setBusy("test");
                try {
                  const dir = lastDir ?? (await exportProject());
                  if (!dir) return;
                  const r = await bridge.launchRenpy(dir);
                  if (!r.ok) toast.error(r.error ?? "Launch failed");
                  else toast.success("Launching in Ren'Py SDK…");
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "test" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-1 h-4 w-4" />
              )}
              Playtest in Ren'Py
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null || !isElectron()}
              onClick={async () => {
                setBusy("build");
                try {
                  const dir = lastDir ?? (await exportProject());
                  if (!dir) return;
                  const r = await bridge.buildRenpy(dir);
                  if (!r.ok) toast.error(r.error ?? "Build failed");
                  else toast.success(r.message ?? "Building…");
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "build" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Hammer className="mr-1 h-4 w-4" />
              )}
              Build .exe distribution
            </Button>
          </div>
          {!isElectron() && (
            <p className="text-xs text-muted-foreground">
              Playtest and build require the desktop app — see <code>BUILD-DESKTOP.md</code>.
            </p>
          )}
          {lastDir && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                Last export: <code>{lastDir}</code>
              </p>
              {isElectron() && (
                <Button size="sm" variant="ghost" onClick={() => bridge.openPath(lastDir)}>
                  <FolderOpen className="mr-1 h-3 w-3" /> Open folder
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
