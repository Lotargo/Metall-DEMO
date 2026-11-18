import Markdown from 'react-markdown';
import { createContext, useContext } from 'react';
import { ArrowRight, ArrowUpRight, Download } from 'lucide-react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { engineeringMarkdown } from '@/utils/engineeringMarkdown';
import { chatLink } from '@/utils/orchestratorChat';
import { documentLinkKind } from '@/utils/documentLinks';
import { demoDocumentLink } from '@/demo/config';
import './primitives.css';
import 'katex/dist/katex.min.css';
import './engineering-content.css';

export const EngineeringPrintContext = createContext(false);

export function EngineeringText({ value, literalMarkers = false, sanitize = true }: {
  value: string; literalMarkers?: boolean; sanitize?: boolean;
}) {
  const print = useContext(EngineeringPrintContext);
  const content = engineeringMarkdown(value, { literalMarkers, sanitize, print });
  if (!content.trim()) return null;
  return <div className="engineering-rich-text"><Markdown remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[[rehypeKatex, { strict: 'ignore', trust: false }]]} skipHtml
    components={{
      a: ({ href, children }) => {
        const original = href && chatLink(href);
        if (!original) return <span>{children}</span>;
        const kind = documentLinkKind(original);
        if (print) return kind === 'reference' ? <span>{children}</span> : null;
        const link = demoDocumentLink(original);
        if (!link) return <span>{children}</span>;
        const Icon = kind === 'download' ? Download : kind === 'navigation' ? ArrowRight : ArrowUpRight;
        return <a href={link} className="ui-button ui-button--outline ui-button--size-xs engineering-document-link" data-document-link={kind}
          download={kind === 'download' || undefined} target={kind === 'reference' || /^\/api\//u.test(link) && kind !== 'download' ? '_blank' : undefined} rel="noreferrer">
          <Icon size={14} aria-hidden="true" /><span>{children}</span>
        </a>;
      },
      img: ({ alt }) => alt ? <span>{alt}</span> : null,
    }}>
    {content}
  </Markdown></div>;
}
