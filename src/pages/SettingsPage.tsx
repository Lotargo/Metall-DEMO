import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, NavLink, useParams } from 'react-router-dom';
import { apiClient } from '@/api/client';
import { agentSettingsKey as settingsKey, useAgentSettings } from '@/api/hooks/useAgentSettings';
import { CompactLaunchOptions, defaultLaunchOptions } from '@/components/route/CompactLaunchOptions';
import type { components } from '@/api/schema';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { getOperatorProfile, saveOperatorProfile } from '@/utils/storage';
import { publicSourceText } from '@/utils/publicSource';

type Settings = components['schemas']['CompactAgentSettings'];
type Model = components['schemas']['CodexModelOption'];
type Choice = components['schemas']['CompactAgentChoice'];
type Role = keyof Settings['roles'];
const roleRows = [
  { role: 'reading', label: 'Чтение чертежа', images: true },
  { role: 'verify', label: 'Перепроверка', images: true },
  { role: 'verify_repair', label: 'Исправление связей', images: true },
  { role: 'clarifications', label: 'Решение вопросов', images: true },
  { role: 'planning', label: 'Предварительная карта', images: false },
  { role: 'detailing', label: 'Детализация', images: false },
] as const;
const efforts: Record<Choice['reasoning_effort'], string> = {
  minimal: 'Минимальный', low: 'Низкий', medium: 'Средний', high: 'Высокий',
  xhigh: 'Очень высокий', max: 'Максимальный', ultra: 'Ultra',
};

function message(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'detail' in error && typeof error.detail === 'string') return error.detail;
  return fallback;
}

function AgentSettings() {
  const client = useQueryClient();
  const [draft, setDraft] = useState<Settings>();
  const [notice, setNotice] = useState('');
  const settings = useAgentSettings();
  const catalog = useQuery({
    queryKey: ['codex-model-catalog'],
    queryFn: async ({ signal }) => {
      const result = await apiClient.GET('/api/v1/settings/agents/models', { signal });
      if (!result.data) throw new Error(message(result.error, 'Не удалось прочитать список Codex.'));
      return result.data;
    },
  });
  const save = useMutation({
    mutationFn: async (value: Settings) => {
      const result = await apiClient.PUT('/api/v1/settings/agents', {
        body: { expected_revision: value.revision, roles: value.roles, launch: value.launch },
      });
      if (!result.data) throw new Error(message(result.error, 'Не удалось сохранить настройки агентов.'));
      return result.data;
    },
    onSuccess: data => {
      client.setQueryData(settingsKey, data);
      setDraft(undefined);
      setNotice('Настройки агентов сохранены.');
    },
  });
  const value = draft ?? settings.data;
  function change(role: Role, choice?: Choice) {
    if (!value) return;
    const roles = { ...value.roles };
    if (choice) roles[role] = choice;
    else delete roles[role];
    setDraft({ ...value, roles });
    setNotice('');
    save.reset();
  }
  function modelOptions(images: boolean): Model[] {
    return (catalog.data ?? []).filter(model => !images || model.supports_images);
  }
  return <section className="workspace-card" aria-labelledby="agent-settings-title">
    <header className="workspace-card-header">
      <div><h3 id="agent-settings-title">Модели и уровни рассуждения</h3>
        <p>Новые настройки действуют со следующей загрузки чертежа или отдельного запуска карты и детализации.</p></div>
      <Button size="sm" variant="outline" loading={catalog.isFetching} onClick={() => void catalog.refetch()}>Обновить список Codex</Button>
    </header>
    <div className="space-y-4 p-4 sm:p-5">
      {catalog.error && <p role="alert" className="text-sm text-danger">{publicSourceText(catalog.error.message, 'Не удалось загрузить список моделей.')}</p>}
      {settings.error && <div className="space-y-2" role="alert"><p className="text-sm text-danger">{publicSourceText(settings.error.message, 'Не удалось загрузить настройки агентов.')}</p>
        <Button size="sm" variant="outline" onClick={() => void settings.refetch()}>Повторить загрузку</Button></div>}
      {settings.isPending && <p role="status">Загрузка настроек агентов…</p>}
      {value && <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (draft) save.mutate(draft); }}>
        <p className="text-sm text-muted">Показана конфигурация сохранённого примера. В демо настройки сохраняются только в этом браузере.</p>
        <fieldset className="space-y-3" disabled={save.isPending}>
          <legend className="sr-only">Этапы обработки</legend>
          {roleRows.map(({ role, label, images }) => {
            const choice = value.roles[role];
            const options = modelOptions(images);
            const selected = options.find(model => model.model_id === choice?.model_id);
            const fallback = choice && !selected ? [{ value: choice.model_id, label: `${choice.model_id} · сохранённая модель` }] : [];
            const supportedEfforts = selected?.reasoning_efforts ?? [];
            const effortOptions = choice && !supportedEfforts.includes(choice.reasoning_effort)
              ? [...supportedEfforts, choice.reasoning_effort] : supportedEfforts;
            return <div key={role} className="grid items-start gap-3 rounded-md border border-line bg-canvas p-3 sm:grid-cols-[minmax(9rem,1fr)_minmax(0,1.5fr)_minmax(0,1fr)]">
              <h4 className="font-semibold sm:self-center">{label}</h4>
              <Select label={`Модель · ${label}`} value={choice?.model_id ?? ''}
                options={[{ value: '', label: 'По умолчанию' }, ...fallback, ...options.map(model => ({ value: model.model_id, label: model.title }))]}
                onChange={event => {
                  const model = options.find(option => option.model_id === event.target.value);
                  change(role, model ? { model_id: model.model_id, reasoning_effort: model.default_effort } : undefined);
                }} />
              <Select label={`Рассуждение · ${label}`} value={choice?.reasoning_effort ?? ''} disabled={!selected}
                options={choice ? effortOptions.map(effort => ({ value: effort, label: efforts[effort] })) : [{ value: '', label: 'По умолчанию' }]}
                onChange={event => {
                  const effort = supportedEfforts.find(item => item === event.target.value);
                  if (selected && effort) change(role, { model_id: selected.model_id, reasoning_effort: effort });
                }} />
            </div>;
          })}
        </fieldset>
        {save.error && <p role="alert" className="text-sm text-danger">{publicSourceText(save.error.message, 'Не удалось сохранить настройки агентов.')}</p>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!draft} loading={save.isPending}>Сохранить настройки</Button>
          {draft && <Button variant="outline" disabled={save.isPending} onClick={() => {
            setDraft(undefined);
            save.reset();
            void settings.refetch();
          }}>Сбросить черновик</Button>}
        </div>
      </form>}
    </div>
  </section>;
}

function LaunchSettings() {
  const settings = useAgentSettings();
  const client = useQueryClient();
  const [draft, setDraft] = useState<Settings>();
  const [notice, setNotice] = useState('');
  const save = useMutation({
    mutationFn: async (value: Settings) => {
      const result = await apiClient.PUT('/api/v1/settings/agents', {
        body: { expected_revision: value.revision, roles: value.roles, launch: value.launch },
      });
      if (!result.data) throw new Error(message(result.error, 'Не удалось сохранить параметры запуска.'));
      return result.data;
    },
    onSuccess: value => {
      client.setQueryData(settingsKey, value);
      setDraft(undefined);
      setNotice('Параметры запуска сохранены.');
    },
  });
  const value = draft ?? settings.data;
  return <section className="workspace-card" aria-labelledby="launch-settings-title">
    <header className="workspace-card-header"><div>
      <h3 id="launch-settings-title">Настройки запуска</h3>
      <p>Параметры по умолчанию для новых загрузок. На странице проекта можно выбрать режим отдельного запуска.</p>
    </div></header>
    <div className="space-y-4 p-4 sm:p-5">
      {settings.isPending && <p role="status">Загрузка настроек…</p>}
      {settings.error && <div role="alert" className="space-y-2"><p>{publicSourceText(settings.error.message, 'Не удалось загрузить настройки запуска.')}</p><Button variant="outline" onClick={() => void settings.refetch()}>Повторить загрузку</Button></div>}
      {value && <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (draft) save.mutate(draft); }}>
        <CompactLaunchOptions value={value.launch ?? defaultLaunchOptions} disabled={save.isPending} onChange={launch => {
          setDraft({ ...value, launch }); setNotice(''); save.reset();
        }} />
        {save.error && <p role="alert" className="text-sm text-danger">{publicSourceText(save.error.message, 'Не удалось сохранить настройки запуска.')}</p>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!draft} loading={save.isPending}>Сохранить настройки запуска</Button>
          {draft && <Button variant="outline" disabled={save.isPending} onClick={() => { setDraft(undefined); save.reset(); void settings.refetch(); }}>Сбросить черновик</Button>}
        </div>
      </form>}
    </div>
  </section>;
}

function ProfileSettings() {
  const [profile, setProfile] = useState(getOperatorProfile);
  const [status, setStatus] = useState<'saved' | 'error'>();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = { ...profile, name: profile.name.trim(), organization: profile.organization.trim(),
      workstation: profile.workstation.trim() || 'WS-01' };
    if (!saved.name || !saveOperatorProfile(saved)) { setStatus('error'); return; }
    setProfile(saved);
    setStatus('saved');
  }
  return <section className="workspace-card" aria-labelledby="operator-settings-title">
    <header className="workspace-card-header">
      <div><h3 id="operator-settings-title">Профиль оператора</h3><p>Реквизиты рабочего места хранятся в этом браузере.</p></div>
    </header>
    <form onSubmit={submit} className="max-w-lg space-y-4 p-4 sm:p-5" onChange={() => setStatus(undefined)}>
      <Input label="Имя оператора" value={profile.name} maxLength={128} required onChange={event => setProfile({ ...profile, name: event.target.value })} />
      <Input label="Организация" value={profile.organization} maxLength={160} onChange={event => setProfile({ ...profile, organization: event.target.value })} />
      <Input label="Идентификатор рабочей станции" value={profile.workstation} maxLength={64} onChange={event => setProfile({ ...profile, workstation: event.target.value })} />
      {status === 'error' && <p role="alert" className="text-sm text-danger">Не удалось сохранить профиль. Проверьте имя и доступ к хранилищу браузера.</p>}
      {status === 'saved' && <p role="status" className="text-sm">Профиль сохранён.</p>}
      <Button type="submit">Сохранить профиль</Button>
    </form>
  </section>;
}

export function SettingsPage() {
  const { section } = useParams();
  if (section !== 'agents' && section !== 'profile' && section !== 'launch') return <Navigate to="/settings/agents" replace />;
  return <div className="content max-w-5xl space-y-4">
    <nav aria-label="Разделы настроек" className="page-section-nav flex flex-wrap gap-2">
      <NavLink className={({ isActive }) => isActive ? 'primary-action' : 'secondary-action'} to="/settings/agents">Агенты</NavLink>
      <NavLink className={({ isActive }) => isActive ? 'primary-action' : 'secondary-action'} to="/settings/launch">Запуск</NavLink>
      <NavLink className={({ isActive }) => isActive ? 'primary-action' : 'secondary-action'} to="/settings/profile">Профиль оператора</NavLink>
    </nav>
    {section === 'agents' ? <AgentSettings /> : section === 'launch' ? <LaunchSettings /> : <ProfileSettings />}
  </div>;
}
