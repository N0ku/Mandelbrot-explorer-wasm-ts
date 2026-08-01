interface NavigationControlsProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
}

export function NavigationControls({
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
}: NavigationControlsProps) {
  return (
    <div className="flex space-x-2">
      <button
        onClick={onGoBack}
        disabled={!canGoBack}
        className={`px-3 py-1 rounded bg-gray-700 text-white ${
          !canGoBack ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-600"
        }`}
        title="Go back (B)"
      >
        ← Back
      </button>
      <button
        onClick={onGoForward}
        disabled={!canGoForward}
        className={`px-3 py-1 rounded bg-gray-700 text-white ${
          !canGoForward ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-600"
        }`}
        title="Go forward (N)"
      >
        Forward →
      </button>
    </div>
  );
}
