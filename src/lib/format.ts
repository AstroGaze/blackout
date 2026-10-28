/** "42 min", "3 h 5 min": how long until `until`, to the nearest minute and at least 1. */
export function formatTimeLeft(until: number, now: number): string {
  const minutes = Math.max(1, Math.round((until - now) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** "today 06:00", "yesterday 21:15" or "Oct 25, 06:00": when something happened, in local time. */
export function formatWhen(at: number, now: number): string {
  const time = new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const day = (ms: number) => new Date(ms).toDateString();
  if (day(at) === day(now)) return `today ${time}`;
  if (day(at) === day(now - 24 * 60 * 60 * 1000)) return `yesterday ${time}`;
  return `${new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}
