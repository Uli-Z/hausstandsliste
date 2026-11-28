import test from 'node:test';
import assert from 'node:assert/strict';
import { householdReport } from '../src/lib/householdReport.js';
import { householdReportBlocks, matrixGroups, householdReportFilename } from '../src/lib/householdReportPdf.js';
import { projectAt } from '../src/lib/projector.js';
import { ledgerAt } from '../src/lib/ledger.js';
const people=['a','b','c','d','e','f','future'].map(id=>({id,name:id==='a'?'Änne mit sehr langem Namen':id}));
const add=(id,date,shares,price=100)=>({id:'add-'+id,type:'item-added',itemId:id,date,order:1,initialValue:price,
  valuation:{type:'linear',durationYears:2,minimumValue:10},shares,financialMode:'derived',purchaseContributionsCents:{a:price*100}});
const project={community:{name:'WG / Haus'},people,items:[{id:'i',number:1,name:'Tisch'},{id:'j',number:2,name:'Sofa'},{id:'k',number:3,name:'Zukunft'}],
  events:[{id:'join-future',type:'person-added',personId:'future',date:'2028-01-01',order:1},
    add('i','2024-01-01',{a:1,b:2,c:.5}),add('j','2024-02-01',{a:1},50),add('k','2028-01-01',{a:1}),
    {id:'end',type:'item-ended',itemId:'j',date:'2025-02-01',order:1},
    {id:'move',type:'person-deactivated',personId:'b',date:'2025-01-01',order:1}]};
test('active stock and person totals reconcile at historic date including inactive owner',()=>{
  const date='2025-03-01',r=householdReport(project,date,'2026-11-28');
  assert.equal(r.items.length,1);assert.equal(r.ended.length,1);
  assert.equal(r.activeTotals.initial,10000);
  assert.equal(r.activeTotals.remaining,projectAt(project,date).totalValueCents);
  assert.equal(r.activeTotals.initial-r.activeTotals.depreciation,r.activeTotals.remaining);
  assert.equal(r.endedTotals.initial-r.endedTotals.depreciation,r.endedTotals.endValue);
  assert.equal(r.people.some(p=>p.id==='future'),false);
  assert.equal(r.people.find(p=>p.id==='b').active,false);
  assert.equal(r.people.reduce((n,p)=>n+p.remaining,0),r.activeTotals.remaining);
  for(const p of r.people)assert.equal(p.balance,ledgerAt(project,date).balances.get(p.id)||0);
  assert.equal(r.incomplete,false);
  assert.equal(householdReport(project,'2024-03-01','2026-11-28').items.length,2);
});
test('matrix has items as rows, complete units and identical money columns across blocks',()=>{
  const r=householdReport(project,'2025-03-01','2026-11-28');
  const blocks=householdReportBlocks(r,'de',true);
  const matrices=blocks.filter(b=>b.kind==='table'&&b.columns[0].label==='Gegenstand');
  assert.equal(matrices.length,2);
  assert.deepEqual(matrices[0].rows[0].cells.slice(0,4),matrices[1].rows[0].cells.slice(0,4));
  assert.ok(matrices.flatMap(b=>b.rows[0].cells.slice(4)).includes('0,5'));
  assert.ok(matrices.flatMap(b=>b.rows[0].cells.slice(4)).includes('2'));
  for(const m of matrices){assert.equal(m.rows[0].cells[0],'#1 Tisch');assert.equal(m.rows.at(-1).total,true);}
  assert.ok(blocks.some(b=>b.kind==='warning'));
  assert.ok(blocks.some(b=>b.text?.includes('Änne mit sehr langem Namen')));
  assert.equal(householdReportFilename(r),'WG - Haus-2025-03-01.pdf');
  assert.ok(householdReportBlocks(r,'en').some(b=>b.text==='Household report'));
});
test('empty and large matrices have stable coverage without fabricated shares',()=>{
  assert.deepEqual(matrixGroups([]),[[]]);
  const p=Array.from({length:21},(_,i)=>({id:i}));
  assert.deepEqual(matrixGroups(p).flat(),p);
  const empty=householdReport({people:[],items:[],events:[]},'2025-01-01','2026-11-28');
  assert.equal(empty.incomplete,false);
  assert.equal(householdReportBlocks(empty,'en').filter(b=>b.kind==='table').length,1);
});
