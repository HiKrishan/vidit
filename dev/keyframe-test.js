(async () => {
  const d = window.__viditDebug;
  if (d.modal.isOpen) {
    const restore = document.querySelector('#modalActions [data-action="restore"]');
    if (restore) restore.click();
    await new Promise((r) => setTimeout(r, 900));
  }
  const store = d.store;
  d.preview.pause({ render: false, silent: true });
  const bars = store.project.tracks.flatMap((t) => t.clips).find((c) => c.name === "sample-bars.mp4");
  if (!bars) return { error: "bars clip missing", clips: store.project.tracks.flatMap((t) => t.clips.map((c) => c.name)) };
  const image = store.project.tracks.flatMap((t) => t.clips).find((c) => c.name === "sample-image.png");

  store.edit(() => {
    bars.keyframes = {
      scale: [
        { t: 0.2, value: 1 },
        { t: 2.2, value: 0.55 },
        { t: 4.2, value: 1 }
      ],
      x: [
        { t: 0.2, value: 0 },
        { t: 2.2, value: 0.18 }
      ],
      y: [
        { t: 0.2, value: 0 },
        { t: 2.2, value: -0.1 }
      ],
      opacity: [
        { t: 0.2, value: 1 },
        { t: 2.2, value: 0.45 }
      ],
      volume: [
        { t: 0.2, value: 1 },
        { t: 3.2, value: 0.25 }
      ]
    };
    bars.volume = 0.7;
    if (image) {
      image.keyframes = {
        rotation: [
          { t: 0.1, value: 0 },
          { t: 2.4, value: 18 }
        ]
      };
    }
  }, "Add test keyframes", "project");

  store.selectClip(bars.id);
  const samples = [];
  for (const time of [6.6, 7.5, 8.6, 9.6]) {
    d.seekTo(time);
    d.preview.render();
    await new Promise((r) => setTimeout(r, 120));
    const layer = document.querySelector(`#stageLayers .stage-layer[data-clip-id="${bars.id}"]`);
    samples.push({
      time,
      layerTransform: layer?.style.transform || null,
      layerOpacity: layer?.style.opacity || null,
      layerDisplay: layer?.style.display || null,
      diamonds: document.querySelectorAll(`.clip[data-clip-id="${bars.id}"] .clip-keyframe`).length
    });
  }

  d.seekTo(8.6);
  await new Promise((r) => setTimeout(r, 350));
  const buttons = [...document.querySelectorAll("#inspectorBody [data-keyframe]")].map((b) => ({
    prop: b.dataset.keyframe,
    active: b.classList.contains("active"),
    has: b.classList.contains("has"),
    pressed: b.getAttribute("aria-pressed")
  }));
  const readouts = [...document.querySelectorAll("#inspectorBody [data-readout]")].map((el) => ({
    bind: el.dataset.readout,
    value: el.textContent
  }));

  return {
    bars: {
      start: bars.start,
      duration: bars.duration,
      keyframes: bars.keyframes
    },
    samples,
    buttons,
    readouts,
    errors: window.__viditErrors
  };
})();
