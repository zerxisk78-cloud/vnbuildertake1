// Preload: expose a typed bridge to the renderer.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lovableApi", {
  isElectron: true,
  listProjects: () => ipcRenderer.invoke("projects:list"),
  readProject: (id) => ipcRenderer.invoke("projects:read", id),
  writeProject: (p) => ipcRenderer.invoke("projects:write", p),
  deleteProject: (id) => ipcRenderer.invoke("projects:delete", id),
  readSettings: () => ipcRenderer.invoke("settings:read"),
  writeSettings: (s) => ipcRenderer.invoke("settings:write", s),
  detectAll: () => ipcRenderer.invoke("detect:all"),
  detect: (name) => ipcRenderer.invoke("detect:one", name),
  pickFolder: (title) => ipcRenderer.invoke("dialog:pickFolder", title),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  openPath: (p) => ipcRenderer.invoke("shell:openPath", p),
  spawnService: (name) => ipcRenderer.invoke("service:spawn", name),
  stopService: (name) => ipcRenderer.invoke("service:stop", name),
  serviceStatus: () => ipcRenderer.invoke("service:status"),
  exportRenpy: (id, dir, contents) =>
    ipcRenderer.invoke("renpy:export", id, dir, contents),
  downloadAssets: (dir, manifest) =>
    ipcRenderer.invoke("renpy:downloadAssets", dir, manifest),
  writeBinary: (dir, rel, base64) =>
    ipcRenderer.invoke("renpy:writeBinary", dir, rel, base64),
  buildRenpy: (projectDir) => ipcRenderer.invoke("renpy:build", projectDir),
  launchRenpy: (projectDir) => ipcRenderer.invoke("renpy:launch", projectDir),
});
