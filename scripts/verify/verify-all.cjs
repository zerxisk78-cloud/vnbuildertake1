// Run every verify-*.cjs and parse every electron/**/*.cjs.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const results = [];

function step(name, fn) {
  process.stdout.write(`\n=== ${name} ===\n`);
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    console.error(e.message ?? e);
    results.push({ name, ok: false });
  }
}

step("node --check electron/**/*.cjs", () => {
  function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const full = path.join(d, f);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else if (f.endsWith(".cjs")) {
        const r = spawnSync("node", ["--check", full], { stdio: "inherit" });
        if (r.status !== 0) throw new Error(`syntax error in ${full}`);
      }
    }
  }
  walk(path.join(root, "electron"));
});

for (const script of ["verify-renpy.cjs", "verify-workflows.cjs"]) {
  step(script, () => {
    const r = spawnSync("node", [path.join(__dirname, script)], { stdio: "inherit" });
    if (r.status !== 0) throw new Error(`${script} failed`);
  });
}

console.log("\n=== summary ===");
for (const r of results) console.log((r.ok ? "PASS" : "FAIL") + "  " + r.name);
process.exit(results.every((r) => r.ok) ? 0 : 1);
