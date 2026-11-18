import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, NavLink, useParams, useSearchParams } from 'react-router-dom';
import { apiClient } from '@/api/client';
import { agentSettingsKey as settingsKey, useAgentSettings } from '@/api/hooks/useAgentSettings';
import { CompactLaunchOptions, defaultLaunchOptions } from '@/components/route/CompactLaunchOptions';
import type { components } from '@/api/schema';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { getOperatorProfile, saveOperatorProfile } from '@/utils/storage';
import { publicSourceText } from '@/utils/publicSource';
import './equipment-library.css';

type Settings = components['schemas']['CompactAgentSettings'];
type Model = components['schemas']['CodexModelOption'];
type Choice = components['schemas']['CompactAgentChoice'];
type Role = keyof Settings['roles'];
const modes = [
  { id: 'cad_route', title: 'Построение 3D' },
  { id: 'volume_round', title: 'Маршрут по объёмам' },
  { id: 'compact_round', title: 'Компактный расчёт' },
] as const;
type Pipeline = typeof modes[number]['id'];
const efforts: Record<Choice['reasoning_effort'], string> = {
  minimal: 'Минимальный', low: 'Низкий', medium: 'Средний', high: 'Высокий',
  xhigh: 'Очень высокий', max: 'Максимальный', ultra: 'Предельный',
};

function message(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'detail' in error && typeof error.detail === 'string') return error.detail;
  return fallback;
}

function AgentSettings() {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const pipeline = modes.find(mode => mode.id === params.get('pipeline'))?.id ?? 'cad_route';
  const [draft, setDraft] = useState<Settings>();
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<Role>();
  const [search, setSearch] = useState('');
  const settings = useAgentSettings();
  const roles = useQuery({
    queryKey: ['agent-role-options', pipeline],
    queryFn: async ({ signal }) => {
      const result = await apiClient.GET('/api/v1/settings/agents/roles', { signal, params: { query: { pipeline_mode: pipeline } } });
      if (!result.data) throw new Error('Не удалось загрузить этапы обработки.');
      return result.data;
    },
  });
  const catalog = useQuery({
    queryKey: ['codex-model-catalog'],
    queryFn: async ({ signal }) => {
      const result = await apiClient.GET('/api/v1/settings/agents/models', { signal });
      if (!result.data) throw new Error('Не удалось загрузить список моделей.');
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
  function effectiveChoice(role: Role): Choice | undefined {
    const fallback = roles.data?.find(row => row.role === role)?.fallback_role;
    return value?.roles[role] ?? (fallback ? value?.roles[fallback] : undefined);
  }
  const editingRole = roles.data?.find(row => row.role === editing);
  const choice = editing ? effectiveChoice(editing) : undefined;
  const selected = catalog.data?.find(model => model.model_id === choice?.model_id);
  const modelName = (item?: Choice) => item ? catalog.data?.find(model => model.model_id === item.model_id)?.title ?? 'Сохранённая модель' : 'Профиль запуска';
  const options: Model[] = (catalog.data ?? []).filter(model => (!editingRole?.requires_images || model.supports_images) && model.title.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()));
  function switchPipeline(next: Pipeline) {
    setEditing(undefined);
    setParams(previous => { const result = new URLSearchParams(previous); result.set('pipeline', next); return result; });
  }
  return <section className="workspace-card" aria-labelledby="agent-settings-title">
    <header className="workspace-card-header">
      <div><h3 id="agent-settings-title">Модели и уровни рассуждения</h3>
        <p>Настройки применяются к следующим запускам.</p></div>
      <Button size="sm" variant="outline" loading={catalog.isFetching} onClick={() => void catalog.refetch()}>Обновить модели</Button>
    </header>
    <div className="space-y-4 p-4 sm:p-5">
      {catalog.error && <p role="alert" className="text-sm text-danger">{publicSourceText(catalog.error.message, 'Не удалось загрузить список моделей.')}</p>}
      {settings.error && <div className="space-y-2" role="alert"><p className="text-sm text-danger">{publicSourceText(settings.error.message, 'Не удалось загрузить настройки агентов.')}</p>
        <Button size="sm" variant="outline" onClick={() => void settings.refetch()}>Повторить загрузку</Button></div>}
      {settings.isPending && <p role="status">Загрузка настроек агентов…</p>}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Режим обработки">
        {modes.map(mode => <Button key={mode.id} size="sm" variant={pipeline === mode.id ? 'secondary' : 'outline'} aria-pressed={pipeline === mode.id} onClick={() => switchPipeline(mode.id)}>{mode.title}</Button>)}
      </div>
      {roles.isPending && <p role="status">Загрузка этапов…</p>}
      {roles.error && <div role="alert" className="space-y-2"><p>Не удалось загрузить этапы обработки.</p><Button variant="outline" onClick={() => void roles.refetch()}>Повторить загрузку этапов</Button></div>}
      {value && <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (draft) save.mutate(draft); }}>
        {roles.data && <div className="table-wrap"><table className="equipment-column-table">
          <caption className="sr-only">Модели для этапов выбранного режима обработки</caption>
          <thead><tr><th scope="col">Этап</th><th scope="col">Модель</th><th scope="col">Рассуждение</th><th scope="col"><span className="sr-only">Действия</span></th></tr></thead>
          <tbody>{roles.data.map(row => {
            const item = effectiveChoice(row.role);
            return <tr key={row.role}><th scope="row">{row.title}</th><td>{modelName(item)}</td><td>{item ? efforts[item.reasoning_effort] : 'По умолчанию'}</td><td>
              <Button type="button" size="sm" variant="outline" disabled={save.isPending} aria-label={`Настроить: ${row.title}`} onClick={() => { setSearch(''); setEditing(row.role); }}>Настроить</Button>
            </td></tr>;
          })}</tbody>
        </table></div>}
        {save.error && <p role="alert" className="text-sm text-danger">{publicSourceText(save.error.message, 'Не удалось сохранить настройки агентов.')}</p>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!draft} loading={save.isPending}>Сохранить настройки</Button>
          {draft && <Button type="button" variant="outline" disabled={save.isPending} onClick={() => {
            setDraft(undefined);
            save.reset();
            void settings.refetch();
          }}>Сбросить черновик</Button>}
        </div>
      </form>}
    </div>
    <Modal isOpen={!!editingRole && !!value} onClose={() => setEditing(undefined)} title={editingRole?.title ?? 'Настройка модели'} size="lg" footer={<Button onClick={() => setEditing(undefined)}>Готово</Button>}>
      {editingRole && <div className="space-y-5">
        <Input label="Найти модель" value={search} onChange={event => setSearch(event.target.value)} type="search" />
        <div className="space-y-2" role="group" aria-label="Выбор модели">
          <Button variant={!value?.roles[editingRole.role] ? 'secondary' : 'outline'} aria-pressed={!value?.roles[editingRole.role]} onClick={() => change(editingRole.role)}>По умолчанию</Button>
          <div className="grid gap-2 sm:grid-cols-2">{options.map(model => <Button key={model.model_id} variant={choice?.model_id === model.model_id ? 'secondary' : 'outline'} aria-pressed={choice?.model_id === model.model_id} onClick={() => change(editingRole.role, { model_id: model.model_id, reasoning_effort: model.default_effort })}>{model.title}</Button>)}</div>
          {catalog.isPending && <p role="status">Загрузка моделей…</p>}
          {!options.length && !catalog.isPending && <p>Подходящих моделей не найдено.</p>}
        </div>
        {selected && choice && <div className="space-y-2"><h4 className="font-semibold">Уровень рассуждения</h4><div className="flex flex-wrap gap-2" role="group" aria-label="Уровень рассуждения">{selected.reasoning_efforts.map(effort => <Button key={effort} size="sm" variant={choice.reasoning_effort === effort ? 'secondary' : 'outline'} aria-pressed={choice.reasoning_effort === effort} onClick={() => change(editingRole.role, { model_id: selected.model_id, reasoning_effort: effort })}>{efforts[effort]}</Button>)}</div></div>}
      </div>}
    </Modal>
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
      <h3 id="launch-settings-title">Запуск компактного расчёта</h3>
      <p>Перепроверка и решение вопросов по умолчанию для компактного режима.</p>
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
          {draft && <Button type="button" variant="outline" disabled={save.isPending} onClick={() => { setDraft(undefined); save.reset(); void settings.refetch(); }}>Сбросить черновик</Button>}
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
