import { normShares } from './domain.js';
import { decimal } from './shareUnits.js';

// Exact ratios of the stored JSON numbers' shortest decimal representations.
// No percentages or floating-point products are used in the allocation.
// ID order is locale-independent; renaming/reordering people cannot move cents.
const compareId = (a,b) => a < b ? -1 : a > b ? 1 : 0;
export function allocateCents(amountCents, shares) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) return {};
  const entries = Object.entries(normShares(shares))
    .filter(([, units]) => Number.isFinite(units))
    .sort(([a],[b]) => compareId(a,b))
    .map(([personId,units]) => ({ personId, parts: decimal(units) }));
  if (!entries.length) return {};
  const exponent = entries.reduce((min,row) => Math.min(min,row.parts[1]), entries[0].parts[1]);
  const rows = entries.map(({personId,parts:[coefficient,power]}) => ({
    personId, weight: coefficient * 10n ** BigInt(power-exponent)
  }));
  const total = rows.reduce((sum,row) => sum + row.weight, 0n);
  const amount = BigInt(amountCents);
  for (const row of rows) {
    const numerator = amount * row.weight;
    row.cents = numerator / total;
    row.remainder = numerator % total;
  }
  let remaining = amount - rows.reduce((sum,row) => sum + row.cents, 0n);
  const ranked = [...rows].sort((a,b) => a.remainder === b.remainder
    ? compareId(a.personId,b.personId) : a.remainder > b.remainder ? -1 : 1);
  for (const row of ranked) {
    if (remaining === 0n) break;
    row.cents++;
    remaining--;
  }
  return Object.fromEntries(rows.map(row => [row.personId,Number(row.cents)]));
}
