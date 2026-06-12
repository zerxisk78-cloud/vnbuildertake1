#!/usr/bin/env node
// Build the portable Windows distribution: vite build → @electron/packager →
// drop launcher batch + README → zip.
//
// Usage:  node scripts/package-portable.cjs

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "dist-electron");
const APP_NAME = "VNStudio";
const PACKAGED_DIR = path.join(OUT_DIR, `${APP_NAME}-win32-x64`);

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT, shell: true, ...opts });
  if (r.status !== 0) {
    console.error(`\n[package-portable] '${cmd}' failed with code ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

console.log("[package-portable] 1/4 vite build");
run("npx", ["cross-env", "ELECTRON_BUILD=1", "vite", "build"]);

console.log("[package-portable] 2/4 electron-packager");
run("npx", [
  "@electron/packager",
  ".",
  APP_NAME,
  "--platform=win32",
  "--arch=x64",
  `--out=${OUT_DIR}`,
  "--overwrite",
  "--ignore=^/src",
  "--ignore=^/public",
  "--ignore=^/dist-electron",
  "--ignore=^/.lovable",
  "--ignore=^/scripts",
]);

console.log("[package-portable] 3/4 drop launcher + README");
const launcher = `@echo off\r\nstart "" "%~dp0${APP_NAME}.exe"\r\n`;
fs.writeFileSync(path.join(PACKAGED_DIR, "Start VN Studio.bat"), launcher);
fs.writeFileSync(
  path.join(PACKAGED_DIR, "README-FIRST.txt"),
  [
    "VN Builder Studio - Portable Edition",
    "",
    "1. Double-click 'Start VN Studio.bat' (or VNStudio.exe).",
    "2. On first launch, the wizard checks for Ollama, ComfyUI, XTTS, and Ren'Py.",
    "3. Install any missing dependencies via the provided links, then click Re-scan.",
    "",
    "All project data is stored in the 'data/' folder next to VNStudio.exe.",
    "",
    "Recommended local dependencies (none are bundled, to keep this portable archive small):",
    "  - Ollama:    https://ollama.com/download",
    "  - ComfyUI:   https://github.com/comfyanonymous/ComfyUI/releases",
    "  - XTTS API:  https://github.com/daswer123/xtts-api-server",
    "  - Ren'Py:    https://www.renpy.org/latest.html",
    "",
  ].join("\r\n"),
);

console.log("[package-portable] 4/4 zip");
const zipName = `${APP_NAME}-Portable-win-x64.zip`;
const zipPath = path.join(OUT_DIR, zipName);
try {
  fs.rmSync(zipPath, { force: true });
} catch {
  /* noop */
}
// Use PowerShell on Windows hosts (always available); fall back to `zip` on Linux/macOS.
const isWin = process.platform === "win32";
if (isWin) {
  run("powershell", [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${PACKAGED_DIR}' -DestinationPath '${zipPath}'`,
  ]);
} else {
  run("bash", ["-c", `cd '${OUT_DIR}' && zip -r '${zipName}' '${path.basename(PACKAGED_DIR)}'`]);
}

console.log(`\n[package-portable] done → ${zipPath}`);
