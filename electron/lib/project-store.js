"use strict";

const { app } = require("electron");
const fsp = require("node:fs/promises");
const path = require("node:path");

let currentProjectPath = null;

function getProjectPath() {
  return currentProjectPath;
}

function setProjectPath(filePath) {
  currentProjectPath = filePath || null;
}

function getAutosavePath() {
  return path.join(app.getPath("userData"), "autosave.vidit.json");
}

function safeName(name) {
  return String(name || "Untitled")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "Untitled";
}

async function writeAtomic(filePath, data) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(temp, JSON.stringify(data, null, 2), "utf8");
  await fsp.rename(temp, filePath);
}

async function saveProject(project, filePath) {
  const target = filePath || currentProjectPath;
  if (!target) throw new Error("No project path selected.");
  await writeAtomic(target, project);
  currentProjectPath = target;
  return { filePath: target, savedAt: Date.now() };
}

async function readProject(filePath) {
  const raw = await fsp.readFile(filePath, "utf8");
  const data = JSON.parse(raw);
  if (!data || typeof data !== "object" || !Array.isArray(data.tracks)) {
    throw new Error("This is not a valid Vidit project.");
  }
  return data;
}

async function writeAutosave(payload) {
  await writeAtomic(getAutosavePath(), payload);
  return { savedAt: Date.now() };
}

async function readAutosave() {
  try {
    const raw = await fsp.readFile(getAutosavePath(), "utf8");
    const data = JSON.parse(raw);
    if (!data?.project || !Array.isArray(data.project.tracks)) return null;
    return data;
  } catch {
    return null;
  }
}

async function clearAutosave() {
  await fsp.rm(getAutosavePath(), { force: true });
}

module.exports = {
  safeName,
  getProjectPath,
  setProjectPath,
  saveProject,
  readProject,
  writeAutosave,
  readAutosave,
  clearAutosave,
  getAutosavePath
};
