"use strict";

const { app } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { ffmpeg, ffprobe } = require("./ffmpeg");

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".avif"]);
const VIDEO_EXTS = new Set([
  ".mp4",
  ".mov",
  ".m4v",
  ".webm",
  ".mkv",
  ".avi",
  ".wmv",
  ".flv",
  ".mpg",
  ".mpeg",
  ".ts",
  ".mts",
  ".m2ts",
  ".3gp"
]);
const AUDIO_EXTS = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".flac",
  ".ogg",
  ".oga",
  ".opus",
  ".wma",
  ".aiff",
  ".aif"
]);

let cacheDir = null;

function getCacheDir() {
  if (!cacheDir) cacheDir = path.join(app.getPath("userData"), "cache", "media");
  return cacheDir;
}

async function ensureCacheDir() {
  await fsp.mkdir(getCacheDir(), { recursive: true });
  return getCacheDir();
}

function fractionToNumber(value) {
  if (!value || value === "0/0") return 0;
  const [a, b] = String(value).split("/").map(Number);
  if (!b) return Number(a) || 0;
  return a / b;
}

function extOf(file) {
  return path.extname(file).toLowerCase();
}

function kindFromExtension(file) {
  const ext = extOf(file);
  if (IMAGE_EXTS.has(ext)) return "image";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (AUDIO_EXTS.has(ext)) return "audio";
  return null;
}

async function fileHash(file) {
  const stat = await fsp.stat(file);
  return {
    stat,
    hash: crypto
      .createHash("sha1")
      .update(`${path.resolve(file)}|${stat.size}|${stat.mtimeMs}`)
      .digest("hex")
  };
}

async function makeThumbnail(file, duration, hash) {
  const output = path.join(await ensureCacheDir(), `${hash}.jpg`);
  if (fs.existsSync(output)) return output;
  const seek = duration > 2 ? 1 : Math.max(0.05, duration * 0.15);
  try {
    await ffmpeg([
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(seek),
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      "scale='min(480,iw)':-2:flags=lanczos",
      "-q:v",
      "3",
      output
    ]);
    return fs.existsSync(output) ? output : null;
  } catch {
    try {
      await ffmpeg([
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        file,
        "-frames:v",
        "1",
        "-vf",
        "scale='min(480,iw)':-2:flags=lanczos",
        "-q:v",
        "3",
        output
      ]);
      return fs.existsSync(output) ? output : null;
    } catch {
      return null;
    }
  }
}

function buildPeaks(buffer, bucketCount = 420) {
  if (!buffer || buffer.length < 4) return [];
  const samples = new Int16Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.length / 2));
  const bucketSize = Math.max(1, Math.floor(samples.length / bucketCount));
  const peaks = [];
  for (let i = 0; i < bucketCount; i++) {
    const start = i * bucketSize;
    const end = Math.min(samples.length, start + bucketSize);
    let sum = 0;
    let count = 0;
    for (let s = start; s < end; s++) {
      const v = samples[s] / 32768;
      sum += v * v;
      count++;
    }
    peaks.push(count ? Math.sqrt(sum / count) : 0);
  }
  const max = Math.max(...peaks, 0.001);
  return peaks.map((v) => Math.min(1, Math.sqrt(v / max)));
}

async function makeWaveform(file) {
  try {
    const { stdout } = await ffmpeg(
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        file,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "2000",
        "-f",
        "s16le",
        "-"
      ],
      { rawStdout: true, timeout: 120000 }
    );
    return buildPeaks(stdout);
  } catch {
    return [];
  }
}

async function importFile(file) {
  const full = path.resolve(file);
  const stat = await fsp.stat(full).catch(() => null);
  if (!stat || !stat.isFile()) throw new Error(`File not found: ${path.basename(file)}`);
  const hint = kindFromExtension(full);
  if (!hint) throw new Error(`Unsupported file type: ${path.basename(file)}`);

  let probe;
  try {
    probe = await ffprobe(full);
  } catch (err) {
    if (hint !== "image") {
      throw new Error(`Could not read ${path.basename(file)}: ${err.message.split("\n")[0]}`);
    }
    probe = { streams: [], format: {} };
  }

  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const video = streams.find(
    (stream) => stream.codec_type === "video" && stream.disposition?.attached_pic !== 1
  );
  const audio = streams.find((stream) => stream.codec_type === "audio");

  let type = hint;
  if (type === "image" && !IMAGE_EXTS.has(extOf(full))) type = null;
  if (!video && type === "video") type = "audio";
  if (!video && type === "image") type = "image";

  let duration = Number(probe.format?.duration || video?.duration || audio?.duration || 0);
  if (type === "image") duration = 5;
  if (!Number.isFinite(duration) || duration <= 0) {
    if (type === "audio") throw new Error(`Audio has no readable duration: ${path.basename(file)}`);
    duration = type === "image" ? 5 : 1;
  }

  const { hash } = await fileHash(full);
  let thumb = null;
  if (type === "image") {
    thumb = full;
  } else if (type === "video") {
    thumb = await makeThumbnail(full, duration, hash);
  }

  const peaks = type === "video" || type === "audio" ? await makeWaveform(full) : [];

  return {
    id: crypto.randomUUID(),
    type,
    name: path.basename(full),
    path: full,
    extension: extOf(full),
    duration,
    width: Number(video?.width || 0),
    height: Number(video?.height || 0),
    fps: fractionToNumber(video?.r_frame_rate || video?.avg_frame_rate),
    hasAudio: Boolean(audio),
    channels: Number(audio?.channels || 0),
    sampleRate: Number(audio?.sample_rate || 0),
    codec: video?.codec_name || audio?.codec_name || "",
    size: stat.size,
    mtime: stat.mtimeMs,
    thumb,
    peaks,
    createdAt: Date.now()
  };
}

async function importFiles(files) {
  const assets = [];
  const errors = [];
  for (const file of [...new Set(files.map((f) => path.resolve(f)))]) {
    try {
      assets.push(await importFile(file));
    } catch (err) {
      errors.push({ file, message: err.message });
    }
  }
  return { assets, errors };
}

async function saveRecording(bytes, mime = "audio/webm") {
  const dir = path.join(app.getPath("userData"), "recordings");
  await fsp.mkdir(dir, { recursive: true });
  const ext = mime.includes("ogg") ? ".ogg" : ".webm";
  const file = path.join(dir, `voice-${Date.now()}${ext}`);
  await fsp.writeFile(file, Buffer.from(bytes));
  return importFile(file);
}

async function extractAudio(asset, { start = 0, duration = 0 } = {}) {
  if (!asset?.path || !fs.existsSync(asset.path)) throw new Error("Source video is missing.");
  const dir = path.join(app.getPath("userData"), "renders", "audio");
  await fsp.mkdir(dir, { recursive: true });
  const out = path.join(dir, `audio-${Date.now()}.m4a`);
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  if (start > 0) args.push("-ss", String(start));
  if (duration > 0) args.push("-t", String(duration));
  args.push("-i", asset.path, "-vn", "-c:a", "aac", "-b:a", "192k", out);
  await ffmpeg(args, { timeout: 120000 });
  return importFile(out);
}

async function extractFrame(asset, time = 0) {
  if (!asset?.path || !fs.existsSync(asset.path)) throw new Error("Source media is missing.");
  const dir = path.join(app.getPath("userData"), "renders", "frames");
  await fsp.mkdir(dir, { recursive: true });
  const out = path.join(dir, `freeze-${Date.now()}.png`);
  await ffmpeg(
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(Math.max(0, time)),
      "-i",
      asset.path,
      "-frames:v",
      "1",
      out
    ],
    { timeout: 30000 }
  );
  return importFile(out);
}

module.exports = {
  importFiles,
  importFile,
  saveRecording,
  extractAudio,
  extractFrame,
  getCacheDir
};
