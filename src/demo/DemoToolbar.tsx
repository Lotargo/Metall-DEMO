import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, FileCheck, RotateCcw, X } from 'lucide-react';
import { DEMO_RUN_PATH } from './config';
import './demo.css';
export function DemoToolbar() {
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    function show(event: Event) { setNotice((event as CustomEvent<string>).detail); if (!dialog.current?.open) dialog.current?.showModal(); closeButton.current?.focus(); }
    window.addEventListener('metall-demo:notice', show);
    return () => window.removeEventListener('metall-demo:notice', show);
  }, []);
  function reset() {
    for (const storage of [localStorage, sessionStorage]) Object.keys(storage).filter(key => key.startsWith('metall-demo')).forEach(key => storage.removeItem(key));
    window.location.hash = '#/projects'; window.location.reload();
  }
  return <>
    <div className="demo-toolbar document-screen-only" aria-label="Управление демонстрацией">
      <span className="demo-tag">Демо</span><span className="demo-caption">Сохранённый пример Metall</span>
      <nav aria-label="Демонстрационные примеры"><Link to={DEMO_RUN_PATH}><FileCheck size={15} aria-hidden="true" />Открыть пример</Link><Link to="/models"><Box size={15} aria-hidden="true" />3D-модели</Link></nav>
      <button type="button" onClick={reset}><RotateCcw size={14} aria-hidden="true" />Сбросить демо</button>
    </div>
    <dialog ref={dialog} className="demo-dialog" aria-labelledby="demo-notice-title"><header><h2 id="demo-notice-title">Демонстрационный режим</h2><button ref={closeButton} type="button" aria-label="Закрыть" onClick={() => dialog.current?.close()}><X size={20} /></button></header>
      <p>{notice}</p><button className="primary-action" type="button" onClick={() => dialog.current?.close()}>Понятно</button>
    </dialog>
  </>;
}
