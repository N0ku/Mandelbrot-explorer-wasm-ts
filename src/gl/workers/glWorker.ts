// WebGL2 engine worker — the escape-time kernel run as a fragment shader on
// the GPU, inside an OffscreenCanvas. It speaks the same renderTile protocol
// as the WASM pool and the TS worker, so the host pipeline and the measured
// window are identical and the comparison stays honest.
//
// The GPU is a SIMT machine: one invocation per pixel, thousands in lockstep.
// That is the data-parallel answer to the SIMD question — at the price of
// float32 (see kernel.frag.glsl).

import type { RenderTileRequest } from "../../shared/renderTypes";
import fragmentSource from "../kernel.frag.glsl?raw";

// Full-screen triangle straight from gl_VertexID — no vertex buffer, no
// attributes. One oversized triangle rather than two: no diagonal seam.
const VERTEX_SOURCE = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

interface Uniforms {
  center: WebGLUniformLocation | null;
  scale: WebGLUniformLocation | null;
  half: WebGLUniformLocation | null;
  origin: WebGLUniformLocation | null;
  maxIter: WebGLUniformLocation | null;
  isJulia: WebGLUniformLocation | null;
  julia: WebGLUniformLocation | null;
}

let canvas: OffscreenCanvas | null = null;
let gl: WebGL2RenderingContext | null = null;
let uniforms: Uniforms | null = null;

function compile(ctx: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = ctx.createShader(type);
  if (!shader) throw new Error("createShader failed");
  ctx.shaderSource(shader, source);
  ctx.compileShader(shader);
  if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS)) {
    const log = ctx.getShaderInfoLog(shader);
    ctx.deleteShader(shader);
    throw new Error(`shader compilation failed: ${log}`);
  }
  return shader;
}

function init(): void {
  canvas = new OffscreenCanvas(1, 1);
  const ctx = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
  });
  if (!ctx) throw new Error("WebGL2 is unavailable in this browser");
  gl = ctx;

  const program = gl.createProgram();
  if (!program) throw new Error("createProgram failed");
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  gl.useProgram(program);

  // Drawing with no attributes still needs a bound VAO in WebGL2.
  gl.bindVertexArray(gl.createVertexArray());

  uniforms = {
    center: gl.getUniformLocation(program, "uCenter"),
    scale: gl.getUniformLocation(program, "uScale"),
    half: gl.getUniformLocation(program, "uHalf"),
    origin: gl.getUniformLocation(program, "uOrigin"),
    maxIter: gl.getUniformLocation(program, "uMaxIter"),
    isJulia: gl.getUniformLocation(program, "uIsJulia"),
    julia: gl.getUniformLocation(program, "uJulia"),
  };
}

self.onmessage = (e: MessageEvent<RenderTileRequest>) => {
  const msg = e.data;
  if (msg.type !== "renderTile") return;
  try {
    if (!gl || !canvas || !uniforms) throw new Error("WebGL2 engine not ready");
    const { generation, taskId, view, x0, y0, w, h } = msg;
    if (x0 !== 0 || y0 !== 0 || w !== view.totalSize || h !== view.totalSize) {
      throw new Error("WebGL2 engine renders full frames only (bands must be 1)");
    }

    const t0 = performance.now();

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);

    gl.uniform2f(uniforms.center, view.panX, view.panY);
    gl.uniform1f(uniforms.scale, 4.0 / (view.totalSize * view.zoom));
    gl.uniform1f(uniforms.half, view.totalSize * 0.5);
    gl.uniform2f(uniforms.origin, x0, y0);
    gl.uniform1i(uniforms.maxIter, view.maxIter);
    gl.uniform1i(uniforms.isJulia, view.isJulia ? 1 : 0);
    gl.uniform2f(uniforms.julia, view.juliaRe, view.juliaIm);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // The GPU's boundary, and it is synchronous: readPixels blocks until the
    // draw has finished and the bytes are back in CPU memory — the exact
    // counterpart of Go's CopyBytesToJS memcpy. An async PBO readback
    // (fenceSync + getBufferSubData) would hide it; noted as a next step.
    const pixels = new Uint8ClampedArray(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    const kernelMs = performance.now() - t0;
    self.postMessage(
      { type: "tileDone", generation, taskId, x0, y0, w, h, pixels, kernelMs },
      { transfer: [pixels.buffer] }
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      generation: msg.generation,
      taskId: msg.taskId,
      error: String(error),
    });
  }
};

try {
  init();
  self.postMessage({ type: "ready" });
} catch (error) {
  self.postMessage({ type: "error", error: `WebGL2 initialization failed: ${error}` });
}

export {};
