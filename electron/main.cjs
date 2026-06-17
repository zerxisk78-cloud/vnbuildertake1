// Electron main process — VN Builder Studio desktop shell.
// CommonJS because package.json has "type": "module".

const BUILD_TAG = "ssr-protocol-v2";
console.log(`[vnstudio] main.cjs BUILD_TAG=${BUILD_TAG}`);

const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const http = require("node:http");
const { pathToFileURL } = require("node:url");

// Register a privileged custom scheme that serves the built SPA + SSR handler.
// Must happen before app.whenReady().
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

const detectOllama = require("./detect/ollama.cjs");
const detectComfy = require("./detect/comfy.cjs");
const detectXtts = require("./detect/xtts.cjs");
const detectRenpy = require("./detect/renpy.cjs");
const detectFfmpeg = require("./detect/ffmpeg.cjs");

const DATA_DIR = path.join(path.dirname(app.getPath("exe")), "data");
const PROJECTS_DIR = path.join(DATA_DIR, "projects");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

// Folders whose contents the renderer is allowed to read via app://local-asset.
// Seeded with the projects dir; importers push their scanned project root in.
const ALLOWED_ASSET_ROOTS = new Set([path.resolve(PROJECTS_DIR)]);
function isUnderAllowedRoot(absPath) {
  const resolved = path.resolve(absPath);
  for (const root of ALLOWED_ASSET_ROOTS) {
    const rel = path.relative(root, resolved);
    if (rel === "" || (rel && !rel.startsWith("..") && !path.isAbsolute(rel))) return true;
  }
  return false;
}

function ensureDirs() {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

// ----- Project storage -----
ipcMain.handle("projects:list", () => {
  ensureDirs();
  return fs
    .readdirSync(PROJECTS_DIR)
    .map((id) => readJson(path.join(PROJECTS_DIR, id, "project.json"), null))
    .filter(Boolean);
});
ipcMain.handle("projects:read", (_e, id) =>
  readJson(path.join(PROJECTS_DIR, id, "project.json"), null),
);
ipcMain.handle("projects:write", (_e, project) => {
  writeJson(path.join(PROJECTS_DIR, project.id, "project.json"), project);
});
ipcMain.handle("projects:delete", (_e, id) => {
  fs.rmSync(path.join(PROJECTS_DIR, id), { recursive: true, force: true });
});

// ----- Settings -----
ipcMain.handle("settings:read", () => readJson(SETTINGS_FILE, null));
ipcMain.handle("settings:write", (_e, s) => writeJson(SETTINGS_FILE, s));

// ----- Detection -----
async function detectAll() {
  const settings = readJson(SETTINGS_FILE, {});
  const [ollama, comfy, xtts, renpy, ffmpeg] = await Promise.all([
    detectOllama(settings),
    detectComfy(settings),
    detectXtts(settings),
    detectRenpy(settings),
    detectFfmpeg(settings),
  ]);
  return { ollama, comfy, xtts, renpy, ffmpeg };
}
ipcMain.handle("detect:all", () => detectAll());
ipcMain.handle("detect:one", async (_e, name) => {
  const settings = readJson(SETTINGS_FILE, {});
  if (name === "ollama") return detectOllama(settings);
  if (name === "comfy") return detectComfy(settings);
  if (name === "xtts") return detectXtts(settings);
  if (name === "renpy") return detectRenpy(settings);
  if (name === "ffmpeg") return detectFfmpeg(settings);
  return { name, status: "unknown", source: "missing" };
});

// ----- File picker -----
ipcMain.handle("dialog:pickFolder", async (_e, title) => {
  const r = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: title ?? "Choose folder",
  });
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
});
ipcMain.handle("shell:openExternal", (_e, url) => shell.openExternal(url));

// ----- Services (spawn / attach / stop) -----
const managed = new Map(); // name -> child

function probePort(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/", timeout: 1000 },
      (res) => {
        res.resume();
        resolve(true);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

ipcMain.handle("service:spawn", async (_e, name) => {
  const settings = readJson(SETTINGS_FILE, {});
  if (name === "comfy") {
    if (await probePort(8188)) return { ok: true }; // attached
    const dir = settings?.comfy?.path;
    if (!dir) return { ok: false, error: "ComfyUI folder not set" };
    const bat = path.join(dir, "run_nvidia_gpu.bat");
    if (!fs.existsSync(bat)) return { ok: false, error: `${bat} not found` };
    const child = spawn("cmd.exe", ["/c", bat], { cwd: dir, detached: false });
    managed.set("comfy", child);
    return { ok: true };
  }
  if (name === "xtts") {
    if (await probePort(8020)) return { ok: true };
    const dir = settings?.xtts?.path;
    if (!dir) return { ok: false, error: "XTTS folder not set" };
    const bat = path.join(dir, "start.bat");
    if (!fs.existsSync(bat)) return { ok: false, error: `${bat} not found` };
    const child = spawn("cmd.exe", ["/c", bat], { cwd: dir, detached: false });
    managed.set("xtts", child);
    return { ok: true };
  }
  if (name === "ollama") {
    if (await probePort(11434)) return { ok: true };
    // Avoid shell:true + args (Node DEP0190). Spawn directly; fall back to .exe on win.
    const bin = process.platform === "win32" ? "ollama.exe" : "ollama";
    const child = spawn(bin, ["serve"], { shell: false });
    managed.set("ollama", child);
    return { ok: true };
  }
  return { ok: false, error: `unknown service ${name}` };
});

ipcMain.handle("service:stop", (_e, name) => {
  const c = managed.get(name);
  if (c) {
    try {
      c.kill();
    } catch {
      /* noop */
    }
    managed.delete(name);
  }
});

app.on("before-quit", () => {
  for (const c of managed.values()) {
    try {
      c.kill();
    } catch {
      /* noop */
    }
  }
});

// ----- Ren'Py export -----
ipcMain.handle("renpy:export", (_e, projectId, targetDir, contents) => {
  for (const [rel, body] of Object.entries(contents)) {
    const file = path.join(targetDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body, "utf8");
  }
  return targetDir;
});

// Download a list of {url, dest} into targetDir. Skips blob: URLs (those are
// uploaded as base64 by the caller via renpy:writeBinary).
ipcMain.handle("renpy:downloadAssets", async (_e, targetDir, manifest) => {
  const results = [];
  for (const item of manifest) {
    try {
      if (!/^https?:\/\//i.test(item.url)) {
        results.push({ dest: item.dest, ok: false, error: "non-http url (use writeBinary)" });
        continue;
      }
      const buf = await new Promise((resolve, reject) => {
        const lib = item.url.startsWith("https") ? require("node:https") : require("node:http");
        lib
          .get(item.url, (res) => {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode}`));
              return;
            }
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => resolve(Buffer.concat(chunks)));
          })
          .on("error", reject);
      });
      const file = path.join(targetDir, item.dest);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buf);
      results.push({ dest: item.dest, ok: true });
    } catch (err) {
      results.push({ dest: item.dest, ok: false, error: String(err.message ?? err) });
    }
  }
  return results;
});

// Write a single binary asset uploaded as base64 from the renderer (used for
// blob: URLs the main process can't fetch — e.g. XTTS voice clips).
ipcMain.handle("renpy:writeBinary", (_e, targetDir, relPath, base64) => {
  const file = path.join(targetDir, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(base64, "base64"));
  return file;
});

// ----- Ren'Py build (invokes SDK launcher) -----
ipcMain.handle("renpy:build", (_e, projectDir) => {
  const settings = readJson(SETTINGS_FILE, {});
  const sdk = settings?.renpy?.sdkPath;
  if (!sdk) return { ok: false, error: "Ren'Py SDK path not set in Settings." };
  const exe =
    process.platform === "win32"
      ? path.join(sdk, "renpy.exe")
      : path.join(sdk, "renpy.sh");
  if (!fs.existsSync(exe)) return { ok: false, error: `Ren'Py launcher not found at ${exe}` };
  // `renpy.exe <project> distribute` builds PC/Mac/Linux .zips under <project>/dist.
  const child = spawn(exe, [projectDir, "distribute"], {
    cwd: sdk,
    detached: false,
    shell: process.platform === "win32",
  });
  managed.set(`renpy-build-${Date.now()}`, child);
  return { ok: true, message: `Building distributions under ${projectDir}/dist…` };
});

// Open the Ren'Py SDK launcher pointing at a project (lets the user playtest).
ipcMain.handle("renpy:launch", (_e, projectDir) => {
  const settings = readJson(SETTINGS_FILE, {});
  const sdk = settings?.renpy?.sdkPath;
  if (!sdk) return { ok: false, error: "Ren'Py SDK path not set in Settings." };
  const exe =
    process.platform === "win32"
      ? path.join(sdk, "renpy.exe")
      : path.join(sdk, "renpy.sh");
  if (!fs.existsSync(exe)) return { ok: false, error: `Ren'Py launcher not found at ${exe}` };
  const child = spawn(exe, [projectDir], {
    cwd: sdk,
    detached: true,
    shell: process.platform === "win32",
  });
  child.unref();
  return { ok: true };
});

ipcMain.handle("shell:openPath", (_e, p) => shell.openPath(p));

// ----- Ren'Py import (scan a project folder for .rpy + assets) -----
// Returns { gameDir, projectRoot, rpyFiles: [{path,content}], assets: [{rel,abs}] }
// or { error } if the folder isn't a Ren'Py project. The renderer does the
// actual parsing via src/lib/renpy-import.ts.
ipcMain.handle("renpy:importScan", async (_e, folderPath) => {
  if (!folderPath || !fs.existsSync(folderPath)) {
    return { error: `Folder not found: ${folderPath}` };
  }
  let gameDir = path.join(folderPath, "game");
  let projectRoot = folderPath;
  if (!fs.existsSync(gameDir)) {
    // The user may have picked the game/ folder directly.
    if (
      path.basename(folderPath).toLowerCase() === "game" ||
      fs.existsSync(path.join(folderPath, "script.rpy")) ||
      fs.readdirSync(folderPath).some((f) => f.endsWith(".rpy"))
    ) {
      gameDir = folderPath;
      projectRoot = path.dirname(folderPath);
    } else {
      return {
        error: `No game/ folder or .rpy files found in ${folderPath}. Pick the Ren'Py project root (the folder that contains game/).`,
      };
    }
  }
  ALLOWED_ASSET_ROOTS.add(path.resolve(projectRoot));

  const rpyFiles = [];
  const SKIP_RPY = /^(screens|options|gui|_)/i;
  function walkRpy(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "cache" || ent.name === "saves" || ent.name === "tl") continue;
        walkRpy(full);
      } else if (ent.name.toLowerCase().endsWith(".rpy") && !SKIP_RPY.test(ent.name)) {
        try {
          rpyFiles.push({
            path: path.relative(gameDir, full).replace(/\\/g, "/"),
            content: fs.readFileSync(full, "utf8"),
          });
        } catch (err) {
          console.error(`[renpy:importScan] failed to read ${full}:`, err);
        }
      }
    }
  }
  walkRpy(gameDir);

  const assets = [];
  function walkAssets(dir, relBase) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walkAssets(full, rel);
      else assets.push({ rel, abs: full });
    }
  }
  walkAssets(path.join(gameDir, "images"), "images");
  walkAssets(path.join(gameDir, "audio"), "audio");

  return { gameDir, projectRoot, rpyFiles, assets };
});

// ----- RPG Maker MV/MZ import (scan a project folder for data/*.json + assets) -----
// Returns { projectRoot, dataFiles: [{rel,abs,json}], assetFiles: [{rel,abs}] }
// or { error } if the folder doesn't look like an RPG Maker project.
ipcMain.handle("rpgmaker:importScan", async (_e, folderPath) => {
  if (!folderPath || !fs.existsSync(folderPath)) {
    return { error: `Folder not found: ${folderPath}` };
  }
  const dataDir = path.join(folderPath, "data");
  if (!fs.existsSync(dataDir) || !fs.statSync(dataDir).isDirectory()) {
    return {
      error: `No data/ folder found in ${folderPath}. Pick the RPG Maker MV/MZ project root (the folder that contains data/, img/, audio/).`,
    };
  }
  ALLOWED_ASSET_ROOTS.add(path.resolve(folderPath));

  const dataFiles = [];
  for (const ent of fs.readdirSync(dataDir, { withFileTypes: true })) {
    if (!ent.isFile() || !ent.name.toLowerCase().endsWith(".json")) continue;
    const abs = path.join(dataDir, ent.name);
    try {
      const json = JSON.parse(fs.readFileSync(abs, "utf8"));
      dataFiles.push({ rel: `data/${ent.name}`, abs, json });
    } catch (err) {
      console.warn(`[rpgmaker:importScan] skipping invalid JSON ${ent.name}:`, err.message);
    }
  }

  const assetFiles = [];
  function walkBinary(dir, relBase) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walkBinary(full, rel);
      else assetFiles.push({ rel, abs: full });
    }
  }
  walkBinary(path.join(folderPath, "img"), "img");
  walkBinary(path.join(folderPath, "audio"), "audio");

  return { projectRoot: folderPath, dataFiles, assetFiles };
});



// ----- Window -----
const APP_TITLE = "VN Builder Studio";
const ICON_PATH = path.join(__dirname, "..", "build", "icon.png");

function createSplash() {
  const splash = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    resizable: false,
    transparent: false,
    backgroundColor: "#0b0f17",
    alwaysOnTop: true,
    show: true,
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
  });
  const iconUrl = fs.existsSync(ICON_PATH)
    ? "file://" + ICON_PATH.replace(/\\/g, "/")
    : "";
  splash.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(`<!doctype html><html><body style="margin:0;background:#0b0f17;color:#e2e8f0;font:14px system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:14px;border:1px solid #1e293b;">${iconUrl ? `<img src="${iconUrl}" style="width:96px;height:96px;border-radius:18px;box-shadow:0 8px 32px rgba(99,102,241,.35)"/>` : ""}<div style="font-size:18px;font-weight:600;letter-spacing:.5px">VN Builder Studio</div><div style="opacity:.6;font-size:12px">Loading…</div></body></html>`),
  );
  return splash;
}

// Resolve build dirs. When packaged with electron-packager, app files live
// under `resources/app/...`; __dirname points to `resources/app/electron`.
const CLIENT_DIR = path.join(__dirname, "..", "dist", "client");
const SERVER_BUNDLE = path.join(__dirname, "..", "dist", "server", "server.js");

// MIME map for static client assets.
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

let ssrHandlerPromise = null;
async function getSsrHandler() {
  if (!ssrHandlerPromise) {
    ssrHandlerPromise = import(pathToFileURL(SERVER_BUNDLE).href)
      .then((m) => m.default ?? m)
      .catch((err) => {
        console.error("[ssr] failed to load server bundle:", err);
        return null;
      });
  }
  return ssrHandlerPromise;
}

function tryStaticFile(urlPathname) {
  // Strip leading slash and resolve safely under CLIENT_DIR.
  const rel = decodeURIComponent(urlPathname.replace(/^\/+/, ""));
  if (!rel) return null;
  const abs = path.join(CLIENT_DIR, rel);
  if (!abs.startsWith(CLIENT_DIR)) return null; // path traversal guard
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  return abs;
}

const CSP_HEADER = [
  "default-src 'self' app: data: blob:",
  "script-src 'self' 'unsafe-inline' app:",
  "style-src 'self' 'unsafe-inline' app:",
  "img-src 'self' app: data: blob: http://127.0.0.1:* http://localhost:*",
  "media-src 'self' app: blob: http://127.0.0.1:* http://localhost:*",
  "connect-src 'self' app: ws: wss: http://127.0.0.1:* http://localhost:* https:",
  "font-src 'self' app: data:",
].join("; ");

function withCsp(response) {
  try {
    response.headers.set("content-security-policy", CSP_HEADER);
  } catch {
    /* immutable headers — ignore */
  }
  return response;
}

function registerAppProtocol() {
  protocol.handle("app", async (request) => {
    const response = await handleAppRequest(request);
    return withCsp(response);
  });
}

async function handleAppRequest(request) {
    try {
      const url = new URL(request.url);


      // 0. Local-asset passthrough: serves any absolute file path on disk so
      //    imported Ren'Py images/audio render directly in <img>/<audio> tags.
      if (url.pathname === "/local-asset") {
        const p = url.searchParams.get("p");
        if (!p) return new Response("Missing path", { status: 400 });
        const resolved = path.resolve(p);
        if (!isUnderAllowedRoot(resolved)) {
          console.warn("[app://local-asset] denied (outside allowed roots):", resolved);
          return new Response("Forbidden", { status: 403 });
        }
        if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
          const buf = fs.readFileSync(resolved);
          const ext = path.extname(resolved).toLowerCase();
          return new Response(buf, {
            status: 200,
            headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
          });
        }
        return new Response("Asset not found", { status: 404 });
      }

      // 1. Static asset from dist/client (assets/, favicon, etc.)
      const staticPath = tryStaticFile(url.pathname);
      if (staticPath) {
        const buf = fs.readFileSync(staticPath);
        const ext = path.extname(staticPath).toLowerCase();
        return new Response(buf, {
          status: 200,
          headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
        });
      }



      // 2. Fall back to the SSR worker handler for app routes.
      const handler = await getSsrHandler();
      if (!handler || typeof handler.fetch !== "function") {
        return new Response(
          "<h1>SSR bundle missing</h1><p>dist/server/server.js could not be loaded.</p>",
          { status: 500, headers: { "content-type": "text/html; charset=utf-8" } },
        );
      }

      // Build a Request the worker can consume. Rewrite host so absolute URLs
      // generated by the framework stay self-consistent.
      const ssrUrl = new URL(url.pathname + url.search, "http://localhost/");
      const init = {
        method: request.method,
        headers: request.headers,
      };
      if (!["GET", "HEAD"].includes(request.method)) {
        init.body = await request.arrayBuffer();
      }
      const ssrRequest = new Request(ssrUrl, init);
      return await handler.fetch(ssrRequest, {}, {});
    } catch (err) {
      console.error("[app://] handler error:", err);
      return new Response(`<pre>${String(err && err.stack ? err.stack : err)}</pre>`, {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
}


function createWindow() {
  const splash = createSplash();
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: APP_TITLE,
    show: false,
    backgroundColor: "#0b0f17",
    autoHideMenuBar: true,
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setTitle(APP_TITLE);
  win.on("page-title-updated", (e) => e.preventDefault());

  const LOG_DIR = path.join(DATA_DIR, "logs");
  const LOG_FILE = path.join(LOG_DIR, "electron.log");
  function logToFile(line) {
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${line}\n`);
    } catch {
      /* noop */
    }
  }
  logToFile(`startup BUILD_TAG=${BUILD_TAG} CLIENT_DIR=${CLIENT_DIR} SERVER_BUNDLE=${SERVER_BUNDLE}`);

  // Preflight: confirm the bundled files we expect actually exist.
  const indexHtml = path.join(CLIENT_DIR, "index.html");
  const missing = [];
  if (!fs.existsSync(indexHtml)) missing.push(indexHtml);
  if (!fs.existsSync(SERVER_BUNDLE)) missing.push(SERVER_BUNDLE);

  // Surface load failures so users don't just see a blank window.
  win.webContents.on("did-fail-load", (_e, code, desc, failedUrl) => {
    const msg = `did-fail-load ${code} ${desc} ${failedUrl}`;
    console.error(`[window] ${msg}`);
    logToFile(msg);
    win.webContents.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          `<body style="font:14px system-ui;padding:24px;background:#0b0f17;color:#e2e8f0"><h2>Failed to load app</h2><pre>${desc} (${code})\n${failedUrl}</pre><p>Log: ${LOG_FILE}</p><p>Open DevTools (Ctrl+Shift+I) for more.</p></body>`,
        ),
    );
    win.show();
  });

  if (missing.length > 0) {
    const msg = `Preflight failed. Missing bundled files:\n${missing.join("\n")}\n\nExpected under: ${path.dirname(CLIENT_DIR)}\n\nLog file: ${LOG_FILE}\n\nRebuild with: bun run package:portable`;
    logToFile(msg);
    win.webContents.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          `<body style="font:14px system-ui;padding:24px;background:#0b0f17;color:#e2e8f0"><h2>VN Builder Studio — build incomplete</h2><pre>${msg}</pre></body>`,
        ),
    );
    try { splash.close(); } catch { /* noop */ }
    win.show();
    return;
  }

  win.loadURL("app://localhost/");

  win.once("ready-to-show", () => {
    try {
      splash.close();
    } catch {
      /* noop */
    }
    win.show();
  });
}

app.setName(APP_TITLE);

app.whenReady().then(() => {
  ensureDirs();
  registerAppProtocol();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
