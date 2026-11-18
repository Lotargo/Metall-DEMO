export type IssueClarification = { id: string; title: string; runId: string; revision: number; step_sha256: string; crops: { url: string; caption: string }[] };
export const issueClarificationEvent = 'metall:issue-clarification';
export function openIssueClarification(issue: IssueClarification) {
  window.dispatchEvent(new CustomEvent(issueClarificationEvent, { detail: issue }));
}
