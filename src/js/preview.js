import { clipEnd, effectCss, keyframeValueAt, vignetteOpacity } from "./model.js";
import { createPreviewTextLayer } from "./text-render.js";
import { clamp } from "./utils.js";

const VISUAL_TYPES = new Set(["video", "image", "text", "sticker"]);

function mediaUrlFor(asset) {
  if (!asset?.path) return "";
  try {
    return window.vidit?.mediaUrl ? window.vidit.mediaUrl(asset.path) : "";
  } catch {
    return "";
  }
}

function findAssetForClip(project, clip) {
  if (!clip?.assetId) return null;
  return (project.assets || []).find((asset) => asset.id === clip.assetId) || null;
}

function transitionMotion(clip) {
  const transition = clip.transition?.type && clip.transition.type !== "none" ? clip.transition : null;
  const animation = clip.animation?.type && clip.animation.type !== "none" ? clip.animation : null;
  if (transition && ["rise", "drop", "slide-left", "slide-right"].includes(transition.type)) {
    return { type: transition.type, duration: Math.max(0.05, Number(transition.duration) || 0.65) };
  }
  if (animation && ["rise", "drop", "slide-left", "slide-right"].includes(animation.type)) {
    return { type: animation.type, duration: Math.max(0.05, Number(animation.duration) || 0.55) };
  }
  return null;
}

function fadeInDuration(clip) {
  let duration = clamp(clip.fades?.in, 0, Number(clip.duration) || 0);
  if (clip.transition?.type === "fade") {
    duration = Math.max(duration, clamp(clip.transition.duration, 0, Number(clip.duration) || 0));
  }
  if (clip.animation?.type === "fade") {
    duration = Math.max(duration, clamp(clip.animation.duration, 0, Number(clip.duration) || 0));
  }
  return duration;
}

function clipAlpha(clip, time) {
  const duration = Math.max(0.001, Number(clip.duration) || 0);
  const local = Math.max(0, time - (Number(clip.start) || 0));
  let alpha = clamp(keyframeValueAt(clip, "opacity", local), 0, 1);
  const fadeIn = fadeInDuration(clip);
  if (fadeIn > 0.001 && local < fadeIn) alpha *= clamp(local / fadeIn, 0, 1);
  const fadeOut = clamp(clip.fades?.out, 0, duration);
  if (fadeOut > 0.001 && local > duration - fadeOut) {
    alpha *= clamp((duration - local) / fadeOut, 0, 1);
  }
  return clamp(alpha, 0, 1);
}

function isVisualClip(clip) {
  return VISUAL_TYPES.has(clip?.type);
}

export class PreviewEngine {
  constructor({ store, stage, background, layers, empty, onTime, onPlayState }) {
    this.store = store;
    this.stage = stage;
    this.stageBackground = background;
    this.layersRoot = layers;
    this.empty = empty;
    this.onTime = typeof onTime === "function" ? onTime : () => {};
    this.onPlayState = typeof onPlayState === "function" ? onPlayState : () => {};

    this.layers = new Map();
    this.audio = new Map();
    this.playing = false;
    this.loop = false;
    this.masterVolume = 1;
    this.muted = false;
    this.raf = null;
    this.lastFrameAt = 0;
    this.layoutFrame = 0;
    this.displayWidth = 0;
    this.displayHeight = 0;
    this.fontsReady = false;
    this.disposed = false;

    this.resizeObserver = new ResizeObserver(() => this.scheduleLayout());
    this.resizeObserver.observe(this.stage.parentElement || this.stage);
    this.stage.parentElement?.parentElement && this.resizeObserver.observe(this.stage.parentElement.parentElement);

    this.unsubscribe = this.store.subscribe(({ reason }) => {
      if (reason === "playhead") {
        const next = Number(this.store.playhead) || 0;
        if (Math.abs(next - (this.currentTime ?? next)) > 0.0005) {
          this.seek(next, { preservePlaying: true, silent: true });
        }
        return;
      }
      if (reason === "selection") return;
      if (["project", "load", "assets", "history", "gesture", "control", "save"].includes(reason)) {
        this.cleanupRemoved();
        this.layout();
        this.render(this.store.playhead);
        if (reason === "load") this.syncAudioState();
      }
    });

    this.layout();
    this.render(this.store.playhead);
    this.loadFonts();
  }

  loadFonts() {
    Promise.resolve(document.fonts?.ready)
      .then(() => {
        this.fontsReady = true;
        this.cleanupRemoved();
        this.render(this.store.playhead);
      })
      .catch(() => {});
  }

  scheduleLayout() {
    if (this.layoutFrame) cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = 0;
      this.layout();
      this.render(this.store.playhead);
    });
  }

  layout() {
    const viewport = this.stage.parentElement?.parentElement;
    if (!viewport) return;
    const project = this.store.project;
    const width = Math.max(1, Number(project.settings?.width) || 1920);
    const height = Math.max(1, Number(project.settings?.height) || 1080);
    const ratio = width / height;
    const availableWidth = Math.max(120, viewport.clientWidth - 56);
    const availableHeight = Math.max(90, viewport.clientHeight - 40);
    let displayWidth = availableWidth;
    let displayHeight = displayWidth / ratio;
    if (displayHeight > availableHeight) {
      displayHeight = availableHeight;
      displayWidth = displayHeight * ratio;
    }
    displayWidth = Math.max(80, Math.floor(displayWidth));
    displayHeight = Math.max(45, Math.floor(displayHeight));

    if (Math.abs(displayWidth - this.displayWidth) > 0.5 || Math.abs(displayHeight - this.displayHeight) > 0.5) {
      this.displayWidth = displayWidth;
      this.displayHeight = displayHeight;
      this.stage.style.width = `${displayWidth}px`;
      this.stage.style.height = `${displayHeight}px`;
      this.stage.style.aspectRatio = `${width} / ${height}`;
    }

    const background = project.settings?.background || "#0b0e0e";
    this.stageBackground.style.background = background;
    this.stage.style.background = background;
    const hasClips = (project.tracks || []).some((track) => (track.clips || []).length > 0);
    this.empty?.classList.toggle("hidden", hasClips);
  }

  textScale() {
    return Math.max(0.02, this.displayHeight / 1080);
  }

  cleanupRemoved() {
    const project = this.store.project;
    const validIds = new Set();
    for (const track of project.tracks || []) {
      for (const clip of track.clips || []) validIds.add(clip.id);
    }
    for (const [clipId, entry] of this.layers) {
      if (!validIds.has(clipId)) {
        entry.layer.remove();
        this.layers.delete(clipId);
      }
    }
    for (const [clipId, audio] of this.audio) {
      if (!validIds.has(clipId)) {
        try {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        } catch {
          /* noop */
        }
        this.audio.delete(clipId);
      }
    }
  }

  trackOrderMap() {
    const map = new Map();
    const tracks = this.store.project.tracks || [];
    tracks.forEach((track, index) => map.set(track.id, tracks.length - index));
    return map;
  }

  ensureLayer(clip, track) {
    let entry = this.layers.get(clip.id);
    if (entry) return entry;
    const layer = document.createElement("div");
    layer.className = "stage-layer";
    layer.dataset.clipId = clip.id;
    let media = null;
    let vignette = null;
    let text = null;

    if (clip.type === "text" || clip.type === "sticker") {
      layer.classList.add("text-layer");
      text = createPreviewTextLayer(layer, clip, this.store.project, this.textScale());
    } else {
      const wrap = document.createElement("div");
      wrap.className = "layer-media-wrap";
      const asset = findAssetForClip(this.store.project, clip);
      if (clip.type === "video") {
        media = document.createElement("video");
        media.preload = "auto";
        media.playsInline = true;
        media.muted = true;
        media.disablePictureInPicture = true;
        media.src = mediaUrlFor(asset);
      } else {
        media = document.createElement("img");
        media.alt = "";
        media.decoding = "async";
        media.src = mediaUrlFor(asset);
      }
      wrap.appendChild(media);
      vignette = document.createElement("div");
      vignette.className = "layer-vignette";
      vignette.style.opacity = "0";
      wrap.appendChild(vignette);
      layer.appendChild(wrap);
    }

    layer.style.display = "none";
    this.layersRoot.appendChild(layer);
    entry = {
      layer,
      media,
      vignette,
      text,
      assetId: clip.assetId,
      clipType: clip.type,
      textSignature: "",
      lastMediaSeek: -1
    };
    this.layers.set(clip.id, entry);
    return entry;
  }

  motionOffset(clip, time) {
    const motion = transitionMotion(clip);
    if (!motion) return { x: 0, y: 0 };
    const local = Math.max(0, time - (Number(clip.start) || 0));
    const progress = clamp(local / motion.duration, 0, 1);
    const amount = Math.min(this.displayWidth, this.displayHeight) * 0.08 * (1 - progress);
    if (motion.type === "rise") return { x: 0, y: amount };
    if (motion.type === "drop") return { x: 0, y: -amount };
    if (motion.type === "slide-left") return { x: -amount, y: 0 };
    if (motion.type === "slide-right") return { x: amount, y: 0 };
    return { x: 0, y: 0 };
  }

  isClipActive(clip, time) {
    return time + 1e-6 >= (Number(clip.start) || 0) && time < clipEnd(clip) - 1e-6;
  }

  syncVisualMedia(entry, clip, asset, time, active) {
    if (!entry.media || !entry.media.tagName || entry.media.tagName !== "VIDEO") return;
    const media = entry.media;
    if (!active) {
      if (!media.paused) media.pause();
      return;
    }
    const speed = clamp(clip.speed, 0.25, 4);
    const target = Math.max(0, (Number(clip.trimIn) || 0) + (time - clip.start) * speed);
    media.playbackRate = speed;
    const drift = Math.abs((media.currentTime || 0) - target);
    const shouldSeek = !this.playing || drift > 0.28 || Math.abs(media.playbackRate - speed) > 0.01;
    if (shouldSeek && media.readyState >= 1) {
      try {
        media.currentTime = Math.min(target, Number(asset?.duration) || target);
        entry.lastMediaSeek = target;
      } catch {
        /* noop */
      }
    }
    if (this.playing && media.paused) {
      media.play().catch(() => {});
    } else if (!this.playing && !media.paused) {
      media.pause();
    }
  }

  render(time = this.store.playhead) {
    if (this.disposed) return;
    const project = this.store.project;
    const tracks = project.tracks || [];
    const order = this.trackOrderMap();
    const current = clamp(Number(time) || 0, 0, Math.max(0.001, this.store.duration));
    this.currentTime = current;
    this.layout();

    const activeIds = new Set();
    for (const track of tracks) {
      if (track.hidden || track.kind === "audio") continue;
      for (const clip of track.clips || []) {
        if (!isVisualClip(clip) || !this.isClipActive(clip, current)) continue;
        activeIds.add(clip.id);
        const asset = findAssetForClip(project, clip);
        if (clip.type !== "text" && clip.type !== "sticker" && !asset) continue;
        const entry = this.ensureLayer(clip, track);
        const local = Math.max(0, current - (Number(clip.start) || 0));
        const alpha = clipAlpha(clip, current);
        const motion = this.motionOffset(clip, current);
        const scale = clamp(keyframeValueAt(clip, "scale", local), 0.05, 4);
        const scaleX = (clip.flipH ? -1 : 1) * scale;
        const scaleY = (clip.flipV ? -1 : 1) * scale;
        const x = clamp(keyframeValueAt(clip, "x", local), -2, 2) * this.displayWidth + motion.x;
        const y = clamp(keyframeValueAt(clip, "y", local), -2, 2) * this.displayHeight + motion.y;
        const rotation = clamp(keyframeValueAt(clip, "rotation", local), -360, 360);

        entry.layer.style.display = alpha <= 0.001 ? "none" : "block";
        entry.layer.style.opacity = alpha.toFixed(4);
        entry.layer.style.zIndex = String(10 + (order.get(track.id) || 0) * 10);
        entry.layer.style.transform =
          `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) ` +
          `scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)}) rotate(${rotation.toFixed(3)}deg)`;

        if (entry.text) {
          const signature = JSON.stringify(clip.text || {}) + `|${this.displayHeight.toFixed(1)}`;
          if (signature !== entry.textSignature) {
            entry.text.update(clip, project, this.textScale());
            entry.textSignature = signature;
          }
        } else if (entry.media) {
          if (entry.assetId !== clip.assetId) {
            entry.assetId = clip.assetId;
            if (entry.media.tagName === "VIDEO") {
              entry.media.src = mediaUrlFor(asset);
            } else {
              entry.media.src = mediaUrlFor(asset);
            }
          }
          entry.media.style.objectFit = clip.fit === "contain" ? "contain" : "cover";
          const filter = effectCss(clip.effect, clip.color);
          entry.media.style.filter = filter || "none";
          entry.vignette.style.opacity = String(vignetteOpacity(clip.color));
          this.syncVisualMedia(entry, clip, asset, current, true);
        }
      }
    }

    for (const [clipId, entry] of this.layers) {
      if (!activeIds.has(clipId)) {
        entry.layer.style.display = "none";
        if (entry.media?.tagName === "VIDEO" && !entry.media.paused) entry.media.pause();
      }
    }

    this.syncAudioState();
  }

  audibleClips() {
    const project = this.store.project;
    const out = [];
    for (const track of project.tracks || []) {
      if (track.kind !== "audio" && track.kind !== "video") continue;
      for (const clip of track.clips || []) {
        if (clip.type !== "audio" && clip.type !== "video") continue;
        const asset = findAssetForClip(project, clip);
        if (!asset?.hasAudio) continue;
        out.push({ clip, track, asset });
      }
    }
    return out;
  }

  ensureAudio(clip, asset) {
    let audio = this.audio.get(clip.id);
    if (audio) return audio;
    audio = new Audio();
    audio.preload = "auto";
    audio.src = mediaUrlFor(asset);
    audio.dataset.clipId = clip.id;
    audio.addEventListener("loadedmetadata", () => {
      if (this.playing) this.syncAudioState();
    });
    audio.addEventListener("error", () => {});
    this.audio.set(clip.id, audio);
    return audio;
  }

  syncAudioState() {
    const now = this.currentTime ?? this.store.playhead;
    const activePlayback = new Map();
    for (const { clip, track, asset } of this.audibleClips()) {
      if (!this.isClipActive(clip, now)) continue;
      activePlayback.set(clip.id, { clip, track, asset });
    }

    for (const [clipId, audio] of this.audio) {
      if (!activePlayback.has(clipId)) {
        if (!audio.paused) audio.pause();
      }
    }

    for (const [clipId, item] of activePlayback) {
      const { clip, track, asset } = item;
      const audio = this.ensureAudio(clip, asset);
      const speed = clamp(clip.speed, 0.25, 4);
      const target = Math.max(0, (Number(clip.trimIn) || 0) + (now - clip.start) * speed);
      const local = Math.max(0, now - (Number(clip.start) || 0));
      const volume = clamp(
        keyframeValueAt(clip, "volume", local) * (track.muted ? 0 : 1) * (track.volume ?? 1) * (this.muted ? 0 : this.masterVolume),
        0,
        1
      );
      audio.volume = volume;
      audio.playbackRate = speed;
      const drift = Math.abs((audio.currentTime || 0) - target);
      if ((!this.playing || drift > 0.32) && audio.readyState >= 1) {
        try {
          audio.currentTime = Math.min(target, Number(asset?.duration) || target);
        } catch {
          /* noop */
        }
      }
      if (this.playing && volume > 0) {
        if (audio.paused) audio.play().catch(() => {});
      } else if (!audio.paused) {
        audio.pause();
      }
    }
  }

  play() {
    const duration = this.store.duration;
    if (!(duration > 0.01)) return false;
    if (this.playing) return true;
    if (this.store.playhead >= duration - 0.001) this.seek(0, { silent: true });
    this.playing = true;
    this.lastFrameAt = performance.now();
    this.onPlayState(true);
    this.syncAudioState();
    this.render(this.store.playhead);
    this.raf = requestAnimationFrame((now) => this.frame(now));
    return true;
  }

  frame(now) {
    if (!this.playing) return;
    const duration = Math.max(0.01, this.store.duration);
    const elapsed = Math.max(0, Math.min(0.12, (now - this.lastFrameAt) / 1000));
    this.lastFrameAt = now;
    let next = (Number(this.store.playhead) || 0) + elapsed;
    if (next >= duration - 0.0005) {
      if (this.loop) {
        next = 0;
        this.seek(0, { preservePlaying: true, silent: true });
        this.onTime(0, { playing: true });
      } else {
        next = duration;
        this.store.playhead = next;
        this.render(Math.max(0, duration - 0.0005));
        this.onTime(next, { playing: false });
        this.pause({ render: false });
        return;
      }
    }
    this.store.playhead = next;
    this.render(next);
    this.onTime(next, { playing: true });
    this.raf = requestAnimationFrame((stamp) => this.frame(stamp));
  }

  pause({ render = true, silent = false } = {}) {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    if (!this.playing) {
      this.syncAudioState();
      return;
    }
    this.playing = false;
    this.syncAudioState();
    for (const entry of this.layers.values()) {
      if (entry.media?.tagName === "VIDEO" && !entry.media.paused) entry.media.pause();
    }
    this.onPlayState(false);
    if (render) this.render(this.store.playhead);
    if (!silent) this.onTime(this.store.playhead, { playing: false });
  }

  toggle() {
    return this.playing ? (this.pause(), false) : this.play();
  }

  seek(time, { preservePlaying = false, silent = false } = {}) {
    const max = Math.max(0.001, this.store.duration);
    const next = clamp(Number(time) || 0, 0, max);
    const wasPlaying = this.playing;
    if (wasPlaying && !preservePlaying) this.pause({ render: false });
    this.store.playhead = next;
    this.currentTime = next;
    this.render(next);
    if (wasPlaying && preservePlaying) {
      this.lastFrameAt = performance.now();
      this.syncAudioState();
      if (!this.raf) this.raf = requestAnimationFrame((stamp) => this.frame(stamp));
    }
    if (!silent) this.onTime(next, { playing: this.playing });
    return next;
  }

  setVolume(value) {
    this.masterVolume = clamp(Number(value) / 100, 0, 1);
    this.syncAudioState();
  }

  setMuted(value) {
    this.muted = Boolean(value);
    this.syncAudioState();
  }

  setLoop(value) {
    this.loop = Boolean(value);
  }

  isPlaying() {
    return this.playing;
  }

  refresh() {
    this.cleanupRemoved();
    this.layout();
    this.render(this.store.playhead);
  }

  dispose() {
    this.disposed = true;
    if (this.unsubscribe) this.unsubscribe();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    for (const entry of this.layers.values()) {
      if (entry.media?.tagName === "VIDEO") {
        try {
          entry.media.pause();
        } catch {
          /* noop */
        }
      }
      entry.layer.remove();
    }
    for (const audio of this.audio.values()) {
      try {
        audio.pause();
        audio.removeAttribute("src");
      } catch {
        /* noop */
      }
    }
    this.layers.clear();
    this.audio.clear();
  }
}

export function createPreview(options) {
  return new PreviewEngine(options);
}
