// Detect Ollama. Probe running daemon first, then look for installed binary.
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

module.exports = async function detectOllama(settings) {
  const url = settings?.ollama?.url || "http://localhost:11434";
  try {
    const v = await getJSON(`${url}/api/version`);
    let models = [];
    try {
      const t = await getJSON(`${url}/api/tags`);
      models = (t.models ?? []).map((m) => m.name);
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
    // Check installed
    const candidates = [
      process.env.LOCALAPPDATA &&
        path.join(process.env.LOCALAPPDATA, "Programs", "Ollama", "ollama.exe"),
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Ollama", "ollama.exe"),
    ].filter(Boolean);
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return {
          name: "Ollama",
          status: "installed",
          source: "installed",
          path: c,
          detail: "Installed but not running. Use Start Ollama in Settings.",
        };
      }
    }
    return {
      name: "Ollama",
      status: "missing",
      source: "missing",
      detail: "Install from https://ollama.com",
    };
  }
};
