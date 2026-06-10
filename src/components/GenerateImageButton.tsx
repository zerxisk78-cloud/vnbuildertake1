import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useStore } from "@/lib/store";
import { runWorkflow } from "@/lib/comfy";
import { toast } from "sonner";

interface Props {
  workflow: Record<string, unknown>;
  /** Called with the first image's URL when generation completes. */
  onDone: (imageUrl: string) => void;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "default";
}

export function GenerateImageButton({
  workflow,
  onDone,
  disabled,
  label = "Generate",
  size = "sm",
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
      const images = await runWorkflow({
        url: comfyUrl,
        workflow,
        onProgress: (p, m) => {
          if (p >= 0) setPct(p);
          setMsg(m);
        },
      });
      if (images.length) onDone(images[0].url);
      toast.success("Image generated");
    } catch (e) {
      toast.error(`ComfyUI: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      setPct(0);
      setMsg("");
    }
  }

  return (
    <div className="flex flex-1 items-center gap-2">
      <Button size={size} onClick={go} disabled={disabled || busy} type="button">
        {busy ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="mr-1 h-4 w-4" />
        )}
        {busy ? msg || "Working…" : label}
      </Button>
      {busy && pct > 0 && <Progress value={pct} className="h-1.5 flex-1" />}
    </div>
  );
}
