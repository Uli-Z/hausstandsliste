import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveClaims } from '../src/lib/ledger.js';
import { redistributionPreview, redistributionMarkdown } from '../src/lib/redistribution.js';

const setup = () => ({
  people: [{ id: 'anna', name: 'Anna' }, { id: 'ben', name: 'Ben' }],
  items: [{ id: 'fridge', name: 'Kühlschrank' }],
  events: [{
    id: 'original', type: 'item-added', itemId: 'fridge', date: '2026-01-01',
    order: 1, initialValue: 100, valuation: { type: 'fixed', minimumValue: 0 },
    shares: { ben: 1 }
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
    events: [{ id: 'child-1', type: 'shares-set', itemId: 'fridge', shares: { anna: 1 } }]
  };
  project.events.push(event);
  assert.deepEqual(deriveClaims(project, '2026-03-01'), []);
  const editedPreview = redistributionPreview(
    { ...project, events: project.events.filter(e => e.id !== event.id) },
    { title: event.title, effectiveDate: event.date, financialMode: event.financialMode,
      changes: event.events.map(e => ({ itemId: e.itemId, shares: e.shares })) }
  );
  assert.deepEqual(editedPreview.payments, []);
  event.financialMode = 'derived';
  assert.equal(deriveClaims(project, '2026-03-01')[0].amountCents, 10000);
  assert.equal(redistributionPreview(setup(), redistribution('derived')).payments.length, 1);
});
