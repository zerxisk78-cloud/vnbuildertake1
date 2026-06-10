// Detect Ren'Py SDK.
const fs = require("node:fs");
const path = require("node:path");

function findRenpyIn(root) {
  if (!root || !fs.existsSync(root)) return null;
  try {
    const entries = fs.readdirSync(root);
    for (const name of entries) {
      if (/^renpy-[\d.]+-sdk$/i.test(name)) {
        const dir = path.join(root, name);
        if (fs.existsSync(path.join(dir, "renpy.exe"))) return dir;
      }
    }
  } catch {
    /* noop */
  }
  return null;
}

module.exports = async function detectRenpy(settings) {
  if (
    settings?.renpy?.sdkPath &&
    fs.existsSync(path.join(settings.renpy.sdkPath, "renpy.exe"))
  ) {
    return {
      name: "Ren'Py",
      status: "installed",
      source: "installed",
      path: settings.renpy.sdkPath,
    };
  }
  const roots = [process.env.USERPROFILE, "C:\\", "D:\\", "E:\\"].filter(Boolean);
  for (const r of roots) {
    const hit = findRenpyIn(r);
    if (hit) {
      return { name: "Ren'Py", status: "installed", source: "installed", path: hit };
    }
  }
  return {
    name: "Ren'Py",
    status: "missing",
    source: "missing",
    detail: "Download from https://www.renpy.org/latest.html",
  };
};
