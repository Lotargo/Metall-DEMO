import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Info,
  RotateCw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getArtifactUrl } from '@/api/client';

export function DrawingViewer({ sourceArtifactId }: { sourceArtifactId?: string | null }) {
  const [scale, setScale] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [imageFailed, setImageFailed] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const [rotation, setRotation] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setImageFailed(false);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setRotation(0);
  }, [sourceArtifactId]);
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => setViewport({
      width: entry.contentRect.width, height: entry.contentRect.height,
    }));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  const sideways = rotation % 180 !== 0;
  const fit = Math.max(0.001, Math.min((viewport.width - 32) / (sideways ? imageSize.height : imageSize.width), (viewport.height - 32) / (sideways ? imageSize.width : imageSize.height)));
  // Reset zoom & pan
  const handleResetZoom = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const changeZoom = useCallback((factor: number) => {
    const next = Math.min(Math.max(scale * factor, 0.3), 8);
    const ratio = next / scale;
    setScale(next);
    setOffset(value => ({ x: value.x * ratio, y: value.y * ratio }));
  }, [scale]);
  const handleZoomIn = () => changeZoom(1.25);
  const handleZoomOut = () => changeZoom(1 / 1.25);

  useEffect(() => {
    const container = containerRef.current;
    const zoomByWheel = (event: WheelEvent) => {
      event.preventDefault();
      changeZoom(event.deltaY < 0 ? 1.15 : 0.85);
    };
    container?.addEventListener('wheel', zoomByWheel, { passive: false });
    return () => container?.removeEventListener('wheel', zoomByWheel);
  }, [changeZoom]);

  // Drag pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // only left button
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      className="relative flex flex-col h-full bg-canvas border border-line rounded-lg overflow-hidden select-none"
    >
      {/* Top Controls Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 px-3 py-2 bg-surface backdrop-blur-xs border-b border-line z-10 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono text-muted mr-1">
            {Math.round(scale * 100)}%
          </span>
          <Button
            size="xs"
            variant="secondary"
            onClick={handleZoomOut}
            aria-label="Уменьшить масштаб" title="Уменьшить (Колесо мыши назад)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="xs"
            variant="secondary"
            onClick={handleZoomIn}
            aria-label="Увеличить масштаб" title="Увеличить (Колесо мыши вперёд)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="xs"
            variant="secondary"
            onClick={handleResetZoom}
            aria-label="Сбросить масштаб" title="Сбросить масштаб"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </Button>
          <Button size="xs" variant="secondary" onClick={() => setRotation(value => (value + 90) % 360)} aria-label="Повернуть чертёж на 90 градусов" title="Повернуть чертёж (R)"><RotateCw className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      {/* Main Viewport */}
      <div
        ref={containerRef}
        tabIndex={0}
        role="region"
        aria-label="Просмотр чертежа. Стрелки — перемещение, плюс и минус — масштаб, R — поворот"
        onKeyDown={event => {
          const shifts: Record<string, [number, number]> = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] };
          if (shifts[event.key]) { event.preventDefault(); const [x, y] = shifts[event.key]; setOffset(value => ({ x: value.x + x, y: value.y + y })); }
          else if (event.key === '+' || event.key === '=') { event.preventDefault(); handleZoomIn(); }
          else if (event.key === '-') { event.preventDefault(); handleZoomOut(); }
          else if (event.key.toLowerCase() === 'r') { event.preventDefault(); setRotation(value => (value + 90) % 360); }
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="relative min-h-0 flex-1 overflow-hidden cursor-grab active:cursor-grabbing flex items-center justify-center bg-radial from-surface to-canvas"
      >
        {sourceArtifactId && !imageFailed ? (
          <div
            className="relative transition-transform duration-75 origin-center"
            style={{
              width: Math.max(1, imageSize.width * fit),
              height: Math.max(1, imageSize.height * fit),
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)`,
            }}
          >
            {/* Image render */}
            <img
              src={getArtifactUrl(sourceArtifactId)}
              alt="Чертёж детали"
              className="w-full h-full shadow-lg pointer-events-none block"
              onLoad={(event) => {
                setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
              }}
              onError={() => setImageFailed(true)}
              draggable={false}
            />

          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-muted p-8 text-center">
            <Info className="w-10 h-10 mb-3 text-muted" />
            <p className="text-sm font-medium text-muted">{imageFailed ? 'Не удалось загрузить чертёж' : 'Чертёж не загружен'}</p>
            <p className="text-xs text-muted mt-1 max-w-xs">
              Запустите распознавание или выберите существующий запуск для отображения чертежа.
            </p>
            {sourceArtifactId && <a className="mt-3 underline" href={getArtifactUrl(sourceArtifactId)} target="_blank" rel="noreferrer">Открыть исходное изображение</a>}
          </div>
        )}

      </div>
    </div>
  );
}
