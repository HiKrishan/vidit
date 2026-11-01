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
  const title = store.project.tracks.flatMap((t) => t.clips).find((c) => c.name === "Opening title");
  if (!bars || !title) return { error: "clips missing" };

  store.edit(() => {
    title.keyframes = {
      opacity: [
        { t: 0.3, value: 1 },
        { t: 2.4, value: 0.2 },
        { t: 3.2, value: 1 }
      ]
    };
  }, "Text opacity keyframes", "project");

  store.selectClip(bars.id);
  d.seekTo(8.6);
  await new Promise((r) => setTimeout(r, 500));
  const readouts = [...document.querySelectorAll("#inspectorBody [data-readout]")]
    .filter((el) => ["clip.x", "clip.y", "clip.scale", "clip.rotation", "clip.opacity"].includes(el.dataset.readout))
    .map((el) => ({ bind: el.dataset.readout, value: el.textContent }));
  const inputs = [...document.querySelectorAll("#inspectorBody [data-bind]")]
    .filter((el) => ["clip.x", "clip.y", "clip.scale", "clip.rotation", "clip.opacity"].includes(el.dataset.bind))
    .map((el) => ({ bind: el.dataset.bind, value: el.value }));
  const buttons = [...document.querySelectorAll("#inspectorBody [data-keyframe]")].map((b) => ({
    prop: b.dataset.keyframe,
    active: b.classList.contains("active"),
    has: b.classList.contains("has")
  }));
  const layer = document.querySelector(`#stageLayers .stage-layer[data-clip-id="${bars.id}"]`);

  return {
    barsKeyframes: bars.keyframes,
    titleKeyframes: title.keyframes,
    layer: {
      transform: layer?.style.transform,
      opacity: layer?.style.opacity
    },
    readouts,
    inputs,
    buttons,
    errors: window.__viditErrors
  };
})();
