// Explicit purchase participants: no implicit shares on date or price changes.
export function addPurchaseOwner(shares,id,people) {
  if (!id || Object.hasOwn(shares,id) || !people.some(p=>p.id===id&&p.active!==false)) return shares;
  return {...shares,[id]:1};
}
export function removePurchaseOwner(shares,id) {
  if (!Object.hasOwn(shares,id)) return shares;
  const next={...shares}; delete next[id]; return next;
}
