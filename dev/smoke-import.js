(async () => {
  const dbg = window.__viditDebug;
  if (!dbg) throw new Error("Debug handle is missing.");
  const base = "D:/projects/vidit/dev/media";
  const paths = [
    `${base}/sample-video.mp4`,
    `${base}/sample-bars.mp4`,
    `${base}/sample-audio.wav`,
    `${base}/sample-image.png`
  ];
  const imported = await window.vidit.importPaths(paths);
  dbg.store.addAssets(imported.assets || []);

  const byName = (name) => dbg.store.project.assets.find((asset) => asset.name === name);
  const video = byName("sample-video.mp4");
  const bars = byName("sample-bars.mp4");
  const audio = byName("sample-audio.wav");
  const image = byName("sample-image.png");

  const videoTracks = dbg.store.project.tracks.filter((track) => track.kind === "video");
  const audioTrack = dbg.store.project.tracks.find((track) => track.kind === "audio");
  const upperVideo = videoTracks[0];
  const lowerVideo = videoTracks[videoTracks.length - 1];

  const clips = [];
  if (video) {
    const clip = dbg.store.addAssetClip(video.id, lowerVideo.id, 0);
    if (clip) clips.push(clip.id);
  }
  if (bars) {
    const clip = dbg.store.addAssetClip(bars.id, lowerVideo.id, 6.2);
    if (clip) clips.push(clip.id);
  }
  if (image) {
    const clip = dbg.store.addAssetClip(image.id, upperVideo.id, 2);
    if (clip) clips.push(clip.id);
  }
  if (audio) {
    const clip = dbg.store.addAssetClip(audio.id, audioTrack.id, 1);
    if (clip) clips.push(clip.id);
  }

  dbg.store.selectClip(clips[0] || null);
  dbg.seekTo(1.5);
  dbg.preview.render();

  return {
    imported: (imported.assets || []).map((asset) => ({
      name: asset.name,
      type: asset.type,
      duration: asset.duration,
      width: asset.width,
      height: asset.height,
      hasAudio: asset.hasAudio,
      hasThumb: Boolean(asset.thumb),
      peaks: asset.peaks?.length || 0
    })),
    errors: imported.errors || [],
    clips: clips.length,
    tracks: dbg.store.project.tracks.map((track) => ({
      name: track.name,
      kind: track.kind,
      clips: track.clips.map((clip) => ({
        id: clip.id,
        type: clip.type,
        start: clip.start,
        duration: clip.duration,
        assetId: clip.assetId || null
      }))
    })),
    duration: dbg.store.duration,
    playhead: dbg.store.playhead,
    layers: document.querySelectorAll("#stageLayers > *").length,
    videos: [...document.querySelectorAll("#stageLayers video")].map((el) => ({
      src: el.currentSrc.slice(0, 30),
      readyState: el.readyState,
      paused: el.paused,
      time: el.currentTime
    })),
    rendererErrors: window.__viditErrors
  };
})();
