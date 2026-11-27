import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProject, requireProjectFile } from '../src/lib/domain.js';
import { setItemShares, executeRedistribution } from '../src/lib/itemMutations.js';
import { editEvent, removeEvent, editableEventCopy, redateEditableEvent, replaceEditableEvent } from '../src/lib/eventMutations.js';
import { projectAt } from '../src/lib/projector.js';
import { ledgerAt } from '../src/lib/ledger.js';
import { createSessionUndo } from '../src/lib/sessionUndo.js';
import { createPortableSave, readPortableVersion } from '../src/lib/versionHistory.js';
import { storedProjectProblem } from '../src/lib/projectValidation.js';
import { createClaimSettlementEvent } from '../src/lib/claimSettlement.js';
import { projectMutationProblem } from '../src/lib/mutationValidation.js';
const makeProject=()=>({...emptyProject(),people:['a','b','c'].map(id=>({id,name:id})),
  items:[{id:'i',name:'Table',number:1}],itemNumberRegistry:[{id:'i',number:1}],events:[{id:'purchase',type:'item-added',itemId:'i',date:'2026-01-01',order:1,
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

test('Q30: editing a historical target recalculates only that event; later deltas remain immutable',()=>{
  const p=makeProject();
  const early=setItemShares(p,{itemId:'i',date:'2026-02-01',shares:{a:6,b:3,c:1},financialMode:'none'}).event;
  const late=setItemShares(p,{itemId:'i',date:'2026-03-01',shares:{a:5,b:4,c:1},financialMode:'derived'}).event;
  const original=structuredClone(late);
  editEvent(p,early.id,{shares:{a:6,b:2,c:2}});
  assert.deepEqual(p.events.find(e=>e.id===late.id),original);
  assert.deepEqual(projectAt(p,date).activeItems[0].shares,{a:5,b:3,c:2});
  removeEvent(p,early.id);
  assert.deepEqual(projectAt(p,date).activeItems[0].shares,{a:5,b:5});
});
test('Q30: editing note or moving a date preserves signed unit changes',()=>{
  const p=makeProject();
  const later=setItemShares(p,{itemId:'i',date:'2026-03-01',shares:{a:5,b:5},financialMode:'none'}).event;
  setItemShares(p,{itemId:'i',date:'2026-02-01',shares:{a:6,b:3,c:1},financialMode:'none'});
  const form=editableEventCopy(p,later);
  assert.deepEqual(form.shares,{a:5,b:4,c:1});
  const moved=redateEditableEvent(p,form,'2026-01-15');
  assert.deepEqual(moved.shares,{a:5,b:5});
  const edited=replaceEditableEvent(p,{...moved,note:'moved'});
  assert.deepEqual(edited.shareUnitDeltas,{a:-1,b:1});
  assert.ok(!Object.hasOwn(edited,'shares'));
  assert.deepEqual(projectAt(p,date).activeItems[0].shares,{a:5,b:4,c:1});
});

test('Q30: real payments and purchase contributions are immutable across retroactive changes and undo/redo',()=>{
  const p=makeProject();
  setItemShares(p,{itemId:'i',date:'2026-03-01',shares:{a:5,b:5},financialMode:'derived'});
  p.events.push(createClaimSettlementEvent(p,{date:'2026-03-02',debtorPersonId:'b',creditorPersonId:'a',amountCents:700,settlementKind:'paid'}));
  const before=structuredClone(p), history=createSessionUndo();
  setItemShares(p,{itemId:'i',date:'2026-02-01',shares:{a:6,b:3,c:1},financialMode:'derived'});
  assert.equal(projectMutationProblem(before,p),null);
  assert.deepEqual(p.events.slice(0,3),before.events);
  assert.deepEqual(ledgerAt(p,date).counterclaims,ledgerAt(before,date).counterclaims);
  assert.equal(ledgerAt(p,date).balances.get('c'),-1000);
  assert.equal(history.record(before,p),true);
  const undone=history.undo(p,x=>!projectMutationProblem(p,x));
  assert.deepEqual(undone,before);
  const redone=history.redo(undone,x=>!projectMutationProblem(undone,x));
  assert.deepEqual(redone,p);
});
test('Q30: a conflict in a later group names the parent and the specific child, with no committed partial result',()=>{
  const p=makeProject();
  const group=executeRedistribution(p,{effectiveDate:'2026-03-01',financialMode:'none',changes:[{itemId:'i',shares:{a:10}}]}).event;
  const before=structuredClone(p), staged=structuredClone(p);
  setItemShares(staged,{itemId:'i',date:'2026-02-01',shares:{a:6,b:1,c:3},financialMode:'none'});
  const problem=projectMutationProblem(p,staged);
  assert.equal(problem.params.eventId,group.id);
  assert.equal(problem.params.childEventId,group.events[0].id);
  assert.deepEqual(p,before);
});
test('Q30: current file and embedded archive round-trip signed deltas; old snapshots are rejected, not converted',async()=>{
  const p=makeProject();
  setItemShares(p,{itemId:'i',date:'2026-03-01',shares:{a:5,b:5},financialMode:'none'});
  const saved=await createPortableSave(p,null);
  const next=structuredClone(saved);
  setItemShares(next,{itemId:'i',date:'2026-02-01',shares:{a:6,b:3,c:1},financialMode:'none'});
  const file=JSON.parse(JSON.stringify(await createPortableSave(next,saved)));
  assert.equal(storedProjectProblem(requireProjectFile(file)),null);
  assert.deepEqual(projectAt(file,date).activeItems[0].shares,{a:5,b:4,c:1});
  const restored=await readPortableVersion(file,file.versionHistory.entries[0].id);
  assert.deepEqual(restored.events,saved.events);
  assert.deepEqual(projectAt(restored,date).activeItems[0].shares,{a:5,b:5});
  const incompatible=structuredClone(saved);
  delete incompatible.events[1].shareUnitDeltas;
  incompatible.events[1].shares={a:5,b:5};
  assert.throws(()=>requireProjectFile(incompatible),/Projektformat/);
  const mixedArchive=await createPortableSave(file,incompatible);
  await assert.rejects(readPortableVersion(mixedArchive,mixedArchive.versionHistory.entries.at(-1).id),/Projektformat/);
});
