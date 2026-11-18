import type { GeometryDimension } from '@/api/hooks/useVolumeRound';
import { formatNumber, measurementLabel } from './geometryPresentation';

export function GeometryMeasurementValue({ row, inlineUnit = false }: { row: GeometryDimension; inlineUnit?: boolean }) {
  if (row.value == null) return <>{measurementLabel(row)}</>;
  return <>{row.prefix}{formatNumber(row.value)}{inlineUnit ? ` ${row.unit}` : <small>{row.unit}</small>}
    {row.representation === 'conditional' && <small>Условно</small>}
    {row.assumption && row.representation !== 'conditional' && <small>Принято для модели</small>}
  </>;
}
