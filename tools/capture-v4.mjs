// Capture driver for the v4 showcase plates (the UPDATE section).
//
//   pnpm build && pnpm preview --port 4173 --strictPort
//   node tools/capture-v4.mjs [baseUrl] [outDir]
//
// Produces:
//   10-engine-switch.png  the explorer on the WebGL2 route, engine switch visible
//   11-float32-gl.png     the seahorse at ×10⁸ rendered by the GPU (float32)
//   12-float64-cpu.png    the identical view rendered by Go/WASM (float64)
//
// 11 and 12 are the point of the whole section: same URL, same iteration
// count, one image intact and one collapsed into blocks. They are captured
// back to back from the same session so nothing but the engine differs.

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const CHROME =
  process.env.CHROME ??
  "/Users/n0ku/Library/Caches/ms-playwright/chromium-1148/chrome-mac/Chromium.app/Contents/MacOS/Chromium";
const BASE = process.argv[2] ?? "http://localhost:4173";
const OUT = (process.argv[3] ?? "./captures").replace(/\/$/, "") + "/";
mkdirSync(OUT, { recursive: true });

// The canonical seahorse point stays on the boundary at any depth, so the
// comparison measures the arithmetic rather than the location.
const DEEP = "?x=-0.743643887037151&y=0.131825904205330&zoom=100000000&size=1000";
const SWITCH_SCENE = "?x=-0.743644&y=0.131826&zoom=2044.58&size=1000";

const port = 9610 + Math.floor(Math.random() * 80);
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${port}`,
  "--headless=new",
  "--hide-scrollbars",
  "--no-first-run",
  `--user-data-dir=/tmp/mb-capture-v4-${port}`,
  "--window-size=1600,1000",
  "--enable-gpu",
  "--use-angle=metal",
  "about:blank",
]);
chrome.stderr.on("data", () => {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 80 && !wsUrl; i++) {
  try {
    const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
    wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl;
  } catch {}
  if (!wsUrl) await sleep(250);
}
const ws = new WebSocket(wsUrl);
await new Promise((res) => (ws.onopen = res));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result ?? m.error);
    pending.delete(m.id);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }))?.result
    ?.value;

await send("Page.enable");
await send("Runtime.enable");
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    window.__benchLogs = [];
    const orig = console.log.bind(console);
    console.log = (...a) => {
      const m = String(a[0] ?? "").match(/rendered in ([0-9.]+)ms/);
      if (m) window.__benchLogs.push(parseFloat(m[1]));
      orig(...a);
    };
  `,
});

const waitForCount = async (n, timeoutMs = 120000) => {
  const t0 = Date.now();
  for (;;) {
    if ((await evaluate("window.__benchLogs ? window.__benchLogs.length : 0")) >= n) return true;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${n} generations`);
    await sleep(120);
  }
};
const settle = async () => {
  await evaluate("document.fonts.ready.then(() => true)");
  await sleep(300);
};
const shot = async (file, opts = {}) => {
  const s = await send("Page.captureScreenshot", { format: "png", ...opts });
  writeFileSync(OUT + file, Buffer.from(s.data, "base64"));
  console.error("saved", file);
};
const setViewport = (width, height, deviceScaleFactor = 1) =>
  send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor, mobile: false });

// Motion off throughout: the scan line and the busy dot must not differ
// between the two halves of the comparison pair.
await send("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});

// ── 10 · the explorer with the engine switch ────────────────────────────────
await setViewport(1600, 1000);
await send("Page.navigate", { url: `${BASE}/gl${SWITCH_SCENE}` });
await waitForCount(1);
await settle();
await shot("10-engine-switch.png");

// ── 11 / 12 · the float32 wall, same view, two engines ──────────────────────
// Just the canvas: the UI would only distract from the one thing that differs.
// DPR stays 1 so the clip box (CSS pixels) and the screenshot share one
// coordinate space; the retina factor is applied by the clip's own scale.
await setViewport(1400, 1200, 1);
for (const [file, route] of [
  ["11-float32-gl.png", "/gl"],
  ["12-float64-cpu.png", "/go"],
]) {
  await send("Page.navigate", { url: `${BASE}${route}${DEEP}` });
  await waitForCount(1);
  await settle();
  // The HUD floats over the canvas, so clipping to the canvas would catch
  // panel corners. Hide it — these two plates are about the pixels alone.
  await evaluate(
    `(document.querySelectorAll('[data-hud]').forEach(el => (el.style.display = 'none')), true)`
  );
  await sleep(120);
  const box = JSON.parse(
    await evaluate(`(() => {
      const b = document.querySelector("canvas").getBoundingClientRect();
      return JSON.stringify({
        x: Math.round(b.x), y: Math.round(b.y),
        width: Math.round(b.width), height: Math.round(b.height),
      });
    })()`)
  );
  await shot(file, { clip: { ...box, scale: 2 } });
}

ws.close();
chrome.kill();
process.exit(0);
