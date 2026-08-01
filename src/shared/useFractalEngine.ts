import { useCallback, useEffect, useRef, useState } from "react";
import type { EngineMessage, FractalView, RenderTileRequest, TileDone } from "./renderTypes";

// A pool of identical workers speaking the renderTile protocol. The hook is
// engine-agnostic: the Go/WASM route passes 1..6 wasm workers, the TS route a
// single TS worker. Frames are cut into horizontal bands, sorted centre-out,
// and STREAMED — every tile is painted the moment it lands, no barrier.
//
// Generation tokens make the last request always win: a new render() purges
// the queue and stale tiles are dropped on arrival, so a frame can never be
// silently lost nor a ghost tile painted.

interface WorkerSlot {
  worker: Worker;
  busy: boolean;
}

interface PendingPass {
  gen: number;
  remaining: number;
  t0: number;
  resolve: (ms: number | null) => void;
  paint: (tile: TileDone) => void;
}

export interface RenderOpts {
  /** Number of horizontal bands to cut the frame into (1 = whole frame). */
  bands: number;
  /** Called for every tile of the CURRENT generation, in arrival order. */
  paint: (tile: TileDone) => void;
}

export interface FractalEngine {
  isReady: boolean;
  /**
   * Renders one pass. Resolves with the wall-clock ms from dispatch to the
   * last painted tile, or null when superseded by a newer pass.
   */
  render: (view: FractalView, opts: RenderOpts) => Promise<number | null>;
}

function makeBands(totalSize: number, n: number) {
  if (n <= 1 || n >= totalSize) {
    return [{ x0: 0, y0: 0, w: totalSize, h: totalSize }];
  }
  const base = Math.floor(totalSize / n);
  const rem = totalSize % n;
  const bands: { x0: number; y0: number; w: number; h: number }[] = [];
  let y = 0;
  for (let i = 0; i < n; i++) {
    const h = base + (i < rem ? 1 : 0);
    bands.push({ x0: 0, y0: y, w: totalSize, h });
    y += h;
  }
  // Centre-out: the interesting part of the frame lands first.
  const mid = totalSize / 2;
  bands.sort((a, b) => Math.abs(a.y0 + a.h / 2 - mid) - Math.abs(b.y0 + b.h / 2 - mid));
  return bands;
}

export function useFractalEngine({
  createWorker,
  poolSize,
}: {
  createWorker: () => Worker;
  poolSize: number;
}): FractalEngine {
  const [isReady, setIsReady] = useState(false);
  const slotsRef = useRef<WorkerSlot[]>([]);
  const queueRef = useRef<RenderTileRequest[]>([]);
  const genRef = useRef(0);
  const pendingRef = useRef<PendingPass | null>(null);

  const dispatchTo = useCallback((slot: WorkerSlot) => {
    if (slot.busy) return;
    const task = queueRef.current.shift();
    if (!task) return;
    slot.busy = true;
    slot.worker.postMessage(task);
  }, []);

  const settleTile = useCallback((gen: number) => {
    const pending = pendingRef.current;
    if (!pending || gen !== pending.gen) return null;
    return pending;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let readyCount = 0;
    const slots: WorkerSlot[] = Array.from({ length: poolSize }, () => ({
      worker: createWorker(),
      busy: false,
    }));
    slotsRef.current = slots;

    for (const slot of slots) {
      slot.worker.onmessage = (e: MessageEvent<EngineMessage>) => {
        const msg = e.data;
        if (msg.type === "ready") {
          readyCount++;
          if (readyCount === poolSize && !cancelled) setIsReady(true);
          dispatchTo(slot);
          return;
        }
        if (msg.type === "tileDone") {
          slot.busy = false;
          const pending = settleTile(msg.generation);
          if (pending) {
            pending.paint(msg);
            pending.remaining--;
            if (pending.remaining === 0) {
              pending.resolve(performance.now() - pending.t0);
              pendingRef.current = null;
            }
          }
          dispatchTo(slot);
          return;
        }
        // Worker-side failure: log, free the slot, and don't hang the pass.
        console.error("fractal worker error:", msg.error);
        slot.busy = false;
        const pending = msg.generation !== undefined ? settleTile(msg.generation) : null;
        if (pending) {
          pending.remaining--;
          if (pending.remaining === 0) {
            pending.resolve(performance.now() - pending.t0);
            pendingRef.current = null;
          }
        }
        dispatchTo(slot);
      };
      slot.worker.onerror = (e) => console.error("fractal worker crashed:", e.message);
    }

    return () => {
      cancelled = true;
      for (const slot of slots) slot.worker.terminate();
      slotsRef.current = [];
      queueRef.current = [];
      pendingRef.current?.resolve(null);
      pendingRef.current = null;
      setIsReady(false);
    };
  }, [createWorker, poolSize, dispatchTo, settleTile]);

  const render = useCallback(
    (view: FractalView, { bands, paint }: RenderOpts): Promise<number | null> => {
      return new Promise((resolve) => {
        const gen = ++genRef.current;
        queueRef.current = [];
        pendingRef.current?.resolve(null); // supersede the in-flight pass
        const tiles = makeBands(view.totalSize, bands);
        pendingRef.current = {
          gen,
          remaining: tiles.length,
          t0: performance.now(),
          resolve,
          paint,
        };
        let taskId = 0;
        for (const t of tiles) {
          queueRef.current.push({ type: "renderTile", generation: gen, taskId: taskId++, view, ...t });
        }
        for (const slot of slotsRef.current) dispatchTo(slot);
      });
    },
    [dispatchTo]
  );

  return { isReady, render };
}
