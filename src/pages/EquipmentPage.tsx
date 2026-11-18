import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, Settings2, Trash2 } from 'lucide-react';
import { useEquipmentLibrary, useEquipmentChange } from '@/api/hooks/useEquipmentLibrary';
import { equipmentCards, equipmentClasses, equipmentRate, type EquipmentCard } from '@/components/catalog/equipmentLibrary';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Tabs } from '@/components/ui/Tabs';
import './equipment-library.css';

export function EquipmentPage() {
  const query = useEquipmentLibrary();
  const change = useEquipmentChange();
  const [removing, setRemoving] = useState<{ item: EquipmentCard; revision: number }>();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(''), [kind, setKind] = useState('all'), [scope, setScope] = useState('park');
  const cards = query.data ? equipmentCards(query.data) : [];
  const selected = cards.find(item => item.id === params.get('machine'));
  const shown = cards.filter(item => (scope === 'examples' ? item.example : !item.example) && (kind === 'all' || item.kind === kind) && `${item.title} ${item.category}`.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')));
  const close = () => setParams({});
  function update(item: EquipmentCard, enabled?: boolean, expectedRevision?: number) {
    if (!query.data) return;
    change.mutate({ id: item.id, source: item.configuration ? 'configuration' : 'passport',
      revision: expectedRevision ?? (item.configuration ? query.data.catalog.revision : query.data.passport_revision), ...(enabled === undefined ? {} : { enabled }) },
    { onSuccess: () => { setRemoving(undefined); if (enabled === undefined && selected?.id === item.id) close(); } });
  }
  return <div className="content equipment-library"><section className="workspace-card">
    <header className="workspace-card-header"><div><h2>Парк оборудования</h2></div><Link className="ui-button ui-button--primary ui-button--size-sm" to="/equipment-configurator?new=1"><Plus size={16} aria-hidden="true" />Добавить оборудование</Link></header>
    <div className="equipment-library-toolbar"><Tabs id="equipment-scope" items={[{ id: 'park', label: 'Парк оборудования' }, { id: 'examples', label: 'Расчётные примеры' }]} activeId={scope} onChange={value => { setScope(value); setKind('all'); }} aria-label="Состав каталога" /><label className="table-search-wrap"><Search size={15} aria-hidden="true" /><input type="search" aria-label="Поиск оборудования" placeholder="Название оборудования" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
    <div className="equipment-kind-filter" role="group" aria-label="Тип оборудования">{[{ id: 'all', label: 'Все типы' }, ...Object.entries(equipmentClasses).filter(([id]) => cards.some(item => item.kind === id && (scope === 'examples' ? item.example : !item.example))).map(([id,label]) => ({ id,label }))].map(item => <Button key={item.id} size="sm" variant="outline" aria-pressed={kind === item.id} onClick={() => setKind(item.id)}>{item.label}</Button>)}</div>
    {query.isPending && <p role="status" className="equipment-message">Загрузка оборудования…</p>}
    {query.isError && <div role="alert" className="equipment-message"><p>Не удалось загрузить оборудование.</p><Button variant="outline" onClick={() => void query.refetch()}>Повторить загрузку</Button></div>}
    {change.error && !removing && <div role="alert" className="equipment-message"><p>{change.error instanceof TypeError ? 'Не удалось связаться с сервером. Повторите действие.' : change.error.message}</p><Button type="button" variant="outline" onClick={() => { change.reset(); void query.refetch(); }}>Обновить список</Button></div>}
    {query.data && <div className="equipment-card-grid" role="tabpanel" id={`equipment-scope-panel-${scope}`} aria-labelledby={`equipment-scope-tab-${scope}`} tabIndex={0}>{shown.map(item => <article className={`equipment-view-card${item.enabled ? '' : ' is-excluded'}`} key={item.id}>
      <div className="equipment-card-heading"><h3>{item.title}</h3><span>{!item.enabled ? 'Исключён' : item.example ? 'Пример' : item.passport ? 'В парке' : 'В расчёте'}</span></div><p className="equipment-card-category">{item.category}</p>
      {!item.enabled && <p className="equipment-card-category">Не участвует в новых расчётах</p>}
      {item.passport?.configuration_required && <p className="equipment-card-category">Выберите исполнение в конфигураторе.</p>}
      <dl>{item.values.slice(0,4).map((value,i) => <div key={i}><dt>{value.title}</dt><dd>{value.summary ?? <>{value.value} <small>{value.unit}</small></>}</dd></div>)}</dl>
      <div className="equipment-card-rate"><span>Стоимость часа</span><strong>{equipmentRate(item.rate)}</strong></div>
      <div className="equipment-card-actions"><Button size="sm" variant="outline" aria-haspopup="dialog" onClick={() => setParams({ machine: item.id })}>Параметры</Button><Link className="ui-button ui-button--outline ui-button--size-sm" to={`/equipment-configurator?machine=${encodeURIComponent(item.id)}`}><Settings2 size={15} aria-hidden="true" />Редактировать</Link></div>
      <div className="equipment-card-controls"><Button type="button" size="sm" variant="ghost" disabled={change.isPending} aria-label={`${item.enabled ? 'Исключить из расчётов' : 'Вернуть в расчёты'}: ${item.title}`} onClick={() => update(item, !item.enabled)}>{item.enabled ? 'Исключить из расчётов' : 'Вернуть в расчёты'}</Button><Button type="button" size="sm" variant="ghost" disabled={change.isPending} aria-label={`Удалить: ${item.title}`} title="Удалить оборудование" onClick={() => { change.reset(); setRemoving({ item, revision: item.configuration ? query.data!.catalog.revision : query.data!.passport_revision }); }}><Trash2 size={16} aria-hidden="true" /></Button></div>
    </article>)}{!shown.length && !query.isError && <p role="status">Оборудование не найдено. Измените поиск или тип оборудования.</p>}</div>}
  </section><Modal isOpen={!!selected} onClose={close} title={selected?.title ?? 'Оборудование'} size="xl" footer={selected && <Link className="ui-button ui-button--primary ui-button--size-sm" to={`/equipment-configurator?${new URLSearchParams({ machine: selected.id, ...(params.get('field') === 'hourly-rate' ? { field: 'hourly-rate' } : {}) })}`}>Редактировать в конфигураторе</Link>}>
    {selected && <>{params.has('version') && <p className="equipment-card-category" role="status">Показаны текущие параметры оборудования. Ставка выполненного расчёта сохранена в его смете.</p>}<p className="equipment-card-category">{selected.category} · {equipmentRate(selected.rate)}</p>{selected.values.length ? <div className="table-wrap"><table className="equipment-column-table"><thead><tr><th scope="col">Параметр</th><th scope="col">Значение</th><th scope="col">Ед.</th></tr></thead><tbody>{selected.values.map((value,i) => <tr key={i}><th scope="row">{value.title}</th><td>{value.value}</td><td>{value.unit}</td></tr>)}</tbody></table></div> : <p>Добавьте числовые характеристики в конфигураторе.</p>}</>}
  </Modal><Modal isOpen={!!removing} onClose={() => { if (!change.isPending) { setRemoving(undefined); change.reset(); } }} title="Удалить оборудование?" size="sm" footer={<><Button type="button" variant="outline" disabled={change.isPending} onClick={() => { setRemoving(undefined); change.reset(); }}>Отмена</Button><Button type="button" variant="danger" loading={change.isPending} onClick={() => { if (removing) update(removing.item, undefined, removing.revision); }}>Удалить оборудование</Button></>}>
    <p>Карточка «{removing?.item.title}» будет удалена из списка. Сохранённые расчёты останутся прежними.</p>
    {change.error && <p role="alert" className="mt-3 text-danger">Не удалось удалить оборудование. Обновите список и повторите действие.</p>}
  </Modal></div>;
}
