import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProject } from '../src/lib/domain.js';
import { addItem } from '../src/lib/itemMutations.js';
import { editEvent } from '../src/lib/eventMutations.js';
import { ledgerAt } from '../src/lib/ledger.js';
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
