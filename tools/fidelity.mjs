// Pixel-fidelity driver: how far does each engine drift from the Go/WASM
// reference, and where does that drift come from?
//
//   pnpm build && pnpm preview --port 4173 --strictPort
//   node tools/fidelity.mjs [baseUrl] [engines]
//
//   node tools/fidelity.mjs http://localhost:4173 js,gl,simd
//
// Every engine runs the same escape-time algorithm, so in exact arithmetic
// every route would be bit-identical. They are not, and the interesting part
// is why:
//
//   · Go, TypeScript and Rust all use IEEE-754 float64 → they should agree
//     exactly. Any drift there is a bug, not a rounding artefact.
//   · WebGL2 has no float64 at all (GLSL ES 3.0 tops out at highp float,
//     32-bit) → it must drift, and the drift grows with how much of the frame
//     sits on the chaotic boundary.
//
// The scenes below all sit on the canonical seahorse-valley point, which stays
// ON the boundary at every depth. That matters: a deep zoom into a smooth
// region agrees to the byte on every engine, so picking the location badly
// measures the location instead of the arithmetic.
//
// Depends on the same load-bearing hooks as capture.mjs: the `rendered in Xms`
// console line and a single <canvas>.

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const CHROME =
  process.env.CHROME ??
  "/Users/n0ku/Library/Caches/ms-playwright/chromium-1148/chrome-mac/Chromium.app/Contents/MacOS/Chromium";
const BASE = process.argv[2] ?? "http://localhost:4173";
const ENGINES = (process.argv[3] ?? "js,gl").split(",").filter(Boolean);

// Small enough to move over CDP as base64 in one go, big enough that a
// percentage means something. Stated in the published methodology.
const SIZE = 600;

const ROUTES = { wasm: "/go", js: "/js", gl: "/gl", simd: "/" };
const LABELS = { wasm: "Go · WASM", js: "TypeScript", gl: "WebGL2", simd: "Rust · SIMD" };

// The seahorse point stays on the boundary at every depth.
const CX = -0.743643887037151;
const CY = 0.131825904205330;
const SCENES = [
  { name: "the whole set", x: 0, y: 0, zoom: 1 },
  { name: "seahorse ×10²", x: CX, y: CY, zoom: 1e2 },
  { name: "seahorse ×10⁴", x: CX, y: CY, zoom: 1e4 },
  { name: "seahorse ×10⁶", x: CX, y: CY, zoom: 1e6 },
  { name: "seahorse ×10⁸", x: CX, y: CY, zoom: 1e8 },
];

const port = 9810 + Math.floor(Math.random() * 80);
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${port}`,
  "--headless=new",
  "--hide-scrollbars",
  "--no-first-run",
  "--user-data-dir=/tmp/mb-fidelity",
  "--window-size=1400,1000",
  // Headless Chromium falls back to SwiftShader without this; we want the
  // real GPU so the WebGL2 numbers describe actual hardware.
  "--enable-gpu",
  "--use-angle=metal",
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

/** Pull the finished frame back as raw RGB, base64-encoded. */
const grabFrame = async () =>
  evaluate(`(() => {
    const c = document.querySelector("canvas");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const n = d.length / 4;
    const rgb = new Uint8Array(n * 3);
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
      rgb[j] = d[i]; rgb[j + 1] = d[i + 1]; rgb[j + 2] = d[i + 2];
    }
    let s = "";
    const CH = 0x8000;
    for (let i = 0; i < rgb.length; i += CH) {
      s += String.fromCharCode.apply(null, rgb.subarray(i, i + CH));
    }
    return btoa(s);
  })()`);

const load = async (engine, scene) => {
  // No explicit ?iter= — both routes derive it from zoom with the same shared
  // formula, which is exactly how the app runs for a real visitor.
  const q = `?x=${scene.x}&y=${scene.y}&zoom=${scene.zoom}&size=${SIZE}`;
  await send("Page.navigate", { url: `${BASE}${ROUTES[engine]}${q}` });
  await waitForCount(1);
  await sleep(250);
  return Buffer.from(await grabFrame(), "base64");
};

/** Compare two RGB buffers of identical length. */
const compare = (ref, other) => {
  const px = ref.length / 3;
  let differing = 0;
  let visible = 0; // a delta of >8 on some channel is where the eye starts to see it
  let maxDelta = 0;
  let sumAbs = 0;
  for (let i = 0; i < ref.length; i += 3) {
    const dr = Math.abs(ref[i] - other[i]);
    const dg = Math.abs(ref[i + 1] - other[i + 1]);
    const db = Math.abs(ref[i + 2] - other[i + 2]);
    const m = Math.max(dr, dg, db);
    if (m > 0) differing++;
    if (m > 8) visible++;
    if (m > maxDelta) maxDelta = m;
    sumAbs += dr + dg + db;
  }
  return {
    differingPct: +((100 * differing) / px).toFixed(3),
    visiblePct: +((100 * visible) / px).toFixed(3),
    maxChannelDelta: maxDelta,
    meanAbsPerChannel: +(sumAbs / (px * 3)).toFixed(3),
  };
};

/** How much of the frame is actually structured, so a "0% drift" can't be a
 *  flat region agreeing with itself. */
const structure = (rgb) => {
  const seen = new Set();
  for (let i = 0; i < rgb.length; i += 3 * 97) {
    seen.add((rgb[i] << 16) | (rgb[i + 1] << 8) | rgb[i + 2]);
  }
  return seen.size;
};

const results = [];
for (const scene of SCENES) {
  const ref = await load("wasm", scene);
  const colors = structure(ref);
  const row = { scene: scene.name, zoom: scene.zoom, distinctColors: colors, engines: {} };
  console.error(`\n${scene.name} (zoom ${scene.zoom}) — reference has ${colors} distinct colours`);
  for (const engine of ENGINES) {
    try {
      const buf = await load(engine, scene);
      const stats = compare(ref, buf);
      row.engines[engine] = stats;
      console.error(
        `  ${LABELS[engine].padEnd(12)} ${String(stats.differingPct).padStart(7)}% differ · ` +
          `${String(stats.visiblePct).padStart(7)}% visibly · mean ${stats.meanAbsPerChannel} · max ${stats.maxChannelDelta}`
      );
    } catch (e) {
      row.engines[engine] = { error: String(e) };
      console.error(`  ${LABELS[engine].padEnd(12)} FAILED: ${e}`);
    }
  }
  results.push(row);
}

const out = {
  measuredAt: new Date().toISOString(),
  base: BASE,
  size: SIZE,
  reference: "wasm",
  note: "Iterations come from the shared adaptive formula, identical on every route.",
  results,
};
writeFileSync("./fidelity-results.json", JSON.stringify(out, null, 2));
console.error("\nwrote fidelity-results.json");

ws.close();
chrome.kill();
process.exit(0);
