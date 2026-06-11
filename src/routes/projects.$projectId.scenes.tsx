import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, Play } from "lucide-react";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/lib/store";
import type { LineType, ScriptLine, Scene } from "@/lib/types";
import { renderSceneRpy } from "@/lib/renpy";
import { GenerateAudioButton } from "@/components/GenerateAudioButton";
import { GenerateVoiceButton } from "@/components/GenerateVoiceButton";
import { AUDIO_PRESETS } from "@/lib/audio-workflows";

export const Route = createFileRoute("/projects/$projectId/scenes")({
  component: ScenesPage,
});

const LINE_TYPES: { value: LineType; label: string }[] = [
  { value: "dialogue", label: "Dialogue" },
  { value: "narration", label: "Narration" },
  { value: "choice", label: "Choice" },
  { value: "sfx", label: "SFX" },
  { value: "music", label: "Music change" },
  { value: "transition", label: "Transition" },
  { value: "show", label: "Show sprite" },
  { value: "hide", label: "Hide sprite" },
  { value: "note", label: "Dev note" },
];

function ScenesPage() {
  const { projectId } = useParams({ from: "/projects/$projectId/scenes" });
  const project = useStore((s) => s.getProject(projectId))!;
  const addScene = useStore((s) => s.addScene);
  const updateScene = useStore((s) => s.updateScene);
  const deleteScene = useStore((s) => s.deleteScene);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [newTitle, setNewTitle] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    project.scenes[0]?.id ?? null,
  );

  const selected = project.scenes.find((s) => s.id === selectedId) ?? project.scenes[0];

  async function add() {
    if (!newTitle.trim()) return;
    const s = await addScene(projectId, newTitle.trim());
    setNewTitle("");
    setSelectedId(s.id);
    setExpanded((e) => ({ ...e, [s.id]: true }));
  }

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[300px_1fr_360px]">
      {/* SCENE LIST */}
      <div className="flex min-h-0 flex-col border-r border-border">
        <div className="border-b border-border p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Scenes
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="New scene title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <Button size="icon" onClick={add}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {project.scenes.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No scenes yet.</div>
          ) : (
            <div className="space-y-1">
              {project.scenes.map((s, i) => {
                const isOpen = expanded[s.id];
                const isSelected = selected?.id === s.id;
                return (
                  <div key={s.id}>
                    <button
                      className={
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary " +
                        (isSelected ? "bg-secondary text-foreground" : "text-muted-foreground")
                      }
                      onClick={() => {
                        setSelectedId(s.id);
                        setExpanded((e) => ({ ...e, [s.id]: !e[s.id] }));
                      }}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      <span className="text-xs text-muted-foreground">{i + 1}.</span>
                      <span className="flex-1 truncate">{s.title}</span>
                      <span className="text-xs">{s.lines.length}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* SCENE EDITOR */}
      <div className="flex min-h-0 flex-col">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Create a scene to start writing.
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col overflow-y-auto p-6">
            <div className="mb-4 flex items-start gap-3">
              <Input
                className="text-lg font-semibold"
                value={selected.title}
                onChange={(e) => updateScene(projectId, selected.id, { title: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (confirm(`Delete scene "${selected.title}"?`)) {
                    deleteScene(projectId, selected.id);
                    setSelectedId(null);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label>Background prompt</Label>
                <Textarea
                  value={selected.backgroundPrompt ?? ""}
                  placeholder="A rainy noir alleyway at midnight, neon reflections…"
                  onChange={(e) =>
                    updateScene(projectId, selected.id, { backgroundPrompt: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Music prompt</Label>
                <Textarea
                  value={selected.musicPrompt ?? ""}
                  placeholder="Slow jazz piano with light rain ambience…"
                  onChange={(e) =>
                    updateScene(projectId, selected.id, { musicPrompt: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="mt-6 mb-2 flex items-center justify-between">
              <Label>Script</Label>
              <NewLineButton projectId={projectId} scene={selected} />
            </div>
            <LineList projectId={projectId} scene={selected} />
          </div>
        )}
      </div>

      {/* RENPY PREVIEW */}
      <div className="hidden min-h-0 flex-col border-l border-border md:flex">
        <div className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Ren'Py preview
        </div>
        <pre className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-muted-foreground">
          {selected ? renderSceneRpy(selected, project) : "// no scene selected"}
        </pre>
      </div>
    </div>
  );
}

function NewLineButton({ projectId, scene }: { projectId: string; scene: Scene }) {
  const updateScene = useStore((s) => s.updateScene);
  const [type, setType] = useState<LineType>("dialogue");
  async function add() {
    const line: ScriptLine = { id: nanoid(8), type, text: "" };
    if (type === "choice") line.choices = [{ id: nanoid(6), label: "" }];
    await updateScene(projectId, scene.id, { lines: [...scene.lines, line] });
  }
  return (
    <div className="flex items-center gap-2">
      <Select value={type} onValueChange={(v) => setType(v as LineType)}>
        <SelectTrigger className="h-8 w-[150px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LINE_TYPES.map((l) => (
            <SelectItem key={l.value} value={l.value}>
              {l.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={add}>
        <Plus className="mr-1 h-3 w-3" /> Add line
      </Button>
    </div>
  );
}

function LineList({ projectId, scene }: { projectId: string; scene: Scene }) {
  const updateScene = useStore((s) => s.updateScene);
  const project = useStore((s) => s.getProject(projectId))!;

  function updateLine(id: string, patch: Partial<ScriptLine>) {
    updateScene(projectId, scene.id, {
      lines: scene.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    });
  }
  function removeLine(id: string) {
    updateScene(projectId, scene.id, { lines: scene.lines.filter((l) => l.id !== id) });
  }
  function moveLine(idx: number, dir: -1 | 1) {
    const out = scene.lines.slice();
    const t = out[idx + dir];
    if (!t) return;
    out[idx + dir] = out[idx];
    out[idx] = t;
    updateScene(projectId, scene.id, { lines: out });
  }

  if (scene.lines.length === 0) {
    return (
      <Card className="border-dashed p-6 text-center text-sm text-muted-foreground">
        No lines yet. Add a Dialogue, Narration, or Choice above.
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {scene.lines.map((l, i) => (
        <Card key={l.id} className="p-3">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded bg-secondary px-1.5 py-0.5 uppercase tracking-wider">
              {l.type}
            </span>
            <span>#{i + 1}</span>
            <div className="ml-auto flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => moveLine(i, -1)} disabled={i === 0}>
                ↑
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => moveLine(i, 1)}
                disabled={i === scene.lines.length - 1}
              >
                ↓
              </Button>
              <Button size="icon" variant="ghost" onClick={() => removeLine(l.id)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          </div>

          {(l.type === "dialogue" || l.type === "show" || l.type === "hide") && (
            <div className="mb-2 grid grid-cols-2 gap-2">
              <Select
                value={l.characterId ?? ""}
                onValueChange={(v) => updateLine(l.id, { characterId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Character" />
                </SelectTrigger>
                <SelectContent>
                  {project.characters.length === 0 && (
                    <SelectItem value="_none" disabled>
                      No characters yet — add one in Characters tab
                    </SelectItem>
                  )}
                  {project.characters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(l.type === "dialogue" || l.type === "show") && (
                <Input
                  placeholder="Expression (neutral, happy…)"
                  value={l.expression ?? ""}
                  onChange={(e) => updateLine(l.id, { expression: e.target.value })}
                />
              )}
            </div>
          )}

          {l.type !== "hide" && l.type !== "choice" && (
            <Textarea
              value={l.text}
              onChange={(e) => updateLine(l.id, { text: e.target.value })}
              placeholder={
                l.type === "dialogue"
                  ? "Line of dialogue…"
                  : l.type === "narration"
                    ? "Narration…"
                    : l.type === "sfx"
                      ? "sfx_door_creak"
                      : l.type === "music"
                        ? "music_main_theme"
                        : l.type === "transition"
                          ? "dissolve"
                          : "Note…"
              }
              className="min-h-[60px]"
            />
          )}

          {l.type === "choice" && (
            <div className="space-y-2">
              {(l.choices ?? []).map((c, ci) => (
                <div key={c.id} className="flex items-center gap-2">
                  <Input
                    placeholder={`Choice ${ci + 1}`}
                    value={c.label}
                    onChange={(e) =>
                      updateLine(l.id, {
                        choices: l.choices!.map((x) =>
                          x.id === c.id ? { ...x, label: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <Select
                    value={c.gotoSceneId ?? ""}
                    onValueChange={(v) =>
                      updateLine(l.id, {
                        choices: l.choices!.map((x) =>
                          x.id === c.id ? { ...x, gotoSceneId: v } : x,
                        ),
                      })
                    }
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Go to scene…" />
                    </SelectTrigger>
                    <SelectContent>
                      {project.scenes.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      updateLine(l.id, {
                        choices: l.choices!.filter((x) => x.id !== c.id),
                      })
                    }
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  updateLine(l.id, {
                    choices: [...(l.choices ?? []), { id: nanoid(6), label: "" }],
                  })
                }
              >
                <Plus className="mr-1 h-3 w-3" /> Add choice
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
