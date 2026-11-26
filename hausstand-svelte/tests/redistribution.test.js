import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveClaims } from '../src/lib/ledger.js';
import { redistributionPreview, redistributionMarkdown, buildRedistributionItemRows, eventUnitChangeRows } from '../src/lib/redistribution.js';

const setup = () => ({
  people: [{ id: 'anna', name: 'Anna' }, { id: 'ben', name: 'Ben' }],
  items: [{ id: 'fridge', name: 'Kühlschrank' }],
  events: [{
    id: 'original', type: 'item-added', itemId: 'fridge', date: '2026-01-01',
    order: 1, initialValue: 100, valuation: { type: 'fixed', minimumValue: 0 },
    shares: { ben: 1 },financialMode:'derived',purchaseContributionsCents:{ben:10000}
  }]
});

const redistribution = financialMode => ({
  title: 'Anteile Kühlschrank', effectiveDate: '2026-02-01',
  changes: [{ itemId: 'fridge', shares: { anna: 1 } }],
  ...(financialMode === undefined ? {} : { financialMode })
});

test('A04: gift changes ownership value but never suggests payment or claim', () => {
  const project = setup();
  const plan = redistribution('none');
  const preview = redistributionPreview(project, plan);
  assert.deepEqual(preview.rows.map(row => [row.personId, row.delta]), [['anna', 100], ['ben', -100]]);
  assert.deepEqual(preview.payments, []);
  const markdown = redistributionMarkdown(plan, preview, 'de');
  assert.match(markdown, /Wertverschiebung/);
  assert.match(markdown, /keine Forderung/i);
  assert.doesNotMatch(markdown, /zahlt 100|würde 100/i);
  assert.equal(project.events.length, 1, 'preview must not mutate source events');
});

test('A04: paid share transfer retains an explicitly hypothetical suggestion', () => {
  const plan = redistribution('derived');
  const preview = redistributionPreview(setup(), plan);
  assert.deepEqual(preview.payments, [{
    fromPersonId: 'anna', from: 'Anna', toPersonId: 'ben', to: 'Ben', amount: 100
  }]);
  const markdown = redistributionMarkdown(plan, preview, 'de');
  assert.match(markdown, /Rechnerischer Ausgleichsvorschlag/);
  assert.match(markdown, /keine Dokumentation einer erfolgten Zahlung/);
});

test('A04: old drafts without financial mode are financially neutral', () => {
  const plan = redistribution();
  const preview = redistributionPreview(setup(), plan);
  assert.equal(preview.rows.length, 2);
  assert.deepEqual(preview.payments, []);
  assert.match(redistributionMarkdown(plan, preview, 'de'), /keine Forderung/i);
});

test('A04: an executed gift remains claim-free and its editor preview respects its mode', () => {
  const project = setup();
  const event = {
    id: 'redistribution-1', type: 'redistribution-executed', date: '2026-02-01',
    order: 2, title: 'Schenkung', financialMode: 'none',
    events: [{ id: 'child-1', type: 'shares-set', itemId: 'fridge', shareUnitDeltas: { ben: -1, anna: 1 } }]
  };
  project.events.push(event);
  assert.deepEqual(deriveClaims(project, '2026-03-01'), []);
  const editedPreview = redistributionPreview(
    { ...project, events: project.events.filter(e => e.id !== event.id) },
    { title: event.title, effectiveDate: event.date, financialMode: event.financialMode,
      changes: [{itemId:'fridge',shares:{anna:1}}] }
  );
  assert.deepEqual(editedPreview.payments, []);
  event.financialMode = 'derived';
  assert.equal(deriveClaims(project, '2026-03-01')[0].amountCents, 10000);
  assert.equal(redistributionPreview(setup(), redistribution('derived')).payments.length, 1);
});

// Q36: ownership movements are not the same as changing value fractions.
test('Q36: only actual signed unit changes appear in item rows, financial preview remains complete', () => {
  const project = setup();
  project.people.push({id:'clara',name:'Clara'});
  Object.assign(project.events[0], {initialValue:300, shares:{anna:2,ben:2,clara:2},
    purchaseContributionsCents:{anna:10000,ben:10000,clara:10000}});
  project.items.push({id:'chair',name:'Chair'});
  project.events.push({...project.events[0],id:'chair-purchase',itemId:'chair',initialValue:0,
    purchaseContributionsCents:{},shares:{anna:2,ben:2,clara:2}});
  const plan = {effectiveDate:'2026-02-01',financialMode:'derived',changes:[
    {itemId:'fridge',shares:{anna:3,ben:2,clara:2}},
    {itemId:'chair',shares:{anna:2,ben:2,clara:2}}]};
  const preview=redistributionPreview(project,plan);
  assert.deepEqual(preview.itemRows.map(row=>row.itemId),['fridge']);
  assert.deepEqual(preview.itemRows[0].changedPeople.map(p=>[p.personId,p.unitsDelta]),[['anna',1]]);
  assert.deepEqual(new Set(preview.rows.map(p=>p.personId)),new Set(['anna','ben','clara']));
  assert.equal(preview.payments.length,2);
  const picker=buildRedistributionItemRows(preview.base,plan.changes);
  assert.equal(picker.length,2);
  assert.deepEqual(picker.find(row=>row.itemId==='chair').changedPeople,[]);
  plan.changes=[{itemId:'fridge',shares:{anna:1,ben:3,clara:2}},
    {itemId:'chair',shares:{anna:0,ben:2.3,clara:2}}];
  const next=redistributionPreview(project,plan);
  assert.deepEqual(next.itemRows.find(row=>row.itemId==='fridge').changedPeople.map(p=>[p.personId,p.unitsDelta]),[['anna',-1],['ben',1]]);
  assert.deepEqual(next.itemRows.find(row=>row.itemId==='chair').changedPeople.map(p=>[p.personId,p.unitsDelta]),[['anna',-2],['ben',0.3]]);
  assert.ok(next.rows.every(p=>p.personId!=='clara'));
  assert.equal(next.itemRows.find(row=>row.itemId==='chair').changedPeople.every(p=>p.valueDelta===0),true);
  assert.equal(project.events.length,2);
});

test('Q36: historical summaries use persisted signed deltas even at zero item value and ignore no-op children',()=>{
  const single={type:'shares-set',itemId:'chair',shareUnitDeltas:{anna:-0.1,ben:0.1}};
  assert.deepEqual(eventUnitChangeRows(single),[{itemId:'chair',people:[
    {personId:'anna',unitsDelta:-0.1},{personId:'ben',unitsDelta:0.1}]}]);
  const grouped={type:'redistribution-executed',events:[single,
    {type:'shares-set',itemId:'fridge',shareUnitDeltas:{}},
    {type:'shares-set',itemId:'table',shareUnitDeltas:{clara:2}}]};
  assert.deepEqual(eventUnitChangeRows(grouped).map(r=>r.itemId),['chair','table']);
  assert.deepEqual(grouped.events[0],single);
});
