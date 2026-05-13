import { normShares, shareTotal, money } from './domain.js';
import { projectAt, shareDeltasForChange } from './projector.js';

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

export function buildRedistributionItemRows(baseProjection, changes = [], itemIds = null) {
  if (!baseProjection) return [];

  const changeByItemId = new Map((changes || []).map(change => [change.itemId, change]));
  const baseItems = itemIds
    ? itemIds.map(itemId => baseProjection.items.find(item => item.id === itemId)).filter(Boolean)
    : baseProjection.activeItems;

  return baseItems.map(item => {
    const change = changeByItemId.get(item.id) || null;
    const beforeShares = normShares(item.shares || {});
    const afterShares = change ? normShares(change.shares) : beforeShares;
    const deltas = change ? shareDeltasForChange(baseProjection, change) : [];
    const peopleIds = [...new Set([...Object.keys(beforeShares), ...Object.keys(afterShares)])];

    const changedPeople = peopleIds.map(personId => {
      const beforeUnits = Number(beforeShares[personId] || 0);
      const afterUnits = Number(afterShares[personId] || 0);
      const delta = deltas.find(entry => entry.personId === personId);
      const valueDelta = delta?.delta || 0;
      return {
        personId,
        personName: baseProjection.peopleById.get(personId)?.name || personId,
        beforeUnits,
        afterUnits,
        unitsDelta: afterUnits - beforeUnits,
        valueDelta
      };
    }).filter(row => row.beforeUnits !== row.afterUnits || Math.abs(row.valueDelta) > 0.005);

    return {
      itemId: item.id,
      itemName: item.name,
      itemValue: item.value,
      changed: !!change && !sharesEqual(beforeShares, afterShares),
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
 * Erzeugt eine Liste von Änderungen für eine Umverteilung, um alle Anteile einer Person zu entfernen.
 */
export function buildRemovePersonChanges(projectionAtDate, sourcePersonId) {
  if (!sourcePersonId) return [];
  
  const changes = [];
  for (const item of projectionAtDate.activeItems) {
    if (item.shares && item.shares[sourcePersonId]) {
      const newShares = { ...item.shares };
      delete newShares[sourcePersonId];
      changes.push({ itemId: item.id, shares: normShares(newShares) });
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
export function redistributionPreview(project, redistribution) {
  const base = projectAt(project, redistribution.effectiveDate);
  const deltas = new Map();
  
  for (const change of redistribution.changes || []) {
    for (const row of shareDeltasForChange(base, change)) {
      const existing = deltas.get(row.personId) || { personId: row.personId, personName: row.personName, delta: 0 };
      existing.delta += row.delta;
      deltas.set(row.personId, existing);
    }
  }
  
  const rows = [...deltas.values()]
    .filter(row => Math.abs(row.delta) > 0.005)
    .sort((a, b) => b.delta - a.delta);

  return {
    base,
    rows,
    payments: settlementRecommendations(rows),
    itemRows: buildRedistributionItemRows(base, redistribution.changes || [])
  };
}

/**
 * Berechnet Ausgleichsempfehlungen basierend auf Deltas.
 */
export function settlementRecommendations(deltas) {
  const debtors = deltas
    .filter(d => d.delta > 0.005)
    .map(d => ({ ...d, amount: d.delta }));

  const creditors = deltas
    .filter(d => d.delta < -0.005)
    .map(d => ({ ...d, amount: -d.delta }));

  const payments = [];
  let i = 0, j = 0;
  
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0.005) {
      payments.push({ 
        fromPersonId: debtors[i].personId, 
        from: debtors[i].personName, 
        toPersonId: creditors[j].personId, 
        to: creditors[j].personName, 
        amount 
      });
    }
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount <= 0.005) i++;
    if (creditors[j].amount <= 0.005) j++;
  }
  return payments;
}

/**
 * Erzeugt einen Markdown-Bericht für eine Umverteilung.
 */
export function redistributionMarkdown(redistribution, preview) {
  const lines = [
    `# Ausgleichsempfehlung: ${redistribution.title}`,
    '',
    `Stichtag: ${redistribution.effectiveDate}`,
    '',
    '## Wertverschiebung'
  ];
  
  for (const row of preview.rows) {
    lines.push(`- ${row.personName}: ${row.delta > 0 ? '+' : ''}${money(row.delta)}`);
  }
  
  lines.push('', '## Empfohlener Ausgleich');
  
  if (preview.payments.length === 0) {
    lines.push('Kein Ausgleich erforderlich.');
  } else {
    for (const p of preview.payments) {
      lines.push(`- ${p.from} zahlt ${money(p.amount)} an ${p.to}`);
    }
  }
  
  return lines.join('\n');
}
