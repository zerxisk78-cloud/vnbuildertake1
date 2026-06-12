# Slice 4 — Final Features + Full Verification

This is the last build slice. It ships the remaining authoring tools, the portable Windows packaging pipeline, and a first-run wizard, then runs an end-to-end verification pass across all four slices.

## 1. Sprite / expression batch generation

Add a "Generate full expression set" action on each character.

- New file `src/lib/expression-presets.ts` — exports an ordered list: `neutral, happy, sad, angry, surprised, blush, shocked, smug`.
- Extend `src/lib/workflows.ts` with `characterExpression(basePrompt, expression, seed)` that appends an expression suffix and reuses one seed for visual consistency.
- Update `src/routes/projects.$projectId.characters.tsx`: a "Batch expressions" button queues all presets sequentially through `GenerateImageButton`'s underlying client, writing each result into `character.expressions[]` with a progress toast (`3 / 8 done`).

## 2. CG scene generator

- New file `src/lib/cg-compose.ts` — builds a prompt from a scene: background prompt + listed character names/descriptions + a free-text "moment" field.
- New route action on `src/routes/projects.$projectId.scenes.tsx`: per-scene "Generate CG" button that runs the SDXL `cg` preset and stores the result as a `cg` asset linked to the scene (`scene.cgAssetId`).
- Optional ControlNet pose: if a reference image is attached, swap to a ControlNet-augmented workflow variant in `src/lib/workflows.ts` (`sdxlControlnetTxt2Img`).

## 3. Branching choice graph

- Install `reactflow` (`bun add reactflow`).
- New route file `src/routes/projects.$projectId.graph.tsx` rendering scenes as nodes and `choice.gotoSceneId` as edges. Click a node → navigate to that scene in the editor.
- Add a `Graph` tab to `src/routes/projects.$projectId.tsx` nav.

## 4. Portable Windows packaging

- New file `scripts/package-portable.cjs`:
  1. `ELECTRON_BUILD=1 vite build`
  2. `@electron/packager . "VNStudio" --platform=win32 --arch=x64 --out=dist-electron --overwrite`
  3. Drop `Start VN Studio.bat` (one line: `start "" "VNStudio.exe"`) and a `README-FIRST.txt` at the root of the packaged folder.
  4. Zip to `dist-electron/VNStudio-Portable-win-x64.zip`.
- Add npm scripts: `"package:portable": "node scripts/package-portable.cjs"`.
- Update `BUILD-DESKTOP.md` with the one-command flow.

## 5. First-run wizard

- New file `src/components/FirstRunWizard.tsx` — modal shown when `localStorage.vnstudio.firstRun !== 'done'`.
- Calls `bridge.detectAll()` and lists Ollama / ComfyUI / XTTS / Ren'Py / FFmpeg with status badge and a "Open install page" button per missing tool (uses `bridge.openExternal`).
- "Skip for now" and "Re-scan" buttons; "Done" sets the flag.
- Mount in `src/routes/__root.tsx`.

## 6. Verification pass

Run after the code above lands. Each item produces an explicit ✅/❌ in the final reply.

### Static / build
- `bun run lint` clean
- `tsc --noEmit` clean
- `vite build` (web) clean
- `ELECTRON_BUILD=1 vite build` clean
- Parse every `electron/**/*.cjs` with `node --check`

### Runtime — preview routes
- Load `/`, `/settings`, `/projects/:id/{overview,scenes,characters,lorebook,assets,ai,graph}` via the preview browser
- Capture console + network errors per route

### Functional unit checks (node scripts under `scripts/verify/`)
- `verify-renpy.cjs`: build sample project → assert every expected `game/*.rpy` file is non-empty, manifest contains background + voice entries
- `verify-workflows.cjs`: snapshot SDXL and audio workflow JSON, assert required node ids exist
- `verify-xtts.cjs`: assert request body shape matches `xtts-api-server` `/tts_to_audio/` schema

### Cross-slice regression
- Create project → add character → add scene with dialogue + choice → export Ren'Py → confirm `script.rpy` contains the `menu:` block and jumps

### Report
Final reply ends with a checklist of all the above plus any follow-ups (e.g. "MusicGen nodes not installed locally — generation will surface a clear error").

## Out of scope (won't do this slice)
- Auto-installing ComfyUI / XTTS / Ren'Py (stays detect-only by user preference)
- macOS / Linux packaging targets
- Multi-language UI

## Technical notes
- `reactflow` is the only new dependency.
- No backend / Lovable Cloud changes; everything remains local-first.
- All new server-touching code stays in `electron/` (Node) or renderer modules that call `bridge.*` — no TanStack server functions added.
