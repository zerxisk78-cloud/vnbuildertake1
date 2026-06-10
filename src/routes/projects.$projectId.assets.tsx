import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/lib/store";
import type { AssetKind } from "@/lib/types";
import { GenerateImageButton } from "@/components/GenerateImageButton";
import { PRESETS } from "@/lib/workflows";

const KINDS: AssetKind[] = ["background", "sprite", "cg", "music", "sfx", "voice", "font", "video"];

export const Route = createFileRoute("/projects/$projectId/assets")({
  component: AssetsPage,
});

function AssetsPage() {
  const { projectId } = useParams({ from: "/projects/$projectId/assets" });
  const project = useStore((s) => s.getProject(projectId))!;
  const checkpoint = useStore((s) => s.settings.comfy.checkpoint);
  const addAsset = useStore((s) => s.addAsset);
  const updateAsset = useStore((s) => s.updateAsset);
  const deleteAsset = useStore((s) => s.deleteAsset);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AssetKind>("background");

  return (
    <div className="space-y-4 overflow-y-auto p-6">
      <div className="flex gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v as AssetKind)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Asset name (e.g. bg_alley_night)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          onClick={() => {
            if (!name.trim()) return;
            addAsset(projectId, { name: name.trim(), kind, source: "url" });
            setName("");
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>
      {project.assets.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          No assets yet. ComfyUI generation arrives in the next slice — for now you can record
          prompts and paste URLs from your own generations.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {project.assets.map((a) => (
            <Card key={a.id}>
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-xs uppercase tracking-wider text-muted-foreground">
                    {a.kind}
                  </span>
                  <Input
                    value={a.name}
                    onChange={(e) => updateAsset(projectId, a.id, { name: e.target.value })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Delete asset ${a.name}?`)) deleteAsset(projectId, a.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div>
                  <Label>URL or file path</Label>
                  <Input
                    value={a.url ?? ""}
                    onChange={(e) => updateAsset(projectId, a.id, { url: e.target.value })}
                    placeholder="https://… or file://…"
                  />
                </div>
                <div>
                  <Label>Generation prompt</Label>
                  <Textarea
                    value={a.prompt ?? ""}
                    onChange={(e) => updateAsset(projectId, a.id, { prompt: e.target.value })}
                  />
                </div>
                {a.url &&
                  (a.kind === "background" || a.kind === "sprite" || a.kind === "cg") && (
                    <img
                      src={a.url}
                      alt={a.name}
                      className="max-h-40 rounded border border-border object-contain"
                    />
                  )}
                {(a.kind === "background" || a.kind === "sprite" || a.kind === "cg") && (
                  <GenerateImageButton
                    label={a.url ? "Regenerate" : "Generate"}
                    disabled={!checkpoint || !(a.prompt ?? "").trim()}
                    workflow={
                      a.kind === "background"
                        ? PRESETS.background(checkpoint, a.prompt ?? a.name)
                        : a.kind === "cg"
                          ? PRESETS.cg(checkpoint, a.prompt ?? a.name)
                          : PRESETS.characterPortrait(checkpoint, a.prompt ?? a.name)
                    }
                    onDone={(url) =>
                      updateAsset(projectId, a.id, { url, source: "generated" })
                    }
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
        </div>
      )}
    </div>
  );
}
