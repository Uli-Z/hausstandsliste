/**
 * B03: calculate the locally outstanding part of each derived claim from
 * matched dated settlement events. No second persistent balance or paid flag.
 *
 * Matched events are already sorted in historical date/order by B02.
 * Excess allocations are kept as explicit problems, never as a negative
 * balance, a credit, or a settlement of some unrelated claim.
 */
export function applyClaimSettlements(claims, matched, unmatched = []) {
  const positions = claims.map(claim => ({
    claim,
    claimKey: null,
    amountCents: claim.amountCents,
    paidCents: 0,
    externalCents: 0,
    waivedCents: 0,
    settledCents: 0,
    outstandingCents: claim.amountCents,
    status: 'open',
    settlements: []
  }));
  const positionsByClaim = new Map(positions.map(position => [position.claim, position]));
  const settlements = [];
  const warnings = [...unmatched];

  for (const { event, claim, claimKey } of matched) {
    const position = positionsByClaim.get(claim);
    if (!position) {
      warnings.push({
        event, code: 'claim-not-found',
        message: 'Ausgleich ohne vorhandene Forderungsposition.'
      });
      continue;
    }
    position.claimKey = claimKey;
    const appliedCents = Math.min(position.outstandingCents, event.amountCents);
    const excessCents = event.amountCents - appliedCents;
    position.outstandingCents -= appliedCents;
    position.settledCents += appliedCents;
    if (event.settlementKind === 'paid') position.paidCents += appliedCents;
    else if (event.settlementKind === 'external') position.externalCents += appliedCents;
    else if (event.settlementKind === 'waived') position.waivedCents += appliedCents;
    const entry = { event, claim, claimKey, appliedCents, excessCents };
    position.settlements.push(entry);
    settlements.push(entry);
    if (excessCents > 0) {
      warnings.push({
        event, claimKey, code: 'over-settlement', excessCents,
        message: 'Ausgleichsbetrag übersteigt den offenen Forderungsrest. Überschuss wird nicht angerechnet.'
      });
    }
  }

  for (const position of positions) {
    if (!position.settledCents) {
      position.status = 'open';
    } else if (position.outstandingCents > 0) {
      position.status = 'partial';
    } else {
      const types = [
        ['paid', position.paidCents],
        ['external', position.externalCents],
        ['waived', position.waivedCents]
      ].filter(([, cents]) => cents > 0);
      position.status = types.length === 1 ? types[0][0] : 'mixed';
    }
  }

  const openClaims = positions
    .filter(position => position.outstandingCents > 0)
    .map(position => ({
      ...position.claim,
      amountCents: position.outstandingCents
    }));
  const itemMap = new Map();
  for (const position of positions) {
    const itemId = position.claim.itemId;
    if (!itemMap.has(itemId)) {
      itemMap.set(itemId, {
        itemId, amountCents: 0, paidCents: 0, externalCents: 0,
        waivedCents: 0, outstandingCents: 0, claimPositions: []
      });
    }
    const row = itemMap.get(itemId);
    row.amountCents += position.amountCents;
    row.paidCents += position.paidCents;
    row.externalCents += position.externalCents;
    row.waivedCents += position.waivedCents;
    row.outstandingCents += position.outstandingCents;
    row.claimPositions.push(position);
  }

  return {
    claimPositions: positions,
    openClaims,
    itemBalances: [...itemMap.values()],
    settlements,
    unmatchedSettlements: unmatched,
    warnings
  };
}
