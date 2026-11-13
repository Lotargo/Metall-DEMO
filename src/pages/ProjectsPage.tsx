import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Building2,
  FolderKanban,
  FolderPlus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import {
  useCreateProject,
  useProjects,
  useRestoreProject,
  useTrashedProjects,
  useTrashProject,
} from '@/api/hooks/useProjects';
import { formatDateTime } from '@/utils/formatters';
import { publicSourceText } from '@/utils/publicSource';

type ProjectStatus = 'draft' | 'in_progress' | 'approved';
type SortField = 'project' | 'status' | 'customer' | 'date';
type SortOrder = 'asc' | 'desc';

const statusMeta: Record<ProjectStatus, { label: string; tone: string }> = {
  draft: { label: 'черновик', tone: 'neutral' },
  in_progress: { label: 'в работе', tone: 'success' },
  approved: { label: 'согласован', tone: 'success' },
};

export const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: projects = [], isLoading, isError } = useProjects();
  const { data: trashedProjects = [] } = useTrashedProjects();
  const createProjectMutation = useCreateProject();
  const trashProjectMutation = useTrashProject();
  const restoreProjectMutation = useRestoreProject();

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'trash'>('active');
  const [sortField, setSortField] = useState<SortField>('project');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newCustomer, setNewCustomer] = useState('');

  const summary = useMemo(() => ({
    total: projects.length,
    inProgress: projects.filter((project) => project.status === 'in_progress').length,
    approved: projects.filter((project) => project.status === 'approved').length,
    needsDetails: projects.filter((project) => !project.customer).length,
  }), [projects]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'date' ? 'desc' : 'asc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={12} className="sort-icon sort-icon-idle" aria-hidden="true" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp size={12} className="sort-icon sort-icon-active" aria-hidden="true" />
    ) : (
      <ArrowDown size={12} className="sort-icon sort-icon-active" aria-hidden="true" />
    );
  };

  const visibleProjects = (activeTab === 'active' ? projects : trashedProjects).filter((project) => {
    const query = search.trim().toLocaleLowerCase('ru');
    if (!query) return true;
    return [project.name, project.customer, String(project.id)]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('ru').includes(query));
  });

  const sortedProjects = useMemo(() => {
    return [...visibleProjects].sort((a, b) => {
      let comparison: number;
      switch (sortField) {
        case 'project': {
          const idA = Number(a.id) || 0;
          const idB = Number(b.id) || 0;
          const nameA = a.name || '';
          const nameB = b.name || '';
          const nameCmp = nameA.localeCompare(nameB, 'ru', { sensitivity: 'base' });
          comparison = nameCmp !== 0 ? nameCmp : idA - idB;
          break;
        }
        case 'status': {
          const statusA = (statusMeta[a.status as ProjectStatus]?.label || a.status || '').toLocaleLowerCase('ru');
          const statusB = (statusMeta[b.status as ProjectStatus]?.label || b.status || '').toLocaleLowerCase('ru');
          comparison = statusA.localeCompare(statusB, 'ru');
          break;
        }
        case 'customer': {
          const custA = (a.customer || '').trim();
          const custB = (b.customer || '').trim();
          if (!custA && !custB) comparison = 0;
          else if (!custA) comparison = 1;
          else if (!custB) comparison = -1;
          else comparison = custA.localeCompare(custB, 'ru', { sensitivity: 'base' });
          break;
        }
        case 'date': {
          const rawA = activeTab === 'trash' ? a.deleted_at : a.created_at;
          const rawB = activeTab === 'trash' ? b.deleted_at : b.created_at;
          const timeA = rawA ? new Date(rawA).getTime() : 0;
          const timeB = rawB ? new Date(rawB).getTime() : 0;
          comparison = timeA - timeB;
          break;
        }
        default:
          comparison = Number(a.id) - Number(b.id);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [visibleProjects, sortField, sortOrder, activeTab]);

  const handleCreateProject = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newProjectName.trim()) return;

    try {
      const created = await createProjectMutation.mutateAsync({
        name: newProjectName.trim(),
        customer: newCustomer.trim() || null,
      });
      setIsCreateModalOpen(false);
      setNewProjectName('');
      setNewCustomer('');
      if (created?.id) navigate(`/projects/${created.id}`);
    } catch (error: unknown) {
      alert(publicSourceText(error instanceof Error ? error.message : String(error), 'Не удалось создать проект. Повторите попытку.'));
    }
  };

  const handleTrashProject = async (projectId: number, event: React.MouseEvent) => {
    event.stopPropagation();
    await trashProjectMutation.mutateAsync({ projectId });
  };

  const handleRestoreProject = async (projectId: number, event: React.MouseEvent) => {
    event.stopPropagation();
    await restoreProjectMutation.mutateAsync(projectId);
  };

  return (
    <div className="content projects-page">
      <section className="page-intro">
        <div>
          <h2>{activeTab === 'trash' ? 'Корзина проектов' : 'Очередь проектов'}</h2>
          <p>
            {activeTab === 'trash'
              ? 'Проекты скрыты из рабочего списка, но их инженерные данные сохранены.'
              : 'Единый рабочий список заказов, документов и технологических расчётов.'}
          </p>
        </div>
        <div className="intro-actions">
          <button className="secondary-action" type="button" onClick={() => setActiveTab(activeTab === 'active' ? 'trash' : 'active')}>
            {activeTab === 'active' ? `Корзина · ${trashedProjects.length}` : '← Рабочий список'}
          </button>
          {activeTab === 'active' && (
            <button className="primary-action" type="button" onClick={() => setIsCreateModalOpen(true)}>
              <FolderPlus size={16} />
              Новый проект
            </button>
          )}
        </div>
      </section>

      {isError && (
        <div className="operator-note" role="alert">
          <strong>Сервис обработки недоступен.</strong> Проверьте подключение к сервису и повторите попытку.
        </div>
      )}

      <section className="stats-grid" aria-label="Сводка по проектам">
        <article className="stat-card">
          <div className="stat-label"><span>Проекты</span><span className="soft-badge">всего</span></div>
          <div className="stat-value">{summary.total}</div>
          <div className="stat-meta">Доступны текущему рабочему месту</div>
        </article>
        <article className="stat-card">
          <div className="stat-label"><span>В работе</span><span className="soft-badge success">активно</span></div>
          <div className="stat-value">{summary.inProgress}</div>
          <div className="stat-meta">Идёт подготовка или расчёт</div>
        </article>
        <article className="stat-card">
          <div className="stat-label"><span>Согласовано</span><span className="soft-badge">готово</span></div>
          <div className="stat-value">{summary.approved}</div>
          <div className="stat-meta">Проекты с подтверждённым статусом</div>
        </article>
        <article className="stat-card">
          <div className="stat-label"><span>Требуют внимания</span><span className="soft-badge warning">проверка</span></div>
          <div className="stat-value">{summary.needsDetails}</div>
          <div className="stat-meta">Не указан заказчик</div>
        </article>
      </section>

      <section className="workspace-card" aria-labelledby="projects-table-title">
        <header className="workspace-card-header">
          <div>
            <h3 id="projects-table-title">{activeTab === 'active' ? 'Рабочий список' : 'Удалённые проекты'}</h3>
            <p>{activeTab === 'active' ? 'Откройте проект, чтобы перейти к документам и запускам.' : 'Любой проект можно вернуть в рабочий список.'}</p>
          </div>
          <span className="soft-badge">рабочие данные</span>
        </header>

        <div className="table-toolbar">
          <label className="table-search-wrap">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Проект, заказчик или код"
              aria-label="Поиск проектов"
            />
          </label>
          <div className="table-tabs" aria-label="Состояние проектов">
            <button className={activeTab === 'active' ? 'is-active' : ''} type="button" onClick={() => setActiveTab('active')}>Активные · {projects.length}</button>
            <button className={activeTab === 'trash' ? 'is-active' : ''} type="button" onClick={() => setActiveTab('trash')}>Корзина · {trashedProjects.length}</button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="projects-table">
            <thead>
              <tr>
                <th className="is-sortable" onClick={() => handleSort('project')} title="Сортировать по проекту">
                  <div className="th-sort-content">
                    <span>Проект</span>
                    {renderSortIcon('project')}
                  </div>
                </th>
                <th className="is-sortable" onClick={() => handleSort('status')} title="Сортировать по статусу">
                  <div className="th-sort-content">
                    <span>Статус</span>
                    {renderSortIcon('status')}
                  </div>
                </th>
                <th className="is-sortable" onClick={() => handleSort('customer')} title="Сортировать по заказчику">
                  <div className="th-sort-content">
                    <span>Заказчик</span>
                    {renderSortIcon('customer')}
                  </div>
                </th>
                <th className="is-sortable" onClick={() => handleSort('date')} title="Сортировать по дате">
                  <div className="th-sort-content">
                    <span>{activeTab === 'active' ? 'Создан' : 'Удалён'}</span>
                    {renderSortIcon('date')}
                  </div>
                </th>
                <th className="action-cell">Действия</th>
              </tr>
            </thead>
            <tbody>
              {sortedProjects.map((project) => {
                const status = statusMeta[project.status as ProjectStatus] || statusMeta.draft;
                return (
                  <tr key={project.id} onClick={() => activeTab === 'active' && navigate(`/projects/${project.id}`)} className={activeTab === 'active' ? 'is-clickable' : ''}>
                    <td>
                      <span className="entity-link">
                        <strong>P-{String(project.id).padStart(4, '0')}</strong>
                        <span>{project.name}</span>
                      </span>
                    </td>
                    <td><span className={`soft-badge ${activeTab === 'trash' ? 'danger' : status.tone}`}>{activeTab === 'trash' ? 'в корзине' : status.label}</span></td>
                    <td><span className="customer-cell"><Building2 size={14} />{project.customer || 'Не указан'}</span></td>
                    <td className="muted-cell date-cell">{formatDateTime(activeTab === 'trash' ? project.deleted_at : project.created_at)}</td>
                    <td className="action-cell">
                      {activeTab === 'active' ? (
                        <div className="row-actions">
                          <button type="button" onClick={(event) => handleTrashProject(project.id, event)} title="В корзину" aria-label="Переместить в корзину"><Trash2 size={15} /></button>
                          <button type="button" onClick={(event) => { event.stopPropagation(); navigate(`/projects/${project.id}`); }} title="Открыть" aria-label="Открыть проект"><ArrowUpRight size={15} /></button>
                        </div>
                      ) : (
                        <button className="restore-action" type="button" onClick={(event) => handleRestoreProject(project.id, event)}><RotateCcw size={14} />Восстановить</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!sortedProjects.length && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <FolderKanban size={30} aria-hidden="true" />
                      <strong>{isLoading ? 'Загрузка проектов…' : activeTab === 'trash' ? 'Корзина пуста' : search ? 'Ничего не найдено' : 'Проектов пока нет'}</strong>
                      {!isLoading && activeTab === 'active' && !search && <span>Создайте первый проект и добавьте в него документы.</span>}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Новый проект"
        description="После создания можно загрузить чертежи и начать автоматическую обработку."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsCreateModalOpen(false)}>Отмена</Button>
            <Button variant="primary" size="sm" onClick={handleCreateProject} loading={createProjectMutation.isPending}>Создать проект</Button>
          </>
        }
      >
        <form onSubmit={handleCreateProject} className="profile-form">
          <Input label="Название проекта" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Например: Валы привода" required autoFocus />
          <Input label="Заказчик" value={newCustomer} onChange={(event) => setNewCustomer(event.target.value)} placeholder="Например: ПАО «Северсталь»" />
        </form>
      </Modal>
    </div>
  );
};
