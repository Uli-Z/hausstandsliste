import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAIM_SETTLEMENT_TYPE, CLAIM_SETTLEMENT_KINDS,
  claimSettlementErrors, createClaimSettlementEvent
} from '../src/lib/claimSettlement.js';
import { normalize } from '../src/lib/domain.js';
import { projectAt } from '../src/lib/projector.js';
import { deriveClaims, ledgerAt } from '../src/lib/ledger.js';
import { exportProject } from '../src/lib/persistence.js';
import { personDeletionEligibility } from '../src/lib/personDeletion.js';

const sourceDate = '2026-01-10';
const settlementDate = '2026-02-01';
const project = () => ({
  schemaVersion: 1, community: { name: 'WG' },
  people: ['anna', 'ben', 'clara'].map(id => ({ id, name: id })),
  items: [{ id: 'fridge', name: 'Kühlschrank' }],
  events: [
    ...['anna', 'ben', 'clara'].map((id, index) => ({
      id: 'enter-' + id, type: 'person-added', date: '2026-01-01', order: index, personId: id
    })),
    {
      id: 'purchase', type: 'item-added', date: sourceDate, order: 1,
      itemId: 'fridge', initialValue: 300,
      valuation: { type: 'fixed', minimumValue: 0 },
      shares: { anna: 1, ben: 1, clara: 1 },
      financialMode: 'derived', financedByPersonId: 'anna'
    }
  ],
  drafts: []
});
const fields = (changes = {}) => ({
  date: settlementDate, amountCents: 6000,
  debtorPersonId: 'ben', creditorPersonId: 'anna',
  sourceEventId: 'purchase', childEventId: null, itemId: 'fridge',
  settlementKind: 'paid', note: 'Überweisung schon erfolgt',
  ...changes
});

test('B01: builder creates a fully referenced dated event in integer cents', () => {
  const p = project();
  p.events.push({ id: 'later', type: 'person-reactivated', personId: 'anna', date: settlementDate, order: Date.now() + 10000 });
  const event = createClaimSettlementEvent(p, fields());
  assert.equal(event.type, CLAIM_SETTLEMENT_TYPE);
  assert.ok(event.id.startsWith('settlement_'));
  assert.ok(event.order > p.events.at(-1).order);
  assert.equal(event.date, settlementDate);
  assert.equal(event.amountCents, 6000);
  assert.equal(event.debtorPersonId, 'ben');
  assert.equal(event.creditorPersonId, 'anna');
  assert.equal(event.sourceEventId, 'purchase');
  assert.equal(event.childEventId, null);
  assert.equal(event.itemId, 'fridge');
  assert.equal(event.settlementKind, 'paid');
  assert.equal(event.note, 'Überweisung schon erfolgt');
  assert.deepEqual(claimSettlementErrors(event), []);
  assert.equal(p.events.length, 5, 'builder must not mutate the project');
});

test('B01: paid, external and waived are distinct records, without a persistent paid flag', () => {
  const p = project();
  assert.deepEqual(CLAIM_SETTLEMENT_KINDS, ['paid', 'external', 'waived']);
  for (const kind of CLAIM_SETTLEMENT_KINDS) {
    const event = createClaimSettlementEvent(p, fields({ settlementKind: kind, note: undefined }));
    assert.equal(event.settlementKind, kind);
    assert.equal(Object.hasOwn(event, 'paid'), false);
    assert.equal(Object.hasOwn(event, 'note'), false);
    assert.deepEqual(claimSettlementErrors(event), []);
  }
  const nested = createClaimSettlementEvent(p, fields({ sourceEventId: 'bundle', childEventId: 'child-fridge' }));
  assert.equal(nested.sourceEventId, 'bundle');
  assert.equal(nested.childEventId, 'child-fridge');
});

test('B01: validator refuses unsafe amounts, same party and malformed references or dates', () => {
  const p = project();
  for (const invalid of [
    { amountCents: 0 }, { amountCents: -1 }, { amountCents: 1.5 },
    { amountCents: '6000' }, { amountCents: Number.MAX_SAFE_INTEGER + 1 },
    { debtorPersonId: 'anna' }, { creditorPersonId: '' },
    { sourceEventId: '' }, { itemId: '' }, { childEventId: '' },
    { settlementKind: 'planned' }, { date: '2026-02-30' },
    { date: '2026-2-1' }, { note: 123 }
  ]) {
    assert.throws(() => createClaimSettlementEvent(p, fields(invalid)), TypeError,
      'should refuse: ' + JSON.stringify(invalid));
  }
  assert.ok(claimSettlementErrors({ type: CLAIM_SETTLEMENT_TYPE }).length > 0);
});

test('B01: importing an event preserves it and reports invalid entries without rewriting history', () => {
  const p = project();
  const valid = createClaimSettlementEvent(p, fields({ settlementKind: 'external' }));
  p.events.push(valid);
  const roundtrip = normalize(JSON.parse(JSON.stringify(exportProject(p, settlementDate))));
  assert.deepEqual(roundtrip.events.at(-1), valid);
  assert.deepEqual(projectAt(roundtrip, settlementDate).warnings, []);
  const invalid = structuredClone(roundtrip);
  invalid.events.at(-1).amountCents = -500;
  const original = JSON.stringify(invalid.events.at(-1));
  assert.match(projectAt(invalid, settlementDate).warnings.join(' '), /Ungültiger Forderungsausgleich/);
  assert.equal(JSON.stringify(invalid.events.at(-1)), original, 'invalid imported event must not be silently changed');
});

test('B01: settlement events do not change ownership or falsely reduce claims before B02/B03', () => {
  const p = project();
  const before = projectAt(p, settlementDate);
  const claimsBefore = deriveClaims(p, settlementDate);
  assert.deepEqual(claimsBefore.map(c => [c.debtorPersonId, c.creditorPersonId, c.amountCents]), [
    ['ben', 'anna', 10000], ['clara', 'anna', 10000]
  ]);
  p.events.push(createClaimSettlementEvent(p, fields()));
  assert.equal(projectAt(p, '2026-01-31').warnings.length, 0);
  assert.deepEqual(projectAt(p, settlementDate).activeItems[0].shares, before.activeItems[0].shares);
  assert.deepEqual(deriveClaims(p, settlementDate), claimsBefore);
  assert.deepEqual(ledgerAt(p, settlementDate).pairwise, [
    { fromPersonId: 'ben', toPersonId: 'anna', amountCents: 10000 },
    { fromPersonId: 'clara', toPersonId: 'anna', amountCents: 10000 }
  ]);
  assert.equal(personDeletionEligibility(p, 'ben').allowed, false);
});
