// Electron main process — VN Builder Studio desktop shell.
// CommonJS because package.json has "type": "module".

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const http = require("node:http");

const detectOllama = require("./detect/ollama.cjs");
const detectComfy = require("./detect/comfy.cjs");
const detectXtts = require("./detect/xtts.cjs");
const detectRenpy = require("./detect/renpy.cjs");
const detectFfmpeg = require("./detect/ffmpeg.cjs");

const DATA_DIR = path.join(path.dirname(app.getPath("exe")), "data");
const PROJECTS_DIR = path.join(DATA_DIR, "projects");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

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
    const child = spawn("ollama", ["serve"], { shell: true });
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
  const indexHtml = path.join(__dirname, "..", "dist", "index.html");
  win.loadFile(indexHtml);
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
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
