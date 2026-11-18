import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowUpRight, Building2, Calendar, Layers } from 'lucide-react';
import { useProject } from '@/api/hooks/useProjects';
import { useRuns } from '@/api/hooks/useRuns';
import { formatDateTime, formatStatusLabel } from '@/utils/formatters';

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

const getRunStatusTone = (status?: string): StatusTone => {
  if (status === 'completed' || status === 'ready') return 'success';
  if (status === 'needs_review' || status === 'waiting') return 'warning';
  if (status === 'failed' || status === 'cancelled') return 'danger';
  return 'neutral';
};

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: runs = [], isLoading: runsLoading, isError: runsError, refetch: reloadRuns } = useRuns(projectId);
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

      <section className="workspace-card" aria-labelledby="runs-title">
        <header className="workspace-card-header">
          <div>
            <h3 id="runs-title"><Layers size={16} aria-hidden="true" />История запусков</h3>
            <p>Сохранённые результаты обработки чертежей.</p>
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
                          : <><strong>Запуски отсутствуют</strong><span>Готовый пример доступен с главной страницы.</span></>}
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
}
