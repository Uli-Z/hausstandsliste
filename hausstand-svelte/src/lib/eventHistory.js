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

// Group complete days before pagination. Ordering is inherited from the
// newest event in each group; members retain the original newest-first order.
// A redistribution is one stored parent event, never a list of child events.
export function eventGroupKind(event) {
  if(event.type==='claim-settlement-recorded')
    return 'settlement:' + (['paid','external','waived'].includes(event.settlementKind)?event.settlementKind:'unknown');
  return event.type;
}
export function groupHistoryEvents(events) {
  const groups=new Map();
  for(const event of newestFirst(events)) {
    const kind=eventGroupKind(event);
    const key=JSON.stringify([event.date,kind]);
    if(!groups.has(key)) groups.set(key,{key,date:event.date,kind,type:event.type,events:[]});
    groups.get(key).events.push(event);
  }
  return [...groups.values()].map(group=>{
    const {events,kind,type}=group;
    let totalCents=null;
    const monetary=kind==='settlement:paid'||kind==='settlement:external'||kind==='settlement:waived';
    if(monetary || type==='item-added') {
      const amounts=events.map(e=>monetary?e.amountCents:typeof e.initialValue==='number'?Math.round(e.initialValue*100):NaN);
      const sum=amounts.reduce((a,b)=>a+b,0);
      if(amounts.every(n=>Number.isSafeInteger(n)&&n>=0)&&Number.isSafeInteger(sum)) totalCents=sum;
    }
    return {...group,count:events.length,totalCents};
  });
}
export function groupedHistoryAt(events,asOfDate) {
  const history=splitHistoryAt(events,asOfDate);
  const future=groupHistoryEvents(history.future),past=groupHistoryEvents(history.past);
  return {future,past,recent:past.slice(0,RECENT_HISTORY_LIMIT),futureEventCount:history.future.length,pastEventCount:history.past.length};
}
