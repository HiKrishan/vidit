"use strict";

const { app } = require("electron");
const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const COMMON_WINDOWS_PATHS = [
  path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Links", "ffmpeg.exe"),
  "C:\\ffmpeg\\bin\\ffmpeg.exe",
  "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe"
];

let settingsPath = null;
let settings = {};
let resolved = null;
let resolving = null;

function getSettingsPath() {
  if (!settingsPath) settingsPath = path.join(app.getPath("userData"), "settings.json");
  return settingsPath;
}

async function readSettings() {
  try {
    settings = JSON.parse(await fsp.readFile(getSettingsPath(), "utf8"));
  } catch {
    settings = {};
  }
  return settings;
}

async function writeSettings(patch) {
  settings = { ...settings, ...patch };
  await fsp.mkdir(path.dirname(getSettingsPath()), { recursive: true });
  await fsp.writeFile(getSettingsPath(), JSON.stringify(settings, null, 2), "utf8");
  resolved = null;
  return settings;
}

function vendorPaths() {
  const roots = [];
  if (process.resourcesPath) roots.push(path.join(process.resourcesPath, "ffmpeg"));
  roots.push(path.join(app.getAppPath(), "vendor", "ffmpeg"));
  const names = process.platform === "win32" ? ["ffmpeg.exe", "ffprobe.exe"] : ["ffmpeg", "ffprobe"];
  const out = { ffmpeg: [], ffprobe: [] };
  for (const root of roots) {
    for (const name of names) {
      const full = path.join(root, name);
      if (name.startsWith("ffmpeg")) out.ffmpeg.push(full);
      else out.ffprobe.push(full);
    }
  }
  return out;
}

function candidatesFor(tool) {
  const env = tool === "ffmpeg" ? process.env.VIDIT_FFMPEG : process.env.VIDIT_FFPROBE;
  const vendor = vendorPaths()[tool] || [];
  const configured = settings[tool === "ffmpeg" ? "ffmpegPath" : "ffprobePath"];
  const list = [];
  if (configured) list.push(configured);
  if (env) list.push(env);
  list.push(...vendor);
  if (process.platform === "win32") {
    if (tool === "ffmpeg") list.push(...COMMON_WINDOWS_PATHS);
    else list.push(...COMMON_WINDOWS_PATHS.map((p) => p.replace(/ffmpeg\.exe$/i, "ffprobe.exe")));
  }
  list.push(process.platform === "win32" ? `${tool}.exe` : tool);
  return [...new Set(list)];
}

function probeBinary(file, tool) {
  return new Promise((resolve) => {
    execFile(file, ["-version"], { windowsHide: true, timeout: 8000 }, (error, stdout) => {
      if (error) return resolve(null);
      const text = String(stdout || "").split(/\r?\n/)[0] || "";
      resolve({ path: file, tool, version: text.trim() });
    });
  });
}

async function resolveTools(force = false) {
  if (resolved && !force) return resolved;
  if (resolving && !force) return resolving;
  resolving = (async () => {
    await readSettings();
    const result = { ffmpeg: null, ffprobe: null };
    for (const tool of ["ffmpeg", "ffprobe"]) {
      for (const candidate of candidatesFor(tool)) {
        if (candidate.includes(path.sep) && !fs.existsSync(candidate)) continue;
        const info = await probeBinary(candidate, tool);
        if (info) {
          result[tool] = info;
          break;
        }
      }
    }
    resolved = result;
    resolving = null;
    return result;
  })();
  return resolving;
}

async function toolPath(tool) {
  const tools = await resolveTools();
  if (!tools[tool]) {
    throw new Error(
      `${tool} was not found. Install FFmpeg and add it to PATH, put it in vendor/ffmpeg, ` +
        `or set its path in Vidit settings.`
    );
  }
  return tools[tool].path;
}

function run(binary, args, { timeout = 0, captureStdout = false, rawStdout = false, onStdout } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    const stdout = [];
    const stderr = [];
    let timeoutHandle = null;
    if (timeout) {
      timeoutHandle = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);
    }
    child.stdout.on("data", (chunk) => {
      if (captureStdout || rawStdout) stdout.push(chunk);
      if (onStdout) onStdout(chunk.toString());
    });
    child.stderr.on("data", (chunk) => {
      stderr.push(chunk);
      if (stderr.length > 200) stderr.shift();
    });
    child.on("error", (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(err);
    });
    child.on("close", (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      const errorText = Buffer.concat(stderr).toString().trim();
      if (code !== 0) {
        const err = new Error(errorText || `Command exited with code ${code}`);
        err.code = code;
        err.stderr = errorText;
        return reject(err);
      }
      resolve({
        stdout: rawStdout ? Buffer.concat(stdout) : Buffer.concat(stdout).toString(),
        stderr: errorText
      });
    });
  });
}

async function ffmpeg(args, options) {
  return run(await toolPath("ffmpeg"), args, options);
}

async function ffprobe(file) {
  const binary = await toolPath("ffprobe");
  const { stdout } = await run(
    binary,
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      file
    ],
    { timeout: 30000, captureStdout: true }
  );
  return JSON.parse(stdout);
}

function toolsSummary() {
  return resolved || { ffmpeg: null, ffprobe: null };
}

module.exports = {
  readSettings,
  writeSettings,
  resolveTools,
  toolPath,
  ffmpeg,
  ffprobe,
  run,
  toolsSummary,
  getSettingsPath
};
