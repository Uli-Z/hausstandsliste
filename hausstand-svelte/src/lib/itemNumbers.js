// Project-wide immutable identity registry, including removed/undone items.
// The array order of master records is the original acquisition order, not
// the business date or the current inventory sort order.
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
    for (const item of project.items || []) if (item.number !== undefined) remember(item.id,item.number);
  }
  for (const project of projects) {
    for (const item of project?.items || []) {
      if (!ids.has(item.id)) remember(item.id,highest+1);
    }
    // An older event may retain an identity even when its master row is gone.
    for (const event of project?.events || []) {
      for (const row of [event,...(event.events || [])]) {
        if (row.itemId && !ids.has(row.itemId)) remember(row.itemId,highest+1);
      }
    }
  }
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
