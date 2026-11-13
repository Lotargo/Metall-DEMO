import type { HTMLAttributes, ReactNode } from 'react';
import './info-block.css';

type Props = Omit<HTMLAttributes<HTMLElement>, 'title'> & { title: ReactNode; children: ReactNode };

export function InfoBlock({ title, children, className, ...props }: Props) {
  return <section {...props} className={['info-block', className].filter(Boolean).join(' ')}>
    <h4 className="info-block-title">{title}</h4>
    <div className="info-block-body">{children}</div>
  </section>;
}
