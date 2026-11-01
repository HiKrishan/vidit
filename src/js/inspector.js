import {
  EFFECTS,
  FPS_OPTIONS,
  FONT_OPTIONS,
  KEYFRAME_PROPERTIES,
  RESOLUTION_PRESETS,
  TEXT_ANIMATIONS,
  TRANSITIONS,
  aspectRatioLabel,
  clipEnd,
  clipKeyframeList,
  defaultColor,
  hasKeyframes,
  keyframeValueAt,
  removeKeyframe,
  resolutionLabel,
  setKeyframe
} from "./model.js";
import {
  clamp,
  escapeHtml,
  formatBytes,
  formatDuration,
  formatShort,
  icon,
  resolvePath,
  setPath
} from "./utils.js";

const TYPE_ICON = {
  video: "film",
  image: "image",
  audio: "wave",
  text: "text",
  sticker: "sticker"
};

const TYPE_LABEL = {
  video: "Video",
  image: "Image",
  audio: "Audio",
  text: "Text",
  sticker: "Sticker"
};

const VISUAL_TYPES = new Set(["video", "image", "text", "sticker"]);

function trimNumber(value, decimals = 0) {
  const fixed = Number(value || 0).toFixed(Math.max(0, decimals));
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function isHex(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ""));
}

function colorValue(value, fallback = "#ffffff") {
  return isHex(value) ? String(value) : fallback;
}

export class Inspector {
  constructor({
    store,
    head,
    body,
    onToast,
    onOpenProjectSettings,
    actions = {}
  }) {
    this.store = store;
    this.head = head;
    this.body = body;
    this.onToast = typeof onToast === "function" ? onToast : () => {};
    this.onOpenProjectSettings =
      typeof onOpenProjectSettings === "function" ? onOpenProjectSettings : () => {};
    this.actions = actions || {};

    this.collapsed = new Set();
    this.gesture = null;
    this.gestureLabel = "";
    this.speedBase = null;
    this.renderQueued = false;

    try {
      const saved = JSON.parse(localStorage.getItem("vidit.inspector.sections") || "[]");
      if (Array.isArray(saved)) this.collapsed = new Set(saved);
    } catch {
      /* noop */
    }

    this.head.addEventListener("click", (event) => this.handleClick(event));
    this.body.addEventListener("click", (event) => this.handleClick(event));
    this.body.addEventListener("input", (event) => this.handleInput(event));
    this.body.addEventListener("change", (event) => this.handleChange(event));
    this.body.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target.matches(".text-input, .number-input")) {
        event.preventDefault();
        event.target.blur();
      }
    });

    this.unsubscribe = this.store.subscribe(({ reason }) => {
      if (reason === "playhead") {
        this.syncKeyframeUI();
        return;
      }
      if (["selection", "load", "project", "history", "assets", "save"].includes(reason)) {
        this.scheduleRender();
      }
    });

    this.render();
  }

  scheduleRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  currentMode() {
    if (this.store.selectedClip) return "clip";
    if (this.store.selectedAsset) return "asset";
    return "project";
  }

  render() {
    const scroll = this.body.scrollTop;
    this.renderHead();
    this.renderBody();
    this.body.scrollTop = scroll;
  }

  renderHead() {
    const mode = this.currentMode();
    if (mode === "clip") {
      const clip = this.store.selectedClip;
      const found = this.store.getClipWithTrack(clip.id);
      const track = found?.track;
      this.head.innerHTML =
        `<div class="inspector-title-row">` +
        `<div style="min-width:0">` +
        `<p class="inspector-type">${icon(TYPE_ICON[clip.type] || "film")}${escapeHtml(
          TYPE_LABEL[clip.type] || "Clip"
        )}${track ? ` · ${escapeHtml(track.name)}` : ""}</p>` +
        `<h2 class="inspector-name" title="${escapeHtml(clip.name)}">${escapeHtml(clip.name)}</h2>` +
        `<p class="inspector-meta">${formatShort(clip.start)} – ${formatShort(
          clipEnd(clip)
        )} · ${formatShort(clip.duration)}${clip.type === "video" || clip.type === "audio" ? ` · ${trimNumber(clip.speed || 1, 2)}×` : ""}</p>` +
        `</div>` +
        `<button class="small-icon-btn" data-action="focus-timeline" title="Show in timeline">${icon("grip")}</button>` +
        `</div>`;
      return;
    }

    if (mode === "asset") {
      const asset = this.store.selectedAsset;
      const detail =
        asset.type === "image"
          ? `${asset.width || "?"} × ${asset.height || "?"}`
          : `${formatDuration(asset.duration)}${asset.hasAudio ? " · sound" : ""}`;
      this.head.innerHTML =
        `<div class="inspector-title-row">` +
        `<div style="min-width:0">` +
        `<p class="inspector-type">${icon(TYPE_ICON[asset.type] || "file")}${escapeHtml(
          TYPE_LABEL[asset.type] || "Media"
        )} asset</p>` +
        `<h2 class="inspector-name" title="${escapeHtml(asset.name)}">${escapeHtml(asset.name)}</h2>` +
        `<p class="inspector-meta">${escapeHtml(detail)} · ${escapeHtml(formatBytes(asset.size || 0))}</p>` +
        `</div>` +
        `<button class="small-icon-btn" data-action="add-selected-asset" title="Add to timeline">${icon("plus")}</button>` +
        `</div>`;
      return;
    }

    const project = this.store.project;
    this.head.innerHTML =
      `<div class="inspector-title-row">` +
      `<div style="min-width:0">` +
      `<p class="inspector-type">${icon("sliders")}Project</p>` +
      `<h2 class="inspector-name" title="${escapeHtml(project.name)}">${escapeHtml(project.name)}</h2>` +
      `<p class="inspector-meta">${escapeHtml(aspectRatioLabel(project))} · ${escapeHtml(
        resolutionLabel(project)
      )} · ${Number(project.settings.fps) || 30} fps</p>` +
      `</div>` +
      `<button class="small-icon-btn" data-action="open-project-settings" title="Project settings">${icon(
        "settings"
      )}</button>` +
      `</div>`;
  }

  renderBody() {
    const mode = this.currentMode();
    if (mode === "clip") this.body.innerHTML = this.clipHtml();
    else if (mode === "asset") this.body.innerHTML = this.assetHtml();
    else this.body.innerHTML = this.projectHtml();
  }

  /* ------------------------------- Controls ------------------------------- */

  section(id, title, content) {
    const collapsed = this.collapsed.has(id);
    return (
      `<section class="inspector-section ${collapsed ? "collapsed" : ""}" data-section="${escapeHtml(
        id
      )}">` +
      `<button class="inspector-section-head" data-section-toggle="${escapeHtml(id)}">` +
      `<span>${escapeHtml(title)}</span>${icon("chevron-down")}</button>` +
      `<div class="section-body">${content}</div>` +
      `</section>`
    );
  }

  rangeField({
    label,
    bind,
    value,
    min,
    max,
    step = 1,
    factor = 1,
    unit = "",
    decimals = 0,
    keyframe = null
  }) {
    const display = Number(value || 0) / factor;
    const attrs = [
      `class="range"`,
      `type="range"`,
      `min="${min}"`,
      `max="${max}"`,
      `step="${step}"`,
      `value="${clamp(display, min, max)}"`,
      `data-bind="${escapeHtml(bind)}"`,
      `data-factor="${factor}"`
    ];
    if (unit) attrs.push(`data-unit="${escapeHtml(unit)}"`);
    if (decimals) attrs.push(`data-decimals="${decimals}"`);
    const keyframeButton = keyframe
      ? `<button class="keyframe-toggle${keyframe.active ? " active" : ""}${keyframe.has ? " has" : ""}" type="button" data-keyframe="${escapeHtml(
          keyframe.prop
        )}" title="${keyframe.active ? "Remove keyframe at playhead" : "Add keyframe at playhead"}" aria-label="${
          keyframe.active ? "Remove keyframe" : "Add keyframe"
        }" aria-pressed="${keyframe.active ? "true" : "false"}"><span class="kf-diamond"></span></button>`
      : "";
    return (
      `<div class="field">` +
      `<div class="field-head"><span class="field-label">${escapeHtml(label)}</span>` +
      `<span class="field-head-right"><span class="field-value" data-readout="${escapeHtml(
        bind
      )}">${trimNumber(display, decimals)}${escapeHtml(unit)}</span>${keyframeButton}</span></div>` +
      `<input ${attrs.join(" ")} />` +
      `</div>`
    );
  }

  numberField({ label, bind, value, min = 0, max = 9999, step = 0.05, factor = 1, unit = "" }) {
    return (
      `<div class="field">` +
      `<div class="field-head"><span class="field-label">${escapeHtml(label)}</span>` +
      `<span class="field-value">${escapeHtml(unit)}</span></div>` +
      `<input class="number-input" style="width:100%" type="number" min="${min}" max="${max}" step="${step}" ` +
      `value="${trimNumber(Number(value || 0) / factor, 3)}" data-bind="${escapeHtml(bind)}" data-factor="${factor}" />` +
      `</div>`
    );
  }

  textField({ label, bind, value, placeholder = "", maxlength = 120 }) {
    return (
      `<div class="field">` +
      `<div class="field-head"><span class="field-label">${escapeHtml(label)}</span></div>` +
      `<input class="text-input" type="text" maxlength="${maxlength}" placeholder="${escapeHtml(
        placeholder
      )}" value="${escapeHtml(value)}" data-bind="${escapeHtml(bind)}" data-type="string" />` +
      `</div>`
    );
  }

  textAreaField({ label, bind, value, rows = 3 }) {
    return (
      `<div class="field">` +
      `<div class="field-head"><span class="field-label">${escapeHtml(label)}</span></div>` +
      `<textarea class="textarea-input" rows="${rows}" data-bind="${escapeHtml(
        bind
      )}" data-type="string">${escapeHtml(value)}</textarea>` +
      `</div>`
    );
  }

  selectField({ label, bind, value, options, numeric = false }) {
    const html = options
      .map(
        (option) =>
          `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(value) ? "selected" : ""}>${escapeHtml(
            option.label
          )}</option>`
      )
      .join("");
    return (
      `<div class="field">` +
      `<div class="field-head"><span class="field-label">${escapeHtml(label)}</span></div>` +
      `<select class="select-input" data-bind="${escapeHtml(bind)}" ${numeric ? 'data-type="number"' : ""}>${html}</select>` +
      `</div>`
    );
  }

  colorField(label, bind, value) {
    const safe = colorValue(value);
    return (
      `<div class="field">` +
      `<div class="field-head"><span class="field-label">${escapeHtml(label)}</span></div>` +
      `<div class="color-field"><input type="color" value="${safe}" data-bind="${escapeHtml(
        bind
      )}" data-type="string" /><span>${safe.toUpperCase()}</span></div>` +
      `</div>`
    );
  }

  segmented(bind, value, options) {
    return (
      `<div class="segmented">` +
      options
        .map(
          (option) =>
            `<button type="button" data-bind="${escapeHtml(bind)}" data-value="${escapeHtml(
              option.value
            )}" class="${String(option.value) === String(value) ? "active" : ""}">${escapeHtml(
              option.label
            )}</button>`
        )
        .join("") +
      `</div>`
    );
  }

  toggleRow(label, bind, on) {
    return (
      `<div class="toggle-row"><span>${escapeHtml(label)}</span>` +
      `<button class="switch ${on ? "on" : ""}" type="button" data-toggle="${escapeHtml(
        bind
      )}" aria-pressed="${on ? "true" : "false"}" aria-label="${escapeHtml(label)}"></button></div>`
    );
  }

  row(label, value) {
    return (
      `<div class="toggle-row"><span>${escapeHtml(label)}</span>` +
      `<b class="field-value" style="font-weight:500">${escapeHtml(value)}</b></div>`
    );
  }

  /* --------------------------------- Modes -------------------------------- */

  projectHtml() {
    const project = this.store.project;
    const currentResolution = `${project.settings.width}x${project.settings.height}`;
    const presets = RESOLUTION_PRESETS.map((preset) => ({
      value: `${preset.width}x${preset.height}`,
      label: `${preset.label} · ${preset.width}×${preset.height} (${preset.ratio})`
    }));
    if (!presets.some((item) => item.value === currentResolution)) {
      presets.unshift({ value: currentResolution, label: `Current · ${currentResolution}` });
    }
    const fpsOptions = FPS_OPTIONS.map((fps) => ({ value: fps, label: `${fps} fps` }));
    if (!FPS_OPTIONS.includes(Number(project.settings.fps))) {
      fpsOptions.unshift({ value: Number(project.settings.fps), label: `${project.settings.fps} fps` });
    }

    const format =
      this.textField({ label: "Project name", bind: "project.name", value: project.name, maxlength: 80 }) +
      `<div class="field"><div class="field-head"><span class="field-label">Frame size</span></div>` +
      `<select class="select-input" data-project-resolution>` +
      presets
        .map(
          (item) =>
            `<option value="${escapeHtml(item.value)}" ${item.value === currentResolution ? "selected" : ""}>${escapeHtml(
              item.label
            )}</option>`
        )
        .join("") +
      `</select></div>` +
      `<div class="field-row">` +
      `<div class="field" style="flex:1">` +
      `<div class="field-head"><span class="field-label">Width</span></div>` +
      `<input class="number-input" style="width:100%" type="number" min="320" max="7680" step="2" value="${project.settings.width}" data-bind="project.settings.width" />` +
      `</div>` +
      `<div class="field" style="flex:1">` +
      `<div class="field-head"><span class="field-label">Height</span></div>` +
      `<input class="number-input" style="width:100%" type="number" min="320" max="7680" step="2" value="${project.settings.height}" data-bind="project.settings.height" />` +
      `</div></div>` +
      this.selectField({
        label: "Frame rate",
        bind: "project.settings.fps",
        value: project.settings.fps,
        options: fpsOptions,
        numeric: true
      }) +
      this.colorField("Background", "project.settings.background", project.settings.background);

    const stats = (project.assets || []).length;
    const clips = (project.tracks || []).reduce((sum, track) => sum + (track.clips || []).length, 0);
    const story =
      this.row("Media assets", String(stats)) +
      this.row("Clips", String(clips)) +
      this.row("Tracks", String((project.tracks || []).length)) +
      this.row("Duration", formatDuration(this.store.duration)) +
      this.row("Aspect", aspectRatioLabel(project)) +
      `<div class="btn-row" style="margin-top:12px">` +
      `<button class="secondary-button" type="button" data-action="open-project-settings">${icon(
        "settings"
      )}Project settings</button>` +
      `</div>`;

    return (
      this.section("project-format", "Format", format) +
      this.section("project-story", "Project", story) +
      `<div class="inspector-empty"><strong>Nothing selected</strong>Select a clip to edit its timing, transform, text, color and sound. Import media or drag a clip to the timeline to begin.</div>`
    );
  }

  assetHtml() {
    const asset = this.store.selectedAsset;
    if (!asset) return "";
    const details = [
      ["Type", TYPE_LABEL[asset.type] || asset.type],
      ["Duration", asset.type === "image" ? "Still image" : formatDuration(asset.duration)],
      ["Dimensions", asset.width && asset.height ? `${asset.width} × ${asset.height}` : "—"],
      ["Codec", asset.codec || "—"],
      ["Audio", asset.hasAudio ? `${asset.channels || 2} ch` : "None"],
      ["Size", formatBytes(asset.size || 0)]
    ]
      .map(([label, value]) => this.row(label, value))
      .join("");

    const path =
      `<div class="field"><div class="field-head"><span class="field-label">Source path</span></div>` +
      `<p class="field-value" style="word-break:break-all;line-height:1.5;user-select:text">${escapeHtml(
        asset.path
      )}</p></div>`;

    const actions =
      `<div class="btn-row" style="margin-bottom:7px">` +
      `<button class="secondary-button" type="button" data-action="add-selected-asset">${icon(
        "plus"
      )}Add to timeline</button>` +
      `</div>` +
      `<div class="btn-row" style="margin-bottom:7px">` +
      (asset.type === "video"
        ? `<button class="secondary-button" type="button" data-action="freeze-asset">${icon(
            "camera"
          )}Freeze frame</button>`
        : "") +
      (asset.hasAudio || asset.type === "audio"
        ? `<button class="secondary-button" type="button" data-action="extract-asset">${icon(
            "wave"
          )}Extract audio</button>`
        : "") +
      `</div>` +
      `<div class="btn-row">` +
      `<button class="secondary-button" type="button" data-action="reveal-asset">${icon(
        "folder"
      )}Reveal</button>` +
      `<button class="secondary-button danger-button" type="button" data-action="remove-asset">${icon(
        "trash"
      )}Remove</button>` +
      `</div>`;

    return (
      this.section("asset-details", "Asset", details + path) +
      this.section("asset-actions", "Actions", actions)
    );
  }

  clipHtml() {
    const clip = this.store.selectedClip;
    if (!clip) return "";
    const found = this.store.getClipWithTrack(clip.id);
    const track = found?.track;
    const asset = clip.assetId ? this.store.getAsset(clip.assetId) : null;
    const isVisual = VISUAL_TYPES.has(clip.type);
    const isTimedMedia = clip.type === "video" || clip.type === "audio";
    const localTime = clamp(this.store.playhead - (Number(clip.start) || 0), 0, Math.max(0.05, clip.duration));
    const propertyValue = (prop) => keyframeValueAt(clip, prop, localTime);
    const keyframe = (prop) => ({
      prop,
      has: hasKeyframes(clip, prop),
      active: clipKeyframeList(clip, prop).some((item) => Math.abs(item.t - localTime) <= 0.03)
    });

    const basics =
      this.textField({ label: "Clip name", bind: "clip.name", value: clip.name, maxlength: 120 }) +
      `<div class="field-row">` +
      `<div class="field" style="flex:1">` +
      `<div class="field-head"><span class="field-label">Start</span><span class="field-value">s</span></div>` +
      `<input class="number-input" style="width:100%" type="number" min="0" step="0.05" value="${trimNumber(
        clip.start,
        2
      )}" data-bind="clip.start" />` +
      `</div>` +
      `<div class="field" style="flex:1">` +
      `<div class="field-head"><span class="field-label">Duration</span><span class="field-value">s</span></div>` +
      `<input class="number-input" style="width:100%" type="number" min="0.05" step="0.05" value="${trimNumber(
        clip.duration,
        2
      )}" data-bind="clip.duration" />` +
      `</div>` +
      `</div>` +
      (isTimedMedia
        ? this.numberField({
            label: "Source in",
            bind: "clip.trimIn",
            value: clip.trimIn,
            min: 0,
            max: Math.max(0, Number(asset?.duration) || 9999),
            step: 0.05,
            unit: "s"
          })
        : "") +
      (isTimedMedia
        ? this.rangeField({
            label: "Speed",
            bind: "clip.speed",
            value: clip.speed,
            min: 25,
            max: 400,
            step: 1,
            factor: 0.01,
            unit: "×",
            decimals: 2
          })
        : "") +
      `<div class="btn-row" style="margin-top:4px">` +
      `<button class="icon-text-btn" type="button" data-action="split">${icon("split")}Split</button>` +
      `<button class="icon-text-btn" type="button" data-action="duplicate">${icon(
        "copy"
      )}Duplicate</button>` +
      `<button class="icon-text-btn danger-button" type="button" data-action="delete">${icon(
        "trash"
      )}Delete</button>` +
      `</div>`;

    const transform = isVisual
      ? this.rangeField({
          label: "Position X",
          bind: "clip.x",
          value: propertyValue("x"),
          min: -100,
          max: 100,
          step: 1,
          factor: 0.01,
          unit: "%",
          keyframe: keyframe("x")
        }) +
        this.rangeField({
          label: "Position Y",
          bind: "clip.y",
          value: propertyValue("y"),
          min: -100,
          max: 100,
          step: 1,
          factor: 0.01,
          unit: "%",
          keyframe: keyframe("y")
        }) +
        this.rangeField({
          label: "Scale",
          bind: "clip.scale",
          value: propertyValue("scale"),
          min: 5,
          max: 400,
          step: 1,
          factor: 0.01,
          unit: "%",
          keyframe: keyframe("scale")
        }) +
        this.rangeField({
          label: "Rotation",
          bind: "clip.rotation",
          value: propertyValue("rotation"),
          min: -180,
          max: 180,
          step: 1,
          unit: "°",
          keyframe: keyframe("rotation")
        }) +
        this.rangeField({
          label: "Opacity",
          bind: "clip.opacity",
          value: propertyValue("opacity"),
          min: 0,
          max: 100,
          step: 1,
          factor: 0.01,
          unit: "%",
          keyframe: keyframe("opacity")
        }) +
        `<div class="field"><div class="field-head"><span class="field-label">Framing</span></div>` +
        this.segmented("clip.fit", clip.fit, [
          { value: "cover", label: "Fill frame" },
          { value: "contain", label: "Fit inside" }
        ]) +
        `</div>` +
        this.toggleRow("Flip horizontal", "clip.flipH", clip.flipH) +
        this.toggleRow("Flip vertical", "clip.flipV", clip.flipV)
      : "";

    const text = clip.type === "text" || clip.type === "sticker"
      ? this.textAreaField({
          label: clip.type === "sticker" ? "Sticker glyph" : "Text content",
          bind: "text.content",
          value: clip.text?.content || "",
          rows: clip.type === "sticker" ? 2 : 3
        }) +
        this.selectField({
          label: "Font",
          bind: "text.fontFamily",
          value: clip.text?.fontFamily || "Instrument Sans",
          options: [
            { value: "Segoe UI Emoji", label: "Segoe UI Emoji" },
            ...FONT_OPTIONS
          ].filter((item, index, list) => list.findIndex((entry) => entry.value === item.value) === index)
        }) +
        `<div class="field-row">` +
        this.numberField({
          label: "Size",
          bind: "text.fontSize",
          value: clip.text?.fontSize,
          min: 8,
          max: 400,
          step: 1,
          unit: "px"
        }) +
        `<div class="field" style="flex:1"><div class="field-head"><span class="field-label">Weight</span></div>` +
        `<select class="select-input" data-bind="text.weight" data-type="number">` +
        [300, 400, 500, 550, 600, 700]
          .map(
            (weight) =>
              `<option value="${weight}" ${Number(clip.text?.weight) === weight ? "selected" : ""}>${weight}</option>`
          )
          .join("") +
        `</select></div></div>` +
        this.colorField("Color", "text.color", clip.text?.color) +
        `<div class="field"><div class="field-head"><span class="field-label">Alignment</span></div>` +
        this.segmented("text.align", clip.text?.align, [
          { value: "left", label: "Left" },
          { value: "center", label: "Center" },
          { value: "right", label: "Right" }
        ]) +
        `</div>` +
        this.rangeField({
          label: "Text X",
          bind: "text.x",
          value: clip.text?.x,
          min: 0,
          max: 100,
          step: 1,
          factor: 0.01,
          unit: "%"
        }) +
        this.rangeField({
          label: "Text Y",
          bind: "text.y",
          value: clip.text?.y,
          min: 0,
          max: 100,
          step: 1,
          factor: 0.01,
          unit: "%"
        }) +
        this.rangeField({
          label: "Text width",
          bind: "text.width",
          value: clip.text?.width,
          min: 10,
          max: 100,
          step: 1,
          factor: 0.01,
          unit: "%"
        }) +
        this.rangeField({
          label: "Padding",
          bind: "text.padding",
          value: clip.text?.padding,
          min: 0,
          max: 100,
          step: 1,
          unit: "px"
        }) +
        this.rangeField({
          label: "Line height",
          bind: "text.lineHeight",
          value: clip.text?.lineHeight,
          min: 70,
          max: 300,
          step: 1,
          factor: 0.01,
          decimals: 2
        }) +
        this.rangeField({
          label: "Letter spacing",
          bind: "text.letterSpacing",
          value: clip.text?.letterSpacing,
          min: -20,
          max: 40,
          step: 0.5
        }) +
        this.colorField("Background", "text.backgroundColor", clip.text?.backgroundColor) +
        this.rangeField({
          label: "Background opacity",
          bind: "text.backgroundOpacity",
          value: clip.text?.backgroundOpacity,
          min: 0,
          max: 100,
          step: 1,
          factor: 0.01,
          unit: "%"
        }) +
        this.toggleRow("Drop shadow", "text.shadow", Boolean(clip.text?.shadow)) +
        this.rangeField({
          label: "Stroke width",
          bind: "text.strokeWidth",
          value: clip.text?.strokeWidth,
          min: 0,
          max: 24,
          step: 0.5,
          unit: "px"
        }) +
        this.colorField("Stroke color", "text.strokeColor", clip.text?.strokeColor) +
        this.toggleRow("Accent bar", "text.accentBar", Boolean(clip.text?.accentBar)) +
        (clip.text?.accentBar
          ? this.colorField("Accent color", "text.accentColor", clip.text?.accentColor)
          : "") +
        `<div class="field"><div class="field-head"><span class="field-label">Text animation</span></div>` +
        `<select class="select-input" data-text-animation>` +
        TEXT_ANIMATIONS.map(
          (animation) =>
            `<option value="${escapeHtml(animation.id)}" ${
              (clip.text?.animation || "none") === animation.id ? "selected" : ""
            }>${escapeHtml(animation.name)}</option>`
        ).join("") +
        `</select></div>`
      : "";

    const effectOptions = EFFECTS.map((effect) => ({ value: effect.id, label: effect.name }));
    const color = clip.color || defaultColor();
    const look = isVisual
      ? this.selectField({
          label: "Look preset",
          bind: "clip.effect",
          value: clip.effect || "none",
          options: effectOptions
        }) +
        this.rangeField({
          label: "Brightness",
          bind: "color.brightness",
          value: color.brightness,
          min: -100,
          max: 100,
          step: 1
        }) +
        this.rangeField({
          label: "Contrast",
          bind: "color.contrast",
          value: color.contrast,
          min: -100,
          max: 100,
          step: 1
        }) +
        this.rangeField({
          label: "Saturation",
          bind: "color.saturation",
          value: color.saturation,
          min: -100,
          max: 100,
          step: 1
        }) +
        this.rangeField({
          label: "Temperature",
          bind: "color.temperature",
          value: color.temperature,
          min: -100,
          max: 100,
          step: 1
        }) +
        this.rangeField({
          label: "Blur",
          bind: "color.blur",
          value: color.blur,
          min: 0,
          max: 30,
          step: 0.5,
          unit: "px",
          decimals: 1
        }) +
        this.rangeField({
          label: "Sharpen",
          bind: "color.sharpen",
          value: color.sharpen,
          min: 0,
          max: 100,
          step: 1
        }) +
        this.rangeField({
          label: "Vignette",
          bind: "color.vignette",
          value: color.vignette,
          min: 0,
          max: 100,
          step: 1,
          unit: "%"
        }) +
        `<div class="btn-row"><button class="icon-text-btn" type="button" data-action="reset-color">${icon(
          "refresh"
        )}Reset color</button></div>`
      : "";

    const duration = Math.max(0.05, Number(clip.duration) || 0);
    const fades =
      this.rangeField({
        label: "Fade in",
        bind: "clip.fades.in",
        value: clip.fades?.in,
        min: 0,
        max: duration,
        step: 0.05,
        unit: "s",
        decimals: 2
      }) +
      this.rangeField({
        label: "Fade out",
        bind: "clip.fades.out",
        value: clip.fades?.out,
        min: 0,
        max: duration,
        step: 0.05,
        unit: "s",
        decimals: 2
      });

    const transition =
      `<div class="field"><div class="field-head"><span class="field-label">Transition in</span></div>` +
      `<select class="select-input" data-transition-select>` +
      TRANSITIONS.map(
        (item) =>
          `<option value="${escapeHtml(item.id)}" ${
            (clip.transition?.type || "none") === item.id ? "selected" : ""
          }>${escapeHtml(item.name)}</option>`
      ).join("") +
      `</select></div>` +
      ((clip.transition?.type || "none") !== "none"
        ? this.rangeField({
            label: "Transition length",
            bind: "clip.transition.duration",
            value: clip.transition?.duration,
            min: 0.05,
            max: Math.max(0.05, Math.min(5, duration)),
            step: 0.05,
            unit: "s",
            decimals: 2
          })
        : `<p class="modal-copy" style="font-size:9px;margin:0">Transitions animate the selected clip as it enters the cut.</p>`);

    const hasAudio = Boolean(asset?.hasAudio) || clip.type === "audio";
    const audio = hasAudio
      ? this.rangeField({
          label: "Clip volume",
          bind: "clip.volume",
          value: propertyValue("volume"),
          min: 0,
          max: 200,
          step: 1,
          factor: 0.01,
          unit: "%",
          keyframe: keyframe("volume")
        }) +
        (track
          ? this.rangeField({
              label: "Track volume",
              bind: "track.volume",
              value: track.volume ?? 1,
              min: 0,
              max: 100,
              step: 1,
              factor: 0.01,
              unit: "%"
            })
          : "") +
        `<div class="btn-row"><button class="icon-text-btn" type="button" data-action="extract-clip">${icon(
          "wave"
        )}Extract audio</button>` +
        (clip.type === "video"
          ? `<button class="icon-text-btn" type="button" data-action="freeze-clip">${icon(
              "camera"
            )}Freeze</button>`
          : "") +
        `</div>`
      : "";

    return (
      this.section("clip-basics", "Clip", basics) +
      (isVisual ? this.section("clip-transform", "Transform", transform) : "") +
      (clip.type === "text" || clip.type === "sticker"
        ? this.section("clip-text", clip.type === "sticker" ? "Sticker" : "Text", text)
        : "") +
      (isVisual ? this.section("clip-look", "Color & look", look) : "") +
      (hasAudio ? this.section("clip-audio", "Sound", audio) : "") +
      this.section("clip-fades", "Fades", fades) +
      (isVisual ? this.section("clip-transition", "Transition", transition) : "")
    );
  }

  /* -------------------------------- Handlers ------------------------------- */

  targetFor(bind) {
    const parts = String(bind || "").split(".");
    const scope = parts.shift();
    const path = parts.join(".");
    const clip = this.store.selectedClip;
    if (!path) return null;
    if (scope === "project") return { object: this.store.project, path };
    if (scope === "clip") return clip ? { object: clip, path } : null;
    if (scope === "text") return clip?.text ? { object: clip.text, path } : null;
    if (scope === "color") return clip ? { object: (clip.color ||= defaultColor()), path } : null;
    if (scope === "track") {
      const found = clip ? this.store.getClipWithTrack(clip.id) : null;
      return found ? { object: found.track, path } : null;
    }
    return null;
  }

  labelForBind(bind) {
    if (String(bind).startsWith("project.")) return "Project settings";
    if (String(bind).startsWith("track.")) return "Track volume";
    if (String(bind).startsWith("text.")) return "Edit text";
    if (String(bind).startsWith("color.")) return "Adjust color";
    if (bind === "clip.speed") return "Change speed";
    if (String(bind).includes("fades")) return "Change fade";
    if (String(bind).includes("transition")) return "Change transition";
    if (String(bind) === "clip.name") return "Rename clip";
    return "Edit clip";
  }

  handleClick(event) {
    const sectionToggle = event.target.closest("[data-section-toggle]");
    if (sectionToggle) {
      const id = sectionToggle.dataset.sectionToggle;
      if (this.collapsed.has(id)) this.collapsed.delete(id);
      else this.collapsed.add(id);
      try {
        localStorage.setItem("vidit.inspector.sections", JSON.stringify([...this.collapsed]));
      } catch {
        /* noop */
      }
      sectionToggle.closest(".inspector-section")?.classList.toggle("collapsed", this.collapsed.has(id));
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      this.runAction(actionButton.dataset.action, actionButton);
      return;
    }

    const keyframeButton = event.target.closest("[data-keyframe]");
    if (keyframeButton) {
      this.toggleKeyframe(keyframeButton.dataset.keyframe);
      return;
    }

    const choice = event.target.closest("[data-bind][data-value]");
    if (choice) {
      this.applyChoice(choice);
      return;
    }

    const toggle = event.target.closest("[data-toggle]");
    if (toggle) this.applyToggle(toggle);
  }

  keyframeProperty(bind) {
    const match = /^clip\.(x|y|scale|rotation|opacity|volume)$/.exec(String(bind || ""));
    return match ? match[1] : null;
  }

  localPlayhead(clip = this.store.selectedClip) {
    if (!clip) return 0;
    return clamp(
      (Number(this.store.playhead) || 0) - (Number(clip.start) || 0),
      0,
      Math.max(0.05, Number(clip.duration) || 0.05)
    );
  }

  toggleKeyframe(prop) {
    const clip = this.store.selectedClip;
    if (!clip || !KEYFRAME_PROPERTIES.includes(prop)) return;
    const local = this.localPlayhead(clip);
    const exists = clipKeyframeList(clip, prop).some((item) => Math.abs(item.t - local) <= 0.03);
    this.store.edit(
      () => {
        if (exists) removeKeyframe(clip, prop, local);
        else setKeyframe(clip, prop, local, keyframeValueAt(clip, prop, local));
      },
      exists ? "Remove keyframe" : "Add keyframe",
      "project",
      { clipId: clip.id }
    );
    this.syncKeyframeUI();
  }

  syncKeyframeToggles() {
    const clip = this.store.selectedClip;
    if (!clip) return;
    const local = this.localPlayhead(clip);
    for (const button of this.body.querySelectorAll("[data-keyframe]")) {
      const prop = button.dataset.keyframe;
      const list = clipKeyframeList(clip, prop);
      const active = list.some((item) => Math.abs(item.t - local) <= 0.03);
      button.classList.toggle("active", active);
      button.classList.toggle("has", list.length > 0);
      button.title = active ? "Remove keyframe at playhead" : "Add keyframe at playhead";
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  syncKeyframeFields() {
    const clip = this.store.selectedClip;
    if (!clip || this.gesture) return;
    const local = this.localPlayhead(clip);
    for (const input of this.body.querySelectorAll("[data-bind]")) {
      const prop = this.keyframeProperty(input.dataset.bind);
      if (!prop || !hasKeyframes(clip, prop)) continue;
      const value = keyframeValueAt(clip, prop, local);
      const factor = Number(input.dataset.factor) || 1;
      const decimals = Number(input.dataset.decimals) || 0;
      const unit = input.dataset.unit || "";
      if (document.activeElement !== input) input.value = trimNumber(value / factor, 3);
      for (const node of this.body.querySelectorAll("[data-readout]")) {
        if (node.dataset.readout !== input.dataset.bind) continue;
        node.textContent = `${trimNumber(value / factor, decimals)}${unit}`;
      }
    }
  }

  syncKeyframeUI() {
    this.syncKeyframeToggles();
    this.syncKeyframeFields();
  }

  readControlValue(el) {
    const factor = el.dataset.factor ? Number(el.dataset.factor) : 1;
    if (el.type === "checkbox") return el.checked;
    if (el.dataset.type === "string") return el.value;
    const raw = Number(el.value);
    if (!Number.isFinite(raw)) return null;
    const value = raw * (Number.isFinite(factor) && factor !== 0 ? factor : 1);
    return el.dataset.type === "number" || el.type === "number" || el.type === "range"
      ? Number(value.toFixed(6))
      : value;
  }

  handleInput(event) {
    const el = event.target.closest("[data-bind]");
    if (!el) return;
    const target = this.targetFor(el.dataset.bind);
    if (!target) return;
    const bind = el.dataset.bind;
    let value = this.readControlValue(el);
    if (value == null) return;

    if (bind === "project.settings.width" || bind === "project.settings.height") {
      value = clamp(Math.round(value / 2) * 2, 320, 7680);
    } else if (bind === "project.settings.fps") {
      value = clamp(Math.round(value), 1, 120);
    } else if (bind === "clip.start") {
      value = Math.max(0, value);
    } else if (bind === "clip.duration") {
      value = Math.max(0.05, value);
    } else if (bind === "clip.trimIn") {
      value = Math.max(0, value);
    } else if (bind === "clip.speed") {
      value = clamp(value, 0.25, 4);
    } else if (bind === "clip.opacity") {
      value = clamp(value, 0, 1);
    }

    if (!this.gesture) {
      this.store.beginEdit(this.labelForBind(bind));
      this.gesture = el;
      this.gestureLabel = this.labelForBind(bind);
    }

    if (bind === "clip.speed") {
      const clip = this.store.selectedClip;
      if (clip) {
        if (!this.speedBase) this.speedBase = { speed: Number(clip.speed) || 1, duration: Number(clip.duration) || 0 };
        if (clip.type === "video" || clip.type === "audio") {
          const nextDuration = (this.speedBase.duration * this.speedBase.speed) / value;
          clip.duration = Math.max(0.05, Number(nextDuration.toFixed(3)));
        }
      }
    }

    setPath(target.object, target.path, value);
    const keyframeProp = this.keyframeProperty(bind);
    const selected = this.store.selectedClip;
    if (keyframeProp && selected && hasKeyframes(selected, keyframeProp)) {
      setKeyframe(selected, keyframeProp, this.localPlayhead(selected), value);
    }
    this.store.transient(() => {}, "gesture", { clipId: this.store.selectedClipId });
    this.updateReadout(el, target.object, target.path);
    this.syncKeyframeUI();
    this.syncLinkedDurationField();
  }

  syncLinkedDurationField() {
    const clip = this.store.selectedClip;
    if (!clip) return;
    const input = this.body.querySelector('[data-bind="clip.duration"]');
    if (input && input !== document.activeElement) input.value = trimNumber(clip.duration, 3);
  }

  updateReadout(el, object, path) {
    const bind = el.dataset.bind;
    if (!bind) return;
    if (el.type === "color") {
      const field = el.closest(".color-field");
      const span = field?.querySelector("span");
      if (span) span.textContent = String(el.value || "").toUpperCase();
      return;
    }
    const actual = resolvePath(object, path);
    if (actual == null || typeof actual === "object") return;
    const factor = Number(el.dataset.factor) || 1;
    const decimals = Number(el.dataset.decimals) || 0;
    const unit = el.dataset.unit || "";
    for (const node of this.body.querySelectorAll("[data-readout]")) {
      if (node.dataset.readout !== bind) continue;
      node.textContent = `${trimNumber(Number(actual) / factor, decimals)}${unit}`;
    }
  }

  handleChange(event) {
    const target = event.target;

    if (target.matches("[data-project-resolution]")) {
      this.applyResolution(target.value);
      return;
    }
    if (target.matches("[data-transition-select]")) {
      this.applyTransition(target.value);
      return;
    }
    if (target.matches("[data-text-animation]")) {
      this.applyTextAnimation(target.value);
      return;
    }

    if (target.matches("[data-bind]") && this.gesture) {
      this.gesture = null;
      this.speedBase = null;
      this.store.commitEdit();
    }
  }

  applyChoice(el) {
    const target = this.targetFor(el.dataset.bind);
    if (!target) return;
    const kind = el.dataset.kind;
    let value = el.dataset.value;
    if (kind === "number") value = Number(value);
    else if (kind === "bool") value = value === "true";
    const clipId = this.store.selectedClipId;
    this.store.edit(
      () => setPath(target.object, target.path, value),
      this.labelForBind(el.dataset.bind),
      "control",
      { clipId }
    );
  }

  applyToggle(el) {
    const target = this.targetFor(el.dataset.toggle);
    if (!target) return;
    const current = Boolean(resolvePath(target.object, target.path));
    this.store.edit(
      () => setPath(target.object, target.path, !current),
      this.labelForBind(el.dataset.toggle),
      "control",
      { clipId: this.store.selectedClipId }
    );
  }

  applyResolution(value) {
    const preset = RESOLUTION_PRESETS.find((item) => `${item.width}x${item.height}` === value);
    if (!preset) return;
    this.store.edit(() => {
      this.store.project.settings.width = preset.width;
      this.store.project.settings.height = preset.height;
    }, "Project format", "project");
  }

  applyTransition(id) {
    const item = TRANSITIONS.find((transition) => transition.id === id);
    if (!item) return;
    this.store.applyTransition(item);
  }

  applyTextAnimation(id) {
    const item = TEXT_ANIMATIONS.find((animation) => animation.id === id);
    if (!item) return;
    this.store.applyTextAnimation(item);
  }

  async runAction(action, el) {
    const clip = this.store.selectedClip;
    const asset = this.store.selectedAsset || (clip?.assetId ? this.store.getAsset(clip.assetId) : null);
    try {
      switch (action) {
        case "open-project-settings":
          this.onOpenProjectSettings();
          return;
        case "focus-timeline":
          if (clip) this.store.selectClip(clip.id);
          return;
        case "split":
          if (!this.store.splitSelected(this.store.playhead)) {
            this.onToast("Cannot split here", "Place the playhead inside the selected clip.", "warn");
          }
          return;
        case "duplicate":
          if (!this.store.duplicateSelected()) this.onToast("Nothing to duplicate", "Select a clip first.", "warn");
          return;
        case "delete":
          if (this.actions.deleteClip) await this.actions.deleteClip(clip);
          else if (!this.store.deleteSelected()) this.onToast("Nothing to delete", "Select a clip first.", "warn");
          return;
        case "reset-color":
          if (!clip) return;
          this.store.edit(() => {
            clip.color = defaultColor();
          }, "Reset color", "control", { clipId: clip.id });
          return;
        case "add-selected-asset":
          if (asset) await this.actions.addAsset?.(asset);
          return;
        case "extract-asset":
          if (asset) await this.actions.extractAudio?.(asset, null);
          return;
        case "freeze-asset":
          if (asset) await this.actions.freeze?.(asset, null);
          return;
        case "reveal-asset":
          if (asset) await this.actions.revealAsset?.(asset);
          return;
        case "remove-asset":
          if (asset) await this.actions.removeAsset?.(asset);
          return;
        case "extract-clip":
          if (clip) await this.actions.extractAudio?.(asset, clip);
          return;
        case "freeze-clip":
          if (clip) await this.actions.freeze?.(asset, clip);
          return;
        case "set-resolution":
          this.applyResolution(el?.dataset?.resolution || el?.value || "");
          return;
        default:
          return;
      }
    } catch (err) {
      this.onToast("Action failed", err?.message || String(err), "error");
    }
  }

  destroy() {
    this.unsubscribe?.();
  }
}

export function createInspector(options) {
  return new Inspector(options);
}
