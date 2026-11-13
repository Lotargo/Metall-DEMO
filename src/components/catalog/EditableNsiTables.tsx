import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileUp,
  History,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  downloadEditableRevisionCsv,
  downloadEditableTableCsv,
  type EditableDiff,
  type EditableNsiRow,
  type EditableTableKey,
  type EditableTableSummary,
  type EditableValidationResult,
  useApplyEditableRows,
  useCompareEditableRevisions,
  useEditableRevisionDetail,
  useEditableRevisionHistory,
  useEditableTable,
  useImportEditableCsv,
  useRestoreEditableDefault,
  useRestoreEditableRevision,
  useValidateEditableCsv,
  useValidateEditableRows,
} from '@/api/hooks/useEditableNsi';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { publicSourceText } from '@/utils/publicSource';
import { NsiRegistryControls } from './NsiRegistryControls';

interface EditableNsiTablesProps {
  tables: EditableTableSummary[];
  isLoading: boolean;
}

type RowField = string;
type PreviewSource = 'ui' | 'csv';

interface RestorePreview {
  revisionId: string;
  revisionNumber: number;
  isDefault: boolean;
  diff: EditableDiff;
}

const SOURCE_LABELS: Record<EditableTableSummary['source'], string> = {
  default_seed: 'исходная версия',
  csv_import: 'загрузка таблицы',
  ui_edit: 'правка в интерфейсе',
  rollback: 'восстановление',
  default_reset: 'возврат исходных значений',
  recovery: 'восстановление из архива',
};

function fieldLabel(field: RowField, table?: EditableTableSummary): string {
  return table?.columns.find((column) => column.field === field)?.header
    ?? 'Параметр';
}

function errorMessage(error: unknown): string {
  return publicSourceText(error instanceof Error ? error.message : '', 'Не удалось выполнить действие. Проверьте введённые значения.');
}

function publicationAuthor(value: string): string {
  return /(?:^system$|^seed$|default[-_]seed|(?:^|[-_])(?:watcher|recovery|import|fixture)(?:$|[-_]))/i.test(value)
    ? 'Система' : publicSourceText(value, 'Автор не указан');
}

function displayValue(value: string | null, field?: string, table?: EditableTableSummary): string {
  if (value === null) return 'н/д';
  const negative = table?.columns.find((column) => column.field === field)?.export_notation === 'negative';
  return `${negative && !value.startsWith('-') ? '-' : ''}${value.replace('.', ',')}`;
}

function canonicalValue(value: string | null): string | null {
  return value === null ? null : value.trim().replace(',', '.');
}

function canonicalRows(rows: EditableNsiRow[]): EditableNsiRow[] {
  return rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([field, value]) => [field, canonicalValue(value)])
  ));
}

function rowsWithNotation(rows: EditableNsiRow[], table?: EditableTableSummary): EditableNsiRow[] {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([field, value]) => {
    const negative = table?.columns.find((column) => column.field === field)?.export_notation === 'negative';
    return [field, negative && value !== null && !value.startsWith('-') ? `-${value}` : value];
  })));
}

function validateRows(
  rows: EditableNsiRow[], table: EditableTableSummary
): Record<string, string> {
  const errors: Record<string, string> = {};
  const numericPattern = /^\d+(?:[.,]\d+)?$/;
  const naturalKeys = new Map<string, number>();
  rows.forEach((row, index) => {
    table.columns.forEach(({ field }) => {
      const value = row[field];
      const column = table.columns.find((item) => item.field === field)!;
      if (value === null) {
        if (!column.allow_not_available) errors[`${index}.${field}`] = 'Значение обязательно';
        return;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        errors[`${index}.${field}`] = 'Заполните значение';
      } else if (!((column.export_notation === 'negative' ? /^-\d+(?:[.,]\d+)?$/ : numericPattern).test(trimmed))) {
        errors[`${index}.${field}`] = column.export_notation === 'negative'
          ? 'Введите отрицательное отклонение со знаком минус'
          : 'Введите неотрицательное число';
      } else if (table.natural_key.includes(field) && Number(trimmed.replace(',', '.')) <= 0) {
        errors[`${index}.${field}`] = 'Значение должно быть больше нуля';
      }
    });
    const key = table.natural_key.map((field) => canonicalValue(row[field])).join('|');
    const previous = naturalKeys.get(key);
    if (previous !== undefined) {
      const firstField = table.natural_key[0];
      errors[`${index}.${firstField}`] = 'Такая комбинация размеров уже есть в таблице';
      errors[`${previous}.${firstField}`] = 'Такая комбинация размеров уже есть в таблице';
    } else {
      naturalKeys.set(key, index);
    }
  });
  return errors;
}

function DiffDetails({ diff, table }: { diff: EditableDiff; table?: EditableTableSummary }) {
  const changed = diff.changed.slice(0, 50);
  return (
    <div className="nsi-diff">
      <div className="nsi-diff-summary">
        <span className="is-added">Добавлено: {diff.summary.added}</span>
        <span className="is-changed">Изменено: {diff.summary.changed}</span>
        <span className="is-removed">Удалено: {diff.summary.removed}</span>
      </div>
      {changed.length > 0 ? (
        <div className="nsi-diff-list">
          {changed.map((item) => (
            <div className="nsi-diff-item" key={item.key.join(':')}>
              <strong>{item.key.map((value, index) => (
                `${table ? fieldLabel(table.natural_key[index], table) : `Ключ ${index + 1}`}: ${value}`
              )).join(' · ')}</strong>
              {Object.entries(item.fields).map(([field, values]) => (
                <span key={field}>
                  {fieldLabel(field, table)}: {displayValue(values.before, field, table)} →{' '}
                  <b>{displayValue(values.after, field, table)}</b>
                </span>
              ))}
            </div>
          ))}
          {diff.changed.length > changed.length ? (
            <div className="nsi-diff-more">Ещё изменений: {diff.changed.length - changed.length}</div>
          ) : null}
        </div>
      ) : null}
      {diff.summary.added || diff.summary.removed ? (
        <p className="nsi-diff-note">
          Полная замена также добавит {diff.summary.added} и удалит {diff.summary.removed} строк.
        </p>
      ) : null}
    </div>
  );
}

export const EditableNsiTables: React.FC<EditableNsiTablesProps> = ({ tables, isLoading }) => {
  const [selectedKey, setSelectedKey] = useState<EditableTableKey>();
  const [isEditing, setIsEditing] = useState(false);
  const [draftRows, setDraftRows] = useState<EditableNsiRow[]>([]);
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string }>();
  const [preview, setPreview] = useState<EditableValidationResult>();
  const [previewSource, setPreviewSource] = useState<PreviewSource>('ui');
  const [pendingCsv, setPendingCsv] = useState<File>();
  const [comment, setComment] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string>();
  const [historyDiff, setHistoryDiff] = useState<EditableDiff>();
  const [restorePreview, setRestorePreview] = useState<RestorePreview>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editingRevisionRef = useRef<string | undefined>(undefined);

  const detailQuery = useEditableTable(selectedKey, isEditing);
  const validateRowsMutation = useValidateEditableRows();
  const applyRowsMutation = useApplyEditableRows();
  const validateCsvMutation = useValidateEditableCsv();
  const importCsvMutation = useImportEditableCsv();
  const historyQuery = useEditableRevisionHistory(selectedKey, historyOpen);
  const revisionDetailQuery = useEditableRevisionDetail(selectedKey, selectedRevisionId);
  const compareMutation = useCompareEditableRevisions();
  const restoreMutation = useRestoreEditableRevision();
  const restoreDefaultMutation = useRestoreEditableDefault();

  const selectedSummary = useMemo(
    () => tables.find((table) => table.table_key === selectedKey),
    [selectedKey, tables]
  );
  const selectedDetail = detailQuery.data?.table_key === selectedKey
    ? detailQuery.data
    : undefined;

  useEffect(() => {
    if (!selectedKey && tables[0]) setSelectedKey(tables[0].table_key);
  }, [selectedKey, tables]);

  useEffect(() => {
    if (!isEditing) setDraftRows(selectedDetail ? rowsWithNotation(selectedDetail.rows, selectedSummary) : []);
  }, [selectedDetail, isEditing, selectedSummary]);

  const startEditing = () => {
    if (!selectedDetail) return;
    editingRevisionRef.current = selectedDetail.active_revision_id;
    setDraftRows(rowsWithNotation(selectedDetail.rows, selectedSummary));
    setCellErrors({});
    setMessage(undefined);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraftRows(rowsWithNotation(selectedDetail?.rows || [], selectedSummary));
    setCellErrors({});
    setIsEditing(false);
  };

  const updateCell = (rowIndex: number, field: RowField, value: string) => {
    setDraftRows((current) => current.map((row, index) => (
      index === rowIndex ? { ...row, [field]: value } : row
    )));
    setCellErrors((current) => {
      const next = { ...current };
      delete next[`${rowIndex}.${field}`];
      return next;
    });
  };

  const prepareUiPreview = async () => {
    if (!selectedKey || !selectedSummary) return;
    const errors = validateRows(draftRows, selectedSummary);
    setCellErrors(errors);
    if (Object.keys(errors).length) {
      setMessage({ kind: 'error', text: 'Исправьте выделенные значения перед проверкой.' });
      return;
    }
    try {
      const result = await validateRowsMutation.mutateAsync({
        tableKey: selectedKey,
        rows: canonicalRows(draftRows),
        expectedRevisionId: editingRevisionRef.current,
      });
      if (!result.diff.summary.added && !result.diff.summary.changed && !result.diff.summary.removed) {
        setMessage({ kind: 'error', text: 'Изменений относительно активной ревизии нет.' });
        return;
      }
      setPreviewSource('ui');
      setPreview(result);
      setComment('');
      setMessage(undefined);
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error) });
    }
  };

  const handleCsvSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedKey) return;
    try {
      const result = await validateCsvMutation.mutateAsync({ tableKey: selectedKey, file });
      setPendingCsv(file);
      setPreviewSource('csv');
      setPreview(result);
      setComment('');
      setMessage(undefined);
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error) });
    }
  };

  const confirmPreview = async () => {
    if (!selectedKey || (!preview && !restorePreview) || !selectedSummary) return;
    try {
      const result = restorePreview
        ? restorePreview.isDefault
          ? await restoreDefaultMutation.mutateAsync({
              tableKey: selectedKey,
              activeRevisionId: selectedSummary.active_revision_id,
              comment,
            })
          : await restoreMutation.mutateAsync({
              tableKey: selectedKey,
              revisionId: restorePreview.revisionId,
              activeRevisionId: selectedSummary.active_revision_id,
              comment,
            })
        : previewSource === 'ui'
        ? await applyRowsMutation.mutateAsync({
            tableKey: selectedKey,
            rows: canonicalRows(draftRows),
            validation: preview!,
            comment,
          })
        : await importCsvMutation.mutateAsync({
            tableKey: selectedKey,
            file: pendingCsv!,
            comment,
          });
      setPreview(undefined);
      setRestorePreview(undefined);
      setPendingCsv(undefined);
      setComment('');
      setIsEditing(false);
      setMessage({
        kind: 'success',
        text: `Ревизия ${result.revision.revision_number} опубликована и используется новыми расчётами.${
          result.warnings.length ? ` ${result.warnings.join(' ')}` : ''
        }`,
      });
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error) });
      setPreview(undefined);
    }
  };

  const compareWithActive = async (revisionId: string) => {
    if (!selectedKey || !selectedSummary) return;
    try {
      const result = await compareMutation.mutateAsync({
        tableKey: selectedKey,
        fromRevisionId: selectedSummary.active_revision_id,
        toRevisionId: revisionId,
      });
      setHistoryDiff(result.diff);
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error) });
    }
  };

  const prepareRestore = async (
    revisionId: string,
    revisionNumber: number,
    isDefault: boolean
  ) => {
    if (!selectedKey || !selectedSummary) return;
    try {
      const result = await compareMutation.mutateAsync({
        tableKey: selectedKey,
        fromRevisionId: selectedSummary.active_revision_id,
        toRevisionId: revisionId,
      });
      if (!result.diff.summary.added && !result.diff.summary.changed && !result.diff.summary.removed
          && !selectedSummary.warnings?.length) {
        setMessage({ kind: 'error', text: 'Выбранная версия совпадает с активной.' });
        return;
      }
      setRestorePreview({ revisionId, revisionNumber, isDefault, diff: result.diff });
      setComment('');
      setHistoryOpen(false);
      setHistoryDiff(undefined);
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error) });
    }
  };

  const changeTable = (tableKey: EditableTableKey) => {
    if (tableKey === selectedKey) return;
    setSelectedKey(tableKey);
    setDraftRows([]);
    setIsEditing(false);
    setCellErrors({});
    setMessage(undefined);
    setHistoryOpen(false);
    setSelectedRevisionId(undefined);
    setHistoryDiff(undefined);
  };

  if (isLoading || (!tables.length && detailQuery.isLoading)) {
    return <div className="empty-state"><span>Загрузка рабочих таблиц...</span></div>;
  }
  if (!tables.length) {
    return <div className="empty-state"><span>Редактируемые таблицы не найдены</span></div>;
  }

  const isBusy = validateRowsMutation.isPending || applyRowsMutation.isPending
    || validateCsvMutation.isPending || importCsvMutation.isPending
    || compareMutation.isPending || restoreMutation.isPending || restoreDefaultMutation.isPending;

  return (
    <div className="editable-nsi">
      <div className="editable-nsi-toolbar">
        <div className="editable-nsi-picker" role="tablist" aria-label="Рабочие таблицы НСИ">
          {tables.map((table) => (
            <button
              key={table.table_key}
              type="button"
              role="tab"
              aria-selected={selectedKey === table.table_key}
              className={selectedKey === table.table_key ? 'is-active' : ''}
              onClick={() => changeTable(table.table_key)}
              disabled={isBusy}
            >
              {publicSourceText(table.title, 'Таблица сортамента')}
              <span>{table.enabled ? `рев. ${table.revision_number}` : 'отключён'}</span>
            </button>
          ))}
        </div>
        <div className="editable-nsi-actions">
          <NsiRegistryControls
            tables={tables}
            selected={selectedSummary}
            busy={isBusy || isEditing}
            onRegistered={changeTable}
            onMessage={(kind, text) => setMessage({ kind, text })}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={handleCsvSelected}
          />
          <Button
            variant="outline"
            size="sm"
            icon={<Download size={14} />}
            disabled={!selectedKey || isBusy}
            onClick={() => selectedKey && downloadEditableTableCsv(selectedKey)}
          >
            Скачать CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<FileUp size={14} />}
            loading={validateCsvMutation.isPending}
            disabled={!selectedKey || isEditing || isBusy}
            onClick={() => fileInputRef.current?.click()}
          >
            Загрузить CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<History size={14} />}
            disabled={!selectedKey || isEditing || isBusy}
            onClick={() => {
              setHistoryOpen(true);
              setSelectedRevisionId(undefined);
              setHistoryDiff(undefined);
            }}
          >
            История версий
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<RotateCcw size={14} />}
            disabled={!selectedSummary || isEditing || isBusy}
            onClick={() => selectedSummary && prepareRestore(
              selectedSummary.default_revision_id,
              1,
              true
            )}
          >
            Вернуть значения из снимка
          </Button>
          {isEditing ? (
            <>
              <Button variant="outline" size="sm" icon={<Plus size={14} />}
                disabled={isBusy || !selectedSummary}
                onClick={() => selectedSummary && setDraftRows((current) => [
                  ...current,
                  Object.fromEntries(selectedSummary.columns.map((column) => [column.field, ''])),
                ])}>
                Строка
              </Button>
              <Button variant="outline" size="sm" icon={<X size={14} />} onClick={cancelEditing} disabled={isBusy}>
                Отмена
              </Button>
              <Button size="sm" icon={<Save size={14} />} loading={validateRowsMutation.isPending} onClick={prepareUiPreview}>
                Проверить и сохранить
              </Button>
            </>
          ) : (
            <Button size="sm" icon={<Pencil size={14} />} onClick={startEditing} disabled={!selectedDetail || isBusy}>
              Редактировать
            </Button>
          )}
        </div>
      </div>

      {selectedSummary ? (
        <div className="editable-nsi-meta">
          <span><strong>Активная ревизия:</strong> {selectedSummary.revision_number}</span>
          <span><strong>Изменена:</strong> {new Date(selectedSummary.created_at_utc).toLocaleString('ru-RU')}</span>
          <span><strong>Автор:</strong> {publicationAuthor(selectedSummary.created_by)}</span>
          <span><strong>Изменение:</strong> {SOURCE_LABELS[selectedSummary.source]}</span>
          <span><strong>Строк:</strong> {selectedSummary.row_count}</span>
        </div>
      ) : null}

      {(selectedSummary?.warnings || []).map((warning) => (
        <div className="nsi-message error" role="status" key={warning}>
          <AlertTriangle size={16} /><span>{publicSourceText(warning, 'Данные требуют проверки.')}</span>
        </div>
      ))}

      {message ? (
        <div className={`nsi-message ${message.kind}`} role="status">
          {message.kind === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{publicSourceText(message.text, 'Данные требуют проверки.')}</span>
        </div>
      ) : null}

      <div className="table-wrap editable-nsi-table-wrap">
        <table className="projects-table editable-nsi-table">
          <thead>
            <tr>
              {(selectedSummary?.columns || []).map(({ field }) => (
                <th key={field}>{fieldLabel(field, selectedSummary)}</th>
              ))}
              {isEditing ? <th className="nsi-row-action-column" aria-label="Действия со строкой" /> : null}
            </tr>
          </thead>
          <tbody>
            {!selectedDetail ? (
              <tr><td colSpan={(selectedSummary?.columns.length || 1) + (isEditing ? 1 : 0)}><div className="empty-state"><span>Загрузка таблицы...</span></div></td></tr>
            ) : draftRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {(selectedSummary?.columns || []).map(({ field }) => {
                  const cellError = cellErrors[`${rowIndex}.${field}`];
                  return (
                    <td key={field} className={cellError ? 'has-error' : ''}>
                      {isEditing ? (
                        <>
                          <input
                            className="nsi-cell-input"
                            value={row[field] === null ? 'н/д' : row[field]}
                            aria-invalid={!!cellError}
                            aria-label={`${fieldLabel(field, selectedSummary)}, строка ${rowIndex + 1}`}
                            onFocus={(event) => {
                              if (row[field] === null) event.currentTarget.select();
                            }}
                            onChange={(event) => updateCell(rowIndex, field, event.target.value)}
                          />
                          {cellError ? <span className="nsi-cell-error">{cellError}</span> : null}
                        </>
                      ) : (
                        <span className={row[field] === null ? 'nsi-not-available' : ''}>
                          {displayValue(row[field])}
                        </span>
                      )}
                    </td>
                  );
                })}
                {isEditing ? (
                  <td className="nsi-row-action-column">
                    <button type="button" title="Удалить строку" aria-label={`Удалить строку ${rowIndex + 1}`}
                      disabled={draftRows.length <= 1 || isBusy}
                      onClick={() => setDraftRows((current) => current.filter((_, index) => index !== rowIndex))}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={historyOpen}
        onClose={() => !isBusy && setHistoryOpen(false)}
        title="История версий"
        description="Восстановление создаёт новую ревизию и не удаляет существующую историю."
        size="xl"
      >
        {historyQuery.isLoading ? (
          <div className="empty-state"><span>Загрузка истории...</span></div>
        ) : (
          <div className="nsi-history-layout">
            <div className="nsi-history-list">
              {historyQuery.data?.map((revision) => (
                <article
                  key={revision.revision_id}
                  className={`nsi-history-item ${revision.is_active ? 'is-active' : ''}`}
                >
                  <div className="nsi-history-heading">
                    <strong>Ревизия {revision.revision_number}</strong>
                    <span>
                      {revision.is_active ? 'активная' : ''}
                      {revision.is_default ? `${revision.is_active ? ' · ' : ''}исходная` : ''}
                    </span>
                  </div>
                  <div className="nsi-history-meta">
                    {new Date(revision.created_at_utc).toLocaleString('ru-RU')} ·{' '}
                    {SOURCE_LABELS[revision.source]} · {publicationAuthor(revision.created_by)}
                  </div>
                  <div className="nsi-history-counts">
                    +{revision.diff_summary.added} / ~{revision.diff_summary.changed} / −{revision.diff_summary.removed}
                    {' · '}{revision.row_count} строк
                  </div>
                  {revision.comment ? <p>{publicSourceText(revision.comment, 'Комментарий к изменению')}</p> : null}
                  <div className="nsi-history-actions">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedRevisionId(revision.revision_id);
                        setHistoryDiff(undefined);
                      }}
                    >
                      Просмотреть
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={revision.is_active || isBusy}
                      onClick={() => compareWithActive(revision.revision_id)}
                    >
                      Сравнить с текущей
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Download size={13} />}
                      onClick={() => selectedKey && downloadEditableRevisionCsv(
                        selectedKey,
                        revision.revision_id,
                        revision.revision_number
                      )}
                    >
                      Скачать CSV
                    </Button>
                    <Button
                      size="sm"
                      icon={<RotateCcw size={13} />}
                      disabled={revision.is_active || isBusy}
                      onClick={() => prepareRestore(
                        revision.revision_id,
                        revision.revision_number,
                        false
                      )}
                    >
                      Восстановить эту версию
                    </Button>
                  </div>
                </article>
              ))}
            </div>
            <div className="nsi-history-preview">
              {historyDiff ? (
                <>
                  <h4>Сравнение с активной ревизией</h4>
                  <DiffDetails diff={historyDiff} table={selectedSummary} />
                </>
              ) : revisionDetailQuery.isLoading ? (
                <div className="empty-state"><span>Загрузка снимка...</span></div>
              ) : revisionDetailQuery.data ? (
                <>
                  <h4>Снимок ревизии {revisionDetailQuery.data.revision_number}</h4>
                  <div className="table-wrap nsi-revision-table-wrap">
                    <table className="projects-table editable-nsi-table">
                      <thead><tr>{(selectedSummary?.columns || []).map(({ field }) => (
                        <th key={field}>{fieldLabel(field, selectedSummary)}</th>
                      ))}</tr></thead>
                      <tbody>{revisionDetailQuery.data.rows.map((row, index) => (
                        <tr key={`${selectedSummary?.natural_key.map((field) => row[field]).join('-')}-${index}`}>
                          {(selectedSummary?.columns || []).map(({ field }) => (
                            <td key={field}>{displayValue(row[field])}</td>
                          ))}
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="empty-state"><span>Выберите «Просмотреть» или «Сравнить»</span></div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!preview || !!restorePreview}
        onClose={() => {
          if (!isBusy) {
            setPreview(undefined);
            setRestorePreview(undefined);
          }
        }}
        title={restorePreview
          ? restorePreview.isDefault
            ? 'Возврат исходных значений'
            : `Восстановление ревизии ${restorePreview.revisionNumber}`
          : previewSource === 'csv'
            ? 'Предварительная проверка CSV'
            : 'Предварительный просмотр изменений'}
        description="Активная ревизия не изменится до явного подтверждения."
        size="xl"
        footer={(
          <>
            <Button variant="outline" onClick={() => {
              setPreview(undefined);
              setRestorePreview(undefined);
            }} disabled={isBusy}>Отмена</Button>
            <Button loading={applyRowsMutation.isPending || importCsvMutation.isPending || restoreMutation.isPending || restoreDefaultMutation.isPending} onClick={confirmPreview}>
              Подтвердить и применить
            </Button>
          </>
        )}
      >
        {preview || restorePreview ? (
          <>
            {(preview?.warnings || []).map((warning) => (
              <div className="nsi-warning" key={warning}><AlertTriangle size={16} />{publicSourceText(warning, 'Данные требуют проверки.')}</div>
            ))}
            <DiffDetails diff={(preview || restorePreview)!.diff} table={selectedSummary} />
            <label className="nsi-comment-label">
              Комментарий к ревизии (необязательно)
              <textarea
                value={comment}
                maxLength={2000}
                rows={3}
                placeholder="Например: уточнено отклонение для размера 15 мм"
                onChange={(event) => setComment(event.target.value)}
              />
            </label>
          </>
        ) : null}
      </Modal>
    </div>
  );
};
