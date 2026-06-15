// RPG Maker MV / MZ → VN Builder importer.
//
// Reads the JSON data files an RPG Maker project ships in `data/`:
//   - System.json     → game title, character name list
//   - Actors.json     → playable characters (id, name, profile, faceName)
//   - CommonEvents.json + MapXXX.json → event command lists with dialogue
//
// We extract every "Show Text" (code 401/101) sequence as a scene, attribute
// it to an actor when the speaker face matches, and preserve "Show Choices"
// (code 102/402) as branching choices. Everything else is dropped into a
// per-scene note so the user can see what they need to re-implement by hand.
//
// This is intentionally tolerant — corrupt or non-standard JSON files just
// produce a warning and are skipped, never an exception.

import { nanoid } from "nanoid";
import type {
  Project,
  Scene,
  ScriptLine,
  Character,
  Asset,
  AssetKind,
} from "./types";

export interface RawJsonFile {
  /** Path relative to project root, e.g. "data/Actors.json" or "img/faces/Actor1.png". */
  rel: string;
  /** Absolute path on disk. */
  abs: string;
  /** Parsed JSON contents (data files only). Undefined for binary assets. */
  json?: unknown;
}

export interface RpgMakerImportInput {
  name: string;
  /** All `data/*.json` files, parsed. */
  dataFiles: RawJsonFile[];
  /** All `img/**` and `audio/**` asset files (binary, no `json`). */
  assetFiles: RawJsonFile[];
  /** Turn an absolute path into a renderable URL. */
  resolveAssetUrl: (abs: string) => string;
}

export interface RpgImportLogEntry {
  level: "info" | "warn";
  message: string;
}

export interface RpgMakerImportResult {
  project: Project;
  log: RpgImportLogEntry[];
}

// ---------------- helpers ----------------

interface RmActor {
  id: number;
  name: string;
  profile?: string;
  faceName?: string;
  faceIndex?: number;
}

interface RmEventCommand {
  code: number;
  indent?: number;
  parameters: unknown[];
}

interface RmMap {
  displayName?: string;
  events?: (null | {
    id: number;
    name?: string;
    pages?: { list: RmEventCommand[] }[];
  })[];
}

interface RmCommonEvent {
  id: number;
  name?: string;
  list: RmEventCommand[];
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "x"
  );
}

function kindForRpgAsset(rel: string): AssetKind | null {
  const p = rel.replace(/\\/g, "/").toLowerCase();
  if (p.startsWith("img/parallaxes/") || p.startsWith("img/titles1/")) return "background";
  if (p.startsWith("img/pictures/")) return "cg";
  if (p.startsWith("img/faces/") || p.startsWith("img/characters/")) return "sprite";
  if (p.startsWith("audio/bgm/") || p.startsWith("audio/bgs/")) return "music";
  if (p.startsWith("audio/se/")) return "sfx";
  if (p.startsWith("audio/me/")) return "music";
  return null;
}

/** Find first non-null entry that looks like an Actors array. */
function pickArray<T>(json: unknown): T[] {
  if (Array.isArray(json)) return json.filter((x) => x != null) as T[];
  return [];
}

// ---------------- main importer ----------------

export function importRpgMakerProject(
  input: RpgMakerImportInput,
): RpgMakerImportResult {
  const log: RpgImportLogEntry[] = [];
  const warn = (m: string) => log.push({ level: "warn", message: m });
  const info = (m: string) => log.push({ level: "info", message: m });

  const byRel = new Map(input.dataFiles.map((f) => [f.rel.toLowerCase(), f]));
  const get = (rel: string) => byRel.get(rel.toLowerCase());

  // ---- characters from Actors.json ----
  const characters: Character[] = [];
  const charByFaceKey = new Map<string, Character>(); // "faceName:index" → character
  const charByName = new Map<string, Character>();

  const actorsFile = get("data/Actors.json") ?? get("Actors.json");
  if (actorsFile?.json) {
    const arr = pickArray<RmActor>(actorsFile.json);
    for (const a of arr) {
      if (!a?.name) continue;
      const c: Character = {
        id: nanoid(8),
        name: a.name,
        role: "",
        personality: a.profile?.replace(/\\[A-Za-z]\[\d+\]/g, "").trim() ?? "",
        voiceStyle: "",
        outfit: "",
        palette: "",
        expressions: [{ name: "neutral" }],
      };
      characters.push(c);
      charByName.set(slug(a.name), c);
      if (a.faceName) {
        charByFaceKey.set(`${a.faceName}:${a.faceIndex ?? 0}`, c);
      }
    }
    info(`Imported ${characters.length} actor(s) from Actors.json`);
  } else {
    warn("data/Actors.json not found — no characters imported.");
  }

  // ---- assets ----
  const assets: Asset[] = [];
  for (const f of input.assetFiles) {
    const kind = kindForRpgAsset(f.rel);
    if (!kind) continue;
    const base = f.rel.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
    assets.push({
      id: nanoid(8),
      kind,
      name: base,
      source: "imported",
      url: input.resolveAssetUrl(f.abs),
    });
  }
  info(`Imported ${assets.length} asset(s).`);

  // ---- scenes from CommonEvents + Map events ----
  const scenes: Scene[] = [];

  function parseCommandList(
    list: RmEventCommand[],
    sceneTitle: string,
  ): Scene | null {
    const lines: ScriptLine[] = [];
    let activeFace: string | null = null; // "faceName:index"
    let textBuffer: string[] = [];
    let speaker: Character | null = null;

    const flushDialogue = () => {
      if (textBuffer.length === 0) return;
      const text = textBuffer.join("\n").replace(/\\[A-Za-z]\[\d+\]/g, "").trim();
      textBuffer = [];
      if (!text) return;
      if (speaker) {
        lines.push({
          id: nanoid(8),
          type: "dialogue",
          characterId: speaker.id,
          text,
        });
      } else {
        lines.push({ id: nanoid(8), type: "narration", text });
      }
    };

    for (let i = 0; i < list.length; i++) {
      const cmd = list[i];
      if (!cmd) continue;
      switch (cmd.code) {
        case 101: {
          // Show Text header: [faceName, faceIndex, background, position]
          flushDialogue();
          const faceName = String(cmd.parameters[0] ?? "");
          const faceIndex = Number(cmd.parameters[1] ?? 0);
          activeFace = faceName ? `${faceName}:${faceIndex}` : null;
          speaker = activeFace ? (charByFaceKey.get(activeFace) ?? null) : null;
          break;
        }
        case 401: {
          // Show Text body line
          textBuffer.push(String(cmd.parameters[0] ?? ""));
          break;
        }
        case 102: {
          // Show Choices header: [choices[], cancelType, defaultType, ...]
          flushDialogue();
          const opts = pickArray<string>(cmd.parameters[0]);
          lines.push({
            id: nanoid(8),
            type: "choice",
            text: "",
            choices: opts.map((label) => ({ id: nanoid(6), label })),
          });
          break;
        }
        case 132:
        case 241: {
          // Change Battle BGM / Play BGM
          const audio = cmd.parameters[0] as { name?: string } | undefined;
          if (audio?.name) {
            flushDialogue();
            lines.push({ id: nanoid(8), type: "music", text: audio.name });
          }
          break;
        }
        case 250: {
          // Play SE
          const audio = cmd.parameters[0] as { name?: string } | undefined;
          if (audio?.name) {
            flushDialogue();
            lines.push({ id: nanoid(8), type: "sfx", text: audio.name });
          }
          break;
        }
        case 284: {
          // Change Parallax
          const bg = String(cmd.parameters[0] ?? "");
          if (bg) {
            flushDialogue();
            lines.push({ id: nanoid(8), type: "note", text: `__BACKGROUND__:${bg}` });
          }
          break;
        }
        case 221:
        case 222:
        case 223: {
          flushDialogue();
          lines.push({ id: nanoid(8), type: "transition", text: "fade" });
          break;
        }
        case 0:
          // End of event / blank — ignore
          break;
        default: {
          // Preserve as note so users see what wasn't translated.
          flushDialogue();
          lines.push({
            id: nanoid(8),
            type: "note",
            text: `RPG Maker command ${cmd.code} not auto-converted.`,
          });
        }
      }
    }
    flushDialogue();

    // Skip empty stub events.
    if (lines.filter((l) => l.type === "dialogue" || l.type === "narration").length === 0) {
      return null;
    }
    return { id: nanoid(8), title: sceneTitle, lines };
  }

  // CommonEvents
  const ceFile = get("data/CommonEvents.json") ?? get("CommonEvents.json");
  if (ceFile?.json) {
    const arr = pickArray<RmCommonEvent>(ceFile.json);
    for (const ce of arr) {
      if (!Array.isArray(ce?.list)) continue;
      const scene = parseCommandList(ce.list, `Common: ${ce.name || `Event ${ce.id}`}`);
      if (scene) scenes.push(scene);
    }
  }

  // MapXXX.json files
  const mapFiles = input.dataFiles
    .filter((f) => /(^|\/)Map\d+\.json$/i.test(f.rel))
    .sort((a, b) => a.rel.localeCompare(b.rel));
  for (const mf of mapFiles) {
    const map = mf.json as RmMap | undefined;
    if (!map?.events) continue;
    const mapName = map.displayName || mf.rel.replace(/^.*\//, "").replace(/\.json$/i, "");
    for (const ev of map.events) {
      if (!ev?.pages) continue;
      for (let pi = 0; pi < ev.pages.length; pi++) {
        const page = ev.pages[pi];
        if (!Array.isArray(page?.list)) continue;
        const title = `${mapName} / ${ev.name || `Event ${ev.id}`}${ev.pages.length > 1 ? ` (page ${pi + 1})` : ""}`;
        const scene = parseCommandList(page.list, title);
        if (scene) scenes.push(scene);
      }
    }
  }

  info(`Built ${scenes.length} scene(s) from events.`);

  // ---- finalize project ----
  // Determine title from System.json if present.
  let displayName = input.name;
  const sysFile = get("data/System.json") ?? get("System.json");
  const sysJson = sysFile?.json as { gameTitle?: string } | undefined;
  if (sysJson?.gameTitle) displayName = sysJson.gameTitle;

  const project: Project = {
    id: nanoid(10),
    name: displayName,
    genre: "RPG",
    description: "Imported from RPG Maker MV/MZ.",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    scenes,
    characters,
    lorebook: [],
    assets,
  };

  return { project, log };
}
