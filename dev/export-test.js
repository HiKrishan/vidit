(async () => {
  const dbg = window.__viditDebug;
  const store = dbg.store;
  const started = performance.now();
  const events = [];
  const unsubs = [];

  const finish = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Export timed out")), 180000);
    unsubs.push(
      window.vidit.onExportProgress((payload) => {
        events.push({ type: "progress", percent: Math.round(payload.percent * 10) / 10 });
      })
    );
    unsubs.push(
      window.vidit.onExportDone((payload) => {
        clearTimeout(timer);
        resolve({ type: "done", payload });
      })
    );
    unsubs.push(
      window.vidit.onExportFailed((payload) => {
        clearTimeout(timer);
        resolve({ type: "failed", payload });
      })
    );
  });

  const width = store.project.settings.width;
  const height = store.project.settings.height;
  const textImages = await dbg.buildTextImages(store.project, { width, height });

  const result = await window.vidit.startExport(
    store.project,
    {
      format: "mp4",
      quality: "small",
      scale: 1,
      fps: 30,
      audio: true,
      outputPath: "D:/projects/vidit/dev/out/test.mp4"
    },
    textImages
  );

  const outcome = await finish;
  unsubs.forEach((unsub) => unsub());
  return {
    result,
    outcome: {
      type: outcome.type,
      error: outcome.payload?.error || null,
      log: outcome.payload?.log?.slice(-4000) || "",
      outputPath: outcome.payload?.outputPath || null,
      size: outcome.payload?.size || null,
      durationMs: Math.round(performance.now() - started)
    },
    progressSamples: events.length,
    lastProgress: events.slice(-3)
  };
})();
