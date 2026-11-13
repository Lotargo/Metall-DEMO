import React, { useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Database,
  Download,
  ExternalLink,
  FileCheck,
  Filter,
  Ruler,
  Search,
  TableProperties,
} from 'lucide-react';
import { useAssortmentCatalog, useCatalog } from '@/api/hooks/useCatalog';
import { useEditableTables } from '@/api/hooks/useEditableNsi';
import { downloadCatalogCsv, downloadFile } from '@/api/client';
import { EditableNsiTables } from '@/components/catalog/EditableNsiTables';
import { cutNormsSettingsPath } from '@/utils/calculationSettingsLinks';
import { publicSourceText } from '@/utils/publicSource';
const catalogSections = ['materials', 'standards', 'assortment', 'editable'] as const;
type CatalogSection = typeof catalogSections[number];
type SortOrder = 'asc' | 'desc';

function catalogDisplayRow(value: unknown): Record<string, string> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const row: Record<string, string> = {};
  for (const [key, field] of Object.entries(value)) {
    if (typeof field === 'string') row[key] = field;
    else if (typeof field === 'number' && Number.isFinite(field)) row[key] = String(field);
    else if (Array.isArray(field) && field.every((part) => typeof part === 'string')) {
      row[key] = field.join(', ');
    }
  }
  return row;
}

interface SectionConfig {
  id: CatalogSection;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  count?: number;
}

const PRODUCT_FORM_LABELS: Record<string, string> = {
  round_bar: 'Круг',
  square_bar: 'Квадрат',
  sheet: 'Лист',
  plate: 'Плита',
  tube: 'Труба',
  rectangular_bar: 'Прямоугольник',
  hex_bar: 'Шестигранник',
};

const ASSORTMENT_STANDARDS = [
  { id: 'all', label: 'Все стандарты', form: '' },
  { id: 'ГОСТ 2590-2006', label: 'ГОСТ 2590-2006', form: 'Круг' },
  { id: 'ГОСТ 2591-2006', label: 'ГОСТ 2591-2006', form: 'Квадрат' },
  { id: 'ГОСТ 2879-2006', label: 'ГОСТ 2879-2006', form: 'Шестигранник' },
  { id: 'ГОСТ 19903-2015', label: 'ГОСТ 19903-2015', form: 'Лист г/к' },
  { id: 'ГОСТ 19904-90', label: 'ГОСТ 19904-90', form: 'Лист х/к' },
  { id: 'ГОСТ 8732-2025', label: 'ГОСТ 8732-2025', form: 'Труба' },
];

export const CatalogPage: React.FC = () => {
  const [params] = useSearchParams();
  const section = params.get('section');
  if (section === 'cut-norms' || section === 'machines') {
    const context = new URLSearchParams(params);
    context.delete('section');
    const destination = section === 'machines' ? '/equipment' : cutNormsSettingsPath;
    return <Navigate to={`${destination}${context.size ? `?${context}` : ''}`} replace />;
  }
  return <CatalogContent />;
};

function CatalogContent() {
  const { data: catalog, isLoading: isCatalogLoading } = useCatalog();
  const { data: assortment, isLoading: isAssortmentLoading } = useAssortmentCatalog();
  const { data: editableTables = [], isLoading: isEditableLoading } = useEditableTables();
  const [params, setParams] = useSearchParams();
  const activeSection = catalogSections.find(section => section === params.get('section')) ?? 'materials';
  const editorSection = activeSection === 'editable';
  const [search, setSearch] = useState('');
  const [selectedStandard, setSelectedStandard] = useState<string>('all');
  const [selectedOrigin, setSelectedOrigin] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [sortField, setSortField] = useState<string>('code');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const handleExportCsv = async () => {
    try {
      setIsExporting(true);
      if (activeSection === 'assortment') {
        await downloadFile(
          '/api/v1/nsi/catalog/assortment/export.csv',
          'nsi-assortment.csv'
        );
      } else if (!editorSection) {
        await downloadCatalogCsv(activeSection);
      }
    } catch {
      alert('Не удалось выгрузить таблицу. Повторите экспорт.');
    } finally {
      setIsExporting(false);
    }
  };

  const sections: SectionConfig[] = [
    {
      id: 'materials',
      label: 'Материалы (Splav)',
      icon: Database,
      count: catalog?.materials?.length,
    },
    {
      id: 'standards',
      label: 'Стандарты сортамента',
      icon: FileCheck,
      count: catalog?.standards?.length,
    },
    {
      id: 'assortment',
      label: 'Сортамент заготовок',
      icon: Ruler,
      count: assortment?.count,
    },
    {
      id: 'editable',
      label: 'Рабочие таблицы',
      icon: TableProperties,
      count: editableTables.length,
    },
  ];

  const currentSectionMeta = sections.find((s) => s.id === activeSection) || sections[0];
  const currentItems = useMemo(() => {
    const source: readonly unknown[] = activeSection === 'assortment'
      ? assortment?.rows ?? []
      : activeSection === 'editable'
        ? editableTables
        : activeSection === 'materials'
          ? catalog?.materials ?? []
          : catalog?.standards ?? [];
    return source.flatMap((item) => {
      const row = catalogDisplayRow(item);
      return row ? [row] : [];
    });
  }, [activeSection, assortment?.rows, editableTables, catalog]);
  const isLoading = editorSection
    ? isEditableLoading
    : isCatalogLoading || (activeSection === 'assortment' && isAssortmentLoading);

  // Счётчики по стандартам для сортамента
  const assortmentStandardCounts = useMemo(() => {
    if (!assortment?.rows) return {};
    const map: Record<string, number> = { all: assortment.rows.length };
    for (const r of assortment.rows) {
      map[r.standard_designation] = (map[r.standard_designation] || 0) + 1;
    }
    return map;
  }, [assortment]);

  // Счётчики происхождения для активного раздела
  const originCounts = useMemo(() => {
    const map: Record<string, number> = {};
    if (activeSection === 'editable') return map;
    for (const item of currentItems) {
      const o = item.origin || (activeSection === 'assortment' ? 'core' : 'fixture');
      map[o] = (map[o] || 0) + 1;
    }
    return map;
  }, [currentItems, activeSection]);

  const filteredItems = useMemo(() => {
    let items = currentItems;
    if (activeSection === 'assortment' && selectedStandard !== 'all') {
      items = items.filter((item) => item.standard_designation === selectedStandard);
    }
    if (selectedOrigin !== 'all') {
      items = items.filter((item) => {
        const o = item.origin || (activeSection === 'assortment' ? 'core' : 'fixture');
        return o === selectedOrigin;
      });
    }
    const q = search.trim().toLocaleLowerCase('ru');
    if (!q) return items;
    return items.filter((item) =>
      Object.values(item).some(
        (v) => v !== null && v !== undefined && String(v).toLocaleLowerCase('ru').includes(q)
      )
    );
  }, [currentItems, activeSection, selectedStandard, selectedOrigin, search]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown size={12} className="sort-icon sort-icon-idle" aria-hidden="true" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp size={12} className="sort-icon sort-icon-active" aria-hidden="true" />
    ) : (
      <ArrowDown size={12} className="sort-icon sort-icon-active" aria-hidden="true" />
    );
  };

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      let valA: string | number = '';
      let valB: string | number = '';

      if (sortField === 'origin') {
        valA = a.origin_label || a.origin || '';
        valB = b.origin_label || b.origin || '';
      } else if (activeSection === 'materials') {
        if (sortField === 'code') { valA = a.canonical_name || ''; valB = b.canonical_name || ''; }
        else if (sortField === 'name') { valA = a.classification || ''; valB = b.classification || ''; }
        else if (sortField === 'category') { valA = a.source_provider || ''; valB = b.source_provider || ''; }
      } else if (activeSection === 'standards') {
        if (sortField === 'code') { valA = a.designation_literal || a.standard_id || a.code || ''; valB = b.designation_literal || b.standard_id || b.code || ''; }
        else if (sortField === 'name') { valA = a.title || a.name || ''; valB = b.title || b.name || ''; }
        else if (sortField === 'category') { valA = a.authority || a.category || a.document_kind || ''; valB = b.authority || b.category || b.document_kind || ''; }
      } else if (activeSection === 'assortment') {
        if (sortField === 'standard') { valA = a.standard_designation || ''; valB = b.standard_designation || ''; }
        else if (sortField === 'form') { valA = a.product_form || ''; valB = b.product_form || ''; }
        else if (sortField === 'size') { valA = a.size_display || ''; valB = b.size_display || ''; }
        else if (sortField === 'tolerance') { valA = a.tolerance_display || ''; valB = b.tolerance_display || ''; }
        else if (sortField === 'length') { valA = a.length_display || ''; valB = b.length_display || ''; }
        else if (sortField === 'clause') { valA = a.source_clause || ''; valB = b.source_clause || ''; }
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      const strA = String(valA || '').toLocaleLowerCase('ru');
      const strB = String(valB || '').toLocaleLowerCase('ru');
      const cmp = strA.localeCompare(strB, 'ru', { numeric: true, sensitivity: 'base' });
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [filteredItems, activeSection, sortField, sortOrder]);

  const switchSection = (section: CatalogSection) => {
    setParams({ section });
    setSearch('');
    setSelectedStandard('all');
    setSelectedOrigin('all');
    setSortOrder('asc');
    setSortField(section === 'assortment' ? 'standard' : 'code');
  };

  const renderOriginBadge = (item: Record<string, string>) => {
    const origin = item.origin || (activeSection === 'assortment' ? 'core' : 'fixture');
    const label = origin === 'core'
      ? (activeSection === 'materials' ? 'Справочник материалов' : 'Нормативный справочник')
      : origin === 'splav' ? 'Марочник Splav' : 'Проверочный пример';

    let badgeClass = 'soft-badge neutral';
    if (origin === 'core') badgeClass = 'soft-badge success';
    else if (origin === 'splav') badgeClass = 'soft-badge accent';
    else if (origin === 'fixture') badgeClass = 'soft-badge neutral';

    return (
      <span className={badgeClass}>
        {label}
      </span>
    );
  };

  const emptyColSpan = activeSection === 'assortment'
    ? 8
    : activeSection === 'materials' || activeSection === 'standards'
      ? activeSection === 'materials' ? 4 : 5
      : 6;

  const sourceStatus = activeSection === 'editable' ? undefined : catalog?.sources?.[activeSection];

  return (
    <div className="content catalog-page">
      <section className="page-intro">
        <div>
          <h2>Справочник нормативно-справочной информации (НСИ)</h2>
          <p>Марки и свойства материалов, стандарты и размеры заготовок для инженерных расчётов.</p>
        </div>
        {!editorSection ? <div className="intro-actions">
          <button
            className="secondary-action"
            type="button"
            onClick={handleExportCsv}
            disabled={isExporting}
            title="Экспорт текущего раздела в CSV-файл с сохранением происхождения данных"
          >
            <Download size={15} />
            {isExporting ? 'Экспорт...' : 'Экспорт в CSV'}
          </button>
        </div> : null}
      </section>

      <section className="workspace-card" aria-labelledby="catalog-title">
        <header className="workspace-card-header">
          <div>
            <h3 id="catalog-title">{currentSectionMeta.label}</h3>
            <p>
              Всего записей: {currentItems.length}
              {filteredItems.length !== currentItems.length ? (
                <strong style={{ marginLeft: 6, color: 'var(--accent)' }}>
                  (показано: {filteredItems.length})
                </strong>
              ) : null}
            </p>
          </div>
          <div className="header-badges">
            {originCounts.core ? (
              <span className="soft-badge success">
                Нормативные записи: {originCounts.core}
              </span>
            ) : null}
            {activeSection === 'materials' && sourceStatus?.status === 'unavailable' ? (
              <span className="soft-badge neutral">
                Марочник временно недоступен
              </span>
            ) : null}
            {originCounts.splav ? (
              <span className="soft-badge accent">
                Splav: {originCounts.splav}
              </span>
            ) : null}
            {originCounts.fixture ? (
              <span className="soft-badge neutral">
                Проверочные примеры: {originCounts.fixture}
              </span>
            ) : null}
            <span className="soft-badge">справочник</span>
          </div>
        </header>

        <div className="table-toolbar">
          {!editorSection ? <label className="table-search-wrap">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по марке, названию или ГОСТ…"
              aria-label="Поиск в каталоге"
            />
          </label> : <span />}
          <div className="table-tabs" aria-label="Разделы справочника">
            {sections.map((sec) => (
              <button
                key={sec.id}
                className={activeSection === sec.id ? 'is-active' : ''}
                type="button"
                onClick={() => switchSection(sec.id)}
              >
                {sec.label} · {sec.count ?? 0}
              </button>
            ))}
          </div>
        </div>

        {editorSection ? (
          <EditableNsiTables tables={editableTables} isLoading={isEditableLoading} />
        ) : <>
        {/* Быстрые фильтры для сортамента */}
        {activeSection === 'assortment' && (
          <div className="catalog-filter-bar" role="toolbar" aria-label="Фильтр по стандартам сортамента">
            <span className="catalog-filter-label">
              <Ruler size={13} aria-hidden="true" />
              Стандарты:
            </span>
            {ASSORTMENT_STANDARDS.map((std) => {
              const count = assortmentStandardCounts[std.id] ?? 0;
              const isActive = selectedStandard === std.id;
              return (
                <button
                  key={std.id}
                  type="button"
                  className={`catalog-chip ${isActive ? 'is-active' : ''}`}
                  onClick={() => setSelectedStandard(std.id)}
                >
                  <span>{std.form ? `${std.form} (${std.id})` : std.label}</span>
                  <span className="chip-count">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Быстрый фильтр происхождения для разделов со смешанными источниками */}
        {activeSection !== 'assortment' && (originCounts.splav || originCounts.fixture) && (
          <div className="catalog-filter-bar" role="toolbar" aria-label="Фильтр по источнику данных">
            <span className="catalog-filter-label">
              <Filter size={13} aria-hidden="true" />
              Источник:
            </span>
            <button
              type="button"
              className={`catalog-chip ${selectedOrigin === 'all' ? 'is-active' : ''}`}
              onClick={() => setSelectedOrigin('all')}
            >
              <span>Все</span>
              <span className="chip-count">{currentItems.length}</span>
            </button>
            {originCounts.core ? (
              <button
                type="button"
                className={`catalog-chip ${selectedOrigin === 'core' ? 'is-active' : ''}`}
                onClick={() => setSelectedOrigin('core')}
              >
                <span>Нормативный справочник</span>
                <span className="chip-count">{originCounts.core}</span>
              </button>
            ) : null}
            {originCounts.splav ? (
              <button
                type="button"
                className={`catalog-chip ${selectedOrigin === 'splav' ? 'is-active' : ''}`}
                onClick={() => setSelectedOrigin('splav')}
              >
                <span>Марочник Splav</span>
                <span className="chip-count">{originCounts.splav}</span>
              </button>
            ) : null}
            {originCounts.fixture ? (
              <button
                type="button"
                className={`catalog-chip ${selectedOrigin === 'fixture' ? 'is-active' : ''}`}
                onClick={() => setSelectedOrigin('fixture')}
              >
                <span>Проверочные примеры</span>
                <span className="chip-count">{originCounts.fixture}</span>
              </button>
            ) : null}
          </div>
        )}

        <div className="table-wrap">
            <table className="projects-table catalog-table">
              <thead>
                <tr>
                  {activeSection === 'materials' && (
                    <>
                      <th className="is-sortable" onClick={() => handleSort('code')} title="Сортировать по марке">
                        <div className="th-sort-content"><span>Марка</span>{renderSortIcon('code')}</div>
                      </th>
                      <th>Наименование / алиас</th>
                      <th className="is-sortable" onClick={() => handleSort('name')} title="Сортировать по классификации">
                        <div className="th-sort-content"><span>Классификация</span>{renderSortIcon('name')}</div>
                      </th>
                      <th className="text-center">Источник</th>
                    </>
                  )}
                  {activeSection === 'standards' && (
                    <>
                      <th className="is-sortable" onClick={() => handleSort('code')} title="Сортировать по номеру">
                        <div className="th-sort-content"><span>Номер стандарта</span>{renderSortIcon('code')}</div>
                      </th>
                      <th className="is-sortable" onClick={() => handleSort('name')} title="Сортировать по названию">
                        <div className="th-sort-content"><span>Наименование</span>{renderSortIcon('name')}</div>
                      </th>
                      <th className="is-sortable" onClick={() => handleSort('category')} title="Сортировать по категории">
                        <div className="th-sort-content"><span>Категория</span>{renderSortIcon('category')}</div>
                      </th>
                      <th className="text-center">Статус</th>
                      <th className="is-sortable text-center" onClick={() => handleSort('origin')} title="Сортировать по источнику">
                        <div className="th-sort-content" style={{ justifyContent: 'center' }}><span>Происхождение</span>{renderSortIcon('origin')}</div>
                      </th>
                    </>
                  )}
                  {activeSection === 'assortment' && (
                    <>
                      <th className="is-sortable" onClick={() => handleSort('standard')} title="Сортировать по ГОСТ">
                        <div className="th-sort-content"><span>ГОСТ</span>{renderSortIcon('standard')}</div>
                      </th>
                      <th className="is-sortable" onClick={() => handleSort('form')} title="Сортировать по форме">
                        <div className="th-sort-content"><span>Форма</span>{renderSortIcon('form')}</div>
                      </th>
                      <th className="is-sortable" onClick={() => handleSort('size')} title="Сортировать по размеру">
                        <div className="th-sort-content"><span>Размер / формат</span>{renderSortIcon('size')}</div>
                      </th>
                      <th className="is-sortable" onClick={() => handleSort('tolerance')} title="Сортировать по допуску">
                        <div className="th-sort-content"><span>Допуск</span>{renderSortIcon('tolerance')}</div>
                      </th>
                      <th className="is-sortable" onClick={() => handleSort('length')} title="Сортировать по длине">
                        <div className="th-sort-content"><span>Длина / поставка</span>{renderSortIcon('length')}</div>
                      </th>
                      <th>Требование</th>
                      <th className="is-sortable" onClick={() => handleSort('clause')} title="Сортировать по нормативному основанию">
                        <div className="th-sort-content"><span>Основание</span>{renderSortIcon('clause')}</div>
                      </th>
                      <th className="is-sortable text-center" onClick={() => handleSort('origin')} title="Сортировать по происхождению">
                        <div className="th-sort-content" style={{ justifyContent: 'center' }}><span>Происхождение</span>{renderSortIcon('origin')}</div>
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedItems.length > 0 ? (
                  sortedItems.map((item, idx: number) => (
                    <tr key={item.row_id || item.id || idx}>
                      {activeSection === 'materials' && (
                        <>
                          <td><span style={{ color: 'var(--accent)', fontWeight: 650 }}>{item.canonical_name}</span></td>
                          <td>{item.aliases || '—'}</td>
                          <td className="muted-cell">{item.classification || '—'}</td>
                          <td className="text-center">{renderOriginBadge(item)}</td>
                        </>
                      )}
                      {activeSection === 'standards' && (
                        <>
                          <td><span style={{ color: 'var(--accent)', fontWeight: 600 }}>{publicSourceText(item.designation_literal, 'Обозначение не указано')}</span></td>
                          <td style={{ fontWeight: 550, color: 'var(--text)' }}>{publicSourceText(item.title || item.name, 'Стандарт')}</td>
                          <td className="muted-cell">{item.authority || item.category || item.document_kind || 'Стандарт'}</td>
                          <td className="text-center"><span className="soft-badge success">Действует</span></td>
                          <td className="text-center">{renderOriginBadge(item)}</td>
                        </>
                      )}
                      {activeSection === 'assortment' && (
                        <>
                          <td style={{ minWidth: 180 }}>
                            <a
                              href={item.official_registry_url}
                              target="_blank"
                              rel="noreferrer"
                              title="Открыть карточку Росстандарта"
                              style={{ color: 'var(--accent)', fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                            >
                              {item.standard_designation}
                              <ExternalLink size={13} aria-hidden="true" />
                            </a>
                            <div className="muted-cell" style={{ marginTop: 4, fontSize: 12 }}>{item.standard_title}</div>
                          </td>
                          <td>{PRODUCT_FORM_LABELS[item.product_form] || item.product_form}</td>
                          <td style={{ fontWeight: 550, fontVariantNumeric: 'tabular-nums' }}>{item.size_display}</td>
                          <td style={{ fontVariantNumeric: 'tabular-nums' }}>{item.tolerance_display || '—'}</td>
                          <td>{item.length_display || '—'}</td>
                          <td className="muted-cell">{item.quality_display || '—'}</td>
                          <td>
                            <span style={{ fontWeight: 550 }}>{publicSourceText(item.source_clause, 'Пункт не указан')}</span>
                          </td>
                          <td className="text-center">{renderOriginBadge(item)}</td>
                        </>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={emptyColSpan}>
                      <div className="empty-state">
                        {isLoading ? (
                          <span>Загрузка каталога...</span>
                        ) : sourceStatus?.status === 'unavailable' ? (
                          <span>Справочник временно недоступен</span>
                        ) : (
                          <span>Записи в каталоге не найдены</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>}
      </section>
    </div>
  );
}
