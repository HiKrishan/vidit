"use strict";

const { app } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { toolPath } = require("./ffmpeg");

const activeJobs = new Map();

function send(sender, channel, payload) {
  if (sender && !sender.isDestroyed()) sender.send(channel, payload);
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, num(value, min)));
}

function even(value) {
  return Math.max(2, Math.round(value / 2) * 2);
}

const KEYFRAME_LIMITS = {
  x: [-2, 2],
  y: [-2, 2],
  scale: [0.05, 4],
  rotation: [-360, 360],
  opacity: [0, 1],
  volume: [0, 4]
};

function keyframeList(clip, prop) {
  const list = clip?.keyframes?.[prop];
  return Array.isArray(list) && list.length ? list : null;
}

function keyframeExpression(clip, prop, timeVar = "t") {
  const list = keyframeList(clip, prop);
  if (!list) return null;
  const limit = KEYFRAME_LIMITS[prop] || [-Infinity, Infinity];
  const fmt = (value) => Number(Number(value).toFixed(6));
  const valueFmt = (value) => fmt(clamp(value, limit[0], limit[1]));
  const t = timeVar;
  let expression = String(valueFmt(list[list.length - 1].value));
  for (let i = list.length - 1; i > 0; i -= 1) {
    const a = list[i - 1];
    const b = list[i];
    const span = Math.max(0.001, num(b.t) - num(a.t));
    const from = valueFmt(a.value);
    const delta = fmt(num(b.value) - num(a.value));
    const segment = `${from}+(${delta})*(${t}-${fmt(a.t)})/${fmt(span)}`;
    expression = `if(lt(${t},${fmt(b.t)}),${segment},${expression})`;
  }
  return `if(lt(${t},${fmt(list[0].t)}),${valueFmt(list[0].value)},${expression})`;
}

function clipEnd(clip) {
  return num(clip.start) + num(clip.duration);
}

function getDuration(project) {
  let end = 0;
  for (const track of project.tracks || []) {
    for (const clip of track.clips || []) end = Math.max(end, clipEnd(clip));
  }
  return end;
}

function hexColor(value, fallback = "#0b0e0e") {
  const match = String(value || "").match(/^#?([0-9a-f]{6})$/i);
  return match ? match[1] : fallback.slice(1);
}

function tempoChain(speed) {
  let s = clamp(speed, 0.25, 4);
  const chain = [];
  while (s < 0.5) {
    chain.push("atempo=0.5");
    s /= 0.5;
  }
  while (s > 2) {
    chain.push("atempo=2");
    s /= 2;
  }
  if (Math.abs(s - 1) > 0.001) chain.push(`atempo=${s.toFixed(5)}`);
  return chain;
}

function expressionClampProgress(start, duration) {
  const d = Math.max(0.001, num(duration, 0.6));
  return `min(max((t-${start.toFixed(4)})/${d.toFixed(4)},0),1)`;
}

function slideOffset(animation, duration, start, width, height) {
  const type = animation?.type && animation.type !== "none" ? animation.type : "";
  if (!["rise", "drop", "slide-left", "slide-right"].includes(type)) return null;
  const p = expressionClampProgress(start, duration);
  const rest = `(1-${p})`;
  const amount = Math.max(18, Math.round(Math.min(width, height) * 0.08));
  if (type === "rise") return { x: "0", y: `${amount}*${rest}` };
  if (type === "drop") return { x: "0", y: `-${amount}*${rest}` };
  if (type === "slide-left") return { x: `-${amount}*${rest}`, y: "0" };
  if (type === "slide-right") return { x: `${amount}*${rest}`, y: "0" };
  return null;
}

function effectChain(clip) {
  const effect = clip.effect || "none";
  const color = clip.color || {};
  const parts = [];
  let presetContrast = 1;
  let presetSaturation = 1;
  let presetBrightness = 0;
  let grayscale = false;

  if (effect === "vivid") {
    presetContrast = 1.14;
    presetSaturation = 1.38;
  } else if (effect === "faded") {
    presetContrast = 0.84;
    presetSaturation = 0.7;
    presetBrightness = 0.055;
  } else if (effect === "noir") {
    grayscale = true;
    presetContrast = 1.3;
    presetBrightness = -0.025;
  } else if (effect === "bw") {
    grayscale = true;
  } else if (effect === "sepia") {
    parts.push("colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131");
  } else if (effect === "dream") {
    presetBrightness = 0.07;
    presetContrast = 0.92;
    presetSaturation = 1.08;
    parts.push("gblur=sigma=0.75");
  } else if (effect === "warm") {
    parts.push("colorbalance=rs=.12:gs=.035:bs=-.1");
  } else if (effect === "cool") {
    parts.push("colorbalance=rs=-.07:gs=.01:bs=.13");
  }

  if (grayscale) parts.push("hue=s=0");

  const brightness = clamp(presetBrightness + num(color.brightness) / 220, -1, 1);
  const contrast = clamp(presetContrast * (1 + num(color.contrast) / 100), 0, 3);
  const saturation = clamp(presetSaturation * (1 + num(color.saturation) / 100), 0, 3);
  if (
    Math.abs(brightness) > 0.001 ||
    Math.abs(contrast - 1) > 0.001 ||
    Math.abs(saturation - 1) > 0.001
  ) {
    parts.push(
      `eq=brightness=${brightness.toFixed(4)}:contrast=${contrast.toFixed(4)}:saturation=${saturation.toFixed(4)}`
    );
  }
  const temp = clamp(num(color.temperature), -100, 100) / 100;
  if (Math.abs(temp) > 0.001) {
    parts.push(
      `colorbalance=rs=${(temp * 0.18).toFixed(4)}:gs=${(temp * 0.05).toFixed(4)}:bs=${(-temp * 0.18).toFixed(4)}`
    );
  }
  const blur = clamp(num(color.blur), 0, 30);
  if (blur > 0) parts.push(`gblur=sigma=${(blur / 2.6).toFixed(3)}`);
  const sharpen = clamp(num(color.sharpen), 0, 100);
  if (sharpen > 0) parts.push(`unsharp=5:5:${(sharpen / 60).toFixed(3)}:5:5:0`);
  const vignette = clamp(num(color.vignette), 0, 100);
  if (vignette > 0) {
    const angle = 6.5 - (vignette / 100) * 3.3;
    parts.push(`vignette=angle=PI/${angle.toFixed(2)}`);
  }
  return parts;
}

function transformFilters(clip) {
  const parts = [];
  const scaleExpr = keyframeExpression(clip, "scale");
  if (scaleExpr) {
    parts.push(
      `scale=w='trunc(iw*(${scaleExpr})/2)*2':h='trunc(ih*(${scaleExpr})/2)*2':eval=frame`
    );
  } else {
    const scale = clamp(clip.scale, 0.05, 4);
    if (Math.abs(scale - 1) > 0.001) {
      parts.push(`scale=trunc(iw*${scale.toFixed(5)}/2)*2:trunc(ih*${scale.toFixed(5)}/2)*2`);
    }
  }
  const rotationExpr = keyframeExpression(clip, "rotation");
  if (rotationExpr) {
    const angle = `(${rotationExpr})*0.0174532925`;
    parts.push(`rotate='${angle}':ow=iw:oh=ih:c=none`);
  } else {
    const rotation = clamp(clip.rotation, -360, 360);
    if (Math.abs(rotation) > 0.001) {
      const radians = ((rotation * Math.PI) / 180).toFixed(6);
      parts.push(`rotate=${radians}:ow=rotw(${radians}):oh=roth(${radians}):c=none`);
    }
  }
  return parts;
}

function visualChain(plan, ctx) {
  const { clip, index, input, textFile } = plan;
  const { outputWidth: W, outputHeight: H, fps } = ctx;
  const speed = clamp(clip.speed, 0.25, 4);
  const duration = Math.max(0.02, num(clip.duration));
  const sourceDuration = Math.max(0.02, duration * speed);
  const opacity = clamp(clip.opacity, 0, 1);
  const parts = [`[${index}:v]`];

  if (clip.type === "video" || clip.type === "image") {
    if (Number(clip.flipH)) parts.push("hflip");
    if (Number(clip.flipV)) parts.push("vflip");
    parts.push("setpts=PTS-STARTPTS");
    if (clip.type === "video") {
      parts.push(`trim=duration=${sourceDuration.toFixed(5)}`);
      if (Math.abs(speed - 1) > 0.001) parts.push(`setpts=PTS/${speed.toFixed(5)}`);
    }
    parts.push(`fps=${fps}`);
    if (clip.fit === "cover") {
      parts.push(`scale=${W}:${H}:force_original_aspect_ratio=increase`);
      parts.push(`crop=${W}:${H}`);
    } else {
      parts.push(`scale=${W}:${H}:force_original_aspect_ratio=decrease`);
      parts.push(
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black@0`
      );
    }
    parts.push("setsar=1");
    parts.push(...transformFilters(clip));
    parts.push(...effectChain(clip));
  } else {
    parts.push(`scale=${W}:${H}:flags=lanczos`);
    parts.push("setsar=1");
    parts.push(...transformFilters(clip));
  }

  parts.push("format=rgba");
  const opacityExpr = keyframeExpression(clip, "opacity", "T");
  if (opacityExpr) {
    parts.push(
      `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(${opacityExpr})'`
    );
  } else if (opacity < 0.999) {
    parts.push(`colorchannelmixer=aa=${opacity.toFixed(4)}`);
  }

  const transition = clip.transition && clip.transition.type && clip.transition.type !== "none"
    ? clip.transition
    : null;
  const animation = clip.animation && clip.animation.type && clip.animation.type !== "none"
    ? clip.animation
    : null;
  let fadeIn = clamp(clip.fades?.in, 0, duration);
  let fadeOut = clamp(clip.fades?.out, 0, duration);
  if (transition?.type === "fade") {
    fadeIn = Math.max(fadeIn, clamp(transition.duration, 0, duration));
  }
  if (animation?.type === "fade" || animation?.type === "pop") {
    fadeIn = Math.max(fadeIn, clamp(animation.duration, 0, duration));
  }
  if (fadeIn > 0.001) {
    parts.push(`fade=t=in:st=0:d=${Math.min(fadeIn, duration).toFixed(4)}:alpha=1`);
  }
  if (fadeOut > 0.001) {
    const st = Math.max(0, duration - fadeOut);
    parts.push(`fade=t=out:st=${st.toFixed(4)}:d=${fadeOut.toFixed(4)}:alpha=1`);
  }

  parts.push(`setpts=PTS+${num(clip.start).toFixed(5)}/TB`);
  return `${parts[0]}${parts.slice(1).join(",")}`;
}

function overlayPosition(plan, ctx) {
  const { clip } = plan;
  const { outputWidth: W, outputHeight: H } = ctx;
  const start = num(clip.start);
  const localTime = `(t-${start.toFixed(5)})`;
  const xExpr = keyframeExpression(clip, "x", localTime);
  const yExpr = keyframeExpression(clip, "y", localTime);
  const x = clamp(clip.x, -2, 2) * W;
  const y = clamp(clip.y, -2, 2) * H;
  let baseX = xExpr ? `(W-w)/2+(${xExpr})*${W}` : `(W-w)/2+${x.toFixed(3)}`;
  let baseY = yExpr ? `(H-h)/2+(${yExpr})*${H}` : `(H-h)/2+${y.toFixed(3)}`;

  const transition = clip.transition && clip.transition.type && clip.transition.type !== "none"
    ? clip.transition
    : null;
  const animation = clip.animation && clip.animation.type && clip.animation.type !== "none"
    ? clip.animation
    : null;
  const motion = ["rise", "drop", "slide-left", "slide-right"].includes(transition?.type)
    ? { type: transition.type, duration: transition.duration }
    : ["rise", "drop", "slide-left", "slide-right"].includes(animation?.type)
      ? { type: animation.type, duration: animation.duration }
      : null;
  if (motion) {
    const offset = slideOffset(motion, motion.duration || 0.7, num(clip.start), W, H);
    if (offset) {
      baseX = `${baseX}+${offset.x}`;
      baseY = `${baseY}+${offset.y}`;
    }
  }
  return { x: baseX, y: baseY };
}

function decodeTextImage(dataUrl) {
  const match = /^data:image\/png;base64,([a-z0-9+/=\s]+)$/i.exec(String(dataUrl || ""));
  if (!match) return null;
  return Buffer.from(match[1].replace(/\s/g, ""), "base64");
}

async function prepareTextImages(project, textImages, dir) {
  const map = new Map();
  let n = 0;
  for (const item of textImages || []) {
    const buffer = decodeTextImage(item.dataUrl);
    if (!buffer) continue;
    const file = path.join(dir, `text-${String(n).padStart(3, "0")}.png`);
    await fsp.writeFile(file, buffer);
    map.set(item.clipId, file);
    n++;
  }
  return map;
}

function collectPlans(project, ctx, textFileMap, outputDims) {
  const { fps, includeAudio } = ctx;
  const plans = [];
  const assetMap = new Map((project.assets || []).map((asset) => [asset.id, asset]));
  const tracksTopToBottom = Array.isArray(project.tracks) ? project.tracks : [];
  let inputIndex = 1;

  for (const track of tracksTopToBottom) {
    const kind = track.kind || track.type;
    if (!["video", "audio", "text"].includes(kind)) continue;
    const clips = [...(track.clips || [])].sort((a, b) => num(a.start) - num(b.start));
    for (const clip of clips) {
      const asset = clip.assetId ? assetMap.get(clip.assetId) : null;
      const type = clip.type || (kind === "text" ? "text" : asset?.type);
      const duration = Math.max(0.02, num(clip.duration));
      const speed = clamp(clip.speed, 0.25, 4);
      const sourceDuration = Math.max(0.02, duration * speed);
      const hasAudio = Boolean(asset?.hasAudio) && includeAudio && !track.muted && num(clip.volume, 1) > 0;
      const visualVisible =
        kind !== "audio" &&
        !track.hidden &&
        (type === "video" || type === "image" || type === "text" || type === "sticker");
      const needsVisual = visualVisible;
      const needsAudio = hasAudio && (kind === "video" || kind === "audio");
      if (!needsVisual && !needsAudio) continue;

      if (type === "text" || type === "sticker") {
        if (!needsVisual) continue;
        const file = textFileMap.get(clip.id);
        if (!file || !fs.existsSync(file)) continue;
        plans.push({
          clip,
          track,
          kind,
          type,
          index: inputIndex++,
          input: {
            args: ["-loop", "1", "-framerate", String(fps), "-t", duration.toFixed(5), "-i", file],
            textFile: file
          },
          sourceDuration,
          hasAudio: false,
          visual: needsVisual
        });
      } else if (asset) {
        if (!fs.existsSync(asset.path)) {
          throw new Error(`Missing media: ${asset.name || path.basename(asset.path)}`);
        }
        const inputArgs = [];
        if (type === "video" || kind === "audio") {
          const trimIn = Math.max(0, num(clip.trimIn));
          if (trimIn > 0.001) inputArgs.push("-ss", trimIn.toFixed(5));
          inputArgs.push("-t", Math.max(0.05, sourceDuration + 0.08).toFixed(5));
        }
        if (type === "image") {
          inputArgs.push("-loop", "1", "-framerate", String(fps), "-t", duration.toFixed(5));
        }
        inputArgs.push("-i", asset.path);
        plans.push({
          clip,
          track,
          kind,
          type,
          index: inputIndex++,
          input: { args: inputArgs },
          sourceDuration,
          hasAudio,
          visual: needsVisual,
          asset
        });
      }
    }
  }
  return plans;
}

function buildAudioFilters(plans, project, ctx) {
  const { sampleRate = 48000, duration } = ctx;
  const chains = [];
  let count = 0;
  for (const plan of plans) {
    if (!plan.hasAudio) continue;
    const { clip, index } = plan;
    const speed = clamp(clip.speed, 0.25, 4);
    const sourceDuration = plan.sourceDuration;
    const volume = clamp(clip.volume, 0, 8);
    const clipDuration = Math.max(0.02, num(clip.duration));
    const fadeIn = clamp(clip.fades?.in, 0, clipDuration);
    const fadeOut = clamp(clip.fades?.out, 0, clipDuration);
    const parts = [
      `[${index}:a]`,
      "asetpts=PTS-STARTPTS",
      `atrim=duration=${sourceDuration.toFixed(5)}`,
      "asetpts=PTS-STARTPTS"
    ];
    parts.push(...tempoChain(speed));
    const volumeExpr = keyframeExpression(clip, "volume", "t");
    if (volumeExpr) {
      parts.push(`volume='${volumeExpr}':eval=frame`);
    } else if (volume !== 1) {
      parts.push(`volume=${volume.toFixed(4)}`);
    }
    if (fadeIn > 0.001) {
      parts.push(`afade=t=in:st=0:d=${Math.min(fadeIn, clipDuration).toFixed(4)}`);
    }
    if (fadeOut > 0.001) {
      parts.push(
        `afade=t=out:st=${Math.max(0, clipDuration - fadeOut).toFixed(4)}:d=${fadeOut.toFixed(4)}`
      );
    }
    parts.push(`aresample=${sampleRate}`);
    parts.push("aformat=sample_fmts=fltp:channel_layouts=stereo");
    const ms = Math.max(0, Math.round(num(clip.start) * 1000));
    if (ms > 0) parts.push(`adelay=${ms}|${ms}`);
    chains.push(`${parts[0]}${parts.slice(1).join(",")}[a${count}]`);
    count++;
  }
  if (!count) return { filter: null, count: 0 };
  const mixInputs = Array.from({ length: count }, (_, i) => `[a${i}]`).join("");
  chains.push(
    `${mixInputs}amix=inputs=${count}:duration=longest:dropout_transition=2:normalize=0,` +
      `alimiter=limit=0.95,atrim=duration=${duration.toFixed(5)}[aout]`
  );
  return { filter: chains.join(";"), count };
}

function buildGraph(project, plans, ctx) {
  const filters = ["[0:v]format=rgba[base]"];
  let prev = "base";
  let videoCount = 0;
  const visualPlans = plans.filter((p) => p.visual);
  const tracksBottomToTop = [...(project.tracks || [])].reverse();
  const trackRank = new Map(tracksBottomToTop.map((t, i) => [t.id, i]));
  visualPlans.sort((a, b) => {
    const rank = (trackRank.get(a.track.id) ?? 0) - (trackRank.get(b.track.id) ?? 0);
    if (rank !== 0) return rank;
    return num(a.clip.start) - num(b.clip.start);
  });

  for (const plan of visualPlans) {
    const chain = visualChain(plan, ctx);
    const label = `c${videoCount}`;
    const out = `v${videoCount}`;
    filters.push(`${chain}[${label}]`);
    const pos = overlayPosition(plan, ctx);
    const start = num(plan.clip.start);
    const end = start + Math.max(0.02, num(plan.clip.duration));
    filters.push(
      `[${prev}][${label}]overlay=x='${pos.x}':y='${pos.y}':` +
        `enable='between(t,${start.toFixed(5)},${end.toFixed(5)})':eval=frame:format=auto[${out}]`
    );
    prev = out;
    videoCount++;
  }
  filters.push(`[${prev}]format=yuv420p[vout]`);
  return filters.join(";");
}

function parseProgressLine(line) {
  const eq = line.indexOf("=");
  if (eq === -1) return null;
  return [line.slice(0, eq), line.slice(eq + 1)];
}

function startJob({ project, options, textImages, sender }) {
  const jobId = crypto.randomUUID();
  const job = {
    id: jobId,
    process: null,
    canceled: false,
    tempDir: null,
    sender
  };
  activeJobs.set(jobId, job);
  job.promise = runJob(job, project, options, textImages).catch((err) => {
    send(sender, "export:failed", {
      jobId,
      error: err.message || "Export failed",
      log: err.log || ""
    });
  }).finally(() => {
    activeJobs.delete(jobId);
    if (job.tempDir) fsp.rm(job.tempDir, { recursive: true, force: true }).catch(() => {});
    if (job.tempOutput) fsp.rm(job.tempOutput, { force: true }).catch(() => {});
  });
  return { jobId };
}

async function runJob(job, project, options, textImages) {
  const sender = job.sender;
  const fps = clamp(options.fps || project.settings?.fps || 30, 1, 120);
  const duration = getDuration(project);
  if (duration <= 0.01) throw new Error("There is nothing on the timeline to export.");
  const sourceWidth = Math.max(2, num(project.settings?.width, 1920));
  const sourceHeight = Math.max(2, num(project.settings?.height, 1080));
  const scaleFactor = clamp(options.scale || 1, 0.1, 4);
  const outputWidth = even(sourceWidth * scaleFactor);
  const outputHeight = even(sourceHeight * scaleFactor);
  const includeAudio = options.audio !== false;
  const tempDir = await fsp.mkdtemp(path.join(app.getPath("temp"), "vidit-export-"));
  job.tempDir = tempDir;
  const textFileMap = await prepareTextImages(project, textImages, tempDir);
  const ctx = {
    outputWidth,
    outputHeight,
    fps,
    includeAudio,
    duration,
    sampleRate: 48000
  };
  const plans = collectPlans(project, ctx, textFileMap, { outputWidth, outputHeight });
  const videoFilter = buildGraph(project, plans, ctx);
  const audio = includeAudio ? buildAudioFilters(plans, project, ctx) : { filter: null, count: 0 };
  const graph = audio.filter ? `${videoFilter};${audio.filter}` : videoFilter;
  if (process.env.VIDIT_EXPORT_DEBUG === "1") {
    try {
      await fsp.writeFile(
        path.join(app.getPath("temp"), "vidit-export-graph.json"),
        JSON.stringify(
          {
            graph,
            ctx,
            tracks: project.tracks.map((track) => ({ id: track.id, name: track.name, kind: track.kind, hidden: track.hidden })),
            plans: plans.map((plan) => ({
              index: plan.index,
              clipId: plan.clip.id,
              name: plan.clip.name,
              type: plan.type,
              kind: plan.kind,
              track: plan.track.name,
              start: plan.clip.start,
              duration: plan.clip.duration,
              visual: plan.visual,
              input: plan.input.args
            }))
          },
          null,
          2
        )
      );
    } catch {
      /* debug aid only */
    }
  }
  const background = hexColor(project.settings?.background);
  const args = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-y",
    "-progress",
    "pipe:1",
    "-nostats",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x${background}:s=${outputWidth}x${outputHeight}:r=${fps}:d=${duration.toFixed(5)}`
  ];
  for (const plan of plans) {
    args.push(...plan.input.args);
  }
  args.push("-filter_complex", graph, "-map", "[vout]");
  const format = options.format === "webm" ? "webm" : "mp4";
  if (audio.count) args.push("-map", "[aout]");
  else if (includeAudio) args.push("-an");
  args.push("-t", duration.toFixed(5));
  if (format === "webm") {
    const crf = options.quality === "high" ? 24 : options.quality === "small" ? 38 : 31;
    args.push(
      "-c:v",
      "libvpx-vp9",
      "-crf",
      String(crf),
      "-b:v",
      "0",
      "-row-mt",
      "1",
      "-deadline",
      "good",
      "-cpu-used",
      "2",
      "-pix_fmt",
      "yuv420p"
    );
    if (audio.count) args.push("-c:a", "libopus", "-b:a", "160k");
  } else {
    const crf = options.quality === "high" ? 18 : options.quality === "small" ? 28 : 22;
    const preset = options.quality === "high" ? "slow" : options.quality === "small" ? "veryfast" : "medium";
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      preset,
      "-crf",
      String(crf),
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart"
    );
    if (audio.count) args.push("-c:a", "aac", "-b:a", "192k");
  }
  const ext = path.extname(options.outputPath) || `.${format}`;
  const finalOutputPath = options.outputPath;
  const tempOutputPath = `${finalOutputPath.slice(0, -ext.length)}.part-${job.id.slice(0, 8)}${ext}`;
  job.tempOutput = tempOutputPath;
  args.push("-max_muxing_queue_size", "2048", tempOutputPath);

  const binary = await toolPath("ffmpeg");
  send(sender, "export:progress", { jobId: job.id, percent: 0, time: 0, duration });
  const child = spawn(binary, args, { windowsHide: true });
  job.process = child;
  let stderr = [];
  let stdoutBuffer = "";
  let lastPercent = -1;
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || "";
    for (const line of lines) {
      const pair = parseProgressLine(line.trim());
      if (!pair) continue;
      const [key, value] = pair;
      if (key === "out_time_us" || key === "out_time_ms") {
        const time = Number(value) / 1_000_000;
        const percent = Math.max(0, Math.min(100, (time / duration) * 100));
        if (percent - lastPercent >= 0.25 || percent >= 99.9) {
          lastPercent = percent;
          send(sender, "export:progress", {
            jobId: job.id,
            percent,
            time: Math.min(time, duration),
            duration
          });
        }
      }
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr.push(chunk.toString());
    if (stderr.length > 80) stderr.shift();
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (job.canceled) {
    await fsp.rm(tempOutputPath, { force: true }).catch(() => {});
    send(sender, "export:failed", { jobId: job.id, error: "Export canceled.", canceled: true });
    return;
  }
  if (exitCode !== 0) {
    await fsp.rm(tempOutputPath, { force: true }).catch(() => {});
    const err = new Error("FFmpeg could not finish the export. Check the log for details.");
    err.log = stderr.join("").slice(-12000);
    throw err;
  }
  await fsp.rename(tempOutputPath, finalOutputPath);
  send(sender, "export:progress", {
    jobId: job.id,
    percent: 100,
    time: duration,
    duration
  });
  send(sender, "export:done", {
    jobId: job.id,
    outputPath: finalOutputPath,
    width: outputWidth,
    height: outputHeight,
    duration
  });
}

function cancelJob(jobId) {
  const job = activeJobs.get(jobId);
  if (!job) return false;
  job.canceled = true;
  if (job.process) job.process.kill("SIGKILL");
  return true;
}

function cancelAll() {
  for (const job of activeJobs.values()) {
    job.canceled = true;
    if (job.process) job.process.kill("SIGKILL");
  }
}

module.exports = {
  startJob,
  cancelJob,
  cancelAll,
  getDuration
};
