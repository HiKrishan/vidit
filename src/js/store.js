import { areEqual, clamp, deepClone, uid } from "./utils.js";
import {
  addTrack as addTrackToProject,
  clipEnd,
  createAssetClip,
  createTextClip,
  createStickerClip,
  findClip,
  findGap,
  normalizeProject,
  projectDuration,
  sortTrack,
  splitClipKeyframes
} from "./model.js";

export class EditorStore {
  constructor(project, options = {}) {
    this.project = normalizeProject(project);
    this.undoStack = [];
    this.redoStack = [];
    this.pending = null;
    this.selectedClipId = null;
    this.selectedAssetId = null;
    this.playhead = 0;
    this.zoom = clamp(options.zoom, 4, 180) || 45;
    this.snap = options.snap !== false;
    this.tool = "select";
    this.dirty = false;
    this.filePath = null;
    this.listeners = new Set();
    this.clipboard = null;
    this.maxHistory = 80;
    this.exporting = false;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(reason = "project", detail = {}) {
    for (const listener of this.listeners) {
      try {
        listener({ reason, detail });
      } catch (err) {
        console.error("[Vidit] store listener failed", err);
      }
    }
  }

  get duration() {
    return projectDuration(this.project);
  }

  get timelineDuration() {
    return Math.max(this.duration, 10);
  }

  get selectedClip() {
    return this.selectedClipId ? this.getClip(this.selectedClipId) : null;
  }

  get selectedAsset() {
    return this.selectedAssetId
      ? this.project.assets.find((asset) => asset.id === this.selectedAssetId) || null
      : null;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  getTrack(trackId) {
    return this.project.tracks.find((track) => track.id === trackId) || null;
  }

  getClip(clipId) {
    const found = findClip(this.project, clipId);
    return found?.clip || null;
  }

  getClipWithTrack(clipId) {
    return findClip(this.project, clipId);
  }

  getAsset(assetId) {
    return this.project.assets.find((asset) => asset.id === assetId) || null;
  }

  selectClip(clipId, { additive = false } = {}) {
    this.selectedClipId = clipId || null;
    this.selectedAssetId = null;
    this.emit("selection", { clipId: this.selectedClipId });
  }

  selectAsset(assetId) {
    this.selectedAssetId = assetId || null;
    this.selectedClipId = null;
    this.emit("selection", { assetId: this.selectedAssetId });
  }

  clearSelection() {
    if (!this.selectedClipId && !this.selectedAssetId) return;
    this.selectedClipId = null;
    this.selectedAssetId = null;
    this.emit("selection");
  }

  setPlayhead(value, { silent = false } = {}) {
    const max = Math.max(0.1, this.duration);
    const next = clamp(Number(value) || 0, 0, max);
    if (Math.abs(next - this.playhead) < 0.00001) return;
    this.playhead = next;
    if (!silent) this.emit("playhead", { playhead: next });
  }

  setTool(tool) {
    if (!["select", "blade"].includes(tool)) return;
    this.tool = tool;
    this.emit("tool", { tool });
  }

  setSnap(value) {
    this.snap = Boolean(value);
    this.emit("snap", { snap: this.snap });
  }

  setZoom(value) {
    this.zoom = clamp(value, 4, 180);
    this.emit("zoom", { zoom: this.zoom });
  }

  beginEdit(label = "Edit") {
    if (this.pending) return;
    this.pending = {
      label,
      project: deepClone(this.project),
      serialized: JSON.stringify(this.project)
    };
  }

  transient(fn, reason = "control", detail = {}) {
    if (typeof fn === "function") fn(this.project);
    this.project.modifiedAt = Date.now();
    this.emit(reason, detail);
  }

  commitEdit() {
    if (!this.pending) return false;
    const pending = this.pending;
    this.pending = null;
    if (areEqual(pending.project, this.project)) return false;
    this.undoStack.push({ project: pending.project, label: pending.label });
    if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
    this.redoStack = [];
    this.dirty = true;
    this.project.modifiedAt = Date.now();
    this.emit("history", { label: pending.label });
    return true;
  }

  cancelEdit({ revert = true } = {}) {
    if (!this.pending) return;
    if (revert) this.project = this.pending.project;
    this.pending = null;
    this.emit("project", { source: "cancel" });
    this.emit("history");
  }

  edit(fn, label = "Edit", reason = "project", detail = {}) {
    if (this.pending) this.commitEdit();
    this.beginEdit(label);
    if (typeof fn === "function") fn(this.project);
    this.project.modifiedAt = Date.now();
    const changed = this.commitEdit();
    this.emit(reason, { ...detail, changed });
    return changed;
  }

  undo() {
    if (this.pending) this.commitEdit();
    if (!this.undoStack.length) return false;
    const current = deepClone(this.project);
    const entry = this.undoStack.pop();
    this.redoStack.push(current);
    this.project = normalizeProject(entry.project);
    this.afterHistoryRestore();
    this.emit("history", { label: entry.label, direction: "undo" });
    this.emit("project", { source: "undo" });
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    if (this.pending) this.cancelEdit();
    const current = deepClone(this.project);
    const next = this.redoStack.pop();
    this.undoStack.push(current);
    this.project = normalizeProject(next);
    this.dirty = true;
    this.afterHistoryRestore();
    this.emit("history", { direction: "redo" });
    this.emit("project", { source: "redo" });
    return true;
  }

  afterHistoryRestore() {
    if (this.selectedClipId && !this.getClip(this.selectedClipId)) this.selectedClipId = null;
    if (this.selectedAssetId && !this.getAsset(this.selectedAssetId)) this.selectedAssetId = null;
    this.playhead = clamp(this.playhead, 0, Math.max(0.1, this.duration));
    this.dirty = true;
    this.project.modifiedAt = Date.now();
  }

  loadProject(project, { filePath = null, dirty = false, playhead = 0 } = {}) {
    this.project = normalizeProject(project);
    this.undoStack = [];
    this.redoStack = [];
    this.pending = null;
    this.selectedClipId = null;
    this.selectedAssetId = null;
    this.playhead = clamp(playhead, 0, Math.max(0.1, this.duration));
    this.filePath = filePath || null;
    this.dirty = Boolean(dirty);
    this.emit("load", { filePath });
    this.emit("history");
  }

  markSaved(filePath = null, savedAt = Date.now()) {
    if (filePath) this.filePath = filePath;
    this.project.savedAt = savedAt;
    this.dirty = false;
    this.emit("save", { filePath: this.filePath, savedAt });
    this.emit("history");
  }

  setProjectName(name) {
    const clean = String(name || "").trim().slice(0, 80) || "Untitled edit";
    if (clean === this.project.name) return;
    this.edit(() => {
      this.project.name = clean;
    }, "Rename project", "project");
  }

  addAsset(asset) {
    this.edit(() => {
      this.project.assets.push(asset);
    }, "Import media", "assets");
    this.selectedAssetId = asset.id;
    this.selectedClipId = null;
    this.emit("selection");
    return asset;
  }

  addAssets(assets) {
    if (!assets?.length) return;
    this.edit(() => {
      this.project.assets.push(...assets);
    }, "Import media", "assets");
    this.emit("selection");
  }

  removeAsset(assetId, { removeClips = true } = {}) {
    const asset = this.getAsset(assetId);
    if (!asset) return;
    this.edit(() => {
      this.project.assets = this.project.assets.filter((item) => item.id !== assetId);
      if (removeClips) {
        for (const track of this.project.tracks) {
          track.clips = track.clips.filter((clip) => clip.assetId !== assetId);
        }
      }
    }, "Remove media", "assets");
    if (this.selectedAssetId === assetId) this.selectedAssetId = null;
    if (this.selectedClipId && !this.getClip(this.selectedClipId)) this.selectedClipId = null;
    this.emit("selection");
  }

  addTrack(kind) {
    let trackId = null;
    this.edit(() => {
      const track = addTrackToProject(this.project, kind);
      trackId = track.id;
    }, "Add track", "project");
    return trackId;
  }

  removeTrack(trackId) {
    const track = this.getTrack(trackId);
    if (!track) return false;
    if (this.project.tracks.length <= 1) return false;
    this.edit(() => {
      this.project.tracks = this.project.tracks.filter((item) => item.id !== trackId);
    }, "Remove track", "project");
    if (this.selectedClipId && !this.getClip(this.selectedClipId)) this.selectedClipId = null;
    this.emit("selection");
    return true;
  }

  addAssetClip(assetId, trackId, start = this.playhead, { atGap = true } = {}) {
    const asset = this.getAsset(assetId);
    const track = this.getTrack(trackId);
    if (!asset || !track) return null;
    const clip = createAssetClip(asset, track, start);
    if (atGap) {
      clip.start = findGap(track, start, clip.duration);
    }
    this.edit(() => {
      track.clips.push(clip);
      sortTrack(track);
    }, "Add clip", "project");
    this.selectedClipId = clip.id;
    this.selectedAssetId = null;
    this.emit("selection");
    return clip;
  }

  addTextClip(presetId = "display", { trackId = null, start = this.playhead } = {}) {
    const track = (trackId && this.getTrack(trackId)) ||
      this.project.tracks.find((item) => item.kind === "text") ||
      { id: this.addTrack("text") };
    const resolved = this.getTrack(track.id);
    const clip = createTextClip(presetId, start);
    clip.start = findGap(resolved, start, clip.duration);
    this.edit(() => {
      resolved.clips.push(clip);
      sortTrack(resolved);
    }, "Add text", "project");
    this.selectedClipId = clip.id;
    this.selectedAssetId = null;
    this.emit("selection");
    return clip;
  }

  addStickerClip(emoji, { trackId = null, start = this.playhead } = {}) {
    const track = (trackId && this.getTrack(trackId)) ||
      this.project.tracks.find((item) => item.kind === "text") ||
      { id: this.addTrack("text") };
    const resolved = this.getTrack(track.id);
    const clip = createStickerClip(emoji, start);
    clip.start = findGap(resolved, start, clip.duration);
    this.edit(() => {
      resolved.clips.push(clip);
      sortTrack(resolved);
    }, "Add sticker", "project");
    this.selectedClipId = clip.id;
    this.selectedAssetId = null;
    this.emit("selection");
    return clip;
  }

  deleteSelected({ ripple = false } = {}) {
    const found = this.selectedClipId ? this.getClipWithTrack(this.selectedClipId) : null;
    if (!found) return false;
    const { clip, track } = found;
    this.edit(() => {
      const removedEnd = clipEnd(clip);
      const removedDuration = clip.duration;
      track.clips = track.clips.filter((item) => item.id !== clip.id);
      if (ripple) {
        for (const item of track.clips) {
          if (item.start >= removedEnd - 0.001) item.start = Math.max(0, item.start - removedDuration);
        }
      }
    }, "Delete clip", "project");
    this.selectedClipId = null;
    this.emit("selection");
    return true;
  }

  splitSelected(time = this.playhead) {
    if (!this.selectedClipId) return false;
    const found = this.getClipWithTrack(this.selectedClipId);
    if (!found) return false;
    const { clip, track, index } = found;
    const cut = Number(time);
    const minLength = 0.08;
    if (cut <= clip.start + minLength || cut >= clipEnd(clip) - minLength) return false;
    let rightId = null;
    this.edit(() => {
      const speed = clamp(Number(clip.speed) || 1, 0.25, 4);
      const leftDuration = cut - clip.start;
      const rightDuration = clip.duration - leftDuration;
      const right = deepClone(clip);
      right.id = uid();
      right.name = clip.name;
      right.start = cut;
      right.duration = rightDuration;
      right.trimIn = (Number(clip.trimIn) || 0) + leftDuration * speed;
      right.transition = { type: "none", duration: 0 };
      right.fades = { in: 0, out: Math.max(0, Number(clip.fades?.out) || 0) };
      clip.duration = leftDuration;
      clip.fades = { in: Math.max(0, Number(clip.fades?.in) || 0), out: 0 };
      clip.transition = { type: "none", duration: 0 };
      splitClipKeyframes(clip, right, leftDuration);
      track.clips.splice(index + 1, 0, right);
      sortTrack(track);
      rightId = right.id;
    }, "Split clip", "project");
    this.selectedClipId = rightId;
    this.emit("selection");
    return true;
  }

  duplicateSelected() {
    const found = this.selectedClipId ? this.getClipWithTrack(this.selectedClipId) : null;
    if (!found) return false;
    const { clip, track } = found;
    let newId = null;
    this.edit(() => {
      const copy = deepClone(clip);
      copy.id = uid();
      copy.name = `${clip.name} copy`;
      copy.start = findGap(track, clipEnd(clip), clip.duration);
      copy.transition = { type: "none", duration: 0 };
      track.clips.push(copy);
      sortTrack(track);
      newId = copy.id;
    }, "Duplicate clip", "project");
    this.selectedClipId = newId;
    this.emit("selection");
    return true;
  }

  copySelected() {
    const clip = this.selectedClip;
    if (!clip) return false;
    this.clipboard = deepClone(clip);
    return true;
  }

  pasteClip() {
    if (!this.clipboard) return false;
    const source = this.getClipWithTrack(this.clipboard.id);
    const sourceTrack = source?.track || this.project.tracks.find((track) => isCompatible(track, this.clipboard));
    if (!sourceTrack) return false;
    const clip = deepClone(this.clipboard);
    clip.id = uid();
    clip.name = `${clip.name} copy`;
    clip.start = findGap(sourceTrack, this.playhead, clip.duration);
    clip.transition = { type: "none", duration: 0 };
    this.edit(() => {
      sourceTrack.clips.push(clip);
      sortTrack(sourceTrack);
    }, "Paste clip", "project");
    this.selectedClipId = clip.id;
    this.emit("selection");
    return true;
  }

  updateClipTransient(clipId, updater, reason = "gesture", detail = {}) {
    const found = clipId ? this.getClipWithTrack(clipId) : null;
    if (!found) return false;
    if (typeof updater === "function") updater(found.clip, found.track);
    else Object.assign(found.clip, updater || {});
    this.project.modifiedAt = Date.now();
    this.emit(reason, { clipId, ...detail });
    return true;
  }

  toggleTrackFlag(trackId, flag) {
    const track = this.getTrack(trackId);
    if (!track || !["hidden", "muted", "locked"].includes(flag)) return;
    this.edit(() => {
      track[flag] = !track[flag];
    }, flag === "muted" ? "Mute track" : flag === "hidden" ? "Hide track" : "Lock track", "project");
  }

  renameTrack(trackId, name) {
    const track = this.getTrack(trackId);
    if (!track) return;
    const clean = String(name || "").trim().slice(0, 30) || track.name;
    if (clean === track.name) return;
    this.edit(() => {
      track.name = clean;
    }, "Rename track", "project");
  }

  setTrackVolume(trackId, volume) {
    const track = this.getTrack(trackId);
    if (!track) return;
    track.volume = clamp(volume, 0, 1);
    this.emit("control", { trackId });
  }

  applyEffect(effectId) {
    const clip = this.selectedClip;
    if (!clip) return false;
    this.edit(() => {
      clip.effect = effectId;
    }, "Apply effect", "control", { clipId: clip.id });
    return true;
  }

  applyTransition(transition) {
    const clip = this.selectedClip;
    if (!clip) return false;
    this.edit(() => {
      clip.transition = {
        type: transition.id || "none",
        duration: Number(transition.duration) || 0
      };
    }, "Apply transition", "project", { clipId: clip.id });
    return true;
  }

  applyTextAnimation(animation) {
    const clip = this.selectedClip;
    if (!clip?.text) return false;
    const type = typeof animation === "string" ? animation : animation?.id || "none";
    const duration =
      typeof animation === "object" && animation?.duration != null
        ? Number(animation.duration)
        : type === "none"
          ? 0
          : 0.55;
    this.edit(() => {
      clip.text.animation = type;
      clip.animation = { type: "none", duration: 0 };
      if (type !== "none") clip.animation = { type, duration };
    }, "Text animation", "control", { clipId: clip.id });
    return true;
  }

  markExported() {
    this.emit("export-state", { exporting: false });
  }
}

function isCompatible(track, clip) {
  if (!track || track.locked) return false;
  if (track.kind === "text") return clip.type === "text" || clip.type === "sticker";
  if (track.kind === "audio") return clip.type === "audio";
  if (track.kind === "video") return clip.type === "video" || clip.type === "image";
  return false;
}
