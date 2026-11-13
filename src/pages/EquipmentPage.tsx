import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { MachinePassports } from '@/components/catalog/MachinePassports';

export function EquipmentPage() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  return <div className="content">
    <section className="workspace-card" aria-labelledby="equipment-title">
      <header className="workspace-card-header">
        <div><h2 id="equipment-title">Парк оборудования</h2>
          <p>Исходные паспорта и история оборудования. Рабочие формы операций доступны в конфигураторе.</p></div>
        <Link to="/equipment-configurator" className="inline-flex items-center rounded-md border border-control bg-surface px-3 py-2 text-sm text-ink-secondary">Конфигуратор оборудования</Link>
      </header>
      {!params.has('machine') && <div className="table-toolbar">
        <label className="table-search-wrap"><Search size={15} aria-hidden="true" />
          <input type="search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Поиск по названию или категории…" aria-label="Поиск оборудования" />
        </label>
      </div>}
      <MachinePassports search={search} />
    </section>
  </div>;
}
