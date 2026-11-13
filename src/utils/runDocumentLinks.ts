export function runDocumentLink(runId: string, document: 'estimate' | 'route', anchor?: string) {
  return `/runs/${encodeURIComponent(runId)}/${document}${anchor ? `#${encodeURIComponent(anchor)}` : ''}`;
}
