import { useEffect, useRef } from 'react';
import type { ProcessingJournal } from '@/api/hooks/useProcessingJournal';

export function ProcessingLogs({ journal }: { journal: ProcessingJournal }) {
  const { rows, connection, retry } = journal;
  const scrollRef = useRef<HTMLOListElement>(null);
  const follow = useRef(true);
  const lastEvent = rows.at(-1)?.key;
  useEffect(() => {
    const element = scrollRef.current;
    if (element && follow.current) element.scrollTop = element.scrollHeight;
  }, [lastEvent]);

  return <section className="processing-logs" aria-label="Журнал обработки">
    <div className="processing-logs-heading">
      <h4>Журнал обработки</h4>
      <span>{connection === 'connected' ? 'Подключён' : connection === 'error' ? 'Связь прервана' : 'Подключаем журнал…'}</span>
    </div>
    {connection === 'error' && <div role="status" className="processing-logs-error">
      <p>Связь с журналом прервана. Полученные события доступны ниже.</p>
      <button type="button" className="text-accent underline" onClick={retry}>Подключить снова</button>
    </div>}
    {rows.length > 0 && <ol ref={scrollRef} className="processing-log-rows" role="log" aria-label="События этапов обработки" aria-live="polite" aria-relevant="additions" tabIndex={0}
      onScroll={event => { const node = event.currentTarget; follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 40; }}>
      {rows.map(row => <li key={row.key} className={row.error ? 'is-error' : undefined}>
        <time dateTime={row.timestamp} title={new Date(row.timestamp).toLocaleString('ru-RU')}>{new Date(row.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
        <div><strong>{row.stage}</strong><p>{row.text}</p></div>
      </li>)}
    </ol>}
    {rows.length === 0 && <p className="processing-logs-empty">{connection === 'connecting' ? 'Загружаем события…' : connection === 'error' ? 'События пока недоступны.' : 'Событий обработки пока нет.'}</p>}
  </section>;
}
