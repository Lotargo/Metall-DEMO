const sheetLabel = String.raw`(?:страница|стр\.?|лист|[сл]\.)\s*(?:№\s*)?`;
const firstSheet = new RegExp(`^${sheetLabel}1(?=\\s|[;:,.·–—-]|$)\\s*[;:,.·–—-]?\\s*`, 'gimu');
const anotherSheet = new RegExp(`(?:^|[\\s;,(])${sheetLabel}(?:[2-9]|\\d{2,})(?=\\D|$)`, 'iu');

export function passportExplanation(value: string | undefined, pageCount: number | undefined) {
  const source = value?.trim() ?? '';
  if (pageCount !== 1 || hasOtherDrawingPage(source)) return source;
  return source.replace(firstSheet, '').trim();
}

export function hasOtherDrawingPage(value: string) {
  return anotherSheet.test(value);
}
