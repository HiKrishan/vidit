import {
  clipEnd,
  clipKeyframeTimes,
  clipSummary,
  isTrackCompatible,
  sortedClips,
  sortTrack,
  trackIcon,
  trackLabel,
  trackClipType
} from "./model.js";
import { clamp, cssUrl, escapeHtml, formatShort, icon, throttleRaf } from "./utils.js";

const TRACK_HEIGHT = 58;
const RULER_HEIGHT = 30;
const SNAP_PX = 7;

function assetFor(store, clip) {
  return clip?.assetId ? store.getAsset(clip.assetId) : null;
}

function thumbUrl(asset) {
  if (!asset) return "";
  const file = asset.type === "image" ? asset.path : asset.thumb;
  if (!file) return "";
  try {
    return window.vidit?.mediaUrl ? window.vidit.mediaUrl(file) : "";
  } catch {
    return "";
  }
}

function waveformSvg(peaks, width) {
  if (!Array.isArray(peaks) || peaks.length < 2) return "";
  const samples = clamp(Math.round(width / 3), 18, 220);
  const points = [];
  for (let i = 0; i < samples; i++) {
    const index = Math.min(peaks.length - 1, Math.floor((i / Math.max(1, samples - 1)) * peaks.length));
    const value = clamp(peaks[index], 0, 1);
    const x = (i / Math.max(1, samples - 1)) * 100;
    const y = 15 - value * 13;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  for (let i = samples - 1; i >= 0; i--) {
    const index = Math.min(peaks.length - 1, Math.floor((i / Math.max(1, samples - 1)) * peaks.length));
    const value = clamp(peaks[index], 0, 1);
    const x = (i / Math.max(1, samples - 1)) * 100;
    const y = 15 + value * 13;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return (
    `<svg class="clip-wave" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">` +
    `<polygon points="${points.join(" ")}" fill="currentColor" opacity="0.28"></polygon>` +
    `<polyline points="${points.slice(0, samples).join(" ")}" fill="none" stroke="currentColor" stroke-width="0.85" vector-effect="non-scaling-stroke"></polyline>` +
    `</svg>`
  );
}

export class Timeline {
  constructor({
    store,
    heads,
    ruler,
    lanes,
    playhead,
    scroll,
    content,
    dropIndicator,
    zoomRange,
    selectionHint,
    hint,
    onSeek,
    onSplit,
    onSelect,
    onAddTrack,
    onContextMenu,
    onTrackContext,
    onRenameTrack,
    onDropAsset,
    onToast
  }) {
    this.store = store;
    this.heads = heads;
    this.ruler = ruler;
    this.lanes = lanes;
    this.playheadEl = playhead;
    this.scroll = scroll;
    this.content = content;
    this.dropIndicator = dropIndicator;
    this.zoomRange = zoomRange;
    this.selectionHint = selectionHint;
    this.hint = hint;
    this.onSeek = typeof onSeek === "function" ? onSeek : () => {};
    this.onSplit = typeof onSplit === "function" ? onSplit : () => {};
    this.onSelect = typeof onSelect === "function" ? onSelect : () => {};
    this.onAddTrack = typeof onAddTrack === "function" ? onAddTrack : () => {};
    this.onContextMenu = typeof onContextMenu === "function" ? onContextMenu : () => {};
    this.onTrackContext = typeof onTrackContext === "function" ? onTrackContext : () => {};
    this.onRenameTrack = typeof onRenameTrack === "function" ? onRenameTrack : () => {};
    this.onDropAsset = typeof onDropAsset === "function" ? onDropAsset : () => {};
    this.onToast = typeof onToast === "function" ? onToast : () => {};

    this.pxPerSecond = clamp(store.zoom || 45, 4, 180);
    this.drag = null;
    this.rulerDrag = false;
    this.playing = false;
    this.suppressClick = false;
    this.lastScrollTop = 0;
    this.dragOverTrackId = null;
    this.renderQueued = false;
    this.renderPendingSource = "";

    this.bind();
    this.renderThrottled = throttleRaf(() => this.render());
    this.unsubscribe = this.store.subscribe(({ reason }) => {
      if (["project", "load", "history", "assets", "save"].includes(reason)) {
        this.scheduleRender();
      } else if (reason === "selection") {
        this.updateSelection();
      } else if (reason === "playhead") {
        this.updatePlayhead();
      } else if (reason === "zoom") {
        this.setZoom(this.store.zoom, { fromStore: true });
      } else if (reason === "tool") {
        this.updateToolCursor();
      }
    });

    this.resizeObserver = new ResizeObserver(() => this.scheduleRender());
    this.resizeObserver.observe(this.scroll);
    this.render();
  }

  bind() {
    this.onRulerPointerDown = this.onRulerPointerDown.bind(this);
    this.onRulerPointerMove = this.onRulerPointerMove.bind(this);
    this.onRulerPointerUp = this.onRulerPointerUp.bind(this);
    this.onLanesPointerDown = this.onLanesPointerDown.bind(this);
    this.onWindowPointerMove = this.onWindowPointerMove.bind(this);
    this.onWindowPointerUp = this.onWindowPointerUp.bind(this);
    this.onScroll = this.onScroll.bind(this);

    this.ruler.addEventListener("pointerdown", this.onRulerPointerDown);
    this.lanes.addEventListener("pointerdown", this.onLanesPointerDown);
    this.lanes.addEventListener("contextmenu", (event) => {
      const clipEl = event.target.closest(".clip");
      if (clipEl) {
        event.preventDefault();
        const clip = this.store.getClip(clipEl.dataset.clipId);
        if (clip) {
          this.store.selectClip(clip.id);
          this.onContextMenu(clip, event.clientX, event.clientY);
        }
        return;
      }
      const row = event.target.closest(".track-row");
      if (row) {
        event.preventDefault();
        const track = this.store.getTrack(row.dataset.trackId);
        if (track) this.onTrackContext(track, event.clientX, event.clientY);
      }
    });

    this.heads.addEventListener("click", (event) => {
      const action = event.target.closest("[data-track-action]");
      const head = event.target.closest(".track-head");
      if (!head) return;
      const track = this.store.getTrack(head.dataset.trackId);
      if (!track) return;
      if (!action) return;
      event.stopPropagation();
      const name = action.dataset.trackAction;
      if (name === "menu") {
        this.onTrackContext(track, event.clientX, event.clientY);
      } else if (name === "hidden" || name === "muted" || name === "locked") {
        this.store.toggleTrackFlag(track.id, name);
      }
    });
    this.heads.addEventListener("dblclick", (event) => {
      const head = event.target.closest(".track-head");
      if (!head) return;
      const track = this.store.getTrack(head.dataset.trackId);
      if (track) this.onRenameTrack(track);
    });

    this.lanes.addEventListener("dragover", (event) => this.onExternalDragOver(event));
    this.lanes.addEventListener("dragleave", (event) => this.onExternalDragLeave(event));
    this.lanes.addEventListener("drop", (event) => this.onExternalDrop(event));
    this.scroll.addEventListener("scroll", this.onScroll, { passive: true });
    this.scroll.addEventListener(
      "wheel",
      (event) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        const next = this.pxPerSecond * (event.deltaY > 0 ? 0.9 : 1.1);
        this.store.setZoom(next);
      },
      { passive: false }
    );

    if (this.zoomRange) {
      this.zoomRange.value = String(this.pxPerSecond);
      this.zoomRange.addEventListener("input", () => {
        this.store.setZoom(Number(this.zoomRange.value));
      });
    }
  }

  scheduleRender(source = "") {
    if (source) this.renderPendingSource = source;
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  render() {
    const project = this.store.project;
    const tracks = project.tracks || [];
    const duration = this.store.duration;
    const viewportWidth = Math.max(100, this.scroll.clientWidth);
    const contentDuration = Math.max(duration + 6, viewportWidth / this.pxPerSecond);
    const width = Math.max(viewportWidth, Math.ceil(contentDuration * this.pxPerSecond));
    this.content.style.width = `${width}px`;
    this.content.style.minHeight = `${RULER_HEIGHT + tracks.length * TRACK_HEIGHT}px`;
    this.lanes.style.minHeight = `${tracks.length * TRACK_HEIGHT}px`;

    this.renderHeads(tracks);
    this.renderRuler(width, contentDuration);
    this.renderLanes(tracks);
    this.updatePlayhead();
    this.updateSelection();
    this.updateToolCursor();
    this.updateStatus();
    if (this.zoomRange) this.zoomRange.value = String(this.pxPerSecond);
    this.heads.scrollTop = this.scroll.scrollTop;
  }

  renderHeads(tracks) {
    const html = tracks.map((track) => {
      const kind = track.kind;
      const hiddenButton = kind !== "audio"
        ? `<button class="track-action ${track.hidden ? "" : "on"}" data-track-action="hidden" title="${track.hidden ? "Show" : "Hide"} track" aria-label="${track.hidden ? "Show" : "Hide"} track">${icon(track.hidden ? "eye-off" : "eye")}</button>`
        : "";
      const muteButton = kind !== "text"
        ? `<button class="track-action ${track.muted ? "on" : ""}" data-track-action="muted" title="${track.muted ? "Unmute" : "Mute"} track" aria-label="${track.muted ? "Unmute" : "Mute"} track">${icon("mute-track")}</button>`
        : "";
      return (
        `<div class="track-head ${kind}" data-track-id="${escapeHtml(track.id)}">` +
        `<div class="track-head-icon">${icon(trackIcon(kind))}</div>` +
        `<div class="track-head-info">` +
        `<div class="track-head-name" title="${escapeHtml(track.name)}">${escapeHtml(track.name)}</div>` +
        `<div class="track-head-kind">${escapeHtml(trackLabel(kind))} · ${(track.clips || []).length}</div>` +
        `</div>` +
        `<div class="track-head-actions">${hiddenButton}${muteButton}` +
        `<button class="track-action ${track.locked ? "on" : ""}" data-track-action="locked" title="${track.locked ? "Unlock" : "Lock"} track" aria-label="${track.locked ? "Unlock" : "Lock"} track">${icon(track.locked ? "lock" : "unlock")}</button>` +
        `<button class="track-action" data-track-action="menu" title="Track options" aria-label="Track options">${icon("more")}</button>` +
        `</div></div>`
      );
    }).join("");
    this.heads.innerHTML = html;
  }

  renderRuler(width, contentDuration) {
    const fps = Number(this.store.project.settings?.fps) || 30;
    const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const desired = 74 / this.pxPerSecond;
    const major = candidates.find((value) => value >= desired) || 600;
    const minor = major / 5;
    const ticks = [];
    const safeDuration = Math.min(contentDuration, 36000);
    for (let time = 0; time <= safeDuration + 0.0001; time += minor) {
      const rounded = Math.round(time * 1000) / 1000;
      const isMajor = Math.abs(rounded / major - Math.round(rounded / major)) < 0.001;
      const left = rounded * this.pxPerSecond;
      if (left > width + 1) break;
      ticks.push(`<span class="ruler-tick ${isMajor ? "major" : ""}" style="left:${left.toFixed(2)}px"></span>`);
      if (isMajor && left < width - 20) {
        ticks.push(
          `<span class="ruler-label" style="left:${left.toFixed(2)}px">${formatShort(rounded)}` +
            (fps >= 50 && major < 1 ? ` · ${Math.round(rounded * fps)}f` : "") +
            `</span>`
        );
      }
    }
    this.ruler.innerHTML = ticks.join("");
  }

  renderLanes(tracks) {
    const selectedId = this.store.selectedClipId;
    const html = tracks.map((track) => {
      const clips = sortedClips(track).map((clip) => this.clipHtml(clip, track, selectedId)).join("");
      return `<div class="track-row ${track.locked ? "locked" : ""}" data-track-id="${escapeHtml(track.id)}">${clips}</div>`;
    }).join("");
    this.lanes.innerHTML = html;
  }

  clipHtml(clip, track, selectedId) {
    const asset = assetFor(this.store, clip);
    const kind = trackClipType(track, clip);
    const left = Number(clip.start) * this.pxPerSecond;
    const width = Math.max(6, Number(clip.duration) * this.pxPerSecond);
    const selected = clip.id === selectedId;
    const thumb = thumbUrl(asset);
    const thumbMarkup = kind === "image"
      ? (thumb ? `<div class="clip-image-thumb" style="background-image:${escapeHtml(cssUrl(thumb))}"></div>` : "")
      : (thumb ? `<div class="clip-thumb" style="background-image:${escapeHtml(cssUrl(thumb))}"></div>` : "");
    const wave = kind === "audio" && asset?.peaks?.length ? waveformSvg(asset.peaks, width) : "";
    const keyframeMarks = clipKeyframeTimes(clip)
      .slice(0, 80)
      .map((time) => {
        const percent = clamp((time / Math.max(0.05, Number(clip.duration) || 0.05)) * 100, 0, 100);
        return `<span class="clip-keyframe" style="left:${percent.toFixed(3)}%" title="Keyframe ${formatShort(
          time
        )}"></span>`;
      })
      .join("");
    const transition = clip.transition?.type && clip.transition.type !== "none"
      ? `<span class="clip-transition" title="Transition: ${escapeHtml(clip.transition.type)}">${icon("transition")}</span>`
      : "";
    const iconName =
      kind === "audio" ? "wave" : kind === "text" ? "text" : kind === "sticker" ? "sticker" : kind === "image" ? "image" : "film";
    const duration = formatShort(clip.duration);
    const handles = track.locked
      ? ""
      : `<span class="clip-handle left" data-handle="left"></span><span class="clip-handle right" data-handle="right"></span>`;
    const styleWidth = width.toFixed(2);
    return (
      `<div class="clip ${kind} ${selected ? "selected" : ""}" data-clip-id="${escapeHtml(clip.id)}" style="left:${left.toFixed(2)}px;width:${styleWidth}px" title="${escapeHtml(clip.name)} · ${escapeHtml(clipSummary(clip))}" draggable="false">` +
      thumbMarkup +
      `<div class="clip-shade"></div>` +
      wave +
      keyframeMarks +
      transition +
      `<div class="clip-top"><span class="clip-type-icon">${icon(iconName)}</span><span class="clip-name">${escapeHtml(clip.name)}</span></div>` +
      `<span class="clip-duration">${escapeHtml(duration)}</span>` +
      handles +
      `</div>`
    );
  }

  updateToolCursor() {
    this.lanes.classList.toggle("clip-blade-cursor", this.store.tool === "blade");
  }

  updateSelection() {
    const selectedId = this.store.selectedClipId;
    for (const el of this.lanes.querySelectorAll(".clip")) {
      el.classList.toggle("selected", el.dataset.clipId === selectedId);
    }
    this.updateStatus();
  }

  updateStatus() {
    if (!this.selectionHint) return;
    const clip = this.store.selectedClip;
    if (!clip) {
      this.selectionHint.textContent = "";
      return;
    }
    const type = clip.type === "sticker" ? "sticker" : clip.type;
    this.selectionHint.textContent = `${type} · ${clip.name} · ${formatShort(clip.duration)}`;
  }

  updatePlayhead() {
    const time = Number(this.store.playhead) || 0;
    const left = time * this.pxPerSecond;
    this.playheadEl.style.left = `${left.toFixed(2)}px`;
    const timeLabel = document.getElementById("timelineTime");
    const durationLabel = document.getElementById("timelineDuration");
    if (timeLabel) timeLabel.textContent = time.toFixed(1).padStart(4, "0");
    if (durationLabel) durationLabel.textContent = this.store.duration.toFixed(1).padStart(4, "0");
    if (this.playing) this.ensurePlayheadVisible(left);
  }

  ensurePlayheadVisible(left) {
    const scrollLeft = this.scroll.scrollLeft;
    const width = this.scroll.clientWidth;
    if (left > scrollLeft + width - 52) {
      this.scroll.scrollLeft = Math.max(0, left - width * 0.27);
    } else if (left < scrollLeft + 8) {
      this.scroll.scrollLeft = Math.max(0, left - 28);
    }
  }

  onScroll() {
    this.heads.scrollTop = this.scroll.scrollTop;
  }

  timeFromEvent(event) {
    const rect = this.content.getBoundingClientRect();
    return Math.max(0, (event.clientX - rect.left) / this.pxPerSecond);
  }

  onRulerPointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    this.rulerDrag = true;
    this.ruler.setPointerCapture?.(event.pointerId);
    const time = this.timeFromEvent(event);
    this.store.setPlayhead(time, { silent: true });
    this.updatePlayhead();
    this.onSeek(time, { scrub: true });
    window.addEventListener("pointermove", this.onRulerPointerMove);
    window.addEventListener("pointerup", this.onRulerPointerUp, { once: true });
  }

  onRulerPointerMove(event) {
    if (!this.rulerDrag) return;
    const time = this.timeFromEvent(event);
    this.store.setPlayhead(time, { silent: true });
    this.updatePlayhead();
    this.onSeek(time, { scrub: true });
  }

  onRulerPointerUp() {
    this.rulerDrag = false;
    window.removeEventListener("pointermove", this.onRulerPointerMove);
    this.onSeek(this.store.playhead, { scrub: false });
  }

  onLanesPointerDown(event) {
    if (event.button !== 0) return;
    const clipEl = event.target.closest(".clip");
    const row = event.target.closest(".track-row");
    if (!row) return;
    const time = this.timeFromEvent(event);

    if (!clipEl) {
      if (event.target.closest(".clip-handle")) return;
      this.store.clearSelection();
      this.store.setPlayhead(time, { silent: true });
      this.updatePlayhead();
      this.onSeek(time);
      return;
    }

    const track = this.store.getTrack(row.dataset.trackId);
    const clip = this.store.getClip(clipEl.dataset.clipId);
    if (!track || !clip) return;

    if (this.store.tool === "blade") {
      event.preventDefault();
      this.store.selectClip(clip.id);
      this.onSplit(clip.id, time);
      return;
    }

    if (track.locked) {
      this.store.selectClip(clip.id);
      this.onToast("Track locked", "Unlock the track before editing its clips.", "warn");
      return;
    }

    event.preventDefault();
    this.store.selectClip(clip.id);
    const handle = event.target.closest(".clip-handle");
    const mode = handle ? (handle.dataset.handle === "left" ? "trim-left" : "trim-right") : "move";
    const asset = assetFor(this.store, clip);
    this.drag = {
      mode,
      clipId: clip.id,
      trackId: track.id,
      startX: event.clientX,
      startY: event.clientY,
      original: {
        start: Number(clip.start) || 0,
        duration: Number(clip.duration) || 0,
        trimIn: Number(clip.trimIn) || 0,
        speed: clamp(Number(clip.speed) || 1, 0.25, 4)
      },
      assetDuration: Number(asset?.duration) || 0,
      started: false,
      movedAcrossTrack: false
    };
    this.store.beginEdit(mode === "move" ? "Move clip" : "Trim clip");
    window.addEventListener("pointermove", this.onWindowPointerMove);
    window.addEventListener("pointerup", this.onWindowPointerUp, { once: true });
    this.updateDropIndicator(null);
  }

  snapCandidates(trackId, excludeClipId) {
    const values = [0, Number(this.store.playhead) || 0];
    const track = this.store.getTrack(trackId);
    if (track) {
      for (const clip of track.clips || []) {
        if (clip.id === excludeClipId) continue;
        values.push(Number(clip.start) || 0, clipEnd(clip));
      }
    }
    return values;
  }

  snapValue(value, candidates, tolerance) {
    let best = null;
    let bestDistance = tolerance;
    for (const candidate of candidates) {
      const distance = Math.abs(candidate - value);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return best;
  }

  onWindowPointerMove(event) {
    const drag = this.drag;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    if (!drag.started && Math.abs(dx) < 3 && Math.abs(event.clientY - drag.startY) < 3) return;
    drag.started = true;

    if (drag.mode === "move") {
      const hoveredRow = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".track-row");
      if (hoveredRow && hoveredRow.dataset.trackId !== drag.trackId) {
        const targetTrack = this.store.getTrack(hoveredRow.dataset.trackId);
        const found = this.store.getClipWithTrack(drag.clipId);
        if (targetTrack && found && isTrackCompatible(targetTrack, found.clip)) {
          found.track.clips.splice(found.index, 1);
          targetTrack.clips.push(found.clip);
          sortTrack(targetTrack);
          drag.trackId = targetTrack.id;
          drag.movedAcrossTrack = true;
          this.store.transient(() => {}, "gesture", { clipId: drag.clipId });
          this.scheduleRender();
        }
      }
    }

    const found = this.store.getClipWithTrack(drag.clipId);
    if (!found) return;
    const clip = found.clip;
    const delta = dx / this.pxPerSecond;
    const tolerance = SNAP_PX / this.pxPerSecond;
    const candidates = this.store.snap
      ? this.snapCandidates(drag.trackId, drag.clipId)
      : [];
    let snapLine = null;

    if (drag.mode === "move") {
      let start = Math.max(0, drag.original.start + delta);
      if (candidates.length) {
        const snappedStart = this.snapValue(start, candidates, tolerance);
        const snappedEnd = this.snapValue(start + drag.original.duration, candidates, tolerance);
        if (snappedStart != null && (snappedEnd == null || Math.abs(snappedStart - start) <= Math.abs(snappedEnd - (start + drag.original.duration)))) {
          start = Math.max(0, snappedStart);
          snapLine = start;
        } else if (snappedEnd != null) {
          start = Math.max(0, snappedEnd - drag.original.duration);
          snapLine = snappedEnd;
        }
      }
      this.store.updateClipTransient(drag.clipId, (live) => {
        live.start = start;
      }, "gesture");
      this.updateClipElement(drag.clipId);
    } else if (drag.mode === "trim-left") {
      const minStart = drag.original.start - drag.original.trimIn / drag.original.speed;
      let start = clamp(drag.original.start + delta, Math.max(0, minStart), drag.original.start + drag.original.duration - 0.1);
      if (candidates.length) {
        const snapped = this.snapValue(start, candidates, tolerance);
        if (snapped != null) {
          start = clamp(snapped, Math.max(0, minStart), drag.original.start + drag.original.duration - 0.1);
          snapLine = start;
        }
      }
      const shift = start - drag.original.start;
      this.store.updateClipTransient(drag.clipId, (live) => {
        live.start = start;
        live.duration = drag.original.duration - shift;
        if (live.type !== "text" && live.type !== "sticker") {
          live.trimIn = Math.max(0, drag.original.trimIn + shift * drag.original.speed);
        }
      }, "gesture");
      this.updateClipElement(drag.clipId);
    } else {
      let duration = Math.max(0.1, drag.original.duration + delta);
      if (drag.assetDuration > 0 && clip.type !== "image" && clip.type !== "text" && clip.type !== "sticker") {
        const maxDuration = Math.max(0.1, (drag.assetDuration - drag.original.trimIn) / drag.original.speed);
        duration = Math.min(duration, maxDuration);
      }
      let end = drag.original.start + duration;
      if (candidates.length) {
        const snapped = this.snapValue(end, candidates, tolerance);
        if (snapped != null && snapped > drag.original.start + 0.1) {
          end = snapped;
          if (drag.assetDuration <= 0 || clip.type === "image" || clip.type === "text" || clip.type === "sticker") {
            duration = end - drag.original.start;
          } else {
            duration = Math.min(end - drag.original.start, (drag.assetDuration - drag.original.trimIn) / drag.original.speed);
          }
          snapLine = snapLine ?? end;
        }
      }
      this.store.updateClipTransient(drag.clipId, (live) => {
        live.duration = duration;
      }, "gesture");
      this.updateClipElement(drag.clipId);
    }

    this.updatePlayhead();
    this.updateDropIndicator(snapLine == null ? null : snapLine * this.pxPerSecond);
  }

  onWindowPointerUp() {
    const drag = this.drag;
    window.removeEventListener("pointermove", this.onWindowPointerMove);
    this.drag = null;
    if (!drag) return;
    this.updateDropIndicator(null);
    if (drag.started) {
      this.store.commitEdit();
      this.scheduleRender();
      this.suppressClick = true;
      setTimeout(() => {
        this.suppressClick = false;
      }, 40);
    } else {
      this.store.commitEdit();
    }
  }

  updateClipElement(clipId) {
    const clip = this.store.getClip(clipId);
    const el = this.lanes.querySelector(`.clip[data-clip-id="${clipId.replace(/"/g, '\\"')}"]`);
    if (!clip || !el) return;
    el.style.left = `${(Number(clip.start) * this.pxPerSecond).toFixed(2)}px`;
    el.style.width = `${Math.max(6, Number(clip.duration) * this.pxPerSecond).toFixed(2)}px`;
    const duration = el.querySelector(".clip-duration");
    if (duration) duration.textContent = formatShort(clip.duration);
    const title = el.querySelector(".clip-name");
    if (title) title.textContent = clip.name;
    el.title = `${clip.name} · ${clipSummary(clip)}`;
  }

  updateDropIndicator(x) {
    if (!this.dropIndicator) return;
    if (x == null) {
      this.dropIndicator.classList.remove("visible");
      return;
    }
    this.dropIndicator.style.left = `${Math.max(0, x).toFixed(2)}px`;
    this.dropIndicator.classList.add("visible");
  }

  setZoom(value, { fromStore = false } = {}) {
    const next = clamp(Number(value) || 45, 4, 180);
    if (Math.abs(next - this.pxPerSecond) < 0.001) return;
    const centerTime = this.store.playhead;
    const viewportCenter = this.scroll.scrollLeft + this.scroll.clientWidth / 2;
    const timeAtCenter = viewportCenter / this.pxPerSecond;
    this.pxPerSecond = next;
    if (!fromStore) this.store.setZoom(next);
    if (this.zoomRange) this.zoomRange.value = String(next);
    this.render();
    if (this.store.playhead > 0) {
      const nextLeft = centerTime * this.pxPerSecond;
      if (nextLeft > this.scroll.scrollLeft + this.scroll.clientWidth - 20) {
        this.scroll.scrollLeft = Math.max(0, timeAtCenter * this.pxPerSecond - this.scroll.clientWidth / 2);
      }
    }
    this.updatePlayhead();
  }

  zoomBy(factor) {
    this.store.setZoom(this.pxPerSecond * factor);
  }

  fit() {
    const duration = Math.max(4, this.store.duration + 1);
    const width = Math.max(200, this.scroll.clientWidth - 30);
    const zoom = clamp(width / duration, 4, 180);
    this.store.setZoom(zoom);
    this.scroll.scrollLeft = 0;
  }

  focusPlayhead() {
    const left = this.store.playhead * this.pxPerSecond;
    this.scroll.scrollLeft = Math.max(0, left - this.scroll.clientWidth * 0.35);
  }

  setPlaying(value) {
    this.playing = Boolean(value);
    if (this.playing) this.ensurePlayheadVisible(this.store.playhead * this.pxPerSecond);
  }

  onExternalDragOver(event) {
    const types = Array.from(event.dataTransfer?.types || []);
    if (!types.includes("application/x-vidit-asset") && !types.includes("application/x-vidit-clip")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    this.hideDropTargets();

    const row = event.target.closest?.(".track-row") ||
      document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".track-row");
    if (!row) return;
    const track = this.store.getTrack(row.dataset.trackId);
    if (!track) return;

    let assetId = "";
    try {
      assetId = event.dataTransfer.getData("application/x-vidit-asset");
    } catch {
      assetId = "";
    }
    const asset = assetId ? this.store.getAsset(assetId) : null;
    let compatible = true;
    if (asset) {
      if (track.kind === "audio") compatible = asset.type === "audio" || asset.type === "video";
      else if (track.kind === "video") compatible = asset.type === "video" || asset.type === "image";
      else compatible = false;
    }
    if (!compatible) {
      row.classList.add("drop-target");
      this.hideDropIndicatorSoon();
      return;
    }
    row.classList.add("drop-target");
    this.dragOverTrackId = track.id;
    const time = this.timeFromEvent(event);
    this.updateDropIndicator(time * this.pxPerSecond);
  }

  onExternalDragLeave(event) {
    if (this.lanes.contains(event.relatedTarget)) return;
    this.hideDropTargets();
  }

  onExternalDrop(event) {
    const types = Array.from(event.dataTransfer?.types || []);
    if (!types.includes("application/x-vidit-asset") && !types.includes("application/x-vidit-clip")) return;
    event.preventDefault();
    const row = event.target.closest?.(".track-row") ||
      document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".track-row");
    this.hideDropTargets();
    if (!row) return;
    const track = this.store.getTrack(row.dataset.trackId);
    if (!track) return;
    const time = Math.max(0, this.timeFromEvent(event));
    const assetId = event.dataTransfer.getData("application/x-vidit-asset");
    if (assetId) {
      this.onSeek(time);
      this.onDropAsset?.(assetId, track.id, time);
      return;
    }
    const clipId = event.dataTransfer.getData("application/x-vidit-clip");
    if (clipId) {
      this.onDropClip?.(clipId, track.id, time);
    }
  }

  hideDropIndicatorSoon() {
    this.updateDropIndicator(null);
  }

  hideDropTargets() {
    for (const row of this.lanes.querySelectorAll(".track-row.drop-target")) row.classList.remove("drop-target");
    this.dragOverTrackId = null;
    this.updateDropIndicator(null);
  }

  scrollToPlayhead() {
    this.focusPlayhead();
  }
}

export function createTimeline(options) {
  return new Timeline(options);
}
