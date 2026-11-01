(() => {
  const s = window.__viditDebug.store;
  return {
    tracks: s.project.tracks.map((t, i) => ({
      i,
      id: t.id,
      name: t.name,
      kind: t.kind,
      hidden: Boolean(t.hidden),
      muted: Boolean(t.muted),
      clips: t.clips.map((c) => ({
        name: c.name,
        type: c.type,
        start: c.start,
        end: c.start + c.duration,
        duration: c.duration,
        opacity: c.opacity,
        scale: c.scale,
        transition: c.transition,
        fades: c.fades,
        effect: c.effect,
        hidden: Boolean(c.hidden)
      }))
    })),
    assets: s.project.assets.map((a) => ({ name: a.name, type: a.type, path: a.path })),
    playhead: s.playhead,
    duration: s.duration
  };
})();
