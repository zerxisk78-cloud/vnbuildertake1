import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/projects/$projectId/lorebook")({
  component: LorebookPage,
});

function LorebookPage() {
  const { projectId } = useParams({ from: "/projects/$projectId/lorebook" });
  const project = useStore((s) => s.getProject(projectId))!;
  const addLore = useStore((s) => s.addLore);
  const updateLore = useStore((s) => s.updateLore);
  const deleteLore = useStore((s) => s.deleteLore);
  const [title, setTitle] = useState("");

  return (
    <div className="space-y-4 overflow-y-auto p-6">
      <div className="flex gap-2">
        <Input
          placeholder="New entry title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && title.trim()) {
              addLore(projectId, title.trim());
              setTitle("");
            }
          }}
        />
        <Button
          onClick={() => {
            if (title.trim()) {
              addLore(projectId, title.trim());
              setTitle("");
            }
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>
      {project.lorebook.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          No entries yet. Lore is injected into AI prompts when its keywords appear.
        </Card>
      ) : (
        <div className="space-y-3">
          {project.lorebook.map((l) => (
            <Card key={l.id}>
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-center gap-2">
                  <Input
                    className="text-base font-semibold"
                    value={l.title}
                    onChange={(e) => updateLore(projectId, l.id, { title: e.target.value })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Delete "${l.title}"?`)) deleteLore(projectId, l.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div>
                  <Label>Trigger keywords (comma separated)</Label>
                  <Input
                    value={l.keywords.join(", ")}
                    onChange={(e) =>
                      updateLore(projectId, l.id, {
                        keywords: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Body</Label>
                  <Textarea
                    value={l.body}
                    onChange={(e) => updateLore(projectId, l.id, { body: e.target.value })}
                    className="min-h-[120px]"
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
