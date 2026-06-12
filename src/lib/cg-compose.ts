// Compose a CG (story illustration) prompt from a scene's context.
// Pulls background, characters present in the scene (via show lines), and
// an optional "moment" description into a single prompt.

import type { Project, Scene } from "./types";

export interface ComposeOptions {
  scene: Scene;
  project: Project;
  /** Free-form description of the moment, e.g. "they share an umbrella in the rain". */
  moment?: string;
}

export function composeCgPrompt({ scene, project, moment }: ComposeOptions): string {
  const presentCharIds = new Set<string>();
  for (const l of scene.lines) {
    if ((l.type === "show" || l.type === "dialogue") && l.characterId) {
      presentCharIds.add(l.characterId);
    }
  }
  const chars = project.characters
    .filter((c) => presentCharIds.has(c.id))
    .map((c) => {
      const desc = [c.role, c.outfit, c.palette].filter(Boolean).join(", ");
      return desc ? `${c.name} (${desc})` : c.name;
    });

  const parts: string[] = [];
  if (scene.backgroundPrompt) parts.push(`setting: ${scene.backgroundPrompt}`);
  if (chars.length) parts.push(`featuring ${chars.join(" and ")}`);
  if (moment) parts.push(moment);
  if (parts.length === 0) parts.push(scene.title);
  return parts.join(", ");
}
