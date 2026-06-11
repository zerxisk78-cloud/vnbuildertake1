// Domain types for VN Builder Studio

export type Genre =
  | "Visual Novel"
  | "Romance"
  | "Mystery"
  | "Horror"
  | "Fantasy"
  | "Sci-Fi"
  | "Historical"
  | "Slice of Life"
  | "Simulation"
  | "RPG";

export const GENRES: Genre[] = [
  "Visual Novel",
  "Romance",
  "Mystery",
  "Horror",
  "Fantasy",
  "Sci-Fi",
  "Historical",
  "Slice of Life",
  "Simulation",
  "RPG",
];

export type LineType =
  | "dialogue"
  | "narration"
  | "choice"
  | "sfx"
  | "music"
  | "transition"
  | "show"
  | "hide"
  | "note";

export interface ScriptLine {
  id: string;
  type: LineType;
  /** Character id for dialogue / show / hide. */
  characterId?: string;
  /** Expression name for dialogue / show. */
  expression?: string;
  /** Main text content (dialogue text, narration, sfx name, music name, etc.) */
  text: string;
  /** For choices: array of { label, gotoSceneId } */
  choices?: { id: string; label: string; gotoSceneId?: string }[];
  /** Generated voice URL (XTTS blob URL or ComfyUI /view URL). */
  voiceUrl?: string;
  /** Optional notes */
  note?: string;
}

export interface Scene {
  id: string;
  title: string;
  /** Background asset id OR free-form prompt */
  background?: string;
  backgroundPrompt?: string;
  music?: string;
  musicPrompt?: string;
  ambient?: string;
  lines: ScriptLine[];
}

export interface Character {
  id: string;
  name: string;
  role: string;
  personality: string;
  voiceStyle: string;
  outfit: string;
  palette: string;
  portraitUrl?: string;
  portraitPrompt?: string;
  expressions: { name: string; url?: string; prompt?: string }[];
}

export interface LoreEntry {
  id: string;
  title: string;
  keywords: string[];
  body: string;
}

export type AssetKind =
  | "background"
  | "sprite"
  | "cg"
  | "music"
  | "sfx"
  | "voice"
  | "font"
  | "video";

export interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  source: "generated" | "imported" | "url";
  url?: string;
  prompt?: string;
  seed?: number;
  workflow?: string;
}

export interface Project {
  id: string;
  name: string;
  genre: Genre;
  description: string;
  coverUrl?: string;
  createdAt: number;
  updatedAt: number;
  scenes: Scene[];
  characters: Character[];
  lorebook: LoreEntry[];
  assets: Asset[];
}

export interface OllamaSettings {
  url: string;
  model: string;
  temperature: number;
  contextLength: number;
}

export interface ComfySettings {
  url: string;
  path: string;
  autoLaunch: boolean;
  extraArgs: string;
  /** Selected SDXL checkpoint filename, e.g. "sd_xl_base_1.0.safetensors". */
  checkpoint: string;
}

export interface XttsSettings {
  url: string;
  path: string;
  autoLaunch: boolean;
  language: string;
  defaultSpeaker: string;
}

export interface RenpySettings {
  sdkPath: string;
}

export interface Settings {
  ollama: OllamaSettings;
  comfy: ComfySettings;
  xtts: XttsSettings;
  renpy: RenpySettings;
}

export const DEFAULT_SETTINGS: Settings = {
  ollama: {
    url: "http://localhost:11434",
    model: "",
    temperature: 0.8,
    contextLength: 8192,
  },
  comfy: {
    url: "http://127.0.0.1:8188",
    path: "",
    autoLaunch: false,
    extraArgs: "",
    checkpoint: "",
  },
  xtts: {
    url: "http://127.0.0.1:8020",
    path: "",
    autoLaunch: false,
    language: "en",
    defaultSpeaker: "female_01",
  },
  renpy: { sdkPath: "" },
};

export type DepStatus = "running" | "installed" | "missing" | "unknown";
export type DepSource = "running" | "installed" | "missing";

export interface DepReport {
  name: string;
  status: DepStatus;
  source: DepSource;
  path?: string;
  version?: string;
  port?: number;
  detail?: string;
  /** For Ollama: available pulled models. */
  models?: string[];
}
