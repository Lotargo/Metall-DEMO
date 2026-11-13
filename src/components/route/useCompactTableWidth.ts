import { useEffect, useRef, useState } from 'react';

export function useCompactTableWidth(limit: number) {
  const ref = useRef<HTMLElement>(null);
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < limit);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (width > 0) setNarrow(width < limit);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [limit]);
  return { ref, narrow };
}
