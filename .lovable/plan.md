
# VN Builder Studio — local desktop app, ComfyUI + Ollama + Ren'Py

A Windows desktop app you unzip and run. Everything runs on your machine. The app is the cockpit: you write/design with AI help, generate images via your ComfyUI, generate music/SFX/voice via your ComfyUI + a small XTTS server, and export a complete Ren'Py project you can build into a game .exe.

## Dependency detection (first-run wizard + Settings)

On first launch and any time you open Settings → Dependencies, the app scans your PC and tells you exactly what it found. Nothing is ever auto-installed without your click, and detected installs are reused — no second copies.

For each dependency it shows: **Status • Where it found it • Version • [Use this] / [Pick folder…] / [Install guide]**.

How each one is detected:

- **Ollama** — probe `http://localhost:11434/api/version`. If running: shows version + a model dropdown populated from `/api/tags` (so your existing Qwen 3 / 3.5 pulls just appear). If not running but installed: check `%LOCALAPPDATA%\Programs\Ollama\ollama.exe` and the `OLLAMA_HOST` env var; offer "Start Ollama" (spawns it) instead of installing. If not installed at all: link to the installer, no silent download.
- **ComfyUI portable** — probe `http://127.0.0.1:8188/system_stats` first (uses whatever's already running, even if you started it yourself). If nothing is running, scan common spots in this order: the path you previously set, `%USERPROFILE%\ComfyUI_windows_portable`, `D:\ComfyUI_windows_portable`, `C:\ComfyUI_windows_portable`, plus any drive root. A folder counts as ComfyUI if it contains `run_nvidia_gpu.bat` and `ComfyUI\main.py`. Found → "Use this install" (no second copy). Not found → "Pick folder…" or link to the official portable .zip.
- **ComfyUI models / workflows** — once a ComfyUI is selected, read `ComfyUI/models/checkpoints`, `loras`, `vae`, `controlnet`, `audio_checkpoints` and `/object_info` to list what's actually installed. The model pickers in the app only show installed models — no broken references. If a required custom node is missing (e.g. ComfyUI-Manager, was-node-suite, ComfyUI-AudioScheduler for MusicGen), show a one-line "Missing: X — Open ComfyUI Manager" link instead of trying to install Python packages ourselves.
- **XTTS voice server** — probe `http://127.0.0.1:8020/docs` (xtts-api-server) and `http://127.0.0.1:8080` (xtts-webui), in that order. Found → use it. Not found but folder picked → "Start XTTS" spawns its `start.bat`. Not found → install guide. Same "use what's there" rule.
- **Ren'Py SDK** — scan `%USERPROFILE%`, `C:\`, `D:\`, `E:\` for folders matching `renpy-*-sdk` containing `renpy.exe`. Read the SDK version from `renpy/vc_version.py`. You can also point at it manually. If multiple SDKs are found, the dropdown lets you pick the active one (e.g. 8.3 for new projects, 7.x for legacy).
- **Python** (only needed if you ever opt into a feature that runs a helper script — none in the default flow) — `where python` + `py --list`. Reuses whatever's there; never installs Python.
- **FFmpeg** (used to trim/loop generated music and mux voice into Ren'Py audio) — `where ffmpeg`, then check ComfyUI's bundled ffmpeg, then a small portable copy can be downloaded into `./vendor/ffmpeg/` only after you click "Download FFmpeg (8 MB)". Never silent.
- **Node / npm / Git** — not required at runtime. App ships its own bundled runtime via Electron.

### How "use existing" actually behaves

- If a service is already running on its port, the app **attaches** to it (no spawn, no port conflict). The status pill says "Attached (external)" so you know the app didn't start it and won't stop it on exit.
- If the app starts the service itself, the pill says "Managed" and it's shut down cleanly when you quit.
- If a port is busy with something that isn't the expected service (wrong `/system_stats` shape, wrong response on `/api/version`), the app refuses to start a duplicate, surfaces the conflict, and offers "Change port" or "Open the process using port 8188" via `netstat`.
- All detected paths are cached in `./data/settings.json`. A "Re-scan" button on the Settings page forces a fresh probe.

## What you get

### Packaging
- Portable folder `VNBuilderStudio-win-x64.zip` → unzip → run `VNBuilderStudio.exe`.
- Electron shell wrapping the web UI. No installer, no admin rights, no system writes outside the folder.
- All project data stored in `./data/` next to the .exe (plain JSON files, easy to back up or move).

### Settings (first-run wizard)
- Dependency detection (above) runs automatically and writes results to `./data/settings.json`.
- Per service you can override: URL, auto-launch on/off, extra CLI args (e.g. `--lowvram` for ComfyUI).
- "Test" button on each row hits the live endpoint and reports latency.

### Projects
- Home: grid of projects (cover, genre, last edited). Create / duplicate / rename / delete / export-as-json / import.
- Per-project workspace with these tabs:

### Scenes
- List + reorder + scene-flow visualization.
- Per scene: background, music, ambient SFX, list of script lines.
- Line types: Dialogue (character + emotion), Narration, Choice (with branches → other scenes), SFX, Music change, Transition, Show/Hide sprite, Dev note.
- Live "Ren'Py preview" panel showing the generated `.rpy` for the current scene.

### Characters
- Name, role, personality, voice style, base outfit, color palette.
- **Portraits**: one base portrait + an expression set (neutral / happy / angry / sad / blush / surprised / …). Each one has a ComfyUI workflow assigned.
- **Sprite sheet generation**: pick a character → app sends the base portrait + face-only inpaint workflow to ComfyUI for each expression, returns PNGs into `./data/<project>/sprites/<char>/`.

### Lorebook
- Entries with title, trigger keywords, body. Auto-injected into Ollama prompts when a trigger word appears in the current scene.

### Assets
- Backgrounds, sprites, CGs, music tracks, SFX, voice clips, fonts.
- Each asset: name, type, source ("generated"/"imported"), file path, generation prompt, workflow used, seed.
- Drag-import files; generated assets land here automatically.

### Builder AI (chat panel, available in every tab)
- Chat with your local Ollama. The system prompt includes a compact JSON of: characters, scenes, current scene's script, lorebook entries triggered by keywords, asset names. Streams tokens as they arrive.
- Quick prompts: "Write opening scene", "Continue this scene", "Design a character", "Generate background prompt", "Generate BGM prompt", "Generate SFX prompt", "Polish dialogue", "Convert this scene to Ren'Py", "Plan branching choices".
- Tool calls (Qwen 3 supports tool calling) so the AI can directly: create a scene, add a script line, add a character, queue an image generation, queue a music generation. Each tool call requires one click to confirm before it runs.

### ComfyUI integration
- Bundled workflow templates as editable JSON (you can swap models/LoRAs in the UI without touching JSON):
  - **Character portrait** — SDXL / Pony / Illustrious base, supports up to 3 character LoRAs.
  - **Expression inpaint** — ADetailer-style face mask + img2img.
  - **Background** — SDXL landscape, hi-res fix.
  - **CG scene** — SDXL with 2 character LoRAs + pose ControlNet (optional).
  - **MusicGen** track (loops, intro/loop/outro segments).
  - **Stable Audio Open** SFX (short clips, looping toggle).
- App queues via `/prompt`, subscribes to ComfyUI's WebSocket for live progress (% bar + preview thumbnail), pulls finished images from `/history/<prompt_id>` and saves them into the project.
- Model picker reads `/object_info` to list available checkpoints, LoRAs, VAEs, samplers (only what's actually installed).
- "Open in ComfyUI" button on any generated asset (loads the exact workflow + seed in your browser ComfyUI tab).

### XTTS v2 voice
- Per-character voice profile: reference WAV (drag in any 6–30 s clip) + language + speed.
- "Voice this line" / "Voice this scene" → sends each Dialogue line to XTTS, saves WAVs into `./data/<project>/voice/<scene>/<line-id>.wav`.
- Auto-attached to Ren'Py export as `voice "..."` lines.

### Ren'Py export
- "Export Ren'Py project" → writes a full project tree to a folder you choose:
  - `game/script.rpy` (split per scene), `game/characters.rpy`, `game/screens.rpy` (default with custom textbox styling), `game/options.rpy`.
  - `game/images/bg/`, `game/images/<character>/<expression>.png` with auto-generated `image` statements.
  - `game/audio/music/`, `game/audio/sfx/`, `game/audio/voice/`.
- "Build Game" button → if Ren'Py SDK is detected, invokes `renpy.exe <project> distribute` and shows build log; output ends up in `<project>/dist/`.

## Tech notes (skim if you want)

- **Stack**: TanStack Start app shipped via Electron (`@electron/packager`, `base: './'` in Vite, `electron/main.cjs`, CommonJS, contextIsolation on, nodeIntegration off). IPC preload exposes: `detectDeps()`, `spawnService(name)`, `stopService(name)`, `pickFolder()`, `readProject()/writeProject()`, `exportRenpy()`, `buildRenpy()`, `openExternal(url)`.
- **Detection module** lives in `electron/detect/*.ts` — one file per dependency, each exports `probe()` returning `{ status, source: "running"|"installed"|"missing", path?, version?, port? }`. Settings page shows whatever they return.
- **No Lovable Cloud**, no Supabase, no `LOVABLE_API_KEY`. Electron loads built static files via `file://`.
- **Local persistence**: per-project JSON in `./data/<projectId>/project.json` + media files alongside. Settings + detected paths in `./data/settings.json`.
- **Process supervision**: managed services spawned with `child_process.spawn`, stdout streamed to a "Servers" log drawer, killed on app quit. Attached (external) services are never killed.

## Out of scope (so you know)

- Unity / UE5 generation — not feasible here. Ren'Py only.
- Auto-installing ComfyUI, Ollama, XTTS, Ren'Py SDK, or Python. App detects and reuses; never installs silently.
- Cloud sync / multiplayer editing.
- Mac/Linux .app build (one-line change to electron-packager; can add later).

## Build order

1. **Slice 1 (this turn)**: Electron shell + dependency-detection wizard + Projects + Scenes + Settings + Ollama chat + Ren'Py text export. You'll be able to write, chat with Qwen, and export a buildable Ren'Py project.
2. **Slice 2**: Characters + Lorebook + Assets + ComfyUI integration (attach-if-running, auto-launch otherwise; portraits, backgrounds, expression inpaint).
3. **Slice 3**: MusicGen + Stable Audio workflows + XTTS voice + voiced Ren'Py export + "Build Game" button.
4. **Slice 4**: Sprite sheet batch, CG scenes with ControlNet, branching choice editor visualization, packaging polish.

Approve and I'll start on Slice 1.
