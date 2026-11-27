// Presentation order only; ownership and ledger replay remain oldest-first.
export function newestFirst(events) {
  return [...(events || [])]
    .map((event, index) => ({ event, index }))
    .sort((a, b) =>
      String(b.event.date || '').localeCompare(String(a.event.date || '')) ||
      (b.event.order ?? 0) - (a.event.order ?? 0) ||
      b.index - a.index)
    .map(row => row.event);
}

export function splitHistoryAt(events, asOfDate) {
  const sorted = newestFirst(events);
  return {
    future: sorted.filter(event => event.date > asOfDate),
    past: sorted.filter(event => event.date <= asOfDate)
  };
}

// The dashboard is the first page of the exact same as-of history, not a
// separately sorted list. A grouped redistribution occupies one event slot.
export const RECENT_HISTORY_LIMIT = 10;
export function recentHistoryAt(events, asOfDate) {
  const history = splitHistoryAt(events, asOfDate);
  return { ...history, recent: history.past.slice(0, RECENT_HISTORY_LIMIT) };
}
