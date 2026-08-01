import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import WasmApp from "../WasmApp";
import JsApp from "../js/JsApp";
import GlApp from "../gl/GlApp";
import SimdApp from "../simd/SimdApp";
import { usePreventBrowserZoom } from "../hooks/usePreventBrowserZoom";

function RouterApp() {
  usePreventBrowserZoom();

  return (
    <Router>
      <Routes>
        {/* Rust is the landing engine: fastest of the CPU three, bit-identical
            to Go at every depth, and under 20 KB of wasm. Go keeps its own
            route, and /simd stays as an alias so links shared or benchmarked
            before the swap still resolve. */}
        <Route path="/" element={<SimdApp />} />
        <Route path="/simd" element={<SimdApp />} />
        <Route path="/go" element={<WasmApp />} />
        <Route path="/js" element={<JsApp />} />
        <Route path="/gl" element={<GlApp />} />
      </Routes>
    </Router>
  );
}

export default RouterApp;
