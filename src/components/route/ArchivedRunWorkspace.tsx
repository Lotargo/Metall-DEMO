import { InfoBlock } from '@/components/ui/InfoBlock';
import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { getArtifactUrl } from '@/api/client';
import type { components } from '@/api/schema';
import { WorkspaceDrawing } from '@/components/drawing/WorkspaceDrawing';
import { Tabs } from '@/components/ui/Tabs';
import { formatDateTime, formatStatusLabel } from '@/utils/formatters';
import { WorkspacePanel, workspaceTabs } from './WorkspaceSections';
import './CompactRoundWorkspace.css';

type Archive = components['schemas']['ArchivedRunWorkspace'];
type Card = components['schemas']['ArchivedCard'];

const emptySections: Record<string, string> = {
  passport: 'Технический паспорт для этого запуска не сохранился.',
  stock: 'Сохранённых результатов подбора заготовки нет.',
  material: 'Сохранённых данных о материале нет.',
  questions: 'Сохранённых уточнений нет.',
  preliminary: 'Предварительный маршрут в этом запуске не сохранился.',
  'full-route': 'Сохранённых результатов детализации и расчёта времени нет.',
  estimate: 'Смета для этого запуска не сохранилась.',
};

function SavedCard({ card }: { card: Card }) {
  const notes = card.notes ?? [];
  const tables = card.tables ?? [];
  const noteList = <ul className="list-disc space-y-2 pl-5 text-sm">
    {notes.map(note => <li key={note} className="whitespace-pre-wrap break-words">{note}</li>)}
  </ul>;
  return <section className="compact-workspace-card space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h3 className="font-semibold">{card.title}</h3>
      {card.saved_at && <time dateTime={card.saved_at} className="text-xs text-muted">{formatDateTime(card.saved_at)}</time>}
    </div>
    {tables.map((table, index) => <div key={index} className="overflow-x-auto">
      <table className={table.headers.length >= 4 ? 'w-full min-w-[34rem]' : 'w-full'}>
        <caption className="sr-only">{card.title}</caption>
        <thead><tr>{table.headers.map((header, column) => <th key={column} scope="col"
          className={column === 0 && header === 'Параметр' ? 'w-[43%] sm:w-1/3' : undefined}>{header}</th>)}</tr></thead>
        <tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>
          {row.map((cell, column) => column === 0
            ? <th key={column} scope="row" className="whitespace-pre-wrap">{cell}</th>
            : <td key={column} className="whitespace-pre-wrap">{cell}</td>)}
        </tr>)}</tbody>
      </table>
    </div>)}
    {notes.length > 4 ? <InfoBlock title={<>Пояснения и ограничения · {notes.length}</>}>

      <div className="mt-3">{noteList}</div>
    </InfoBlock> : notes.length > 0 && noteList}
    {!tables.length && !notes.length && card.artifact_id && <a className="text-sm text-accent underline"
      href={getArtifactUrl(card.artifact_id)} target="_blank" rel="noreferrer">Открыть сохранённый файл</a>}
  </section>;
}

const drawingSymbols = new Map([
  ['varnothing', 'Ø'], ['emptyset', 'Ø'], ['pm', '±'],
  ['times', '×'], ['cdot', '·'], ['circ', '°'],
]);

function savedText(paragraph: string) {
  return paragraph
    .replace(/^#{1,6}[\t ]+/gm, '')
    .replace(/(^|[\s(])\*\*([^*\n]+)\*\*(?=$|[\s.,:;)])/gm, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\$([^$\n]+)\$/g, (_match, formula: string) => formula
      .replace(/\\([a-z]+)/g, (command, name: string) => drawingSymbols.get(name) ?? command)
      .replace(/_\{([^{}]+)\}/g, '($1)')
      .replace(/\^\{?([*°])\}?/g, '$1'));
}

function SavedDescription({ description }: { description: string }) {
  const paragraphs = description.trim().split(/\n\s*\n/);
  return <div className="space-y-3">
    {paragraphs.map((paragraph, index) => <p className="whitespace-pre-wrap break-words" key={index}>
      {savedText(paragraph)}
    </p>)}
  </div>;
}

export function ArchivedRunWorkspace({ value }: { value: Archive }) {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [tabsElement, setTabsElement] = useState<HTMLDivElement | null>(null);
  const [inlineDrawing, setInlineDrawing] = useState<HTMLDivElement | null>(null);
  const tab = workspaceTabs.find(item => item.id === params.get('tab'))?.id ?? 'description';
  const title = [value.part_name, value.designation].filter(Boolean).join(' · ') || value.document_id || 'Архивный чертёж';
  const sections = value.sections ?? {};
  const original = value.original_id ? getArtifactUrl(value.original_id) : null;

  function setTab(nextTab: string) {
    const area = tabsElement?.parentElement;
    const viewport = area?.closest<HTMLElement>('.app-main');
    if (nextTab !== tab && area && viewport) {
      const offset = area.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
      if (offset < 0) viewport.scrollTop += offset;
    }
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.set('tab', nextTab);
      return next;
    }, { replace: true });
  }

  return <div className="compact-round-workspace flex min-w-0 flex-col bg-canvas text-ink">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-surface px-4 py-4 sm:px-6">
      <div className="min-w-0 flex-[1_1_18rem]">
        <Link to={/^\d+$/.test(value.project_id) ? '/projects/' + value.project_id : '/projects'}
          className="text-sm text-accent">← К проекту</Link>
        <h1 className="mt-1 break-words text-lg font-semibold">{title}</h1>
        <p className="mt-1 flex flex-wrap gap-x-2 text-sm text-muted">
          <span>Архивный запуск</span><span>· {formatStatusLabel(value.status)}</span>
          <span title={value.id}>· {value.id.slice(0, 8)}</span>
          <time dateTime={value.created_at}>· {formatDateTime(value.created_at)}</time>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {value.preview_id && <WorkspaceDrawing artifactId={value.preview_id} pending={false} tabs={tabsElement}
          inlineTarget={inlineDrawing} tab={tab} visit={location.key} />}
        <a className="secondary-action" href={'/api/v1/runs/' + encodeURIComponent(value.id) + '/review-pack'}>
          Скачать архив запуска
        </a>
      </div>
    </header>

    <section className="compact-work-area min-w-0 flex-1 px-4 pb-6 sm:px-6">
      <div ref={setTabsElement} className="compact-workspace-nav">
        <Tabs id="compact-round-tabs" aria-label="Рабочие данные" layout="wrap" items={[...workspaceTabs]} activeId={tab} onChange={setTab} />
      </div>
      {(value.notices ?? []).map(note => <p key={note} role="status" className="mt-3 rounded-md bg-warning-soft p-3 text-sm">{note}</p>)}
      {workspaceTabs.map(item => <WorkspacePanel key={item.id} id={item.id} active={tab}>
        {item.id === 'description' ? <>
          <h2 className="text-lg font-semibold">{item.label}</h2>
          <div className={value.preview_id || original ? 'workspace-description-layout' : undefined}>
            {(value.preview_id || original) && <section className="workspace-description-drawing">
              <h3 className="mb-2 font-semibold">Исходный чертёж</h3>
              {value.preview_id && <div ref={setInlineDrawing} />}
              {original && <a href={original} className="mt-2 inline-block text-sm text-accent underline"
                target="_blank" rel="noreferrer">Открыть исходный файл</a>}
            </section>}
            <div className="compact-engineering-description min-w-0">
              <h3 className="mb-2 font-semibold">Конструкция детали</h3>
              {value.description ? <SavedDescription description={value.description} />
                : <p className="text-sm text-muted">Сохранённого описания детали нет.</p>}
            </div>
          </div>
        </> : <>
          <h2 className="text-lg font-semibold">{item.label}</h2>
          {tab === item.id && ((sections[item.id] ?? []).length > 0
            ? <div className={item.id === 'material' ? 'compact-material-layout' : 'space-y-4'}>
              {sections[item.id]?.map((card, index) => <SavedCard key={index} card={card} />)}
            </div>
            : <p className="text-sm text-muted">{emptySections[item.id]}</p>)}
        </>}
      </WorkspacePanel>)}
    </section>
  </div>;
}
