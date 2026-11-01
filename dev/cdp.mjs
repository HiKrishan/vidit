// Tiny CDP client used only for local UI smoke tests.
// Usage:
//   node dev/cdp.mjs eval "<expression>"
//   node dev/cdp.mjs eval-file dev/script.js
//   node dev/cdp.mjs shot C:\path\shot.png
//   node dev/cdp.mjs eval-shot dev/script.js C:\path\shot.png
import { readFile, writeFile } from "node:fs/promises";

const port = process.env.VIDIT_CDP_PORT || "9222";
const mode = process.argv[2] || "eval";
const arg = process.argv[3] || "";

async function target() {
  const response = await fetch(`http://127.0.0.1:${port}/json`);
  if (!response.ok) throw new Error(`CDP endpoint returned ${response.status}`);
  const targets = await response.json();
  const page = targets.find((item) => item.type === "page" && /index\.html/i.test(item.url)) ||
    targets.find((item) => item.type === "page");
  if (!page?.webSocketDebuggerUrl) throw new Error("No debuggable page target found.");
  return page;
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let nextId = 1;
    const ready = setTimeout(() => reject(new Error("CDP connection timed out.")), 5000);

    socket.addEventListener("open", () => {
      clearTimeout(ready);
      resolve({
        send(method, params = {}) {
          return new Promise((res, rej) => {
            const id = nextId++;
            pending.set(id, { res, rej });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          socket.close();
        }
      });
    });

    socket.addEventListener("message", (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!data.id || !pending.has(data.id)) return;
      const { res, rej } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) rej(new Error(`${data.error.message} (${data.error.code})`));
      else res(data.result);
    });

    socket.addEventListener("error", () => {
      clearTimeout(ready);
      reject(new Error("CDP socket failed."));
    });
  });
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails;
    const message = detail.exception?.description || detail.text || "Evaluation failed.";
    throw new Error(message);
  }
  return result.result?.value;
}

const page = await target();
const client = await connect(page.webSocketDebuggerUrl);

try {
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  if (mode === "eval") {
    const value = await evaluate(client, arg);
    console.log(JSON.stringify(value, null, 2));
  } else if (mode === "eval-file") {
    const expression = await readFile(arg, "utf8");
    console.log(JSON.stringify(await evaluate(client, expression), null, 2));
  } else if (mode === "eval-shot") {
    const expression = await readFile(arg, "utf8");
    const value = await evaluate(client, expression);
    console.log(JSON.stringify(value, null, 2));
    const shot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(process.argv[4], Buffer.from(shot.data, "base64"));
    console.log(`screenshot: ${process.argv[4]}`);
  } else if (mode === "shot") {
    const shot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(arg, Buffer.from(shot.data, "base64"));
    console.log(`screenshot: ${arg}`);
  } else if (mode === "boot-watch") {
    const source = `
      window.__bootEvents = [];
      const mark = (type, extra = {}) => window.__bootEvents.push({ t: Math.round(performance.now()), type, ...extra });
      document.addEventListener("keydown", (event) => mark("keydown", {
        key: event.key,
        ctrl: event.ctrlKey,
        target: event.target?.id || event.target?.tagName
      }), true);
      document.addEventListener("pointerdown", (event) => mark("pointerdown", {
        target: event.target?.id || event.target?.className || event.target?.tagName
      }), true);
      const start = () => {
        const root = document.getElementById("modalRoot");
        const title = document.getElementById("modalTitle");
        if (!root) return setTimeout(start, 10);
        mark("observer-ready", { hidden: root.hidden });
        new MutationObserver(() => mark("modal-hidden", {
          hidden: root.hidden,
          title: title?.textContent || ""
        })).observe(root, { attributes: true, attributeFilter: ["hidden"] });
      };
      start();
    `;
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source });
    await client.send("Page.reload", { ignoreCache: true });
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const state = await evaluate(client, `(async () => {
      const d = window.__viditDebug;
      const before = {
        open: d ? d.modal.isOpen : null,
        title: document.querySelector("#modalTitle")?.textContent || "",
        clips: d ? d.store.project.tracks.reduce((n, t) => n + t.clips.length, 0) : null,
        events: window.__bootEvents || []
      };
      let clicked = false;
      if (d && d.modal.isOpen && /recover unsaved work/i.test(before.title)) {
        document.querySelector('[data-action="restore"]')?.click();
        clicked = true;
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      return {
        before,
        clicked,
        after: d ? {
          open: d.modal.isOpen,
          clips: d.store.project.tracks.reduce((n, t) => n + t.clips.length, 0),
          duration: d.store.duration
        } : null
      };
    })()`);
    console.log(JSON.stringify(state, null, 2));
  } else {
    throw new Error(`Unknown mode: ${mode}`);
  }
} finally {
  client.close();
}
