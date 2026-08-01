import { useCallback, useState, useRef, useEffect } from "react";

interface UseFractalImageProps {
  size: number;
  zoom: number;
  panX: number;
  panY: number;
  mode: "ts" | "go";
  fractalType: "pixel" | "row" | "grid" | "column" | "auto";
  isJulia?: boolean;
  juliaRe?: number;
  juliaIm?: number;
  onStatsStart?: (iterations: number, taskCount: number) => void;
  onStatsEnd?: (fractalType: string) => void;
}

export function useFractalImage({
  size,
  zoom,
  panX,
  panY,
  mode,
  fractalType,
  isJulia = false,
  juliaRe = 0.355,
  juliaIm = 0.355,
  onStatsStart,
  onStatsEnd,
}: UseFractalImageProps) {
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const iterationsParam = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const calculateIterations = useCallback((currentZoom: number) => {
    const baseIterations = 1000;
    const calculatedIterations = Math.floor(
      baseIterations * Math.pow(currentZoom, 0.3)
    );

    iterationsParam.current = calculatedIterations;
    return Math.min(2000, Math.max(100, calculatedIterations));
  }, []);

  const generateImage = useCallback(async () => {
    // Cancel any ongoing generation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setLoading(true);

    try {
      const currentIterations = calculateIterations(zoom);

      console.log(
        `Generating fractal at position (${panX}, ${panY}) with zoom ${zoom}`
      );

      onStatsStart?.(currentIterations, 1);

      // Create a temporary canvas for image generation
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Could not get canvas context");
      }

      // Generate fractal using worker
      const worker = new Worker(
        new URL("../workers/mandelbrotWorker.ts", import.meta.url),
        { type: "module" }
      );

      const workerPromise = new Promise<Uint8ClampedArray>(
        (resolve, reject) => {
          worker.onmessage = (e) => {
            if (signal.aborted) {
              worker.terminate();
              reject(new Error("Aborted"));
              return;
            }

            if (e.data.error) {
              worker.terminate();
              reject(new Error(e.data.error));
              return;
            }

            try {
              const { result } = e.data;
              worker.terminate();
              resolve(result);
            } catch (err) {
              worker.terminate();
              reject(err);
            }
          };

          worker.onerror = (e) => {
            worker.terminate();
            reject(new Error(`Worker error: ${e.message}`));
          };

          // Send parameters for fractal generation with strategy
          worker.postMessage({
            width: size,
            height: size,
            zoom,
            center: { x: panX, y: panY },
            maxIter: currentIterations,
            fractalType,
            isJulia,
            juliaRe,
            juliaIm,
          });
        }
      );

      const result = await workerPromise;

      if (signal.aborted) {
        return;
      }

      // Draw the result to canvas
      const imageData = ctx.createImageData(size, size);
      imageData.data.set(result);
      ctx.putImageData(imageData, 0, 0);

      // Convert canvas to data URL
      const dataUrl = canvas.toDataURL("image/png");
      setImageUrl(dataUrl);

      onStatsEnd?.(fractalType);
    } catch (error) {
      if (!signal.aborted) {
        console.error("Error generating fractal:", error);
      }
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, [
    size,
    zoom,
    panX,
    panY,
    mode,
    fractalType,
    isJulia,
    juliaRe,
    juliaIm,
    calculateIterations,
    onStatsStart,
    onStatsEnd,
  ]);

  // Auto-generate image when parameters change with debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      generateImage();
    }, 150); // 150ms debounce

    return () => {
      clearTimeout(timeoutId);
    };
  }, [generateImage]);

  const downloadImage = useCallback(() => {
    if (imageUrl) {
      const link = document.createElement("a");
      link.download = `fractal-${Date.now()}.png`;
      link.href = imageUrl;
      link.click();
    }
  }, [imageUrl]);

  return {
    loading,
    imageUrl,
    generateImage,
    downloadImage,
    iterations: iterationsParam,
  };
}
