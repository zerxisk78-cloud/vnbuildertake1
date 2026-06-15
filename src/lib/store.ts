import { create } from "zustand";
import { nanoid } from "nanoid";
import { bridge } from "./bridge";
import type { Project, Settings, Scene, Character, LoreEntry, Asset } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { buildExampleProject } from "./example-project";
import { importRenpyProject, type ImportLogEntry } from "./renpy-import";
import { importRpgMakerProject, type RpgImportLogEntry } from "./rpgmaker-import";

interface StoreState {
  projects: Project[];
  settings: Settings;
  loaded: boolean;

  load(): Promise<void>;
  saveSettings(s: Partial<Settings>): Promise<void>;

  createProject(name: string, genre: Project["genre"], description: string): Promise<Project>;
  createExampleProject(): Promise<Project>;
  importRenpyFromFolder(
    folderPath: string,
    overrides?: { name?: string },
  ): Promise<{ project: Project; log: ImportLogEntry[] } | { error: string }>;
  importRpgMakerFromFolder(
    folderPath: string,
    overrides?: { name?: string },
  ): Promise<{ project: Project; log: RpgImportLogEntry[] } | { error: string }>;
  duplicateProject(id: string): Promise<Project | null>;
  deleteProject(id: string): Promise<void>;
  updateProject(id: string, patch: Partial<Project>): Promise<void>;

  getProject(id: string): Project | undefined;

  addScene(projectId: string, title: string): Promise<Scene>;
  updateScene(projectId: string, sceneId: string, patch: Partial<Scene>): Promise<void>;
  deleteScene(projectId: string, sceneId: string): Promise<void>;
  reorderScenes(projectId: string, order: string[]): Promise<void>;

  addCharacter(projectId: string, name: string): Promise<Character>;
  updateCharacter(projectId: string, charId: string, patch: Partial<Character>): Promise<void>;
  deleteCharacter(projectId: string, charId: string): Promise<void>;

  addLore(projectId: string, title: string): Promise<LoreEntry>;
  updateLore(projectId: string, id: string, patch: Partial<LoreEntry>): Promise<void>;
  deleteLore(projectId: string, id: string): Promise<void>;

  addAsset(projectId: string, asset: Omit<Asset, "id">): Promise<Asset>;
  updateAsset(projectId: string, id: string, patch: Partial<Asset>): Promise<void>;
  deleteAsset(projectId: string, id: string): Promise<void>;
}

async function persist(project: Project) {
  await bridge.writeProject(project);
}

export const useStore = create<StoreState>((set, get) => ({
  projects: [],
  settings: DEFAULT_SETTINGS,
  loaded: false,

  async load() {
    const [projects, settings] = await Promise.all([
      bridge.listProjects(),
      bridge.readSettings(),
    ]);
    set({ projects, settings, loaded: true });
  },

  async saveSettings(patch) {
    const next: Settings = {
      ...get().settings,
      ...patch,
      ollama: { ...get().settings.ollama, ...(patch.ollama ?? {}) },
      comfy: { ...get().settings.comfy, ...(patch.comfy ?? {}) },
      xtts: { ...get().settings.xtts, ...(patch.xtts ?? {}) },
      renpy: { ...get().settings.renpy, ...(patch.renpy ?? {}) },
    };
    set({ settings: next });
    await bridge.writeSettings(next);
  },

  async createProject(name, genre, description) {
    const project: Project = {
      id: nanoid(10),
      name,
      genre,
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      scenes: [],
      characters: [],
      lorebook: [],
      assets: [],
    };
    await persist(project);
    set({ projects: [...get().projects, project] });
    return project;
  },

  async createExampleProject() {
    const project = buildExampleProject();
    await persist(project);
    set({ projects: [...get().projects, project] });
    return project;
  },

  async importRenpyFromFolder(folderPath, overrides) {
    const scan = await bridge.importRenpyScan(folderPath);
    if ("error" in scan) return { error: scan.error };
    const inferredName =
      overrides?.name ||
      scan.projectRoot.replace(/\\/g, "/").split("/").filter(Boolean).pop() ||
      "Imported Ren'Py Project";
    const { project, log } = importRenpyProject({
      name: inferredName,
      rpyFiles: scan.rpyFiles,
      assets: scan.assets,
      resolveAssetUrl: (abs) => bridge.localAssetUrl(abs),
    });
    await persist(project);
    set({ projects: [...get().projects, project] });
    return { project, log };
  },

  async importRpgMakerFromFolder(folderPath, overrides) {
    const scan = await bridge.importRpgMakerScan(folderPath);
    if ("error" in scan) return { error: scan.error };
    const inferredName =
      overrides?.name ||
      scan.projectRoot.replace(/\\/g, "/").split("/").filter(Boolean).pop() ||
      "Imported RPG Maker Project";
    const { project, log } = importRpgMakerProject({
      name: inferredName,
      dataFiles: scan.dataFiles,
      assetFiles: scan.assetFiles,
      resolveAssetUrl: (abs) => bridge.localAssetUrl(abs),
    });
    await persist(project);
    set({ projects: [...get().projects, project] });
    return { project, log };
  },


  async duplicateProject(id) {
    const orig = get().projects.find((p) => p.id === id);
    if (!orig) return null;
    const copy: Project = {
      ...JSON.parse(JSON.stringify(orig)),
      id: nanoid(10),
      name: `${orig.name} (copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await persist(copy);
    set({ projects: [...get().projects, copy] });
    return copy;
  },

  async deleteProject(id) {
    await bridge.deleteProject(id);
    set({ projects: get().projects.filter((p) => p.id !== id) });
  },

  async updateProject(id, patch) {
    const p = get().projects.find((x) => x.id === id);
    if (!p) return;
    const next = { ...p, ...patch, updatedAt: Date.now() };
    await persist(next);
    set({ projects: get().projects.map((x) => (x.id === id ? next : x)) });
  },

  getProject(id) {
    return get().projects.find((p) => p.id === id);
  },

  async addScene(projectId, title) {
    const p = get().projects.find((x) => x.id === projectId)!;
    const scene: Scene = { id: nanoid(8), title, lines: [] };
    const next = { ...p, scenes: [...p.scenes, scene] };
    await persist(next);
    set({ projects: get().projects.map((x) => (x.id === projectId ? next : x)) });
    return scene;
  },

  async updateScene(projectId, sceneId, patch) {
    const p = get().projects.find((x) => x.id === projectId)!;
    const next = {
      ...p,
      scenes: p.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)),
    };
    await persist(next);
    set({ projects: get().projects.map((x) => (x.id === projectId ? next : x)) });
  },

  async deleteScene(projectId, sceneId) {
    const p = get().projects.find((x) => x.id === projectId)!;
    const next = { ...p, scenes: p.scenes.filter((s) => s.id !== sceneId) };
    await persist(next);
    set({ projects: get().projects.map((x) => (x.id === projectId ? next : x)) });
  },

  async reorderScenes(projectId, order) {
    const p = get().projects.find((x) => x.id === projectId)!;
    const map = new Map(p.scenes.map((s) => [s.id, s]));
    const next = { ...p, scenes: order.map((id) => map.get(id)!).filter(Boolean) };
    await persist(next);
    set({ projects: get().projects.map((x) => (x.id === projectId ? next : x)) });
  },

  async addCharacter(projectId, name) {
    const p = get().projects.find((x) => x.id === projectId)!;
    const c: Character = {
      id: nanoid(8),
      name,
      role: "",
      personality: "",
      voiceStyle: "",
      outfit: "",
      palette: "",
      expressions: [{ name: "neutral" }],
    };
    const next = { ...p, characters: [...p.characters, c] };
    await persist(next);
    set({ projects: get().projects.map((x) => (x.id === projectId ? next : x)) });
    return c;
  },

  async updateCharacter(projectId, charId, patch) {
    const p = get().projects.find((x) => x.id === projectId)!;
    const next = {
      ...p,
      characters: p.characters.map((c) => (c.id === charId ? { ...c, ...patch } : c)),
    };
    await persist(next);
    set({ projects: get().projects.map((x) => (x.id === projectId ? next : x)) });
  },

  async deleteCharacter(projectId, charId) {
    const p = get().projects.find((x) => x.id === projectId)!;
    const next = { ...p, characters: p.characters.filter((c) => c.id !== charId) };
    await persist(next);
    set({ projects: get().projects.map((x) => (x.id === projectId ? next : x)) });
  },

  async addLore(projectId, title) {
    const p = get().projects.find((x) => x.id === projectId)!;
    const l: LoreEntry = { id: nanoid(8), title, keywords: [], body: "" };
    const next = { ...p, lorebook: [...p.lorebook, l] };
    await persist(next);
    set({ projects: get().projects.map((x) => (x.id === projectId ? next : x)) });
    return l;
  },

  async updateLore(projectId, id, patch) {
    const p = get().projects.find((x) => x.id === projectId)!;
    const next = {
      ...p,
      lorebook: p.lorebook.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    };
    await persist(next);
    set({ projects: get().projects.map((x) => (x.id === projectId ? next : x)) });
  },

  async deleteLore(projectId, id) {
    const p = get().projects.find((x) => x.id === projectId)!;
    const next = { ...p, lorebook: p.lorebook.filter((l) => l.id !== id) };
    await persist(next);
    set({ projects: get().projects.map((x) => (x.id === projectId ? next : x)) });
  },

  async addAsset(projectId, asset) {
    const p = get().projects.find((x) => x.id === projectId)!;
    const a: Asset = { ...asset, id: nanoid(8) };
    const next = { ...p, assets: [...p.assets, a] };
    await persist(next);
    set({ projects: get().projects.map((x) => (x.id === projectId ? next : x)) });
    return a;
  },

  async updateAsset(projectId, id, patch) {
    const p = get().projects.find((x) => x.id === projectId)!;
    const next = {
      ...p,
      assets: p.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    };
    await persist(next);
    set({ projects: get().projects.map((x) => (x.id === projectId ? next : x)) });
  },

  async deleteAsset(projectId, id) {
    const p = get().projects.find((x) => x.id === projectId)!;
    const next = { ...p, assets: p.assets.filter((a) => a.id !== id) };
    await persist(next);
    set({ projects: get().projects.map((x) => (x.id === projectId ? next : x)) });
  },
}));
