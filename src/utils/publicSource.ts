/** Reader-facing provenance. Stored evidence and exports retain the original text. */
export function publicSourceText(value: unknown, fallback = 'Расчётное основание'): string {
  if (value == null) return fallback;
  let original = String(value).trim();
  if (!original) return fallback;
  if (/^(?:\{\s*"|\[\s*\{\s*")/u.test(original) || /^(?:\{\s*\}|\[\s*\])$/u.test(original)) {
    try {
      const parsed: unknown = JSON.parse(original);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const error = parsed as { detail?: unknown; message?: unknown };
        const detail = error.detail ?? error.message;
        if (typeof detail === 'string') original = detail;
        else if (Array.isArray(detail)) original = detail.flatMap(item => item && typeof item === 'object' && 'msg' in item && typeof item.msg === 'string' ? [item.msg] : []).join('; ');
        else return fallback;
      } else return fallback;
    } catch { return fallback; }
  }
  return original
    .replace(/\bTEST\b/gu, 'Расчётный пример')
    .replace(/\b[a-z][a-z\d._:-]*@(\d{4})-(\d{2})-(\d{2})[a-z\d._-]*(?:#[\da-f]{8,64})?/giu, 'Редакция от $3.$2.$1')
    .replace(/["'](?:[A-Z]:[\\/]|file:\/\/)[^"'\r\n]+["']/giu, '')
    .replace(/\bfile:\/\/[^\s<>"')]+/giu, '')
    .replace(/https?:\/\/[^\s<>"')]+/giu, '')
    .replace(/[A-Z]:[\\/][^<>"'\r\n;|]*?\.(?:db|sqlite3?|csv|md|py|go|tsx?|jsx?|jsonl?|ya?ml|zip|png|jpe?g|pdf|txt|log|html|xml|docx|xlsx|pptx)\b(?::\d+)?/giu, '')
    .replace(/(?:[A-Z]:[\\/]|\\\\|\b(?:mvp|docs|web|src|library|scripts|machining-calc|stock-selection)[\\/]|\.(?:temp|data)[\\/])[^\s<>"')]+/giu, '')
    .replace(/(?:^|\s)\/(?:home|Users|tmp|var|opt|workspace|workspaces|mnt|projects)\/[^\s<>"')]+/gu, ' ')
    .replace(/\b(?:GET|POST|PUT|PATCH|DELETE)?\s*\/api\/v\d+\/[^\s<>"')]+/giu, '')
    .replace(/[\p{L}\p{N}_.()-]+\.(?:db|sqlite3?|csv|md|py|go|tsx?|jsx?|jsonl?|ya?ml|zip|png|jpe?g|pdf|txt|log|html|xml|docx|xlsx|pptx)\b/giu, '')
    .replace(/\b[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\b/giu, '')
    .replace(/\bsha-?256\s*[:=#]?\s*[\da-f]{8,64}\b/giu, '')
    .replace(/\b[\da-f]{32,64}\b/giu, '')
    .replace(/\b(?:[a-z][a-z\d_]*(?:[.-][a-z\d_-]+)+|machcalc|reserve|spindle|feed|time)\/\d+(?:\.\d+)*\b/giu, '')
    .replace(/\b(?:sha-?256|schema_version|profile_id|method_id|source_id|run_id)\s*[:=]?\s*/giu, '')
    .replace(/\b(?:op|work|profile|machine-card|machcalc|artifact):[a-z\d._:@#/-]+/giu, '')
    .replace(/\b(?:cq|ct)_[a-z\d_-]+\b/giu, '')
    .replace(/(?<![\p{L}\p{N}_])(?:строка|строки|строку|абзац)\s+\d+(?:\s*[-–—]\s*\d+)?(?!\d|[.,]\d|\s*[%–—-])/giu,
      locator => /ГОСТ|табл(?:ица|иц[еы]|[.])/iu.test(original) ? locator : '')
    .replace(/\(\s*[,;:#/.\-–—\s]*\)/gu, '')
    .replace(/\s*([,;])(?:\s*\1)+/gu, '$1')
    .replace(/^[\s,;:#/·.\-–—]+|[\s,;:#/·\-–—]+$/gu, '')
    .replace(/[ \t]{2,}/gu, ' ')
    .trim() || fallback;
}

/** Useful public document links; local artefacts keep their dedicated viewer. */
export function publicSourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined;
    if (/\/(?:docs\/(?:0[123]-|agents)|mvp\/src|\.temp\/)/iu.test(url.pathname)) return undefined;
    if (!url.hostname.includes('.') || /^(?:localhost|127\.|0\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(url.hostname) || url.hostname.endsWith('.local')) return undefined;
    return url.href;
  } catch { return undefined; }
}
