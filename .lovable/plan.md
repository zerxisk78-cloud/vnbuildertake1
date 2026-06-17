## What the error tells us

```
Failed to load URL: file:///D:/.../resources/app.asar/dist/index.html
  with error: ERR_FILE_NOT_FOUND
```

Two things are wrong with the build the user just ran:

1. **It's loading `file://.../dist/index.html` instead of `app://localhost/`.** The current `electron/main.cjs` in the repo already uses `win.loadURL("app://localhost/")`, so the packaged `.exe` was built from an **older** main.cjs (before the SSR/protocol rework). The user needs to rebuild.
2. **It's loading from `app.asar`, and the file lives at `dist/client/index.html`, not `dist/index.html`.** Even after rebuild, two real issues remain in our packager + main.cjs combo:
   - `@electron/packager` v18+ enables `asar` by default. Our SSR loader does `import(pathToFileURL(dist/server/server.js))`. **ESM dynamic import does not work for files inside `app.asar`** — Node's ESM loader can't read asar's virtual FS. So SSR will silently fail and the app will only render static `index.html` (which has no SSR-rendered content for non-`/` paths and may flash blank).
   - There is no preflight check that `dist/client/index.html` and `dist/server/server.js` actually exist. When they're missing, the user sees a blank window with a cryptic console line instead of an actionable error.

## Fix plan

### 1. Disable asar so the SSR bundle is importable

Add `--no-asar` to `scripts/package-portable.cjs`. This trades a few hundred MB of inode bloat for a working SSR loader. (We can revisit `asarUnpack` later, but `--no-asar` is the safe, minimal change.)

### 2. Add a preflight + clearer error in `electron/main.cjs`

Before calling `win.loadURL("app://localhost/")`:

- Check `fs.existsSync(CLIENT_DIR + '/index.html')` and `fs.existsSync(SERVER_BUNDLE)`.
- If either is missing, immediately load a `data:` HTML page that says exactly which file is missing and which folder the app expected it in (`resources/app/dist/...`). No more silent blank window.
- Also wire `win.webContents.on('did-fail-load', ...)` to log to a file under `data/logs/electron.log` so the user can paste it back.

### 3. Verify the rebuilt zip actually contains the new main.cjs

Add a tiny version stamp at the top of `main.cjs` (`const BUILD_TAG = "ssr-protocol-v2"`) and print it on startup. Then if a stale build is run, the console immediately shows the old tag (or no tag) and we know to rebuild rather than chasing ghosts.

### 4. Security recommendation (CSP warning in DevTools)

The Electron "Insecure Content-Security-Policy" warning fires because our `app://` responses don't include a CSP header. Add a default CSP header to every response from `protocol.handle("app", ...)`:

```
default-src 'self' app: data: blob:;
script-src 'self' 'unsafe-inline' app:;
style-src 'self' 'unsafe-inline' app:;
img-src 'self' app: data: blob: http://127.0.0.1:* http://localhost:*;
media-src 'self' app: blob: http://127.0.0.1:* http://localhost:*;
connect-src 'self' app: ws: wss: http://127.0.0.1:* http://localhost:* https:;
font-src 'self' app: data:;
```

(`unsafe-inline` is required because Vite/Tailwind inject inline styles. `http://127.0.0.1:*` is required so the renderer can talk to Ollama/ComfyUI/XTTS.)

### 5. After rebuild, user runs

```
bun run package:portable
```

and then launches the new `dist-electron/VNStudio-win32-x64/VNStudio.exe`. If it still fails, the new on-screen error will tell us exactly which file is missing instead of a blank window.

## Files I'll touch

- `scripts/package-portable.cjs` — add `--no-asar`.
- `electron/main.cjs` — preflight existence check, `BUILD_TAG` log line, file-logging on `did-fail-load`, CSP header in the `app://` handler.

No app/UI code changes in this slice — this is strictly the desktop launcher fix + the CSP security warning. The RPG Maker / Ren'Py importers from slices 6 & 7 are already in the build and will start working once the window actually loads.
