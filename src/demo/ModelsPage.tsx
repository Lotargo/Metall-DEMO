import { useEffect, useState } from 'react';
import { ArrowUpRight, Download, Ruler } from 'lucide-react';
import { demoAsset } from './config';
type Model = { slug: string; title: string; subtitle: string; stepBytes: number; dimensions: number; limitations: string[] };
export function ModelsPage() {
  const [models, setModels] = useState<Model[]>(), [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(demoAsset('demo/models.json'), { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('Model list unavailable'); return response.json() as Promise<Model[]>;
    }).then(setModels).catch(error => { if (error.name !== 'AbortError') setFailed(true); });
    return () => controller.abort();
  }, []);
  return <div className="content"><section className="workspace-card">
    <header className="workspace-card-header"><div><h2>Готовые 3D-модели</h2><p>Вращайте деталь, изучайте размеры и разрезы, скачивайте STEP.</p></div></header>
    <div className="demo-model-grid">
      {failed && <p role="alert">Не удалось открыть список моделей. Обновите страницу.</p>}{!models && !failed && <p role="status">Загрузка моделей…</p>}
      {models?.map(model => <article key={model.slug} className="demo-model-card">
        <a className="demo-model-art" href={demoAsset(`models/${model.slug}/viewer.html`)} aria-label={`Открыть 3D: ${model.title}`}><img src={demoAsset(`models/${model.slug}/preview.jpg`)} alt={model.title} loading="lazy" /><span>STEP</span></a>
        <div className="demo-model-body"><h3>{model.title}</h3><p>{model.subtitle}</p><p className="demo-model-meta"><Ruler size={15} aria-hidden="true" />{model.dimensions ? `${model.dimensions} ${new Intl.PluralRules('ru').select(model.dimensions) === 'one' ? 'размерная аннотация' : 'размерных аннотаций'}` : 'Геометрические измерения'} · {Math.round(model.stepBytes / 1024)} КБ</p>
          <div className="demo-model-actions"><a className="primary-action" href={demoAsset(`models/${model.slug}/viewer.html`)}>Открыть модель<ArrowUpRight size={16} aria-hidden="true" /></a><a className="secondary-action" href={demoAsset(`models/${model.slug}/model.step`)} download={`${model.slug}.step`}><Download size={15} aria-hidden="true" />STEP</a></div>
          {model.limitations.length > 0 && <p className="demo-model-note">{model.limitations.join(' ')}</p>}
        </div>
      </article>)}
    </div><p className="demo-model-footer">Модели относятся к самостоятельным примерам. Данные эксцентрикового вала представлены в демонстрационном проекте.</p>
  </section></div>;
}
