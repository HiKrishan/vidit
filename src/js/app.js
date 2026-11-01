import {
  FPS_OPTIONS,
  RESOLUTION_PRESETS,
  clipEnd,
  createAssetClip,
  createProject,
  sortTrack
} from "./model.js";
import { EditorStore } from "./store.js";
import { PreviewEngine } from "./preview.js";
import { Timeline } from "./timeline.js";
import { LibraryPanel } from "./library.js";
import { Inspector } from "./inspector.js";
import { ExportDialog } from "./export.js";
import { buildTextImages } from "./text-render.js";
import {
  $,
  $$,
  clamp,
  debounce,
  escapeHtml,
  formatClock,
  formatDuration,
  formatShort,
  formatTimecode,
  icon,
  isTypingTarget
} from "./utils.js";

const dom = {
  appShell: $("#appShell"),
  dirtyDot: $("#dirtyDot"),
  projectName: $("#projectName"),
  saveState: $("#saveState"),
  undoBtn: $("#undoBtn"),
  redoBtn: $("#redoBtn"),
  projectMenuBtn: $("#projectMenuBtn"),
  projectMenu: $("#projectMenu"),
  settingsBtn: $("#settingsBtn"),
  exportBtn: $("#exportBtn"),
  minimizeBtn: $("#minimizeBtn"),
  maximizeBtn: $("#maximizeBtn"),
  closeBtn: $("#closeBtn"),

  libraryPanel: $("#libraryPanel"),
  libraryHead: $("#libraryHead"),
  libraryBody: $("#libraryBody"),
  inspectorPanel: $("#inspectorPanel"),
  inspectorHead: $("#inspectorHead"),
  inspectorBody: $("#inspectorBody"),

  stage: $("#stage"),
  stageViewport: $("#stageViewport"),
  stageBackground: $("#stageBackground"),
  stageLayers: $("#stageLayers"),
  stageEmpty: $("#stageEmpty"),
  emptyImportBtn: $("#emptyImportBtn"),
  safeArea: $("#safeArea"),
  safeAreaBtn: $("#safeAreaBtn"),
  fullscreenPreviewBtn: $("#fullscreenPreviewBtn"),
  stageMeta: $("#stageMeta"),

  timecode: $("#timecode"),
  durationCode: $("#durationCode"),
  playBtn: $("#playBtn"),
  jumpStartBtn: $("#jumpStartBtn"),
  stepBackBtn: $("#stepBackBtn"),
  stepForwardBtn: $("#stepForwardBtn"),
  jumpEndBtn: $("#jumpEndBtn"),
  loopBtn: $("#loopBtn"),
  muteMasterBtn: $("#muteMasterBtn"),
  masterVolume: $("#masterVolume"),
  fpsChip: $("#fpsChip"),

  timelinePanel: $("#timelinePanel"),
  timelineScroll: $("#timelineScroll"),
  timelineContent: $("#timelineContent"),
  timelineRuler: $("#timelineRuler"),
  timelineLanes: $("#timelineLanes"),
  timelineDropIndicator: $("#timelineDropIndicator"),
  trackHeads: $("#trackHeads"),
  playhead: $("#playhead"),
  timelineHint: $("#timelineHint"),
  selectionHint: $("#selectionHint"),
  zoomRange: $("#zoomRange"),
  selectToolBtn: $("#selectToolBtn"),
  bladeToolBtn: $("#bladeToolBtn"),
  splitBtn: $("#splitBtn"),
  duplicateBtn: $("#duplicateBtn"),
  deleteBtn: $("#deleteBtn"),
  snapBtn: $("#snapBtn"),
  addTrackBtn: $("#addTrackBtn"),
  cornerAddTrack: $("#cornerAddTrack"),
  zoomOutBtn: $("#zoomOutBtn"),
  zoomInBtn: $("#zoomInBtn"),
  fitTimelineBtn: $("#fitTimelineBtn"),
  shortcutsBtn: $("#shortcutsBtn"),

  toastStack: $("#toastStack"),
  modalRoot: $("#modalRoot"),
  modalShell: $("#modalShell"),
  modalKicker: $("#modalKicker"),
  modalTitle: $("#modalTitle"),
  modalBody: $("#modalBody"),
  modalActions: $("#modalActions"),
  contextMenu: $("#contextMenu")
};

/* ---------------------------------- Modal --------------------------------- */

class ModalController {
  constructor({ root, shell, kickerEl, titleEl, bodyEl, actionsEl }) {
    this.root = root;
    this.shell = shell;
    this.kickerEl = kickerEl;
    this.titleEl = titleEl;
    this.body = bodyEl;
    this.actionsEl = actionsEl;
    this.closeBtn = root.querySelector(".modal-close");
    this.onAction = null;
    this.onClose = null;
    this.dismissible = true;
    this.previousFocus = null;

    this.shell.tabIndex = -1;
    this.root.addEventListener("click", (event) => {
      if (event.target.closest("[data-modal-close]")) {
        event.preventDefault();
        this.requestClose();
      }
    });
    this.actionsEl.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button || button.disabled) return;
      if (this.onAction) this.onAction(button.dataset.action, button);
    });
    document.addEventListener(
      "keydown",
      (event) => {
        if (!this.isOpen) return;
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        this.requestClose();
      },
      true
    );
  }

  get isOpen() {
    return !this.root.hidden;
  }

  open({
    kicker = "Vidit",
    title = "",
    body = "",
    actions = "",
    width = "",
    dismissible = true,
    onClose = null
  } = {}) {
    if (this.isOpen) this.finalize();
    this.previousFocus = document.activeElement;
    this.onClose = typeof onClose === "function" ? onClose : null;
    this.onAction = null;
    this.dismissible = dismissible !== false;
    this.body.onclick = null;
    this.body.onchange = null;
    this.body.oninput = null;
    this.body.onkeydown = null;
    this.shell.className = `modal-shell${width ? ` ${width}` : ""}`;
    this.setKicker(kicker);
    this.setTitle(title);
    this.setBody(body);
    this.setActions(actions);
    this.setDismissible(this.dismissible);
    this.root.hidden = false;
    requestAnimationFrame(() => {
      this.shell.focus({ preventScroll: true });
    });
  }

  setKicker(text) {
    this.kickerEl.textContent = text || "Vidit";
  }

  setTitle(text) {
    this.titleEl.textContent = text || "";
  }

  setBody(html) {
    this.body.innerHTML = html || "";
  }

  setActions(html) {
    this.actionsEl.innerHTML = html || "";
  }

  setDismissible(value) {
    this.dismissible = Boolean(value);
    if (this.closeBtn) this.closeBtn.hidden = !this.dismissible;
  }

  requestClose() {
    if (!this.isOpen || !this.dismissible) return;
    this.close();
  }

  close() {
    this.finalize();
  }

  finalize() {
    if (!this.isOpen) return;
    this.root.hidden = true;
    const onClose = this.onClose;
    this.onClose = null;
    this.onAction = null;
    this.body.onclick = null;
    this.body.onchange = null;
    this.body.oninput = null;
    this.body.onkeydown = null;
    if (onClose) {
      try {
        onClose();
      } catch (err) {
        console.error("[Vidit] modal onClose failed", err);
      }
    }
    const previous = this.previousFocus;
    this.previousFocus = null;
    if (previous && previous.isConnected && typeof previous.focus === "function") {
      try {
        previous.focus({ preventScroll: true });
      } catch {
        /* noop */
      }
    }
  }
}

const modal = new ModalController({
  root: dom.modalRoot,
  shell: dom.modalShell,
  kickerEl: dom.modalKicker,
  titleEl: dom.modalTitle,
  bodyEl: dom.modalBody,
  actionsEl: dom.modalActions
});

/* ---------------------------------- Toast --------------------------------- */

function toast(title, message = "", type = "info", duration = 3600) {
  if (!dom.toastStack) return;
  const el = document.createElement("div");
  el.className = `toast${type ? ` ${type}` : ""}`;
  el.innerHTML =
    `<strong>${escapeHtml(title)}</strong>` + (message ? `<span>${escapeHtml(message)}</span>` : "");
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 180);
  };
  el.addEventListener("click", remove);
  while (dom.toastStack.children.length >= 4) dom.toastStack.firstElementChild?.remove();
  dom.toastStack.appendChild(el);
  setTimeout(remove, Math.max(1600, Number(duration) || 3600));
}

/* ---------------------------------- Store --------------------------------- */

const store = new EditorStore(createProject("Untitled edit"), { zoom: 45, snap: true });
let appInfo = null;
let preview = null;
let timeline = null;
let library = null;
let inspector = null;
let exportDialog = null;

const scheduleAutosave = debounce(async () => {
  if (!store.dirty) return;
  try {
    await window.vidit.autosave(store.project);
  } catch {
    /* autosave is best-effort */
  }
}, 2400);

function fileLabel(filePath) {
  return String(filePath || "").split(/[\\/]/).pop() || "";
}

function updateTimeUI(time = store.playhead, playing = preview?.isPlaying() ?? false) {
  const fps = Number(store.project.settings.fps) || 30;
  const safeTime = clamp(time, 0, Math.max(0, store.duration));
  if (dom.timecode) dom.timecode.textContent = formatTimecode(safeTime, fps);
  if (dom.durationCode) dom.durationCode.textContent = `/ ${formatTimecode(store.duration, fps)}`;
  if (timeline) timeline.updatePlayhead();
  if (dom.playBtn) dom.playBtn.classList.toggle("is-playing", Boolean(playing));
}

function updateToolButtons() {
  dom.selectToolBtn?.classList.toggle("active", store.tool === "select");
  dom.bladeToolBtn?.classList.toggle("active", store.tool === "blade");
  dom.snapBtn?.classList.toggle("active", Boolean(store.snap));
}

function updateChrome() {
  const project = store.project;
  const dirty = Boolean(store.dirty);
  if (dom.dirtyDot) {
    dom.dirtyDot.classList.toggle("dirty", dirty);
    dom.dirtyDot.title = dirty ? "Unsaved changes" : "Saved";
  }
  if (dom.projectName && document.activeElement !== dom.projectName) {
    dom.projectName.value = project.name;
  }
  if (dom.saveState) {
    const fileName = fileLabel(store.filePath);
    dom.saveState.textContent = fileName
      ? `${fileName}${dirty ? " · edited" : " · saved"}`
      : dirty
        ? "Unsaved project"
        : "Local project";
  }
  if (dom.undoBtn) dom.undoBtn.disabled = !store.canUndo;
  if (dom.redoBtn) dom.redoBtn.disabled = !store.canRedo;
  if (dom.stageMeta) {
    dom.stageMeta.textContent = `${project.settings.width} × ${project.settings.height} · ${project.settings.fps} fps`;
  }
  if (dom.fpsChip) dom.fpsChip.textContent = `${project.settings.fps} fps`;
  document.title = `${project.name}${dirty ? " •" : ""} — Vidit`;
  updateTimeUI(store.playhead, preview?.isPlaying() ?? false);
}

function setPlayingUI(playing) {
  if (!dom.playBtn) return;
  const value = Boolean(playing);
  dom.playBtn.classList.toggle("is-playing", value);
  dom.playBtn.setAttribute("aria-label", value ? "Pause" : "Play");
  dom.playBtn.title = value ? "Pause (Space)" : "Play (Space)";
  timeline?.setPlaying(value);
}

function handlePlayState(playing) {
  setPlayingUI(playing);
}

function handleTimeUpdate(time) {
  updateTimeUI(time, preview?.isPlaying() ?? false);
}

function handleStoreChange({ reason, detail }) {
  if (["project", "load", "assets", "history", "save", "control", "gesture"].includes(reason)) {
    updateChrome();
  }
  if (reason === "gesture" && detail?.clipId) {
    timeline?.updateClipElement(detail.clipId);
    updateTimeUI(store.playhead);
  }
  if (reason === "playhead") updateTimeUI(store.playhead);
  if (reason === "tool" || reason === "snap") updateToolButtons();
  if (["project", "assets", "history", "control", "gesture"].includes(reason)) scheduleAutosave();
  if (reason === "load") scheduleAutosave.cancel();
}

/* -------------------------------- Modules --------------------------------- */

preview = new PreviewEngine({
  store,
  stage: dom.stage,
  background: dom.stageBackground,
  layers: dom.stageLayers,
  empty: dom.stageEmpty,
  onTime: handleTimeUpdate,
  onPlayState: handlePlayState
});

timeline = new Timeline({
  store,
  heads: dom.trackHeads,
  ruler: dom.timelineRuler,
  lanes: dom.timelineLanes,
  playhead: dom.playhead,
  scroll: dom.timelineScroll,
  content: dom.timelineContent,
  dropIndicator: dom.timelineDropIndicator,
  zoomRange: dom.zoomRange,
  selectionHint: dom.selectionHint,
  hint: dom.timelineHint,
  onSeek: handleSeek,
  onSplit: (clipId, time) => {
    store.selectClip(clipId);
    if (!store.splitSelected(time)) {
      toast("Cannot split here", "Place the playhead inside the clip, away from its edges.", "warn");
    }
  },
  onAddTrack: () => openAddTrackMenu(dom.addTrackBtn),
  onContextMenu: (clip, x, y) => openClipMenu(clip, x, y),
  onTrackContext: (track, x, y) => openTrackMenu(track, x, y),
  onRenameTrack: (track) => openRenameTrack(track),
  onDropAsset: handleDropAsset,
  onToast: toast
});

library = new LibraryPanel({
  store,
  head: dom.libraryHead,
  body: dom.libraryBody,
  onImport: importMedia,
  onAddAsset: addAssetToTimeline,
  onAddText: addTextClip,
  onAddSticker: addStickerClip,
  onApplyEffect: applyEffect,
  onApplyTransition: applyTransition,
  onRecordVoice: openVoiceRecorder,
  onExtractAudio: extractAudioFromSelection,
  onDeleteAsset: removeAsset,
  onRevealAsset: revealAsset,
  onOpenProjectSettings: openProjectSettings,
  onAssetContext: openAssetMenu,
  onToast: toast
});

inspector = new Inspector({
  store,
  head: dom.inspectorHead,
  body: dom.inspectorBody,
  onToast: toast,
  onOpenProjectSettings: openProjectSettings,
  actions: {
    addAsset: addAssetToTimeline,
    extractAudio: extractAudioFromAsset,
    freeze: freezeFrameFromAsset,
    revealAsset,
    removeAsset,
    deleteClip
  }
});

exportDialog = new ExportDialog({
  store,
  modal,
  onToast: toast,
  onOpenSettings: openSettings,
  getInfo: () => appInfo
});

/* --------------------------------- Helpers -------------------------------- */

function ask({ kicker = "Vidit", title, body, actions, width = "" }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      modal.onAction = null;
      modal.onClose = null;
      if (modal.isOpen) modal.close();
      resolve(value);
    };
    modal.open({
      kicker,
      title,
      body,
      actions,
      width,
      dismissible: true,
      onClose: () => finish("__close")
    });
    modal.onAction = (action) => finish(action);
  });
}

function setTab(tab) {
  library?.setTab(tab);
  $$(".rail-item[data-tab]").forEach((item) => {
    item.classList.toggle("active", item.dataset.tab === tab);
  });
}

function handleSeek(time) {
  if (!preview) return;
  if (preview.isPlaying()) preview.pause({ render: false, silent: true });
  const next = preview.seek(time, { silent: true });
  store.playhead = next;
  updateTimeUI(next, false);
  timeline?.updatePlayhead();
}

function seekTo(time, { pause = true } = {}) {
  if (pause && preview?.isPlaying()) preview.pause({ render: false, silent: true });
  if (!preview) return;
  const next = preview.seek(time, { silent: true });
  store.playhead = next;
  updateTimeUI(next, preview.isPlaying());
  timeline?.updatePlayhead();
}

function stepFrame(direction, amount = 1) {
  const fps = Math.max(1, Number(store.project.settings.fps) || 30);
  seekTo(store.playhead + (direction * amount) / fps);
}

async function confirmLoseChanges(actionLabel) {
  if (!store.dirty) return "clean";
  const choice = await ask({
    kicker: "Unsaved work",
    title: "Save before continuing?",
    body:
      `<p class="modal-copy"><strong>${escapeHtml(store.project.name)}</strong> has changes that are not written to a project file. ` +
      `${escapeHtml(actionLabel)} will discard them if you continue without saving.</p>`,
    actions:
      `<button class="btn-ghost" type="button" data-action="cancel">Cancel</button>` +
      `<button class="btn-secondary" type="button" data-action="discard">Discard changes</button>` +
      `<button class="btn-primary" type="button" data-action="save">Save and continue</button>`
  });
  if (choice === "save") return (await saveProject()) ? "saved" : false;
  if (choice === "discard") return "discarded";
  return false;
}

async function saveProject({ saveAs = false, quiet = false } = {}) {
  scheduleAutosave.cancel();
  try {
    const result = await window.vidit.saveProject(store.project, saveAs);
    if (!result || result.canceled) return false;
    store.markSaved(result.filePath, result.savedAt);
    scheduleAutosave.cancel();
    try {
      await window.vidit.clearAutosave();
    } catch {
      /* noop */
    }
    if (!quiet) {
      toast(
        saveAs ? "Project saved as" : "Project saved",
        fileLabel(result.filePath),
        "success"
      );
    }
    return true;
  } catch (err) {
    toast("Could not save project", err?.message || String(err), "error", 5000);
    return false;
  }
}

async function newProject() {
  const decision = await confirmLoseChanges("Starting a new project");
  if (!decision) return;
  scheduleAutosave.cancel();
  store.loadProject(createProject("Untitled edit"), { dirty: false });
  try {
    await window.vidit.resetProjectPath();
    await window.vidit.clearAutosave();
  } catch {
    /* noop */
  }
  preview.pause({ render: false, silent: true });
  seekTo(0, { pause: false });
  toast("New project", "A clean timeline is ready.", "success");
}

async function openProject() {
  const decision = await confirmLoseChanges("Opening another project");
  if (!decision) return;
  try {
    const result = await window.vidit.openProject();
    if (!result || result.canceled) return;
    loadProject(result.project, result.filePath);
    try {
      await window.vidit.clearAutosave();
    } catch {
      /* noop */
    }
    toast("Project opened", fileLabel(result.filePath), "success");
  } catch (err) {
    toast("Could not open project", err?.message || String(err), "error", 5000);
  }
}

function loadProject(project, filePath, { dirty = false } = {}) {
  scheduleAutosave.cancel();
  preview.pause({ render: false, silent: true });
  store.loadProject(project, { filePath, dirty });
  seekTo(0, { pause: false });
  updateChrome();
  updateToolButtons();
}

async function revealProject() {
  const filePath = store.filePath || (await window.vidit.getProjectPath());
  if (!filePath) {
    toast("No project file yet", "Save the project first.", "warn");
    return;
  }
  await window.vidit.showItem(filePath);
}

async function requestAppClose() {
  const decision = await confirmLoseChanges("Closing Vidit");
  if (!decision) return;
  if (decision === "discarded") {
    try {
      await window.vidit.clearAutosave();
    } catch {
      /* noop */
    }
  }
  window.vidit.closeWindow();
}

/* -------------------------------- Imports --------------------------------- */

async function importMedia() {
  try {
    const result = await window.vidit.pickMedia();
    if (!result || result.canceled) return;
    await registerImported(result, { switchTab: true });
  } catch (err) {
    toast("Import failed", err?.message || String(err), "error", 5000);
  }
}

async function importPaths(paths) {
  if (!paths?.length) return;
  try {
    const result = await window.vidit.importPaths(paths);
    await registerImported(result, { switchTab: true });
  } catch (err) {
    toast("Import failed", err?.message || String(err), "error", 5000);
  }
}

async function registerImported(result, { switchTab = false } = {}) {
  const assets = Array.isArray(result?.assets) ? result.assets : [];
  const errors = Array.isArray(result?.errors) ? result.errors : [];
  if (assets.length) {
    store.addAssets(assets);
    store.selectAsset(assets[0].id);
    if (switchTab) setTab("media");
    toast(
      assets.length === 1 ? "Media imported" : `${assets.length} files imported`,
      assets.length === 1 ? assets[0].name : "Ready in the media library.",
      "success"
    );
  }
  if (errors.length) {
    toast(
      errors.length === 1 ? "One file was skipped" : `${errors.length} files were skipped`,
      errors[0]?.message || "The format may not be supported.",
      "warn",
      6000
    );
  }
  if (!assets.length && !errors.length) toast("Nothing imported", "No media files were found.", "warn");
}

function hasFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

let dragDepth = 0;

function bindFileDrop() {
  window.addEventListener("dragenter", (event) => {
    if (!hasFiles(event)) return;
    dragDepth += 1;
    document.body.classList.add("dragging-files");
  });
  window.addEventListener("dragover", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });
  window.addEventListener("dragleave", (event) => {
    if (!hasFiles(event) && !document.body.classList.contains("dragging-files")) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) document.body.classList.remove("dragging-files");
  });
  window.addEventListener("drop", (event) => {
    dragDepth = 0;
    document.body.classList.remove("dragging-files");
    if (!hasFiles(event)) return;
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files || []);
    const paths = files.map((file) => window.vidit.pathForFile(file)).filter(Boolean);
    importPaths(paths);
  });
}

/* ------------------------------- Timeline ops ------------------------------ */

function trackForAsset(asset) {
  const project = store.project;
  if (!asset) return null;
  if (asset.type === "audio") {
    return project.tracks.find((track) => track.kind === "audio" && !track.locked) || null;
  }
  const videoTracks = project.tracks.filter((track) => track.kind === "video" && !track.locked);
  return videoTracks.length ? videoTracks[videoTracks.length - 1] : null;
}

function ensureAudioTrack() {
  const existing = store.project.tracks.find((track) => track.kind === "audio" && !track.locked);
  if (existing) return existing.id;
  return store.addTrack("audio");
}

function ensureVideoTrack() {
  const existing = [...store.project.tracks].reverse().find((track) => track.kind === "video" && !track.locked);
  if (existing) return existing.id;
  return store.addTrack("video");
}

function addAssetToTimeline(assetOrId) {
  const asset = typeof assetOrId === "string" ? store.getAsset(assetOrId) : assetOrId;
  if (!asset) return;
  let track = trackForAsset(asset);
  if (!track) {
    const kind = asset.type === "audio" ? "audio" : "video";
    const trackId = store.addTrack(kind);
    track = store.getTrack(trackId);
  }
  if (!track || track.locked) {
    toast("No free track", "Unlock a compatible track or add a new one.", "warn");
    return;
  }
  const clip = store.addAssetClip(asset.id, track.id, store.playhead);
  if (!clip) {
    toast("Could not add clip", "That media type does not fit this track.", "warn");
    return;
  }
  store.selectClip(clip.id);
  toast("Added to timeline", `${asset.name} · ${track.name}`, "success");
}

function handleDropAsset(assetId, trackId, time) {
  const asset = store.getAsset(assetId);
  const track = store.getTrack(trackId);
  if (!asset || !track) return;
  if (track.locked) {
    toast("Track locked", "Unlock the track before dropping clips.", "warn");
    return;
  }
  const compatible =
    track.kind === "audio"
      ? asset.type === "audio" || asset.type === "video"
      : track.kind === "video"
        ? asset.type === "video" || asset.type === "image"
        : false;
  if (!compatible) {
    toast("Wrong track", `${asset.name} does not belong on ${track.name}.`, "warn");
    return;
  }
  const clip = store.addAssetClip(asset.id, track.id, Math.max(0, Number(time) || 0), { atGap: true });
  if (!clip) return;
  store.selectClip(clip.id);
  store.setPlayhead(clip.start + Math.min(0.06, clip.duration / 2));
  toast("Clip added", `${asset.name} · ${track.name}`, "success");
}

function addTextClip(presetId = "display") {
  const clip = store.addTextClip(presetId);
  if (!clip) return;
  store.setPlayhead(clip.start + Math.min(0.06, clip.duration / 2));
  toast(
    presetId === "plain" ? "Text added" : "Title added",
    "Edit the words in the inspector.",
    "success"
  );
}

function addStickerClip(emoji) {
  const clip = store.addStickerClip(emoji);
  if (!clip) return;
  store.setPlayhead(clip.start + Math.min(0.06, clip.duration / 2));
  toast("Sticker added", "Drag or resize it from the inspector.", "success");
}

function applyEffect(effectId) {
  const clip = store.selectedClip;
  if (!clip || !["video", "image", "text", "sticker"].includes(clip.type)) {
    toast("Select a visual clip first", "Effects apply to video, images, text and stickers.", "warn");
    return;
  }
  store.applyEffect(effectId);
  const label = effectId === "none" ? "Original look" : "Effect applied";
  toast(label, clip.name, "success");
}

function applyTransition(transition) {
  const clip = store.selectedClip;
  if (!clip || clip.type === "audio") {
    toast("Select a visual clip first", "Transitions animate how a clip enters the cut.", "warn");
    return;
  }
  store.applyTransition(transition);
  toast(
    transition.id === "none" ? "Transition removed" : "Transition applied",
    transition.id === "none" ? clip.name : `${transition.name} · ${transition.duration || 0.65}s`,
    "success"
  );
}

function splitAtPlayhead() {
  if (!store.selectedClipId) {
    toast("Nothing selected", "Select the clip you want to cut.", "warn");
    return;
  }
  if (!store.splitSelected(store.playhead)) {
    toast("Cannot split here", "Place the playhead inside the selected clip.", "warn");
  }
}

function deleteClip(clip) {
  const target = clip || store.selectedClip;
  if (!target) return;
  const found = store.getClipWithTrack(target.id);
  if (!found) return;
  if (found.track.locked) {
    toast("Track locked", "Unlock the track before deleting clips.", "warn");
    return;
  }
  store.selectClip(target.id);
  if (!store.deleteSelected()) toast("Delete failed", "The clip could not be removed.", "error");
}

function insertRippleClip(asset, trackId, start, duration) {
  const track = store.getTrack(trackId);
  if (!track || track.locked) return null;
  let clipId = null;
  store.edit(() => {
    const clip = createAssetClip(asset, track, Math.max(0, Number(start) || 0));
    if (duration > 0) clip.duration = duration;
    for (const other of track.clips) {
      if (other.start >= clip.start - 0.001) other.start += clip.duration;
    }
    track.clips.push(clip);
    sortTrack(track);
    clipId = clip.id;
  }, "Insert clip", "project");
  if (clipId) store.selectClip(clipId);
  return clipId;
}

/* ------------------------------- Media tools ------------------------------- */

async function extractAudioFromSelection() {
  const clip = store.selectedClip;
  const asset = clip?.assetId
    ? store.getAsset(clip.assetId)
    : store.selectedAsset;
  if (!asset) {
    toast("Select a video first", "Choose a video clip or media asset with sound.", "warn");
    return;
  }
  if (asset.type === "image" || (!asset.hasAudio && asset.type !== "audio")) {
    toast("No audio to extract", `${asset.name} has no sound track.`, "warn");
    return;
  }
  await extractAudioFromAsset(asset, clip && clip.type === "video" ? clip : null);
}

async function extractAudioFromAsset(asset, clip = null) {
  if (!asset) return;
  if (asset.type === "image") {
    toast("No audio to extract", `${asset.name} is an image.`, "warn");
    return;
  }
  if (!asset.hasAudio && asset.type !== "audio") {
    toast("No audio to extract", `${asset.name} has no sound track.`, "warn");
    return;
  }
  let range = {};
  if (clip) {
    const speed = clamp(Number(clip.speed) || 1, 0.25, 4);
    range = {
      start: Math.max(0, Number(clip.trimIn) || 0),
      duration: Math.max(0.05, (Number(clip.duration) || 0) * speed)
    };
  }
  toast("Extracting audio…", asset.name, "info", 2400);
  try {
    const audio = await window.vidit.extractAudio(asset, range);
    if (!audio) throw new Error("The audio file could not be created.");
    store.addAssets([audio]);
    const trackId = ensureAudioTrack();
    const start = clip ? clip.start : store.playhead;
    if (trackId) store.addAssetClip(audio.id, trackId, start, { atGap: true });
    toast("Audio extracted", `${audio.name} added to the timeline.`, "success");
  } catch (err) {
    toast("Extraction failed", err?.message || String(err), "error", 5000);
  }
}

async function freezeFrameFromAsset(asset, clip = null) {
  if (!asset || asset.type !== "video") {
    toast("Select a video first", "Freeze frames come from video clips.", "warn");
    return;
  }
  const duration = Math.max(0.001, Number(asset.duration) || 0);
  let sourceTime = Math.min(duration / 2, Math.max(0, duration - 0.04));
  if (clip) {
    const local = clamp(store.playhead - (Number(clip.start) || 0), 0, Number(clip.duration) || 0);
    sourceTime = clamp(
      (Number(clip.trimIn) || 0) + local * clamp(Number(clip.speed) || 1, 0.25, 4),
      0,
      Math.max(0, duration - 0.04)
    );
  }
  try {
    const image = await window.vidit.extractFrame(asset, sourceTime);
    if (!image) throw new Error("The frame could not be captured.");
    store.addAssets([image]);
    if (clip) {
      const found = store.getClipWithTrack(clip.id);
      const track = found?.track;
      if (track && !track.locked) {
        insertRippleClip(
          image,
          track.id,
          clamp(store.playhead, clip.start, Math.max(clip.start, clipEnd(clip) - 0.05)),
          Math.min(3, Math.max(1, Number(clip.duration) || 2))
        );
      } else {
        addAssetToTimeline(image);
      }
    } else {
      addAssetToTimeline(image);
    }
    toast("Freeze frame added", `${formatShort(sourceTime)} from ${asset.name}`, "success");
  } catch (err) {
    toast("Freeze failed", err?.message || String(err), "error", 5000);
  }
}

async function revealAsset(asset) {
  if (!asset?.path) return;
  try {
    await window.vidit.showItem(asset.path);
  } catch (err) {
    toast("Could not reveal file", err?.message || String(err), "error");
  }
}

async function removeAsset(asset) {
  if (!asset) return;
  const used = store.project.tracks.reduce(
    (sum, track) => sum + track.clips.filter((clip) => clip.assetId === asset.id).length,
    0
  );
  const choice = await ask({
    kicker: "Media",
    title: "Remove this media?",
    body:
      `<p class="modal-copy"><strong>${escapeHtml(asset.name)}</strong> will be removed from the project library. ` +
      (used
        ? `This also removes ${used} timeline ${used === 1 ? "clip" : "clips"}.`
        : "No timeline clips use this file.") +
      `</p><p class="modal-copy">The original file on disk is never deleted.</p>`,
    actions:
      `<button class="btn-ghost" type="button" data-action="cancel">Cancel</button>` +
      `<button class="btn-danger" type="button" data-action="remove">Remove media</button>`
  });
  if (choice !== "remove") return;
  store.removeAsset(asset.id);
  toast("Media removed", asset.name, "success");
}

/* ------------------------------ Track menus -------------------------------- */

function openAddTrackMenu(anchor) {
  const rect = anchor?.getBoundingClientRect?.() || {
    left: window.innerWidth / 2,
    bottom: window.innerHeight / 2
  };
  showContextMenu(
    [
      {
        label: "Add video track",
        action: () => {
          store.addTrack("video");
          toast("Video track added", "Drop footage onto the new lane.", "success");
        }
      },
      {
        label: "Add audio track",
        action: () => {
          store.addTrack("audio");
          toast("Audio track added", "Music and voiceovers can go here.", "success");
        }
      },
      {
        label: "Add text track",
        action: () => {
          store.addTrack("text");
          toast("Text track added", "Titles and stickers stack here.", "success");
        }
      }
    ],
    rect.left,
    rect.bottom + 4
  );
}

function openRenameTrack(track) {
  if (!track) return;
  modal.open({
    kicker: "Tracks",
    title: "Rename track",
    body:
      `<div class="field"><div class="field-head"><span class="field-label">Track name</span></div>` +
      `<input class="text-input" id="trackNameInput" maxlength="30" value="${escapeHtml(track.name)}" data-autofocus /></div>`,
    actions:
      `<button class="btn-ghost" type="button" data-action="cancel">Cancel</button>` +
      `<button class="btn-primary" type="button" data-action="rename">Rename</button>`
  });
  const input = modal.body.querySelector("#trackNameInput");
  const apply = () => {
    const value = input?.value.trim();
    if (!value) return;
    store.renameTrack(track.id, value);
    modal.close();
  };
  modal.onAction = (action) => {
    if (action === "rename") apply();
    else if (action === "cancel") modal.close();
  };
  modal.body.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      apply();
    }
  };
  if (input) {
    input.focus();
    input.select();
  }
}

async function removeTrack(track) {
  if (!track) return;
  const clipCount = track.clips.length;
  const choice = await ask({
    kicker: "Tracks",
    title: `Remove ${track.name}?`,
    body:
      `<p class="modal-copy">` +
      (clipCount
        ? `This track contains ${clipCount} ${clipCount === 1 ? "clip" : "clips"}. They will be removed too.`
        : "This track is empty.") +
      `</p>`,
    actions:
      `<button class="btn-ghost" type="button" data-action="cancel">Cancel</button>` +
      `<button class="btn-danger" type="button" data-action="remove">Remove track</button>`
  });
  if (choice !== "remove") return;
  if (!store.removeTrack(track.id)) {
    toast("Cannot remove track", "A project needs at least one track.", "warn");
    return;
  }
  toast("Track removed", track.name, "success");
}

/* ------------------------------ Context menus ------------------------------ */

let closeContextMenu = null;

function hideContextMenu() {
  if (closeContextMenu) {
    const fn = closeContextMenu;
    closeContextMenu = null;
    fn();
  }
  if (dom.contextMenu) dom.contextMenu.hidden = true;
}

function showContextMenu(items, x, y) {
  hideContextMenu();
  const menu = dom.contextMenu;
  if (!menu) return;
  const list = items.filter(Boolean);
  menu.innerHTML = list
    .map((item, index) => {
      if (item.separator) return `<div class="popover-rule"></div>`;
      return (
        `<button type="button" data-menu-index="${index}" class="${item.danger ? "danger" : ""}" ${
          item.disabled ? "disabled" : ""
        }>` +
        `<span>${escapeHtml(item.label)}</span>` +
        (item.kbd ? `<kbd>${escapeHtml(item.kbd)}</kbd>` : "") +
        `</button>`
      );
    })
    .join("");
  menu.hidden = false;
  menu.style.left = "0px";
  menu.style.top = "0px";
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.round(Math.min(x, window.innerWidth - rect.width - 10))}px`;
  menu.style.top = `${Math.round(Math.min(y, window.innerHeight - rect.height - 10))}px`;

  const onClick = (event) => {
    const button = event.target.closest("[data-menu-index]");
    if (!button || button.disabled) return;
    const item = list[Number(button.dataset.menuIndex)];
    hideContextMenu();
    if (item && typeof item.action === "function") {
      try {
        Promise.resolve(item.action()).catch((err) => {
          toast("Action failed", err?.message || String(err), "error");
        });
      } catch (err) {
        toast("Action failed", err?.message || String(err), "error");
      }
    }
  };
  const close = () => {
    menu.removeEventListener("click", onClick);
    document.removeEventListener("pointerdown", onOutside, true);
    window.removeEventListener("blur", close);
    window.removeEventListener("resize", close);
    window.removeEventListener("scroll", close, true);
  };
  const onOutside = (event) => {
    if (!menu.contains(event.target)) hideContextMenu();
  };
  menu.addEventListener("click", onClick);
  document.addEventListener("pointerdown", onOutside, true);
  window.addEventListener("blur", close);
  window.addEventListener("resize", close);
  window.addEventListener("scroll", close, true);
  closeContextMenu = close;
}

function openClipMenu(clip, x, y) {
  const found = store.getClipWithTrack(clip.id);
  const asset = clip.assetId ? store.getAsset(clip.assetId) : null;
  const track = found?.track;
  const inside = store.playhead > clip.start + 0.08 && store.playhead < clipEnd(clip) - 0.08;
  showContextMenu(
    [
      {
        label: "Split at playhead",
        kbd: "Ctrl B",
        disabled: !inside || Boolean(track?.locked),
        action: () => {
          store.selectClip(clip.id);
          if (!store.splitSelected(store.playhead)) {
            toast("Cannot split here", "Place the playhead inside this clip.", "warn");
          }
        }
      },
      {
        label: "Duplicate",
        kbd: "Ctrl D",
        action: () => {
          store.selectClip(clip.id);
          store.duplicateSelected();
        }
      },
      {
        label: "Copy",
        kbd: "Ctrl C",
        action: () => {
          store.selectClip(clip.id);
          store.copySelected();
          toast("Clip copied", clip.name, "success");
        }
      },
      { separator: true },
      asset && asset.type === "video"
        ? {
            label: "Freeze frame",
            action: () => {
              store.selectClip(clip.id);
              freezeFrameFromAsset(asset, clip);
            }
          }
        : null,
      clip.type === "video" && asset?.hasAudio
        ? {
            label: "Detach audio",
            action: () => {
              store.selectClip(clip.id);
              extractAudioFromAsset(asset, clip);
            }
          }
        : null,
      asset
        ? {
            label: "Reveal source file",
            action: () => revealAsset(asset)
          }
        : null,
      { separator: true },
      {
        label: "Delete clip",
        kbd: "Del",
        danger: true,
        disabled: Boolean(track?.locked),
        action: () => deleteClip(clip)
      }
    ],
    x,
    y
  );
}

function openTrackMenu(track, x, y) {
  showContextMenu(
    [
      {
        label: "Rename track…",
        action: () => openRenameTrack(track)
      },
      {
        label: track.hidden ? "Show track" : "Hide track",
        action: () => store.toggleTrackFlag(track.id, "hidden")
      },
      {
        label: track.muted ? "Unmute track" : "Mute track",
        action: () => store.toggleTrackFlag(track.id, "muted")
      },
      {
        label: track.locked ? "Unlock track" : "Lock track",
        action: () => store.toggleTrackFlag(track.id, "locked")
      },
      { separator: true },
      {
        label: "Remove track",
        danger: true,
        disabled: store.project.tracks.length <= 1,
        action: () => removeTrack(track)
      }
    ],
    x,
    y
  );
}

function openAssetMenu(asset, x, y) {
  if (!asset) return;
  showContextMenu(
    [
      {
        label: "Add to timeline",
        action: () => addAssetToTimeline(asset)
      },
      asset.type === "video" || (asset.hasAudio && asset.type !== "image")
        ? {
            label: "Extract audio",
            action: () => extractAudioFromAsset(asset, null)
          }
        : null,
      asset.type === "video"
        ? {
            label: "Freeze frame",
            action: () => freezeFrameFromAsset(asset, null)
          }
        : null,
      { separator: true },
      {
        label: "Reveal in folder",
        action: () => revealAsset(asset)
      },
      {
        label: "Remove from project",
        danger: true,
        action: () => removeAsset(asset)
      }
    ],
    x,
    y
  );
}

/* ----------------------------- Project menu -------------------------------- */

let closeProjectMenu = null;

function hideProjectMenu() {
  if (closeProjectMenu) {
    const fn = closeProjectMenu;
    closeProjectMenu = null;
    fn();
  }
  if (dom.projectMenu) dom.projectMenu.hidden = true;
  dom.projectMenuBtn?.setAttribute("aria-expanded", "false");
}

function toggleProjectMenu() {
  if (!dom.projectMenu) return;
  if (!dom.projectMenu.hidden) {
    hideProjectMenu();
    return;
  }
  hideContextMenu();
  const rect = dom.projectMenuBtn.getBoundingClientRect();
  dom.projectMenu.hidden = false;
  dom.projectMenu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 260))}px`;
  dom.projectMenu.style.top = `${rect.bottom + 6}px`;
  dom.projectMenuBtn.setAttribute("aria-expanded", "true");
  const onOutside = (event) => {
    if (dom.projectMenu.contains(event.target) || dom.projectMenuBtn.contains(event.target)) return;
    hideProjectMenu();
  };
  const close = () => {
    document.removeEventListener("pointerdown", onOutside, true);
    window.removeEventListener("blur", close);
    window.removeEventListener("resize", close);
  };
  document.addEventListener("pointerdown", onOutside, true);
  window.addEventListener("blur", close);
  window.addEventListener("resize", close);
  closeProjectMenu = close;
}

async function runProjectCommand(command) {
  hideProjectMenu();
  switch (command) {
    case "new":
      await newProject();
      break;
    case "open":
      await openProject();
      break;
    case "save":
      await saveProject();
      break;
    case "save-as":
      await saveProject({ saveAs: true });
      break;
    case "import":
      await importMedia();
      break;
    case "reveal":
      await revealProject();
      break;
    case "shortcuts":
      openShortcuts();
      break;
    case "settings":
      await openSettings();
      break;
    default:
      break;
  }
}

/* ------------------------------ Project settings --------------------------- */

function openProjectSettings() {
  const project = store.project;
  const presets = RESOLUTION_PRESETS.map((preset) => ({
    value: `${preset.width}x${preset.height}`,
    label: `${preset.label} · ${preset.width}×${preset.height} (${preset.ratio})`
  }));
  const current = `${project.settings.width}x${project.settings.height}`;
  if (!presets.some((preset) => preset.value === current)) {
    presets.unshift({ value: current, label: `Current · ${current}` });
  }
  const fpsList = FPS_OPTIONS.includes(Number(project.settings.fps))
    ? FPS_OPTIONS
    : [Number(project.settings.fps), ...FPS_OPTIONS];

  modal.open({
    kicker: "Project",
    title: "Format & canvas",
    body:
      `<div class="field"><div class="field-head"><span class="field-label">Project name</span></div>` +
      `<input class="text-input" data-project-name maxlength="80" value="${escapeHtml(project.name)}" /></div>` +
      `<div class="field"><div class="field-head"><span class="field-label">Frame size preset</span></div>` +
      `<select class="select-input" data-project-preset>` +
      presets
        .map(
          (preset) =>
            `<option value="${escapeHtml(preset.value)}" ${preset.value === current ? "selected" : ""}>${escapeHtml(
              preset.label
            )}</option>`
        )
        .join("") +
      `</select></div>` +
      `<div class="field-row">` +
      `<div class="field" style="flex:1"><div class="field-head"><span class="field-label">Width</span><span class="field-value">px</span></div>` +
      `<input class="number-input" style="width:100%" type="number" min="320" max="7680" step="2" data-project-width value="${project.settings.width}" /></div>` +
      `<div class="field" style="flex:1"><div class="field-head"><span class="field-label">Height</span><span class="field-value">px</span></div>` +
      `<input class="number-input" style="width:100%" type="number" min="320" max="7680" step="2" data-project-height value="${project.settings.height}" /></div>` +
      `</div>` +
      `<div class="field"><div class="field-head"><span class="field-label">Frame rate</span></div>` +
      `<select class="select-input" data-project-fps>` +
      fpsList
        .map(
          (fps) =>
            `<option value="${fps}" ${Number(fps) === Number(project.settings.fps) ? "selected" : ""}>${fps} fps</option>`
        )
        .join("") +
      `</select></div>` +
      `<div class="field"><div class="field-head"><span class="field-label">Canvas background</span></div>` +
      `<div class="color-field"><input type="color" data-project-background value="${escapeHtml(
        /^#[0-9a-f]{6}$/i.test(project.settings.background) ? project.settings.background : "#0b0e0e"
      )}" /><span>${escapeHtml(String(project.settings.background || "#0b0e0e").toUpperCase())}</span></div></div>` +
      `<p class="modal-copy">Existing clips keep their positions. Change the canvas before fine-tuning titles so they land at the right size.</p>`,
    actions:
      `<button class="btn-ghost" type="button" data-action="cancel">Cancel</button>` +
      `<button class="btn-primary" type="button" data-action="apply">Apply format</button>`,
    width: ""
  });

  const nameInput = modal.body.querySelector("[data-project-name]");
  const presetSelect = modal.body.querySelector("[data-project-preset]");
  const widthInput = modal.body.querySelector("[data-project-width]");
  const heightInput = modal.body.querySelector("[data-project-height]");
  const fpsSelect = modal.body.querySelector("[data-project-fps]");
  const backgroundInput = modal.body.querySelector("[data-project-background]");
  const swatch = backgroundInput?.closest(".color-field")?.querySelector("span");

  presetSelect?.addEventListener("change", () => {
    const [width, height] = String(presetSelect.value).split("x").map(Number);
    if (Number.isFinite(width) && Number.isFinite(height)) {
      widthInput.value = String(width);
      heightInput.value = String(height);
    }
  });
  backgroundInput?.addEventListener("input", () => {
    if (swatch) swatch.textContent = String(backgroundInput.value).toUpperCase();
  });

  modal.onAction = (action) => {
    if (action === "cancel") {
      modal.close();
      return;
    }
    if (action !== "apply") return;
    const width = clamp(Math.round((Number(widthInput?.value) || 1920) / 2) * 2, 320, 7680);
    const height = clamp(Math.round((Number(heightInput?.value) || 1080) / 2) * 2, 320, 7680);
    const fps = clamp(Number(fpsSelect?.value) || 30, 1, 120);
    const name = String(nameInput?.value || "").trim().slice(0, 80) || "Untitled edit";
    const background = /^#[0-9a-f]{6}$/i.test(backgroundInput?.value || "")
      ? backgroundInput.value
      : "#0b0e0e";
    store.edit(() => {
      store.project.name = name;
      store.project.settings.width = width;
      store.project.settings.height = height;
      store.project.settings.fps = fps;
      store.project.settings.background = background;
    }, "Project settings", "project");
    updateChrome();
    modal.close();
    toast("Project format updated", `${width} × ${height} · ${fps} fps`, "success");
  };
}

/* --------------------------------- Settings -------------------------------- */

function toolBadge(tool) {
  if (!tool) {
    return `<span class="tool-status missing"><span class="status-dot"></span>Not found</span>`;
  }
  const version = String(tool.version || "Detected").split("\n")[0].slice(0, 54);
  return `<span class="tool-status"><span class="status-dot"></span>${escapeHtml(version)}</span>`;
}

async function openSettings() {
  let settings = { ffmpegPath: "", ffprobePath: "" };
  let tools = appInfo?.tools || null;
  try {
    const result = await window.vidit.getSettings();
    settings = result?.settings || settings;
    tools = result?.tools || tools;
    if (appInfo) appInfo.tools = tools;
  } catch (err) {
    toast("Could not read settings", err?.message || String(err), "error");
  }

  const render = (currentSettings, currentTools) => {
    const readPaths = () => ({
      ffmpegPath: String(modal.body.querySelector("[data-setting-ffmpeg]")?.value || "").trim(),
      ffprobePath: String(modal.body.querySelector("[data-setting-ffprobe]")?.value || "").trim()
    });
    modal.setBody(
      `<div class="setting-row"><div><div class="setting-label">FFmpeg</div>` +
      `<div class="setting-help">Used for thumbnails, waveforms, audio extraction and final exports. Leave the path empty to search PATH and common install folders.</div></div>` +
      `<div class="setting-value">${toolBadge(currentTools?.ffmpeg)}</div></div>` +
      `<div class="field"><div class="field-head"><span class="field-label">FFmpeg executable</span></div>` +
      `<div class="path-field"><input class="text-input" data-setting-ffmpeg placeholder="Auto-detect from PATH" value="${escapeHtml(
        currentSettings?.ffmpegPath || ""
      )}" /></div></div>` +
      `<div class="setting-row"><div><div class="setting-label">FFprobe</div>` +
      `<div class="setting-help">Reads duration, dimensions, frame rate and audio streams when media is imported.</div></div>` +
      `<div class="setting-value">${toolBadge(currentTools?.ffprobe)}</div></div>` +
      `<div class="field"><div class="field-head"><span class="field-label">FFprobe executable</span></div>` +
      `<div class="path-field"><input class="text-input" data-setting-ffprobe placeholder="Auto-detect from PATH" value="${escapeHtml(
        currentSettings?.ffprobePath || ""
      )}" /></div></div>` +
      (appInfo
        ? `<div class="about-block"><div class="about-mark"><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" fill="none"/><path d="m8 8 8 8M16 8l-8 8"/></svg></div>` +
          `<h3>Vidit</h3><p>Version ${escapeHtml(appInfo.appVersion || "0.1.0")} · Electron ${escapeHtml(
            appInfo.electron || ""
          )}</p>` +
          `<p>Local-first editing. Nothing is uploaded.</p></div>`
        : "")
    );
    modal.setActions(
      `<button class="btn-ghost" type="button" data-action="close">Close</button>` +
        `<button class="btn-secondary" type="button" data-action="detect">${icon("refresh")}Detect tools</button>` +
        `<button class="btn-primary" type="button" data-action="save">Save settings</button>`
    );
    modal.onAction = async (action, button) => {
      if (action === "close") {
        modal.close();
        return;
      }
      if (action === "detect") {
        button.disabled = true;
        try {
          const typed = readPaths();
          const detected = await window.vidit.detectTools();
          if (appInfo) appInfo.tools = detected;
          render(typed, detected);
          toast(
            detected?.ffmpeg ? "FFmpeg detected" : "FFmpeg not found",
            detected?.ffmpeg ? "Export is ready." : "Install FFmpeg or set its path manually.",
            detected?.ffmpeg ? "success" : "warn",
            4200
          );
        } catch (err) {
          toast("Detection failed", err?.message || String(err), "error");
          button.disabled = false;
        }
        return;
      }
      if (action === "save") {
        button.disabled = true;
        try {
          const result = await window.vidit.updateSettings(readPaths());
          if (appInfo) appInfo.tools = result?.tools || appInfo.tools;
          render(result?.settings || currentSettings, result?.tools || currentTools);
          toast(
            result?.tools?.ffmpeg ? "Settings saved" : "Settings saved · FFmpeg missing",
            result?.tools?.ffmpeg ? "Export is ready." : "Set the FFmpeg path to enable export.",
            result?.tools?.ffmpeg ? "success" : "warn",
            4200
          );
        } catch (err) {
          toast("Could not save settings", err?.message || String(err), "error");
          button.disabled = false;
        }
      }
    };
  };

  modal.open({
    kicker: "Vidit",
    title: "Settings",
    body: "",
    actions: "",
    width: ""
  });
  render(settings, tools);
}

/* -------------------------------- Shortcuts -------------------------------- */

const SHORTCUT_GROUPS = [
  {
    title: "Project",
    rows: [
      ["New project", "Ctrl N"],
      ["Open project", "Ctrl O"],
      ["Save", "Ctrl S"],
      ["Save as", "Ctrl ⇧ S"],
      ["Import media", "Ctrl I"],
      ["Settings", "Ctrl ,"],
      ["Keyboard shortcuts", "?"]
    ]
  },
  {
    title: "Editing",
    rows: [
      ["Undo", "Ctrl Z"],
      ["Redo", "Ctrl ⇧ Z"],
      ["Split at playhead", "Ctrl B"],
      ["Duplicate clip", "Ctrl D"],
      ["Copy clip", "Ctrl C"],
      ["Paste clip", "Ctrl V"],
      ["Delete selection", "Del"],
      ["Select tool", "V"],
      ["Blade tool", "B"],
      ["Toggle snapping", "S"]
    ]
  },
  {
    title: "Playback",
    rows: [
      ["Play / pause", "Space"],
      ["Previous / next frame", ", ."],
      ["Jump 1 second", "⇧ ← →"],
      ["Go to start / end", "Home End"],
      ["Loop preview", "L"]
    ]
  },
  {
    title: "Timeline",
    rows: [
      ["Zoom in / out", "Ctrl + −"],
      ["Fit timeline", "F"],
      ["Scroll timeline", "Wheel"],
      ["Zoom under cursor", "Ctrl Wheel"],
      ["Close menu / dialog", "Esc"]
    ]
  }
];

function shortcutKeys(label) {
  const parts = String(label).split(" ");
  return `<span class="shortcut-key">${parts
    .map((part) => `<kbd class="key">${escapeHtml(part)}</kbd>`)
    .join("")}</span>`;
}

function openShortcuts() {
  modal.open({
    kicker: "Reference",
    title: "Keyboard shortcuts",
    body:
      `<div class="shortcut-grid">` +
      SHORTCUT_GROUPS.map(
        (group) =>
          `<div class="shortcut-group"><h4>${escapeHtml(group.title)}</h4>` +
          group.rows
            .map(
              ([label, keys]) =>
                `<div class="shortcut-row"><span>${escapeHtml(label)}</span>${shortcutKeys(keys)}</div>`
            )
            .join("") +
          `</div>`
      ).join("") +
      `</div>`,
    actions: `<button class="btn-primary" type="button" data-action="close">Done</button>`,
    width: "wide"
  });
  modal.onAction = (action) => {
    if (action === "close") modal.close();
  };
}

/* ------------------------------- Voice recorder ---------------------------- */

function openVoiceRecorder() {
  const state = {
    disposed: false,
    recording: false,
    saving: false,
    error: "",
    chunks: [],
    recorder: null,
    stream: null,
    blob: null,
    url: "",
    startedAt: 0,
    duration: 0,
    timer: null,
    mime: ""
  };

  const cleanup = () => {
    state.disposed = true;
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
    if (state.recorder && state.recorder.state !== "inactive") {
      try {
        state.recorder.onstop = null;
        state.recorder.stop();
      } catch {
        /* noop */
      }
    }
    state.recorder = null;
    if (state.stream) {
      for (const track of state.stream.getTracks()) {
        try {
          track.stop();
        } catch {
          /* noop */
        }
      }
    }
    state.stream = null;
    if (state.url) URL.revokeObjectURL(state.url);
    state.url = "";
  };

  const render = () => {
    const elapsed = state.recording
      ? (performance.now() - state.startedAt) / 1000
      : state.duration;
    const hint = state.error
      ? state.error
      : state.recording
        ? "Recording. Click the button again to stop."
        : state.blob
          ? "Take ready. Save it to add a voiceover clip at the playhead."
          : "Click to record from your microphone. Vidit keeps the audio on this computer.";
    modal.setBody(
      `<div class="voice-stage">` +
        `<button class="record-orb ${state.recording ? "recording" : ""}" type="button" data-recorder="toggle" title="${
          state.recording ? "Stop recording" : "Start recording"
        }" ${state.saving ? "disabled" : ""}>${icon(state.recording ? "stop" : "record")}</button>` +
        `<div class="record-time" data-record-time>${formatClock(elapsed, { tenths: true })}</div>` +
        `<div class="record-levels">${Array.from({ length: 24 }, (_, index) => {
          const height = state.recording
            ? 4 + Math.abs(Math.sin(elapsed * 6 + index * 0.7)) * 24
            : 4;
          return `<span style="height:${height.toFixed(1)}px"></span>`;
        }).join("")}</div>` +
        `<p class="record-hint">${escapeHtml(hint)}</p>` +
        (state.blob && state.url
          ? `<audio controls src="${state.url}" style="width:100%;margin-top:10px"></audio>`
          : "") +
        (state.error ? `<div class="modal-error">${icon("alert")}<span>${escapeHtml(state.error)}</span></div>` : "") +
        `</div>`
    );
    modal.setActions(
      `<button class="btn-ghost" type="button" data-action="close">Cancel</button>` +
        (state.blob
          ? `<button class="btn-secondary" type="button" data-action="reset" ${
              state.saving ? "disabled" : ""
            }>Retake</button>`
          : "") +
        `<button class="btn-primary" type="button" data-action="save" ${
          state.blob && !state.saving ? "" : "disabled"
        }>${state.saving ? "Saving…" : "Add voiceover"}</button>`
    );
  };

  const stopStream = () => {
    if (!state.stream) return;
    for (const track of state.stream.getTracks()) {
      try {
        track.stop();
      } catch {
        /* noop */
      }
    }
    state.stream = null;
  };

  const start = async () => {
    if (state.recording || state.saving) return;
    state.error = "";
    if (state.url) URL.revokeObjectURL(state.url);
    state.url = "";
    state.blob = null;
    state.chunks = [];
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone capture is not available.");
      state.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
      const mime = candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";
      state.mime = mime || "audio/webm";
      state.recorder = new MediaRecorder(state.stream, mime ? { mimeType: mime } : undefined);
      state.recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) state.chunks.push(event.data);
      };
      state.recorder.onstop = () => {
        if (state.disposed) return;
        state.recording = false;
        state.duration = Math.max(0.05, (performance.now() - state.startedAt) / 1000);
        state.blob = new Blob(state.chunks, { type: state.mime || "audio/webm" });
        state.url = URL.createObjectURL(state.blob);
        if (state.timer) clearInterval(state.timer);
        state.timer = null;
        stopStream();
        render();
      };
      state.recorder.start();
      state.recording = true;
      state.startedAt = performance.now();
      state.duration = 0;
      state.timer = setInterval(() => {
        const elapsed = (performance.now() - state.startedAt) / 1000;
        const timeEl = modal.body.querySelector("[data-record-time]");
        if (timeEl) timeEl.textContent = formatClock(elapsed, { tenths: true });
        const levels = modal.body.querySelectorAll(".record-levels span");
        levels.forEach((span, index) => {
          span.style.height = `${(4 + Math.abs(Math.sin(elapsed * 6 + index * 0.7)) * 24).toFixed(1)}px`;
        });
      }, 110);
      render();
    } catch (err) {
      state.error =
        err?.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow access in your system settings and try again."
          : err?.message || "Could not start recording.";
      state.recording = false;
      stopStream();
      render();
    }
  };

  const stop = () => {
    if (!state.recording || !state.recorder) return;
    try {
      state.recorder.stop();
    } catch {
      state.recording = false;
      stopStream();
      render();
    }
  };

  const reset = () => {
    if (state.recording) stop();
    if (state.url) URL.revokeObjectURL(state.url);
    state.url = "";
    state.blob = null;
    state.chunks = [];
    state.duration = 0;
    state.error = "";
    render();
  };

  const save = async () => {
    if (!state.blob || state.saving) return;
    state.saving = true;
    state.error = "";
    render();
    try {
      const buffer = await state.blob.arrayBuffer();
      const asset = await window.vidit.saveRecording(new Uint8Array(buffer), state.blob.type || "audio/webm");
      if (!asset) throw new Error("The recording could not be saved.");
      store.addAssets([asset]);
      const trackId = ensureAudioTrack();
      if (trackId) store.addAssetClip(asset.id, trackId, store.playhead, { atGap: true });
      modal.close();
      toast("Voiceover added", `${asset.name} · ${formatDuration(state.duration)}`, "success");
    } catch (err) {
      state.saving = false;
      state.error = err?.message || String(err);
      render();
    }
  };

  modal.open({
    kicker: "Sound",
    title: "Record voiceover",
    body: "",
    actions: "",
    width: "narrow",
    dismissible: true,
    onClose: cleanup
  });
  modal.onAction = (action) => {
    if (action === "close") modal.close();
    else if (action === "reset") reset();
    else if (action === "save") save();
  };
  modal.body.onclick = (event) => {
    const button = event.target.closest("[data-recorder]");
    if (!button) return;
    if (state.recording) stop();
    else start();
  };
  render();
}

/* ------------------------------ Layout resizing ---------------------------- */

let layoutSaveTimer = null;

function saveLayout(values) {
  clearTimeout(layoutSaveTimer);
  layoutSaveTimer = setTimeout(() => {
    try {
      localStorage.setItem("vidit.layout", JSON.stringify(values));
    } catch {
      /* noop */
    }
  }, 200);
}

function readLayout() {
  try {
    return JSON.parse(localStorage.getItem("vidit.layout") || "{}") || {};
  } catch {
    return {};
  }
}

function applyStoredLayout() {
  const saved = readLayout();
  const maxLibrary = Math.min(470, window.innerWidth * 0.42);
  const maxInspector = Math.min(460, window.innerWidth * 0.42);
  const maxTimeline = Math.max(200, window.innerHeight - 300);
  if (Number(saved.library)) {
    document.documentElement.style.setProperty(
      "--library-width",
      `${clamp(saved.library, 220, maxLibrary)}px`
    );
  }
  if (Number(saved.inspector)) {
    document.documentElement.style.setProperty(
      "--inspector-width",
      `${clamp(saved.inspector, 240, maxInspector)}px`
    );
  }
  if (Number(saved.timeline)) {
    document.documentElement.style.setProperty(
      "--timeline-height",
      `${clamp(saved.timeline, 200, maxTimeline)}px`
    );
  }
}

function bindResizers() {
  const values = {
    library: dom.libraryPanel?.offsetWidth || 294,
    inspector: dom.inspectorPanel?.offsetWidth || 310,
    timeline: dom.timelinePanel?.offsetHeight || 354
  };
  const saved = readLayout();
  if (Number(saved.library)) values.library = Number(saved.library);
  if (Number(saved.inspector)) values.inspector = Number(saved.inspector);
  if (Number(saved.timeline)) values.timeline = Number(saved.timeline);

  $$("[data-resize]").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const kind = handle.dataset.resize;
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = kind === "library" ? dom.libraryPanel.offsetWidth : dom.inspectorPanel.offsetWidth;
      const startHeight = dom.timelinePanel.offsetHeight;
      handle.classList.add("dragging");
      document.body.style.cursor = kind === "timeline" ? "row-resize" : "col-resize";

      const onMove = (moveEvent) => {
        if (kind === "timeline") {
          const next = clamp(startHeight - (moveEvent.clientY - startY), 200, window.innerHeight - 300);
          values.timeline = next;
          document.documentElement.style.setProperty("--timeline-height", `${next}px`);
        } else if (kind === "library") {
          const next = clamp(startWidth + (moveEvent.clientX - startX), 220, Math.min(470, window.innerWidth * 0.42));
          values.library = next;
          document.documentElement.style.setProperty("--library-width", `${next}px`);
        } else {
          const next = clamp(startWidth - (moveEvent.clientX - startX), 240, Math.min(460, window.innerWidth * 0.42));
          values.inspector = next;
          document.documentElement.style.setProperty("--inspector-width", `${next}px`);
        }
      };
      const onUp = () => {
        handle.classList.remove("dragging");
        document.body.style.cursor = "";
        window.removeEventListener("pointermove", onMove);
        saveLayout(values);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    });
  });
}

/* ---------------------------------- Chrome --------------------------------- */

function bindChrome() {
  dom.projectName?.addEventListener("change", () => {
    const value = dom.projectName.value;
    if (!value.trim()) {
      dom.projectName.value = store.project.name;
      return;
    }
    store.setProjectName(value);
  });
  dom.projectName?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      dom.projectName.blur();
    } else if (event.key === "Escape") {
      dom.projectName.value = store.project.name;
      dom.projectName.blur();
    }
  });

  dom.undoBtn?.addEventListener("click", () => store.undo());
  dom.redoBtn?.addEventListener("click", () => store.redo());

  dom.projectMenuBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleProjectMenu();
  });
  dom.projectMenu?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-command]");
    if (button) runProjectCommand(button.dataset.command);
  });

  dom.settingsBtn?.addEventListener("click", openSettings);
  dom.exportBtn?.addEventListener("click", () => exportDialog.open());
  dom.shortcutsBtn?.addEventListener("click", openShortcuts);

  dom.minimizeBtn?.addEventListener("click", () => window.vidit.minimize());
  dom.maximizeBtn?.addEventListener("click", () => window.vidit.toggleMaximize());
  dom.closeBtn?.addEventListener("click", requestAppClose);
  window.vidit.onMaximized?.((maximized) => {
    const use = dom.maximizeBtn?.querySelector("use");
    if (use) use.setAttribute("href", maximized ? "#i-win-restore" : "#i-win-max");
    if (dom.maximizeBtn) dom.maximizeBtn.title = maximized ? "Restore" : "Maximize";
  });
  window.vidit.isMaximized?.().then((maximized) => {
    const use = dom.maximizeBtn?.querySelector("use");
    if (use) use.setAttribute("href", maximized ? "#i-win-restore" : "#i-win-max");
  });

  $$(".rail-item[data-tab]").forEach((item) => {
    item.addEventListener("click", () => setTab(item.dataset.tab));
  });
  dom.emptyImportBtn?.addEventListener("click", importMedia);
  dom.safeAreaBtn?.addEventListener("click", () => {
    const visible = dom.safeArea?.classList.toggle("visible");
    dom.safeAreaBtn.classList.toggle("active", Boolean(visible));
  });
  dom.fullscreenPreviewBtn?.addEventListener("click", async () => {
    try {
      const fullscreen = await window.vidit.toggleFullscreen();
      dom.fullscreenPreviewBtn.classList.toggle("active", Boolean(fullscreen));
      dom.fullscreenPreviewBtn.title = fullscreen ? "Exit full screen" : "Full screen preview";
    } catch {
      /* noop */
    }
  });

  dom.playBtn?.addEventListener("click", () => preview.toggle());
  dom.jumpStartBtn?.addEventListener("click", () => seekTo(0));
  dom.jumpEndBtn?.addEventListener("click", () => seekTo(store.duration));
  dom.stepBackBtn?.addEventListener("click", () => stepFrame(-1));
  dom.stepForwardBtn?.addEventListener("click", () => stepFrame(1));

  const savedVolume = Number(localStorage.getItem("vidit.volume"));
  const volume = Number.isFinite(savedVolume) ? clamp(savedVolume, 0, 100) : 100;
  const muted = localStorage.getItem("vidit.muted") === "1";
  if (dom.masterVolume) dom.masterVolume.value = String(volume);
  preview.setVolume(volume);
  preview.setMuted(muted);
  dom.muteMasterBtn?.classList.toggle("muted", muted);
  dom.masterVolume?.addEventListener("input", () => {
    const value = clamp(Number(dom.masterVolume.value) || 0, 0, 100);
    preview.setVolume(value);
    try {
      localStorage.setItem("vidit.volume", String(value));
    } catch {
      /* noop */
    }
  });
  dom.muteMasterBtn?.addEventListener("click", () => {
    const next = !preview.muted;
    preview.setMuted(next);
    dom.muteMasterBtn.classList.toggle("muted", next);
    try {
      localStorage.setItem("vidit.muted", next ? "1" : "0");
    } catch {
      /* noop */
    }
  });
  dom.loopBtn?.addEventListener("click", () => {
    preview.setLoop(!preview.loop);
    dom.loopBtn.classList.toggle("active", Boolean(preview.loop));
  });

  dom.selectToolBtn?.addEventListener("click", () => store.setTool("select"));
  dom.bladeToolBtn?.addEventListener("click", () => store.setTool("blade"));
  dom.snapBtn?.addEventListener("click", () => store.setSnap(!store.snap));
  dom.splitBtn?.addEventListener("click", splitAtPlayhead);
  dom.duplicateBtn?.addEventListener("click", () => {
    if (!store.duplicateSelected()) toast("Nothing to duplicate", "Select a clip first.", "warn");
  });
  dom.deleteBtn?.addEventListener("click", () => deleteClip());
  dom.addTrackBtn?.addEventListener("click", () => openAddTrackMenu(dom.addTrackBtn));
  dom.cornerAddTrack?.addEventListener("click", () => openAddTrackMenu(dom.cornerAddTrack));
  dom.zoomOutBtn?.addEventListener("click", () => timeline.zoomBy(0.75));
  dom.zoomInBtn?.addEventListener("click", () => timeline.zoomBy(1.35));
  dom.fitTimelineBtn?.addEventListener("click", () => timeline.fit());

  document.addEventListener("keydown", handleKeyDown);
  bindFileDrop();
  bindResizers();
}

/* -------------------------------- Keyboard -------------------------------- */

function handleKeyDown(event) {
  if (modal.isOpen) return;
  if (isTypingTarget(event.target)) return;
  const ctrl = event.ctrlKey || event.metaKey;
  const key = event.key;

  if (key === "Escape") {
    hideProjectMenu();
    hideContextMenu();
    return;
  }
  if (key === " " && event.target.closest?.("button")) return;

  if (ctrl) {
    const lower = key.toLowerCase();
    if (lower === "n") {
      event.preventDefault();
      newProject();
      return;
    }
    if (lower === "o") {
      event.preventDefault();
      openProject();
      return;
    }
    if (lower === "s") {
      event.preventDefault();
      saveProject({ saveAs: event.shiftKey });
      return;
    }
    if (lower === "i") {
      event.preventDefault();
      importMedia();
      return;
    }
    if (lower === "z") {
      event.preventDefault();
      if (event.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if (lower === "y") {
      event.preventDefault();
      store.redo();
      return;
    }
    if (lower === "b") {
      event.preventDefault();
      splitAtPlayhead();
      return;
    }
    if (lower === "d") {
      event.preventDefault();
      if (!store.duplicateSelected()) toast("Nothing to duplicate", "Select a clip first.", "warn");
      return;
    }
    if (lower === "c") {
      if (store.copySelected()) toast("Clip copied", store.selectedClip?.name || "", "success");
      return;
    }
    if (lower === "v") {
      if (!store.pasteClip()) toast("Nothing to paste", "Copy a clip first.", "warn");
      return;
    }
    if (key === "+" || key === "=") {
      event.preventDefault();
      timeline.zoomBy(1.35);
      return;
    }
    if (key === "-" || key === "_") {
      event.preventDefault();
      timeline.zoomBy(0.75);
      return;
    }
    if (key === ",") {
      event.preventDefault();
      openSettings();
      return;
    }
    return;
  }

  if (key === "?") {
    event.preventDefault();
    openShortcuts();
    return;
  }
  if (key === " ") {
    event.preventDefault();
    preview.toggle();
    return;
  }
  if (key === "Home") {
    event.preventDefault();
    seekTo(0);
    return;
  }
  if (key === "End") {
    event.preventDefault();
    seekTo(store.duration);
    return;
  }
  if (key === "ArrowLeft" || key === "ArrowRight") {
    event.preventDefault();
    const direction = key === "ArrowRight" ? 1 : -1;
    const fps = Math.max(1, Number(store.project.settings.fps) || 30);
    seekTo(store.playhead + direction * (event.shiftKey ? 1 : 1 / fps));
    return;
  }
  if (key === "," || key === ".") {
    event.preventDefault();
    stepFrame(key === "." ? 1 : -1);
    return;
  }
  if (key === "Delete" || key === "Backspace") {
    event.preventDefault();
    if (store.selectedClip) {
      deleteClip();
    } else if (store.selectedAsset) {
      removeAsset(store.selectedAsset);
    }
    return;
  }
  if (key.toLowerCase() === "v") {
    store.setTool("select");
    return;
  }
  if (key.toLowerCase() === "b") {
    store.setTool("blade");
    return;
  }
  if (key.toLowerCase() === "s") {
    store.setSnap(!store.snap);
    return;
  }
  if (key.toLowerCase() === "f") {
    timeline.fit();
    return;
  }
  if (key.toLowerCase() === "l") {
    preview.setLoop(!preview.loop);
    dom.loopBtn?.classList.toggle("active", Boolean(preview.loop));
  }
}

/* ---------------------------------- Boot ---------------------------------- */

async function boot() {
  store.subscribe(handleStoreChange);
  bindChrome();
  applyStoredLayout();
  updateChrome();
  updateToolButtons();

  try {
    appInfo = await window.vidit.getInfo();
  } catch {
    appInfo = null;
  }

  if (appInfo?.tools && !appInfo.tools.ffmpeg) {
    setTimeout(() => {
      toast(
        "FFmpeg was not found",
        "Importing and preview work, but export needs FFmpeg. Add its path in Settings.",
        "warn",
        7000
      );
    }, 900);
  }

  try {
    const autosave = await window.vidit.readAutosave();
    if (autosave?.project) {
      const clipCount = (autosave.project.tracks || []).reduce(
        (sum, track) => sum + (track.clips || []).length,
        0
      );
      const assetCount = (autosave.project.assets || []).length;
      const newer = Number(autosave.savedAt) > Number(autosave.project.savedAt || 0) + 1500;
      if ((clipCount || assetCount) && newer) {
        const choice = await ask({
          kicker: "Recovery",
          title: "Recover unsaved work?",
          body:
            `<p class="modal-copy">Vidit found an autosave of <strong>${escapeHtml(
              autosave.project.name || "Untitled edit"
            )}</strong> from ${escapeHtml(
              new Date(Number(autosave.savedAt) || Date.now()).toLocaleString()
            )}. It contains ${assetCount} media ${assetCount === 1 ? "asset" : "assets"} and ${clipCount} timeline ${
              clipCount === 1 ? "clip" : "clips"
            }.</p>`,
          actions:
            `<button class="btn-ghost" type="button" data-action="discard">Discard</button>` +
            `<button class="btn-primary" type="button" data-action="restore">Recover project</button>`
        });
        if (choice === "restore") {
          let filePath = autosave.filePath || null;
          if (filePath) {
            try {
              await window.vidit.openProjectPath(filePath);
            } catch {
              filePath = null;
              try {
                await window.vidit.resetProjectPath();
              } catch {
                /* noop */
              }
            }
          }
          loadProject(autosave.project, filePath, { dirty: true });
          toast("Work recovered", autosave.project.name || "Autosave restored", "success");
        } else if (choice === "discard") {
          try {
            await window.vidit.clearAutosave();
          } catch {
            /* noop */
          }
        }
      }
    }
  } catch {
    /* recovery is best-effort */
  }
}

boot();

// Development/testing handle. The renderer only ever loads local files, so this
// does not widen the production attack surface.
window.__viditDebug = {
  store,
  preview,
  timeline,
  library,
  inspector,
  exportDialog,
  modal,
  toast,
  setTab,
  seekTo,
  addTextClip,
  addStickerClip,
  addAssetToTimeline,
  applyEffect,
  applyTransition,
  saveProject,
  openSettings,
  buildTextImages,
  get appInfo() {
    return appInfo;
  }
};
