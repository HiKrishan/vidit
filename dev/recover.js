(async () => {
  const d = window.__viditDebug;
  for (let i = 0; i < 20; i++) {
    const clips = d.store.project.tracks.reduce((n, t) => n + t.clips.length, 0);
    const title = document.querySelector("#modalTitle").textContent;
    if (clips || (d.modal.isOpen && /recover/i.test(title))) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const before = {
    open: d.modal.isOpen,
    title: document.querySelector("#modalTitle").textContent,
    clips: d.store.project.tracks.reduce((n, t) => n + t.clips.length, 0)
  };
  let clicked = false;
  if (d.modal.isOpen && /recover unsaved work/i.test(document.querySelector("#modalTitle").textContent)) {
    document.querySelector('[data-action="restore"]')?.click();
    clicked = true;
    await new Promise((r) => setTimeout(r, 700));
  }
  return {
    before,
    clicked,
    after: {
      open: d.modal.isOpen,
      clips: d.store.project.tracks.map((t) => ({ name: t.name, count: t.clips.length })),
      duration: d.store.duration,
      assets: d.store.project.assets.map((a) => a.name),
      errors: window.__viditErrors
    }
  };
})();
