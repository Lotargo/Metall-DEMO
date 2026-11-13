import { runDocumentLink } from './runDocumentLinks';

export function calculationRateLink(runId: string, machineId?: string) {
  const params = new URLSearchParams({ run: runId });
  if (machineId) params.set('machine', machineId);
  return `/calculation-settings/rates?${params}`;
}

export function configuratorRatesLink(runId?: string) {
  const params = new URLSearchParams({ section: 'rates' });
  if (runId) params.set('run', runId);
  return `/equipment-configurator?${params}`;
}

export const estimateTimeNormsAnchor = 'estimate-time-norms';
export const estimateDocumentsAnchor = 'estimate-documents';
export const barLengthsSettingsPath = '/calculation-settings/bar-lengths';
export const cutNormsSettingsPath = '/calculation-settings/cut-norms';

export function calculationDocumentsLink(runId: string) {
  return `/calculation-settings/documents?${new URLSearchParams({ run: runId })}`;
}

export function calculationTimeNormsLink(runId: string) {
  return `/calculation-settings/time-norms?${new URLSearchParams({ run: runId })}`;
}


export function compactPanelLink(runId: string, tab: string, anchor?: string) {
  if (tab === 'estimate' || tab === 'full-route') return runDocumentLink(runId, tab === 'estimate' ? 'estimate' : 'route', anchor);
  return `/runs/${encodeURIComponent(runId)}?${new URLSearchParams({ tab })}${anchor ? `#${encodeURIComponent(anchor)}` : ''}`;
}

export function estimateRateAnchor(machineId: string) {
  return `estimate-rate-${machineId}`;
}
