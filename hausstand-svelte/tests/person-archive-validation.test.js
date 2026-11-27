import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveHistoryProblems } from '../src/lib/personArchiveValidation.js';
import { projectMutationProblem } from '../src/lib/mutationValidation.js';
import { projectAt } from '../src/lib/projector.js';
import { previewPersonStatus, changePersonStatus } from '../src/lib/personMutations.js';
import { executeRedistribution } from '../src/lib/itemMutations.js';
import { createClaimSettlementEvent } from '../src/lib/claimSettlement.js';
import { createSessionUndo } from '../src/lib/sessionUndo.js';
import { createPortableSave, readPortableVersion } from '../src/lib/versionHistory.js';
import { ledgerAt } from '../src/lib/ledger.js';
import { storedProjectProblem } from '../src/lib/projectValidation.js';
import { buildRemovePersonChanges, soleOwnedItems } from '../src/lib/redistribution.js';

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

test('Q60: archive preserves holdings, balances and later references',()=>{
  const p=fixture();
  const owned=extend(p,purchase('2026-01-02',{a:1},0,{a:0}),archive());
  assert.equal(projectMutationProblem(p,owned),null);
  assert.equal(projectAt(owned,'2026-02-01').peopleById.get('a').active,false);
  assert.deepEqual(projectAt(owned,'2026-02-01').activeItems[0].shares,{a:1});
  const debt=extend(p,purchase('2026-01-02'),archive());
  assert.equal(projectMutationProblem(p,debt),null);
  assert.equal(ledgerAt(debt,'2026-02-01').balances.get('a'),1000);
  const later=extend(debt,payment('2026-02-02'));
  assert.equal(projectMutationProblem(debt,later),null);
  assert.equal(ledgerAt(later,'2026-02-02').balances.get('a')||0,0);
  assert.deepEqual(archiveHistoryProblems(later),[]);
  const early=extend(p,purchase('2025-01-01'));
  assert.equal(projectMutationProblem(p,early),null);
  assert.deepEqual(projectAt(early,'2025-01-01').people,[]);
  assert.equal(projectAt(early,'2025-01-01').activeItems[0].shareRows[0].personName,'B');
  assert.equal(ledgerAt(early,'2025-01-01').balances.get('a'),1000);
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

test('Q27: archive preview exposes optional preparation without blocking or mutation',()=>{
  const p=extend(fixture(),purchase('2026-01-02',{a:1},0,{a:0}));
  const before=structuredClone(p);
  const preview=previewPersonStatus(p,{personId:'a',date:'2026-02-01',kind:'deactivate'});
  assert.equal(preview.holdings.length,1);
  assert.equal(preview.balanceCents,0);
  assert.equal(preview.problem,null);
  assert.deepEqual(p,before);
  const debt=extend(fixture(),purchase('2026-01-02'));
  const owed=previewPersonStatus(debt,{personId:'a',date:'2026-02-01',kind:'deactivate'});
  assert.equal(owed.balanceCents,1000);
  assert.equal(owed.problem,null);
  const future=extend(fixture(),purchase('2026-04-01'));
  assert.equal(previewPersonStatus(future,{personId:'a',date:'2026-02-01',kind:'deactivate'}).problem,null);
  assert.equal(previewPersonStatus(fixture(),{personId:'a',date:'2026-02-01',kind:'deactivate'}).problem,null);
});
test('Q27: relinquishment retains remaining relative ownership and identifies sole ownership separately',()=>{
  const p=fixture();
  p.people.push({id:'c',name:'C'});
  p.items.push({id:'sole',name:'Sole item'});
  p.events.push(purchase('2026-01-02',{a:2,b:3,c:1},0,{a:0}),
    {...purchase('2026-01-03',{a:1},0,{a:0}),id:'sole-buy',itemId:'sole'});
  const projection=projectAt(p,'2026-02-01');
  assert.deepEqual(buildRemovePersonChanges(projection,'a'),[{itemId:'i',shares:{b:3,c:1}}]);
  assert.deepEqual(soleOwnedItems(projection,'a').map(i=>i.id),['sole']);
});

test('Q27: guided paid transfer, actual payment, archive and reactivation survive undo and file history', async()=>{
  const date='2026-02-01', personId='a', kind='deactivate';
  const before={schemaVersion:1,currency:'EUR',community:{name:'Archive test'},...extend(fixture(),
    purchase('2026-01-02',{a:1},10,{a:1000}))};
  let p=structuredClone(before);
  const history=createSessionUndo();
  const change=mutate=>{
    const next=structuredClone(p);
    mutate(next);
    assert.equal(projectMutationProblem(p,next),null);
    assert.equal(history.record(p,next),true);
    p=next;
  };
  assert.equal(previewPersonStatus(p,{personId,date,kind}).problem,null);
  change(q=>executeRedistribution(q,{title:'Paid transfer',effectiveDate:date,financialMode:'derived',
    changes:[{itemId:'i',shares:{b:1}}]}));
  const pending=previewPersonStatus(p,{personId,date,kind});
  assert.equal(pending.holdings.length,0);
  assert.equal(pending.balanceCents,1000);
  assert.deepEqual(pending.transfers,[{fromPersonId:'b',toPersonId:'a',amountCents:1000}]);
  assert.equal(p.events.filter(e=>e.type==='claim-settlement-recorded').length,0);
  change(q=>q.events.push(createClaimSettlementEvent(q,{date,
    debtorPersonId:'b',creditorPersonId:'a',amountCents:1000,settlementKind:'paid'})));
  assert.equal(previewPersonStatus(p,{personId,date,kind}).problem,null);
  change(q=>changePersonStatus(q,{personId,date,kind}));
  assert.equal(projectAt(p,date).peopleById.get(personId).active,false);
  const archived=structuredClone(p);
  p=history.undo(p);
  assert.equal(projectAt(p,date).peopleById.get(personId).active,true);
  p=history.redo(p);
  assert.deepEqual(p,archived);
  const previous=await createPortableSave(before,null,'2026-02-01T10:00:00Z');
  const saved=await createPortableSave(p,previous,'2026-02-01T11:00:00Z');
  const loaded=JSON.parse(JSON.stringify(saved));
  assert.equal(storedProjectProblem(loaded),null);
  assert.equal(projectAt(loaded,date).peopleById.get(personId).active,false);
  assert.equal(ledgerAt(loaded,date).balances.get(personId)||0,0);
  assert.deepEqual((await readPortableVersion(loaded,loaded.versionHistory.entries[0].id)).events,before.events);
  change(q=>changePersonStatus(q,{personId,date:'2026-03-01',kind:'reactivate'}));
  assert.equal(projectAt(p,'2026-03-01').peopleById.get(personId).active,true);
});
