import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { GenerateImageButton } from "@/components/GenerateImageButton";
import { PRESETS } from "@/lib/workflows";
import { EXPRESSION_PRESETS } from "@/lib/expression-presets";
import { runWorkflow } from "@/lib/comfy";
import { toast } from "sonner";

export const Route = createFileRoute("/projects/$projectId/characters")({
  component: CharactersPage,
});

function CharactersPage() {
  const { projectId } = useParams({ from: "/projects/$projectId/characters" });
  const project = useStore((s) => s.getProject(projectId))!;
  const checkpoint = useStore((s) => s.settings.comfy.checkpoint);
  const addCharacter = useStore((s) => s.addCharacter);
  const updateCharacter = useStore((s) => s.updateCharacter);
  const deleteCharacter = useStore((s) => s.deleteCharacter);
  const addAsset = useStore((s) => s.addAsset);
  const comfyUrl = useStore((s) => s.settings.comfy.url);
  const [name, setName] = useState("");
  const [batching, setBatching] = useState<string | null>(null);
  const [batchMsg, setBatchMsg] = useState("");

  async function batchExpressions(charId: string) {
    const c = project.characters.find((x) => x.id === charId);
    if (!c || !checkpoint) return;
    const base = c.portraitPrompt ?? c.name;
    const seed = Math.floor(Math.random() * 2_147_483_647);
    setBatching(charId);
    try {
      const next: { name: string; url?: string; prompt?: string }[] = [];
      for (let i = 0; i < EXPRESSION_PRESETS.length; i++) {
        const e = EXPRESSION_PRESETS[i];
        setBatchMsg(`${i + 1} / ${EXPRESSION_PRESETS.length} · ${e.name}`);
        try {
          const wf = PRESETS.characterExpression(checkpoint, base, e.suffix, seed);
          const images = await runWorkflow({ url: comfyUrl, workflow: wf });
          const url = images[0]?.url;
          next.push({ name: e.name, url, prompt: `${base}, ${e.suffix}` });
          if (url) {
            await addAsset(projectId, {
              kind: "sprite",
              name: `${c.name}_${e.name}`,
              source: "generated",
              url,
              prompt: `${base}, ${e.suffix}`,
              seed,
              workflow: "characterExpression",
            });
          }
        } catch (err) {
          toast.error(`${e.name}: ${(err as Error).message}`);
          next.push({ name: e.name });
        }
      }
      await updateCharacter(projectId, charId, { expressions: next });
      toast.success(`Generated ${next.filter((x) => x.url).length} / ${EXPRESSION_PRESETS.length} expressions for ${c.name}`);
    } finally {
      setBatching(null);
      setBatchMsg("");
    }
  }

  return (
    <div className="space-y-4 overflow-y-auto p-6">
      <div className="flex gap-2">
        <Input
          placeholder="New character name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) {
              addCharacter(projectId, name.trim());
              setName("");
            }
          }}
        />
        <Button
          onClick={() => {
            if (name.trim()) {
              addCharacter(projectId, name.trim());
              setName("");
            }
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>
      {project.characters.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          No characters yet. ComfyUI portrait generation arrives in the next slice.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {project.characters.map((c) => (
            <Card key={c.id}>
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-center gap-2">
                  <Input
                    className="text-base font-semibold"
                    value={c.name}
                    onChange={(e) => updateCharacter(projectId, c.id, { name: e.target.value })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Delete ${c.name}?`)) deleteCharacter(projectId, c.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div>
                  <Label>Role</Label>
                  <Input
                    value={c.role}
                    onChange={(e) => updateCharacter(projectId, c.id, { role: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Personality</Label>
                  <Textarea
                    value={c.personality}
                    onChange={(e) =>
                      updateCharacter(projectId, c.id, { personality: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Voice style (for XTTS)</Label>
                  <Input
                    value={c.voiceStyle}
                    onChange={(e) =>
                      updateCharacter(projectId, c.id, { voiceStyle: e.target.value })
                    }
                    placeholder="warm female alto, slight rasp"
                  />
                </div>
                <div>
                  <Label>Portrait prompt</Label>
                  <Textarea
                    value={c.portraitPrompt ?? ""}
                    onChange={(e) =>
                      updateCharacter(projectId, c.id, { portraitPrompt: e.target.value })
                    }
                    placeholder="masterpiece, full body, …"
                  />
                </div>
                {c.portraitUrl && (
                  <img
                    src={c.portraitUrl}
                    alt={`${c.name} portrait`}
                    className="max-h-56 rounded border border-border object-contain"
                  />
                )}
                <div className="flex items-center gap-2">
                  <GenerateImageButton
                    label="Generate portrait"
                    disabled={!checkpoint || !(c.portraitPrompt ?? "").trim()}
                    workflow={PRESETS.characterPortrait(
                      checkpoint,
                      c.portraitPrompt ?? c.name,
                    )}
                    onDone={async (url) => {
                      await updateCharacter(projectId, c.id, { portraitUrl: url });
                      await addAsset(projectId, {
                        kind: "sprite",
                        name: `${c.name}_portrait`,
                        source: "generated",
                        url,
                        prompt: c.portraitPrompt,
                        workflow: "characterPortrait",
                      });
                      toast.success(`Saved portrait for ${c.name}`);
                    }}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!checkpoint || batching === c.id}
                    onClick={() => batchExpressions(c.id)}
                    title="Generate the full Ren'Py expression set with a shared seed for consistent face identity"
                  >
                    {batching === c.id ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="mr-1 h-4 w-4" />
                    )}
                    {batching === c.id ? batchMsg || "Working…" : "Batch expressions"}
                  </Button>
                </div>
                {c.expressions.some((e) => e.url) && (
                  <div className="flex flex-wrap gap-2">
                    {c.expressions
                      .filter((e) => e.url)
                      .map((e) => (
                        <div key={e.name} className="text-center">
                          <img
                            src={e.url}
                            alt={e.name}
                            className="h-20 w-16 rounded border border-border object-cover"
                          />
                          <div className="mt-1 text-[10px] text-muted-foreground">{e.name}</div>
                        </div>
                      ))}
                  </div>
                )}
                {!checkpoint && (
                  <p className="text-xs text-muted-foreground">
                    Pick an SDXL checkpoint in Settings to enable generation.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
