import { useState } from "react";
import { Mic, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { xttsGenerate } from "@/lib/xtts";
import { toast } from "sonner";

interface Props {
  text: string;
  /** Optional override speaker; defaults to character's voiceStyle or "female_01". */
  speaker?: string;
  /** Called with a (blob:) URL after generation completes. */
  onDone: (audioUrl: string, blob: Blob) => void;
  disabled?: boolean;
}

export function GenerateVoiceButton({ text, speaker, onDone, disabled }: Props) {
  const xttsUrl = useStore((s) => s.settings.xtts.url);
  const language = useStore((s) => s.settings.xtts.language ?? "en");
  const defaultSpeaker = useStore((s) => s.settings.xtts.defaultSpeaker || "female_01");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  async function go() {
    if (!text.trim()) {
      toast.error("No text to voice.");
      return;
    }
    setBusy(true);
    try {
      const { blob, url } = await xttsGenerate({
        url: xttsUrl,
        text,
        speaker: speaker || defaultSpeaker,
        language,
      });
      setPreview(url);
      onDone(url, blob);
      toast.success("Voice generated");
    } catch (e) {
      toast.error(`XTTS: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={go} disabled={disabled || busy} type="button">
        {busy ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <Mic className="mr-1 h-4 w-4" />
        )}
        {busy ? "Voicing…" : "Voice"}
      </Button>
      {preview && (
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            const a = new Audio(preview);
            void a.play();
          }}
          title="Preview"
        >
          <Play className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
