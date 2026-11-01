export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

export const uid = () => {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const icon = (name, extra = "") =>
  `<svg ${extra} aria-hidden="true"><use href="#i-${name}"></use></svg>`;

export function formatClock(seconds, { hours = false, tenths = false } = {}) {
  const s = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const t = tenths ? `.${Math.floor((s % 1) * 10)}` : "";
  if (hours || h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}${t}`;
  }
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}${t}`;
}

export function formatTimecode(seconds, fps = 30) {
  const s = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const frame = Math.min(Math.max(0, Math.round(fps) - 1), Math.floor((s % 1) * fps + 1e-7));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}:${String(frame).padStart(2, "0")}`;
}

export function formatShort(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s >= 3600) return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s % 60);
  return rest ? `${m}m ${rest}s` : `${m}m`;
}

export function formatBytes(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function debounce(fn, wait = 200) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function throttleRaf(fn) {
  let frame = null;
  let lastArgs = [];
  const wrapped = (...args) => {
    lastArgs = args;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      fn(...lastArgs);
    });
  };
  wrapped.cancel = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = null;
  };
  return wrapped;
}

export function deepClone(value) {
  if (globalThis.structuredClone) return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function areEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return a === b;
  }
}

export function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable ||
    target.closest?.("[contenteditable='true']")
  );
}

export function resolvePath(object, path) {
  return String(path)
    .split(".")
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), object);
}

export function setPath(object, path, value) {
  const parts = String(path).split(".");
  const last = parts.pop();
  let cursor = object;
  for (const key of parts) {
    if (cursor[key] == null || typeof cursor[key] !== "object") cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[last] = value;
  return object;
}

export function safeHex(value, fallback = "#ffffff") {
  const m = String(value || "").match(/^#?([0-9a-f]{6})$/i);
  return m ? `#${m[1].toLowerCase()}` : fallback;
}

export function hexToRgba(hex, alpha = 1) {
  const safe = safeHex(hex).slice(1);
  const r = parseInt(safe.slice(0, 2), 16);
  const g = parseInt(safe.slice(2, 4), 16);
  const b = parseInt(safe.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

export function parseNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function cssUrl(url) {
  return `url("${String(url).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`;
}

export function alphaForClip(clip, time) {
  const start = Number(clip.start) || 0;
  const duration = Math.max(0.001, Number(clip.duration) || 0);
  const local = time - start;
  let alpha = clamp(clip.opacity ?? 1, 0, 1);
  const fadeIn = clamp(clip.fades?.in, 0, duration);
  const fadeOut = clamp(clip.fades?.out, 0, duration);
  if (fadeIn > 0 && local < fadeIn) alpha *= clamp(local / fadeIn, 0, 1);
  if (fadeOut > 0 && local > duration - fadeOut) {
    alpha *= clamp((duration - local) / fadeOut, 0, 1);
  }
  return clamp(alpha, 0, 1);
}

export function easeOutCubic(t) {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export function seededBars(seed, count = 9, min = 7, max = 27) {
  let value = 0;
  for (let i = 0; i < String(seed).length; i++) value = (value * 31 + String(seed).charCodeAt(i)) >>> 0;
  const bars = [];
  for (let i = 0; i < count; i++) {
    value = (value * 1664525 + 1013904223) >>> 0;
    bars.push(min + (value % (max - min + 1)));
  }
  return bars;
}
