// Q30: shared arithmetic for absolute ownership units, never percentages.
// The persisted representation remains JSON numbers. Use decimal arithmetic
// on their shortest round-trip representations to avoid binary float drift.
// Reject unrepresentable results rather than silently rounding or clipping.

const map = value => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = n => typeof n === 'number' && Number.isFinite(n);

export const validShareMap = shares => map(shares) &&
  Object.values(shares).every(units => finite(units) && units >= 0) &&
  Number.isFinite(Object.values(shares).reduce((sum,n) => sum+n,0));

export const validShareUnitDeltas = deltas => map(deltas) &&
  Object.values(deltas).every(units => finite(units) && units !== 0);

const ownUnits = (shares,id) => Object.hasOwn(shares,id) ? shares[id] : 0;
const idsOf = (a,b) => [...new Set([...Object.keys(a), ...Object.keys(b)])];

function normalized(coefficient, exponent) {
  if (coefficient === 0n) return [0n,0];
  while (coefficient % 10n === 0n) {
    coefficient /= 10n;
    exponent++;
  }
  return [coefficient, exponent];
}

function decimal(n) {
  const [mantissa, exponent = '0'] = String(n).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  return normalized(BigInt(whole + fraction), Number(exponent) - fraction.length);
}

function exactSum(a,b,personId) {
  const [ac,ae] = decimal(a);
  const [bc,be] = decimal(b);
  const exponent = Math.min(ae,be);
  const [coefficient,power] = normalized(
    ac * 10n ** BigInt(ae-exponent) + bc * 10n ** BigInt(be-exponent), exponent);
  const result = Number(`${coefficient}e${power}`);
  if (!Number.isFinite(result)) throw new ShareUnitError('SHARE_PRECISION',personId,a,b);
  const [rc,re] = decimal(result);
  if (rc !== coefficient || re !== power)
    throw new ShareUnitError('SHARE_PRECISION',personId,a,b);
  return result;
}

export class ShareUnitError extends Error {
  constructor(code,personId = null,beforeUnits = null,deltaUnits = null) {
    super(code);
    this.name = 'ShareUnitError';
    Object.assign(this,{code,personId,beforeUnits,deltaUnits});
  }
}

// Convert a form's desired absolute distribution into a canonical signed map.
// A zero entry is omitted; an empty map is a valid no-op.
export function shareUnitDeltas(before, target) {
  if (!validShareMap(before) || !validShareMap(target))
    throw new ShareUnitError('INVALID_SHARES');
  if (!Object.values(target).some(n => n > 0))
    throw new ShareUnitError('OWNERLESS_ITEM');
  return Object.fromEntries(idsOf(before,target)
    .map(id => [id,exactSum(ownUnits(target,id),-ownUnits(before,id),id)])
    .filter(([,units]) => units !== 0));
}

// Apply at the actual chronological position; untouched people retain units.
// Invalid transitions are rejected atomically, with the conflicting person's
// before/delta values available to the central transaction guard.
export function applyShareUnitDeltas(before,deltas) {
  if (!validShareMap(before) || !validShareUnitDeltas(deltas))
    throw new ShareUnitError('INVALID_SHARES');
  const rows = idsOf(before,deltas).map(id => {
    const previous = ownUnits(before,id), delta = ownUnits(deltas,id);
    const units = exactSum(previous,delta,id);
    if (units < 0) throw new ShareUnitError('NEGATIVE_SHARE',id,previous,delta);
    return [id,units];
  }).filter(([,units]) => units > 0);
  if (!rows.length) throw new ShareUnitError('OWNERLESS_ITEM');
  const result = Object.fromEntries(rows);
  if (!validShareMap(result)) throw new ShareUnitError('SHARE_PRECISION');
  return result;
}

// The persisted shares-set event always contains signed unit changes.
// Draft and purchase share maps remain absolute allocations.
export const validStoredShareEvent = event => !!event && event.type === 'shares-set' &&
  !Object.hasOwn(event,'shares') && validShareUnitDeltas(event.shareUnitDeltas);
export function resolveShareEvent(before,event) {
  if (!validStoredShareEvent(event)) throw new ShareUnitError('INVALID_SHARES');
  return applyShareUnitDeltas(before,event.shareUnitDeltas);
}
