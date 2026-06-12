# Building the Windows desktop .exe

This project is both a web app (works in the Lovable preview) and an
Electron desktop app (the portable `.zip` you actually use day-to-day).

## One-time setup (your PC)

1. Install [Node.js LTS](https://nodejs.org/) and [Bun](https://bun.sh/) (Bun
   is what the project's lockfile uses; npm also works).
2. Download or `git clone` this project onto your PC.
3. From the project folder, install dependencies and the Electron build
   tools:

   ```bat
   bun install
   bun add -d electron @electron/packager cross-env
   ```

## Build the portable .zip (recommended)

```bat
bun run package:portable
```

The result lands in `dist-electron\VNStudio-Portable-win-x64.zip`. Unzip
anywhere and double-click **`Start VN Studio.bat`** (or `VNStudio.exe`).
The first launch shows a wizard that scans for Ollama / ComfyUI / XTTS /
Ren'Py and links the install pages for any that are missing.

## Build the raw .exe folder (advanced)

```bat
bun run electron:package
```

The result lands in `electron-release\VNBuilderStudio-win32-x64\`.

The first run creates a `data\` folder next to the .exe holding your
projects (`data\projects\<id>\project.json`) and settings
(`data\settings.json`). To back up, copy `data\`. To move to another PC,
copy the whole folder.

## Dependency detection

On first launch and from Settings → Re-scan, the app looks for:

| Tool       | How it's found                                                                          |
| ---------- | ---------------------------------------------------------------------------------------- |
| Ollama     | HTTP probe `localhost:11434/api/version`, then `%LOCALAPPDATA%\Programs\Ollama\ollama.exe` |
| ComfyUI    | HTTP probe `127.0.0.1:8188/system_stats`, then your saved path, then `%USERPROFILE%\ComfyUI_windows_portable`, then `C:\`, `D:\`, `E:\` |
| XTTS       | HTTP probe `127.0.0.1:8020/docs` and `:8080/docs`                                        |
| Ren'Py SDK | Folders matching `renpy-*-sdk` under `%USERPROFILE%`, `C:\`, `D:\`, `E:\` containing `renpy.exe` |
| FFmpeg     | `ffmpeg -version` on PATH                                                                |

If something is already running, the app **attaches** to it — it never
spawns a second copy. If you have it installed but stopped, click
"Start" in Settings and the app spawns the existing install.

## Running the web preview against your local Ollama

The Lovable browser preview can talk to Ollama too, but browser fetches
are blocked by CORS unless you start Ollama with `OLLAMA_ORIGINS=*`:

```bat
setx OLLAMA_ORIGINS "*"
ollama serve
```

The desktop build (Electron) does not need this — it's a packaged app,
not a browser.

## Dev-time Electron (optional)

If you want to iterate on the Electron shell without packaging every
time:

```bat
bun run build:dev
bun run electron:dev
```

This loads the latest `dist/index.html` in an Electron window.

## What's in this build (Slice 1)

- Projects (create / duplicate / delete)
- Scenes editor with all line types (Dialogue, Narration, Choice, SFX, Music change, Transition, Show/Hide, Note)
- Live Ren'Py preview per scene
- Characters / Lorebook / Assets (data entry; ComfyUI generation arrives in Slice 2)
- Builder AI chat (streams from your local Ollama, project context auto-attached)
- Settings with dependency detection and "use existing install" behavior
- Ren'Py project export (writes `game/*.rpy` + `README.txt` to a folder you pick)

Slices 2–4 add: ComfyUI portrait / background / expression generation,
MusicGen + Stable Audio via ComfyUI, XTTS character voice, voiced Ren'Py
export, and a "Build Game" button that invokes the Ren'Py SDK.
