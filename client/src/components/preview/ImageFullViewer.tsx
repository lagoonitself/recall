import { useEffect, useRef, useState, useCallback } from 'react';

export interface ImageFullViewerProps {
  url: string;
  fileName: string;
  scale: number;
  onScaleChange: (scale: number) => void;
  isFit: boolean;
  onFitChange: (isFit: boolean) => void;
  onError: () => void;
}

export function ImageFullViewer({
  url,
  fileName,
  scale,
  onScaleChange,
  isFit,
  onFitChange,
  onError,
}: ImageFullViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [loading, setLoading] = useState(true);

  // Reset pan when fit is activated
  useEffect(() => {
    if (isFit) {
      setPan({ x: 0, y: 0 });
    }
  }, [isFit]);

  // Double click toggles fit vs 100%
  const handleDoubleClick = useCallback(() => {
    if (isFit) {
      onFitChange(false);
      onScaleChange(1.0);
      setPan({ x: 0, y: 0 });
    } else {
      onFitChange(true);
      onScaleChange(1.0);
      setPan({ x: 0, y: 0 });
    }
  }, [isFit, onFitChange, onScaleChange]);

  // Mouse drag to pan when zoomed
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isFit && scale <= 1.0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
    e.preventDefault();
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan({
        x: panStartRef.current.x + dx,
        y: panStartRef.current.y + dy,
      });
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Ctrl / Meta + wheel to zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        onFitChange(false);
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        onScaleChange(Math.max(0.5, Math.min(3.0, Math.round((scale + delta) * 100) / 100)));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [scale, onScaleChange, onFitChange]);

  return (
    <div
      ref={containerRef}
      className={`image-full-viewer ${isDragging ? 'dragging' : ''} ${!isFit && scale > 1 ? 'pannable' : ''}`}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      title={isFit ? 'Double-click to view at 100%' : 'Double-click to fit to screen'}
    >
      {loading && <div className="image-loading-skeleton skeleton" />}
      <img
        ref={imgRef}
        src={url}
        alt={fileName}
        className={`image-full-element ${isFit ? 'fit' : 'custom-scale'}`}
        style={
          isFit
            ? undefined
            : {
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              }
        }
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          onError();
        }}
        draggable={false}
      />
    </div>
  );
}
