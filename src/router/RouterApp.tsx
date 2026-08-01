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
        <Route path="/" element={<WasmApp />} />
        <Route path="/js" element={<JsApp />} />
        <Route path="/gl" element={<GlApp />} />
        <Route path="/simd" element={<SimdApp />} />
      </Routes>
    </Router>
  );
}

export default RouterApp;
