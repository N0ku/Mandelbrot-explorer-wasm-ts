// Benchmark driver — every engine, every scene, in ONE session.
//
//   pnpm build && pnpm preview --port 4173 --strictPort
//   node tools/bench.mjs [baseUrl]
//
// One session is not a detail. The same build measured twice on the same day
// has come back 13% apart with not a line of code changed, so absolute
// milliseconds are only comparable against numbers taken minutes apart on the
// same machine in the same state. Anything published as a table has to come
// out of a single run of this file.
//
// The timed window is the app's own: dispatch of the full-resolution pass to
// the last putImageData, logged by FractalExplorer as `rendered in Xms`. The
// preview pass is never counted.

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const CHROME =
  process.env.CHROME ??
  "/Users/n0ku/Library/Caches/ms-playwright/chromium-1148/chrome-mac/Chromium.app/Contents/MacOS/Chromium";
const BASE = process.argv[2] ?? "http://localhost:4173";

const WARMUP = 3;
const RUNS = 10;
const SIZE = 1000;
const VIEWPORT = [1440, 900];

// Engines. `workers` is only meaningful for the pooled ones; WebGL2 and the TS
// route are single by nature.
const ENGINES = [
  { key: "wasm", label: "Go · WASM ×6", route: "/", extra: "" },
  { key: "js", label: "TypeScript", route: "/js", extra: "" },
  { key: "gl", label: "WebGL2", route: "/gl", extra: "" },
  { key: "simd", label: "Rust · SIMD ×6", route: "/simd", extra: "" },
  { key: "scalar", label: "Rust · scalar ×6", route: "/simd", extra: "&simd=0" },
  // The "one instance each" comparison: strip the pool and the engines face
  // the single TS worker on equal terms.
  { key: "wasm1", label: "Go · WASM ×1", route: "/", extra: "&workers=1" },
  { key: "simd1", label: "Rust · SIMD ×1", route: "/simd", extra: "&workers=1" },
  { key: "scalar1", label: "Rust · scalar ×1", route: "/simd", extra: "&workers=1&simd=0" },
];

const SCENES = [
  { key: "set", label: "The whole set", q: `?x=0&y=0&zoom=1&size=${SIZE}` },
  { key: "edge", label: "Off-centre edge", q: `?x=-0.75&y=0.1&zoom=1&size=${SIZE}` },
  {
    key: "julia",
    label: "Julia (−0.4 + 0.6i)",
    q: `?x=0&y=0&zoom=1&size=${SIZE}&julia=true&juliaRe=-0.4&juliaIm=0.6`,
  },
  {
    key: "deep",
    label: "Deep zoom ×2045",
    q: `?x=-0.743644&y=0.131826&zoom=2044.58&size=${SIZE}`,
  },
];

const port = 9710 + Math.floor(Math.random() * 80);
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${port}`,
  "--headless=new",
  "--hide-scrollbars",
  "--no-first-run",
  `--user-data-dir=/tmp/mb-bench-${port}`,
  `--window-size=${VIEWPORT[0]},${VIEWPORT[1]}`,
  // Without these headless Chromium renders WebGL through SwiftShader on the
  // CPU, which would make the GPU row meaningless.
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
if (!wsUrl) {
  console.error("Chromium never came up on the debugging port");
  process.exit(1);
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
await send("Emulation.setDeviceMetricsOverride", {
  width: VIEWPORT[0],
  height: VIEWPORT[1],
  deviceScaleFactor: 1,
  mobile: false,
});
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

const waitForCount = async (n, timeoutMs = 180000) => {
  const t0 = Date.now();
  for (;;) {
    if ((await evaluate("window.__benchLogs ? window.__benchLogs.length : 0")) >= n) return true;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${n} generations`);
    await sleep(100);
  }
};

/** Re-render the identical view: a wheel with deltaY 0 is a zoom factor of 1. */
const rerender = () =>
  evaluate(`(() => {
    const el = document.querySelector("[data-fractal-surface]");
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: 0, clientX: ${Math.round(
      VIEWPORT[0] / 2
    )}, clientY: ${Math.round(VIEWPORT[1] / 2)}, bubbles: true, cancelable: true }));
    return true;
  })()`);

const results = {};
for (const scene of SCENES) {
  results[scene.key] = { label: scene.label, engines: {} };
  console.error(`\n── ${scene.label} ${"─".repeat(Math.max(0, 40 - scene.label.length))}`);
  for (const engine of ENGINES) {
    try {
      await send("Page.navigate", { url: `${BASE}${engine.route}${scene.q}${engine.extra}` });
      await waitForCount(1);
      for (let i = 1; i <= WARMUP; i++) {
        await rerender();
        await waitForCount(1 + i);
      }
      for (let i = 1; i <= RUNS; i++) {
        await rerender();
        await waitForCount(1 + WARMUP + i);
      }
      const stats = JSON.parse(
        await evaluate(`(() => {
          const l = window.__benchLogs.slice(-${RUNS});
          const mean = l.reduce((a, b) => a + b, 0) / l.length;
          return JSON.stringify({
            mean: Math.round(mean * 10) / 10,
            best: Math.round(Math.min(...l) * 10) / 10,
            worst: Math.round(Math.max(...l) * 10) / 10,
            runs: l.length,
          });
        })()`)
      );
      results[scene.key].engines[engine.key] = { label: engine.label, ...stats };
      console.error(
        `  ${engine.label.padEnd(18)} ${String(stats.mean).padStart(8)} ms  ` +
          `(best ${stats.best}, worst ${stats.worst})`
      );
    } catch (e) {
      results[scene.key].engines[engine.key] = { label: engine.label, error: String(e) };
      console.error(`  ${engine.label.padEnd(18)} FAILED: ${e}`);
    }
  }
}

const meta = JSON.parse(
  await evaluate(`JSON.stringify({
    cores: navigator.hardwareConcurrency,
    ua: navigator.userAgent,
  })`)
);

writeFileSync(
  "./bench-results.json",
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      base: BASE,
      size: SIZE,
      warmup: WARMUP,
      runs: RUNS,
      window: "full-resolution dispatch → last putImageData (preview excluded)",
      ...meta,
      results,
    },
    null,
    2
  )
);
console.error("\nwrote bench-results.json");

ws.close();
chrome.kill();
process.exit(0);
