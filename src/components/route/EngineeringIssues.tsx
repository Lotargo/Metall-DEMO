import { useState } from 'react';
import { CircleCheck, MessageSquare } from 'lucide-react';
import type { EngineeringIssue } from '@/api/hooks/useVolumeRound';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EngineeringText } from '@/components/ui/EngineeringText';
import { operatorSourceText } from './geometryPresentation';
import { DEMO_READ_ONLY, demoFileFor, demoNotice } from '@/demo/config';

export function EngineeringIssues({ issues, runId, revision, sha, source }: {
  issues: EngineeringIssue[]; runId: string; revision?: number; sha?: string; source?: string; onClarify?: () => void;
}) {
  const [preview, setPreview] = useState<{ url: string; caption: string }>();
  const cropUrl = (crop: EngineeringIssue['crops'][number]) => (crop.url && demoFileFor(crop.url)) || `${source ?? `/api/v1/runs/${runId}/cad-route/models/${revision}/view/`}${encodeURIComponent(crop.file)}`;
  return <>
    <ol className="engineering-cards" aria-label="Замечания и решения">{issues.map((issue, index) => {
      const outcome = sha && issue.resolution && issue.applied_step_sha256 === sha ? issue.state : 'open';
      return <li key={issue.id} className="engineering-card">
        <span className="engineering-card-number" aria-hidden="true">{index + 1}</span>
        <div className="engineering-card-copy">
          <p className="engineering-issue-title">{issue.title}</p>
          <EngineeringText value={issue.text} literalMarkers />
          <div className="engineering-issue-crops">{issue.crops.map((crop, i) => <button type="button" key={i} onClick={() => setPreview({ url: cropUrl(crop), caption: crop.caption })} aria-label={`Открыть фрагмент: ${crop.caption}`}>
            <img src={cropUrl(crop)} alt={crop.caption} loading="lazy" /><span>{crop.caption}</span>
          </button>)}</div>
          <p className="engineering-card-source">{operatorSourceText(issue.source)}</p>
          {issue.resolution && <section className="engineering-issue-resolution" data-outcome={outcome} aria-label="Решение по пункту">
            <p className="engineering-issue-outcome">{outcome !== 'open' && <CircleCheck size={19} aria-hidden="true" />}{outcome === 'resolved' ? 'Решено' : outcome === 'provisional' ? 'Принято предварительно' : 'Предложенное решение'}</p>
            <EngineeringText value={issue.resolution.text} literalMarkers />
            <EngineeringText value={issue.resolution.basis} literalMarkers />
          </section>}
          <Button size="sm" variant="outline" disabled={!sha || !revision} icon={<MessageSquare size={14} aria-hidden="true" />} onClick={() => demoNotice(DEMO_READ_ONLY)}>Дать уточнение</Button>
        </div>
      </li>;
    })}</ol>
    <Modal isOpen={!!preview} onClose={() => setPreview(undefined)} title={preview?.caption ?? 'Фрагмент чертежа'} size="xl">
      {preview && <img className="engineering-issue-image" src={preview.url} alt={preview.caption} />}
    </Modal>
  </>;
}
