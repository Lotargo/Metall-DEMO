import React, { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Calendar,
  Circle,
  FileCheck,
  FileText,
  Info,
  Layers,
  ListOrdered,
  Play,
  SlidersHorizontal,
  UploadCloud,
} from 'lucide-react';
import { Input, Select } from '@/components/ui/Input';
import { CompactLaunchOptions, defaultLaunchOptions, type LaunchOptions } from '@/components/route/CompactLaunchOptions';
import { useAgentSettings } from '@/api/hooks/useAgentSettings';
import { CompactRecognitionProgress } from '@/components/trace/CompactRecognitionProgress';
import { rememberUploadStart } from '@/utils/processingTimer';
import { useProject } from '@/api/hooks/useProjects';
import {
  useProviders,
  useRuns,
  useStartRecognition,
} from '@/api/hooks/useRuns';
import { formatDateTime, formatStatusLabel } from '@/utils/formatters';
import { publicSourceText } from '@/utils/publicSource';
import { DEMO_RUN_PATH, demoAsset } from '@/demo/config';

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

const getRunStatusTone = (status?: string): StatusTone => {
  if (status === 'completed' || status === 'ready') return 'success';
  if (status === 'needs_review') return 'warning';
  if (status === 'failed' || status === 'cancelled') return 'danger';
  return 'neutral';
};

export const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: runs = [], isLoading: runsLoading, isError: runsError, refetch: reloadRuns } = useRuns(projectId);
  const { data: providers = [] } = useProviders();
  const startRecognitionMutation = useStartRecognition();
  const launchSettings = useAgentSettings();
  const [launchDraft, setLaunchDraft] = useState<LaunchOptions>();
  const launchOptions = launchDraft ?? (launchSettings.data ? launchSettings.data.launch ?? defaultLaunchOptions : undefined);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedModel, setSelectedModel] = useState('');
  const [quantityDraft, setQuantityDraft] = useState('');
  const quantity = quantityDraft.trim() ? Number(quantityDraft) : undefined;
  const quantityError = quantity !== undefined && (!Number.isSafeInteger(quantity) || quantity <= 0)
    ? 'Укажите положительное целое количество деталей.' : undefined;
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStarted, setUploadStarted] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (providers.length === 0 || selectedModel) return;
    const activeProvider = providers.find((provider) => provider.active) || providers[0];
    if (activeProvider) setSelectedModel(activeProvider.name);
  }, [providers, selectedModel]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleStartRecognition = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedFile || !projectId || !launchOptions || quantityError || startRecognitionMutation.isPending) return;

    const startedAt = Date.now();
    setUploadStarted(startedAt);
    setUploadError('');

    try {
      const result = await startRecognitionMutation.mutateAsync({
        file: selectedFile,
        projectId,
        modelId: selectedModel || undefined,
        launchOptions,
        quantity,
      });
      rememberUploadStart(result.run_id, startedAt);
      setSelectedFile(null);
      navigate(`/runs/${result.run_id}`);
    } catch (error: unknown) {
      setUploadError(error instanceof Error ? error.message : String(error));
    }
  };

  if (projectLoading) {
    return <div className="content page-state">Загрузка проекта…</div>;
  }

  if (!project) {
    return (
      <div className="content page-state page-state--error">
        <AlertCircle size={34} />
        <strong>Проект не найден</strong>
        <Link to="/projects">Вернуться к списку проектов</Link>
      </div>
    );
  }

  const modelOptions = providers.map((provider) => {
    let modelTitle = provider.default_model || provider.name;
    if (modelTitle === 'gemini-3.8-flash') modelTitle = 'Gemini 3.8 Flash';
    else if (modelTitle === 'gemini-2.5-flash') modelTitle = 'Gemini 2.5 Flash';
    else if (modelTitle === 'gemini-2.5-pro') modelTitle = 'Gemini 2.5 Pro';

    return {
      value: provider.name,
      label: modelTitle,
    };
  });

  return (
    <div className="content project-detail-page">
      <section className="project-heading">
        <Link to="/projects" className="back-button" title="Все проекты" aria-label="Вернуться к проектам">
          <ArrowLeft size={17} />
        </Link>
        <div>
          <div className="project-title-row">
            <span className="project-code">P-{String(project.id).padStart(4, '0')}</span>
            <h2>{project.name}</h2>
          </div>
          <div className="project-meta">
            <span><Building2 size={14} />Заказчик: {project.customer || 'Не указан'}</span>
            <span><Calendar size={14} />Создан: {formatDateTime(project.created_at)}</span>
          </div>
        </div>
      </section>

      <section className="workspace-card demo-example-card" aria-labelledby="demo-example-title">
        <header className="workspace-card-header"><div><h3 id="demo-example-title">Готовый пример: вал эксцентриковый</h3>
          <p>Чертёж, технический паспорт, девять операций и смета изготовления. Результат уже подготовлен.</p></div></header>
        <div className="demo-example-actions"><Link to={DEMO_RUN_PATH} className="primary-action">Открыть результат<ArrowUpRight size={16} aria-hidden="true" /></Link>
          <a className="secondary-action" href={demoAsset('demo/drawing.pdf')} download="Вал эксцентриковый.pdf">Скачать чертёж</a></div>
      </section>
      <section className="workspace-card upload-card" aria-labelledby="upload-title">
        <header className="workspace-card-header">
          <div>
            <h3 id="upload-title"><UploadCloud size={16} />Обработка чертежа</h3>
            <p>В демо доступен сохранённый пример выше. Обработка собственных чертежей доступна в полной версии.</p>
          </div>
          {startRecognitionMutation.isPending && <CompactRecognitionProgress uploadStart={uploadStarted} />}
        </header>
        <form onSubmit={handleStartRecognition} className="upload-form">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            onChange={handleFileChange}
            hidden
          />
          <button
            type="button"
            className={`drop-zone ${isDragging ? 'is-dragging' : ''} ${selectedFile ? 'has-file' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {selectedFile ? <FileCheck size={34} /> : <UploadCloud size={34} />}
            <strong>{selectedFile ? selectedFile.name : 'Перетащите чертёж сюда или нажмите для выбора'}</strong>
            <span>
              {selectedFile
                ? `${(selectedFile.size / 1024).toFixed(1)} КБ · нажмите для выбора другого файла`
                : 'PDF, PNG, JPG или WEBP · до 50 МБ'}
            </span>
          </button>

          <div className="recognition-controls">
            <div className="recognition-setup">
              <div className="recognition-profile">
                <div className="recognition-section-title">
                  <SlidersHorizontal size={16} aria-hidden="true" />
                  Настройки обработки
                </div>
                <Select
                  label="Модель ИИ по умолчанию"
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.target.value)}
                  options={modelOptions.length > 0 ? modelOptions : [{ value: '', label: 'Модель по умолчанию' }]}
                  helperText="Используется для ролей без индивидуальной настройки."
                />
                <Link className="text-sm text-accent underline" to="/settings/agents">Настроить модели агентов</Link>
                <Input
                  label="Количество деталей"
                  type="number"
                  min={1}
                  step={1}
                  value={quantityDraft}
                  onChange={event => setQuantityDraft(event.target.value)}
                  disabled={startRecognitionMutation.isPending}
                  error={quantityError}
                  helperText="Необязательно. Оставьте пустым, если количество заказа пока неизвестно."
                  placeholder="Не задано"
                />
                {launchOptions && <CompactLaunchOptions value={launchOptions} onChange={setLaunchDraft} disabled={startRecognitionMutation.isPending} />}
                {launchSettings.isPending && <p role="status" className="text-sm text-muted">Загрузка параметров запуска…</p>}
                {launchSettings.error && <div role="alert" className="space-y-2 text-sm text-danger"><p>{publicSourceText(launchSettings.error.message, 'Не удалось загрузить параметры запуска.')}</p><button type="button" className="secondary-action" onClick={() => void launchSettings.refetch()}>Повторить загрузку</button></div>}
                <Link className="text-sm text-accent underline" to="/settings/launch">Параметры запуска по умолчанию</Link>
              </div>
              <div className="recognition-results">
                <p className="recognition-section-title">Результат обработки</p>
                <ul className="recognition-result-list">
                  <li>
                    <FileText size={19} aria-hidden="true" />
                    <div><strong>Паспорт детали</strong><span>Размеры и требования</span></div>
                  </li>
                  <li>
                    <Circle size={19} aria-hidden="true" />
                    <div><strong>Подбор заготовки</strong><span>Круглый прокат</span></div>
                  </li>
                  <li>
                    <ListOrdered size={19} aria-hidden="true" />
                    <div><strong>{launchOptions?.auto_resolve_questions ? 'Полный маршрут и смета' : 'Предварительная карта'}</strong><span>{launchOptions?.auto_resolve_questions ? 'Детализация и расчёт стоимости' : 'Последовательность операций'}</span></div>
                  </li>
                </ul>
              </div>
            </div>
            <div className="recognition-action">
              <p className="recognition-note" id="recognition-note">
                <Info size={17} aria-hidden="true" />
                <span>{launchOptions?.auto_resolve_questions ? 'Агент решает вопросы, обработка автоматически продолжается до сметы.' : 'Подробный расчёт запускается отдельно, после проверки подготовленных данных.'}</span>
              </p>
              <div className="recognition-launch">
                <button className="primary-action recognition-submit" type="submit" aria-describedby="recognition-note recognition-launch-hint" disabled={!selectedFile || !launchOptions || !!quantityError || startRecognitionMutation.isPending}>
                  <Play size={16} aria-hidden="true" />
                  {startRecognitionMutation.isPending ? 'Запуск…' : launchOptions?.auto_resolve_questions ? 'Рассчитать до сметы' : 'Подготовить паспорт и карту'}
                </button>
                <p className="recognition-launch-hint" id="recognition-launch-hint" aria-live="polite">
                  {startRecognitionMutation.isPending ? 'Отправляем чертёж на обработку'
                    : selectedFile ? 'Чертёж выбран. Всё готово к запуску' : 'Выберите чертёж, чтобы начать'}
                </p>
              </div>
            </div>
          </div>
          {uploadError && <p role="alert" className="text-sm text-danger break-words">{publicSourceText(uploadError, 'Не удалось запустить обработку. Проверьте чертёж и повторите попытку.')}</p>}
        </form>
      </section>

      <section className="workspace-card" aria-labelledby="runs-title">
        <header className="workspace-card-header">
          <div>
            <h3 id="runs-title"><Layers size={16} aria-hidden="true" />История запусков</h3>
            <p>Все обработки чертежей в рамках текущего проекта.</p>
          </div>
          {!runsLoading && !runsError && <span className="soft-badge">Запусков: {runs.length}</span>}
        </header>
        <div className="table-wrap">
          <table className="projects-table runs-table">
            <thead>
              <tr>
                <th scope="col">Чертёж</th>
                <th scope="col">Статус</th>
                <th scope="col">Время запуска</th>
                <th scope="col" className="action-cell">Действия</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="is-clickable" onClick={() => navigate(`/runs/${run.id}`)}>
                  <th scope="row" className="font-medium">{run.document_id || 'Чертёж без названия'}</th>
                  <td><span className={`soft-badge ${getRunStatusTone(run.status)}`}>{formatStatusLabel(run.status)}</span></td>
                  <td className="muted-cell date-cell">{formatDateTime(run.created_at)}</td>
                  <td className="action-cell">
                    <Link className="row-open-action" to={`/runs/${run.id}`}
                      aria-label={`Открыть обработку: ${run.document_id || 'Чертёж без названия'}, ${formatDateTime(run.created_at)}`} onClick={event => event.stopPropagation()}>
                      Открыть <ArrowUpRight size={14} aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">
                      <Layers size={28} aria-hidden="true" />
                      {runsError ? <><strong role="alert">Не удалось загрузить историю</strong>
                        <button className="secondary-action" type="button" onClick={() => void reloadRuns()}>Повторить загрузку</button></>
                        : runsLoading ? <strong role="status">Загрузка истории…</strong>
                          : <><strong>Запуски отсутствуют</strong><span>Загрузите чертёж для начала обработки.</span></>}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
