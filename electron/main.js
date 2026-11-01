"use strict";

const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
  shell
} = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pathToFileURL } = require("node:url");

const tooling = require("./lib/ffmpeg");
const media = require("./lib/media");
const projectStore = require("./lib/project-store");
const exporter = require("./lib/exporter");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const isDev = process.argv.includes("--dev") || !app.isPackaged;
if (isDev && process.env.VIDIT_DEBUG_PORT) {
  app.commandLine.appendSwitch("remote-debugging-port", String(process.env.VIDIT_DEBUG_PORT));
}
const allowedMedia = new Set();
let mainWindow = null;
let isQuitting = false;

protocol.registerSchemesAsPrivileged([
  {
    scheme: "vidit-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  }
]);

function mediaKey(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function allowMediaPath(filePath) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) return;
  allowedMedia.add(mediaKey(filePath));
}

function allowAsset(asset) {
  if (!asset) return;
  allowMediaPath(asset.path);
  allowMediaPath(asset.thumb);
}

function allowProject(project) {
  for (const asset of project?.assets || []) allowAsset(asset);
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".opus": "audio/ogg",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".avif": "image/avif"
  };
  return map[ext] || "application/octet-stream";
}

function parseRange(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader || "").trim());
  if (!match) return null;
  let start = match[1] === "" ? null : Number(match[1]);
  let end = match[2] === "" ? null : Number(match[2]);
  if (start === null) {
    const suffix = Math.min(size, end || 0);
    start = size - suffix;
    end = size - 1;
  } else {
    if (end === null || end >= size) end = size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= size) {
    return null;
  }
  return { start, end };
}

async function serveMedia(request) {
  try {
    const url = new URL(request.url);
    const encoded = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const filePath = Buffer.from(encoded, "base64url").toString("utf8");
    if (!path.isAbsolute(filePath) || !allowedMedia.has(mediaKey(filePath))) {
      return new Response("Not allowed", { status: 403 });
    }
    const stat = await fsp.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) return new Response("Not found", { status: 404 });
    const type = mimeType(filePath);
    const range = parseRange(request.headers.get("range"), stat.size);
    const commonHeaders = {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "Cross-Origin-Resource-Policy": "cross-origin"
    };
    if (request.method === "HEAD") {
      const status = range ? 206 : 200;
      const headers = { ...commonHeaders, "Content-Length": String(range ? range.end - range.start + 1 : stat.size) };
      if (range) headers["Content-Range"] = `bytes ${range.start}-${range.end}/${stat.size}`;
      return new Response(null, { status, headers });
    }
    if (range) {
      const stream = fs.createReadStream(filePath, { start: range.start, end: range.end });
      return new Response(Readable.toWeb(stream), {
        status: 206,
        headers: {
          ...commonHeaders,
          "Content-Length": String(range.end - range.start + 1),
          "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}`
        }
      });
    }
    const stream = fs.createReadStream(filePath);
    return new Response(Readable.toWeb(stream), {
      status: 200,
      headers: { ...commonHeaders, "Content-Length": String(stat.size) }
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    frame: false,
    backgroundColor: "#0b0f0e",
    title: "Vidit",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "..", "src", "index.html"));

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow) return;
    mainWindow.show();
    if (process.env.VIDIT_DEVTOOLS === "1" && isDev) mainWindow.webContents.openDevTools({ mode: "detach" });
  });

  mainWindow.on("maximize", () => mainWindow?.webContents.send("window:maximized", true));
  mainWindow.on("unmaximize", () => mainWindow?.webContents.send("window:maximized", false));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault();
  });

  if (isDev && process.env.VIDIT_SMOKE === "1") {
    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        try {
          const report = await mainWindow.webContents.executeJavaScript(`(() => {
            const q = (selector) => document.querySelector(selector);
            const box = (selector) => {
              const el = q(selector);
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
            };
            return {
              readyState: document.readyState,
              title: document.title,
              bridge: Object.keys(window.vidit || {}),
              layout: {
                titlebar: box("#titlebar"),
                rail: box(".rail"),
                library: box("#libraryPanel"),
                stage: box("#stage"),
                inspector: box("#inspectorPanel"),
                timeline: box("#timelinePanel")
              },
              tabs: [...document.querySelectorAll(".rail-item[data-tab]")].map((el) => el.dataset.tab),
              trackHeads: document.querySelectorAll(".track-head").length,
              clips: document.querySelectorAll(".clip").length,
              libraryTitle: q("#libraryHead .panel-title")?.textContent || null,
              stageEmptyVisible: !q("#stageEmpty")?.classList.contains("hidden"),
              inspectorText: (q("#inspectorBody")?.innerText || "").slice(0, 300),
              errors: window.__viditErrors || []
            };
          })()`);
          console.log("[smoke] report", JSON.stringify(report, null, 2));
          const image = await mainWindow.webContents.capturePage();
          const out = path.join(app.getPath("temp"), "vidit-smoke.png");
          await fsp.writeFile(out, image.toPNG());
          console.log("[smoke] screenshot", out, image.getSize());
        } catch (err) {
          console.error("[smoke] failed", err);
        }
      }, 2500);
    });
  }

  if (isDev) {
    mainWindow.webContents.on("console-message", (details) => {
      const level = typeof details?.level === "number" ? details.level : 0;
      const label = ["verbose", "info", "warning", "error"][level] || "log";
      const source = String(details?.sourceId || "").split("/").pop();
      console.log(`[renderer:${label}] ${details?.message || ""} (${source}:${details?.lineNumber || 0})`);
    });
    mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
      console.error(`[preload] ${preloadPath}: ${error?.stack || error}`);
    });
    mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
      console.error(`[load] ${code} ${description} ${url}`);
    });
    mainWindow.webContents.on("before-input-event", (event, input) => {
      if (input.key === "F12" || (input.control && input.shift && input.key.toLowerCase() === "i")) {
        mainWindow?.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  }
}

function setupIpc() {
  ipcMain.handle("app:info", async () => {
    const tools = await tooling.resolveTools();
    return {
      appVersion: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      userData: app.getPath("userData"),
      autosavePath: projectStore.getAutosavePath(),
      settingsPath: tooling.getSettingsPath(),
      tools,
      isDev,
      ffmpeg: tools.ffmpeg,
      ffprobe: tools.ffprobe
    };
  });

  ipcMain.handle("settings:get", async () => {
    await tooling.readSettings();
    await tooling.resolveTools();
    return {
      settings: await tooling.readSettings(),
      tools: await tooling.resolveTools()
    };
  });

  ipcMain.handle("settings:update", async (_event, patch) => {
    const safePatch = {};
    if (patch && typeof patch.ffmpegPath === "string") safePatch.ffmpegPath = patch.ffmpegPath;
    if (patch && typeof patch.ffprobePath === "string") safePatch.ffprobePath = patch.ffprobePath;
    await tooling.writeSettings(safePatch);
    const tools = await tooling.resolveTools(true);
    return { settings: await tooling.readSettings(), tools };
  });

  ipcMain.handle("settings:detect", async () => {
    const tools = await tooling.resolveTools(true);
    return tools;
  });

  ipcMain.handle("media:pick", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Add media",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Media",
          extensions: [
            "mp4",
            "mov",
            "m4v",
            "webm",
            "mkv",
            "avi",
            "wmv",
            "flv",
            "mpg",
            "mpeg",
            "ts",
            "mts",
            "mp3",
            "wav",
            "m4a",
            "aac",
            "flac",
            "ogg",
            "opus",
            "png",
            "jpg",
            "jpeg",
            "webp",
            "gif",
            "bmp",
            "avif"
          ]
        },
        { name: "Video", extensions: ["mp4", "mov", "m4v", "webm", "mkv", "avi", "wmv", "flv", "mpg", "mpeg", "ts", "mts"] },
        { name: "Audio", extensions: ["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus"] },
        { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"] }
      ]
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true, assets: [], errors: [] };
    const imported = await media.importFiles(result.filePaths);
    imported.assets.forEach(allowAsset);
    return { canceled: false, ...imported };
  });

  ipcMain.handle("media:import-paths", async (_event, files) => {
    const list = Array.isArray(files) ? files.filter((f) => typeof f === "string") : [];
    if (!list.length) return { assets: [], errors: [] };
    const imported = await media.importFiles(list);
    imported.assets.forEach(allowAsset);
    return imported;
  });

  ipcMain.handle("media:extract-audio", async (_event, asset, range) => {
    if (!asset || typeof asset.path !== "string") throw new Error("Select a clip with audio first.");
    const imported = await media.extractAudio(asset, range || {});
    allowAsset(imported);
    return imported;
  });

  ipcMain.handle("media:freeze-frame", async (_event, asset, time) => {
    if (!asset || typeof asset.path !== "string") throw new Error("Select a video clip first.");
    const imported = await media.extractFrame(asset, Number(time) || 0);
    allowAsset(imported);
    return imported;
  });

  ipcMain.handle("voice:save", async (_event, payload) => {
    if (!payload || !payload.bytes) throw new Error("The recording was empty.");
    const imported = await media.saveRecording(payload.bytes, String(payload.mime || "audio/webm"));
    allowAsset(imported);
    return imported;
  });

  ipcMain.handle("project:save", async (_event, project, saveAs = false) => {
    let filePath = projectStore.getProjectPath();
    if (saveAs || !filePath) {
      const defaultName = `${projectStore.safeName(project?.name)}.vidit`;
      const result = await dialog.showSaveDialog(mainWindow, {
        title: saveAs ? "Save project as" : "Save project",
        defaultPath: filePath || path.join(app.getPath("documents"), defaultName),
        filters: [{ name: "Vidit project", extensions: ["vidit"] }]
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      filePath = result.filePath;
      if (!filePath.toLowerCase().endsWith(".vidit")) filePath += ".vidit";
    }
    const projectWithDate = { ...project, savedAt: Date.now(), modifiedAt: Date.now() };
    const saved = await projectStore.saveProject(projectWithDate, filePath);
    allowProject(projectWithDate);
    projectStore.setProjectPath(filePath);
    return { canceled: false, ...saved };
  });

  ipcMain.handle("project:open", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Open Vidit project",
      properties: ["openFile"],
      filters: [
        { name: "Vidit project", extensions: ["vidit", "json"] },
        { name: "All files", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const project = await projectStore.readProject(result.filePaths[0]);
    allowProject(project);
    projectStore.setProjectPath(result.filePaths[0]);
    return { canceled: false, project, filePath: result.filePaths[0] };
  });

  ipcMain.handle("project:open-path", async (_event, filePath) => {
    if (typeof filePath !== "string") throw new Error("No project path provided.");
    const project = await projectStore.readProject(filePath);
    allowProject(project);
    projectStore.setProjectPath(filePath);
    return { project, filePath };
  });

  ipcMain.handle("project:reset-path", async () => {
    projectStore.setProjectPath(null);
    return true;
  });

  ipcMain.handle("project:get-path", async () => projectStore.getProjectPath());

  ipcMain.handle("project:reveal", async () => {
    const filePath = projectStore.getProjectPath();
    if (filePath) shell.showItemInFolder(filePath);
    return Boolean(filePath);
  });

  ipcMain.handle("project:autosave", async (_event, payload) => {
    if (!payload?.project) return { savedAt: 0 };
    allowProject(payload.project);
    return projectStore.writeAutosave({
      project: payload.project,
      filePath: projectStore.getProjectPath(),
      savedAt: Date.now()
    });
  });

  ipcMain.handle("project:autosave-read", async () => {
    const data = await projectStore.readAutosave();
    if (data?.project) allowProject(data.project);
    return data;
  });

  ipcMain.handle("project:autosave-clear", async () => {
    await projectStore.clearAutosave();
    return true;
  });

  ipcMain.handle("export:start", async (event, payload) => {
    if (!payload?.project || !Array.isArray(payload.textImages)) {
      throw new Error("The export request was incomplete.");
    }
    const project = payload.project;
    const options = payload.options || {};
    const format = options.format === "webm" ? "webm" : "mp4";
    const baseName = projectStore.safeName(project.name);
    let outputPath = "";
    if (isDev && typeof options.outputPath === "string" && path.isAbsolute(options.outputPath)) {
      outputPath = options.outputPath;
    } else {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: "Export video",
        defaultPath: path.join(app.getPath("videos"), `${baseName}.${format}`),
        filters: [
          format === "webm"
            ? { name: "WebM video", extensions: ["webm"] }
            : { name: "MP4 video", extensions: ["mp4"] }
        ]
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      outputPath = result.filePath;
    }
    if (!outputPath.toLowerCase().endsWith(`.${format}`)) outputPath += `.${format}`;
    allowProject(project);
    return {
      canceled: false,
      ...exporter.startJob({
        project,
        options: { ...options, format, outputPath },
        textImages: payload.textImages,
        sender: event.sender
      }),
      outputPath
    };
  });

  ipcMain.handle("export:cancel", async (_event, jobId) => {
    return exporter.cancelJob(jobId);
  });

  ipcMain.handle("shell:show-item", async (_event, filePath) => {
    if (typeof filePath === "string" && path.isAbsolute(filePath)) shell.showItemInFolder(filePath);
  });

  ipcMain.handle("shell:open-external", async (_event, url) => {
    if (typeof url === "string" && /^https?:/i.test(url)) await shell.openExternal(url);
  });

  ipcMain.handle("window:minimize", async () => {
    mainWindow?.minimize();
  });

  ipcMain.handle("window:toggle-maximize", async () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });

  ipcMain.handle("window:is-maximized", async () => Boolean(mainWindow?.isMaximized()));

  ipcMain.handle("window:toggle-fullscreen", async () => {
    if (!mainWindow) return false;
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
    return mainWindow.isFullScreen();
  });

  ipcMain.handle("window:close", async () => {
    mainWindow?.close();
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    nativeThemeDark();
    protocol.handle("vidit-media", serveMedia);
    await tooling.readSettings();
    await tooling.resolveTools();
    setupIpc();

    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const trusted = webContents === mainWindow?.webContents;
      const wantsAudio = !details?.mediaTypes || details.mediaTypes.includes("audio");
      callback(Boolean(trusted && permission === "media" && wantsAudio));
    });
    session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
      if (permission !== "media") return false;
      return webContents === mainWindow?.webContents;
    });

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

function nativeThemeDark() {
  try {
    const { nativeTheme } = require("electron");
    nativeTheme.themeSource = "dark";
  } catch {
    /* noop */
  }
}

app.on("before-quit", () => {
  isQuitting = true;
  exporter.cancelAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || isQuitting) app.quit();
});

process.on("uncaughtException", (err) => {
  console.error("[Vidit] Uncaught exception:", err);
});
