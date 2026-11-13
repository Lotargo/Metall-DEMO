import { useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Power, Ruler, Sigma, Trash2 } from 'lucide-react';
import {
  type EditableTableSummary,
  type StockFormulaDocument,
  type StockFormulaRule,
  type StockFormulaBand,
  usePublishStockFormulas,
  useEditableMaterialOptions,
  useRegisterEditableTable,
  useRestoreStockFormulas,
  useSetEditableTableEnabled,
  useStockFormulaDocument,
  useStockFormulaRevisions,
  useValidateStockFormulas,
} from '@/api/hooks/useEditableNsi';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { publicSourceText } from '@/utils/publicSource';

interface Props {
  tables: EditableTableSummary[];
  selected?: EditableTableSummary;
  busy: boolean;
  onRegistered: (key: string) => void;
  onMessage: (kind: 'success' | 'error', text: string) => void;
}

interface FormulaPreview {
  document: StockFormulaDocument;
  baseSha256: string;
  added: string[];
  changed: string[];
  removed: string[];
}

type FormulaDraftBase = Readonly<{ document: StockFormulaDocument; sha256: string }>;
const formulaConflictMessage = 'Правила изменились после начала редактирования. Черновик сохранён. Проверка и публикация заблокированы.';

function compareFormulaRules(before: StockFormulaDocument, after: StockFormulaDocument, baseSha256: string): FormulaPreview {
  const previous = new Map(before.rules.map((rule) => [rule.standard, rule]));
  const current = new Map(after.rules.map((rule) => [rule.standard, rule]));
  return {
    document: after,
    baseSha256,
    added: [...current.keys()].filter((standard) => !previous.has(standard)),
    changed: [...current.keys()].filter((standard) => previous.has(standard)
      && JSON.stringify(previous.get(standard)) !== JSON.stringify(current.get(standard))),
    removed: [...previous.keys()].filter((standard) => !current.has(standard)),
  };
}

const formulaFamilies = {
  bar: { title: 'Пруток', shape_type: 'curvature', shape_unit: 'percent_of_length', shape: 'Кривизна, % длины' },
  sheet: { title: 'Лист', shape_type: 'flatness', shape_unit: 'mm_per_basis', shape: 'Неплоскостность, мм на базовую длину' },
  pipe: { title: 'Труба', shape_type: 'straightness', shape_unit: 'mm_per_basis', shape: 'Прямолинейность, мм на базовую длину' },
} as const;
type BandField = 'outer_upper_bands' | 'wall_lower_bands';

function formulaError(error: unknown): string {
  const text = error instanceof Error ? error.message : '';
  if (/outer_upper|wall_lower|tolerance bands/i.test(text)) return 'Проверьте диапазоны отклонений: границы должны возрастать, последний диапазон — без верхнего предела. Отклонения задаются неотрицательными числами в мм или %.';
  if (/precision_class/i.test(text)) return 'Укажите класс точности длиной до 32 знаков.';
  if (/duplicate.*standard/i.test(text)) return 'Обозначения ГОСТ должны быть уникальными.';
  if (/stock formula|tube formula/i.test(text)) return 'Проверьте обозначение ГОСТ, вид проката и диапазоны отклонений.';
  return publicSourceText(text, 'Не удалось проверить правила. Проверьте введённые значения.');
}

/** Update one engineering rule without projecting or rebuilding its stored fields. */
export function updateStockFormulaRule(document: StockFormulaDocument, index: number, update: (rule: StockFormulaRule) => StockFormulaRule): StockFormulaDocument {
  return { ...document, rules: document.rules.map((rule, current) => current === index ? update(rule) : rule) };
}

export function updateStockFormulaBand(document: StockFormulaDocument, ruleIndex: number, field: BandField, index: number, patch: Partial<StockFormulaBand>): StockFormulaDocument {
  return updateStockFormulaRule(document, ruleIndex, rule => ({
    ...rule, [field]: rule[field].map((band, current) => current === index ? { ...band, ...patch } : band),
  }));
}

/** Keep the entered draft intact; only decimal separators change in the API document. */
export function prepareStockFormulaDocument(document: StockFormulaDocument): StockFormulaDocument {
  const bands = (values: StockFormulaBand[]) => values.map(band => ({
    ...band, through_mm: band.through_mm?.replace(',', '.') ?? null, value: band.value.replace(',', '.'),
  }));
  return { ...document, rules: document.rules.map(rule => ({
    ...rule, outer_upper_bands: bands(rule.outer_upper_bands), wall_lower_bands: bands(rule.wall_lower_bands),
  })) };
}

function freezeFormulaValue<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeFormulaValue);
    Object.freeze(value);
  }
  return value;
}

export function captureStockFormulaBase(current: FormulaDraftBase): FormulaDraftBase {
  return Object.freeze({ document: freezeFormulaValue(structuredClone(current.document)), sha256: current.sha256 });
}

function assertFormulaBaseCurrent(base: FormulaDraftBase, currentSha256: string | undefined) {
  if (!currentSha256) throw new Error('Не удалось подтвердить актуальность правил. Черновик сохранён. Загрузите актуальные правила.');
  if (base.sha256 !== currentSha256) throw new Error(formulaConflictMessage);
}

export function previewStockFormulaDraft(base: FormulaDraftBase, draft: StockFormulaDocument, currentSha256: string | undefined): FormulaPreview {
  assertFormulaBaseCurrent(base, currentSha256);
  return compareFormulaRules(base.document, prepareStockFormulaDocument(draft), base.sha256);
}

export function stockFormulaPublication(base: FormulaDraftBase, preview: FormulaPreview, currentSha256: string | undefined) {
  assertFormulaBaseCurrent(base, currentSha256);
  if (preview.baseSha256 !== base.sha256) throw new Error(formulaConflictMessage);
  return { document: structuredClone(preview.document), expectedSha256: base.sha256 };
}

function formulaRevisionConflict(error: unknown) {
  return error instanceof Error && /changed|conflict|измен|актуальность/i.test(error.message);
}

function FormulaFields({ document, onChange }: { document: StockFormulaDocument; onChange: (document: StockFormulaDocument) => void }) {
  const edit = (index: number, update: (rule: StockFormulaRule) => StockFormulaRule) => onChange(updateStockFormulaRule(document, index, update));
  return <div className="space-y-4">
    {document.rules.map((rule, ruleIndex) => <fieldset className="nsi-registry-form rounded-lg border border-line p-4" key={ruleIndex}>
      <legend className="px-2 font-semibold">{rule.standard || 'Новый стандарт'}</legend>
      <label>Стандарт<input className="ui-input" value={rule.standard} placeholder="ГОСТ 2590-2006" onChange={event => edit(ruleIndex, current => ({ ...current, standard: event.target.value }))} /></label>
      <label>Вид проката<select className="ui-select ui-select--native" value={rule.family} onChange={event => {
        const family = event.target.value as StockFormulaRule['family'];
        const shape = formulaFamilies[family];
        edit(ruleIndex, current => ({ ...current, family, shape_type: shape.shape_type, shape_unit: shape.shape_unit }));
      }}>{Object.entries(formulaFamilies).map(([value, family]) => <option key={value} value={value}>{family.title}</option>)}</select></label>
      <p className="text-sm text-muted">Контроль формы: {formulaFamilies[rule.family].shape}.</p>
      <label>Класс точности<input className="ui-input" value={rule.precision_class ?? ''} placeholder="Не указан" onChange={event => edit(ruleIndex, current => {
        const next = { ...current };
        if (event.target.value) next.precision_class = event.target.value;
        else delete next.precision_class;
        return next;
      })} /></label>
      {(['outer_upper_bands', 'wall_lower_bands'] as const).filter(field => rule.family === 'pipe' || rule[field].length > 0).map(field => <section className="space-y-3" key={field}>
        <h4 className="font-semibold">{field === 'outer_upper_bands' ? 'Верхнее отклонение наружного диаметра' : 'Нижнее отклонение толщины стенки'}</h4>
        {rule.family !== 'pipe' && <p className="text-sm text-warning">Эти диапазоны применимы только к трубам. Для выбранного вида проката удалите их перед публикацией или выберите «Труба».</p>}
        <p className="text-sm text-muted">{field === 'outer_upper_bands' ? 'Δ = D × отклонение / 100 для процентов; для миллиметров Δ равно заданному отклонению.' : 'Модуль отклонения Δ = S × отклонение / 100 для процентов; для миллиметров Δ равно заданному отклонению.'}</p>
        <p className="text-sm text-muted">Каждый диапазон — свыше предыдущей границы до указанной включительно. Пустая последняя граница означает отсутствие верхнего предела.</p>
        {rule[field].length === 0 && <p className="text-sm text-muted">Диапазоны не заданы.</p>}
        {rule[field].map((band, bandIndex) => <div className="nsi-registry-form rounded-md border border-line p-3" key={bandIndex}>
          <label>{field === 'outer_upper_bands' ? 'Диаметр до включительно, мм' : 'Толщина стенки до включительно, мм'}<input className="ui-input" inputMode="decimal" value={band.through_mm ?? ''} placeholder="Без верхней границы" onChange={event => onChange(updateStockFormulaBand(document, ruleIndex, field, bandIndex, { through_mm: event.target.value || null }))} /></label>
          <label>Отклонение<input className="ui-input" inputMode="decimal" value={band.value} onChange={event => onChange(updateStockFormulaBand(document, ruleIndex, field, bandIndex, { value: event.target.value }))} /></label>
          <label>Единица<select className="ui-select ui-select--native" value={band.unit} onChange={event => onChange(updateStockFormulaBand(document, ruleIndex, field, bandIndex, { unit: event.target.value as StockFormulaBand['unit'] }))}><option value="mm">мм</option><option value="percent">%</option></select></label>
          <Button variant="outline" size="sm" icon={<Trash2 size={14} />} onClick={() => edit(ruleIndex, current => ({ ...current, [field]: current[field].filter((_, index) => index !== bandIndex) }))}>Удалить диапазон</Button>
        </div>)}
        {rule.family === 'pipe' && <Button variant="outline" size="sm" icon={<Plus size={14} />} onClick={() => edit(ruleIndex, current => ({ ...current, [field]: [...current[field], { through_mm: null, value: '', unit: 'mm' }] }))}>Добавить диапазон</Button>}
      </section>)}
      <Button variant="outline" size="sm" icon={<Trash2 size={14} />} onClick={() => onChange({ ...document, rules: document.rules.filter((_, index) => index !== ruleIndex) })}>Удалить правило стандарта</Button>
    </fieldset>)}
    <Button variant="outline" size="sm" icon={<Plus size={14} />} onClick={() => onChange({ ...document, rules: [...document.rules, { standard: '', family: 'bar', shape_type: 'curvature', shape_unit: 'percent_of_length', outer_upper_bands: [], wall_lower_bands: [] }] })}>Добавить правило стандарта</Button>
  </div>;
}

export function NsiRegistryControls({ tables, selected, busy, onRegistered, onMessage }: Props) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [activationOpen, setActivationOpen] = useState(false);
  const [formulasOpen, setFormulasOpen] = useState(false);
  const [precisionOpen, setPrecisionOpen] = useState(false);
  const [precisionValue, setPrecisionValue] = useState('');
  const [title, setTitle] = useState('');
  const [tableKey, setTableKey] = useState('');
  const [templateKey, setTemplateKey] = useState('gost-2590-round');
  const [precisionClass, setPrecisionClass] = useState('');
  const [file, setFile] = useState<File>();
  const fileInput = useRef<HTMLInputElement>(null);
  const fileInputId = useId();
  const [materialRefs, setMaterialRefs] = useState<Array<[string, number]>>([]);
  const [formulaDocument, setFormulaDocument] = useState<StockFormulaDocument>();
  const [formulaBase, setFormulaBase] = useState<FormulaDraftBase>();
  const [formulaConflict, setFormulaConflict] = useState(false);
  const [refreshingFormulas, setRefreshingFormulas] = useState(false);
  const [formulaEdited, setFormulaEdited] = useState(false);
  const [formulaPreview, setFormulaPreview] = useState<FormulaPreview>();
  const [restoreSha, setRestoreSha] = useState('');
  const [localError, setLocalError] = useState('');
  const register = useRegisterEditableTable();
  const materials = useEditableMaterialOptions();
  const activate = useSetEditableTableEnabled();
  const formulas = useStockFormulaDocument();
  const formulaHistory = useStockFormulaRevisions(formulasOpen);
  const validateFormulas = useValidateStockFormulas();
  const publish = usePublishStockFormulas();
  const restore = useRestoreStockFormulas();
  const formulaStale = formulaConflict || Boolean(formulaBase && formulas.data && formulaBase.sha256 !== formulas.data.sha256);
  const formulaBusy = validateFormulas.isPending || publish.isPending || restore.isPending || refreshingFormulas;
  const currentFormulaSha = () => queryClient.getQueryData<{ sha256: string }>(['editable-nsi', 'formulas'])?.sha256;

  useEffect(() => {
    if (formulasOpen && formulas.data && (!formulaBase || (!formulaEdited && formulaBase.sha256 !== formulas.data.sha256))) {
      const base = captureStockFormulaBase(formulas.data);
      setFormulaBase(base);
      setFormulaDocument(structuredClone(base.document));
      setFormulaConflict(false);
    }
  }, [formulasOpen, formulas.data, formulaBase, formulaEdited]);

  const reloadFormulaDraft = async () => {
    if (formulaBusy) return;
    setRefreshingFormulas(true);
    try {
      const latest = await formulas.refetch({ throwOnError: true });
      if (!latest.data) throw new Error('Не удалось загрузить актуальные правила. Черновик сохранён.');
      const base = captureStockFormulaBase(latest.data);
      setFormulaBase(base);
      setFormulaDocument(structuredClone(base.document));
      setFormulaEdited(false);
      setFormulaPreview(undefined);
      setFormulaConflict(false);
      setLocalError('');
    } catch {
      setLocalError('Не удалось загрузить актуальные правила. Черновик сохранён. Повторите загрузку.');
    } finally {
      setRefreshingFormulas(false);
    }
  };

  const addStandard = async () => {
    if (!file || !title.trim() || !tableKey.trim()) {
      setLocalError('Укажите обозначение и загрузите полную таблицу.');
      return;
    }
    try {
      const result = await register.mutateAsync({
        tableKey, title, templateKey, precisionClass, materialRefs, file,
      });
      setAddOpen(false);
      setFile(undefined);
      setTitle('');
      setTableKey('');
      setMaterialRefs([]);
      setLocalError('');
      onRegistered(result.table_key);
      onMessage('success', `${result.title} опубликован: ревизия ${result.revision_number}.`);
      if (result.warnings?.length) {
        onMessage('error', `ГОСТ опубликован, но резервная копия требует внимания: ${result.warnings.join('; ')}`);
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  };

  const changeActivation = async () => {
    if (!selected) return;
    try {
      const result = await activate.mutateAsync({
        tableKey: selected.table_key,
        enabled: !selected.enabled,
        expectedActiveRevisionId: selected.active_revision_id,
      });
      setActivationOpen(false);
      onMessage('success', `${result.title}: ${result.enabled ? 'включён' : 'отключён'}.`);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  };

  const reviewFormulas = async () => {
    if (!formulaBase || !formulaDocument || formulaBusy) return;
    try {
      if (formulaStale) throw new Error(formulaConflictMessage);
      const preview = previewStockFormulaDraft(formulaBase, formulaDocument, currentFormulaSha());
      await validateFormulas.mutateAsync(preview.document);
      assertFormulaBaseCurrent(formulaBase, currentFormulaSha());
      if (!preview.added.length && !preview.changed.length && !preview.removed.length) {
        setLocalError('Изменений в правилах нет.');
        return;
      }
      setFormulaPreview(preview);
      setLocalError('');
    } catch (error) {
      if (formulaRevisionConflict(error)) { setFormulaConflict(true); setLocalError(''); }
      else setLocalError(formulaError(error));
    }
  };

  const publishFormulas = async () => {
    if (!formulaBase || !formulaPreview || formulaBusy) return;
    try {
      if (formulaStale) throw new Error(formulaConflictMessage);
      await publish.mutateAsync(stockFormulaPublication(formulaBase, formulaPreview, currentFormulaSha()));
      setFormulaPreview(undefined);
      setFormulasOpen(false);
      setFormulaEdited(false);
      setFormulaBase(undefined);
      setFormulaDocument(undefined);
      setFormulaConflict(false);
      setLocalError('');
      onMessage('success', 'Ревизия формул опубликована.');
    } catch (error) {
      if (formulaRevisionConflict(error)) { setFormulaConflict(true); setLocalError(''); }
      else setLocalError(formulaError(error));
    }
  };

  const publishPrecision = async () => {
    if (!selected || !formulas.data) return;
    const standard = selected.title.match(/ГОСТ\s+\d+-\d+/)?.[0];
    if (!standard) return;
    const document: StockFormulaDocument = {
      ...formulas.data.document,
      rules: formulas.data.document.rules.map((rule) => rule.standard === standard
        ? { ...rule, precision_class: precisionValue.trim() }
        : rule),
    };
    try {
      await publish.mutateAsync({ document, expectedSha256: formulas.data.sha256 });
      setPrecisionOpen(false);
      setLocalError('');
      onMessage('success', `Класс точности ${standard} обновлён.`);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  };

  const restoreFormulas = async () => {
    if (!formulaBase || !restoreSha || formulaBusy) return;
    try {
      if (formulaStale) throw new Error(formulaConflictMessage);
      assertFormulaBaseCurrent(formulaBase, currentFormulaSha());
      await restore.mutateAsync({ sha256: restoreSha, expectedSha256: formulaBase.sha256 });
      setRestoreSha('');
      setLocalError('');
      onMessage('success', 'Прежняя ревизия формул восстановлена.');
    } catch (error) {
      if (formulaRevisionConflict(error)) { setFormulaConflict(true); setLocalError(''); }
      else setLocalError(formulaError(error));
    }
  };

  const formulaConflictNotice = formulaStale && <div className="space-y-3 rounded-md border border-line bg-surface-muted p-3" role="alert">
    <p>{formulaConflictMessage}</p>
    <p>Загрузка актуальных правил заменит черновик; его несохранённые изменения будут потеряны.</p>
    <Button variant="outline" loading={refreshingFormulas} disabled={formulaBusy} onClick={reloadFormulaDraft}>Загрузить актуальные правила</Button>
  </div>;

  return (
    <>
      <Button variant="outline" size="sm" icon={<Plus size={14} />}
        disabled={busy} onClick={() => { if (!tableKey) setTableKey(`gost-${crypto.randomUUID()}`); setLocalError(''); setAddOpen(true); }}>
        Добавить ГОСТ
      </Button>
      <Button variant="outline" size="sm" icon={<Power size={14} />}
        disabled={!selected || busy} onClick={() => { setLocalError(''); setActivationOpen(true); }}>
        {selected?.enabled ? 'Отключить' : 'Включить'}
      </Button>
      <Button variant="outline" size="sm" icon={<Sigma size={14} />}
        disabled={busy} onClick={() => { setLocalError(''); setFormulasOpen(true); }}>
        Формулы
      </Button>
      <Button variant="outline" size="sm" icon={<Ruler size={14} />}
        disabled={!selected || busy || !formulas.data}
        onClick={() => {
          const standard = selected?.title.match(/ГОСТ\s+\d+-\d+/)?.[0];
          const rule = formulas.data?.document.rules.find((item) => item.standard === standard);
          setPrecisionValue(rule?.precision_class || selected?.precision_class || '');
          setLocalError('');
          setPrecisionOpen(true);
        }}>
        Точность
      </Button>

      <Modal isOpen={addOpen} onClose={() => !register.isPending && setAddOpen(false)}
        title="Добавить ГОСТ" size="lg"
        footer={<>
          <Button variant="outline" disabled={register.isPending} onClick={() => setAddOpen(false)}>Отмена</Button>
          <Button loading={register.isPending} onClick={addStandard}>Проверить и опубликовать</Button>
        </>}>
        <div className="nsi-registry-form">
          <label>Обозначение и вид проката
            <input className="ui-input" value={title} onChange={(event) => setTitle(event.target.value)}
              placeholder="Круг ГОСТ 9999-2099" />
          </label>
          <label>Сортамент-образец
            <select className="ui-select ui-select--native" value={templateKey} onChange={(event) => setTemplateKey(event.target.value)}>
              {tables.map((table) => <option key={table.table_key} value={table.table_key}>{publicSourceText(table.title, 'Сортамент-образец')}</option>)}
            </select>
          </label>
          <label>Класс точности
            <input className="ui-input" value={precisionClass} onChange={(event) => setPrecisionClass(event.target.value)}
              placeholder={tables.find((table) => table.table_key === templateKey)?.precision_class || 'В2'} />
          </label>
          <div className="space-y-2">
            <label htmlFor={fileInputId}>Полный CSV</label>
            <input ref={fileInput} id={fileInputId} hidden type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0])} />
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={() => fileInput.current?.click()} aria-label="Выбрать файл CSV" aria-describedby={`${fileInputId}-name`}>Выбрать файл</Button>
              <span id={`${fileInputId}-name`} className="min-w-0 break-all text-sm text-muted" role="status">{file?.name || 'Файл не выбран'}</span>
            </div>
          </div>
          <fieldset className="nsi-material-options">
            <legend>Применимые материалы</legend>
            {materials.isLoading && <p className="text-sm text-muted" role="status">Загрузка материалов…</p>}
            {materials.isError && <p className="text-sm text-warning" role="status">Не удалось загрузить список материалов.</p>}
            {!materials.isLoading && !materials.isError && !materials.data?.length && <p className="text-sm text-muted" role="status">Нет материалов для выбора.</p>}
            {materials.data?.map((material) => {
              const selectedMaterial = materialRefs.some(
                ([id, version]) => id === material.material_id && version === material.record_version
              );
              return <label key={`${material.material_id}:${material.record_version}`}>
                <input type="checkbox" checked={selectedMaterial}
                  onChange={(event) => setMaterialRefs((current) => event.target.checked
                    ? [...current, [material.material_id, material.record_version]]
                    : current.filter(([id, version]) => id !== material.material_id || version !== material.record_version)
                  )} />
                {material.name}
              </label>;
            })}
          </fieldset>
          {localError ? <p className="nsi-registry-error" role="alert">{publicSourceText(localError, 'Проверьте введённые значения.')}</p> : null}
        </div>
      </Modal>

      <Modal isOpen={activationOpen} onClose={() => !activate.isPending && setActivationOpen(false)}
        title={selected?.enabled ? 'Отключить ГОСТ' : 'Включить ГОСТ'}
        footer={<>
          <Button variant="outline" disabled={activate.isPending} onClick={() => setActivationOpen(false)}>Отмена</Button>
          <Button loading={activate.isPending} onClick={changeActivation}>Подтвердить</Button>
        </>}>
        <p>{selected?.title}</p>
        {localError ? <p className="nsi-registry-error" role="alert">{publicSourceText(localError, 'Проверьте введённые значения.')}</p> : null}
      </Modal>

      <Modal isOpen={formulasOpen && !formulaPreview}
        onClose={() => !validateFormulas.isPending && !publish.isPending && !restore.isPending && setFormulasOpen(false)}
        title="Формулы сортамента" size="xl"
        footer={<>
          <Button variant="outline" disabled={publish.isPending || restore.isPending}
            onClick={() => setFormulasOpen(false)}>Закрыть</Button>
          <Button loading={validateFormulas.isPending} disabled={!formulaEdited || !formulas.data || formulaStale || formulaBusy}
            onClick={reviewFormulas}>Проверить изменения</Button>
        </>}>
        <div className="nsi-formula-editor">
          {formulaConflictNotice}
          <p className="nsi-formula-meta">Правил стандартов: {formulaDocument?.rules.length ?? 0}</p>
          {formulaDocument ? <FormulaFields document={formulaDocument} onChange={document => {
            setFormulaDocument(document);
            setFormulaEdited(true);
            setFormulaPreview(undefined);
          }} /> : <p role="status">Загрузка правил…</p>}
          <div className="nsi-formula-history">
            <select aria-label="Прежняя ревизия формул" value={restoreSha}
              onChange={(event) => setRestoreSha(event.target.value)}>
              <option value="">История формул</option>
              {formulaHistory.data?.filter((item) => !item.is_active).map((item, index) => (
                <option key={item.sha256} value={item.sha256}>Сохранённый вариант {index + 1}</option>
              ))}
            </select>
            <Button variant="outline" size="sm" disabled={!restoreSha || formulaStale || formulaBusy}
              loading={restore.isPending} onClick={restoreFormulas}>Восстановить</Button>
          </div>
          {localError ? <p className="nsi-registry-error" role="alert">{publicSourceText(localError, 'Проверьте введённые значения.')}</p> : null}
        </div>
      </Modal>

      <Modal isOpen={Boolean(formulaPreview)} onClose={() => !publish.isPending && setFormulaPreview(undefined)}
        title="Публикация формул" footer={<>
          <Button variant="outline" disabled={publish.isPending}
            onClick={() => setFormulaPreview(undefined)}>Вернуться</Button>
          <Button loading={publish.isPending} disabled={formulaStale || formulaBusy} onClick={publishFormulas}>Подтвердить публикацию</Button>
        </>}>
        <div className="nsi-formula-preview">
          {formulaConflictNotice}
          <p>Добавлено: {formulaPreview?.added.length || 0}</p>
          <p>Изменено: {formulaPreview?.changed.length || 0}</p>
          <p>Удалено: {formulaPreview?.removed.length || 0}</p>
          {formulaPreview?.added.map((standard) => <div key={standard}>+ {standard}</div>)}
          {formulaPreview?.changed.map((standard) => <div key={standard}>~ {standard}</div>)}
          {formulaPreview?.removed.map((standard) => <div key={standard}>− {standard}</div>)}
          {localError ? <p className="nsi-registry-error" role="alert">{publicSourceText(localError, 'Проверьте введённые значения.')}</p> : null}
        </div>
      </Modal>

      <Modal isOpen={precisionOpen} onClose={() => !publish.isPending && setPrecisionOpen(false)}
        title="Класс точности" footer={<>
          <Button variant="outline" disabled={publish.isPending}
            onClick={() => setPrecisionOpen(false)}>Отмена</Button>
          <Button loading={publish.isPending} disabled={!precisionValue.trim()}
            onClick={publishPrecision}>Опубликовать</Button>
        </>}>
        <div className="nsi-registry-form">
          <p>{selected?.title}</p>
          <label>Класс точности
            <input value={precisionValue} onChange={(event) => setPrecisionValue(event.target.value)} />
          </label>
          {localError ? <p className="nsi-registry-error" role="alert">{publicSourceText(localError, 'Проверьте введённые значения.')}</p> : null}
        </div>
      </Modal>
    </>
  );
}
