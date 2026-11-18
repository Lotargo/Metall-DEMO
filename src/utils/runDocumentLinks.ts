export function runDocumentLink(runId: string, document: 'estimate' | 'route', anchor?: string) {
  return `/runs/${encodeURIComponent(runId)}/${document}${anchor ? `#${encodeURIComponent(anchor)}` : ''}`;
}

export function runWorkspaceDocumentLink(runId: string, document: 'estimate' | 'route', pipeline?: string, hash = '') {
  return (pipeline === 'cad_route'
    ? `/runs/${encodeURIComponent(runId)}?tab=${document}`
    : runDocumentLink(runId, document)) + hash;
}
