import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { FileImage, Grip, Maximize2, X } from 'lucide-react';
import { getArtifactUrl } from '@/api/client';
import { DrawingViewer } from '@/components/drawing/DrawingViewer';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

type Frame = { left: number; top: number; width: number; height: number };
type Gesture = 'move' | 'resize';
const inset = 12;
const minimumWidth = 152;
const minimumHeight = 112;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

function fitFrame(area: Frame, saved: Frame | null): Frame {
  const maxWidth = Math.max(1, area.width - inset * 2);
  const maxHeight = Math.max(1, area.height - inset * 2);
  const narrow = area.width < 640;
  const width = clamp(saved?.width ?? (narrow ? 176 : 224), Math.min(minimumWidth, maxWidth), maxWidth);
  const height = clamp(saved?.height ?? (narrow ? 132 : 160), Math.min(minimumHeight, maxHeight), maxHeight);
  const right = Math.max(inset, area.width - width - inset);
  const bottom = Math.max(inset, area.height - height - inset);
  return { width, height, left: clamp(saved?.left ?? right, inset, right), top: clamp(saved?.top ?? bottom, inset, bottom) };
}

export function WorkspaceDrawing({ artifactId, pending, tabs, inlineTarget, tab, visit }: {
  artifactId?: string | null;
  pending: boolean;
  tabs: HTMLElement | null;
  inlineTarget: HTMLElement | null;
  tab: string;
  visit: string;
}) {
  const [lightbox, setLightbox] = useState(false);
  const [manualWindow, setManualWindow] = useState(false);
  const [wideViewport, setWideViewport] = useState(() => window.matchMedia('(min-width: 901px)').matches);
  const [dismissedVisit, setDismissedVisit] = useState<string>();
  const floating = !!artifactId && (manualWindow || (wideViewport && tab !== 'description' && dismissedVisit !== visit));
  const [area, setArea] = useState<Frame | null>(null);
  const [saved, setSaved] = useState<Frame | null>(null);
  const [failedPreview, setFailedPreview] = useState<string>();
  const opener = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{ kind: Gesture; id: number; x: number; y: number; frame: Frame } | null>(null);
  const frame = area && fitFrame(area, saved);

  useLayoutEffect(() => {
    const media = window.matchMedia('(min-width: 901px)');
    const update = () => setWideViewport(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useLayoutEffect(() => {
    const viewport = tabs?.closest<HTMLElement>('.app-main');
    if (!floating || !tabs || !viewport) return;
    const updateArea = () => {
      const view = viewport.getBoundingClientRect();
      const top = Math.max(view.top, tabs.getBoundingClientRect().bottom);
      const next = { left: view.left, top, width: viewport.clientWidth, height: view.top + viewport.clientHeight - top };
      setArea(previous => previous?.left === next.left && previous.top === next.top
        && previous.width === next.width && previous.height === next.height ? previous : next);
    };
    updateArea();
    const observer = new ResizeObserver(updateArea);
    observer.observe(viewport);
    observer.observe(tabs);
    viewport.addEventListener('scroll', updateArea, { passive: true });
    return () => {
      observer.disconnect();
      viewport.removeEventListener('scroll', updateArea);
    };
  }, [floating, tabs]);

  function changeFrame(kind: Gesture, start: Frame, dx: number, dy: number) {
    if (!area) return;
    const next = kind === 'move' ? { ...start, left: start.left + dx, top: start.top + dy } : {
      ...start,
      width: clamp(start.width + dx, Math.min(minimumWidth, start.width), area.width - start.left - inset),
      height: clamp(start.height + dy, Math.min(minimumHeight, start.height), area.height - start.top - inset),
    };
    setSaved(fitFrame(area, next));
  }

  function startGesture(event: PointerEvent<HTMLElement>, kind: Gesture) {
    if (!frame || !event.isPrimary || event.button !== 0) return;
    gesture.current = { kind, id: event.pointerId, x: event.clientX, y: event.clientY, frame };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateGesture(event: PointerEvent<HTMLElement>) {
    const start = gesture.current;
    if (start?.id === event.pointerId) changeFrame(start.kind, start.frame, event.clientX - start.x, event.clientY - start.y);
  }

  function keyGesture(event: KeyboardEvent<HTMLElement>, kind: Gesture) {
    const keys: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const direction = keys[event.key];
    if (!frame || !direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 40 : 12;
    changeFrame(kind, frame, direction[0] * step, direction[1] * step);
  }

  function closeFloating() {
    setManualWindow(false);
    setDismissedVisit(visit);
    const viewport = tabs?.closest('.app-main');
    const button = opener.current;
    if (button && viewport && button.getBoundingClientRect().top >= viewport.getBoundingClientRect().top) button.focus({ preventScroll: true });
    else tabs?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
  }

  return <>
    {artifactId ? <button ref={opener} type="button" className="workspace-drawing-thumbnail"
      onClick={() => setLightbox(true)} aria-label="Открыть чертёж" aria-haspopup="dialog" title="Исходный чертёж">
      {failedPreview === artifactId ? <FileImage size={20} aria-hidden="true" />
        : <img src={getArtifactUrl(artifactId)} alt="" onError={() => setFailedPreview(artifactId)} />}
    </button> : <p className="self-center text-xs text-muted">{pending ? 'Загрузка чертежа…' : 'Чертёж недоступен'}</p>}
    {inlineTarget && artifactId && createPortal(
      <button type="button" className="workspace-inline-drawing" onClick={() => setLightbox(true)}
        aria-label="Открыть исходный лист в лайтбоксе" aria-haspopup="dialog">
        {failedPreview === artifactId ? <span>Открыть исходный лист</span>
          : <img src={getArtifactUrl(artifactId)} alt="" onError={() => setFailedPreview(artifactId)} />}
        <Maximize2 className="workspace-drawing-expand" size={17} aria-hidden="true" />
      </button>, inlineTarget,
    )}
    <Modal isOpen={lightbox && !!artifactId} onClose={() => setLightbox(false)} title="Исходный чертёж" size="full"
      footer={<Button type="button" variant="outline" onClick={() => { setManualWindow(true); setLightbox(false); }}>Свернуть в окно</Button>}>
      <div className="h-[min(66dvh,48rem)]"><DrawingViewer sourceArtifactId={artifactId} /></div>
    </Modal>
    {artifactId && floating && area && area.height > inset * 2 && frame && <section className="workspace-drawing-window" aria-label="Плавающее окно чертежа" hidden={lightbox}
      style={{ left: area.left + frame.left, top: area.top + frame.top, width: frame.width, height: frame.height }}
      onKeyDown={event => { if (event.key === 'Escape') closeFloating(); }}>
      <div className="workspace-drawing-bar">
        <div className="workspace-drawing-grip" role="group" tabIndex={0} aria-label="Переместить окно чертежа стрелками"
          onKeyDown={event => keyGesture(event, 'move')} onPointerDown={event => startGesture(event, 'move')}
          onPointerMove={updateGesture} onLostPointerCapture={() => { gesture.current = null; }}>
          <Grip size={16} aria-hidden="true" /> Чертёж
        </div>
        <Button type="button" variant="ghost" size="xs" aria-label="Закрыть окно чертежа" title="Закрыть окно чертежа" onClick={closeFloating}>
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
      <button type="button" className="workspace-drawing-preview" aria-label="Развернуть чертёж" aria-haspopup="dialog"
        onClick={() => setLightbox(true)}>
        {failedPreview === artifactId ? <span>Не удалось показать чертёж</span>
          : <img src={getArtifactUrl(artifactId)} alt="" draggable={false} onError={() => setFailedPreview(artifactId)} />}
        <Maximize2 className="workspace-drawing-expand" size={15} aria-hidden="true" />
      </button>
      <div className="workspace-drawing-resize" role="group" tabIndex={0} aria-label="Изменить ширину и высоту окна чертежа стрелками"
        onKeyDown={event => keyGesture(event, 'resize')} onPointerDown={event => startGesture(event, 'resize')}
        onPointerMove={updateGesture} onLostPointerCapture={() => { gesture.current = null; }} />
    </section>}
  </>;
}
