import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProject } from '../src/lib/domain.js';
import { setItemShares, executeRedistribution } from '../src/lib/itemMutations.js';
import { projectAt } from '../src/lib/projector.js';
import { ledgerAt } from '../src/lib/ledger.js';
import { projectMutationProblem } from '../src/lib/mutationValidation.js';
const makeProject=()=>({...emptyProject(),people:['a','b','c'].map(id=>({id,name:id})),
  items:[{id:'i',name:'Table'}],events:[{id:'purchase',type:'item-added',itemId:'i',date:'2026-01-01',order:1,
    initialValue:100,valuation:{type:'fixed',minimumValue:0},shares:{a:6,b:4},purchaseContributionsCents:{a:6000,b:4000},financialMode:'derived'}]});
const date='2026-04-01';
test('Q30: real factories store deltas and chronological replay preserves later changes',()=>{
  const p=makeProject();
  const later=setItemShares(p,{itemId:'i',date:'2026-03-01',shares:{a:5,b:5},financialMode:'derived'}).event;
  const before=structuredClone(p);
  const earlier=executeRedistribution(p,{effectiveDate:'2026-02-01',financialMode:'derived',changes:[{itemId:'i',shares:{a:6,b:3,c:1}}]}).event;
  assert.deepEqual(later.shareUnitDeltas,{a:-1,b:1});
  assert.deepEqual(earlier.events[0].shareUnitDeltas,{b:-1,c:1});
  assert.ok(!Object.hasOwn(later,'shares'));
  assert.equal(projectMutationProblem(before,p),null);
  assert.deepEqual(projectAt(p,date).activeItems[0].shares,{a:5,b:4,c:1});
  assert.equal(ledgerAt(p,date).balances.get('c'),-1000);
  assert.equal(ledgerAt(p,date).balances.get('a'),1000);
  assert.equal(ledgerAt(p,date).balances.get('b')||0,0);
});
test('Q30: retroactive change causing a negative later balance is rejected with the exact event',()=>{
  const p=makeProject();
  const later=setItemShares(p,{itemId:'i',date:'2026-03-01',shares:{a:10},financialMode:'none'}).event;
  const staged=structuredClone(p);
  setItemShares(staged,{itemId:'i',date:'2026-02-01',shares:{a:6,b:1,c:3},financialMode:'none'});
  const problem=projectMutationProblem(p,staged);
  assert.equal(problem.key,'errors.shareHistoryConflict');
  assert.equal(problem.params.eventId,later.id);
  assert.equal(problem.params.person,'b');
  assert.equal(problem.params.before,1);
  assert.equal(problem.params.delta,-4);
  assert.deepEqual(projectAt(p,date).activeItems[0].shares,{a:10});
});
