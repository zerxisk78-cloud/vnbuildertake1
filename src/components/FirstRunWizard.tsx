import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, Sparkles, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { bridge } from "@/lib/bridge";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import type { DepReport } from "@/lib/types";

const FLAG = "vnstudio:firstRun";

const INSTALL_LINKS: Record<string, { label: string; url: string; required: boolean }> = {
  ollama: { label: "Ollama", url: "https://ollama.com/download", required: true },
  comfy: {
    label: "ComfyUI (Portable)",
    url: "https://github.com/comfyanonymous/ComfyUI/releases",
    required: true,
  },
  xtts: {
    label: "XTTS API Server",
    url: "https://github.com/daswer123/xtts-api-server",
    required: false,
  },
  renpy: { label: "Ren'Py SDK", url: "https://www.renpy.org/latest.html", required: true },
  ffmpeg: { label: "FFmpeg", url: "https://www.gyan.dev/ffmpeg/builds/", required: false },
};

export function FirstRunWizard() {
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState<Record<string, DepReport> | null>(null);
  const [scanning, setScanning] = useState(false);
  const createExampleProject = useStore((s) => s.createExampleProject);
  const projects = useStore((s) => s.projects);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(FLAG) !== "done") {
      setOpen(true);
      void scan();
    }
  }, []);

  async function scan() {
    setScanning(true);
    try {
      const r = await bridge.detectAll();
      setReports(r);
    } finally {
      setScanning(false);
    }
  }

  function done() {
    localStorage.setItem(FLAG, "done");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && done()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Welcome to VN Builder Studio</DialogTitle>
          <DialogDescription>
            Quick check for the local tools this app uses. Nothing is installed automatically —
            links open the official download pages.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {scanning && !reports ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Scanning your system…
            </div>
          ) : (
            Object.entries(INSTALL_LINKS).map(([key, meta]) => {
              const r = reports?.[key];
              const ok = r?.status === "running" || r?.status === "installed";
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {ok ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{meta.label}</div>
                      <div className="break-words text-xs text-muted-foreground">
                        {r ? (r.detail ?? r.status) : "—"}
                        {meta.required ? "" : " · optional"}
                      </div>
                    </div>

                  </div>
                  {!ok && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => bridge.openExternal(meta.url)}
                    >
                      <ExternalLink className="mr-1 h-3 w-3" /> Install
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-2">
          {projects.length === 0 && (
            <Button
              variant="secondary"
              onClick={async () => {
                await createExampleProject();
                toast.success("Example project loaded — open it from the home page.");
                done();
              }}
            >
              <Sparkles className="mr-1 h-3 w-3" /> Load example VN
            </Button>
          )}
          <Button variant="ghost" onClick={scan} disabled={scanning}>
            <RefreshCw className={"mr-1 h-3 w-3 " + (scanning ? "animate-spin" : "")} />
            Re-scan
          </Button>
          <Button onClick={done}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
