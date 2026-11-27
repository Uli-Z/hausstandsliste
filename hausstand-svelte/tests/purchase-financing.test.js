import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProject } from '../src/lib/domain.js';
import { addItem } from '../src/lib/itemMutations.js';
import { editEvent } from '../src/lib/eventMutations.js';
import { ledgerAt, purchaseBreakdown, purchaseClaims, personBalances } from '../src/lib/ledger.js';
import { projectMutationProblem } from '../src/lib/mutationValidation.js';
const date='2026-01-01';
function fixture() {
  const project=emptyProject();
  for (const id of ['a','b','c','d','e']) {
    project.people.push({id,name:id});
    project.events.push({id:'person-'+id,type:'person-added',personId:id,date,order:1});
  }
  return project;
}
const payload={name:'Table',date,initialValue:500,valuation:{type:'fixed',minimumValue:0},
  shares:{a:1,b:1,c:1,d:1,e:1},purchaseContributionsCents:{a:25000,b:25000}};
test('Q31 contributions and gross details reconcile',()=>{
  const p=fixture();const {event}=addItem(p,payload);
  assert.deepEqual(event.purchaseContributionsCents,payload.purchaseContributionsCents);
  const l=ledgerAt(p,date);
  assert.deepEqual(Object.fromEntries([...l.balances].sort()),{a:15000,b:15000,c:-10000,d:-10000,e:-10000});
  assert.equal(l.details.get('a').fundedCents,25000);
  assert.equal(l.details.get('a').initialSharesCents,10000);
  assert.throws(()=>editEvent(p,event.id,{initialValue:600}));
  editEvent(p,event.id,{initialValue:600,purchaseContributionsCents:{a:30000,b:30000}});
  assert.equal(ledgerAt(p,date).details.get('a').balanceCents,18000);
});
test('Q31 opt-in payments are independent, dated and atomic',()=>{
  const p=fixture();const before=structuredClone(p);
  assert.throws(()=>addItem(p,{...payload,purchaseContributionsCents:{a:1}}));
  assert.deepEqual(p,before);
  const {event,payments}=addItem(p,{...payload,settledPaymentDate:'2026-01-02'});
  assert.ok(payments.length);
  assert.ok([...ledgerAt(p,'2026-01-02').balances.values()].every(c=>c===0));
  assert.equal(ledgerAt(p,date).balances.get('a'),15000);
  const originalPayments=structuredClone(payments);
  editEvent(p,event.id,{initialValue:600,purchaseContributionsCents:{a:30000,b:30000}});
  assert.deepEqual(p.events.filter(e=>e.type==='claim-settlement-recorded'),originalPayments);
  const invalid=structuredClone(p);
  invalid.events.find(e=>e.id===event.id).purchaseContributionsCents.a=1;
  assert.equal(projectMutationProblem(p,invalid).key,'errors.invalidPurchaseContributions');
});

test('Q31 incomplete purchases are rejected without compatibility fallback',()=>{
  const p=fixture();
  assert.throws(()=>addItem(p,{...payload,purchaseContributionsCents:undefined}));
  const unknown={id:'old',type:'item-added',itemId:'old-item',date,order:2,
    initialValue:10,valuation:{type:'fixed',minimumValue:0},shares:{a:1,b:1},financialMode:'none'};
  const imported={...p,items:[{id:'old-item',name:'Old'}],events:[...p.events,unknown]};
  assert.equal(ledgerAt(imported,date).claims.length,0);
  assert.equal(projectMutationProblem(p,imported).key,'errors.invalidPurchaseContributions');
});
test('Q31 partial and overpayments remain independent of the new purchase',()=>{
  const p=fixture();
  addItem(p,{...payload,name:'First purchase',initialValue:10,purchaseContributionsCents:{a:1000}});
  const before=Object.fromEntries(ledgerAt(p,date).balances);
  addItem(p,{...payload,settledPaymentDate:date});
  const after=Object.fromEntries(ledgerAt(p,date).balances);
  for(const id of Object.keys(before)) assert.equal(after[id],before[id]);
  const copy=JSON.parse(JSON.stringify(p));
  assert.deepEqual(Object.fromEntries(ledgerAt(copy,date).balances),after);
});

test('Q34 unequal but proportionally funded ownership is balanced; different funding is not',()=>{
  const p=fixture(), shares={a:2,b:1};
  const balanced={a:20000,b:10000};
  const {event}=addItem(p,{...payload,initialValue:300,shares,purchaseContributionsCents:balanced});
  assert.deepEqual(purchaseBreakdown(30000,shares,balanced),[
    {personId:'a',ownershipCents:20000,fundedCents:20000,balanceCents:0},
    {personId:'b',ownershipCents:10000,fundedCents:10000,balanceCents:0}
  ]);
  assert.equal(ledgerAt(p,date).claims.length,0);
  editEvent(p,event.id,{purchaseContributionsCents:{a:15000,b:15000}});
  const historical=ledgerAt(p,date);
  assert.deepEqual([...historical.balances].sort(),[['a',-5000],['b',5000]]);
  assert.equal(historical.claims[0].sourceEventId,event.id);
  assert.deepEqual(ledgerAt(p,'2025-12-31').claims,[]);
  assert.deepEqual(purchaseClaims(30000,shares,{a:15000,b:15000}),historical.claims.map(({sourceEventId,childEventId,itemId,date,...claim})=>claim));
});
test('Q34 exact cent explanation includes zero owners and non-owner funders',()=>{
  const shares={a:1,b:1,c:1}, contributions={a:0,b:333,c:333,d:334};
  const rows=purchaseBreakdown(1000,shares,contributions);
  assert.equal(rows.reduce((sum,r)=>sum+r.ownershipCents,0),1000);
  assert.equal(rows.reduce((sum,r)=>sum+r.balanceCents,0),0);
  assert.deepEqual(rows.find(r=>r.personId==='d'),{personId:'d',ownershipCents:0,fundedCents:334,balanceCents:334});
  const balances=personBalances(purchaseClaims(1000,shares,contributions));
  for(const row of rows) assert.equal(balances.get(row.personId)??0,row.balanceCents);
  assert.deepEqual(purchaseBreakdown(1000,shares,{a:1}),[]);
});

test('Q66 independent ownership and payment columns persist and produce correct claims',()=>{
  const p=fixture();
  const {event}=addItem(p,{...payload,initialValue:300,shares:{b:1,c:2},purchaseContributionsCents:{a:20000,c:10000}});
  assert.deepEqual(event.shares,{b:1,c:2});
  assert.deepEqual(event.purchaseContributionsCents,{a:20000,c:10000});
  assert.deepEqual(Object.fromEntries(ledgerAt(p,date).balances),{a:20000,b:-10000,c:-10000});
  editEvent(p,event.id,{shares:{b:2,c:1}});
  assert.deepEqual(p.events.find(e=>e.id===event.id).purchaseContributionsCents,{a:20000,c:10000});
  assert.equal(ledgerAt(p,date).balances.get('b'),-20000);
  editEvent(p,event.id,{purchaseContributionsCents:{a:10000,c:20000}});
  assert.deepEqual(p.events.find(e=>e.id===event.id).shares,{b:2,c:1});
});
