/** "42 min", "3 h 5 min": how long until `until`, to the nearest minute and at least 1. */
export function formatTimeLeft(until: number, now: number): string {
  const minutes = Math.max(1, Math.round((until - now) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
