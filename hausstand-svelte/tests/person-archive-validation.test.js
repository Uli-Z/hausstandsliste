import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveHistoryProblems } from '../src/lib/personArchiveValidation.js';
import { projectMutationProblem } from '../src/lib/mutationValidation.js';
import { projectAt } from '../src/lib/projector.js';

const event = (id,type,date,fields={},order=1) => ({id,type,date,order,...fields});
const fixed = {type:'fixed',minimumValue:0};
const archive = (date='2026-02-01',order=1) => event('archive','person-deactivated',date,{personId:'a'},order);
const reactivate = (date='2026-03-01',order=1) => event('return','person-reactivated',date,{personId:'a'},order);
const payment = (date,order=1) => event('pay','claim-settlement-recorded',date,{
  debtorPersonId:'b',creditorPersonId:'a',amountCents:1000,settlementKind:'paid'},order);
const fixture = () => ({people:[{id:'a',name:'A'},{id:'b',name:'B'}],items:[{id:'i',name:'Table'}],drafts:[],
  events:[event('a','person-added','2026-01-01',{personId:'a'}),
    event('b','person-added','2026-01-01',{personId:'b'},2)]});
const purchase = (date,shares={b:1},value=10,contributions={a:1000}) =>
  event('buy','item-added',date,{itemId:'i',initialValue:value,valuation:fixed,shares,
    financialMode:'derived',purchaseContributionsCents:contributions});
const extend = (p,...events) => ({...p,events:[...p.events,...events]});

test('Q27: archive rejects even zero-value holdings and an independent outstanding balance',()=>{
  const p=fixture();
  const owned=extend(p,purchase('2026-01-02',{a:1},0,{a:0}),archive());
  assert.equal(projectMutationProblem(p,owned).key,'errors.archiveHoldings');
  const debt=extend(p,purchase('2026-01-02'),archive());
  assert.equal(projectMutationProblem(p,debt).key,'errors.archiveBalance');
});

test('Q27: same-day sequence matters; later payment cannot clear an earlier archive',()=>{
  const p=fixture(), buy=purchase('2026-01-02');
  const good=extend(p,buy,payment('2026-02-01',1),archive('2026-02-01',2));
  assert.equal(projectMutationProblem(p,good),null);
  assert.equal(projectAt(good,'2026-02-01').peopleById.get('a').active,false);
  const bad=extend(p,buy,archive('2026-02-01',1),payment('2026-02-01',2));
  assert.ok(archiveHistoryProblems(bad).some(x=>x.key==='errors.archiveBalance'));
  assert.ok(archiveHistoryProblems(bad).some(x=>x.key==='errors.archivedPersonInvolvement'));
  const removed={...good,events:good.events.filter(e=>e.id!=='pay')};
  assert.equal(projectMutationProblem(good,removed).key,'errors.archiveBalance');
});

test('Q27: backdating archive or removing reactivation cannot strand later involvement',()=>{
  const p=fixture();
  const bought=purchase('2026-04-01');
  const good=extend(p,archive(),reactivate(),bought);
  assert.equal(projectMutationProblem(p,good),null);
  const removed={...good,events:good.events.filter(e=>e.id!=='return')};
  const problem=projectMutationProblem(good,removed);
  assert.equal(problem.key,'errors.archivedPersonInvolvement');
  assert.equal(problem.params.eventId,'buy');
  const moved={...good,events:good.events.map(e=>e.id==='return'?{...e,date:'2026-05-01'}:e)};
  assert.equal(projectMutationProblem(good,moved).key,'errors.archivedPersonInvolvement');
});

test('Q27: nested redistribution and actual payments cannot involve an archived person',()=>{
  const p=fixture();
  const before=extend(p,purchase('2026-01-02',{b:1},10,{b:1000}),archive());
  const batch=event('batch','redistribution-executed','2026-02-02',{
    financialMode:'none',events:[{id:'child',type:'shares-set',itemId:'i',shares:{a:1,b:1}}]});
  const problem=projectMutationProblem(before,extend(before,batch));
  assert.equal(problem.key,'errors.archivedPersonInvolvement');
  assert.equal(problem.params.eventId,'batch');
  assert.equal(projectMutationProblem(before,extend(before,payment('2026-02-02'))).key,'errors.archivedPersonInvolvement');
});

test('Q27: repeated archive/reactivate allowed; orphan or duplicate status events rejected',()=>{
  const p=fixture();
  const good=extend(p,archive(),reactivate(),
    {...archive('2026-04-01'),id:'archive2'},{...reactivate('2026-05-01'),id:'return2'});
  assert.equal(projectMutationProblem(p,good),null);
  assert.equal(projectMutationProblem(p,extend(p,reactivate())).key,'errors.archiveStatus');
  assert.equal(projectMutationProblem(p,extend(p,archive(),{...archive('2026-04-01'),id:'archive2'})).key,'errors.archiveStatus');
  const orphan={...good,events:good.events.filter(e=>e.id!=='archive')};
  assert.equal(projectMutationProblem(good,orphan).key,'errors.archiveStatus');
});
