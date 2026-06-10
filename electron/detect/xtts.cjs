// Detect XTTS api server.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

function probe(port, p = "/docs") {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: p, timeout: 1000 },
      (res) => {
        res.resume();
        resolve(res.statusCode && res.statusCode < 500);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

module.exports = async function detectXtts(settings) {
  for (const port of [
    Number(new URL(settings?.xtts?.url || "http://127.0.0.1:8020").port) || 8020,
    8080,
  ]) {
    if (await probe(port)) {
      return {
        name: "XTTS",
        status: "running",
        source: "running",
        port,
        path: settings?.xtts?.path,
      };
    }
  }
  if (settings?.xtts?.path && fs.existsSync(path.join(settings.xtts.path, "start.bat"))) {
    return {
      name: "XTTS",
      status: "installed",
      source: "installed",
      path: settings.xtts.path,
      detail: "Installed. Click Start.",
    };
  }
  return {
    name: "XTTS",
    status: "missing",
    source: "missing",
    detail: "Install from https://github.com/daswer123/xtts-api-server",
  };
};
