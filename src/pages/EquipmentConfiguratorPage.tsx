import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useEquipmentLibrary, equipmentLibraryKey } from '@/api/hooks/useEquipmentLibrary';
import { equipmentCards, equipmentClasses, equipmentRate } from '@/components/catalog/equipmentLibrary';
import { EquipmentEditor } from '@/components/catalog/EquipmentEditor';
import { PassportEquipmentEditor } from '@/components/catalog/PassportEquipmentEditor';
import { Button } from '@/components/ui/Button';
import './equipment-library.css';

export function EquipmentConfiguratorPage() {
  const [params] = useSearchParams(), navigate = useNavigate(), client = useQueryClient();
  const query = useEquipmentLibrary();
  const [search,setSearch] = useState(''), [newClass,setNewClass] = useState('lathe');
  if (params.get('section') === 'rates') return <Navigate replace to={`/calculation-settings/rates${params.get('run') ? `?run=${encodeURIComponent(params.get('run')!)}` : ''}`} />;
  const view = query.data, create = params.get('new') === '1', machineId = params.get('machine');
  const cards = view ? equipmentCards(view) : [];
  const selected = cards.find(item => item.id === machineId);
  const template = view?.references.find(item => item.machine.equipment_class === newClass);
  const onSaved = async (id: string) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: equipmentLibraryKey }), client.invalidateQueries({ queryKey: ['machine-passports'] }),
      client.invalidateQueries({ queryKey: ['machine-hourly-rates'] }), client.invalidateQueries({ queryKey: ['machine-hourly-rate',id] }),
      client.invalidateQueries({ queryKey: ['equipment-passport-editor',id] }),
    ]);
    navigate(`/equipment?machine=${encodeURIComponent(id)}`);
  };
  return <div className="content equipment-library"><section className="workspace-card">
    <header className="workspace-card-header"><div><h2>Конфигуратор оборудования</h2></div><div className="equipment-card-actions"><Link className="ui-button ui-button--outline ui-button--size-sm" to="/equipment">К парку оборудования</Link>{!create && <Link className="ui-button ui-button--primary ui-button--size-sm" to="/equipment-configurator?new=1"><Plus size={16} aria-hidden="true" />Добавить оборудование</Link>}</div></header>
    {query.isPending && <p role="status" className="equipment-message">Загрузка оборудования…</p>}
    {query.isError && <div role="alert" className="equipment-message"><p>Не удалось загрузить оборудование.</p><Button variant="outline" onClick={() => void query.refetch()}>Повторить загрузку</Button></div>}
    {view && <div className="equipment-configurator-body">
      {create && <><fieldset className="equipment-choice"><legend>Тип оборудования</legend>{Object.entries(equipmentClasses).filter(([key]) => view.references.some(item => item.machine.equipment_class === key)).map(([key,title]) => <label key={key}><input type="radio" name="equipment-class" checked={newClass === key} onChange={() => setNewClass(key)} />{title}</label>)}</fieldset><p className="equipment-card-category">Нормы времени и рабочие режимы заполнены из расчётного примера. Проверьте их для своего оборудования.</p>{template && <EquipmentEditor key={`new:${newClass}`} initial={template} view={view} create onSaved={onSaved} />}</>}
      {!create && selected?.configuration && <EquipmentEditor key={selected.id} initial={selected.configuration} view={view} create={false} onSaved={onSaved} />}
      {!create && selected?.passport && <PassportEquipmentEditor key={selected.id} machineId={selected.id} onSaved={onSaved} />}
      {!create && machineId && !selected && <p role="status">Оборудование не найдено. <Link to="/equipment-configurator">Открыть список</Link></p>}
      {!create && !machineId && <><label className="table-search-wrap"><Search size={15} aria-hidden="true" /><input type="search" aria-label="Выбор оборудования для редактирования" placeholder="Найти оборудование" value={search} onChange={event => setSearch(event.target.value)} /></label><div className="table-wrap"><table className="equipment-column-table"><thead><tr><th scope="col">Оборудование</th><th scope="col">Тип</th><th scope="col">Стоимость часа</th><th scope="col">Действие</th></tr></thead><tbody>{cards.filter(item => `${item.title} ${item.category}`.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))).map(item => <tr key={item.id}><th scope="row">{item.title}{item.example && <small>Расчётный пример</small>}</th><td>{item.category}</td><td>{equipmentRate(item.rate)}</td><td><Link className="ui-button ui-button--outline ui-button--size-sm" aria-label={`Редактировать ${item.title}`} to={`/equipment-configurator?machine=${encodeURIComponent(item.id)}`}>Редактировать</Link></td></tr>)}</tbody></table></div></>}
    </div>}
  </section></div>;
}
