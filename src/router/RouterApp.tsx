import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import WasmApp from "../WasmApp";
import JsApp from "../js/JsApp";
import { usePreventBrowserZoom } from "../hooks/usePreventBrowserZoom";

function RouterApp() {
  usePreventBrowserZoom();

  return (
    <Router>
      <Routes>
        <Route path="/" element={<WasmApp />} />
        <Route path="/js" element={<JsApp />} />
      </Routes>
    </Router>
  );
}

export default RouterApp;
