// Bridge that talks to Electron via window.lovableApi when present,
// otherwise falls back to localStorage so the web preview is usable.

import type { Project, Settings, DepReport } from "./types";
import { DEFAULT_SETTINGS } from "./types";

declare global {
  interface Window {
    lovableApi?: LovableApi;
  }
}

export interface LovableApi {
  isElectron: true;
  listProjects(): Promise<Project[]>;
  readProject(id: string): Promise<Project | null>;
  writeProject(project: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;
  readSettings(): Promise<Settings>;
  writeSettings(s: Settings): Promise<void>;
  detectAll(): Promise<Record<string, DepReport>>;
  detect(name: string): Promise<DepReport>;
  pickFolder(title?: string): Promise<string | null>;
  spawnService(name: "comfy" | "xtts" | "ollama"): Promise<{ ok: boolean; error?: string }>;
  stopService(name: "comfy" | "xtts" | "ollama"): Promise<void>;
  serviceStatus(): Promise<Record<string, "stopped" | "starting" | "managed" | "attached" | "error">>;
  exportRenpy(projectId: string, targetDir: string, contents: Record<string, string>): Promise<string>;
  downloadAssets(
    targetDir: string,
    manifest: { url: string; dest: string }[],
  ): Promise<{ dest: string; ok: boolean; error?: string }[]>;
  writeBinary(targetDir: string, relPath: string, base64: string): Promise<string>;
  buildRenpy(projectDir: string): Promise<{ ok: boolean; error?: string; message?: string }>;
  launchRenpy(projectDir: string): Promise<{ ok: boolean; error?: string }>;
  openExternal(url: string): Promise<void>;
  openPath(p: string): Promise<void>;
}

export const isElectron = (): boolean =>
  typeof window !== "undefined" && !!window.lovableApi?.isElectron;

const LS_PROJECTS_INDEX = "vnstudio:projectIndex";
const LS_PROJECT = (id: string) => `vnstudio:project:${id}`;
const LS_SETTINGS = "vnstudio:settings";

function lsGet<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

export const bridge = {
  async listProjects(): Promise<Project[]> {
    if (isElectron()) return window.lovableApi!.listProjects();
    const ids = lsGet<string[]>(LS_PROJECTS_INDEX, []);
    return ids
      .map((id) => lsGet<Project | null>(LS_PROJECT(id), null))
      .filter((p): p is Project => !!p);
  },

  async readProject(id: string): Promise<Project | null> {
    if (isElectron()) return window.lovableApi!.readProject(id);
    return lsGet<Project | null>(LS_PROJECT(id), null);
  },

  async writeProject(project: Project): Promise<void> {
    project.updatedAt = Date.now();
    if (isElectron()) return window.lovableApi!.writeProject(project);
    const ids = lsGet<string[]>(LS_PROJECTS_INDEX, []);
    if (!ids.includes(project.id)) {
      ids.push(project.id);
      lsSet(LS_PROJECTS_INDEX, ids);
    }
    lsSet(LS_PROJECT(project.id), project);
  },

  async deleteProject(id: string): Promise<void> {
    if (isElectron()) return window.lovableApi!.deleteProject(id);
    const ids = lsGet<string[]>(LS_PROJECTS_INDEX, []).filter((x) => x !== id);
    lsSet(LS_PROJECTS_INDEX, ids);
    if (typeof localStorage !== "undefined") localStorage.removeItem(LS_PROJECT(id));
  },

  async readSettings(): Promise<Settings> {
    if (isElectron()) return window.lovableApi!.readSettings();
    return lsGet<Settings>(LS_SETTINGS, DEFAULT_SETTINGS);
  },

  async writeSettings(s: Settings): Promise<void> {
    if (isElectron()) return window.lovableApi!.writeSettings(s);
    lsSet(LS_SETTINGS, s);
  },

  async detectAll(): Promise<Record<string, DepReport>> {
    if (isElectron()) return window.lovableApi!.detectAll();
    // Browser preview: probe what we can directly via fetch.
    const out: Record<string, DepReport> = {};
    out.ollama = await probeOllama();
    out.comfy = await probeComfy();
    out.xtts = await probeXtts();
    out.renpy = {
      name: "Ren'Py SDK",
      status: "unknown",
      source: "missing",
      detail: "Filesystem scan is only available in the desktop app.",
    };
    out.ffmpeg = {
      name: "FFmpeg",
      status: "unknown",
      source: "missing",
      detail: "Detection only available in the desktop app.",
    };
    return out;
  },

  async pickFolder(): Promise<string | null> {
    if (isElectron()) return window.lovableApi!.pickFolder();
    return null;
  },

  async openExternal(url: string): Promise<void> {
    if (isElectron()) return window.lovableApi!.openExternal(url);
    window.open(url, "_blank", "noopener,noreferrer");
  },

  async openPath(p: string): Promise<void> {
    if (isElectron()) return window.lovableApi!.openPath(p);
  },

  async spawnService(name: "comfy" | "xtts" | "ollama") {
    if (isElectron()) return window.lovableApi!.spawnService(name);
    return { ok: false, error: "Desktop app only" };
  },

  async exportRenpy(projectId: string, contents: Record<string, string>): Promise<string | null> {
    if (isElectron()) {
      const dir = await window.lovableApi!.pickFolder("Choose export folder");
      if (!dir) return null;
      return window.lovableApi!.exportRenpy(projectId, dir, contents);
    }
    const blob = new Blob(
      [
        Object.entries(contents)
          .map(([k, v]) => `--- ${k} ---\n${v}\n`)
          .join("\n"),
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectId}-renpy-preview.txt`;
    a.click();
    URL.revokeObjectURL(url);
    return "downloaded preview .txt";
  },

  async downloadAssets(targetDir: string, manifest: { url: string; dest: string }[]) {
    if (!isElectron()) return [];
    // Split: http(s) URLs go to the main process; blob: URLs are uploaded as base64.
    const remote = manifest.filter((m) => /^https?:\/\//i.test(m.url));
    const local = manifest.filter((m) => !/^https?:\/\//i.test(m.url));
    const remoteResults = remote.length
      ? await window.lovableApi!.downloadAssets(targetDir, remote)
      : [];
    const localResults: { dest: string; ok: boolean; error?: string }[] = [];
    for (const m of local) {
      try {
        const blob = await fetch(m.url).then((r) => r.blob());
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        const b64 = btoa(bin);
        await window.lovableApi!.writeBinary(targetDir, m.dest, b64);
        localResults.push({ dest: m.dest, ok: true });
      } catch (e) {
        localResults.push({ dest: m.dest, ok: false, error: (e as Error).message });
      }
    }
    return [...remoteResults, ...localResults];
  },

  async buildRenpy(projectDir: string) {
    if (!isElectron()) return { ok: false, error: "Desktop app only" };
    return window.lovableApi!.buildRenpy(projectDir);
  },

  async launchRenpy(projectDir: string) {
    if (!isElectron()) return { ok: false, error: "Desktop app only" };
    return window.lovableApi!.launchRenpy(projectDir);
  },
};

async function probeOllama(): Promise<DepReport> {
  try {
    const v = await fetch("http://localhost:11434/api/version").then((r) => r.json());
    let models: string[] = [];
    try {
      const t = await fetch("http://localhost:11434/api/tags").then((r) => r.json());
      models = (t.models ?? []).map((m: { name: string }) => m.name);
    } catch {
      /* noop */
    }
    return {
      name: "Ollama",
      status: "running",
      source: "running",
      port: 11434,
      version: v.version,
      models,
    };
  } catch {
    return {
      name: "Ollama",
      status: "missing",
      source: "missing",
      detail:
        "Not reachable at localhost:11434. Start Ollama, and set OLLAMA_ORIGINS=* so the browser preview can connect (the desktop app doesn't need this).",
    };
  }
}

async function probeComfy(): Promise<DepReport> {
  try {
    const s = await fetch("http://127.0.0.1:8188/system_stats").then((r) => r.json());
    return {
      name: "ComfyUI",
      status: "running",
      source: "running",
      port: 8188,
      version: s.system?.comfyui_version ?? "unknown",
    };
  } catch {
    return {
      name: "ComfyUI",
      status: "missing",
      source: "missing",
      detail: "Not reachable at 127.0.0.1:8188.",
    };
  }
}

async function probeXtts(): Promise<DepReport> {
  for (const port of [8020, 8080]) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/docs`);
      if (r.ok) {
        return {
          name: "XTTS",
          status: "running",
          source: "running",
          port,
        };
      }
    } catch {
      /* noop */
    }
  }
  return {
    name: "XTTS",
    status: "missing",
    source: "missing",
    detail: "Not reachable at 127.0.0.1:8020 or :8080.",
  };
}
