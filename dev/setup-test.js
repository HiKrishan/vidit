(async () => {
  const dbg = window.__viditDebug;
  const store = dbg.store;
  const base = "D:/projects/vidit/dev/media";
  store.setProjectName("Vidit test");

  const imported = await window.vidit.importPaths([
    `${base}/sample-video.mp4`,
    `${base}/sample-bars.mp4`,
    `${base}/sample-audio.wav`,
    `${base}/sample-image.png`
  ]);
  store.addAssets(imported.assets || []);

  const byName = (name) => store.project.assets.find((asset) => asset.name === name);
  const video = byName("sample-video.mp4");
  const bars = byName("sample-bars.mp4");
  const audio = byName("sample-audio.wav");
  const image = byName("sample-image.png");
  const videoTracks = store.project.tracks.filter((track) => track.kind === "video");
  const audioTrack = store.project.tracks.find((track) => track.kind === "audio");
  const textTrack = store.project.tracks.find((track) => track.kind === "text");
  const lower = videoTracks[videoTracks.length - 1];
  const upper = videoTracks[0];

  const videoClip = store.addAssetClip(video.id, lower.id, 0);
  const barsClip = store.addAssetClip(bars.id, lower.id, 6.4);
  const imageClip = store.addAssetClip(image.id, upper.id, 2);
  const audioClip = store.addAssetClip(audio.id, audioTrack.id, 0);
  const title = store.addTextClip("display", { start: 0.4 });
  const plain = store.addTextClip("plain", { start: 3.4 });

  store.edit(() => {
    title.name = "Opening title";
    title.text.content = "MADE WITH VIDIT";
    title.text.fontSize = 118;
    title.text.weight = 700;
    title.text.y = 0.46;
    title.text.accentBar = true;
    title.duration = 3.6;

    plain.name = "Lower third";
    plain.text.content = "A small, honest video editor.";
    plain.text.fontSize = 46;
    plain.text.weight = 500;
    plain.text.y = 0.82;
    plain.text.backgroundOpacity = 0.55;
    plain.text.padding = 22;
    plain.duration = 4;

    videoClip.fades = { in: 0.35, out: 0.35 };
    barsClip.transition = { type: "fade", duration: 0.65 };
    imageClip.transition = { type: "rise", duration: 0.6 };
    imageClip.duration = 3.2;
    audioClip.volume = 0.6;
    audioClip.fades = { in: 0.4, out: 0.8 };
  }, "Build test edit", "project");

  store.selectClip(title.id);
  dbg.setTab("text");
  dbg.seekTo(1.2);
  dbg.preview.render();
  await new Promise((resolve) => setTimeout(resolve, 900));

  const waveformCount = document.querySelectorAll(".clip-waveform svg, .clip-wave svg, .clip svg.wave").length;
  return {
    name: store.project.name,
    duration: store.duration,
    imported: (imported.assets || []).map((asset) => ({
      name: asset.name,
      type: asset.type,
      peaks: asset.peaks?.length || 0,
      hasThumb: Boolean(asset.thumb)
    })),
    clips: store.project.tracks.flatMap((track) =>
      track.clips.map((clip) => ({
        track: track.name,
        type: clip.type,
        name: clip.name,
        start: clip.start,
        duration: clip.duration
      }))
    ),
    waveformSvg: document.querySelectorAll(".clip-waveform").length,
    waveformCount,
    layers: [...document.querySelectorAll("#stageLayers .stage-layer")].map((el) => ({
      display: el.style.display,
      opacity: el.style.opacity,
      text: el.innerText?.slice(0, 60) || ""
    })),
    videoFrames: [...document.querySelectorAll("#stageLayers video")].map((el) => ({
      readyState: el.readyState,
      currentSrc: Boolean(el.currentSrc),
      time: el.currentTime,
      paused: el.paused
    })),
    errors: window.__viditErrors
  };
})();
