import { clamp, deepClone, formatShort, parseNumber, safeHex, uid } from "./utils.js";

export const SCHEMA_VERSION = 1;
export const FPS_OPTIONS = [24, 25, 30, 50, 60];
export const FONT_OPTIONS = [
  { value: "Instrument Sans", label: "Instrument Sans" },
  { value: "Instrument Serif", label: "Instrument Serif" },
  { value: "Segoe UI", label: "Segoe UI" },
  { value: "Bahnschrift", label: "Bahnschrift" },
  { value: "Georgia", label: "Georgia" },
  { value: "Arial", label: "Arial" },
  { value: "Impact", label: "Impact" },
  { value: "Consolas", label: "Consolas" }
];

export const RESOLUTION_PRESETS = [
  { id: "16:9", label: "Landscape", ratio: "16:9", width: 1920, height: 1080, note: "YouTube · 1080p" },
  { id: "9:16", label: "Portrait", ratio: "9:16", width: 1080, height: 1920, note: "Shorts · Reels · TikTok" },
  { id: "1:1", label: "Square", ratio: "1:1", width: 1080, height: 1080, note: "Feed" },
  { id: "4:5", label: "Tall post", ratio: "4:5", width: 1080, height: 1350, note: "Instagram" },
  { id: "4:3", label: "Classic", ratio: "4:3", width: 1440, height: 1080, note: "Presentation" },
  { id: "21:9", label: "Cinema", ratio: "21:9", width: 2560, height: 1080, note: "Widescreen" }
];

export const EFFECTS = [
  { id: "none", name: "Original", note: "Clean" },
  { id: "vivid", name: "Vivid", note: "Color pop" },
  { id: "faded", name: "Faded film", note: "Soft" },
  { id: "warm", name: "Golden", note: "Warm" },
  { id: "cool", name: "Mineral", note: "Cool" },
  { id: "bw", name: "Monochrome", note: "Black & white" },
  { id: "noir", name: "Noir", note: "Contrast" },
  { id: "sepia", name: "Archive", note: "Sepia" },
  { id: "dream", name: "Haze", note: "Dreamy" }
];

export const TRANSITIONS = [
  { id: "none", name: "Hard cut", note: "None", duration: 0 },
  { id: "fade", name: "Fade", note: "Crossfade", duration: 0.7 },
  { id: "rise", name: "Rise", note: "From below", duration: 0.65 },
  { id: "drop", name: "Drop", note: "From above", duration: 0.65 },
  { id: "slide-left", name: "Slide left", note: "From left", duration: 0.65 },
  { id: "slide-right", name: "Slide right", note: "From right", duration: 0.65 }
];

export const TEXT_ANIMATIONS = [
  { id: "none", name: "None", duration: 0 },
  { id: "fade", name: "Fade in", duration: 0.55 },
  { id: "rise", name: "Rise in", duration: 0.65 },
  { id: "drop", name: "Drop in", duration: 0.65 },
  { id: "slide-left", name: "From left", duration: 0.6 },
  { id: "slide-right", name: "From right", duration: 0.6 }
];

export const TEXT_PRESETS = [
  {
    id: "display",
    name: "Display",
    sampleClass: "preset-display",
    sample: "MAKE THE CUT",
    content: "MAKE THE CUT",
    note: "Bold statement · animated",
    text: {
      fontFamily: "Instrument Sans",
      fontSize: 112,
      weight: 700,
      italic: false,
      color: "#f4f1e7",
      backgroundColor: "#000000",
      backgroundOpacity: 0,
      align: "center",
      x: 0.5,
      y: 0.48,
      width: 0.82,
      letterSpacing: -2,
      lineHeight: 1.08,
      shadow: true,
      strokeWidth: 0,
      animation: "rise"
    }
  },
  {
    id: "subtitle",
    name: "Caption",
    sampleClass: "preset-subtitle",
    sample: "A line that follows the story",
    content: "A line that follows the story",
    note: "Readable bar · lower third",
    text: {
      fontFamily: "Instrument Sans",
      fontSize: 48,
      weight: 500,
      italic: false,
      color: "#f8f5ea",
      backgroundColor: "#0b0e0d",
      backgroundOpacity: 0.68,
      align: "center",
      x: 0.5,
      y: 0.87,
      width: 0.8,
      letterSpacing: 0,
      lineHeight: 1.25,
      shadow: false,
      strokeWidth: 0,
      animation: "fade"
    }
  },
  {
    id: "title",
    name: "Editorial title",
    sampleClass: "preset-serif",
    sample: "A new chapter",
    content: "A new chapter",
    note: "Instrument Serif · elegant",
    text: {
      fontFamily: "Instrument Serif",
      fontSize: 116,
      weight: 400,
      italic: true,
      color: "#f1e8d8",
      backgroundColor: "#000000",
      backgroundOpacity: 0,
      align: "center",
      x: 0.5,
      y: 0.46,
      width: 0.76,
      letterSpacing: -1,
      lineHeight: 1.02,
      shadow: true,
      strokeWidth: 0,
      animation: "fade"
    }
  },
  {
    id: "lowerthird",
    name: "Lower third",
    sampleClass: "preset-lower",
    sample: "Maya Chen / Director",
    content: "Maya Chen\nDirector",
    note: "Name and role · left aligned",
    text: {
      fontFamily: "Instrument Sans",
      fontSize: 46,
      weight: 550,
      italic: false,
      color: "#f5f1e7",
      backgroundColor: "#0b0e0d",
      backgroundOpacity: 0.45,
      align: "left",
      x: 0.3,
      y: 0.76,
      width: 0.46,
      letterSpacing: 0,
      lineHeight: 1.28,
      shadow: false,
      strokeWidth: 0,
      accentBar: true,
      accentColor: "#ff7457",
      animation: "rise"
    }
  },
  {
    id: "label",
    name: "Label",
    sampleClass: "preset-label",
    sample: "NEW",
    content: "NEW",
    note: "Small accent tag",
    text: {
      fontFamily: "Instrument Sans",
      fontSize: 36,
      weight: 700,
      italic: false,
      color: "#24100b",
      backgroundColor: "#ff7457",
      backgroundOpacity: 1,
      align: "center",
      x: 0.2,
      y: 0.22,
      width: 0.26,
      letterSpacing: 3,
      lineHeight: 1.05,
      shadow: false,
      strokeWidth: 0,
      animation: "drop"
    }
  },
  {
    id: "quote",
    name: "Quote",
    sampleClass: "preset-serif",
    sample: "“The edit is the story.”",
    content: "“The edit is the story.”",
    note: "Serif quote · centered",
    text: {
      fontFamily: "Instrument Serif",
      fontSize: 82,
      weight: 400,
      italic: true,
      color: "#e9ba72",
      backgroundColor: "#000000",
      backgroundOpacity: 0,
      align: "center",
      x: 0.5,
      y: 0.52,
      width: 0.74,
      letterSpacing: 0,
      lineHeight: 1.12,
      shadow: true,
      strokeWidth: 0,
      animation: "fade"
    }
  }
];

export const STICKER_GROUPS = [
  {
    name: "Reactions",
    items: ["😀", "😂", "😮", "😍", "🥹", "😎", "🤯", "😭", "🔥", "✨"]
  },
  {
    name: "Marks",
    items: ["👌", "👏", "🙌", "💯", "✅", "❌", "⭐", "💥", "⚡", "🎯"]
  },
  {
    name: "Play",
    items: ["❤️", "💛", "💚", "💙", "💜", "🌈", "🎬", "📸", "🎧", "🎵"]
  },
  {
    name: "Arrows",
    items: ["➡️", "⬅️", "⬆️", "⬇️", "↗️", "↙️", "🔴", "🟢", "🔵", "🟡"]
  }
];

const TRACK_LABELS = {
  video: "Video",
  audio: "Audio",
  text: "Text"
};

const TRACK_ICONS = {
  video: "film",
  audio: "wave",
  text: "text"
};

export function createProject(name = "Untitled edit") {
  const now = Date.now();
  return {
    id: uid(),
    schemaVersion: SCHEMA_VERSION,
    name: name || "Untitled edit",
    createdAt: now,
    modifiedAt: now,
    savedAt: 0,
    settings: {
      width: 1920,
      height: 1080,
      fps: 30,
      background: "#0b0e0e",
      sampleRate: 48000
    },
    assets: [],
    tracks: [
      createTrack("text", 3),
      createTrack("video", 2),
      createTrack("video", 1),
      createTrack("audio", 1)
    ]
  };
}

export function createTrack(kind, index) {
  const prefix = kind === "video" ? "V" : kind === "audio" ? "A" : "T";
  return {
    id: uid(),
    kind,
    name: `${prefix}${index || 1}`,
    hidden: false,
    muted: false,
    locked: false,
    clips: []
  };
}

export function trackLabel(kind) {
  return TRACK_LABELS[kind] || "Track";
}

export function trackIcon(kind) {
  return TRACK_ICONS[kind] || "film";
}

export function defaultColor() {
  return {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    temperature: 0,
    blur: 0,
    sharpen: 0,
    vignette: 0
  };
}

export function defaultFades() {
  return { in: 0, out: 0 };
}

export function defaultTransition() {
  return { type: "none", duration: 0 };
}

export function defaultAnimation() {
  return { type: "none", duration: 0 };
}

export function createTextObject(overrides = {}) {
  return {
    content: "Your text here",
    fontFamily: "Instrument Sans",
    fontSize: 72,
    weight: 600,
    italic: false,
    color: "#f4f1e7",
    backgroundColor: "#0b0e0d",
    backgroundOpacity: 0,
    align: "center",
    x: 0.5,
    y: 0.78,
    width: 0.82,
    letterSpacing: 0,
    lineHeight: 1.22,
    padding: 18,
    shadow: true,
    strokeWidth: 0,
    strokeColor: "#0b0e0d",
    accentBar: false,
    accentColor: "#ff7457",
    animation: "none",
    ...deepClone(overrides)
  };
}

export function createBaseClip(overrides = {}) {
  return {
    id: uid(),
    type: "video",
    assetId: null,
    name: "Clip",
    start: 0,
    duration: 5,
    trimIn: 0,
    speed: 1,
    volume: 1,
    opacity: 1,
    fit: "cover",
    scale: 1,
    x: 0,
    y: 0,
    rotation: 0,
    flipH: false,
    flipV: false,
    effect: "none",
    color: defaultColor(),
    fades: defaultFades(),
    transition: defaultTransition(),
    animation: defaultAnimation(),
    keyframes: {},
    text: null,
    ...deepClone(overrides)
  };
}

export const KEYFRAME_PROPERTIES = ["x", "y", "scale", "rotation", "opacity", "volume"];
const KEYFRAME_LIMITS = {
  x: [-2, 2],
  y: [-2, 2],
  scale: [0.05, 4],
  rotation: [-360, 360],
  opacity: [0, 1],
  volume: [0, 4]
};

function clampKeyframeValue(prop, value) {
  const limit = KEYFRAME_LIMITS[prop];
  const number = parseNumber(value, 0);
  return limit ? clamp(number, limit[0], limit[1]) : number;
}

export function normalizeKeyframes(raw, duration = 5) {
  const out = {};
  const maxTime = Math.max(0.05, parseNumber(duration, 5));
  for (const prop of KEYFRAME_PROPERTIES) {
    const list = Array.isArray(raw?.[prop]) ? raw[prop] : [];
    const cleaned = list
      .map((item) => ({
        t: clamp(parseNumber(item?.t ?? item?.time, 0), 0, maxTime),
        value: clampKeyframeValue(prop, item?.value)
      }))
      .sort((a, b) => a.t - b.t)
      .filter((item, index, array) => index === 0 || item.t - array[index - 1].t > 0.012);
    if (cleaned.length) out[prop] = cleaned;
  }
  return out;
}

export function clipKeyframeList(clip, prop) {
  const list = clip?.keyframes?.[prop];
  return Array.isArray(list) ? list : [];
}

export function keyframeValueAt(clip, prop, localTime) {
  const fallback = parseNumber(clip?.[prop], 0);
  const list = clipKeyframeList(clip, prop);
  if (!list.length) return fallback;
  const time = parseNumber(localTime, 0);
  if (time <= list[0].t) return list[0].value;
  const last = list[list.length - 1];
  if (time >= last.t) return last.value;
  for (let i = 1; i < list.length; i++) {
    const b = list[i];
    if (time > b.t) continue;
    const a = list[i - 1];
    const span = Math.max(0.001, b.t - a.t);
    const progress = clamp((time - a.t) / span, 0, 1);
    return a.value + (b.value - a.value) * progress;
  }
  return last.value;
}

export function hasKeyframes(clip, prop = null) {
  if (!clip?.keyframes) return false;
  if (prop) return clipKeyframeList(clip, prop).length > 0;
  return KEYFRAME_PROPERTIES.some((key) => clipKeyframeList(clip, key).length > 0);
}

export function setKeyframe(clip, prop, time, value) {
  if (!clip || !KEYFRAME_LIMITS[prop]) return false;
  if (!clip.keyframes || typeof clip.keyframes !== "object") clip.keyframes = {};
  const list = Array.isArray(clip.keyframes[prop]) ? clip.keyframes[prop] : [];
  const at = Math.max(0, parseNumber(time, 0));
  const nextValue = clampKeyframeValue(prop, value);
  const existing = list.find((item) => Math.abs(item.t - at) <= 0.018);
  if (existing) {
    existing.t = at;
    existing.value = nextValue;
  } else {
    list.push({ t: at, value: nextValue });
  }
  list.sort((a, b) => a.t - b.t);
  clip.keyframes[prop] = list;
  return true;
}

export function removeKeyframe(clip, prop, time, tolerance = 0.03) {
  const list = clipKeyframeList(clip, prop);
  if (!list.length) return false;
  const at = parseNumber(time, 0);
  const index = list.findIndex((item) => Math.abs(item.t - at) <= tolerance);
  if (index < 0) return false;
  list.splice(index, 1);
  if (!list.length) delete clip.keyframes[prop];
  return true;
}

export function clipKeyframeTimes(clip) {
  const times = new Set();
  for (const prop of KEYFRAME_PROPERTIES) {
    for (const item of clipKeyframeList(clip, prop)) {
      times.add(Math.round(item.t * 1000) / 1000);
    }
  }
  return [...times].sort((a, b) => a - b);
}

export function splitClipKeyframes(left, right, cutTime) {
  if (!left?.keyframes || !hasKeyframes(left)) return;
  const cut = Math.max(0.001, parseNumber(cutTime, left.duration));
  const next = {};
  for (const prop of KEYFRAME_PROPERTIES) {
    const list = clipKeyframeList(left, prop);
    if (!list.length) continue;
    const atCut = keyframeValueAt(left, prop, cut);
    const before = list
      .filter((item) => item.t < cut - 0.001)
      .map((item) => ({ t: item.t, value: item.value }));
    const after = list
      .filter((item) => item.t > cut + 0.001)
      .map((item) => ({ t: item.t - cut, value: item.value }));
    left.keyframes[prop] = [...before, { t: cut, value: atCut }];
    next[prop] = [{ t: 0, value: atCut }, ...after];
    left[prop] = atCut;
    right[prop] = atCut;
  }
  right.keyframes = next;
  left.keyframes = normalizeKeyframes(left.keyframes, left.duration);
  right.keyframes = normalizeKeyframes(right.keyframes, right.duration);
}

export function createAssetClip(asset, track, start = 0) {
  const isAudioTrack = track?.kind === "audio";
  let duration = Number(asset.duration) || 5;
  if (asset.type === "image") duration = Math.min(8, Math.max(3, duration || 5));
  if (!Number.isFinite(duration) || duration <= 0) duration = 5;
  const type = isAudioTrack ? "audio" : asset.type;
  return createBaseClip({
    type,
    assetId: asset.id,
    name: asset.name,
    start: Math.max(0, Number(start) || 0),
    duration,
    trimIn: 0,
    volume: type === "audio" ? 0.9 : 1,
    opacity: 1,
    fit: "cover",
    transition: defaultTransition(),
    animation: defaultAnimation(),
    text: null,
    assetDuration: Number(asset.duration) || duration,
    sourceWidth: asset.width || 0,
    sourceHeight: asset.height || 0
  });
}

export function createTextClip(presetId = "display", start = 0) {
  if (presetId === "plain") {
    return createBaseClip({
      type: "text",
      name: "Text",
      start: Math.max(0, Number(start) || 0),
      duration: 4,
      trimIn: 0,
      volume: 0,
      opacity: 1,
      scale: 1,
      x: 0,
      y: 0,
      transition: defaultTransition(),
      animation: defaultAnimation(),
      text: createTextObject({
        content: "Your text here",
        fontSize: 72,
        weight: 600,
        x: 0.5,
        y: 0.5,
        width: 0.82,
        animation: "none"
      })
    });
  }
  const preset = TEXT_PRESETS.find((item) => item.id === presetId) || TEXT_PRESETS[0];
  return createBaseClip({
    type: "text",
    name: preset.name,
    start: Math.max(0, Number(start) || 0),
    duration: 4,
    trimIn: 0,
    volume: 0,
    opacity: 1,
    scale: 1,
    x: 0,
    y: 0,
    transition: defaultTransition(),
    animation: { type: preset.text.animation || "fade", duration: 0.55 },
    text: createTextObject({ ...preset.text, content: preset.content, animation: preset.text.animation || "fade" })
  });
}

export function createStickerClip(emoji, start = 0) {
  return createBaseClip({
    type: "sticker",
    name: emoji,
    start: Math.max(0, Number(start) || 0),
    duration: 3,
    trimIn: 0,
    volume: 0,
    opacity: 1,
    transition: defaultTransition(),
    animation: { type: "drop", duration: 0.55 },
    text: createTextObject({
      content: emoji,
      fontFamily: "Segoe UI Emoji",
      fontSize: 180,
      weight: 400,
      color: "#ffffff",
      backgroundColor: "#000000",
      backgroundOpacity: 0,
      align: "center",
      x: 0.5,
      y: 0.5,
      width: 0.32,
      letterSpacing: 0,
      lineHeight: 1,
      padding: 0,
      shadow: false,
      strokeWidth: 0,
      accentBar: false,
      animation: "drop"
    })
  });
}

export function clipEnd(clip) {
  return (Number(clip?.start) || 0) + (Number(clip?.duration) || 0);
}

export function projectDuration(project) {
  let end = 0;
  for (const track of project?.tracks || []) {
    for (const clip of track.clips || []) end = Math.max(end, clipEnd(clip));
  }
  return end;
}

export function allClips(project) {
  const out = [];
  for (const track of project?.tracks || []) {
    for (const clip of track.clips || []) out.push({ clip, track });
  }
  return out;
}

export function findClip(project, clipId) {
  for (const track of project?.tracks || []) {
    const index = (track.clips || []).findIndex((clip) => clip.id === clipId);
    if (index >= 0) return { track, clip: track.clips[index], index };
  }
  return null;
}

export function findTrack(project, trackId) {
  return (project?.tracks || []).find((track) => track.id === trackId) || null;
}

export function findAsset(project, assetId) {
  return (project?.assets || []).find((asset) => asset.id === assetId) || null;
}

export function sortedClips(track) {
  return [...(track?.clips || [])].sort((a, b) => a.start - b.start);
}

export function adjacentBefore(track, clip) {
  const sorted = sortedClips(track);
  const index = sorted.findIndex((item) => item.id === clip.id);
  return index > 0 ? sorted[index - 1] : null;
}

export function nextTrackNumber(project, kind) {
  const prefix = kind === "video" ? "V" : kind === "audio" ? "A" : "T";
  const used = (project.tracks || [])
    .filter((track) => track.kind === kind)
    .map((track) => {
      const match = String(track.name).match(new RegExp(`^${prefix}(\\d+)$`, "i"));
      return match ? Number(match[1]) : 0;
    });
  return Math.max(0, ...used) + 1;
}

export function addTrack(project, kind) {
  const track = createTrack(kind, nextTrackNumber(project, kind));
  if (kind === "text") {
    project.tracks.unshift(track);
  } else if (kind === "video") {
    const firstVideo = project.tracks.findIndex((item) => item.kind === "video");
    if (firstVideo >= 0) project.tracks.splice(firstVideo, 0, track);
    else {
      const firstAudio = project.tracks.findIndex((item) => item.kind === "audio");
      if (firstAudio >= 0) project.tracks.splice(firstAudio, 0, track);
      else project.tracks.push(track);
    }
  } else {
    project.tracks.push(track);
  }
  return track;
}

export function getDefaultTrack(project, asset) {
  if (!asset) return project.tracks.find((track) => track.kind === "video") || project.tracks[0];
  if (asset.type === "audio") {
    return project.tracks.find((track) => track.kind === "audio") || addTrack(project, "audio");
  }
  if (asset.type === "image" || asset.type === "video") {
    const videoTracks = project.tracks.filter((track) => track.kind === "video");
    return videoTracks[videoTracks.length - 1] || addTrack(project, "video");
  }
  return project.tracks.find((track) => track.kind === "text") || addTrack(project, "text");
}

export function getTextTrack(project) {
  return project.tracks.find((track) => track.kind === "text") || addTrack(project, "text");
}

export function isTrackCompatible(track, clip) {
  if (!track || track.locked) return false;
  if (track.kind === "text") return clip.type === "text" || clip.type === "sticker";
  if (track.kind === "audio") return clip.type === "audio" || clip.type === "video";
  if (track.kind === "video") return clip.type === "video" || clip.type === "image";
  return false;
}

export function clipVisualKind(clip) {
  if (clip.type === "text" || clip.type === "sticker") return "text";
  if (clip.type === "audio") return "audio";
  return "video";
}

export function trackClipType(track, clip) {
  if (track.kind === "audio" && clip.type === "video") return "audio";
  return clip.type;
}

export function findGap(track, preferredStart, duration, excludeClipId = null) {
  const start = Math.max(0, Number(preferredStart) || 0);
  const clips = sortedClips(track).filter((clip) => clip.id !== excludeClipId);
  let candidate = start;
  let guard = 0;
  while (guard++ < 1000) {
    const overlapping = clips.find(
      (clip) => candidate < clipEnd(clip) - 0.0001 && candidate + duration > clip.start + 0.0001
    );
    if (!overlapping) return candidate;
    candidate = clipEnd(overlapping);
  }
  return candidate;
}

export function appendToTrackTrack(project, track, clip) {
  const last = sortedClips(track).reduce((max, item) => Math.max(max, clipEnd(item)), 0);
  clip.start = last;
  track.clips.push(clip);
  sortTrack(track);
  return clip;
}

export function sortTrack(track) {
  track.clips.sort((a, b) => a.start - b.start || String(a.id).localeCompare(String(b.id)));
}

export function removeClip(project, clipId) {
  for (const track of project.tracks) {
    const index = track.clips.findIndex((clip) => clip.id === clipId);
    if (index >= 0) {
      track.clips.splice(index, 1);
      return true;
    }
  }
  return false;
}

export function splitClip(project, clipId, time) {
  const found = findClip(project, clipId);
  if (!found) return null;
  const { clip, track, index } = found;
  const cut = Number(time);
  const minLength = 0.08;
  if (cut <= clip.start + minLength || cut >= clipEnd(clip) - minLength) return null;
  const speed = clamp(clip.speed, 0.25, 4);
  const leftDuration = cut - clip.start;
  const rightDuration = clip.duration - leftDuration;
  const right = deepClone(clip);
  right.id = uid();
  right.start = cut;
  right.duration = rightDuration;
  right.trimIn = (Number(clip.trimIn) || 0) + leftDuration * speed;
  if (right.transition?.type && right.transition.type !== "none") {
    right.transition = defaultTransition();
  }
  right.fades = {
    in: 0,
    out: Math.max(0, Number(clip.fades?.out) || 0)
  };
  clip.duration = leftDuration;
  clip.fades = {
    in: Math.max(0, Number(clip.fades?.in) || 0),
    out: 0
  };
  clip.transition = defaultTransition();
  track.clips.splice(index + 1, 0, right);
  sortTrack(track);
  return { left: clip, right };
}

export function duplicateClip(project, clipId) {
  const found = findClip(project, clipId);
  if (!found) return null;
  const { clip, track } = found;
  const copy = deepClone(clip);
  copy.id = uid();
  copy.start = clipEnd(clip);
  copy.name = `${clip.name} copy`;
  copy.transition = defaultTransition();
  track.clips.push(copy);
  sortTrack(track);
  return copy;
}

export function updateTrackNumbering(project) {
  const counters = { video: 0, audio: 0, text: 0 };
  const order = [...project.tracks].reverse();
  for (const track of order) {
    counters[track.kind] = (counters[track.kind] || 0) + 1;
    const prefix = track.kind === "video" ? "V" : track.kind === "audio" ? "A" : "T";
    track.name = `${prefix}${counters[track.kind]}`;
  }
}

export function normalizeText(text = {}) {
  const base = createTextObject();
  return {
    ...base,
    ...text,
    content: String(text.content ?? base.content),
    x: clamp(parseNumber(text.x, base.x), 0, 1),
    y: clamp(parseNumber(text.y, base.y), 0, 1),
    width: clamp(parseNumber(text.width, base.width), 0.1, 1),
    fontSize: clamp(parseNumber(text.fontSize, base.fontSize), 8, 400),
    backgroundOpacity: clamp(parseNumber(text.backgroundOpacity, base.backgroundOpacity), 0, 1),
    strokeWidth: clamp(parseNumber(text.strokeWidth, base.strokeWidth), 0, 24),
    letterSpacing: clamp(parseNumber(text.letterSpacing, base.letterSpacing), -20, 40),
    lineHeight: clamp(parseNumber(text.lineHeight, base.lineHeight), 0.7, 3),
    padding: clamp(parseNumber(text.padding, base.padding), 0, 100)
  };
}

export function normalizeClip(clip) {
  const base = createBaseClip();
  const type = ["video", "image", "audio", "text", "sticker"].includes(clip.type)
    ? clip.type
    : "video";
  const normalized = {
    ...base,
    ...clip,
    type,
    id: clip.id || uid(),
    name: String(clip.name || "Clip"),
    start: Math.max(0, parseNumber(clip.start, 0)),
    duration: Math.max(0.05, parseNumber(clip.duration, 3)),
    trimIn: Math.max(0, parseNumber(clip.trimIn, 0)),
    speed: clamp(parseNumber(clip.speed, 1), 0.25, 4),
    volume: clamp(parseNumber(clip.volume, 1), 0, 4),
    opacity: clamp(parseNumber(clip.opacity, 1), 0, 1),
    scale: clamp(parseNumber(clip.scale, 1), 0.05, 4),
    x: clamp(parseNumber(clip.x, 0), -2, 2),
    y: clamp(parseNumber(clip.y, 0), -2, 2),
    rotation: clamp(parseNumber(clip.rotation, 0), -360, 360),
    fit: clip.fit === "contain" ? "contain" : "cover",
    flipH: Boolean(clip.flipH),
    flipV: Boolean(clip.flipV),
    effect: EFFECTS.some((effect) => effect.id === clip.effect) ? clip.effect : "none",
    color: { ...defaultColor(), ...(clip.color || {}) },
    fades: { ...defaultFades(), ...(clip.fades || {}) },
    transition: { ...defaultTransition(), ...(clip.transition || {}) },
    animation: { ...defaultAnimation(), ...(clip.animation || {}) },
    keyframes: normalizeKeyframes(clip.keyframes, Math.max(0.05, parseNumber(clip.duration, 3)))
  };
  normalized.fades.in = clamp(parseNumber(normalized.fades.in, 0), 0, normalized.duration);
  normalized.fades.out = clamp(parseNumber(normalized.fades.out, 0), 0, normalized.duration);
  normalized.transition.duration = clamp(parseNumber(normalized.transition.duration, 0.6), 0, 5);
  normalized.animation.duration = clamp(parseNumber(normalized.animation.duration, 0.55), 0, 5);
  if (type === "text" || type === "sticker") {
    normalized.text = normalizeText(clip.text || {});
    normalized.volume = 0;
    normalized.trimIn = 0;
  } else {
    normalized.text = null;
  }
  return normalized;
}

export function normalizeProject(project) {
  if (!project || typeof project !== "object") throw new Error("Invalid project.");
  const base = createProject(project.name || "Untitled edit");
  const settings = {
    ...base.settings,
    ...(project.settings || {})
  };
  settings.width = Math.round(clamp(parseNumber(settings.width, 1920), 320, 7680));
  settings.height = Math.round(clamp(parseNumber(settings.height, 1080), 320, 7680));
  settings.fps = clamp(parseNumber(settings.fps, 30), 1, 120);
  settings.background = safeHex(settings.background, "#0b0e0e");
  settings.sampleRate = 48000;
  const tracks = Array.isArray(project.tracks) && project.tracks.length
    ? project.tracks.map((track, index) => {
        const kind = ["video", "audio", "text"].includes(track.kind || track.type)
          ? track.kind || track.type
          : "video";
        return {
          id: track.id || uid(),
          kind,
          name: String(track.name || `${kind === "video" ? "V" : kind === "audio" ? "A" : "T"}${index + 1}`),
          hidden: Boolean(track.hidden),
          muted: Boolean(track.muted),
          locked: Boolean(track.locked),
          clips: (Array.isArray(track.clips) ? track.clips : []).map(normalizeClip)
        };
      })
    : base.tracks;
  for (const track of tracks) sortTrack(track);
  const assets = (Array.isArray(project.assets) ? project.assets : []).map((asset) => ({
    ...asset,
    id: asset.id || uid(),
    path: String(asset.path || ""),
    type: ["video", "image", "audio"].includes(asset.type) ? asset.type : "video",
    name: String(asset.name || "Media"),
    duration: Math.max(0.01, parseNumber(asset.duration, 5)),
    width: Math.max(0, parseNumber(asset.width, 0)),
    height: Math.max(0, parseNumber(asset.height, 0)),
    peaks: Array.isArray(asset.peaks) ? asset.peaks.map((v) => clamp(parseNumber(v, 0), 0, 1)) : []
  }));
  return {
    ...base,
    ...project,
    schemaVersion: SCHEMA_VERSION,
    id: project.id || uid(),
    name: String(project.name || "Untitled edit"),
    settings,
    assets,
    tracks
  };
}

export function effectCss(effect = "none", color = {}) {
  const parts = [];
  let brightness = 1 + parseNumber(color.brightness) / 100;
  let contrast = 1 + parseNumber(color.contrast) / 100;
  let saturation = 1 + parseNumber(color.saturation) / 100;
  if (effect === "vivid") {
    contrast *= 1.14;
    saturation *= 1.38;
  } else if (effect === "faded") {
    contrast *= 0.84;
    saturation *= 0.7;
    brightness += 0.055;
  } else if (effect === "noir") {
    contrast *= 1.3;
    brightness -= 0.025;
  }
  if (effect === "bw" || effect === "noir") parts.push("grayscale(1)");
  if (effect === "sepia") parts.push("sepia(0.78)", "saturate(1.08)");
  if (effect === "dream") {
    brightness += 0.07;
    contrast *= 0.92;
    saturation *= 1.08;
  }
  parts.push(`brightness(${brightness.toFixed(3)})`);
  parts.push(`contrast(${contrast.toFixed(3)})`);
  parts.push(`saturate(${saturation.toFixed(3)})`);
  const temperature = clamp(parseNumber(color.temperature), -100, 100);
  if (temperature > 0.5) {
    parts.push(`sepia(${(temperature * 0.0022).toFixed(3)})`);
    parts.push("saturate(1.04)");
  } else if (temperature < -0.5) {
    parts.push(`hue-rotate(${(temperature * 0.05).toFixed(2)}deg)`);
    parts.push("saturate(0.97)");
  }
  const blur = clamp(parseNumber(color.blur), 0, 30);
  if (blur > 0.25) parts.push(`blur(${(blur * 0.45).toFixed(2)}px)`);
  else if (effect === "dream") parts.push("blur(0.35px)");
  const sharpen = clamp(parseNumber(color.sharpen), 0, 100);
  if (sharpen > 0.5) {
    parts.push(`contrast(${(1 + sharpen / 500).toFixed(3)})`);
  }
  return parts.join(" ");
}

export function vignetteOpacity(color = {}) {
  return clamp(parseNumber(color.vignette), 0, 100) / 100;
}

export function makeResolutionFromPreset(preset, base) {
  const currentAspect = base.width / base.height;
  const presetAspect = preset.width / preset.height;
  if (Math.abs(currentAspect - presetAspect) < 0.0001) {
    return { width: base.width, height: preset.height };
  }
  return { width: preset.width, height: preset.height };
}

export function aspectRatioLabel(project) {
  const w = Number(project?.settings?.width) || 16;
  const h = Number(project?.settings?.height) || 9;
  const gcd = (a, b) => {
    let x = Math.abs(Math.round(a));
    let y = Math.abs(Math.round(b));
    while (y) [x, y] = [y, x % y];
    return x || 1;
  };
  const d = gcd(w, h);
  return `${Math.round(w / d)}:${Math.round(h / d)}`;
}

export function resolutionLabel(project) {
  const w = Number(project?.settings?.width) || 1920;
  const h = Number(project?.settings?.height) || 1080;
  const short = Math.min(w, h);
  if (short >= 3000) return `${w} × ${h} · 4K+`;
  if (short >= 1900) return `${w} × ${h} · 4K-ish`;
  if (short >= 1000) return `${w} × ${h} · 1080p`;
  if (short >= 700) return `${w} × ${h} · 720p`;
  return `${w} × ${h}`;
}

export function exportDimensions(project, scale) {
  const baseW = Number(project.settings.width) || 1920;
  const baseH = Number(project.settings.height) || 1080;
  const mul = Math.max(0.1, Number(scale) || 1);
  return {
    width: Math.max(2, Math.round((baseW * mul) / 2) * 2),
    height: Math.max(2, Math.round((baseH * mul) / 2) * 2)
  };
}

export function exportScaleForPreset(project, preset) {
  if (preset === "source") return 1;
  const short = Math.min(Number(project.settings.width), Number(project.settings.height));
  const target = preset === "4k" ? 2160 : preset === "1080" ? 1080 : preset === "720" ? 720 : short;
  return target / Math.max(1, short);
}

export function clipSummary(clip) {
  if (!clip) return "";
  return `${formatShort(clip.start)} – ${formatShort(clipEnd(clip))} · ${formatShort(clip.duration)}`;
}

export function totalMediaDuration(project) {
  return (project?.assets || []).reduce((sum, asset) => sum + (Number(asset.duration) || 0), 0);
}
