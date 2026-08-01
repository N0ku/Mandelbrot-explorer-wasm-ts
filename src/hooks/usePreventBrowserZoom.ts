import { useEffect } from "react";

/**
 * Empêche le zoom natif du navigateur sur toute l'interface :
 * - Ctrl/⌘ + molette (et pinch-to-zoom trackpad, qui arrive comme un wheel + ctrlKey)
 * - Ctrl/⌘ + (+, -, =, 0)
 * - Gestes de pinch Safari (gesturestart/change/end)
 * - Double-tap zoom / pinch tactile (via touchmove multi-doigts)
 *
 * Le zoom applicatif de l'explorateur de fractale (molette simple sur l'image,
 * touches +/-) n'est pas affecté : il n'utilise pas la touche Ctrl/⌘.
 */
export function usePreventBrowserZoom() {
  useEffect(() => {
    const preventWheelZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    const preventKeyZoom = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0"].includes(e.key)) {
        e.preventDefault();
      }
    };

    const preventGesture = (e: Event) => {
      e.preventDefault();
    };

    const preventPinchTouch = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };

    // passive: false est requis pour pouvoir appeler preventDefault
    window.addEventListener("wheel", preventWheelZoom, { passive: false });
    window.addEventListener("keydown", preventKeyZoom);
    window.addEventListener("gesturestart", preventGesture);
    window.addEventListener("gesturechange", preventGesture);
    window.addEventListener("gestureend", preventGesture);
    window.addEventListener("touchmove", preventPinchTouch, { passive: false });

    return () => {
      window.removeEventListener("wheel", preventWheelZoom);
      window.removeEventListener("keydown", preventKeyZoom);
      window.removeEventListener("gesturestart", preventGesture);
      window.removeEventListener("gesturechange", preventGesture);
      window.removeEventListener("gestureend", preventGesture);
      window.removeEventListener("touchmove", preventPinchTouch);
    };
  }, []);
}
