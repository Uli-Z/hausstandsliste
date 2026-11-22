import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveClaims, ledgerAt } from '../src/lib/ledger.js';
import { createClaimSettlementEvent } from '../src/lib/claimSettlement.js';
import {
  claimReferenceFields, claimReferenceKey, createClaimSettlementForClaim,
  matchClaimSettlements
} from '../src/lib/claimMatching.js';
import { normalize } from '../src/lib/domain.js';
import { exportProject } from '../src/lib/persistence.js';

const fixed = { type: 'fixed', minimumValue: 0 };
const makeProject = () => ({
  people: ['anna', 'ben', 'clara'].map(id => ({ id, name: id })),
  items: [{ id: 'fridge', name: 'Kühlschrank' }, { id: 'desk', name: 'Schreibtisch' }],
  events: [
    {
      id: 'purchase', type: 'item-added', itemId: 'fridge',
      date: '2026-01-01', order: 1, initialValue: 300,
      valuation: fixed, shares: { anna: 1, ben: 1, clara: 1 },
      financialMode: 'derived', financedByPersonId: 'anna'
    }
  ],
  drafts: []
});
const eventFor = (p, claim, options = {}) => createClaimSettlementForClaim(p, claim, {
  date: '2026-02-01',
  amountCents: 6000,
  settlementKind: 'paid',
  ...options
});
const findClaim = (p, debtorId, asOf = '2026-04-01') =>
  deriveClaims(p, asOf).find(claim => claim.debtorPersonId === debtorId);

test('B02: financed item purchase yields one distinct stable claim reference per co-owner', () => {
  const p = makeProject();
  const benClaim = findClaim(p, 'ben');
  const claraClaim = findClaim(p, 'clara');
  assert.equal(benClaim.amountCents, 10000);
  assert.equal(claraClaim.amountCents, 10000);
  assert.deepEqual(claimReferenceFields(benClaim), {
    sourceEventId: 'purchase', childEventId: null, itemId: 'fridge',
    debtorPersonId: 'ben', creditorPersonId: 'anna'
  });
  assert.notEqual(claimReferenceKey(benClaim), claimReferenceKey(claraClaim));

  const settlement = eventFor(p, benClaim);
  p.events.push(settlement);
  const match = matchClaimSettlements(p, '2026-02-01');
  assert.deepEqual(match.unmatched, []);
  assert.equal(match.matched.length, 1);
  assert.equal(match.matched[0].event, settlement);
  assert.deepEqual(match.matched[0].claim, benClaim);
  assert.equal(match.matched[0].claimKey, claimReferenceKey(benClaim));
  assert.notEqual(match.matched[0].claimKey, claimReferenceKey(claraClaim));
  assert.equal(ledgerAt(p, '2026-02-01').claims.length, 2, 'B02 must not alter balances before B03');
});

test('B02: parent + child + item references distinguish multiple transfers in a group', () => {
  const p = makeProject();
  p.events.push({
    id: 'desk-purchase', type: 'item-added', itemId: 'desk',
    date: '2026-01-01', order: 2, initialValue: 80,
    valuation: fixed, shares: { anna: 1 }, financialMode: 'none'
  });
  p.events.push({
    id: 'group', type: 'redistribution-executed', date: '2026-02-01', order: 3,
    financialMode: 'derived', events: [
      { id: 'fridge-child', type: 'shares-set', itemId: 'fridge', shares: { ben: 1 } },
      { id: 'desk-child', type: 'shares-set', itemId: 'desk', shares: { clara: 1 } }
    ]
  });
  const claims = deriveClaims(p, '2026-02-01');
  const groupClaims = claims.filter(c => c.sourceEventId === 'group');
  assert.equal(groupClaims.length, 3); // Two sellers on fridge, one on desk.
  const fridgeClaim = groupClaims.find(c => c.itemId === 'fridge' && c.creditorPersonId === 'anna');
  const deskClaim = groupClaims.find(c => c.itemId === 'desk');
  assert.equal(fridgeClaim.childEventId, 'fridge-child');
  assert.equal(deskClaim.childEventId, 'desk-child');

  const first = eventFor(p, fridgeClaim, { date: '2026-02-02', amountCents: 5000 });
  p.events.push(first);
  const second = eventFor(p, deskClaim, { date: '2026-02-02', amountCents: 8000 });
  p.events.push(second);
  const matching = matchClaimSettlements(p, '2026-02-02');
  assert.equal(matching.matched.length, 2);
  assert.deepEqual(matching.unmatched, []);
  assert.equal(matching.matched[0].claim.itemId, 'fridge');
  assert.equal(matching.matched[1].claim.itemId, 'desk');
  assert.notEqual(matching.matched[0].claimKey, matching.matched[1].claimKey);
});

test('B02: wrong person, item or child is unmatched, never assigned by balance similarity', () => {
  for (const override of [
    { debtorPersonId: 'clara' },
    { creditorPersonId: 'clara' },
    { itemId: 'desk' },
    { childEventId: 'missing-child' },
    { sourceEventId: 'missing-purchase' }
  ]) {
    const p = makeProject();
    const event = createClaimSettlementEvent(p, {
      date: '2026-02-01', amountCents: 6000, settlementKind: 'paid',
      ...claimReferenceFields(findClaim(p, 'ben')), ...override
    });
    p.events.push(event);
    const matching = matchClaimSettlements(p, '2026-02-01');
    assert.equal(matching.matched.length, 0, JSON.stringify(override));
    assert.equal(matching.unmatched.length, 1, JSON.stringify(override));
    assert.ok(['claim-not-found', 'missing-source'].includes(matching.unmatched[0].code));
  }
});

test('B02: matching is preserved by JSON export/import and source amount corrections', () => {
  const p = makeProject();
  p.events.push(eventFor(p, findClaim(p, 'ben'), { note: 'Auszug', settlementKind: 'external' }));
  const [original] = matchClaimSettlements(p, '2026-02-01').matched;
  const copy = normalize(JSON.parse(JSON.stringify(exportProject(p, '2026-02-01'))));
  assert.deepEqual(copy.events, p.events);
  const [restored] = matchClaimSettlements(copy, '2026-02-01').matched;
  assert.equal(restored.claimKey, original.claimKey);
  assert.equal(restored.event.id, original.event.id);
  assert.equal(restored.event.settlementKind, 'external');

  copy.events[0].initialValue = 330;
  const corrected = matchClaimSettlements(copy, '2026-02-01');
  assert.equal(corrected.matched.length, 1);
  assert.equal(corrected.matched[0].claim.amountCents, 11000);
  assert.equal(corrected.matched[0].claimKey, original.claimKey);
  assert.equal(corrected.matched[0].event.amountCents, 6000,
    'recorded settlement amount does not silently follow a source edit');
  copy.events[0].financedByPersonId = 'clara';
  assert.deepEqual(matchClaimSettlements(copy, '2026-02-01').unmatched.map(e => e.code),
    ['claim-not-found']);
});

test('B02: missing/deactivated financial source and an earlier-dated settlement stay unmatched', () => {
  const p = makeProject();
  const settlement = eventFor(p, findClaim(p, 'ben'));
  p.events.push(settlement);
  assert.equal(matchClaimSettlements(p, '2026-01-31').matched.length, 0);
  assert.equal(matchClaimSettlements(p, '2026-02-01').matched.length, 1);

  p.events[0].financialMode = 'none';
  assert.deepEqual(matchClaimSettlements(p, '2026-02-01').unmatched.map(e => e.code), ['claim-not-found']);
  p.events[0].financialMode = 'derived';
  p.events = p.events.filter(event => event.id !== 'purchase');
  assert.deepEqual(matchClaimSettlements(p, '2026-02-01').unmatched.map(e => e.code), ['missing-source']);

  const later = makeProject();
  const future = createClaimSettlementEvent(later, {
    date: '2025-12-31', amountCents: 6000, settlementKind: 'paid',
    ...claimReferenceFields(findClaim(later, 'ben'))
  });
  later.events.push(future);
  assert.deepEqual(matchClaimSettlements(later, '2026-04-01').unmatched.map(e => e.code),
    ['source-after-settlement']);
  assert.throws(() => createClaimSettlementForClaim(makeProject(), findClaim(makeProject(), 'ben'), {
    date: '2025-12-31', amountCents: 6000, settlementKind: 'paid'
  }), TypeError);
});

test('B02: same-day ordering matters; an event before its source cannot match', () => {
  const p = makeProject();
  p.events[0].date = '2026-02-01';
  p.events[0].order = 2;
  const event = createClaimSettlementEvent(p, {
    date: '2026-02-01', amountCents: 6000, settlementKind: 'paid',
    ...claimReferenceFields(findClaim(p, 'ben'))
  });
  event.order = 1;
  p.events.unshift(event);
  assert.deepEqual(matchClaimSettlements(p, '2026-02-01').unmatched.map(e => e.code),
    ['source-after-settlement']);
  event.order = 3;
  assert.equal(matchClaimSettlements(p, '2026-02-01').matched.length, 1);
});

test('B02: duplicate settlement IDs, duplicate source IDs and duplicate claim keys are not guessed', () => {
  const p = makeProject();
  const entry = eventFor(p, findClaim(p, 'ben'));
  p.events.push(entry);
  p.events.push({ ...entry, order: entry.order + 1 });
  assert.deepEqual(matchClaimSettlements(p, '2026-02-01').unmatched.map(x => x.code),
    ['duplicate-settlement-id', 'duplicate-settlement-id']);
  p.events.pop();

  p.events.push({ ...p.events[0] });
  assert.deepEqual(matchClaimSettlements(p, '2026-02-01').unmatched.map(x => x.code),
    ['ambiguous-source']);

  const withRepeatedChildren = {
    people: p.people, items: p.items, events: [
      { id: 'base', type: 'item-added', date: '2026-01-01', order: 1,
        itemId: 'fridge', initialValue: 100, valuation: fixed, shares: { anna: 1 } },
      { id: 'group', type: 'redistribution-executed', date: '2026-02-01', order: 2,
        financialMode: 'derived', events: [
          { id: 'child', type: 'shares-set', itemId: 'fridge', shares: { ben: 1 } },
          { id: 'other', type: 'shares-set', itemId: 'fridge', shares: { anna: 1 } },
          { id: 'child', type: 'shares-set', itemId: 'fridge', shares: { ben: 1 } }
        ] }
    ]
  };
  const candidate = deriveClaims(withRepeatedChildren, '2026-02-01')
    .find(claim => claim.debtorPersonId === 'ben');
  assert.equal(deriveClaims(withRepeatedChildren, '2026-02-01')
    .filter(c => claimReferenceKey(c) === claimReferenceKey(candidate)).length, 2);
  withRepeatedChildren.events.push(createClaimSettlementEvent(withRepeatedChildren, {
    date: '2026-02-02', amountCents: 1000, settlementKind: 'paid',
    ...claimReferenceFields(candidate)
  }));
  assert.deepEqual(matchClaimSettlements(withRepeatedChildren, '2026-02-02')
    .unmatched.map(x => x.code), ['ambiguous-claim']);
});
