// Snapshot the ComfyUI workflow JSON shape so accidental breakage is caught.
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");

const TEST = `
import { sdxlTxt2Img, PRESETS } from "./src/lib/workflows.ts";
import { stableAudioWorkflow, musicGenWorkflow, AUDIO_PRESETS } from "./src/lib/audio-workflows.ts";
const checks = [];
function ok(name, cond) { checks.push({ name, ok: !!cond }); }
const wf = sdxlTxt2Img({ checkpoint: "x.safetensors", positive: "test" });
ok("sdxl has KSampler at 3", wf["3"]?.class_type === "KSampler");
ok("sdxl has CheckpointLoaderSimple at 4", wf["4"]?.class_type === "CheckpointLoaderSimple");
ok("sdxl has SaveImage at 9", wf["9"]?.class_type === "SaveImage");
const portrait = PRESETS.characterPortrait("x", "girl");
ok("portrait positive includes prompt", portrait["6"].inputs.text.includes("girl"));
const sa = stableAudioWorkflow({ positive: "rain" });
ok("stableAudio has SaveAudio at 8", sa["8"]?.class_type === "SaveAudio");
ok("stableAudio has EmptyLatentAudio", sa["2"]?.class_type === "EmptyLatentAudio");
const mg = musicGenWorkflow({ positive: "jazz" });
ok("musicGen has MusicgenLoader", mg["1"]?.class_type === "MusicgenLoader");
ok("AUDIO_PRESETS.sfx returns object", typeof AUDIO_PRESETS.sfx("door") === "object");
const failed = checks.filter(c => !c.ok);
for (const c of checks) console.log((c.ok ? "OK  " : "FAIL") + " " + c.name);
if (failed.length) process.exit(1);
console.log("\\nverify-workflows: all " + checks.length + " checks passed");
`;
const TMP = path.join(__dirname, "..", "..", ".verify-workflows.mjs");
fs.writeFileSync(TMP, TEST);
const r = spawnSync("bunx", ["tsx", TMP], {
  stdio: "inherit",
  shell: true,
  cwd: path.join(__dirname, "..", ".."),
});
fs.rmSync(TMP, { force: true });
process.exit(r.status ?? 1);
