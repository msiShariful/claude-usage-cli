// Date range filter shared by every aggregation command.
// `period` is the named alias (today/week/month/...); since/until override it.
export function filterByPeriod(records, period, { since, until } = {}) {
  if (since || until) {
    const lo = since ?? "0000-00-00";
    const hi = until ?? "9999-99-99";
    return records.filter(r => {
      const d = r.ts.slice(0, 10);
      return d >= lo && d <= hi;
    });
  }

  const now          = new Date();
  const todayStr     = now.toISOString().slice(0, 10);
  const yesterdayStr = new Date(now - 86_400_000).toISOString().slice(0, 10);
  const weekAgo      = new Date(now - 6 * 86_400_000).toISOString().slice(0, 10);
  const monthAgo     = new Date(now - 29 * 86_400_000).toISOString().slice(0, 10);
  switch (period) {
    case "today":     return records.filter(r => r.ts.startsWith(todayStr));
    case "yesterday": return records.filter(r => r.ts.startsWith(yesterdayStr));
    case "week":      return records.filter(r => r.ts.slice(0, 10) >= weekAgo);
    case "month":     return records.filter(r => r.ts.slice(0, 10) >= monthAgo);
    default:          return records;
  }
}

export function periodLabel(period, { since, until } = {}) {
  if (since && until) return `${since} → ${until}`;
  if (since)          return `SINCE ${since}`;
  if (until)          return `UNTIL ${until}`;
  switch (period) {
    case "today":     return "TODAY";
    case "yesterday": return "YESTERDAY";
    case "week":      return "LAST 7 DAYS";
    case "month":     return "LAST 30 DAYS";
    default:          return "ALL TIME";
  }
}
