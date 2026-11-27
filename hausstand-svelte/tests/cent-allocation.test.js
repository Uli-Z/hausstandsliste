import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateCents, deriveClaims, purchaseBreakdown, ledgerAt } from '../src/lib/ledger.js';
import { projectAt, shareDeltasForChange } from '../src/lib/projector.js';
import { redistributionPreview } from '../src/lib/redistribution.js';
import { valueAtCents } from '../src/lib/valuation.js';
import { exportProject } from '../src/lib/persistence.js';

const sum = values => values.reduce((a,b)=>a+b,0);
const date = '2026-01-01';
const fixed = {type:'fixed',minimumValue:0};
const people = ['a','b','c'].map(id=>({id,name:id}));
const purchase = (id,value,shares,valuation=fixed) => ({
  id:'buy-'+id,type:'item-added',itemId:id,date,order:1,initialValue:value,
  valuation,shares,financialMode:'derived',purchaseContributionsCents:{a:Math.round(value*100)}
});
const project = events => ({people,items:events.filter(e=>e.type==='item-added').map(e=>({id:e.itemId,name:e.itemId})),events});
const byId = item => Object.fromEntries(item.shareRows.map(r=>[r.personId,r.valueCents]));

test('Q62: largest remainder uses original decimal weights and deterministic ID tie-breaks',()=>{
  assert.deepEqual(allocateCents(10000,{c:1,b:1,a:1}),{a:3334,b:3333,c:3333});
  assert.deepEqual(allocateCents(1,{c:.1,b:.1,a:.1,zero:0}),{a:1,b:0,c:0});
  assert.deepEqual(allocateCents(10000,{a:2,b:3,c:.5}),{a:3636,b:5455,c:909});
  assert.deepEqual(allocateCents(1,{a:.1,b:.10000000000000002}),{a:0,b:1});
  assert.deepEqual(allocateCents(7,{a:1e-300,b:2e-300,c:1e-300}),{a:2,b:3,c:2});
  assert.deepEqual(allocateCents(9,{a:1e300,b:2e300}),{a:3,b:6});
  assert.deepEqual(allocateCents(0,{a:1,b:2}),{a:0,b:0});
  assert.equal(sum(Object.values(allocateCents(Number.MAX_SAFE_INTEGER,{a:1,b:1,c:1}))),Number.MAX_SAFE_INTEGER);
  // Property regression across amounts, decimal units, and input permutations.
  for (let n=1;n<=300;n++) {
    const amount=n*n+1, shares={a:n/10,b:(n%17+1)/100,c:(n%7+1)/1000};
    const result=allocateCents(amount,shares);
    assert.equal(sum(Object.values(result)),amount);
    assert.deepEqual(result,allocateCents(amount,{c:shares.c,b:shares.b,a:shares.a}));
    assert.ok(Object.values(result).every(v=>Number.isSafeInteger(v)&&v>=0));
  }
});

test('Q62: projections, person totals, purchase breakdown and exported values reconcile',()=>{
  const p=project([purchase('one',100,{a:1,b:1,c:1}),purchase('two',.01,{a:1,b:1,c:1}),purchase('three',.01,{b:1})]);
  const view=projectAt(p,date);
  assert.deepEqual(byId(view.items[0]),{a:3334,b:3333,c:3333});
  assert.deepEqual(byId(view.items[1]),{a:1,b:0,c:0});
  assert.deepEqual(view.allPeople.map(p=>p.totalValueCents),[3335,3334,3333]);
  assert.equal(view.totalValueCents,10002);
  assert.equal(sum(view.allPeople.map(p=>p.totalValueCents)),view.totalValueCents);
  const breakdown=purchaseBreakdown(10000,p.events[0].shares,{a:10000});
  assert.deepEqual(breakdown.map(r=>r.ownershipCents),[3334,3333,3333]);
  assert.deepEqual(exportProject(p,date).humanReadableSnapshot.people.map(p=>p.totalValue),[33.35,33.34,33.33]);
  p.people.reverse();
  p.people[0].name='Renamed';
  assert.deepEqual(byId(projectAt(p,date).items[0]),byId(view.items[0]));
});

test('Q62: valuation rounded once, previews and dated transfer claims agree without changing payments',()=>{
  const valuation={type:'linear',durationYears:3,minimumValue:50};
  const bought=purchase('one',100,{a:1,b:1,c:1},valuation);
  const p=project([bought]);
  const at='2027-05-17';
  const before=projectAt(p,at);
  const item=before.items[0];
  assert.equal(item.valueCents,valueAtCents(valuation,100,date,at));
  assert.equal(sum(item.shareRows.map(r=>r.valueCents)),item.valueCents);
  const change={id:'transfer',type:'shares-set',itemId:'one',date:at,order:2,shareUnitDeltas:{a:-1,b:1},financialMode:'derived'};
  const rows=shareDeltasForChange(before,change);
  assert.equal(sum(rows.map(r=>r.deltaCents)),0);
  const preview=redistributionPreview(p,{effectiveDate:at,financialMode:'derived',changes:[change]});
  p.events.push(change);
  const claims=deriveClaims(p,at).filter(c=>c.sourceEventId==='transfer');
  assert.equal(sum(claims.map(c=>c.amountCents)),sum(preview.payments.map(r=>Math.round(r.amount*100))));
  assert.deepEqual(byId(projectAt(p,at).items[0]),allocateCents(item.valueCents,{b:2,c:1}));
  // A real overpayment and a membership exit must not affect ownership or
  // be rewritten when the exact allocation is recalculated.
  p.events.push({id:'paid',type:'claim-settlement-recorded',date:at,order:3,
    debtorPersonId:'b',creditorPersonId:'a',amountCents:100000,settlementKind:'paid'});
  p.events.push({id:'exit',type:'person-deactivated',date:at,order:4,personId:'b'});
  const previous=JSON.stringify(p.events);
  const ledger=ledgerAt(p,at);
  assert.equal(ledger.counterclaims[0].amountCents,100000);
  assert.ok(ledger.balances.get('b')>0);
  const archived=projectAt(p,at);
  assert.equal(archived.allPeople.find(p=>p.id==='b').active,false);
  assert.deepEqual(byId(archived.items[0]),allocateCents(item.valueCents,{b:2,c:1}));
  assert.equal(sum(archived.allPeople.map(p=>p.totalValueCents)),archived.totalValueCents);
  assert.equal(JSON.stringify(p.events),previous);
  assert.equal(projectAt(p,'2030-01-01').items[0].valueCents,5000);
});
