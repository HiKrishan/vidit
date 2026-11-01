"use strict";

// Installed before the module graph so load-time failures are still reported.
window.__viditErrors = [];

window.addEventListener("error", (event) => {
  window.__viditErrors.push({
    type: "error",
    message: event.message || String(event.error || "Unknown error"),
    source: event.filename || "",
    line: event.lineno || 0
  });
});

window.addEventListener("unhandledrejection", (event) => {
  window.__viditErrors.push({
    type: "unhandledrejection",
    message: String(event.reason?.stack || event.reason || "Unknown rejection")
  });
});
