// Q29: presentation-only summaries. Use the existing dated projection and
// stored event participants; do not compute independent ownership or money.
import { projectBeforeEvent } from './projector.js';
export const NAME_LIMIT = 10;
const cmp = (a,b,locale) => String(a.name).localeCompare(String(b.name),locale) || String(a.id).localeCompare(String(b.id),'en');
export function nameEntries(entries, locale='en') {
  return [...entries].sort((a,b)=>cmp(a,b,locale));
}
export function rankedItems(items, locale='en') {
  return [...items].sort((a,b)=>b.value-a.value || cmp(a,b,locale));
}
export function ownerNames(item, locale='en') {
  return nameEntries((item.shareRows || []).filter(r=>r.units>0).map(r=>({id:r.personId,name:r.personName})),locale);
}
function collectPeople(people, locale, addRoles) {
  const names=new Map(people.map(p=>[p.id,p.name]));
  const entries=new Map();
  const add=(id,role,name)=> {
    if (!id) return;
    if (!entries.has(id)) entries.set(id,{id,name:names.get(id)||name||id,roles:[]});
    const entry=entries.get(id);
    if (!entry.roles.includes(role)) entry.roles.push(role);
  };
  addRoles(add);
  return nameEntries([...entries.values()],locale);
}
export function itemPeople(item, fundingEvents, people, locale='en') {
  return collectPeople(people,locale,add=>{
    for(const row of item.shareRows||[]) if(row.units>0) add(row.personId,item.status==='active'?'overview.owner':'overview.formerOwner',row.personName);
    for(const event of fundingEvents) for(const [id,cents] of Object.entries(event.purchaseContributionsCents||{})) if(cents>0) add(id,'overview.funder');
  });
}
export function eventPeople(project,event,locale='en') {
  return collectPeople(project.people||[],locale,add=>{
    if(event.type==='item-added'){
      for(const [id,units] of Object.entries(event.shares||{})) if(units>0) add(id,'overview.owner');
      for(const [id,cents] of Object.entries(event.purchaseContributionsCents||{})) if(cents>0) add(id,'overview.funder');
    }else if(event.type==='item-ended'){
      const before=projectBeforeEvent(project,event.id,event.date).items.find(i=>i.id===event.itemId);
      for(const row of before?.shareRows||[]) if(row.units>0) add(row.personId,'overview.formerOwner',row.personName);
    }
  });
}
export function visibleNames(entries, expanded=false) {
  return {visible:expanded?entries:entries.slice(0,NAME_LIMIT),remaining:Math.max(0,entries.length-NAME_LIMIT)};
}
