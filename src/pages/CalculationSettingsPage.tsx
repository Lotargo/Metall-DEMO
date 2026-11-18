import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import type { components } from '@/api/schema';
import { useEquipmentLibrary } from '@/api/hooks/useEquipmentLibrary';
import { equipmentCards, equipmentRate } from '@/components/catalog/equipmentLibrary';
import { CutNormsEditor } from '@/components/catalog/CutNormsEditor';
import { BarLengthsSettings } from '@/components/route/BarLengthsSettings';
import { TimeNormRow } from '@/components/route/TimeNormRow';
import { Button } from '@/components/ui/Button';
import { runDocumentLink } from '@/utils/runDocumentLinks';
import './equipment-library.css';

type Settings = components['schemas']['CalculationSettingsView'];
export const calculationSettingsKey = ['calculation-settings'];

function EquipmentRates() {
  const query = useEquipmentLibrary();
  const machines = query.data ? equipmentCards(query.data).filter(item => !item.example && item.enabled) : [];
  return <section><h3>Ставки оборудования</h3>
    {query.isPending && <p role="status">Загрузка оборудования…</p>}
    {query.isError && <div role="alert"><p>Не удалось загрузить ставки оборудования.</p><Button variant="outline" onClick={() => void query.refetch()}>Повторить загрузку</Button></div>}
    {query.data && <div className="table-wrap"><table className="equipment-column-table">
      <thead><tr><th scope="col">Оборудование</th><th scope="col">Стоимость часа, ₽/ч</th><th scope="col">Действие</th></tr></thead>
      <tbody>{machines.map(machine => <tr key={machine.id}><th scope="row">{machine.title}</th><td>{equipmentRate(machine.rate)}</td><td><Link className="ui-button ui-button--outline ui-button--size-sm" to={`/equipment-configurator?${new URLSearchParams({ machine: machine.id, field: 'hourly-rate' })}`}>Изменить ставку</Link></td></tr>)}</tbody>
    </table></div>}
  </section>;
}

export function CalculationSettingsPage() {
  const { section } = useParams();
  const [params] = useSearchParams();
  const cache = useQueryClient();
  const query = useQuery({ queryKey: calculationSettingsKey, queryFn: async ({ signal }) => {
    const response = await fetch('/api/v1/calculation/settings', { signal });
    if (!response.ok) throw new Error('Не удалось загрузить настройки расчёта.');
    return await response.json() as Settings;
  } });
  const runId = params.get('run');
  if (section === 'documents' && runId) return <Navigate replace to={runDocumentLink(runId,'estimate')} />;
  const view = query.data;
  const selected = view?.sections.find(item => item.id === section);
  if (view && !selected) return <Navigate replace to={`/calculation-settings/rates${params.size ? `?${params}` : ''}`} />;
  return <div className="content equipment-library calculation-settings">
    <section className="workspace-card">
      <header className="workspace-card-header"><h2>Настройки расчёта</h2><div className="equipment-card-actions">
        {runId && <Link className="ui-button ui-button--outline ui-button--size-sm" to={runDocumentLink(runId,'estimate')}>К смете детали</Link>}
        <Link className="ui-button ui-button--outline ui-button--size-sm" to="/equipment">Парк оборудования</Link>
      </div></header>
      {query.isPending && <p className="equipment-message" role="status">Загрузка настроек…</p>}
      {query.isError && <div className="equipment-message" role="alert"><p>Не удалось загрузить настройки расчёта.</p><Button variant="outline" onClick={() => void query.refetch()}>Повторить загрузку</Button></div>}
      {view && selected && <>
        <nav className="equipment-kind-filter" aria-label="Разделы настроек расчёта">{view.sections.map(item => <Link key={item.id} className={`ui-button ui-button--${selected.id === item.id ? 'primary' : 'outline'} ui-button--size-sm`} aria-current={selected.id === item.id ? 'page' : undefined} to={`/calculation-settings/${item.id}${params.size ? `?${params}` : ''}`}>{item.title}</Link>)}</nav>
        <div className="equipment-configurator-body"><h3>{selected.title}</h3>
          {selected.id === 'rates' && <><p className="equipment-card-category">Изменения ставок применяются к новым расчётам.</p>
            <div className="table-wrap"><table className="equipment-column-table"><thead><tr><th scope="col">Работы</th><th scope="col">Стоимость часа, ₽/ч</th><th scope="col">Действие</th></tr></thead>
              <tbody>{view.rates.map(rate => <TimeNormRow key={rate.category} profile={rate.profile} parameter="hourly_rate" number={rate.profile.parameters.hourly_rate} label={rate.title} unit="₽/ч" heading={null} conditions={null} onSaved={() => cache.invalidateQueries({ queryKey: calculationSettingsKey })} />)}</tbody>
            </table></div><EquipmentRates /></>}
          {selected.id === 'bar-lengths' && <BarLengthsSettings />}
          {selected.id === 'cut-norms' && <CutNormsEditor />}
        </div>
      </>}
    </section>
  </div>;
}
