(async () => {
  const d = window.__viditDebug;
  const auto = await window.vidit.readAutosave();
  return {
    open: d?.modal.isOpen,
    title: document.querySelector("#modalTitle")?.textContent,
    auto: auto ? {
      name: auto.project.name,
      clips: auto.project.tracks.reduce((n, t) => n + t.clips.length, 0),
      assets: auto.project.assets.length,
      savedAt: auto.savedAt
    } : null,
    project: d ? {
      name: d.store.project.name,
      clips: d.store.project.tracks.reduce((n, t) => n + t.clips.length, 0)
    } : null,
    errors: window.__viditErrors
  };
})();
