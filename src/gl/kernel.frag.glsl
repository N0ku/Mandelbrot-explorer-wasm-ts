#version 300 es
// WebGL2 engine — the escape-time kernel as a fragment shader.
//
// Same algorithm as go/fractal/kernel.go and ts-strategies.ts, with one
// unavoidable difference: GLSL ES 3.0 has no `double`. `highp float` is 32-bit
// (~7 significant digits), so this engine hits the precision wall around
// zoom 1e4-1e5 where the CPU engines hold to ~1e13.
//
// Every pixel is one shader invocation and the GPU runs them in lockstep —
// SIMT, the hardware cousin of SIMD. That is what makes this the fastest
// engine here, and what makes it the shallowest.
precision highp float;
precision highp int;

// The view, in the same terms as FractalView: the frame spans 4/zoom units of
// the complex plane, so one pixel is uScale = 4/(totalSize*zoom) units.
uniform vec2  uCenter;   // panX, panY
uniform float uScale;
uniform float uHalf;     // totalSize * 0.5
uniform vec2  uOrigin;   // x0, y0 — the tile's origin in global pixel coords
uniform int   uMaxIter;
uniform bool  uIsJulia;
uniform vec2  uJulia;

out vec4 fragColor;

// Go's palette, ported: hue = i/256 (wrapping), saturation = 1,
// brightness = i/(i+8). Go builds it once into a lookup table; on the GPU it
// is cheaper to recompute per pixel than to upload and sample a texture.
// With saturation == 1 the HSB conversion collapses: c == b and m == 0.
vec3 paletteColor(float i) {
    float h = fract(i / 256.0);
    float b = i / (i + 8.0);
    float x = b * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));

    int hi = int(h * 6.0);
    if (hi == 0) return vec3(b, x, 0.0);
    if (hi == 1) return vec3(x, b, 0.0);
    if (hi == 2) return vec3(0.0, b, x);
    if (hi == 3) return vec3(0.0, x, b);
    if (hi == 4) return vec3(x, 0.0, b);
    return vec3(b, 0.0, x);
}

void main() {
    // gl_FragCoord.y counts from the BOTTOM of the framebuffer, while
    // ImageData counts rows from the top — and readPixels also returns rows
    // bottom-up. Mapping framebuffer-bottom to tile-top makes the two
    // conventions cancel, so this line IS the vertical flip even though it
    // looks like none.
    float col = uOrigin.x + gl_FragCoord.x - 0.5;
    float row = uOrigin.y + gl_FragCoord.y - 0.5;

    float re = (col - uHalf) * uScale + uCenter.x;
    float im = (row - uHalf) * uScale + uCenter.y;

    float cRe, cIm, x, y;
    if (uIsJulia) {
        cRe = uJulia.x; cIm = uJulia.y;   // c is fixed…
        x = re;         y = im;           // …z starts at the pixel
    } else {
        cRe = re;       cIm = im;         // c comes from the pixel…
        x = 0.0;        y = 0.0;          // …z starts at the origin
    }

    int iterations = 0;
    float x2 = x * x;
    float y2 = y * y;

    // GLSL wants a compile-time loop bound; the break carries the real
    // condition, so the constant costs nothing at runtime. 4096 sits above the
    // 2000 the adaptive formula ever asks for.
    for (int i = 0; i < 4096; i++) {
        if (x2 + y2 >= 4.0 || iterations >= uMaxIter) break;
        y  = 2.0 * x * y + cIm;
        x  = x2 - y2 + cRe;
        x2 = x * x;
        y2 = y * y;
        iterations++;
    }

    vec3 rgb = iterations < uMaxIter ? paletteColor(float(iterations)) : vec3(0.0);

    // Go truncates when it packs the palette (uint8(v*255)); the GPU would
    // round on its way to an RGBA8 target. Truncating here too leaves float32
    // vs float64 as the only difference between the engines.
    fragColor = vec4(floor(rgb * 255.0) / 255.0, 1.0);
}
