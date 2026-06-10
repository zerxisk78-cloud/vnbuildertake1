import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/projects/$projectId/characters")({
  component: CharactersPage,
});

function CharactersPage() {
  const { projectId } = useParams({ from: "/projects/$projectId/characters" });
  const project = useStore((s) => s.getProject(projectId))!;
  const addCharacter = useStore((s) => s.addCharacter);
  const updateCharacter = useStore((s) => s.updateCharacter);
  const deleteCharacter = useStore((s) => s.deleteCharacter);
  const [name, setName] = useState("");

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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
