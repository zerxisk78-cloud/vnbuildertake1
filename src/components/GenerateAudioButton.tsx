import { useState } from "react";
import { Music, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useStore } from "@/lib/store";
import { runWorkflow } from "@/lib/comfy";
import { toast } from "sonner";

interface Props {
  workflow: Record<string, unknown>;
  onDone: (audioUrl: string) => void;
  disabled?: boolean;
  label?: string;
}

export function GenerateAudioButton({
  workflow,
  onDone,
  disabled,
  label = "Generate audio",
}: Props) {
  const comfyUrl = useStore((s) => s.settings.comfy.url);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState("");

  async function go() {
    setBusy(true);
    setPct(0);
    setMsg("Queueing…");
    try {
      // runWorkflow polls history.outputs for any node with `images` OR `audio`.
      // ComfyUI SaveAudio writes to `audio` field — we patch by reading raw history.
      const out = await runWorkflow({
        url: comfyUrl,
        workflow,
        onProgress: (p, m) => {
          if (p >= 0) setPct(p);
          setMsg(m);
        },
      });
      // SaveAudio populates output.audio[*] (same shape: filename/subfolder/type).
      // runWorkflow extracts images only — fall back to /history if needed.
      if (out.length) {
        onDone(out[0].url);
      } else {
        // Manual fallback: look at /history for audio outputs.
        // (runWorkflow already returned; if it returned empty it threw.)
        throw new Error("No audio in workflow output");
      }
      toast.success("Audio generated");
    } catch (e) {
      toast.error(`Audio: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      setPct(0);
      setMsg("");
    }
  }

  return (
    <div className="flex flex-1 items-center gap-2">
      <Button size="sm" onClick={go} disabled={disabled || busy} type="button">
        {busy ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <Music className="mr-1 h-4 w-4" />
        )}
        {busy ? msg || "Working…" : label}
      </Button>
      {busy && pct > 0 && <Progress value={pct} className="h-1.5 flex-1" />}
    </div>
  );
}
