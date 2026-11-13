export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(d);
  } catch {
    return dateStr;
  }
}

export function formatStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  const map: Record<string, string> = {
    completed: 'Завершён',
    running: 'Выполняется',
    needs_review: 'Требует проверки',
    queued: 'В очереди',
    processing: 'В обработке',
    review: 'Требует проверки',
    ready: 'Готово',
    failed: 'Ошибка',
    cancelled: 'Отменён',
    draft: 'Черновик',
    in_progress: 'В работе',
    approved: 'Согласован',
    active: 'Активен',
    trashed: 'В корзине',
  };
  return map[status.toLowerCase()] || status;
}
