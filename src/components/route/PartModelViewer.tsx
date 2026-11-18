import { useEffect, useRef, useState } from 'react';
import type { GeometryDimension } from '@/api/hooks/useVolumeRound';
import { demoAsset } from '@/demo/config';
import { cadPreviewMatches } from '@/utils/cadModelApproval';

/** The host owns passport facts; the frame only renders the exact STEP mesh. */
export function PartModelViewer({ source, sha, selection, dimensions, allDimensions, preview = false, onFace, onReady, onClose }: {
  source: string; sha: string; selection?: GeometryDimension;
  onFace?: (face: number | null) => void; onReady?: (ready: boolean) => void;
  dimensions?: GeometryDimension[]; allDimensions?: boolean; preview?: boolean; onClose?: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const callbacks = useRef({ onFace, onReady, onClose });
  useEffect(() => { callbacks.current = { onFace, onReady, onClose }; }, [onFace, onReady, onClose]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (cadPreviewMatches(event.data, sha)) {
        setLoaded(true); setFailed(false); callbacks.current.onReady?.(true);
      } else if (event.data?.type === 'cad-preview-error') {
        setLoaded(false); setFailed(true); callbacks.current.onReady?.(false);
      } else if (event.data?.type === 'metall-face-selected' && event.data.step_sha256 === sha) {
        callbacks.current.onFace?.(Number.isSafeInteger(event.data.face_id) ? event.data.face_id : null);
      } else if (event.data?.type === 'metall-close-viewer' && event.data.step_sha256 === sha) {
        callbacks.current.onClose?.();
      }
    };
    window.addEventListener('message', receive);
    frame.current?.contentWindow?.postMessage({ type: 'cad-preview-status' }, window.location.origin);
    return () => window.removeEventListener('message', receive);
  }, [sha, source]);
  useEffect(() => {
    if (loaded && selection) frame.current?.contentWindow?.postMessage({ type: 'metall-select-dimension', selection, step_sha256: sha }, window.location.origin);
  }, [loaded, selection, sha]);
  useEffect(() => {
    if (loaded) frame.current?.contentWindow?.postMessage({ type: 'metall-dimensions-mode', dimensions: dimensions ?? [], all: !!allDimensions, step_sha256: sha }, window.location.origin);
  }, [loaded, dimensions, allDimensions, sha]);
  return <div className={preview ? 'part-model-viewer is-thumbnail' : 'part-model-viewer'}>
    <iframe ref={frame} title={preview ? 'Превью 3D-модели' : '3D-модель детали с размерами'} tabIndex={preview ? -1 : undefined} aria-hidden={preview || undefined} src={`${demoAsset('model-viewer.html')}?source=${encodeURIComponent(source)}${preview ? '&preview=1' : ''}`}
      onLoad={() => frame.current?.contentWindow?.postMessage({ type: 'cad-preview-status' }, window.location.origin)} />
    {!loaded && <p role={failed ? 'alert' : 'status'} className="part-model-loading">{failed ? 'Не удалось открыть 3D-модель.' : preview ? '3D…' : 'Загружаем 3D-модель…'}</p>}
  </div>;
}
