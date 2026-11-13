import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileText, Route } from 'lucide-react';
import { useProcessingJournal } from '@/api/hooks/useProcessingJournal';
import type { components } from '@/api/schema';
import { WorkspaceDrawing } from '@/components/drawing/WorkspaceDrawing';
import { runDocumentLink } from '@/utils/runDocumentLinks';
import './CompactRoundWorkspace.css';
import './run-documents.css';

type State = components['schemas']['CompactState'];

export function RunDocumentLayout({ runId, state, document, children }: {
  runId: string; state: State; document: 'estimate' | 'route'; children: ReactNode;
}) {
  useProcessingJournal(runId);
  const location = useLocation();
  const Icon = document === 'estimate' ? FileText : Route;
  return <div className={`run-document-page run-document-page--${document}`}>
    <header className="run-document-heading document-screen-only">
      <div><Link className="document-back" to={`/runs/${encodeURIComponent(runId)}`}>← Данные детали</Link>
        <h1><Icon size={24} aria-hidden="true" />{document === 'estimate' ? 'Смета изготовления детали' : 'Полный маршрут'}</h1>
        <p>{[state.reading?.part_name.text, state.reading?.designation.text].filter(Boolean).join(' · ') || 'Деталь'}</p>
      </div>
      <WorkspaceDrawing artifactId={state.image_artifact_id} pending={state.status === 'reading'} tabs={null} inlineTarget={null} tab={document === 'route' ? 'full-route' : 'estimate'} visit={location.key} />
    </header>
    <nav className="document-navigation document-screen-only" aria-label="Документы детали">
      <Link to={`/runs/${encodeURIComponent(runId)}`}>Данные детали</Link>
      <Link to={runDocumentLink(runId, 'route')} aria-current={document === 'route' ? 'page' : undefined}>Полный маршрут</Link>
      <Link to={runDocumentLink(runId, 'estimate')} aria-current={document === 'estimate' ? 'page' : undefined}>Смета</Link>
    </nav>
    {state.calculation_pending && <p role="status" className="document-notice document-screen-only">Выполняется пересчёт. Сохранённые результаты обновятся после завершения.</p>}
    {children}
  </div>;
}
