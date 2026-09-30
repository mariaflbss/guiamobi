/** Formata a data de uma busca: "Hoje, 08:12", "Ontem, 18:45" ou "04/set, 16:22". */
export function formatSearchDate(iso: string, labels: { today: string; yesterday: string }, locale: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);

  if (diffDays === 0) return `${labels.today}, ${time}`;
  if (diffDays === 1) return `${labels.yesterday}, ${time}`;

  const day = date.toLocaleDateString(locale, { day: '2-digit', month: 'short' }).replace('.', '');
  return `${day}, ${time}`;
}

export const LOCALE_BY_LANGUAGE = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' } as const;

/** Soma minutos a um horário "HH:MM" (ex.: addMinutes('14:35', 8) -> '14:43'). */
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
