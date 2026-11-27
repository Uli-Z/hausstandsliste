import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectAt } from '../src/lib/projector.js';
import { validCalendarDate } from '../src/lib/timeTravel.js';
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('new dated forms use the selected effective date; saved item drafts retain it',()=>{
  const router = source('ui-v3/DialogRouter.svelte');
  for (const type of ['personStatus','itemAdd','itemContinue','shareSet','itemEnd']) {
    assert.ok(router.includes("'"+type+"'"),type);
  }
  for (const type of ['item-added','item-ended','shares-set']) {
    assert.ok(source('src/lib/itemMutations.js').includes("'"+type+"'"),type);
  }
  const personMutations = source('src/lib/personMutations.js');
  for (const type of ['person-added','person-deactivated','person-reactivated']) {
    assert.ok(personMutations.includes("'"+type+"'"),type);
  }
  assert.ok(router.includes('personStatusProblem(project,'));
  assert.ok(router.includes('changePersonStatus(p, { personId: person.id, date: effectiveDate'));
  assert.ok(router.includes('applyPersonAdd(p, { name, date: effectiveDate }'));
  assert.ok(router.match(/hasEventDate\s*=\s*\[[^\]]*'personAdd'/));
  assert.ok(router.includes('effectiveDate = draft?.data?.effectiveDate || asOfDate'));
  assert.ok(router.includes('value={effectiveDate} on:change={changeEffectiveDate}'));
  assert.ok(router.includes('id="event-effective-date"'));
  assert.ok(router.includes('        effectiveDate,'));
  assert.ok(router.includes('projectAt(project, effectiveDate)'));
  assert.ok(router.includes('on:change={changeEffectiveDate}'));
  assert.ok(router.includes('rebaseUneditedMap(shares, shareDefaults, item.shares, manualShareIds)'));
  assert.ok(router.includes('dateSharesRebased = true'));
  assert.ok(router.includes('disabled={!canSubmitDated'));
  assert.ok(router.includes('itemAvailable'));
  assert.ok(router.includes('statusTargetValid'));
  const person = source('ui-v3/PersonDetail.svelte');
  assert.ok(person.includes("type:'personStatus'"));
  assert.ok(!person.includes("createEvent('person-deactivated', asOfDate"));
});
test('redistribution preview and execution use a single editable date; edits preserve original dates',()=>{
  const create=source('ui-v3/RedistributionDialog.svelte');
  const editing=source('ui-v3/ExecutedRedistributionEditDialog.svelte');
  const standard=source('ui-v3/EventEditDialog.svelte');
  const payment=source('src/components/SettlementDialog.svelte');
  assert.ok(create.includes('bind:value={redistribution.effectiveDate}'));
  assert.ok(create.includes('redistributionPreview(project, redistribution)'));
  assert.ok(create.includes('executeRedistribution(p, redistribution)'));
  assert.ok(source('src/lib/itemMutations.js').includes("createEvent('redistribution-executed',effectiveDate"));
  assert.ok(create.includes('invalidItems.length'));
  for (const dialog of [editing,standard]) {
    assert.ok(dialog.includes('value={edited.date} on:change={changeDate}'));
    assert.ok(dialog.includes('editableEventCopy(project,event)'));
    assert.ok(dialog.includes('redateEditableEvent(project,edited,inputEvent.currentTarget.value)'));
  }
  assert.ok(standard.includes('projectAt(project, edited.date)'));
  assert.ok(payment.includes('original?.date || asOfDate || todayISO()'));
  assert.ok(payment.includes('bind:value={date}'));
});
test('calendar dates and the active-person view behave at historical and future dates',()=>{
  assert.equal(validCalendarDate('2032-12-30'),true);
  assert.equal(validCalendarDate('2032-02-30'),false);
  const project={people:[{id:'a',name:'A'},{id:'b',name:'B'}],items:[],events:[
    {id:'a-in',type:'person-added',personId:'a',date:'2024-01-01',order:1},
    {id:'b-in',type:'person-added',personId:'b',date:'2029-01-01',order:1},
    {id:'a-out',type:'person-deactivated',personId:'a',date:'2032-01-01',order:1}
  ]};
  const active=at=>projectAt(project,at).people.filter(p=>p.active).map(p=>p.id);
  assert.deepEqual(active('2025-01-01'),['a']);
  assert.deepEqual(active('2030-01-01'),['a','b']);
  assert.deepEqual(active('2033-01-01'),['b']);
});
