import type { components } from '@/api/schema';
import { formatNumber, formatText } from '@/utils/compactNumbers';

type State = components['schemas']['CompactState'];
type MaterialProfile = {
  material_id?: string;
  identity?: { grade?: string; material_group?: string };
  physical?: { density_kg_m3?: string | number };
};

export function CompactMaterialSupplySettings({ value }: { value: State }) {
  const grade = value.reading?.material_grade || value.reading?.material.text;
  const evidence = value.material_evidence;
  const profile = value.material_properties.profile as MaterialProfile | undefined;
  const materialId = value.material_properties.resolved_material_id;
  const sameGrade = (requested?: string | null) =>
    !!grade?.trim() && requested?.trim().toLowerCase() === grade.trim().toLowerCase();
  const matched = !!materialId && evidence?.material_id === materialId && sameGrade(evidence.requested_grade);
  const applicableProfile = materialId && profile?.material_id === materialId &&
    (matched || (!evidence && sameGrade(profile?.identity?.grade))) ? profile : null;
  const resolvedGrade = matched ? evidence?.resolved_grade : applicableProfile?.identity?.grade;
  const density = applicableProfile?.physical?.density_kg_m3;

  return <section aria-labelledby="material-physical-title" className="space-y-2 border-t border-line pt-4">
    <h4 id="material-physical-title" className="font-semibold">Данные НСИ для расчёта</h4>
    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
      <dt className="font-medium">Марка в НСИ</dt><dd>{formatText(resolvedGrade)}</dd>
      <dt className="font-medium">Подтверждённая группа</dt><dd>{formatText(applicableProfile?.identity?.material_group)}</dd>
      <dt className="font-medium">Плотность</dt><dd>{density == null ? 'Не определена' : `${formatNumber(density)} кг/м³`}</dd>
    </dl>
  </section>;
}
