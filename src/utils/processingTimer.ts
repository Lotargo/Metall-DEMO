const uploadTimerKey = (runId: string) => `metall-upload-start:${runId}`;

export function processingTimestamp(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const timestamp = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

export function rememberUploadStart(runId: string, startedAt: number): void {
  try {
    sessionStorage.setItem(uploadTimerKey(runId), String(startedAt));
  } catch {
    // Server creation time remains available when browser storage is disabled.
  }
}

export function uploadStartedAt(runId: string, serverCreatedAt?: string | null): number | null {
  try {
    const stored = sessionStorage.getItem(uploadTimerKey(runId));
    const timestamp = stored ? processingTimestamp(Number(stored)) : null;
    if (timestamp !== null) return timestamp;
  } catch {
    // Reading the run must also work without browser storage.
  }
  return processingTimestamp(serverCreatedAt);
}

export function formatElapsedTime(milliseconds: number): string {
  const seconds = Number.isFinite(milliseconds) ? Math.max(0, Math.floor(milliseconds / 1000)) : 0;
  const pad = (value: number) => String(value).padStart(2, '0');
  const minutesAndSeconds = `${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
  return seconds >= 3600 ? `${pad(Math.floor(seconds / 3600))}:${minutesAndSeconds}` : minutesAndSeconds;
}
