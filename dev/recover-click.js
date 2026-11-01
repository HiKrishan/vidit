(async () => {
  const d = window.__viditDebug;
  const auto = await window.vidit.readAutosave();
  const before = {
    open: d.modal.isOpen,
    title: document.querySelector("#modalTitle")?.textContent || "",
    autosave: auto ? {
      savedAt: auto.savedAt,
      clips: auto.project.tracks.reduce((n, t) => n + t.clips.length, 0),
      assets: auto.project.assets.length
    } : null
  };
  let clicked = false;
  const button = document.querySelector('#modalActions [data-action="restore"]');
  if (d.modal.isOpen && button) {
    button.click();
    clicked = true;
    await new Promise((r) => setTimeout(r, 1200));
  }
  return {
    before,
    clicked,
    after: {
      open: d.modal.isOpen,
      title: document.querySelector("#modalTitle")?.textContent || "",
      clips: d.store.project.tracks.map((t) => ({ name: t.name, count: t.clips.length })),
      duration: d.store.duration,
      assets: d.store.project.assets.map((a) => a.name),
      errors: window.__viditErrors
    }
  };
})();
