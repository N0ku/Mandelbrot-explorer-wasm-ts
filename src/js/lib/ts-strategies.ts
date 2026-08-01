interface Point {
  x: number;
  y: number;
}

interface ColorRGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface FractalParams {
  size: number;
  zoom: number;
  center: Point;
  maxIter: number;
  isJulia: boolean;
  juliaRe: number;
  juliaIm: number;
}

// Generate a color palette similar to the WASM version
function generateColorPalette(maxIterations: number): ColorRGBA[] {
  const colors: ColorRGBA[] = [];

  for (let i = 0; i < maxIterations; i++) {
    // HSB to RGB conversion for beautiful colors (same as Go version)
    const hue = (i / 256.0) % 1.0;
    const saturation = 1.0;
    const brightness = i / (i + 8.0);

    const color = hsbToRGB(hue, saturation, brightness);
    colors.push(color);
  }

  return colors;
}

// HSB to RGB conversion (matching the Go implementation)
function hsbToRGB(h: number, s: number, b: number): ColorRGBA {
  h = h % 1.0;
  if (h < 0) {
    h += 1.0;
  }

  const c = b * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = b - c;

  let r: number, g: number, bl: number;

  if (h < 1.0 / 6.0) {
    [r, g, bl] = [c, x, 0];
  } else if (h < 2.0 / 6.0) {
    [r, g, bl] = [x, c, 0];
  } else if (h < 3.0 / 6.0) {
    [r, g, bl] = [0, c, x];
  } else if (h < 4.0 / 6.0) {
    [r, g, bl] = [0, x, c];
  } else if (h < 5.0 / 6.0) {
    [r, g, bl] = [x, 0, c];
  } else {
    [r, g, bl] = [c, 0, x];
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((bl + m) * 255),
    a: 255,
  };
}

// Core fractal calculation function (same as Go implementation)
function calculateFractal(
  col: number,
  row: number,
  params: FractalParams
): number {
  const scale = 4.0 / (params.size * params.zoom);
  const centerX = params.size * 0.5;
  const centerY = params.size * 0.5;

  let cRe: number, cIm: number, x: number, y: number;

  if (params.isJulia) {
    cRe = params.juliaRe;
    cIm = params.juliaIm;
    x = (col - centerX) * scale + params.center.x;
    y = (row - centerY) * scale + params.center.y;
  } else {
    cRe = (col - centerX) * scale + params.center.x;
    cIm = (row - centerY) * scale + params.center.y;
    x = 0.0;
    y = 0.0;
  }

  let iterations = 0;
  let x2 = x * x;
  let y2 = y * y;

  while (x2 + y2 < 4 && iterations < params.maxIter) {
    y = 2 * x * y + cIm;
    x = x2 - y2 + cRe;
    x2 = x * x;
    y2 = y * y;
    iterations++;
  }

  return iterations;
}

// PIXEL Strategy: Single-threaded, sequential (SLOWEST like Go)
export function generatePixelFractal(params: FractalParams): Uint8ClampedArray {
  console.log("Using PIXEL strategy (single-threaded)");

  const data = new Uint8ClampedArray(params.size * params.size * 4);
  const colorPalette = generateColorPalette(params.maxIter);
  const blackColor = { r: 0, g: 0, b: 0, a: 255 };

  // Single-threaded: process entire image sequentially
  for (let row = 0; row < params.size; row++) {
    for (let col = 0; col < params.size; col++) {
      const iterations = calculateFractal(col, row, params);

      let pixelColor: ColorRGBA;
      if (iterations < params.maxIter) {
        pixelColor = colorPalette[iterations];
      } else {
        pixelColor = blackColor;
      }

      const idx = (row * params.size + col) * 4;
      data[idx] = pixelColor.r;
      data[idx + 1] = pixelColor.g;
      data[idx + 2] = pixelColor.b;
      data[idx + 3] = pixelColor.a;
    }
  }

  return data;
}

// ROW Strategy: Fine-grained parallelization (one worker per row like Go)
export async function generateRowFractal(
  params: FractalParams
): Promise<Uint8ClampedArray> {
  console.log("Using ROW strategy (one worker per row)");

  const data = new Uint8ClampedArray(params.size * params.size * 4);
  const colorPalette = generateColorPalette(params.maxIter);
  const blackColor = { r: 0, g: 0, b: 0, a: 255 };

  // Create promises for each row (like Go's goroutines)
  const rowPromises = [];

  for (let row = 0; row < params.size; row++) {
    const rowPromise = new Promise<void>((resolve) => {
      // Process entire row
      setTimeout(() => {
        for (let col = 0; col < params.size; col++) {
          const iterations = calculateFractal(col, row, params);

          let pixelColor: ColorRGBA;
          if (iterations < params.maxIter) {
            pixelColor = colorPalette[iterations];
          } else {
            pixelColor = blackColor;
          }

          const idx = (row * params.size + col) * 4;
          data[idx] = pixelColor.r;
          data[idx + 1] = pixelColor.g;
          data[idx + 2] = pixelColor.b;
          data[idx + 3] = pixelColor.a;
        }
        resolve();
      }, 0);
    });

    rowPromises.push(rowPromise);
  }

  await Promise.all(rowPromises);
  return data;
}

// COLUMN Strategy: Fine-grained parallelization (one worker per column like Go)
export async function generateColumnFractal(
  params: FractalParams
): Promise<Uint8ClampedArray> {
  console.log("Using COLUMN strategy (one worker per column)");

  const data = new Uint8ClampedArray(params.size * params.size * 4);
  const colorPalette = generateColorPalette(params.maxIter);
  const blackColor = { r: 0, g: 0, b: 0, a: 255 };

  // Create promises for each column (like Go's goroutines)
  const columnPromises = [];

  for (let col = 0; col < params.size; col++) {
    const columnPromise = new Promise<void>((resolve) => {
      // Process entire column
      setTimeout(() => {
        for (let row = 0; row < params.size; row++) {
          const iterations = calculateFractal(col, row, params);

          let pixelColor: ColorRGBA;
          if (iterations < params.maxIter) {
            pixelColor = colorPalette[iterations];
          } else {
            pixelColor = blackColor;
          }

          const idx = (row * params.size + col) * 4;
          data[idx] = pixelColor.r;
          data[idx + 1] = pixelColor.g;
          data[idx + 2] = pixelColor.b;
          data[idx + 3] = pixelColor.a;
        }
        resolve();
      }, 0);
    });

    columnPromises.push(columnPromise);
  }

  await Promise.all(columnPromises);
  return data;
}

// GRID Strategy: Tile-based with worker pool (like Go's grid approach)
export async function generateGridFractal(
  params: FractalParams
): Promise<Uint8ClampedArray> {
  console.log("Using GRID strategy (tile-based with worker pool)");

  const data = new Uint8ClampedArray(params.size * params.size * 4);
  const colorPalette = generateColorPalette(params.maxIter);
  const blackColor = { r: 0, g: 0, b: 0, a: 255 };

  // Dynamic tile sizing like Go: size / (CPUs + 1)
  const numCPUs = navigator.hardwareConcurrency || 4;
  let tileSize = Math.floor(params.size / (numCPUs + 1));
  if (tileSize < 32) tileSize = 32;
  if (tileSize > 128) tileSize = 128;

  const numTilesX = Math.ceil(params.size / tileSize);
  const numTilesY = Math.ceil(params.size / tileSize);

  // Create tiles sorted by distance from center (like Go)
  interface TileJob {
    tileX: number;
    tileY: number;
    startX: number;
    startY: number;
    distance: number;
  }

  const tileJobs: TileJob[] = [];
  const centerTileX = numTilesX / 2.0;
  const centerTileY = numTilesY / 2.0;

  for (let tileY = 0; tileY < numTilesY; tileY++) {
    for (let tileX = 0; tileX < numTilesX; tileX++) {
      const startX = tileX * tileSize;
      const startY = tileY * tileSize;

      // Calculate distance from center
      const dx = tileX - centerTileX;
      const dy = tileY - centerTileY;
      const distance = dx * dx + dy * dy;

      tileJobs.push({
        tileX,
        tileY,
        startX,
        startY,
        distance,
      });
    }
  }

  // Sort by distance from center (center-out like Go)
  tileJobs.sort((a, b) => a.distance - b.distance);

  // Process tiles with limited concurrency (like Go's worker pool)
  const maxConcurrentTiles = numCPUs;

  for (let i = 0; i < tileJobs.length; i += maxConcurrentTiles) {
    const batch = tileJobs.slice(i, i + maxConcurrentTiles);

    const batchPromises = batch.map((job) => {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Calculate actual tile bounds
          const endX = Math.min(job.startX + tileSize, params.size);
          const endY = Math.min(job.startY + tileSize, params.size);

          // Process each pixel in the tile
          for (let row = job.startY; row < endY; row++) {
            for (let col = job.startX; col < endX; col++) {
              const iterations = calculateFractal(col, row, params);

              let pixelColor: ColorRGBA;
              if (iterations < params.maxIter) {
                pixelColor = colorPalette[iterations];
              } else {
                pixelColor = blackColor;
              }

              const idx = (row * params.size + col) * 4;
              data[idx] = pixelColor.r;
              data[idx + 1] = pixelColor.g;
              data[idx + 2] = pixelColor.b;
              data[idx + 3] = pixelColor.a;
            }
          }
          resolve();
        }, 0);
      });
    });

    await Promise.all(batchPromises);
  }

  return data;
}

// AUTO Strategy: Choose best strategy based on size (like Go)
export async function generateAutoFractal(
  params: FractalParams
): Promise<Uint8ClampedArray> {
  const numCPUs = navigator.hardwareConcurrency || 4;

  if (params.size <= 200) {
    return generatePixelFractal(params); // Single-threaded for very small images
  } else if (numCPUs >= 4 && params.size >= 500) {
    return generateGridFractal(params); // Grid is fastest for large images with many CPUs
  } else if (params.size >= 300) {
    return generateRowFractal(params); // Row for medium to large images
  } else {
    return generateColumnFractal(params); // Column for smaller images
  }
}

// Main generation function that dispatches to the appropriate strategy
export async function generateFractalTS(
  fractalType: "pixel" | "row" | "column" | "grid" | "auto",
  params: FractalParams
): Promise<Uint8ClampedArray> {
  let result: Uint8ClampedArray;

  switch (fractalType) {
    case "pixel":
      result = generatePixelFractal(params);
      break;
    case "row":
      result = await generateRowFractal(params);
      break;
    case "column":
      result = await generateColumnFractal(params);
      break;
    case "grid":
      result = await generateGridFractal(params);
      break;
    case "auto":
      result = await generateAutoFractal(params);
      break;
    default:
      result = generatePixelFractal(params);
  }

  return result;
}
