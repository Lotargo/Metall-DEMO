import React, { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useEquipmentMutation, useMachinePassports } from '@/api/hooks/useMachinePassports';
import { Modal } from '@/components/ui/Modal';
import { MachineData } from './MachineData';
import { MachineHourlyRate } from './MachineHourlyRate';
import { equipmentRequest, type MachineFile } from '@/api/machineExchange';
import { publicSourceText } from '@/utils/publicSource';
import './machine-passports.css';

type CategoryDraft = { category_id?: string; title: string; revision: number };
type DeleteTarget = { kind: 'passports' | 'categories'; id: string; title: string; revision: number; used?: boolean };

const profileTemplates = [
  { type: 'lathe', category: 'turning', title: 'Токарный' },
  { type: 'drill', category: 'drilling', title: 'Сверлильный' },
  { type: 'mill', category: 'milling', title: 'Фрезерный' },
  { type: 'grinder', category: 'grinding', title: 'Шлифовальный' },
  { type: 'bandsaw', category: 'sawing', title: 'Ленточнопильный' },
  { type: 'generic', category: null, title: 'Универсальный' },
] as const;

export function MachinePassports({ search }: { search: string }) {
  const { data, isLoading, error: loadError, refetch } = useMachinePassports();
  const mutation = useEquipmentMutation();
  const [params, setParams] = useSearchParams();
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [replacement, setReplacement] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dataEditor, setDataEditor] = useState<{ machineId?: string; template?: MachineFile } | null>(null);
  const [newMachine, setNewMachine] = useState<{ category: string; type: string } | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const busy = mutation.isPending;
  const categories = data?.categories ?? [];
  const machines = data?.machines ?? [];
  const query = search.trim().toLocaleLowerCase('ru');
  const filtered = machines.filter(machine =>
    (!categoryFilter || machine.category_id === categoryFilter) &&
    (!query || [machine.title, categories.find(c => c.category_id === machine.category_id)?.title ?? '']
      .some(text => text.toLocaleLowerCase('ru').includes(query)))
  );

  const failed = (e: unknown) => {
    setError(publicSourceText(e instanceof Error ? e.message : '', 'Не удалось сохранить изменение'));
    void refetch();
  };
  const openTemplate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newMachine?.category || templateLoading) return;
    setTemplateLoading(true);
    setError(''); setNotice('');
    try {
      const file = await equipmentRequest<MachineFile>(`exchange/templates/${newMachine.type}`);
      const machine = { ...file.machine, machine_id: crypto.randomUUID(), category_id: newMachine.category, title: '' };
      setNewMachine(null);
      setDataEditor({ template: { ...file, machine } });
    } catch (error) {
      failed(error);
    } finally {
      setTemplateLoading(false);
    }
  };
  function selectCategory(category: string) {
    setNewMachine({ category, type: profileTemplates.find(item => item.category === category)?.type ?? 'generic' });
  }
  const saveCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!categoryDraft) return;
    setError('');
    try {
      await mutation.mutateAsync({ path: categoryDraft.category_id ? `categories/${encodeURIComponent(categoryDraft.category_id)}` : 'categories',
        method: categoryDraft.category_id ? 'PUT' : 'POST',
        body: { title: categoryDraft.title, expected_revision: categoryDraft.revision } });
      setCategoryDraft(null); setNotice('Категория сохранена');
    } catch (e) { failed(e); }
  };
  const remove = async () => {
    if (!deleting) return;
    setError('');
    try {
      await mutation.mutateAsync({ path: `${deleting.kind}/${encodeURIComponent(deleting.id)}`, method: 'DELETE',
        query: { expected_revision: deleting.revision, ...(replacement ? { replacement_id: replacement } : {}) } });
      if (categoryFilter === deleting.id) setCategoryFilter('');
      setDeleting(null); setNotice('Удалено');
    } catch (e) { failed(e); }
  };
  const askDelete = (target: DeleteTarget) => {
    setError(''); setReplacement(''); setDeleting(target);
  };
  const refreshDraft = async () => {
    const result = await refetch();
    if (!result.data) return;
    if (categoryDraft) setCategoryDraft({ ...categoryDraft, revision: result.data.revision });
    if (deleting) setDeleting({ ...deleting, revision: result.data.revision,
      used: deleting.kind === 'categories' && result.data.machines.some(m => m.category_id === deleting.id) });
    setError('');
  };
  const errorMessage = error && <div className="passport-error" role="alert">
    <p>{error}</p><button type="button" className="secondary-action" onClick={() => void refreshDraft()} disabled={busy}>
      Обновить каталог и сохранить черновик</button>
  </div>;

  const targetMachineId = params.get('machine');
  const showRate = params.get('field') === 'hourly-rate';
  if (targetMachineId) {
    const machine = machines.find(item => item.machine_id === targetMachineId);
    const parameterId = params.get('field') ?? undefined;
    const sourceVersion = params.get('version') ?? undefined;
    const closeLinkedMachine = () => {
      const next = new URLSearchParams(params);
      next.delete('machine');
      next.delete('field');
      next.delete('version');
      setParams(next, { replace: true });
    };
    return <div className="machine-passports">
      <Link to="/equipment">К списку оборудования</Link>
      {isLoading && <p role="status">Загрузка оборудования…</p>}
      {loadError && <div className="passport-error" role="alert">
        <p>Не удалось загрузить оборудование.</p>
        <button type="button" className="secondary-action" onClick={() => void refetch()}>Повторить загрузку</button>
      </div>}
      {data && !machine && <p role="status">Выбранный станок отсутствует в парке оборудования.</p>}
      {machine && showRate && <section className="passport-card" aria-label={`Ставка станка ${machine.title}`}>
        <h4>{machine.title}</h4>
        <MachineHourlyRate machineId={machine.machine_id} />
      </section>}
      {data && machine && !showRate && <MachineData key={`${machine.machine_id}:${parameterId ?? ''}`}
        machineId={machine.machine_id} parameterId={parameterId} sourceVersion={sourceVersion} catalog={data}
        onClose={closeLinkedMachine} onSaved={closeLinkedMachine} />}
    </div>;
  }

  return <div className="machine-passports">
    <div className="passport-toolbar">
      <label>Категория<select className="ui-select ui-select--native" aria-label="Фильтр по категории" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
        <option value="">Все категории</option>
        {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.title}</option>)}
      </select></label>
      <div className="passport-actions">
        <button type="button" className="secondary-action" onClick={() => document.getElementById('equipment-categories')?.scrollIntoView({ block: 'start' })}>Категории оборудования</button>
        <button type="button" className="primary-action" disabled={!data || !categories.length} onClick={() => {
          setError(''); setNotice(''); selectCategory(categoryFilter);
        }}><Plus size={16} aria-hidden="true" />Добавить оборудование</button>
      </div>
    </div>
    <p className="passport-count" role="status">{notice || `Всего: ${machines.length}. Показано: ${filtered.length}`}</p>
    {error && !newMachine && !categoryDraft && !deleting && <div className="passport-error" role="alert">{error}</div>}
    {loadError && <div role="alert" className="passport-error"><p>Не удалось загрузить оборудование. {publicSourceText(loadError.message, 'Повторите загрузку.')}</p>
      <button type="button" className="secondary-action" onClick={() => void refetch()}>Повторить загрузку</button></div>}
    {isLoading && <p role="status">Загрузка оборудования…</p>}

    {categories.filter(c => filtered.some(m => m.category_id === c.category_id)).map(c => <section key={c.category_id} className="passport-group" aria-label={c.title}>
      <h4>{c.title}</h4>
      {filtered.filter(m => m.category_id === c.category_id).map(machine => <article key={machine.machine_id} className="passport-card">
        <header><div><h5>{machine.title}</h5><span className="passport-version">Версия {machine.version}</span></div>
          <div className="passport-actions">
            <button type="button" className="secondary-action" aria-label={`Параметры станка ${machine.title}`} onClick={() => { setError(''); setDataEditor({ machineId: machine.machine_id }); }}>Параметры</button>
            <button type="button" className="secondary-action" aria-label={`Удалить оборудование ${machine.title}`} onClick={() => askDelete({ kind: 'passports', id: machine.machine_id, title: machine.title, revision: data!.revision })}><Trash2 size={15} aria-hidden="true" />Удалить</button>
          </div>
        </header>
      </article>)}
    </section>)}
    {data && filtered.length === 0 && <p className="empty-state">{machines.length ? 'Оборудование по этому запросу не найдено' : 'Добавьте первое оборудование'}</p>}

    <Modal isOpen={newMachine !== null} onClose={() => { if (!templateLoading) setNewMachine(null); }} title="Добавить оборудование">
      {newMachine && <form className="passport-form" onSubmit={event => void openTemplate(event)}>
        {error && <p className="passport-error" role="alert">{error}</p>}
        <label>Категория<select className="ui-select ui-select--native" aria-label="Категория" required disabled={templateLoading} value={newMachine.category} onChange={e => selectCategory(e.target.value)}>
          <option value="">Выберите категорию</option>{categories.map(c => <option key={c.category_id} value={c.category_id}>{c.title}</option>)}
        </select></label>
        <label>Шаблон<select className="ui-select ui-select--native" aria-label="Шаблон" value={newMachine.type} disabled={!newMachine.category || templateLoading
          || profileTemplates.some(item => item.category === newMachine.category)}
          onChange={e => setNewMachine({ ...newMachine, type: e.target.value })}>
          {profileTemplates.map(item => <option key={item.type} value={item.type}>{item.title}</option>)}
        </select></label>
        <button type="submit" className="primary-action" disabled={!newMachine.category || templateLoading}>
          {templateLoading ? 'Загрузка шаблона…' : 'Заполнить карточку'}
        </button>
      </form>}
    </Modal>
    {dataEditor && data && <MachineData key={dataEditor.machineId ?? 'template'} machineId={dataEditor.machineId}
      template={dataEditor.template} catalog={data} onClose={() => setDataEditor(null)} onSaved={() => {
        setDataEditor(null); setNotice('Карточка оборудования сохранена.');
      }} />}
    <Modal isOpen={categoryDraft !== null} onClose={() => { if (!busy) setCategoryDraft(null); }} title={categoryDraft?.category_id ? 'Переименовать категорию' : 'Добавить категорию'}>
      {categoryDraft && <form className="passport-form" onSubmit={event => void saveCategory(event)}>{errorMessage}
        <label>Название категории<input className="ui-input" required value={categoryDraft.title} onChange={e => setCategoryDraft({ ...categoryDraft, title: e.target.value })} /></label>
        <button type="submit" className="primary-action" disabled={busy || !categoryDraft.title.trim()}>{busy ? 'Сохранение…' : 'Сохранить категорию'}</button>
      </form>}
    </Modal>
    <Modal isOpen={deleting !== null} onClose={() => { if (!busy) setDeleting(null); }} title={deleting?.kind === 'categories' ? 'Удалить категорию' : 'Удалить оборудование'}>
      {deleting && <div className="passport-form">{errorMessage}<p>Удалить «{deleting.title}»?</p>
        {deleting.used && <label>Перенести оборудование в категорию<select className="ui-select ui-select--native" aria-label="Перенести оборудование в категорию" value={replacement} onChange={e => setReplacement(e.target.value)}>
          <option value="">Выберите категорию</option>{categories.filter(c => c.category_id !== deleting.id).map(c => <option key={c.category_id} value={c.category_id}>{c.title}</option>)}
        </select></label>}
        <div className="passport-actions"><button type="button" className="secondary-action" disabled={busy} onClick={() => setDeleting(null)}>Отмена</button>
          <button type="button" className="primary-action" disabled={busy || (deleting.used && !replacement)} onClick={() => void remove()}>{busy ? 'Удаление…' : 'Удалить'}</button></div>
      </div>}
    </Modal>
    <section id="equipment-categories" className="passport-categories" aria-label="Управление категориями">
      <button type="button" className="secondary-action" disabled={!data} onClick={() => { setError(''); setCategoryDraft({ title: '', revision: data!.revision }); }}>Добавить категорию</button>
      {categories.map(c => <div key={c.category_id} className="passport-category-row">
        <span>{c.title}</span><span className="passport-actions">
          <button type="button" className="secondary-action" aria-label={`Переименовать категорию ${c.title}`} onClick={() => { setError(''); setCategoryDraft({ ...c, revision: data!.revision }); }}><Pencil size={15} aria-hidden="true" /></button>
          <button type="button" className="secondary-action" aria-label={`Удалить категорию ${c.title}`} onClick={() => askDelete({ kind: 'categories', id: c.category_id, title: c.title, revision: data!.revision, used: machines.some(m => m.category_id === c.category_id) })}><Trash2 size={15} aria-hidden="true" /></button>
        </span>
      </div>)}
    </section>
  </div>;
}
