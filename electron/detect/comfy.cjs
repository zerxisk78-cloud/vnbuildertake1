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
  const candidates = [
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, "ComfyUI_windows_portable"),
    "D:\\ComfyUI_windows_portable",
    "C:\\ComfyUI_windows_portable",
    "E:\\ComfyUI_windows_portable",
  ].filter(Boolean);
  for (const c of candidates) {
    if (looksLikeComfy(c)) {
      return {
        name: "ComfyUI",
        status: "installed",
        source: "installed",
        path: c,
        detail: "Detected at " + c,
      };
    }
  }

  return {
    name: "ComfyUI",
    status: "missing",
    source: "missing",
    detail: "Not running and not found. Download the portable .zip from GitHub.",
  };
};
