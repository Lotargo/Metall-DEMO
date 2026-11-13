import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  count?: number | string;
  icon?: React.ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  variant?: 'underline' | 'pills';
  layout?: 'scroll' | 'wrap';
  id?: string;
  'aria-label'?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  items, activeId, onChange, className, variant = 'underline', layout = 'scroll', id,
  'aria-label': label = 'Разделы',
}) => {
  const generatedId = useId();
  const tablistId = id || generatedId;
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const shell = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ overflow: false, left: false, right: false });

  const measure = useCallback(() => {
    const list = viewport.current;
    if (!list || !shell.current) return;
    const style = getComputedStyle(shell.current);
    const availableWidth = shell.current.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const next = {
      overflow: layout === 'scroll' && list.scrollWidth > availableWidth + 1,
      left: layout === 'scroll' && list.scrollLeft > 1,
      right: layout === 'scroll' && list.scrollLeft + list.clientWidth < list.scrollWidth - 1,
    };
    setScrollState(previous => previous.overflow === next.overflow && previous.left === next.left && previous.right === next.right ? previous : next);
  }, [layout]);

  const revealActive = useCallback(() => {
    if (layout === 'wrap') return;
    const list = viewport.current;
    const button = list?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    if (!list || !button) return;
    const left = button.offsetLeft;
    const right = left + button.offsetWidth;
    if (left < list.scrollLeft) list.scrollLeft = left;
    else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth;
    measure();
  }, [layout, measure]);

  useEffect(() => {
    const list = viewport.current;
    if (!list) return;
    const observer = new ResizeObserver(() => { measure(); revealActive(); });
    observer.observe(list);
    if (shell.current) observer.observe(shell.current);
    for (const button of buttons.current.values()) observer.observe(button);
    measure();
    return () => observer.disconnect();
  }, [items.length, measure, revealActive]);

  useEffect(() => {
    revealActive();
  }, [activeId, revealActive]);

  const handleKey = (event: React.KeyboardEvent, index: number) => {
    let next: number;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (event.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else return;
    event.preventDefault();
    const nextId = items[next].id;
    onChange(nextId);
    buttons.current.get(nextId)?.focus();
  };

  return (
    <div ref={shell} className={twMerge('ui-tabs-shell', scrollState.overflow && 'has-overflow', `ui-tabs--${variant}`, `ui-tabs--${layout}`, className)}>
      <button type="button" className="ui-tab-scroll" aria-label="Предыдущие разделы" hidden={!scrollState.overflow}
        disabled={!scrollState.left} onClick={() => viewport.current?.scrollBy({ left: -viewport.current.clientWidth * 0.8, behavior: 'smooth' })}>
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <div ref={viewport} role="tablist" aria-label={label} className="ui-tabs" onScroll={measure}>
      {items.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`${tablistId}-tab-${tab.id}`}
          aria-controls={`${tablistId}-panel-${tab.id}`}
          aria-selected={tab.id === activeId}
          tabIndex={tab.id === activeId ? 0 : -1}
          ref={(element) => { if (element) buttons.current.set(tab.id, element); else buttons.current.delete(tab.id); }}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => handleKey(event, index)}
          className="ui-tab"
        >
          {tab.icon && <span className="ui-tab-icon" aria-hidden="true">{tab.icon}</span>}
          <span className="ui-tab-label">{tab.label}</span>
          {tab.count !== undefined && <span className="ui-tab-count">{tab.count}</span>}
        </button>
      ))}
      </div>
      <button type="button" className="ui-tab-scroll" aria-label="Следующие разделы" hidden={!scrollState.overflow}
        disabled={!scrollState.right} onClick={() => viewport.current?.scrollBy({ left: viewport.current.clientWidth * 0.8, behavior: 'smooth' })}>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
  );
};
