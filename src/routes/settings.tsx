import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, HelpCircle, Loader2, FolderOpen, RefreshCw, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/lib/store";
import { bridge, isElectron } from "@/lib/bridge";
import type { DepReport } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · VN Builder Studio" }] }),
  component: SettingsPage,
});

function StatusBadge({ r }: { r: DepReport }) {
  if (r.status === "running")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> Running
      </span>
    );
  if (r.status === "installed")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-400">
        <CheckCircle2 className="h-3 w-3" /> Installed
      </span>
    );
  if (r.status === "missing")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
        <AlertCircle className="h-3 w-3" /> Missing
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      <HelpCircle className="h-3 w-3" /> Unknown
    </span>
  );
}

function SettingsPage() {
  const { settings, saveSettings, loaded, load } = useStore();
  const [deps, setDeps] = useState<Record<string, DepReport>>({});
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  useEffect(() => {
    void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function scan() {
    setScanning(true);
    try {
      const r = await bridge.detectAll();
      setDeps(r);
      // Auto-fill Ollama model if empty and one available
      if (!settings.ollama.model && r.ollama?.models?.length) {
        await saveSettings({ ollama: { ...settings.ollama, model: r.ollama.models[0] } });
      }
    } finally {
      setScanning(false);
    }
  }

  async function pick(target: "comfy" | "xtts" | "renpy") {
    const folder = await bridge.pickFolder();
    if (!folder) return;
    if (target === "comfy") await saveSettings({ comfy: { ...settings.comfy, path: folder } });
    if (target === "xtts") await saveSettings({ xtts: { ...settings.xtts, path: folder } });
    if (target === "renpy") await saveSettings({ renpy: { sdkPath: folder } });
    toast.success("Path saved");
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Dependencies and AI backend configuration.
            </p>
          </div>
          <Button variant="outline" onClick={scan} disabled={scanning}>
            {scanning ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-4 w-4" />
            )}
            Re-scan
          </Button>
        </div>

        {!isElectron() && (
          <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-6 text-sm">
              <strong>Browser preview mode.</strong> Filesystem and process tools are disabled.
              Download the project and build the desktop app to get full dependency detection,
              auto-launch, and local file saving. See <code>BUILD-DESKTOP.md</code> in the repo.
              <br />
              You can still chat with your local Ollama from this preview if you start it with{" "}
              <code>OLLAMA_ORIGINS=*</code>.
            </CardContent>
          </Card>
        )}

        <div className="space-y-6">
          {/* OLLAMA */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Ollama (text AI)</CardTitle>
              <StatusBadge r={deps.ollama ?? { name: "Ollama", status: "unknown", source: "missing" }} />
            </CardHeader>
            <CardContent className="space-y-4">
              {deps.ollama?.detail && (
                <div className="text-xs text-muted-foreground">{deps.ollama.detail}</div>
              )}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label>URL</Label>
                  <Input
                    value={settings.ollama.url}
                    onChange={(e) =>
                      saveSettings({ ollama: { ...settings.ollama, url: e.target.value } })
                    }
                  />
                </div>
                <div>
                  <Label>Model</Label>
                  {deps.ollama?.models?.length ? (
                    <Select
                      value={settings.ollama.model}
                      onValueChange={(v) =>
                        saveSettings({ ollama: { ...settings.ollama, model: v } })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {deps.ollama.models.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={settings.ollama.model}
                      placeholder="qwen3:14b"
                      onChange={(e) =>
                        saveSettings({ ollama: { ...settings.ollama, model: e.target.value } })
                      }
                    />
                  )}
                </div>
              </div>
              <div>
                <Label>Temperature: {settings.ollama.temperature.toFixed(2)}</Label>
                <Slider
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={[settings.ollama.temperature]}
                  onValueChange={([v]) =>
                    saveSettings({ ollama: { ...settings.ollama, temperature: v } })
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* COMFYUI */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">ComfyUI (image / audio gen)</CardTitle>
              <StatusBadge r={deps.comfy ?? { name: "ComfyUI", status: "unknown", source: "missing" }} />
            </CardHeader>
            <CardContent className="space-y-4">
              {deps.comfy?.detail && (
                <div className="text-xs text-muted-foreground">{deps.comfy.detail}</div>
              )}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label>URL</Label>
                  <Input
                    value={settings.comfy.url}
                    onChange={(e) =>
                      saveSettings({ comfy: { ...settings.comfy, url: e.target.value } })
                    }
                  />
                </div>
                <div>
                  <Label>Portable folder</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={settings.comfy.path}
                      placeholder="ComfyUI_windows_portable"
                    />
                    <Button variant="outline" size="icon" onClick={() => pick("comfy")}>
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <div className="text-sm font-medium">Auto-launch on app start</div>
                  <div className="text-xs text-muted-foreground">
                    Only if not already running.
                  </div>
                </div>
                <Switch
                  checked={settings.comfy.autoLaunch}
                  onCheckedChange={(v) =>
                    saveSettings({ comfy: { ...settings.comfy, autoLaunch: v } })
                  }
                />
              </div>
              {!deps.comfy || deps.comfy.status === "missing" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    bridge.openExternal(
                      "https://github.com/comfyanonymous/ComfyUI/releases",
                    )
                  }
                >
                  Install guide <ExternalLink className="ml-1 h-3 w-3" />
                </Button>
              ) : null}
            </CardContent>
          </Card>

          {/* XTTS */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">XTTS v2 (character voice)</CardTitle>
              <StatusBadge r={deps.xtts ?? { name: "XTTS", status: "unknown", source: "missing" }} />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label>URL</Label>
                  <Input
                    value={settings.xtts.url}
                    onChange={(e) =>
                      saveSettings({ xtts: { ...settings.xtts, url: e.target.value } })
                    }
                  />
                </div>
                <div>
                  <Label>Server folder</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={settings.xtts.path} placeholder="xtts-api-server" />
                    <Button variant="outline" size="icon" onClick={() => pick("xtts")}>
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  bridge.openExternal("https://github.com/daswer123/xtts-api-server")
                }
              >
                Install guide <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
            </CardContent>
          </Card>

          {/* RENPY */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Ren'Py SDK (game build)</CardTitle>
              <StatusBadge r={deps.renpy ?? { name: "Ren'Py", status: "unknown", source: "missing" }} />
            </CardHeader>
            <CardContent className="space-y-3">
              <Label>SDK folder</Label>
              <div className="flex gap-2">
                <Input readOnly value={settings.renpy.sdkPath} placeholder="renpy-8.x.x-sdk" />
                <Button variant="outline" size="icon" onClick={() => pick("renpy")}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => bridge.openExternal("https://www.renpy.org/latest.html")}
              >
                Download Ren'Py SDK <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
