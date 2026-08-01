interface FractalImageProps {
  imageUrl: string | null;
  isDragging: boolean;
  dragOffset: { x: number; y: number };
  isInteracting: boolean;
  size: number;
}

export function FractalImage({
  imageUrl,
  isDragging,
  dragOffset,
  isInteracting,
  size,
}: FractalImageProps) {
  return (
    <div
      style={{
        transform:
          isInteracting && isDragging
            ? `translate(${dragOffset.x}px, ${dragOffset.y}px)`
            : "none",
        transition: isDragging ? "none" : "transform 0.2s ease-out",
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt="Fractal"
          draggable="false"
          onDragStart={(e) => e.preventDefault()}
          className="max-w-none max-h-none"
          style={{
            cursor: isDragging ? "grabbing" : "grab",
            width: size,
            height: size,
            imageRendering: "initial",
          }}
        />
      ) : (
        <div
          className="bg-gray-800 flex items-center justify-center text-white"
          style={{
            width: size,
            height: size,
            cursor: isDragging ? "grabbing" : "grab",
          }}
        >
          <div className="animate-spin h-8 w-8 border-2 border-t-transparent border-purple-500 rounded-full"></div>
        </div>
      )}
    </div>
  );
}
