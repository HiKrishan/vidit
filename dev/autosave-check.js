(async () => {
  const d = window.__viditDebug;
  const auto = await window.vidit.readAutosave();
  return {
    debug: Boolean(d),
    appInfo: d?.appInfo || null,
    info: await window.vidit.getInfo().catch((err) => ({ error: String(err) })),
    autosave: auto ? {
      savedAt: auto.savedAt,
      projectSavedAt: auto.project.savedAt,
      clips: auto.project.tracks.reduce((n, t) => n + t.clips.length, 0),
      assets: auto.project.assets.map((a) => a.name),
      newer: Number(auto.savedAt) > Number(auto.project.savedAt || 0) + 1500
    } : null,
    modal: {
      open: d?.modal.isOpen,
      title: document.querySelector("#modalTitle")?.textContent
    },
    errors: window.__viditErrors
  };
})();
