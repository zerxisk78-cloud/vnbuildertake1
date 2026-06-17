// Detect ComfyUI portable.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

function getJSON(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 1500 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
  });
}

function looksLikeComfy(dir) {
  return (
    fs.existsSync(path.join(dir, "run_nvidia_gpu.bat")) &&
    fs.existsSync(path.join(dir, "ComfyUI", "main.py"))
  );
}

module.exports = async function detectComfy(settings) {
  const url = settings?.comfy?.url || "http://127.0.0.1:8188";

  // 1) Is it running?
  try {
    const s = await getJSON(`${url}/system_stats`);
    return {
      name: "ComfyUI",
      status: "running",
      source: "running",
      port: 8188,
      version: s?.system?.comfyui_version ?? "running",
      path: settings?.comfy?.path,
    };
  } catch {
    /* not running */
  }

  // 2) Is the configured folder valid?
  if (settings?.comfy?.path && looksLikeComfy(settings.comfy.path)) {
    return {
      name: "ComfyUI",
      status: "installed",
      source: "installed",
      path: settings.comfy.path,
      detail: "Installed. Toggle auto-launch in Settings.",
    };
  }

  // 3) Scan common locations.
  const drives = ["C:", "D:", "E:", "F:", "G:"];
  const subfolders = ["", "aitools", "AI", "ai", "tools", "Programs"];
  const folderNames = ["ComfyUI_windows_portable", "ComfyUI-portable", "ComfyUI"];

  const candidates = new Set();
  if (process.env.USERPROFILE) {
    for (const sub of subfolders) {
      for (const name of folderNames) {
        candidates.add(path.join(process.env.USERPROFILE, sub, name));
      }
    }
  }
  for (const d of drives) {
    for (const sub of subfolders) {
      for (const name of folderNames) {
        candidates.add(path.join(d + "\\", sub, name));
      }
    }
  }
  // Also walk the parent of the running app (e.g. D:\aitools\<app>\ -> D:\aitools\)
  try {
    let dir = path.dirname(process.execPath);
    for (let i = 0; i < 4 && dir; i++) {
      for (const name of folderNames) {
        candidates.add(path.join(dir, name));
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* ignore */
  }

  for (const c of candidates) {
    try {
      if (looksLikeComfy(c)) {
        return {
          name: "ComfyUI",
          status: "installed",
          source: "installed",
          path: c,
          detail: "Detected at " + c,
        };
      }
    } catch {
      /* ignore */
    }
  }

  // 4) Shallow scan: look one level deep inside each "aitools"-style folder
  //    for a directory whose name starts with "ComfyUI".
  const scanRoots = new Set();
  for (const d of drives) {
    for (const sub of subfolders) {
      if (sub) scanRoots.add(path.join(d + "\\", sub));
    }
  }
  try {
    let dir = path.dirname(process.execPath);
    for (let i = 0; i < 4 && dir; i++) {
      scanRoots.add(dir);
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* ignore */
  }
  for (const root of scanRoots) {
    try {
      if (!fs.existsSync(root)) continue;
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (!/^ComfyUI/i.test(e.name)) continue;
        const full = path.join(root, e.name);
        if (looksLikeComfy(full)) {
          return {
            name: "ComfyUI",
            status: "installed",
            source: "installed",
            path: full,
            detail: "Detected at " + full,
          };
        }
      }
    } catch {
      /* ignore */
    }
  }

  return {
    name: "ComfyUI",
    status: "missing",
    source: "missing",
    detail:
      "Not running and not found. Download the portable .zip from GitHub, or set the path in Settings.",
  };
};

