interface InfoBarProps {
  zoom: number;
  size: number;
  panX: number;
  panY: number;
  isInteracting: boolean;
}

export function InfoBar({
  zoom,
  size,
  panX,
  panY,
  isInteracting,
}: InfoBarProps) {
  return (
    <>
      <div className="absolute bottom-4 right-4 text-white text-sm bg-black bg-opacity-60 px-2 py-1 rounded">
        Zoom: {zoom.toFixed(2)}x | Size: {size}×{size} | Position: (
        {panX.toFixed(4)}, {panY.toFixed(4)})
      </div>

      {isInteracting && (
        <div className="absolute top-2 left-2 bg-yellow-500 text-black px-2 py-1 rounded text-xs">
          Preview Mode
        </div>
      )}
    </>
  );
}
