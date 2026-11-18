import { operatorText } from '@/components/route/geometryPresentation';
import { chatLink } from './orchestratorChat';
import { documentLinkKind } from './documentLinks';

export function engineeringMarkdown(value: string, { literalMarkers = false, sanitize = true, print = false } = {}) {
  const links: string[] = [];
  // Keep usable links while applying the same reader-facing text cleanup.
  const protectedText = value.replace(/\[([^\]\n]+)\]\(([^\s)]+)\)/g, (link, label: string, target: string) => {
    const visible = sanitize ? operatorText(label, '') || (chatLink(target) ? 'Открыть документ' : '') : label;
    if (!visible) return '';
    if (print) return documentLinkKind(target) === 'reference' ? visible : '';
    links.push(sanitize ? `[${visible}](${target})` : link);
    return `\uE000${links.length - 1}\uE001`;
  });
  let text = sanitize ? operatorText(protectedText, '') : protectedText;
  text = text.replace(/\uE000(\d+)\uE001/g, (_match, index: string) => links[Number(index)] ?? '')
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `$$\n${math}\n$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, math: string) => `$${math}$`);
  const tokens = text.split(/(```[\s\S]*?```|`[^`\n]+`|\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\*\*(?=\S)(?:[^*]|\*(?!\*))+?\*\*|\*(?=\S)[^*\n]+?\*)/g);
  return tokens.map((part, index) => {
    if (index % 2) return part;
    let result = part;
    if (literalMarkers) {
      // Drawing note numbers and reference stars are source notation, not list markup.
      result = result.replace(/^(\s*)(\*+)(\s*)$/u, (_match, before: string, stars: string, after: string) => before + stars.replace(/\*/g, '\\*') + after)
        .replace(/^(\s*\d+)\.(?=\s)/u, '$1\\.')
        .replace(/^(\s*(?:\d+\\\.\s*)?)(\*{1,2})(?=\s)/u, (_match, prefix: string, stars: string) => prefix + stars.replace(/\*/g, '\\*'))
        .replace(/(\d)(\*{1,2})(?=\s|[.,;:]|$)/gu, (_match, number: string, stars: string) => number + stars.replace(/\*/g, '\\*'));
    }
    // Format an already symbolic tolerance; retain the exact numerator spelling.
    return result.replace(/±\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\/\s*(\d+)/gu,
      (_match, numerator: string, denominator: string) => `$\\pm \\frac{\\mathrm{${numerator.replace(/_/g, '\\_')}}}{${denominator}}$`);
  }).join('');
}
