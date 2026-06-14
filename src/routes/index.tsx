import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BookOpenText, Copy, FolderInput, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { bridge, isElectron } from "@/lib/bridge";
import { GENRES, type Genre } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VN Builder Studio" },
      { name: "description", content: "Local visual novel studio with AI assist." },
    ],
  }),
  component: Index,
});

function Index() {
  const { projects, loaded, load, createProject, deleteProject, duplicateProject } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [genre, setGenre] = useState<Genre>("Visual Novel");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  async function create() {
    if (!name.trim()) return;
    const p = await createProject(name.trim(), genre, desc.trim());
    setOpen(false);
    setName("");
    setDesc("");
    toast.success("Project created");
    navigate({ to: "/projects/$projectId/scenes", params: { projectId: p.id } });
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Each project is a standalone visual novel.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1 h-4 w-4" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a new project</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My First VN"
                  />
                </div>
                <div>
                  <Label>Genre</Label>
                  <Select value={genre} onValueChange={(v) => setGenre(v as Genre)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GENRES.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="desc">One-line description</Label>
                  <Textarea
                    id="desc"
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="A short pitch for your story."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={create} disabled={!name.trim()}>
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {projects.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-20 text-center">
            <BookOpenText className="h-10 w-10 text-muted-foreground" />
            <div className="text-lg font-medium">No projects yet</div>
            <div className="text-sm text-muted-foreground">
              Create your first project to start writing.
            </div>
            <Button className="mt-2" onClick={() => setOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              New Project
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <Card key={p.id} className="group flex flex-col gap-3 p-5">
                <div
                  className="cursor-pointer"
                  onClick={() =>
                    navigate({
                      to: "/projects/$projectId/scenes",
                      params: { projectId: p.id },
                    })
                  }
                >
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    {p.genre}
                  </div>
                  <div className="mt-1 text-lg font-semibold">{p.name}</div>
                  <div className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                    {p.description || "No description"}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                  <span>
                    {p.scenes.length} scenes · {p.characters.length} chars
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => duplicateProject(p.id)}
                      title="Duplicate"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete "${p.name}"? This cannot be undone.`))
                          deleteProject(p.id);
                      }}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
