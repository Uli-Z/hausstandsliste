// Q31: explicit acquisition contributions are nonnegative integer cents.
export function contributionProblem(amountCents, contributions, people) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0 ||
      !contributions || typeof contributions !== 'object' || Array.isArray(contributions) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(contributions))) return 'INVALID_CONTRIBUTIONS';
  let total = 0;
  for (const [id, cents] of Object.entries(contributions)) {
    if (!people.has(id) || !Number.isSafeInteger(cents) || cents < 0) return 'INVALID_CONTRIBUTIONS';
    total += cents;
    if (!Number.isSafeInteger(total)) return 'INVALID_CONTRIBUTIONS';
  }
  return total === amountCents ? null : 'CONTRIBUTION_SUM_MISMATCH';
}
export function contributionTotal(contributions) {
  return Object.values(contributions || {}).reduce((sum, cents) => sum + cents, 0);
}
// Only explicit acquisition contributions exist. A neutral successor is not a purchase.
export function recordedContributions(event) {
  return event.purchaseContributionsCents ?? null;
}

// Shared rule for persisted purchase events and direct mutations.
export function purchaseEventProblem(event, people, successor = false) {
  if (successor) return event.financialMode === 'none' && !Object.hasOwn(event,'purchaseContributionsCents')
    ? null : 'INVALID_CONTRIBUTIONS';
  if (event.financialMode !== 'derived') return 'INVALID_CONTRIBUTIONS';
  return contributionProblem(Math.round(event.initialValue*100),event.purchaseContributionsCents,people);
}
