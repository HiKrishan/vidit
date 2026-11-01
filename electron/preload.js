"use strict";

const { contextBridge, ipcRenderer, webUtils } = require("electron");

function base64Url(text) {
  const bytes = new TextEncoder().encode(String(text));
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("vidit", {
  getInfo: () => ipcRenderer.invoke("app:info"),
  mediaUrl: (filePath) => `vidit-media://file/${base64Url(filePath)}`,
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return "";
    }
  },
  pickMedia: () => ipcRenderer.invoke("media:pick"),
  importPaths: (paths) => ipcRenderer.invoke("media:import-paths", paths),
  extractAudio: (asset, range) => ipcRenderer.invoke("media:extract-audio", asset, range),
  extractFrame: (asset, time) => ipcRenderer.invoke("media:freeze-frame", asset, time),
  saveRecording: (bytes, mime) => ipcRenderer.invoke("voice:save", { bytes, mime }),

  saveProject: (project, saveAs) => ipcRenderer.invoke("project:save", project, Boolean(saveAs)),
  openProject: () => ipcRenderer.invoke("project:open"),
  openProjectPath: (filePath) => ipcRenderer.invoke("project:open-path", filePath),
  resetProjectPath: () => ipcRenderer.invoke("project:reset-path"),
  getProjectPath: () => ipcRenderer.invoke("project:get-path"),
  revealProject: () => ipcRenderer.invoke("project:reveal"),
  autosave: (project) => ipcRenderer.invoke("project:autosave", { project }),
  readAutosave: () => ipcRenderer.invoke("project:autosave-read"),
  clearAutosave: () => ipcRenderer.invoke("project:autosave-clear"),

  startExport: (project, options, textImages) =>
    ipcRenderer.invoke("export:start", { project, options, textImages }),
  cancelExport: (jobId) => ipcRenderer.invoke("export:cancel", jobId),
  onExportProgress: (cb) => subscribe("export:progress", cb),
  onExportDone: (cb) => subscribe("export:done", cb),
  onExportFailed: (cb) => subscribe("export:failed", cb),

  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (patch) => ipcRenderer.invoke("settings:update", patch),
  detectTools: () => ipcRenderer.invoke("settings:detect"),

  showItem: (filePath) => ipcRenderer.invoke("shell:show-item", filePath),
  openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),

  minimize: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  toggleFullscreen: () => ipcRenderer.invoke("window:toggle-fullscreen"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  onMaximized: (cb) => subscribe("window:maximized", cb),

  platform: process.platform
});
