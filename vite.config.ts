import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

// Cross-origin isolation, mirrored from public/_headers so `crossOriginIsolated`
// is true in dev and preview too. Without this the headers would only exist in
// production and a SharedArrayBuffer experiment would work on the deployed site
// while failing on localhost — the worst way round to find out.
const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { headers: isolation },
  preview: { headers: isolation },
});
