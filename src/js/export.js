import {
  FPS_OPTIONS,
  exportDimensions,
  exportScaleForPreset
} from "./model.js";
import { buildTextImages } from "./text-render.js";
import {
  clamp,
  escapeHtml,
  formatDuration,
  formatShort,
  icon
} from "./utils.js";

const DEFAULT_SETTINGS = {
  format: "mp4",
  quality: "balanced",
  resolution: "1080",
  fps: null,
  audio: true
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("vidit.export.settings") || "{}");
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function clipCount(project) {
  return (project.tracks || []).reduce((sum, track) => sum + (track.clips || []).length, 0);
}

function fileLabel(path) {
  const value = String(path || "");
  const parts = value.split(/[\\/]/);
  return parts[parts.length - 1] || value;
}

export class ExportDialog {
  constructor({ store, modal, onToast, onOpenSettings, getInfo }) {
    this.store = store;
    this.modal = modal;
    this.onToast = typeof onToast === "function" ? onToast : () => {};
    this.onOpenSettings = typeof onOpenSettings === "function" ? onOpenSettings : () => {};
    this.getInfo = typeof getInfo === "function" ? getInfo : () => null;
    this.settings = loadSettings();
    this.job = null;
    this.busy = false;
    this.progressEls = null;
    this.outputPath = "";
    this.disposers = [];
    this.pendingEvents = null;
    this.bindIpc();
  }

  bindIpc() {
    if (!window.vidit) return;
    this.disposers.push(
      window.vidit.onExportProgress((payload) => this.handleProgress(payload)),
      window.vidit.onExportDone((payload) => this.handleDone(payload)),
      window.vidit.onExportFailed((payload) => this.handleFailed(payload))
    );
  }

  persistSettings() {
    try {
      localStorage.setItem("vidit.export.settings", JSON.stringify(this.settings));
    } catch {
      /* noop */
    }
  }

  toolsMissing() {
    const info = this.getInfo();
    if (!info?.tools) return false;
    return !info.tools.ffmpeg;
  }

  fpsOptions() {
    const projectFps = Number(this.store.project.settings?.fps) || 30;
    const list = [...FPS_OPTIONS];
    if (!list.includes(projectFps)) list.push(projectFps);
    list.sort((a, b) => a - b);
    return list;
  }

  resolvedFps() {
    return Number(this.settings.fps) || Number(this.store.project.settings?.fps) || 30;
  }

  outputDimensions() {
    const scale = exportScaleForPreset(this.store.project, this.settings.resolution);
    return exportDimensions(this.store.project, scale);
  }

  open() {
    const duration = this.store.duration;
    if (!(duration > 0.01)) {
      this.onToast("Nothing to export", "Add at least one clip to the timeline.", "warn");
      return;
    }
    this.modal.open({
      kicker: "Delivery",
      title: "Export video",
      body: "",
      actions: "",
      width: "",
      dismissible: true,
      onClose: () => {
        this.busy = false;
        this.job = null;
      }
    });
    this.renderSettings();
  }

  choiceGrid(name, options, columns = 4) {
    const style = columns === 4 ? "" : ` style="grid-template-columns:repeat(${columns},1fr)"`;
    return (
      `<div class="export-choice-grid${columns === 2 ? " two" : ""}"${style}>` +
      options
        .map(
          (option) =>
            `<button class="export-choice ${this.settings[name] === option.value ? "active" : ""}" ` +
            `type="button" data-choice="${escapeHtml(name)}" data-value="${escapeHtml(option.value)}">` +
            `<strong>${escapeHtml(option.label)}</strong><span>${escapeHtml(option.note || "")}</span></button>`
        )
        .join("") +
      `</div>`
    );
  }

  renderSettings() {
    this.busy = false;
    this.job = null;
    this.pendingEvents = null;
    this.progressEls = null;
    this.modal.setTitle("Export video");
    this.modal.setKicker("Delivery");
    this.modal.setDismissible(true);

    const project = this.store.project;
    const dims = this.outputDimensions();
    const missing = this.toolsMissing();
    const settings = this.settings;

    const format = this.choiceGrid(
      "format",
      [
        { value: "mp4", label: "MP4", note: "H.264 · universal" },
        { value: "webm", label: "WebM", note: "VP9 · compact" }
      ],
      2
    );

    const quality = this.choiceGrid(
      "quality",
      [
        { value: "high", label: "High", note: "Bigger · sharper" },
        { value: "balanced", label: "Balanced", note: "Recommended" },
        { value: "small", label: "Small file", note: "Fast encode" }
      ],
      3
    );

    const resolutionOptions = [
      {
        value: "source",
        label: "Source",
        note: `${project.settings.width}×${project.settings.height}`
      },
      ...[
        ["1080", "1080p"],
        ["720", "720p"],
        ["4k", "4K"]
      ].map(([value, label]) => {
        const size = exportDimensions(project, exportScaleForPreset(project, value));
        return { value, label, note: `${size.width}×${size.height}` };
      })
    ];

    const fps = this.resolvedFps();
    const body =
      `<div class="export-summary">` +
      `<div class="export-summary-mark">${icon("film")}</div>` +
      `<div class="export-summary-text"><strong>${escapeHtml(project.name)}</strong>` +
      `<span>${escapeHtml(formatDuration(this.store.duration))} · ${clipCount(project)} clips · ${dims.width} × ${dims.height}</span></div>` +
      `</div>` +
      `<section class="export-section"><h3 class="export-section-title">Format</h3>${format}</section>` +
      `<section class="export-section"><h3 class="export-section-title">Quality</h3>${quality}</section>` +
      `<section class="export-section"><h3 class="export-section-title">Resolution</h3>${this.choiceGrid(
        "resolution",
        resolutionOptions,
        4
      )}</section>` +
      `<div class="export-row" style="margin-top:15px">` +
      `<div class="export-field"><label for="exportFps">Frame rate</label>` +
      `<select class="select-input" id="exportFps" data-export-field="fps">` +
      this.fpsOptions()
        .map(
          (value) =>
            `<option value="${value}" ${value === fps ? "selected" : ""}>${value} fps</option>`
        )
        .join("") +
      `</select></div>` +
      `<div class="export-field"><label>Sound</label>` +
      `<div class="toggle-row" style="min-height:30px"><span>Include audio</span>` +
      `<button class="switch ${settings.audio ? "on" : ""}" type="button" data-export-toggle="audio" aria-pressed="${settings.audio ? "true" : "false"}"></button></div>` +
      `</div></div>` +
      (missing
        ? `<div class="modal-error">${icon("alert")}<span>FFmpeg was not found. Install FFmpeg or set its path in Settings before exporting.</span></div>`
        : "") +
      `<div class="export-note">${icon("info")}<span>Text, stickers, effects and transitions are rendered by Vidit, then encoded with local FFmpeg. Nothing leaves your computer.</span></div>`;

    this.modal.setBody(body);
    this.modal.setActions(
      `<button class="btn-ghost" type="button" data-action="close">Cancel</button>` +
        (missing ? `<button class="btn-secondary" type="button" data-action="settings">${icon("settings")}Settings</button>` : "") +
        `<button class="btn-primary" type="button" data-action="start" ${missing ? "disabled" : ""}>${icon(
          "upload"
        )}Export</button>`
    );

    this.modal.onAction = (action) => this.handleAction(action);
    this.modal.body.onclick = (event) => this.handleBodyClick(event);
    this.modal.body.onchange = (event) => {
      if (event.target.matches('[data-export-field="fps"]')) {
        this.settings.fps = Number(event.target.value) || null;
        this.persistSettings();
      }
    };
    this.modal.actionsEl.querySelector('[data-action="start"]')?.focus({ preventScroll: true });
  }

  handleBodyClick(event) {
    const choice = event.target.closest("[data-choice]");
    if (choice) {
      const name = choice.dataset.choice;
      if (name in this.settings) {
        this.settings[name] = choice.dataset.value;
        this.persistSettings();
        this.renderSettings();
      }
      return;
    }
    const toggle = event.target.closest("[data-export-toggle]");
    if (toggle && toggle.dataset.exportToggle === "audio") {
      this.settings.audio = !this.settings.audio;
      this.persistSettings();
      this.renderSettings();
    }
  }

  async handleAction(action) {
    if (action === "close" || action === "done") {
      this.modal.close();
      return;
    }
    if (action === "settings") {
      this.modal.close();
      this.onOpenSettings();
      return;
    }
    if (action === "start") {
      await this.startExport();
      return;
    }
    if (action === "cancel") {
      await this.cancelExport();
      return;
    }
    if (action === "retry") {
      this.renderSettings();
      return;
    }
    if (action === "show") {
      if (this.outputPath) await window.vidit?.showItem(this.outputPath);
      return;
    }
  }

  async startExport() {
    if (this.busy) return;
    const duration = this.store.duration;
    if (!(duration > 0.01)) {
      this.onToast("Nothing to export", "Add at least one clip to the timeline.", "warn");
      return;
    }
    this.busy = true;
    this.modal.setDismissible(false);
    this.modal.onAction = (action) => this.handleAction(action);

    const dims = this.outputDimensions();
    const options = {
      format: this.settings.format === "webm" ? "webm" : "mp4",
      quality: this.settings.quality,
      scale: exportScaleForPreset(this.store.project, this.settings.resolution),
      fps: this.resolvedFps(),
      audio: Boolean(this.settings.audio)
    };

    this.renderProgress(0, "Preparing text layers…", 0, duration, "Preparing");
    let textImages = [];
    try {
      textImages = await buildTextImages(this.store.project, dims);
    } catch (err) {
      this.renderFailed(err?.message || "Could not prepare text layers.");
      return;
    }

    this.renderProgress(0, "Choose where to save…", 0, duration, "Waiting");
    this.pendingEvents = [];
    try {
      const result = await window.vidit.startExport(this.store.project, options, textImages);
      if (!result || result.canceled) {
        this.busy = false;
        this.pendingEvents = null;
        this.renderSettings();
        return;
      }
      this.job = {
        id: result.jobId,
        outputPath: result.outputPath || "",
        startedAt: Date.now(),
        duration
      };
      this.outputPath = result.outputPath || "";
      this.updateProgress({ percent: 0.5, time: 0, duration });
      this.modal.setActions(
        `<button class="btn-secondary" type="button" data-action="cancel">Cancel export</button>`
      );
      this.replayPendingEvents();
    } catch (err) {
      this.pendingEvents = null;
      this.renderFailed(err?.message || "Export could not start.");
    }
  }

  bufferEvent(type, payload) {
    if (!Array.isArray(this.pendingEvents)) return;
    if (type === "progress") {
      const last = this.pendingEvents[this.pendingEvents.length - 1];
      if (last?.type === "progress") {
        this.pendingEvents[this.pendingEvents.length - 1] = { type, payload };
      } else {
        this.pendingEvents.push({ type, payload });
      }
      if (this.pendingEvents.length > 8) this.pendingEvents.splice(0, this.pendingEvents.length - 8);
      return;
    }
    this.pendingEvents.push({ type, payload });
  }

  replayPendingEvents() {
    const events = Array.isArray(this.pendingEvents) ? this.pendingEvents : [];
    this.pendingEvents = null;
    for (const event of events) {
      if (!this.job) break;
      if (event.payload?.jobId && event.payload.jobId !== this.job.id) continue;
      if (event.type === "progress") this.updateProgress(event.payload);
      else if (event.type === "done") this.handleDone(event.payload);
      else if (event.type === "failed") this.handleFailed(event.payload);
    }
  }

  renderProgress(percent, label, time, duration, verb = "Rendering") {
    this.busy = true;
    this.modal.setTitle("Exporting video");
    this.modal.setKicker("Delivery");
    this.modal.setBody(
      `<div class="export-progress-view">` +
        `<div class="export-progress-number"><span data-progress-percent>${Math.round(
          percent
        )}</span><small>%</small></div>` +
        `<p class="export-progress-label" data-progress-label>${escapeHtml(label)}</p>` +
        `<div class="progress-track"><div class="progress-bar" data-progress-bar style="width:${clamp(
          percent,
          0,
          100
        )}%"></div></div>` +
        `<div class="export-progress-meta"><span data-progress-time>${formatShort(time)} / ${formatShort(
          duration
        )}</span><span data-progress-eta>${escapeHtml(verb)}</span></div>` +
        `</div>` +
        `<div class="export-note">${icon("info")}<span>Keep Vidit open while FFmpeg finishes. You can cancel at any time.</span></div>`
    );
    this.progressEls = {
      percent: this.modal.body.querySelector("[data-progress-percent]"),
      label: this.modal.body.querySelector("[data-progress-label]"),
      bar: this.modal.body.querySelector("[data-progress-bar]"),
      time: this.modal.body.querySelector("[data-progress-time]"),
      eta: this.modal.body.querySelector("[data-progress-eta]")
    };
    this.modal.setActions(
      `<button class="btn-secondary" type="button" data-action="cancel">Cancel export</button>`
    );
  }

  updateProgress(payload) {
    if (!this.progressEls) return;
    const percent = clamp(Number(payload.percent) || 0, 0, 100);
    const duration = Number(payload.duration) || this.job?.duration || this.store.duration;
    const time = clamp(Number(payload.time) || 0, 0, duration);
    if (this.progressEls.percent) this.progressEls.percent.textContent = String(Math.round(percent));
    if (this.progressEls.bar) this.progressEls.bar.style.width = `${percent.toFixed(2)}%`;
    if (this.progressEls.time) {
      this.progressEls.time.textContent = `${formatShort(time)} / ${formatShort(duration)}`;
    }
    if (this.progressEls.label) {
      this.progressEls.label.textContent =
        percent >= 99.9 ? "Finalizing file…" : "Rendering frames and mixing sound…";
    }
    if (this.progressEls.eta) {
      let eta = "Rendering";
      if (this.job?.startedAt && percent > 0.3 && percent < 99.9) {
        const elapsed = (Date.now() - this.job.startedAt) / 1000;
        const remaining = (elapsed * (100 - percent)) / percent;
        eta = `~${formatDuration(remaining)} left`;
      } else if (percent >= 99.9) {
        eta = "Almost done";
      }
      this.progressEls.eta.textContent = eta;
    }
  }

  handleProgress(payload) {
    if (!this.job) {
      this.bufferEvent("progress", payload);
      return;
    }
    if (payload?.jobId !== this.job.id) return;
    if (payload.duration) this.job.duration = Number(payload.duration);
    this.updateProgress(payload);
  }

  handleDone(payload) {
    if (!this.job) {
      this.bufferEvent("done", payload);
      return;
    }
    if (payload?.jobId !== this.job.id) return;
    this.busy = false;
    this.outputPath = payload.outputPath || this.outputPath;
    this.job = null;
    this.modal.setDismissible(true);
    this.modal.setTitle("Export complete");
    this.modal.setKicker("Delivery");
    const dims = `${payload.width || "?"} × ${payload.height || "?"}`;
    this.modal.setBody(
      `<div class="export-done">` +
        `<div class="export-done-mark">${icon("check")}</div>` +
        `<h3>Your video is ready.</h3>` +
        `<p>${escapeHtml(dims)} · ${escapeHtml(formatDuration(Number(payload.duration) || this.store.duration))}. Saved to disk.</p>` +
        `<div class="export-path">${escapeHtml(this.outputPath)}</div>` +
        `</div>`
    );
    this.modal.setActions(
      `<button class="btn-ghost" type="button" data-action="close">Done</button>` +
        `<button class="btn-primary" type="button" data-action="show">${icon("folder")}Show in folder</button>`
    );
    this.modal.onAction = (action) => this.handleAction(action);
    this.store.markExported();
    this.onToast("Export complete", fileLabel(this.outputPath), "success");
  }

  handleFailed(payload) {
    if (!this.job) {
      this.bufferEvent("failed", payload);
      return;
    }
    if (payload?.jobId && payload.jobId !== this.job.id) return;
    const canceled = Boolean(payload?.canceled);
    this.job = null;
    this.busy = false;
    this.modal.setDismissible(true);
    if (canceled) {
      this.renderSettings();
      this.onToast("Export canceled", "The partial file was discarded.", "warn");
      return;
    }
    this.renderFailed(payload?.error || "The export failed.", payload?.log || "");
  }

  renderFailed(message, log = "") {
    this.busy = false;
    this.job = null;
    this.modal.setDismissible(true);
    this.modal.setTitle("Export failed");
    this.modal.setKicker("Delivery");
    this.modal.setBody(
      `<div class="modal-error">${icon("alert")}<span>${escapeHtml(message)}</span></div>` +
        (log ? `<pre class="export-progress-log">${escapeHtml(log)}</pre>` : "") +
        `<div class="export-note">${icon("info")}<span>Check that FFmpeg is installed and that every source file still exists, then try again.</span></div>`
    );
    this.modal.setActions(
      `<button class="btn-ghost" type="button" data-action="close">Close</button>` +
        `<button class="btn-primary" type="button" data-action="retry">${icon("refresh")}Try again</button>`
    );
    this.modal.onAction = (action) => this.handleAction(action);
    this.onToast("Export failed", message, "error");
  }

  async cancelExport() {
    if (!this.job) return;
    const id = this.job.id;
    const button = this.modal.actionsEl.querySelector('[data-action="cancel"]');
    if (button) {
      button.disabled = true;
      button.textContent = "Canceling…";
    }
    if (this.progressEls?.label) this.progressEls.label.textContent = "Stopping FFmpeg…";
    try {
      await window.vidit.cancelExport(id);
    } catch {
      /* the failed event will report the outcome */
    }
  }

  destroy() {
    for (const dispose of this.disposers) {
      try {
        dispose?.();
      } catch {
        /* noop */
      }
    }
    this.disposers = [];
  }
}

export function createExportDialog(options) {
  return new ExportDialog(options);
}
