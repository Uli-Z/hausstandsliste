// Project-wide immutable identity registry, including removed/undone items.
// Existing unnumbered items are migrated by their dated item-added event.
// Already assigned numbers never change, including after a backdated purchase.
const valid = n => Number.isSafeInteger(n) && n > 0;
const fail = () => { throw new Error('INVALID_ITEM_NUMBER_REGISTRY'); };

export function collectItemNumbers(projects) {
  const ids = new Map(), used = new Map();
  let highest = 0;
  const remember = (id,number) => {
    if (typeof id !== 'string' || !id || !valid(number)) fail();
    if ((ids.has(id) && ids.get(id)!==number) || (used.has(number) && used.get(number)!==id)) fail();
    ids.set(id,number); used.set(number,id); highest=Math.max(highest,number);
  };
  for (const project of projects) {
    if (!project) continue;
    if (project.itemNumberRegistry !== undefined && !Array.isArray(project.itemNumberRegistry)) fail();
    for (const row of project.itemNumberRegistry || []) remember(row?.id,row?.number);
    const itemIds=new Set();
    for (const item of project.items || []) {
      if (typeof item?.id !== 'string' || !item.id || itemIds.has(item.id)) fail();
      itemIds.add(item.id);
      if (item.number !== undefined) remember(item.id,item.number);
    }
  }
  const candidates=new Map(), creation=new Map();
  const candidate=id=>{
    if (typeof id !== 'string' || !id) fail();
    if (!candidates.has(id)) candidates.set(id,candidates.size);
  };
  const compareText=(a,b)=>a<b?-1:a>b?1:0;
  const compareCreation=(a,b)=>compareText(a.date,b.date)||a.order-b.order||compareText(a.eventId,b.eventId);
  for (const project of projects) {
    for (const item of project?.items || []) candidate(item.id);
    const dated=new Map();
    for (const event of project?.events || []) {
      for (const row of [event,...(event.events || [])]) {
        if (row.itemId) candidate(row.itemId);
      }
      if (event.type!=='item-added' || !event.itemId ||
          typeof event.date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(event.date) ||
          !Number.isFinite(Date.parse(event.date))) continue;
      const key={date:event.date,order:Number.isSafeInteger(event.order)?event.order:0,eventId:String(event.id||'')};
      if (!dated.has(event.itemId)||compareCreation(key,dated.get(event.itemId))<0) dated.set(event.itemId,key);
    }
    // Later snapshots/current working copy take precedence for corrected dates.
    for (const [id,key] of dated) creation.set(id,key);
  }
  const pending=[...candidates.keys()].filter(id=>!ids.has(id));
  pending.sort((a,b)=>{
    const x=creation.get(a),y=creation.get(b);
    if (x&&y) return compareCreation(x,y)||compareText(a,b);
    if (x||y) return x?-1:1;
    // No recorded creation date: retain stable first appearance, never guess.
    return candidates.get(a)-candidates.get(b)||compareText(a,b);
  });
  for (const id of pending) remember(id,highest+1);
  return [...ids].map(([id,number])=>({id,number})).sort((a,b)=>a.number-b.number);
}
export function applyItemNumbers(project, registry=collectItemNumbers([project])) {
  const byId = new Map(registry.map(row=>[row.id,row.number]));
  const result = {...project,items:(project.items || []).map(item=>({...item,number:byId.get(item.id)}))};
  if (registry.length || project.itemNumberRegistry !== undefined) result.itemNumberRegistry=registry.map(row=>({...row}));
  return result;
}
export function nextItemNumber(project,id) {
  const rows=collectItemNumbers([project]);
  if (rows.some(row=>row.id===id)) fail();
  const number=(rows.at(-1)?.number || 0)+1;
  if (!valid(number)) fail();
  return [...rows,{id,number}];
}
// Saved baseline must not inherit numbers from later unsaved allocations.
export function alignSavedItemNumbers(saved, current) {
  if (!saved) return saved;
  const ids=new Set(collectItemNumbers([saved]).map(row=>row.id));
  const rows=collectItemNumbers([current]).filter(row=>ids.has(row.id));
  // Only legacy unnumbered identities need alignment; numbered snapshots
  // retain their own complete registry, including previously removed IDs.
  if (saved.itemNumberRegistry) return applyItemNumbers(saved);
  return applyItemNumbers(saved,rows);
}
export function itemNumberMutationProblem(before,after) {
  try {
    const old=collectItemNumbers([before]);
    const current=collectItemNumbers([after]);
    const actual=new Map(current.map(row=>[row.id,row.number]));
    if (old.some(row=>actual.get(row.id)!==row.number)) return true;
    const highest=old.at(-1)?.number || 0;
    const existing=new Set(old.map(row=>row.id));
    if (current.some(row=>!existing.has(row.id)&&row.number<=highest)) return true;
    // Once numbered, callers must preserve the number explicitly.
    if ((after.itemNumberRegistry || []).length && after.items.some(item=>!valid(item.number))) return true;
    return false;
  } catch { return true; }
}
