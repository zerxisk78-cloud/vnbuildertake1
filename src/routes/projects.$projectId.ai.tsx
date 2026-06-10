import { createFileRoute, useParams } from "@tanstack/react-router";
import { OllamaChat } from "@/components/OllamaChat";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/projects/$projectId/ai")({
  component: AIPage,
});

function AIPage() {
  const { projectId } = useParams({ from: "/projects/$projectId/ai" });
  const project = useStore((s) => s.getProject(projectId))!;
  function buildContext() {
    return JSON.stringify(
      {
        name: project.name,
        genre: project.genre,
        description: project.description,
        characters: project.characters.map((c) => ({
          id: c.id,
          name: c.name,
          role: c.role,
          personality: c.personality,
          voiceStyle: c.voiceStyle,
        })),
        scenes: project.scenes.map((s) => ({
          id: s.id,
          title: s.title,
          backgroundPrompt: s.backgroundPrompt,
          musicPrompt: s.musicPrompt,
          lines: s.lines.slice(0, 30),
        })),
        lorebook: project.lorebook,
        assets: project.assets.map((a) => ({ id: a.id, kind: a.kind, name: a.name })),
      },
      null,
      2,
    );
  }
  return (
    <div className="h-full">
      <OllamaChat projectId={projectId} contextBuilder={buildContext} />
    </div>
  );
}
