// Screenshot driver for the showcase plates.
//
//   pnpm build && pnpm preview --port 4173 --strictPort
//   node tools/capture.mjs [baseUrl] [outDir]
//
// Produces:
//   01-explorer-ui.png   the whole UI, caught mid-stream (preview underneath,
//                        full-resolution bands landing centre-out)
//   08-bench-wasm.png    the stats panel after 10 clean generations, Go/WASM
//   09-bench-ts.png      the same, TypeScript
//
// Everything the driver depends on in the app is load-bearing and marked as
// such in the source: the `rendered in Xms` console line, `[data-fractal-surface]`,
// `[data-hud="stats"]`, `button[title="Reset Statistics"]` and `window.__fxTiles`.

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const CHROME =
  process.env.CHROME ??
  "/Users/n0ku/Library/Caches/ms-playwright/chromium-1148/chrome-mac/Chromium.app/Contents/MacOS/Chromium";
const BASE = process.argv[2] ?? "http://localhost:4173";
const OUT = (process.argv[3] ?? "./captures").replace(/\/$/, "") + "/";
mkdirSync(OUT, { recursive: true });

const WARMUP = 3;
const RUNS = 10;
// The UI plate has to show the progressive render, so it needs a view with
// structure across the WHOLE frame: at the seahorse scene the top and bottom
// thirds are solid black (inside the set), and a half-painted frame there is
// indistinguishable from a finished one.
const SCENE_UI = "?x=-0.743644&y=0.131826&zoom=2044.58&size=1000";
const SCENE_BENCH = "?x=0&y=0&zoom=1&size=1000";

const port = 9910 + Math.floor(Math.random() * 80);
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${port}`,
  "--headless=new",
  "--hide-scrollbars",
  "--no-first-run",
  "--user-data-dir=/tmp/mb-capture",
  "--window-size=1920,1080",
  "about:blank",
]);
chrome.stderr.on("data", () => {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
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
// Installed before any page script: the app's per-frame log line is what tells
// us a generation finished.
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

const waitForCount = async (n, timeoutMs = 90000) => {
  const t0 = Date.now();
  for (;;) {
    if ((await evaluate("window.__benchLogs ? window.__benchLogs.length : 0")) >= n) return true;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${n} generations`);
    await sleep(120);
  }
};

/** Re-render the identical view: a wheel with deltaY 0 is a zoom factor of 1. */
const rerender = (w, h) =>
  evaluate(`(() => {
    const el = document.querySelector("[data-fractal-surface]");
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: 0, clientX: ${Math.round(w / 2)}, clientY: ${Math.round(h / 2)}, bubbles: true, cancelable: true }));
    return true;
  })()`);

/** Orbitron is font-display:swap — shooting before it lands gives Helvetica. */
const settle = async () => {
  await evaluate("document.fonts.ready.then(() => true)");
  await sleep(250);
};

const shot = async (file, opts = {}) => {
  const s = await send("Page.captureScreenshot", { format: "png", ...opts });
  writeFileSync(OUT + file, Buffer.from(s.data, "base64"));
  console.error("saved", file);
};

const setViewport = (width, height, deviceScaleFactor = 1) =>
  send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor, mobile: false });

const setReducedMotion = (reduce) =>
  send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }],
  });

// ── 01 · the whole UI, mid-stream ───────────────────────────────────────────
// The scan line and the busy dot should be animating, so motion stays on.
await setReducedMotion(false);
await setViewport(1920, 1080);
await send("Page.navigate", { url: `${BASE}/${SCENE_UI}` });
await waitForCount(1);
await settle();

// One warm pass (the first is always slow: WASM tier-up), then photograph the
// next one while roughly half its bands have landed.
await rerender(1920, 1080);
await waitForCount(2);
await sleep(200);
await rerender(1920, 1080);
const caught = await evaluate(`(async () => {
  const t0 = performance.now();
  while (performance.now() - t0 < 4000) {
    const n = window.__fxTiles ? window.__fxTiles.painted : 0;
    if (n >= 4 && n <= 8) return n;
    await new Promise(r => setTimeout(r, 2));
  }
  return -1;
})()`);
await shot("01-explorer-ui.png");
console.error(`  01 caught at ${caught}/12 bands painted`);

// ── 08 / 09 · the stats panel, twins ────────────────────────────────────────
// Motion off so the dot and the scan line can't differ between the two plates.
await setReducedMotion(true);
await setViewport(1440, 900, 2);

const heights = [];
for (const [file, route] of [
  ["08-bench-wasm.png", "/go"],
  ["09-bench-ts.png", "/js"],
]) {
  await send("Page.navigate", { url: `${BASE}${route}${SCENE_BENCH}` });
  await waitForCount(1);
  await settle();
  for (let i = 1; i <= WARMUP; i++) {
    await rerender(1440, 900);
    await waitForCount(1 + i);
  }
  await evaluate(`document.querySelector('button[title="Reset Statistics"]').click(), true`);
  await sleep(200);
  for (let i = 1; i <= RUNS; i++) {
    await rerender(1440, 900);
    await waitForCount(1 + WARMUP + i);
  }
  await settle();

  // Measure the panel rather than hardcoding a clip, so the framing survives
  // any future edit to the layout.
  const box = JSON.parse(
    await evaluate(`(() => {
      const b = document.querySelector('[data-hud="stats"]').getBoundingClientRect();
      const bleed = 14;
      return JSON.stringify({
        x: Math.max(0, Math.floor(b.x) - bleed),
        y: Math.max(0, Math.floor(b.y) - bleed),
        width: Math.ceil(b.width) + bleed * 2,
        height: Math.ceil(b.height) + bleed * 2,
      });
    })()`)
  );
  heights.push(box.height);
  await shot(file, { clip: { ...box, scale: 2 } });
  const avg = await evaluate(
    "(() => { const l = window.__benchLogs.slice(-" +
      RUNS +
      "); return Math.round(l.reduce((a,b)=>a+b,0)/l.length*10)/10; })()"
  );
  console.error(`  ${file}: avg ${avg} ms over ${RUNS} runs`);
}

if (heights[0] !== heights[1]) {
  console.error(`  ⚠ twin plates differ in height: ${heights[0]} vs ${heights[1]}`);
}

console.log(JSON.stringify({ ok: true, out: OUT, twinHeights: heights }));
ws.close();
chrome.kill();
process.exit(0);
