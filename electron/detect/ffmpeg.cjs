// Detect FFmpeg.
const { spawnSync } = require("node:child_process");

module.exports = async function detectFfmpeg() {
  const r = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (r.status === 0) {
    const first = (r.stdout || "").split("\n")[0];
    return { name: "FFmpeg", status: "installed", source: "installed", version: first };
  }
  return {
    name: "FFmpeg",
    status: "missing",
    source: "missing",
    detail: "ffmpeg not in PATH. Optional — only used for audio post-processing.",
  };
};
