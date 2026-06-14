// Ren'Py → VN Builder importer (pure, runs in the browser).
//
// Parses a list of .rpy files into our Project model. Designed to be tolerant:
// never throws, captures unsupported constructs as note lines so nothing is
// silently lost. The caller (bridge/store) is responsible for reading the
// files off disk and for asset URL resolution.

import { nanoid } from "nanoid";
import type {
  Project,
  Scene,
  ScriptLine,
  Character,
  Asset,
  AssetKind,
  Genre,
} from "./types";

export interface RawRpyFile {
  /** Path relative to game/ (e.g. "script.rpy", "chapter1/scene.rpy"). */
  path: string;
  content: string;
}

export interface RawAsset {
  /** Path relative to game/ (e.g. "images/bg/forest.png"). */
  rel: string;
  /** Absolute path on disk. Used to build a local-asset URL. */
  abs: string;
}

export interface RenpyImportInput {
  name: string;
  description?: string;
  genre?: Genre;
  rpyFiles: RawRpyFile[];
  assets: RawAsset[];
  /** Function that turns an absolute file path into a renderable URL. */
  resolveAssetUrl: (absPath: string) => string;
}

export interface ImportLogEntry {
  level: "info" | "warn";
  message: string;
}

export interface RenpyImportResult {
  project: Project;
  log: ImportLogEntry[];
}

// ---------- tokenizing ----------

interface Tok {
  indent: number;
  text: string; // trimmed
  file: string;
  lineNo: number;
}

function tokenize(file: string, content: string): Tok[] {
  return content.split(/\r?\n/).map((raw, i) => {
    let indent = 0;
    for (const ch of raw) {
      if (ch === " ") indent += 1;
      else if (ch === "\t") indent += 4;
      else break;
    }
    return { indent, text: raw.trim(), file, lineNo: i + 1 };
  });
}

// ---------- patterns ----------

// define e = Character("Eileen", color="#c8ffc8")
// define narrator = Character(None, kind=nvl)
const RE_DEFINE_CHAR =
  /^define\s+([A-Za-z_]\w*)\s*=\s*Character\s*\(\s*(?:"([^"]*)"|'([^']*)'|None|u?"([^"]*)")/;

const RE_LABEL = /^label\s+([A-Za-z_][\w.]*)\s*(?:\([^)]*\))?\s*:\s*(?:#.*)?$/;
const RE_MENU = /^menu\s*:\s*(?:#.*)?$/;
const RE_JUMP = /^jump\s+([A-Za-z_][\w.]*)/;
const RE_CALL = /^call\s+([A-Za-z_][\w.]*)/;
const RE_RETURN = /^return\b/;

const RE_SCENE_BG = /^scene\s+bg\s+(\S+)/;
const RE_SCENE = /^scene\s+(\S+)/;
const RE_SCENE_BLACK = /^scene\s+black\b/;
const RE_SHOW = /^show\s+([A-Za-z_]\w*)(?:\s+([A-Za-z_]\w*))?/;
const RE_HIDE = /^hide\s+([A-Za-z_]\w*)/;
const RE_PLAY = /^play\s+(music|sound|ambient|voice)\s+"([^"]+)"/;
const RE_STOP = /^stop\s+(music|sound|ambient|voice)/;
const RE_VOICE = /^voice\s+"([^"]+)"/;
const RE_WITH = /^with\s+(\S+)/;

// Quoted choice option:  "Yes":
const RE_CHOICE_OPT = /^"((?:[^"\\]|\\.)*)"\s*:\s*(?:#.*)?$/;
// Narration:  "Some text."
const RE_NARR = /^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/;
// Dialogue:  e "Hello"   or  e happy "Hello"
const RE_DLG =
  /^([A-Za-z_]\w*)(?:\s+([A-Za-z_]\w*))?\s+"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/;

// Block keywords to skip wholesale (their body is unparseable Python/Renpy).
const SKIP_BLOCK_HEADS =
  /^(init\b.*:|python\b.*:|screen\s+\w+.*:|transform\s+\w+.*:|style\s+\w+.*:|image\s+[\w ]+:|layeredimage\s+\w+.*:|default\b|\$\s|early\b|translate\b)/;

// ---------- helpers ----------

function unescape(s: string): string {
  return s.replace(/\\(.)/g, "$1");
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "x"
  );
}

function kindForAsset(rel: string): AssetKind | null {
  const p = rel.replace(/\\/g, "/").toLowerCase();
  if (p.startsWith("images/bg/")) return "background";
  if (p.startsWith("images/cg/")) return "cg";
  if (p.startsWith("images/")) return "sprite";
  if (p.startsWith("audio/music/") || p.startsWith("audio/bgm/")) return "music";
  if (p.startsWith("audio/sfx/") || p.startsWith("audio/sound/")) return "sfx";
  if (p.startsWith("audio/voice/")) return "voice";
  if (p.startsWith("audio/ambient/")) return "music";
  return null;
}

// ---------- main parser ----------

export function importRenpyProject(input: RenpyImportInput): RenpyImportResult {
  const log: ImportLogEntry[] = [];
  const warn = (m: string) => log.push({ level: "warn", message: m });
  const info = (m: string) => log.push({ level: "info", message: m });

  // ----- pass 1: collect Character defines + all label names -----
  const charByVar = new Map<string, Character>(); // ren'py var (e) → Character
  const charByNameSlug = new Map<string, Character>(); // name slug (eileen) → Character

  // Collect labels first so jumps can resolve forward.
  type LabelMeta = { name: string; sceneId: string; file: string; lineNo: number };
  const labels = new Map<string, LabelMeta>();

  for (const f of input.rpyFiles) {
    const toks = tokenize(f.path, f.content);
    for (const t of toks) {
      // strip inline comment for define detection
      const noComment = t.text.replace(/(^|\s)#.*$/, "$1").trim();
      const md = noComment.match(RE_DEFINE_CHAR);
      if (md) {
        const varName = md[1];
        const dispName = md[2] ?? md[3] ?? md[4] ?? varName;
        if (!charByVar.has(varName)) {
          const c: Character = {
            id: nanoid(8),
            name: dispName || varName,
            role: "",
            personality: "",
            voiceStyle: "",
            outfit: "",
            palette: "",
            expressions: [{ name: "neutral" }],
          };
          charByVar.set(varName, c);
          charByNameSlug.set(slug(c.name), c);
          // Also map by var slug in case images use the var name as the prefix.
          charByNameSlug.set(slug(varName), c);
        }
        continue;
      }
      const ml = noComment.match(RE_LABEL);
      if (ml && t.indent === 0) {
        const name = ml[1];
        if (!labels.has(name)) {
          labels.set(name, {
            name,
            sceneId: nanoid(8),
            file: t.file,
            lineNo: t.lineNo,
          });
        }
      }
    }
  }

  // ----- pass 2: walk each file, parse label bodies -----

  type PendingScene = { meta: LabelMeta; lines: ScriptLine[] };
  const scenes: PendingScene[] = [];
  for (const meta of labels.values()) {
    scenes.push({ meta, lines: [] });
  }
  const sceneByName = new Map(scenes.map((s) => [s.meta.name, s]));

  const expressionsByChar = new Map<string, Set<string>>(); // characterId → expr names used

  function noteExpression(c: Character, expr: string) {
    const set = expressionsByChar.get(c.id) ?? new Set<string>();
    set.add(expr);
    expressionsByChar.set(c.id, set);
  }

  for (const f of input.rpyFiles) {
    const toks = tokenize(f.path, f.content);
    let current: PendingScene | null = null;
    let pendingVoice: string | null = null;
    let i = 0;

    while (i < toks.length) {
      const t = toks[i];
      if (!t.text || t.text.startsWith("#")) {
        i++;
        continue;
      }

      // Top-level label switches the active scene.
      const ml = t.text.match(RE_LABEL);
      if (ml && t.indent === 0) {
        current = sceneByName.get(ml[1]) ?? null;
        pendingVoice = null;
        i++;
        continue;
      }

      // Skip unparseable blocks wholesale (init python:, screen X:, etc.).
      if (SKIP_BLOCK_HEADS.test(t.text)) {
        const baseIndent = t.indent;
        const startLine = `${t.file}:${t.lineNo} ${t.text}`;
        i++;
        while (i < toks.length && (toks[i].text === "" || toks[i].indent > baseIndent)) i++;
        if (current) {
          current.lines.push({
            id: nanoid(8),
            type: "note",
            text: `[unsupported Ren'Py block — preserved verbatim in original file] ${startLine}`,
          });
        } else {
          info(`Skipped block at ${startLine}`);
        }
        continue;
      }

      // Everything below requires an active label.
      if (!current) {
        i++;
        continue;
      }

      // menu: block
      if (RE_MENU.test(t.text)) {
        const baseIndent = t.indent;
        const choices: { id: string; label: string; gotoSceneId?: string }[] = [];
        i++;
        while (i < toks.length && (toks[i].text === "" || toks[i].indent > baseIndent)) {
          const c = toks[i];
          if (!c.text || c.text.startsWith("#")) {
            i++;
            continue;
          }
          const co = c.text.match(RE_CHOICE_OPT);
          if (co) {
            const choiceIndent = c.indent;
            const label = unescape(co[1]);
            // Look ahead for jump/call within this option's body
            let goto: string | undefined;
            i++;
            while (
              i < toks.length &&
              (toks[i].text === "" || toks[i].indent > choiceIndent)
            ) {
              const body = toks[i];
              if (!body.text || body.text.startsWith("#")) {
                i++;
                continue;
              }
              const j = body.text.match(RE_JUMP) ?? body.text.match(RE_CALL);
              if (j && !goto) {
                const target = sceneByName.get(j[1]);
                if (target) goto = target.meta.sceneId;
                else warn(`Choice "${label}" jumps to unknown label "${j[1]}"`);
              }
              i++;
            }
            choices.push({ id: nanoid(6), label, gotoSceneId: goto });
          } else {
            // Non-choice content inside menu (e.g. caption line) — keep as note.
            current.lines.push({
              id: nanoid(8),
              type: "note",
              text: `(menu) ${c.text}`,
            });
            i++;
          }
        }
        current.lines.push({
          id: nanoid(8),
          type: "choice",
          text: "",
          choices,
        });
        continue;
      }

      // scene / show / hide / play / voice / with / jump
      let m: RegExpMatchArray | null;

      if ((m = t.text.match(RE_SCENE_BG))) {
        // Use this as the scene's background; first one wins.
        const bgName = m[1];
        if (!current.meta) {
          // unreachable
        }
        // Stored on Scene later. For now, record as a note + set on scene.
        const sceneObj = scenes.find((s) => s.meta.sceneId === current!.meta.sceneId)!;
        // We mutate later when assembling Project; capture via a sentinel note.
        sceneObj.lines.push({
          id: nanoid(8),
          type: "note",
          text: `__BACKGROUND__:${bgName}`,
        });
        i++;
        continue;
      }
      if ((m = t.text.match(RE_SCENE_BLACK))) {
        current.lines.push({ id: nanoid(8), type: "note", text: "__BACKGROUND__:black" });
        i++;
        continue;
      }
      if ((m = t.text.match(RE_SCENE))) {
        current.lines.push({
          id: nanoid(8),
          type: "note",
          text: `__BACKGROUND__:${m[1]}`,
        });
        i++;
        continue;
      }
      if ((m = t.text.match(RE_SHOW))) {
        const charSlug = slug(m[1]);
        const expr = m[2] ?? "neutral";
        const c = charByNameSlug.get(charSlug);
        if (c) noteExpression(c, expr);
        current.lines.push({
          id: nanoid(8),
          type: "show",
          characterId: c?.id,
          expression: expr,
          text: c ? "" : m[1],
        });
        i++;
        continue;
      }
      if ((m = t.text.match(RE_HIDE))) {
        const c = charByNameSlug.get(slug(m[1]));
        current.lines.push({
          id: nanoid(8),
          type: "hide",
          characterId: c?.id,
          text: c ? "" : m[1],
        });
        i++;
        continue;
      }
      if ((m = t.text.match(RE_PLAY))) {
        const channel = m[1];
        const file = m[2];
        const base = file.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
        if (channel === "music" || channel === "ambient") {
          current.lines.push({ id: nanoid(8), type: "music", text: base });
        } else if (channel === "sound") {
          current.lines.push({ id: nanoid(8), type: "sfx", text: base });
        } else if (channel === "voice") {
          pendingVoice = file;
        }
        i++;
        continue;
      }
      if (RE_STOP.test(t.text)) {
        current.lines.push({ id: nanoid(8), type: "note", text: t.text });
        i++;
        continue;
      }
      if ((m = t.text.match(RE_VOICE))) {
        pendingVoice = m[1];
        i++;
        continue;
      }
      if ((m = t.text.match(RE_WITH))) {
        current.lines.push({ id: nanoid(8), type: "transition", text: m[1] });
        i++;
        continue;
      }
      if ((m = t.text.match(RE_JUMP))) {
        const target = sceneByName.get(m[1]);
        current.lines.push({
          id: nanoid(8),
          type: "note",
          text: target
            ? `jump → "${target.meta.name}" (preserved on export)`
            : `jump → ${m[1]} (unknown label)`,
        });
        i++;
        continue;
      }
      if (RE_RETURN.test(t.text)) {
        i++;
        continue;
      }

      // Dialogue: e "..."  or  e happy "..."
      if ((m = t.text.match(RE_DLG))) {
        const varName = m[1];
        const expr = m[2];
        const body = unescape(m[3]);
        const c = charByVar.get(varName) ?? charByNameSlug.get(slug(varName));
        if (c) {
          if (expr) noteExpression(c, expr);
          const line: ScriptLine = {
            id: nanoid(8),
            type: "dialogue",
            characterId: c.id,
            expression: expr,
            text: body,
          };
          if (pendingVoice) {
            line.voiceUrl = input.resolveAssetUrl(pendingVoice);
            pendingVoice = null;
          }
          current.lines.push(line);
        } else {
          // Unknown speaker → narration with prefix so meaning is preserved.
          current.lines.push({
            id: nanoid(8),
            type: "narration",
            text: `${varName}${expr ? ` ${expr}` : ""}: ${body}`,
          });
        }
        i++;
        continue;
      }

      // Plain narration "..."
      if ((m = t.text.match(RE_NARR))) {
        const line: ScriptLine = {
          id: nanoid(8),
          type: "narration",
          text: unescape(m[1]),
        };
        if (pendingVoice) {
          line.voiceUrl = input.resolveAssetUrl(pendingVoice);
          pendingVoice = null;
        }
        current.lines.push(line);
        i++;
        continue;
      }

      // Anything else → preserve as a note so nothing is lost.
      current.lines.push({
        id: nanoid(8),
        type: "note",
        text: t.text,
      });
      i++;
    }
  }

  // ----- assemble assets -----
  const assets: Asset[] = [];
  const assetByRelSlug = new Map<string, Asset>(); // slugged-basename → asset
  for (const a of input.assets) {
    const kind = kindForAsset(a.rel);
    if (!kind) continue;
    const base = a.rel.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
    const asset: Asset = {
      id: nanoid(8),
      kind,
      name: base,
      source: "imported",
      url: input.resolveAssetUrl(a.abs),
    };
    assets.push(asset);
    assetByRelSlug.set(slug(base), asset);

    // If this is a sprite under images/<char>/<expr>.png, attach to char expressions.
    const m = a.rel.match(/^images\/([^/]+)\/([^/]+)\.(png|jpg|jpeg|webp)$/i);
    if (m) {
      const c = charByNameSlug.get(slug(m[1]));
      if (c) {
        const exprName = m[2];
        const existing = c.expressions.find((e) => slug(e.name) === slug(exprName));
        if (existing) existing.url = asset.url;
        else c.expressions.push({ name: exprName, url: asset.url });
      }
    }
  }

  // Ensure expressions seen in script have entries even without files.
  for (const [charId, exprs] of expressionsByChar.entries()) {
    const c = [...charByVar.values()].find((x) => x.id === charId);
    if (!c) continue;
    for (const e of exprs) {
      if (!c.expressions.some((x) => slug(x.name) === slug(e))) {
        c.expressions.push({ name: e });
      }
    }
  }

  // ----- finalize scenes: lift __BACKGROUND__ notes onto Scene.background -----
  const projectScenes: Scene[] = scenes.map((p) => {
    const scene: Scene = { id: p.meta.sceneId, title: p.meta.name, lines: [] };
    for (const l of p.lines) {
      if (l.type === "note" && l.text.startsWith("__BACKGROUND__:")) {
        const name = l.text.slice("__BACKGROUND__:".length);
        if (!scene.background) {
          const matched = assetByRelSlug.get(slug(name));
          scene.background = matched ? matched.id : name;
        }
        continue;
      }
      // First music line lifts to Scene.music
      if (l.type === "music" && !scene.music) {
        const matched = assetByRelSlug.get(slug(l.text));
        scene.music = matched ? matched.id : l.text;
        continue;
      }
      scene.lines.push(l);
    }
    return scene;
  });

  // Move "start" label first if it exists, so the entry point lines up with export.
  const startIdx = projectScenes.findIndex((s) => s.title === "start");
  if (startIdx > 0) {
    const [start] = projectScenes.splice(startIdx, 1);
    projectScenes.unshift(start);
  }

  if (projectScenes.length === 0) {
    warn("No `label …:` blocks found. Created an empty project.");
  }
  info(
    `Imported ${projectScenes.length} scenes, ${charByVar.size} characters, ${assets.length} assets.`,
  );

  const project: Project = {
    id: nanoid(10),
    name: input.name,
    genre: input.genre ?? "Visual Novel",
    description:
      input.description ??
      `Imported from Ren'Py. ${projectScenes.length} scenes, ${charByVar.size} characters.`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    scenes: projectScenes,
    characters: [...charByVar.values()],
    lorebook: [],
    assets,
  };

  return { project, log };
}
