import { generateFractalTS } from "../lib/ts-strategies";

self.addEventListener("error", (e) => {
  console.error("Worker global error:", e.message, e.filename, e.lineno);
});

self.onmessage = async (e) => {
  try {
    const {
      width,
      zoom,
      center,
      maxIter,
      fractalType,
      isJulia,
      juliaRe,
      juliaIm,
    } = e.data;

    console.log(
      `TypeScript Worker: Generating fractal using ${fractalType} strategy`
    );

    // Use the new strategies system
    const result = await generateFractalTS(fractalType, {
      size: width, // Use width as size (assuming square images)
      zoom,
      center,
      maxIter,
      isJulia,
      juliaRe,
      juliaIm,
    });

    // Send result back with transferable object
    self.postMessage({ result }, { transfer: [result.buffer] });
  } catch (error) {
    console.error("Worker calculation error:", error);
    self.postMessage({ error: String(error) });
  }
};
