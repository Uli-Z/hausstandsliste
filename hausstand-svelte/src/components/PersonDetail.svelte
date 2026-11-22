<script>
  import { appState, createEvent } from '../stores/projectStore.js';
  import { money, normShares } from '../lib/domain.js';
  import { dateDE } from '../lib/util.js';
  import Timeline from './Timeline.svelte';
  import BalanceBreakdown from './BalanceBreakdown.svelte';
  import HelpTip from './HelpTip.svelte';
  export let person;
  export let projection;
  export let asOfDate;
  export let ledger = null;
  $: balanceCents = ledger?.balances?.get(person.id) || 0;
  $: balanceDetail = ledger?.details?.get(person.id) || null;
  $: transfersForPerson = (ledger?.simplified || []).filter(t => t.fromPersonId === person.id || t.toPersonId === person.id);
  const nameOf = id => $appState.project.people.find(p => p.id === id)?.name || id;
  let transferDialogOpen = false;
  let transferTargetId = '';

  $: activeTargets = (projection?.people || []).filter(p => p.active && String(p.id) !== String(person.id));

  function runTransfer(target) {
    if (!target) return;
    const changes = (person.holdings || []).map(h => {
      const sourceUnits = Number(h.item.shares?.[person.id] || 0);
      const targetUnits = Number(h.item.shares?.[target.id] || 0);
      const shares = { ...(h.item.shares || {}) };
      delete shares[person.id];
      shares[target.id] = sourceUnits + targetUnits;
      return { itemId: h.item.id, shares: normShares(shares) };
    }).filter(c => Object.keys(c.shares).length);

    appState.startRedistribution(
      `Alle Anteile von ${person.name} an ${target.name} übertragen`,
      asOfDate,
      changes,
      { sourcePersonId: person.id, targetPersonId: target.id }
    );
  }

  function startDissolve() {
    const changes = (person.holdings || []).map(h => {
      const shares = { ...(h.item.shares || {}) };
      delete shares[person.id];
      return { itemId: h.item.id, shares: normShares(shares) };
    }).filter(c => Object.keys(c.shares).length);
    appState.startRedistribution(`Alle Anteile von ${person.name} auflösen`, asOfDate, changes, { sourcePersonId: person.id });
  }

  function startTransfer() {
    if (!activeTargets.length) {
      alert('Keine aktive Zielperson verfügbar.');
      return;
    }
    if (activeTargets.length === 1) {
      runTransfer(activeTargets[0]);
      return;
    }
    transferTargetId = '';
    transferDialogOpen = true;
  }

  function confirmTransferTarget() {
    const target = activeTargets.find(p => String(p.id) === String(transferTargetId));
    if (!target) return;
    transferDialogOpen = false;
    runTransfer(target);
  }
</script>
<section class="panel"><div class="panel-body">
  <div class="breadcrumb"><button on:click={() => appState.setRoute({ page: 'dashboard' })}>← Übersicht</button><span>Person</span></div>
  <div class="detail-hero">
    <div class="stack">
      <div class="detail-title"><h2>👤 {person.name}</h2>{#if !person.active}<span class="person-inactive">{person.inactiveFrom ? 'Ausgezogen' : 'Nicht mehr dabei'}</span>{/if}</div>
      <div class="grid-3"><div class="mini-card"><div class="muted">Gesamtwert</div><strong>{money(person.totalValue || 0)}</strong></div><div class="mini-card"><div class="muted">Gegenstände</div><strong>{person.holdings?.length || 0}</strong></div><div class="mini-card"><div class="muted">{balanceCents > 0 ? 'Noch zu erhalten' : balanceCents < 0 ? 'Noch auszugleichen' : 'Ausgleichssaldo'}</div><strong>{money(Math.abs(balanceCents) / 100)}</strong></div></div>
    </div>
    <div class="mini-card stack"><strong>Aktionen</strong><div class="action-grid">
      <button on:click={() => appState.setDialog({ type: 'personMeta', personId: person.id })}>Person bearbeiten</button>
      {#if person.active}<button on:click={() => appState.mutateProject(p => p.events.push(createEvent('person-deactivated', asOfDate, { personId: person.id, reason: 'Auszug' }, p)))}>Als ausgezogen markieren</button>{:else}<button on:click={() => appState.mutateProject(p => p.events.push(createEvent('person-reactivated', asOfDate, { personId: person.id, reason: 'Wiedereinzug' }, p)))}>Wieder aufnehmen</button>{/if}
      <button on:click={startTransfer}>Anteile übertragen</button>
      <button on:click={startDissolve}>Anteile entfernen</button>
    </div></div>
  </div>
</div></section>
<section class="panel" style="margin-top:16px">
  <div class="panel-header"><div class="help-heading"><h2>Ausgleichssaldo im Detail</h2><HelpTip label="Wie entsteht dieser Ausgleichssaldo?">Der Saldo ergibt sich aus historischen Anschaffungswerten, erhaltenen oder abgegebenen Eigentumsanteilen und dokumentierten Ausgleichszahlungen. Die aktuelle Abschreibung ändert diese früheren Wertbewegungen nicht rückwirkend.</HelpTip></div></div>
  <div class="panel-body">
    <BalanceBreakdown detail={balanceDetail} {balanceCents}/>
  </div>
</section>
{#if transfersForPerson.length}
  <section class="panel" style="margin-top:16px">
    <div class="panel-header"><div class="help-heading"><h2>Ausgleichsmöglichkeiten</h2><HelpTip label="Was bedeuten die Ausgleichsmöglichkeiten?">Dies sind mögliche Zahlungswege zum gemeinschaftlichen Ausgleich. Erst nach der Bestätigung einer bereits geleisteten Zahlung wird diese im Verlauf dokumentiert.</HelpTip></div></div>
    <div class="panel-body stack">
      {#each transfersForPerson as transfer, index (transfer.fromPersonId + ':' + transfer.toPersonId + ':' + index)}
        <div class="split">
          <span>{nameOf(transfer.fromPersonId)} an {nameOf(transfer.toPersonId)} · <strong>{money(transfer.amountCents / 100)}</strong></span>
          <button on:click={() => appState.setDialog({ type: 'settlementAdd', payerPersonId: transfer.fromPersonId, recipientPersonId: transfer.toPersonId, amountCents: transfer.amountCents })} disabled={$appState.readOnly}>Ausgleichen</button>
        </div>
      {/each}
    </div>
  </section>
{/if}
<section class="grid-2" style="margin-top:16px">
  <section class="panel"><div class="panel-header"><h2>💶 Gehaltene Anteile</h2></div><div class="panel-body">
    {#if person.holdings?.length}<table><thead><tr><th>Gegenstand</th><th class="right">Einheiten</th><th class="money">Wertanteil</th></tr></thead><tbody>{#each person.holdings as h}<tr class="clickable-row" on:click={() => appState.setRoute({ page: 'item', id: h.item.id })}><td>{h.item.name}</td><td class="right">{h.units}</td><td class="money">{money(h.value)}</td></tr>{/each}</tbody></table>{:else}<div class="empty">Keine Anteile zum Stichtag.</div>{/if}
  </div></section>
  <section class="panel">
    <Timeline project={$appState.project} asOfDate={$appState.asOfDate} personId={person.id} title="🕒 Personen-Timeline" />
  </section>
</section>

{#if transferDialogOpen}
  <div class="modal-backdrop">
    <div class="modal" style="max-width: 520px">
      <div class="modal-header">
        <h3>Anteile übertragen</h3>
        <button class="ghost" on:click={() => transferDialogOpen = false}>✕</button>
      </div>
      <div class="modal-body stack">
        <div>An wen sollen alle Anteile von <strong>{person.name}</strong> übertragen werden?</div>
        <label>Zielperson
          <select bind:value={transferTargetId}>
            <option value="">wählen …</option>
            {#each activeTargets as target}
              <option value={target.id}>{target.name}</option>
            {/each}
          </select>
        </label>
      </div>
      <div class="modal-footer">
        <button on:click={() => transferDialogOpen = false}>Abbrechen</button>
        <button class="primary" on:click={confirmTransferTarget} disabled={!transferTargetId}>Weiter</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .help-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .person-inactive { color:var(--muted);font-size:13px; }
</style>
