import {
  EFFECTS,
  STICKER_GROUPS,
  TEXT_PRESETS,
  TRANSITIONS,
  effectCss,
  trackLabel
} from "./model.js";
import {
  clamp,
  escapeHtml,
  formatBytes,
  formatDuration,
  formatShort,
  icon,
  seededBars
} from "./utils.js";

const TAB_META = {
  media: { kicker: "Library", title: "Media", subtitle: "Your source material" },
  audio: { kicker: "Sound", title: "Audio", subtitle: "Music, voice and ambience" },
  text: { kicker: "Type", title: "Text", subtitle: "Titles, captions and labels" },
  stickers: { kicker: "Accents", title: "Stickers", subtitle: "Reactions and marks" },
  effects: { kicker: "Look", title: "Effects", subtitle: "Color presets for the selected clip" },
  transitions: { kicker: "Motion", title: "Transitions", subtitle: "How one clip gives way to the next" },
  adjust: { kicker: "Color", title: "Adjust", subtitle: "Dial in the selected clip" }
};

const ADJUSTMENTS = [
  { key: "brightness", label: "Brightness", min: -100, max: 100, step: 1, suffix: "" },
  { key: "contrast", label: "Contrast", min: -100, max: 100, step: 1, suffix: "" },
  { key: "saturation", label: "Saturation", min: -100, max: 100, step: 1, suffix: "" },
  { key: "temperature", label: "Temperature", min: -100, max: 100, step: 1, suffix: "" },
  { key: "blur", label: "Blur", min: 0, max: 30, step: 0.5, suffix: "px" },
  { key: "sharpen", label: "Sharpen", min: 0, max: 100, step: 1, suffix: "" },
  { key: "vignette", label: "Vignette", min: 0, max: 100, step: 1, suffix: "" }
];

function mediaUrl(file) {
  if (!file) return "";
  try {
    return window.vidit?.mediaUrl ? window.vidit.mediaUrl(file) : "";
  } catch {
    return "";
  }
}

function typeIcon(type) {
  if (type === "audio") return "wave";
  if (type === "image") return "image";
  return "film";
}

function typeLabel(type) {
  if (type === "audio") return "Audio";
  if (type === "image") return "Image";
  return "Video";
}

function assetThumb(asset) {
  if (!asset) return "";
  if (asset.type === "audio") return "";
  return mediaUrl(asset.thumb || asset.path);
}

function visualKind(clip) {
  return clip && (clip.type === "video" || clip.type === "image");
}

export class LibraryPanel {
  constructor({
    store,
    head,
    body,
    onImport,
    onAddAsset,
    onAddText,
    onAddSticker,
    onApplyEffect,
    onApplyTransition,
    onRecordVoice,
    onExtractAudio,
    onDeleteAsset,
    onRevealAsset,
    onOpenProjectSettings,
    onAssetContext,
    onToast
  }) {
    this.store = store;
    this.head = head;
    this.body = body;
    this.onImport = onImport || (() => {});
    this.onAddAsset = onAddAsset || (() => {});
    this.onAddText = onAddText || (() => {});
    this.onAddSticker = onAddSticker || (() => {});
    this.onApplyEffect = onApplyEffect || (() => {});
    this.onApplyTransition = onApplyTransition || (() => {});
    this.onRecordVoice = onRecordVoice || (() => {});
    this.onExtractAudio = onExtractAudio || (() => {});
    this.onDeleteAsset = onDeleteAsset || (() => {});
    this.onRevealAsset = onRevealAsset || (() => {});
    this.onOpenProjectSettings = onOpenProjectSettings || (() => {});
    this.onAssetContext = onAssetContext || (() => {});
    this.onToast = onToast || (() => {});

    this.tab = "media";
    this.filter = "all";
    this.search = "";
    this.audition = null;
    this.auditionAssetId = null;
    this.adjustGesture = false;

    this.bind();
    this.unsubscribe = this.store.subscribe(({ reason }) => {
      if (["selection", "project", "load", "assets", "history", "save"].includes(reason)) {
        this.render();
      }
    });
    this.render();
  }

  bind() {
    this.head.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;
      if (action === "import") this.onImport();
      else if (action === "record") this.onRecordVoice();
      else if (action === "extract-audio") this.onExtractAudio();
      else if (action === "add-plain-text") this.onAddText("plain");
      else if (action === "project-settings") this.onOpenProjectSettings();
      else if (action === "reset-color") this.resetColor();
    });

    this.body.addEventListener("click", (event) => this.handleBodyClick(event));
    this.body.addEventListener("input", (event) => this.handleBodyInput(event));
    this.body.addEventListener("change", (event) => this.handleBodyChange(event));
    this.body.addEventListener("dblclick", (event) => {
      const card = event.target.closest(".asset-card[data-asset-id]");
      if (card) this.onAddAsset(card.dataset.assetId);
    });
    this.body.addEventListener("contextmenu", (event) => {
      const card = event.target.closest(".asset-card[data-asset-id], .audio-row[data-asset-id]");
      if (!card) return;
      const asset = this.store.getAsset(card.dataset.assetId);
      if (!asset) return;
      event.preventDefault();
      this.store.selectAsset(asset.id);
      this.onAssetContext(asset, event.clientX, event.clientY);
    });
    this.body.addEventListener("dragstart", (event) => {
      const card = event.target.closest("[data-asset-id][draggable='true']");
      if (!card || !event.dataTransfer) return;
      const asset = this.store.getAsset(card.dataset.assetId);
      if (!asset) return;
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("application/x-vidit-asset", asset.id);
      event.dataTransfer.setData("text/plain", asset.path || asset.name);
      this.stopAudition();
    });
    this.body.addEventListener("scroll", () => this.closeAuditionMenu?.(), { passive: true });
  }

  setTab(tab) {
    if (!TAB_META[tab]) return;
    if (this.tab !== tab) {
      this.stopAudition();
      this.search = "";
      this.filter = "all";
    }
    this.tab = tab;
    this.render();
  }

  render() {
    const meta = TAB_META[this.tab] || TAB_META.media;
    const actions = this.headActions();
    this.head.innerHTML =
      `<div class="library-title-row">` +
      `<div><p class="panel-kicker">${escapeHtml(meta.kicker)}</p>` +
      `<h2 class="panel-title">${escapeHtml(meta.title)}</h2>` +
      `<p class="panel-subtitle">${escapeHtml(meta.subtitle)}</p></div>` +
      `<div class="panel-head-actions">${actions}</div>` +
      `</div>`;
    this.body.innerHTML = this.bodyHtml();
  }

  headActions() {
    if (this.tab === "media") {
      return (
        `<button class="primary-small" data-action="import" title="Add media">${icon("plus")}Import</button>` +
        `<button class="small-icon-btn" data-action="import" title="Add media">${icon("folder")}</button>`
      );
    }
    if (this.tab === "audio") {
      return (
        `<button class="primary-small" data-action="record" title="Record voiceover">${icon("record")}Record</button>` +
        `<button class="small-icon-btn" data-action="extract-audio" title="Extract audio from selected video">${icon("wave")}</button>`
      );
    }
    if (this.tab === "text") {
      return `<button class="small-icon-btn" data-action="add-plain-text" title="Add a plain text clip">${icon("plus")}</button>`;
    }
    if (this.tab === "adjust") {
      return `<button class="small-icon-btn" data-action="reset-color" title="Reset color">${icon("refresh")}</button>`;
    }
    return "";
  }

  bodyHtml() {
    switch (this.tab) {
      case "audio":
        return this.audioHtml();
      case "text":
        return this.textHtml();
      case "stickers":
        return this.stickersHtml();
      case "effects":
        return this.effectsHtml();
      case "transitions":
        return this.transitionsHtml();
      case "adjust":
        return this.adjustHtml();
      case "media":
      default:
        return this.mediaHtml();
    }
  }

  mediaHtml() {
    const assets = this.store.project.assets || [];
    return (
      `<div class="lib-search">${icon("search")}` +
      `<input id="mediaSearch" type="search" placeholder="Search media" autocomplete="off" value="${escapeHtml(this.search)}" />` +
      `</div>` +
      `<div class="filter-row">` +
      this.filterButton("all", "All") +
      this.filterButton("video", "Video") +
      this.filterButton("image", "Images") +
      this.filterButton("audio", "Audio") +
      `</div>` +
      `<div class="media-grid-wrap">${this.mediaGridHtml(assets)}</div>`
    );
  }

  filterButton(value, label) {
    return `<button class="filter-chip ${this.filter === value ? "active" : ""}" data-filter="${value}">${label}</button>`;
  }

  filteredAssets() {
    const query = this.search.trim().toLowerCase();
    return (this.store.project.assets || []).filter((asset) => {
      if (this.filter !== "all" && asset.type !== this.filter) return false;
      if (!query) return true;
      return `${asset.name} ${asset.type}`.toLowerCase().includes(query);
    });
  }

  mediaGridHtml(allAssets) {
    const assets = this.filteredAssets();
    if (!assets.length) {
      if (!allAssets.length) {
        return (
          `<div class="lib-empty">${icon("film")}` +
          `<p>No media yet.<br />Bring in footage, images or sound.</p>` +
          `<button class="secondary-button" data-action="import">${icon("plus")}Choose media</button>` +
          `</div>`
        );
      }
      return `<div class="lib-empty">${icon("search")}<p>No media matches this filter.</p></div>`;
    }
    return `<div class="asset-grid">${assets.map((asset) => this.assetCardHtml(asset)).join("")}</div>`;
  }

  assetCardHtml(asset) {
    const thumb = assetThumb(asset);
    const selected = this.store.selectedAssetId === asset.id;
    const duration = asset.type === "image" ? "Still" : formatShort(asset.duration);
    const detail =
      asset.type === "image"
        ? `${asset.width || "?"} × ${asset.height || "?"}`
        : asset.type === "video"
          ? `${asset.width || "?"} × ${asset.height || "?"}${asset.hasAudio ? " · sound" : ""}`
          : `${asset.channels || 2} ch · ${formatBytes(asset.size || 0)}`;
    const thumbInner = thumb
      ? `<img src="${escapeHtml(thumb)}" alt="" loading="lazy" draggable="false" />`
      : `<div class="audio-glyph">${seededBars(asset.id, 10, 7, 27)
          .map((h) => `<span style="height:${h}px"></span>`)
          .join("")}</div>`;
    return (
      `<div class="asset-card ${selected ? "selected" : ""}" data-asset-id="${escapeHtml(asset.id)}" draggable="true">` +
      `<div class="asset-thumb ${asset.type === "audio" ? "audio-thumb" : ""}">` +
      thumbInner +
      `<span class="asset-badge">${icon(typeIcon(asset.type))}${typeLabel(asset.type)}</span>` +
      `<span class="asset-duration">${escapeHtml(duration)}</span>` +
      `<button class="asset-card-add" data-action="add-asset" data-asset-id="${escapeHtml(asset.id)}" title="Add to timeline" aria-label="Add to timeline">${icon("plus")}</button>` +
      `</div>` +
      `<div class="asset-meta"><p class="asset-name" title="${escapeHtml(asset.name)}">${escapeHtml(asset.name)}</p>` +
      `<p class="asset-sub">${escapeHtml(detail)}</p></div>` +
      `</div>`
    );
  }

  audioHtml() {
    const assets = (this.store.project.assets || []).filter((asset) => asset.type === "audio");
    const rows = assets.map((asset) => {
      const playing = this.auditionAssetId === asset.id && this.audition && !this.audition.paused;
      return (
        `<div class="audio-row" data-asset-id="${escapeHtml(asset.id)}" draggable="true">` +
        `<div class="audio-row-icon">${icon("wave")}</div>` +
        `<div class="audio-row-text"><div class="audio-row-name" title="${escapeHtml(asset.name)}">${escapeHtml(asset.name)}</div>` +
        `<div class="audio-row-duration">${formatShort(asset.duration)} · ${escapeHtml(formatBytes(asset.size || 0))}</div></div>` +
        `<button class="audio-row-play" data-action="audition" data-asset-id="${escapeHtml(asset.id)}" title="${playing ? "Pause" : "Preview"}" aria-label="${playing ? "Pause" : "Preview"} audio">${icon(playing ? "pause" : "play")}</button>` +
        `</div>`
      );
    }).join("");
    return (
      `<div class="audio-actions">` +
      `<button class="action-tile" data-action="record">${icon("record")}<span>Voiceover</span><small>Record from your microphone</small></button>` +
      `<button class="action-tile" data-action="extract-audio">${icon("wave")}<span>Extract audio</span><small>Pull sound from the selected video</small></button>` +
      `</div>` +
      `<div class="lib-section"><p class="section-caption">Audio assets<span>${assets.length} item${assets.length === 1 ? "" : "s"}</span></p>` +
      (rows ? `<div class="audio-list">${rows}</div>` : `<div class="lib-empty">${icon("music")}<p>No audio yet. Import music or record a voiceover above.</p></div>`) +
      `</div>`
    );
  }

  textHtml() {
    const cards = TEXT_PRESETS.map((preset) =>
      `<button class="text-preset" data-preset-id="${escapeHtml(preset.id)}">` +
      `<span class="${escapeHtml(preset.sampleClass)}">${escapeHtml(preset.sample)}</span>` +
      `<small>${escapeHtml(preset.name)} · ${escapeHtml(preset.note)}</small>` +
      `</button>`
    ).join("");
    return (
      `<div class="text-preset-grid">${cards}` +
      `<button class="text-add-plain" data-action="add-plain-text">${icon("plus")} Plain text clip</button>` +
      `</div>`
    );
  }

  stickersHtml() {
    return STICKER_GROUPS.map((group) =>
      `<div class="lib-section"><p class="sticker-group-title">${escapeHtml(group.name)}</p>` +
      `<div class="sticker-grid">${group.items.map((emoji) =>
        `<button class="sticker-btn" data-sticker="${escapeHtml(emoji)}" title="Add ${escapeHtml(emoji)}">${emoji}</button>`
      ).join("")}</div></div>`
    ).join("");
  }

  effectsHtml() {
    const clip = this.store.selectedClip;
    const canApply = clip && (clip.type === "video" || clip.type === "image");
    const note = !clip
      ? `<div class="empty-selection-note"><strong>Select a visual clip</strong><br />Effect presets apply to the selected video or image.</div>`
      : !canApply
        ? `<div class="empty-selection-note"><strong>Color is king</strong><br />Effects are available on video and image clips.</div>`
        : "";
    const cards = EFFECTS.map((effect) => {
      const active = clip?.effect === effect.id;
      const filter = effect.id === "none" ? "" : effectCss(effect.id, {});
      return (
        `<button class="effect-card ${active ? "active" : ""}" data-effect-id="${escapeHtml(effect.id)}">` +
        `<div class="effect-swatch" style="${filter ? `filter:${filter};` : ""}">` +
        `<span>${escapeHtml(effect.name)}</span></div>` +
        `<div class="effect-name"><span>${escapeHtml(effect.name)}</span>${active ? icon("check") : ""}</div>` +
        `</button>`
      );
    }).join("");
    return (
      note +
      `<div class="effect-grid">${cards}</div>` +
      `<p class="effect-note">${canApply ? `${escapeHtml(clip.name)} selected. Presets stack with the color controls in the inspector.` : "Select a clip to apply a look."}</p>`
    );
  }

  transitionsHtml() {
    const clip = this.store.selectedClip;
    const canApply = clip && ["video", "image", "text", "sticker"].includes(clip.type);
    const note = !clip
      ? `<div class="empty-selection-note"><strong>Choose an incoming clip</strong><br />A transition animates the selected clip as it enters the cut.</div>`
      : !canApply
        ? `<div class="empty-selection-note"><strong>Not here</strong><br />Transitions apply to visual clips.</div>`
        : "";
    const cards = TRANSITIONS.map((transition) => {
      const active = (clip?.transition?.type || "none") === transition.id;
      return (
        `<button class="transition-card ${active ? "active" : ""}" data-transition-id="${escapeHtml(transition.id)}" data-type="${escapeHtml(transition.id)}">` +
        `<div class="transition-preview"><div class="transition-panel a"></div><div class="transition-panel b"></div></div>` +
        `<div class="transition-name"><span>${escapeHtml(transition.name)}</span><span>${transition.duration ? `${transition.duration.toFixed(1)}s` : "cut"}</span></div>` +
        `</button>`
      );
    }).join("");
    return (
      note +
      `<div class="transition-grid">${cards}</div>` +
      `<p class="effect-note">Transitions play at the start of the selected clip. Adjust duration in the inspector.</p>`
    );
  }

  adjustHtml() {
    const clip = this.store.selectedClip;
    if (!clip || !["video", "image", "text", "sticker"].includes(clip.type)) {
      return `<div class="empty-selection-note"><strong>Nothing to adjust</strong><br />Select a visual clip, then tune brightness, contrast and color here.</div>`;
    }
    const color = clip.color || {};
    return (
      `<div class="adjust-group">` +
      `<div class="adjust-header"><span>${escapeHtml(clip.name)}</span><button data-action="reset-color">Reset</button></div>` +
      ADJUSTMENTS.map((adjustment) => {
        const value = Number(color[adjustment.key]) || 0;
        return (
          `<div class="quick-slider">` +
          `<div class="quick-slider-label"><span>${adjustment.label}</span><b>${value}${adjustment.suffix}</b></div>` +
          `<input class="range" type="range" min="${adjustment.min}" max="${adjustment.max}" step="${adjustment.step}" value="${value}" data-color-key="${adjustment.key}" />` +
          `</div>`
        );
      }).join("") +
      `</div>` +
      `<button class="secondary-button" style="width:100%" data-action="project-settings">Project color &amp; format</button>`
    );
  }

  handleBodyClick(event) {
    const actionEl = event.target.closest("[data-action]");
    if (actionEl) {
      const action = actionEl.dataset.action;
      if (action === "import") return this.onImport();
      if (action === "add-asset") {
        event.stopPropagation();
        return this.onAddAsset(actionEl.dataset.assetId);
      }
      if (action === "record") return this.onRecordVoice();
      if (action === "extract-audio") return this.onExtractAudio();
      if (action === "add-plain-text") return this.onAddText("plain");
      if (action === "audition") return this.toggleAudition(actionEl.dataset.assetId, actionEl);
      if (action === "reset-color") return this.resetColor();
      if (action === "project-settings") return this.onOpenProjectSettings();
    }

    const filter = event.target.closest("[data-filter]");
    if (filter) {
      this.filter = filter.dataset.filter;
      const wrap = this.body.querySelector(".media-grid-wrap");
      if (wrap) wrap.innerHTML = this.mediaGridHtml(this.store.project.assets || []);
      for (const item of this.body.querySelectorAll("[data-filter]")) {
        item.classList.toggle("active", item.dataset.filter === this.filter);
      }
      return;
    }

    const preset = event.target.closest("[data-preset-id]");
    if (preset) {
      this.onAddText(preset.dataset.presetId);
      return;
    }

    const sticker = event.target.closest("[data-sticker]");
    if (sticker) {
      this.onAddSticker(sticker.dataset.sticker);
      return;
    }

    const effect = event.target.closest("[data-effect-id]");
    if (effect) {
      this.onApplyEffect(effect.dataset.effectId);
      return;
    }

    const transition = event.target.closest("[data-transition-id]");
    if (transition) {
      const item = TRANSITIONS.find((entry) => entry.id === transition.dataset.transitionId);
      if (item) this.onApplyTransition(item);
      return;
    }

    const audioRow = event.target.closest(".audio-row[data-asset-id]");
    if (audioRow) {
      this.store.selectAsset(audioRow.dataset.assetId);
      return;
    }

    const card = event.target.closest(".asset-card[data-asset-id]");
    if (card) {
      this.store.selectAsset(card.dataset.assetId);
    }
  }

  handleBodyInput(event) {
    const target = event.target;
    if (target.id === "mediaSearch") {
      this.search = target.value;
      const wrap = this.body.querySelector(".media-grid-wrap");
      if (wrap) wrap.innerHTML = this.mediaGridHtml(this.store.project.assets || []);
      return;
    }
    if (target.matches("[data-color-key]")) {
      const clip = this.store.selectedClip;
      if (!clip) return;
      if (!this.adjustGesture) {
        this.store.beginEdit("Adjust color");
        this.adjustGesture = true;
      }
      const value = Number(target.value);
      const key = target.dataset.colorKey;
      this.store.updateClipTransient(clip.id, (live) => {
        live.color = { ...(live.color || {}), [key]: value };
      }, "gesture");
      const label = target.closest(".quick-slider")?.querySelector("b");
      const definition = ADJUSTMENTS.find((item) => item.key === key);
      if (label && definition) label.textContent = `${value}${definition.suffix}`;
    }
  }

  handleBodyChange(event) {
    if (event.target.matches("[data-color-key]") && this.adjustGesture) {
      this.adjustGesture = false;
      this.store.commitEdit();
    }
  }

  toggleAudition(assetId, button) {
    if (this.auditionAssetId === assetId && this.audition) {
      this.stopAudition();
      this.render();
      return;
    }
    this.stopAudition();
    const asset = this.store.getAsset(assetId);
    if (!asset) return;
    const url = mediaUrl(asset.path);
    if (!url) return;
    const audio = new Audio(url);
    this.audition = audio;
    this.auditionAssetId = assetId;
    audio.volume = 0.9;
    audio.addEventListener("ended", () => {
      this.audition = null;
      this.auditionAssetId = null;
      this.render();
    });
    audio.play().then(() => {
      if (button) button.innerHTML = icon("pause");
      if (button) button.title = "Pause";
    }).catch(() => {
      this.stopAudition();
      this.onToast("Preview failed", `Could not play ${asset.name}.`, "error");
    });
  }

  stopAudition() {
    if (this.audition) {
      try {
        this.audition.pause();
        this.audition.removeAttribute("src");
      } catch {
        /* noop */
      }
    }
    this.audition = null;
    this.auditionAssetId = null;
  }

  resetColor() {
    const clip = this.store.selectedClip;
    if (!clip) return;
    this.store.edit(() => {
      clip.color = {
        brightness: 0,
        contrast: 0,
        saturation: 0,
        temperature: 0,
        blur: 0,
        sharpen: 0,
        vignette: 0
      };
    }, "Reset color", "project");
  }

  destroy() {
    this.stopAudition();
    this.unsubscribe?.();
  }
}

export function createLibrary(options) {
  return new LibraryPanel(options);
}
