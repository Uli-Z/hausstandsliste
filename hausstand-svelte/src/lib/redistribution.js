import { itemDisplayName } from './itemNames.js';
import { message, getLocale, formatMoney } from './i18n.js';
import { normShares, shareTotal, money } from './domain.js';
import { projectAt, projectBeforeEvent, shareDeltasForChange } from './projector.js';
import { shareUnitDeltas, resolveShareEvent, ShareUnitError } from './shareUnits.js';

export function sharesEqual(left, right) {
  const a = normShares(left);
  const b = normShares(right);
  const ids = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return ids.every(personId => Number(a[personId] || 0) === Number(b[personId] || 0));
}

export function formatShares(shares, peopleById) {
  return Object.entries(normShares(shares))
    .map(([personId, units]) => `${peopleById.get(personId)?.name || personId}: ${units}`)
    .join(' · ');
}

// Actual unit movements, distinct from changes in fractional ownership value.
// Stored events already contain the canonical signed map; draft targets use
// the very same exact decimal arithmetic as event creation.
export function unitChangeEntries(change, beforeShares = {}) {
  const deltas = change.type === 'shares-set'
    ? change.shareUnitDeltas
    : shareUnitDeltas(beforeShares, normShares(change.shares));
  return Object.entries(deltas).filter(([, units]) => units !== 0)
    .map(([personId, unitsDelta]) => ({ personId, unitsDelta }));
}

// Read-only summaries need no projection or monetary threshold: even a
// zero-valued item can have a real ownership change.
export function eventUnitChangeRows(event) {
  const children = event.type === 'redistribution-executed' ? event.events || [] : [event];
  return children.filter(child => child.type === 'shares-set')
    .map(child => ({ itemId: child.itemId, people: unitChangeEntries(child) }))
    .filter(row => row.people.length);
}

export function buildRedistributionItemRows(baseProjection, changes = [], itemIds = null) {
  if (!baseProjection) return [];

  const changeByItemId = new Map((changes || []).map(change => [change.itemId, change]));
  const baseItems = itemIds
    ? itemIds.map(itemId => baseProjection.items.find(item => item.id === itemId)).filter(Boolean)
    : baseProjection.activeItems;

  return baseItems.map(item => {
    const change = changeByItemId.get(item.id) || null;
    const beforeShares = normShares(item.shares || {});
    let afterShares = beforeShares;
    let entries = [];
    let unitDeltaProblem = false;
    if (change) {
      try {
        afterShares = change.type === 'shares-set' ? resolveShareEvent(beforeShares, change) : normShares(change.shares);
        entries = unitChangeEntries(change, beforeShares);
      } catch (error) {
        if (!(error instanceof ShareUnitError)) throw error;
        unitDeltaProblem = true;
      }
    }
    const deltas = change && !unitDeltaProblem ? shareDeltasForChange(baseProjection, change) : [];
    const changedPeople = entries.map(({ personId, unitsDelta }) => ({
      personId,
      personName: baseProjection.peopleById.get(personId)?.name || personId,
      beforeUnits: Number(beforeShares[personId] || 0),
      afterUnits: Number(afterShares[personId] || 0),
      unitsDelta,
      valueDelta: deltas.find(entry => entry.personId === personId)?.delta || 0
    }));

    return {
      itemId: item.id,
      itemName: itemDisplayName(item),
      itemValue: item.value,
      changed: entries.length > 0 || unitDeltaProblem,
      unitDeltaProblem,
      beforeShares,
      afterShares,
      beforeSummary: formatShares(beforeShares, baseProjection.peopleById),
      afterSummary: formatShares(afterShares, baseProjection.peopleById),
      changedPeople
    };
  }).sort((a, b) => {
    if (a.changed !== b.changed) return a.changed ? -1 : 1;
    return a.itemName.localeCompare(b.itemName, 'de');
  });
}

/**
 * Erzeugt eine Liste von Änderungen für eine Umverteilung, um alle Anteile einer Person
 * auf eine andere zu übertragen.
 */
export function buildTransferChanges(projectionAtDate, sourcePersonId, targetPersonId) {
  if (!sourcePersonId || !targetPersonId || sourcePersonId === targetPersonId) return [];
  
  const changes = [];
  for (const item of projectionAtDate.activeItems) {
    if (item.shares && item.shares[sourcePersonId]) {
      const sourceUnits = item.shares[sourcePersonId];
      const targetUnits = item.shares[targetPersonId] || 0;
      const newShares = { ...item.shares };
      delete newShares[sourcePersonId];
      newShares[targetPersonId] = sourceUnits + targetUnits;
      changes.push({ itemId: item.id, shares: normShares(newShares) });
    }
  }
  return changes;
}

/**
 * Items for which a person is the last owner cannot be removed via the
 * redistribution shortcut. They must be transferred or explicitly ended.
 */
export function soleOwnedItems(projectionAtDate, sourcePersonId) {
  if (!sourcePersonId) return [];
  return (projectionAtDate?.activeItems || []).filter(item => {
    if (Number(item.shares?.[sourcePersonId] || 0) <= 0) return false;
    const remaining = { ...item.shares };
    delete remaining[sourcePersonId];
    return shareTotal(normShares(remaining)) <= 0;
  });
}

/**
 * Remove a person's units only when another owner would remain.
 * The caller can use soleOwnedItems() to explain skipped items.
 */
export function buildRemovePersonChanges(projectionAtDate, sourcePersonId) {
  if (!sourcePersonId) return [];
  
  const changes = [];
  for (const item of projectionAtDate.activeItems) {
    if (item.shares && item.shares[sourcePersonId]) {
      const newShares = { ...item.shares };
      delete newShares[sourcePersonId];
      const clean = normShares(newShares);
      if (shareTotal(clean) <= 0) continue; // Never create an ownerless active item.
      changes.push({ itemId: item.id, shares: clean });
    }
  }
  return changes;
}

/**
 * Erzeugt eine Liste von Änderungen für eine Umverteilung, um eine Person überall hinzuzufügen.
 */
export function buildAddPersonChanges(projectionAtDate, targetPersonId, units) {
  if (!targetPersonId || units <= 0) return [];
  
  const changes = [];
  for (const item of projectionAtDate.activeItems) {
    const newShares = { ...item.shares };
    newShares[targetPersonId] = units;
    changes.push({ itemId: item.id, shares: normShares(newShares) });
  }
  return changes;
}

/**
 * Berechnet die Vorschau einer Umverteilung (Deltas und Ausgleichszahlungen).
 */
export function redistributionPreview(project, redistribution, { beforeEventId = null, order = null } = {}) {
  // For historical corrections, evaluate the exact position of that event;
  // future/same-day-later events must not contaminate the valuation.
  // New planned redistributions are appended after other events on their date.
  const base = beforeEventId
    ? projectBeforeEvent(project, beforeEventId, redistribution.effectiveDate, order)
    : projectAt(project, redistribution.effectiveDate);
  const deltas = new Map();
  
  for (const change of redistribution.changes || []) {
    for (const row of shareDeltasForChange(base, change)) {
      const existing = deltas.get(row.personId) || { personId: row.personId, personName: row.personName, deltaCents: 0 };
      existing.deltaCents += row.deltaCents;
      deltas.set(row.personId, existing);
    }
  }
  
  const rows = [...deltas.values()]
    .filter(row => row.deltaCents !== 0)
    .sort((a, b) => b.deltaCents - a.deltaCents)
    .map(({deltaCents, ...row}) => ({...row, delta: deltaCents / 100}));

  return {
    base,
    rows,
    payments: redistribution.financialMode === 'derived' ? settlementRecommendations(rows) : [],
    itemRows: buildRedistributionItemRows(base, redistribution.changes || []).filter(row => row.changed)
  };
}

/**
 * Berechnet Ausgleichsempfehlungen basierend auf Deltas.
 */
export function settlementRecommendations(deltas) {
  const debtors = deltas
    .map(d => ({...d, cents: Math.round(d.delta * 100)}))
    .filter(d => d.cents > 0);

  const creditors = deltas
    .map(d => ({...d, cents: -Math.round(d.delta * 100)}))
    .filter(d => d.cents > 0);

  const payments = [];
  let i = 0, j = 0;
  
  while (i < debtors.length && j < creditors.length) {
    const cents = Math.min(debtors[i].cents, creditors[j].cents);
    if (cents > 0) {
      payments.push({ 
        fromPersonId: debtors[i].personId, 
        from: debtors[i].personName, 
        toPersonId: creditors[j].personId, 
        to: creditors[j].personName, 
        amount: cents / 100
      });
    }
    debtors[i].cents -= cents;
    creditors[j].cents -= cents;
    if (debtors[i].cents === 0) i++;
    if (creditors[j].cents === 0) j++;
  }
  return payments;
}

/**
 * Erzeugt einen Markdown-Bericht für eine Umverteilung.
 */
export function redistributionMarkdown(redistribution, preview, lang = getLocale()) {
  const t = (key, params) => message(key, lang, params);
  const lines = [
    '# ' + t('report.title', { title: redistribution.title }),
    '',
    t('report.date', { date: redistribution.effectiveDate }),
    '',
    '## ' + t('report.value')
  ];
  
  for (const row of preview.rows) {
    lines.push(`- ${row.personName}: ${row.delta > 0 ? '+' : ''}${formatMoney(row.delta, lang)}`);
  }
  
  if (redistribution.financialMode !== 'derived') {
    lines.push('', '## ' + t('report.effect'), t('report.noClaim'));
  } else {
    lines.push('', '## ' + t('report.suggestions'));
    if (preview.payments.length === 0) {
      lines.push(t('report.none'));
    } else {
      for (const p of preview.payments) {
        lines.push('- ' + t('report.payment', { from: p.from, to: p.to, amount: formatMoney(p.amount, lang) }));
      }
    }
    lines.push('', t('report.disclaimer'));
  }
  
  return lines.join('\n');
}
