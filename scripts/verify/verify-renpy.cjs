// Smoke-test the Ren'Py exporter against a synthetic project.
// Run: node scripts/verify/verify-renpy.cjs

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const TEST = `
import { buildRenpyProject, buildAssetManifest } from "./src/lib/renpy.ts";
const project = {
  id: "p1",
  name: "Sample",
  genre: "Visual Novel",
  description: "Demo",
  createdAt: 0,
  updatedAt: 0,
  scenes: [
    {
      id: "s1",
      title: "Opening",
      backgroundPrompt: "alley",
      background: "a_bg",
      lines: [
        { id: "l1", type: "dialogue", characterId: "c1", text: "Hi.", voiceUrl: "blob:fake" },
        {
          id: "l2",
          type: "choice",
          text: "",
          choices: [
            { id: "c1", label: "Stay", gotoSceneId: "s1" },
            { id: "c2", label: "Leave", gotoSceneId: "s1" },
          ],
        },
      ],
    },
  ],
  characters: [
    {
      id: "c1",
      name: "Aya",
      role: "lead",
      personality: "",
      voiceStyle: "",
      outfit: "",
      palette: "",
      portraitUrl: "http://x/p.png",
      expressions: [{ name: "neutral", url: "http://x/n.png" }],
    },
  ],
  lorebook: [],
  assets: [
    { id: "a_bg", kind: "background", name: "alley", source: "generated", url: "http://x/bg.png" },
  ],
};
const files = buildRenpyProject(project);
const manifest = buildAssetManifest(project);
const checks = [];
function ok(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail });
}
ok("script.rpy exists", !!files["game/script.rpy"]);
ok("script.rpy has menu", files["game/script.rpy"].includes("menu:"));
ok("script.rpy has voice line", files["game/script.rpy"].includes('voice "audio/voice/l1.wav"'));
ok("characters.rpy defines aya", files["game/characters.rpy"].includes("define aya"));
ok("manifest has bg", manifest.some(m => m.dest.startsWith("game/images/bg/")));
ok("manifest has portrait", manifest.some(m => m.dest.includes("/aya/neutral.png")));
ok("manifest has voice", manifest.some(m => m.dest === "game/audio/voice/l1.wav"));
const failed = checks.filter(c => !c.ok);
for (const c of checks) console.log((c.ok ? "OK  " : "FAIL") + " " + c.name);
if (failed.length) process.exit(1);
console.log("\\nverify-renpy: all " + checks.length + " checks passed");
`;

const TMP = path.join(__dirname, "..", "..", ".verify-renpy.mjs");
require("node:fs").writeFileSync(TMP, TEST);
const r = spawnSync("bunx", ["tsx", TMP], {
  stdio: "inherit",
  shell: true,
  cwd: path.join(__dirname, "..", ".."),
});
require("node:fs").rmSync(TMP, { force: true });
process.exit(r.status ?? 1);
