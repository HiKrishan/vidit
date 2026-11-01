import { clamp, hexToRgba, safeHex } from "./utils.js";

export const REFERENCE_HEIGHT = 1080;

const FONT_READY = new Map();

export function referenceScale(height) {
  return Math.max(0.05, (Number(height) || REFERENCE_HEIGHT) / REFERENCE_HEIGHT);
}

export function fontCss(text = {}) {
  const family = String(text.fontFamily || "Instrument Sans").trim() || "Instrument Sans";
  const familyList = /[,\s]/.test(family) && !family.includes("\"") ? `"${family}"` : family;
  return `${text.italic ? "italic " : ""}${Number(text.weight) || 400} ${Math.max(1, Number(text.fontSize) || 32)}px ${familyList}, "Segoe UI Emoji", sans-serif`;
}

export function ensureFontsReady() {
  if (!document.fonts?.load) return Promise.resolve();
  const families = ["Instrument Sans", "Instrument Serif", "Segoe UI", "Bahnschrift", "Georgia", "Arial", "Impact", "Consolas"];
  const jobs = [];
  for (const family of families) {
    jobs.push(document.fonts.load(`400 32px "${family}"`).catch(() => null));
    jobs.push(document.fonts.load(`italic 400 32px "${family}"`).catch(() => null));
    jobs.push(document.fonts.load(`700 32px "${family}"`).catch(() => null));
  }
  return Promise.allSettled([...jobs, document.fonts.ready]).then(() => undefined);
}

function fontKey(text) {
  return JSON.stringify([
    text.fontFamily,
    text.weight,
    text.italic,
    text.fontSize,
    text.letterSpacing
  ]);
}

function waitForFonts(text) {
  if (!document.fonts?.load) return Promise.resolve();
  const key = fontKey(text);
  if (!FONT_READY.has(key)) {
    FONT_READY.set(
      key,
      Promise.allSettled([
        document.fonts.load(fontCss(text)),
        document.fonts.ready
      ]).then(() => undefined)
    );
  }
  return FONT_READY.get(key);
}

export function applyTextStyles(bubble, text, scale = 1) {
  const safe = text || {};
  const family = String(safe.fontFamily || "Instrument Sans");
  const fontScale = clamp(scale, 0.02, 12);
  const fontSize = Math.max(1, (Number(safe.fontSize) || 32) * fontScale);
  const padding = Math.max(0, (Number(safe.padding) || 0) * fontScale);
  const strokeWidth = Math.max(0, (Number(safe.strokeWidth) || 0) * fontScale);
  const opacity = clamp(safe.backgroundOpacity, 0, 1);

  bubble.style.fontFamily = `"${family}", "Segoe UI Emoji", sans-serif`;
  bubble.style.fontSize = `${fontSize}px`;
  bubble.style.fontWeight = String(Number(safe.weight) || 400);
  bubble.style.fontStyle = safe.italic ? "italic" : "normal";
  bubble.style.color = safeHex(safe.color, "#f4f1e7");
  bubble.style.lineHeight = String(clamp(safe.lineHeight, 0.7, 3) || 1.22);
  bubble.style.letterSpacing = `${(Number(safe.letterSpacing) || 0) * fontScale}px`;
  bubble.style.textAlign = ["left", "center", "right"].includes(safe.align) ? safe.align : "center";
  bubble.style.padding = `${padding}px`;
  bubble.style.borderRadius = `${fontSize * 0.22}px`;
  bubble.style.background = opacity > 0
    ? hexToRgba(safe.backgroundColor || "#000000", opacity)
    : "transparent";
  bubble.style.textShadow = safe.shadow
    ? `0 ${Math.max(1, 2 * fontScale).toFixed(2)}px ${Math.max(2, 16 * fontScale).toFixed(2)}px rgba(0, 0, 0, 0.62)`
    : "none";
  bubble.style.webkitTextStroke = strokeWidth > 0.05
    ? `${strokeWidth.toFixed(2)}px ${safeHex(safe.strokeColor, "#0b0e0d")}`
    : "";
  bubble.style.paintOrder = "stroke fill";
  bubble.style.borderLeft = safe.accentBar
    ? `${Math.max(2, 4 * fontScale).toFixed(2)}px solid ${safeHex(safe.accentColor, "#ff7457")}`
    : "";
  if (safe.accentBar) {
    bubble.style.paddingLeft = `${Math.max(padding, 9 * fontScale).toFixed(2)}px`;
  }
  bubble.classList.toggle("has-background", opacity > 0);
  bubble.classList.toggle("has-accent", Boolean(safe.accentBar));
}

export function createPreviewTextLayer(layer, clip, project, scale = null) {
  const text = clip.text || {};
  const anchor = document.createElement("div");
  anchor.className = "text-anchor";
  anchor.style.left = `${clamp(text.x, 0, 1) * 100}%`;
  anchor.style.top = `${clamp(text.y, 0, 1) * 100}%`;
  anchor.style.width = `${clamp(text.width, 0.01, 1) * 100}%`;
  anchor.style.textAlign = ["left", "center", "right"].includes(text.align) ? text.align : "center";

  const bubble = document.createElement("div");
  bubble.className = "text-bubble";
  bubble.textContent = String(text.content ?? "");
  anchor.appendChild(bubble);
  layer.appendChild(anchor);

  const initialScale = scale == null ? referenceScale(project?.settings?.height) : scale;
  applyTextStyles(bubble, text, initialScale);

  return {
    anchor,
    bubble,
    update(nextClip, nextProject, nextScale = scale) {
      const next = nextClip.text || {};
      anchor.style.left = `${clamp(next.x, 0, 1) * 100}%`;
      anchor.style.top = `${clamp(next.y, 0, 1) * 100}%`;
      anchor.style.width = `${clamp(next.width, 0.01, 1) * 100}%`;
      anchor.style.textAlign = ["left", "center", "right"].includes(next.align) ? next.align : "center";
      bubble.textContent = String(next.content ?? "");
      const resolvedScale = nextScale == null ? referenceScale(nextProject?.settings?.height) : nextScale;
      applyTextStyles(bubble, next, resolvedScale);
    }
  };
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapLine(ctx, source, maxWidth) {
  const line = String(source ?? "");
  if (!line) return [""];
  if (ctx.measureText(line).width <= maxWidth) return [line];

  const output = [];
  const words = line.split(/(\s+)/);
  let current = "";
  for (const word of words) {
    const candidate = current + word;
    if (!current || ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current.trim()) output.push(current.replace(/\s+$/, ""));
    let rest = word.replace(/^\s+/, "");
    while (rest && ctx.measureText(rest).width > maxWidth) {
      let cut = rest.length;
      while (cut > 1 && ctx.measureText(rest.slice(0, cut)).width > maxWidth) cut--;
      output.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    current = rest;
  }
  if (current || !output.length) output.push(current);
  return output;
}

function layoutCanvasText(ctx, text, boxWidth, fontScale) {
  const padding = Math.max(0, (Number(text.padding) || 0) * fontScale);
  const accentWidth = text.accentBar ? Math.max(2, 4 * fontScale) : 0;
  const innerWidth = Math.max(4, boxWidth - padding * 2 - accentWidth);
  const raw = String(text.content ?? "");
  const paragraphs = raw.split(/\r?\n/);
  const lines = [];
  for (const paragraph of paragraphs) lines.push(...wrapLine(ctx, paragraph, innerWidth));

  const fontSize = Math.max(1, (Number(text.fontSize) || 32) * fontScale);
  const lineHeight = fontSize * clamp(text.lineHeight, 0.7, 3);
  let contentWidth = 0;
  for (const line of lines) contentWidth = Math.max(contentWidth, ctx.measureText(line).width);
  contentWidth = Math.min(innerWidth, contentWidth);
  const bubbleWidth = Math.min(boxWidth, Math.ceil(contentWidth + padding * 2 + accentWidth));
  const bubbleHeight = Math.max(
    lineHeight + padding * 2,
    Math.ceil(lines.length * lineHeight + padding * 2)
  );
  return {
    padding,
    accentWidth,
    innerWidth,
    lines,
    fontSize,
    lineHeight,
    bubbleWidth,
    bubbleHeight
  };
}

export async function rasterizeClipText(clip, project, options = {}) {
  await waitForFonts(clip?.text || {});
  const width = Math.max(2, Math.round(Number(options.width) || Number(project?.settings?.width) || 1920));
  const height = Math.max(2, Math.round(Number(options.height) || Number(project?.settings?.height) || 1080));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas text rendering is unavailable.");
  const text = clip?.text || {};
  const fontScale = referenceScale(height);
  const fontSize = Math.max(1, (Number(text.fontSize) || 32) * fontScale);
  const family = String(text.fontFamily || "Instrument Sans");
  ctx.font = `${text.italic ? "italic " : ""}${Number(text.weight) || 400} ${fontSize}px "${family}", "Segoe UI Emoji", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  if ("letterSpacing" in ctx) {
    ctx.letterSpacing = `${(Number(text.letterSpacing) || 0) * fontScale}px`;
  }
  if ("fontKerning" in ctx) ctx.fontKerning = "normal";

  const boxWidth = Math.max(8, clamp(text.width, 0.01, 1) * width);
  const boxLeft = clamp(text.x, 0, 1) * width - boxWidth / 2;
  const centerY = clamp(text.y, 0, 1) * height;
  const layout = layoutCanvasText(ctx, text, boxWidth, fontScale);

  let bubbleLeft = boxLeft;
  if (text.align === "center") bubbleLeft += (boxWidth - layout.bubbleWidth) / 2;
  else if (text.align === "right") bubbleLeft += boxWidth - layout.bubbleWidth;
  const bubbleTop = centerY - layout.bubbleHeight / 2;
  const radius = Math.min(fontSize * 0.22, layout.bubbleHeight / 2, layout.bubbleWidth / 2);

  const backgroundAlpha = clamp(text.backgroundOpacity, 0, 1);
  if (backgroundAlpha > 0.001) {
    ctx.save();
    ctx.fillStyle = hexToRgba(text.backgroundColor || "#000000", backgroundAlpha);
    roundRect(ctx, bubbleLeft, bubbleTop, layout.bubbleWidth, layout.bubbleHeight, radius);
    ctx.fill();
    ctx.restore();
  }

  if (text.accentBar) {
    ctx.save();
    ctx.fillStyle = safeHex(text.accentColor, "#ff7457");
    const barX = bubbleLeft + layout.accentWidth / 2;
    const inset = Math.min(layout.padding * 0.55, layout.bubbleHeight * 0.25);
    ctx.fillRect(
      barX - layout.accentWidth / 2,
      bubbleTop + inset,
      layout.accentWidth,
      Math.max(2, layout.bubbleHeight - inset * 2)
    );
    ctx.restore();
  }

  const textLeft = bubbleLeft + layout.padding + layout.accentWidth;
  const textRight = bubbleLeft + layout.bubbleWidth - layout.padding;
  let textX = textLeft;
  if (text.align === "center") textX = (textLeft + textRight) / 2;
  else if (text.align === "right") textX = textRight;
  const textAlign = text.align === "center" ? "center" : text.align === "right" ? "right" : "left";

  const strokeWidth = Math.max(0, (Number(text.strokeWidth) || 0) * fontScale);
  ctx.save();
  ctx.textAlign = textAlign;
  if (text.shadow) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.62)";
    ctx.shadowBlur = Math.max(2, 16 * fontScale);
    ctx.shadowOffsetY = Math.max(1, 2 * fontScale);
  }
  if (strokeWidth > 0.01) {
    ctx.strokeStyle = safeHex(text.strokeColor, "#0b0e0d");
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
  }
  ctx.fillStyle = safeHex(text.color, "#f4f1e7");
  for (let i = 0; i < layout.lines.length; i++) {
    const y = bubbleTop + layout.padding + layout.lineHeight * (i + 0.5);
    const line = layout.lines[i];
    if (strokeWidth > 0.01) ctx.strokeText(line, textX, y);
    ctx.fillText(line, textX, y);
  }
  ctx.restore();

  return canvas;
}

export async function rasterizeClipTextDataUrl(clip, project, options = {}) {
  const canvas = await rasterizeClipText(clip, project, options);
  return canvas.toDataURL("image/png");
}

export async function buildTextImages(project, options = {}) {
  const width = Number(options.width) || Number(project?.settings?.width) || 1920;
  const height = Number(options.height) || Number(project?.settings?.height) || 1080;
  const images = [];
  for (const track of project?.tracks || []) {
    for (const clip of track.clips || []) {
      if (clip.type !== "text" && clip.type !== "sticker") continue;
      const dataUrl = await rasterizeClipTextDataUrl(clip, project, { width, height });
      images.push({ clipId: clip.id, dataUrl });
    }
  }
  return images;
}
