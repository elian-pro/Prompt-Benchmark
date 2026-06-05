/** Pure formatting helpers (no DOM/DB). `now` is injectable for testing. */

export function daysBetween(iso: string, now: number = Date.now()): number {
  const then = new Date(iso).getTime();
  return Math.floor((now - then) / 86_400_000);
}

/** Spanish relative time in UPPERCASE, e.g. "HACE 3 DÍAS", "HACE 2 SEMANAS". */
export function relativeTimeEs(iso: string, now: number = Date.now()): string {
  const days = daysBetween(iso, now);
  if (days <= 0) return "HOY";
  if (days === 1) return "HACE 1 DÍA";
  if (days < 7) return `HACE ${days} DÍAS`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "HACE 1 SEMANA" : `HACE ${weeks} SEMANAS`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return months === 1 ? "HACE 1 MES" : `HACE ${months} MESES`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? "HACE 1 AÑO" : `HACE ${years} AÑOS`;
}
