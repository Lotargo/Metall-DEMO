import { InfoBlock } from '@/components/ui/InfoBlock';
import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatDateTime } from '@/utils/formatters';
import { useCutNorms, usePublishCutNorms, type CutNormRow, type CutNormsView } from '@/api/hooks/useCutNorms';
import { publicSourceText } from '@/utils/publicSource';

type Draft = { over: string; to: string; face: string; kerf: string };
const sourceLabels: Record<string, string> = { empty: 'пустая таблица', csv_file: 'загрузка таблицы', ui: 'правка в интерфейсе' };
const text = (value?: string | null) => value == null ? '' : value.replace('.', ',');
const number = (value: string) => value.trim().replace(',', '.');
const toDraft = (row: CutNormRow): Draft => ({ over: text(row.diameter_over_mm), to: text(row.diameter_to_mm), face: text(row.face_allowance_mm), kerf: text(row.kerf_mm) });

/** Shop norms are entered by people; an empty table means UNKNOWN, never a default. */
export function CutNormsEditor() {
  const query = useCutNorms();
  if (query.isLoading) return <p role="status">Читаем нормы отрезки…</p>;
  if (!query.data && query.error) return <div className="space-y-2">
    <p role="alert" className="text-danger">Не удалось прочитать нормы отрезки. {publicSourceText(query.error.message, 'Повторите загрузку.')}</p>
    <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>Повторить загрузку</Button>
  </div>;
  if (!query.data) return null;
  return <CutNormsForm view={query.data} refreshing={query.isFetching} onRefresh={() => void query.refetch()} />;
}

function CutNormsForm({ view, refreshing, onRefresh }: {
  view: CutNormsView;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const publish = usePublishCutNorms();
  const [draft, setDraft] = useState<{ revision: number; rows: Draft[] }>();
  const [comment, setComment] = useState('');
  const [notice, setNotice] = useState('');
  const revision = view.table.revision;
  const rows = draft?.rows ?? view.table.rows.map(toDraft);
  const stale = draft != null && draft.revision !== revision.revision;
  const edit = (next: Draft[]) => {
    setDraft({ revision: draft?.revision ?? revision.revision, rows: next });
    setNotice('');
    publish.reset();
  };
  const change = (index: number, field: keyof Draft, value: string) => edit(rows.map((row, i) => i === index ? { ...row, [field]: value } : row));
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || stale || publish.isPending) return;
    publish.mutate({
      expected_revision: draft.revision, comment,
      rows: rows.map(row => ({ diameter_over_mm: number(row.over), diameter_to_mm: number(row.to), face_allowance_mm: number(row.face), kerf_mm: row.kerf.trim() && row.kerf.trim().toLowerCase() !== 'н/д' ? number(row.kerf) : null })),
    }, { onSuccess: () => { setDraft(undefined); setComment(''); setNotice('Нормы сохранены.'); } });
  }
  const cell = (index: number, field: keyof Draft, label: string) => <td className="px-3 py-2">
    <Input className="max-w-28 tabular-nums" inputMode="decimal" aria-label={`${label}, строка ${index + 1}`}
      value={rows[index][field]} disabled={publish.isPending} onChange={event => change(index, field, event.target.value)} />
  </td>;
  return <form className="space-y-4" aria-label="Редактор норм отрезки круга" onSubmit={save}>
    <p className="text-ink-secondary text-pretty">Задайте припуск на один торец и ширину пропила по диапазону диаметра. Технологическая длина отрезка включает базовую длину и два припуска.</p>
    {view.file_warning && <p role="alert" className="text-warning">{publicSourceText(view.file_warning, 'Нормы требуют проверки.')}</p>}
    <div role="region" aria-label="Таблица норм отрезки" tabIndex={0} className="relative overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-xl text-left">
        <caption className="sr-only">Нормы по диапазонам диаметра круглого прутка</caption>
        <thead className="bg-surface-muted text-ink-secondary">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Диаметр свыше, мм</th>
            <th scope="col" className="px-3 py-2 font-medium">Диаметр до включительно, мм</th>
            <th scope="col" className="px-3 py-2 font-medium">Припуск на торец, мм</th>
            <th scope="col" className="px-3 py-2 font-medium">Ширина пропила, мм</th>
            <th scope="col"><span className="sr-only">Действия</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line border-t border-line">
          {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-3 text-muted">Добавьте диапазон диаметра.</td></tr>}
          {rows.map((_, index) => <tr key={index}>
            {cell(index, 'over', 'Ø свыше')}{cell(index, 'to', 'Ø до')}{cell(index, 'face', 'Припуск на торец')}{cell(index, 'kerf', 'Ширина пропила')}
            <td className="px-3 py-2 text-right"><Button type="button" variant="ghost" size="sm" aria-label={`Удалить строку ${index + 1}`}
              disabled={publish.isPending} onClick={() => edit(rows.filter((__, i) => i !== index))}><Trash2 size={14} aria-hidden="true" /></Button></td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <p className="text-xs text-muted">Если ширина пропила не задана, количество заготовок из прутка остаётся неизвестным.</p>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button type="button" variant="outline" size="sm" disabled={publish.isPending}
        onClick={() => edit([...rows, { over: '', to: '', face: '', kerf: '' }])}><Plus size={14} aria-hidden="true" /> Добавить диапазон</Button>
      <Button type="submit" size="sm" loading={publish.isPending} disabled={!draft || stale}>Сохранить</Button>
    </div>
    {publish.error && <p role="alert" className="text-danger">{publicSourceText(publish.error.message, 'Не удалось сохранить нормы.')}</p>}
    {notice && <p role="status" className="text-ink-secondary">{notice}</p>}
    {stale && <div className="space-y-2">
      <p role="alert" className="text-warning">Нормы изменились после начала правки.</p>
      <Button type="button" size="sm" variant="outline" onClick={() => {
        setDraft(undefined); setComment(''); publish.reset(); setNotice('Действующая таблица загружена.');
      }}>Сбросить черновик и открыть действующую таблицу</Button>
    </div>}
    {!stale && publish.error && <Button type="button" size="sm" variant="outline" loading={refreshing}
      onClick={onRefresh}>Обновить данные</Button>}
    <InfoBlock className="border-t border-line pt-3" title="Сведения о публикации">

      <div className="mt-2 space-y-2 text-xs text-muted">
        <div className="w-72 max-w-full"><Input label="Комментарий к сохранению" value={comment} disabled={publish.isPending}
          onChange={event => { edit(rows); setComment(event.target.value); }} /></div>
        {view.history.length > 0 && <ul className="space-y-1">{view.history.map(item => <li key={item.revision}>№{item.revision} · {formatDateTime(item.created_at_utc)} · {/(?:system|watcher|import|fixture)/i.test(item.created_by ?? '') ? 'Система' : publicSourceText(item.created_by, 'Автор не указан')} · {sourceLabels[item.source] ?? 'Изменение норм'} · строк {item.row_count}{item.comment ? ` · ${publicSourceText(item.comment, 'Комментарий к изменению')}` : ''}</li>)}</ul>}
      </div>
    </InfoBlock>
  </form>;
}
