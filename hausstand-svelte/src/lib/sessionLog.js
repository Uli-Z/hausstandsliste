// Derive presentation metadata once from an accepted atomic business mutation.
// Keep keys and raw names/amounts, not translated sentences, so locale changes
// also translate earlier session entries. Nothing here is persisted.
import { message, formatMoney } from './i18n.js';
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const label = (key,params={}) => ({key:'sessionLog.'+key,params});
const named = (rows,id) => (rows||[]).find(row=>row.id===id)?.name;
const byId = rows => new Map((rows||[]).map(row=>[row.id,row]));
function changes(before,after) {
  const old = byId(before), next = byId(after);
  return [...new Set([...old.keys(),...next.keys()])].flatMap(id=>{
    const a=old.get(id), b=next.get(id);
    return same(a,b)?[]:[{a,b,kind:!a?'Added':!b?'Deleted':'Edited'}];
  });
}
export function describeSessionChange(before,after) {
  const rows=[];
  const person=id=>named(after.people,id)||named(before.people,id)||id||'—';
  const item=id=>named(after.items,id)||named(before.items,id)||id||'—';
  if(before.community?.name!==after.community?.name)
    rows.push(label('rename',{old:before.community?.name||'—',name:after.community?.name||'—'}));
  const people=changes(before.people,after.people), items=changes(before.items,after.items);
  for(const [type,list] of [['person',people],['item',items],['draft',changes(before.drafts,after.drafts)]])
    for(const {a,b,kind} of list) {
      const value=b||a;
      rows.push(label(type+kind,{name:value.name||value.title||value.data?.name||value.id||'—'}));
    }
  for(const {a,b,kind} of changes(before.events,after.events)) {
    const e=b||a;
    // Creation/deletion of master data already describes the matching event.
    if(e.type==='person-added' && people.some(x=>x.kind===kind&&kind!=='Edited'&&(x.b||x.a).id===e.personId)) continue;
    if(e.type==='item-added' && items.some(x=>x.kind===kind&&kind!=='Edited'&&(x.b||x.a).id===e.itemId)) continue;
    let subject;
    switch(e.type) {
      case 'person-added': subject=label('personEvent',{name:person(e.personId)}); break;
      case 'person-deactivated': subject=label('personArchived',{name:person(e.personId)}); break;
      case 'person-reactivated': subject=label('personRestored',{name:person(e.personId)}); break;
      case 'item-added': subject=label('itemEvent',{name:item(e.itemId)}); break;
      case 'item-ended': subject=label('itemArchived',{name:item(e.itemId)}); break;
      case 'shares-set': subject=label('shares',{name:item(e.itemId)}); break;
      case 'redistribution-executed': subject=label('redistribution',{name:e.title||e.id}); break;
      case 'claim-settlement-recorded':
        subject=label(e.settlementKind==='external'?'external':e.settlementKind==='waived'?'waived':'payment',
          {from:person(e.debtorPersonId),to:person(e.creditorPersonId),amountCents:e.amountCents}); break;
      default: subject=label('unknown');
    }
    // Archive/reactivation already uses a complete action phrase.
    rows.push(kind==='Added'&&['person-deactivated','person-reactivated','item-ended'].includes(e.type)
      ? subject : label('event'+kind,{subject}));
  }
  return rows.length?rows:[label('unknown')];
}
function render(row,locale) {
  const params={...row.params};
  if(params.subject) params.subject=render(params.subject,locale);
  if(Object.hasOwn(params,'amountCents')) params.amount=formatMoney(params.amountCents/100,locale);
  return message(row.key,locale,params);
}
export function sessionChangeText(rows,locale) {
  return (rows||[]).map(row=>render(row,locale)).join(' · ');
}
