import { projectAt } from './projector.js';
import { ledgerAt } from './ledger.js';
import { personalReport } from './personalReport.js';
import { itemDisplayName } from './itemNames.js';
import { valueAtCents } from './valuation.js';

const sum = rows => rows.reduce((a,r)=>({
  initial:a.initial+r.initial, depreciation:a.depreciation+r.depreciation,
  remaining:a.remaining+r.remaining, endValue:a.endValue+r.endValue
}),{initial:0,depreciation:0,remaining:0,endValue:0});

// All report amounts are cents from the existing dated ownership/ledger
// projections. Inventory totals refer to the ACTIVE stock, not cash paid.
export function householdReport(project, asOfDate, createdDate) {
  const projection=projectAt(project,asOfDate), ledger=ledgerAt(project,asOfDate);
  let incomplete=!!(projection.warnings.length || ledger.warnings.length);
  const rowFor=(item,active)=>{
    const rt=item.runtime;
    const initial=Math.round(rt.initialValue*100);
    const value=active?item.valueCents:rt.endedAt?valueAtCents(rt.valuation,rt.initialValue,rt.date,rt.endedAt):null;
    if(value===null)incomplete=true;
    return {id:item.id,name:itemDisplayName(item)||item.id,initial,
      depreciation:value===null?0:initial-value,remaining:active?value:0,
      endValue:active?0:(value??0),shares:active?{...item.shares}:{},known:value!==null,
      valuation:rt.valuation,date:rt.date,endedAt:rt.endedAt??null};
  };
  const byName=(a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id);
  const items=projection.activeItems.map(i=>rowFor(i,true)).sort(byName);
  const ended=projection.archivedItems.map(i=>rowFor(i,false)).sort(byName);
  const activeTotals=sum(items), endedTotals=sum(ended);
  const people=[];
  for(const person of projection.allPeople){
    const report=personalReport(project,person.id,asOfDate,{projection,ledger});
    if(!report)continue;
    const count=person.holdings.filter(h=>h.units>0).length;
    const t=report.totals;
    // Keep inactive and even pre-entry people if historical ownership or
    // financial facts actually reference them. Do not show unrelated future members.
    const relevant=count>0 || Object.values(t).some(Boolean) ||
      Object.values(report.finance).some(Boolean) || report.receivables || report.liabilities ||
      report.items.length || report.events.length;
    if(!person.active&&!relevant)continue;
    const acquired=t.acquired+t.giftIn;
    const relinquished=t.relinquished+t.giftOut+t.ended;
    const other=t.appreciation;
    people.push({id:person.id,name:person.name,active:person.active,count,acquired,
      depreciation:t.depreciation,relinquished,other,remaining:t.remaining,balance:report.balance});
    if(report.incomplete || acquired-t.depreciation-relinquished+other!==t.remaining)incomplete=true;
  }
  people.sort((a,b)=>Number(b.active)-Number(a.active)||byName(a,b));
  const ids=new Set(people.map(p=>p.id));
  if(items.some(i=>Object.keys(i.shares).some(id=>i.shares[id]>0&&!ids.has(id))))incomplete=true;
  if(activeTotals.remaining!==projection.totalValueCents ||
    people.reduce((n,p)=>n+p.remaining,0)!==projection.totalValueCents ||
    people.reduce((n,p)=>n+p.balance,0)!==0)incomplete=true;
  return {name:project.community?.name||'Hausstandsliste',asOfDate,createdDate,
    items,ended,activeTotals,endedTotals,people,incomplete};
}
