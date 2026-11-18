import createClient from 'openapi-fetch';
import type { paths } from './schema';
import { getOperatorProfile } from '@/utils/storage';
import { demoFileFor } from '@/demo/config';

export const apiClient = createClient<paths>({
  baseUrl: '',
});

// Middleware to inject dynamic X-Operator header into every request
apiClient.use({
  async onRequest({ request }) {
    const operator = getOperatorProfile();
    const operatorVal = operator.id || encodeURIComponent(operator.name || 'operator');
    request.headers.set('X-Operator', operatorVal);
    return request;
  },
  async onResponse({ response }) {
    // A restarting API can leave the proxy with an empty HTTP error. openapi-fetch
    // otherwise returns error: undefined, which query hooks mistake for success.
    if (!response.ok && !(await response.clone().text()).trim()) {
      throw new Error(`Сервис временно недоступен (HTTP ${response.status}). Обновите состояние после восстановления соединения.`);
    }
    return response;
  },
});

export function getArtifactUrl(artifactId: string): string {
  const path = `/api/v1/artifacts/${encodeURIComponent(artifactId)}`;
  return demoFileFor(path) ?? path;
}

export function getDrawingPreviewUrl(artifactId: string): string {
  const path = `/api/v1/artifacts/${encodeURIComponent(artifactId)}/preview`;
  return demoFileFor(path) ?? getArtifactUrl(artifactId);
}

export async function downloadFile(url: string, defaultFilename: string): Promise<void> {
  const operator = getOperatorProfile();
  const operatorVal = operator.id || encodeURIComponent(operator.name || 'operator');
  const response = await fetch(url, {
    headers: {
      'X-Operator': operatorVal,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }

  // Extract filename from Content-Disposition header if available
  let filename = defaultFilename;
  const disposition = response.headers.get('Content-Disposition');
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) {
      filename = match[1];
    }
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(downloadUrl);
  document.body.removeChild(a);
}

export function downloadCatalogCsv(
  section: 'materials' | 'standards' = 'materials'
): Promise<void> {
  return downloadFile(
    `/api/v1/nsi/catalog/export.csv?section=${section}`,
    `catalog-${section}.csv`
  );
}
