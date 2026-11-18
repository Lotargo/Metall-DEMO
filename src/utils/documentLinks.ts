/** Presentation intent for supported document links, independent of their visible wording. */
export function documentLinkKind(href: string): 'download' | 'navigation' | 'reference' {
  let url: URL;
  try { url = new URL(href, 'https://metall.invalid'); } catch { return 'reference'; }
  if (url.searchParams.get('download') === 'true' || /\.(?:step|stp)$/iu.test(url.pathname)) return 'download';
  if (/^\/(?:api\/v1\/(?:artifacts|runs)|runs)\//u.test(url.pathname) || href.startsWith('#')) return 'navigation';
  return 'reference';
}
