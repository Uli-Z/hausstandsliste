<script>
  import { appState, createEvent } from '../stores/projectStore.js';
  import { money, normShares } from '../lib/domain.js';
  import { dateDE } from '../lib/util.js';
  import Timeline from './Timeline.svelte';
  export let person;
  export let projection;
  export let asOfDate;
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
    const changes = person.holdings.map(h => {
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
      <div class="detail-title"><h2>👤 {person.name}</h2><span class="badge" class:ok={person.active} class:warn={!person.active}>{person.active ? 'aktiv' : 'inaktiv'}</span></div>
      <div class="grid-3"><div class="mini-card"><div class="muted">Gesamtwert</div><strong>{money(person.totalValue || 0)}</strong></div><div class="mini-card"><div class="muted">Gegenstände</div><strong>{person.holdings?.length || 0}</strong></div><div class="mini-card"><div class="muted">Status</div><strong>{person.active ? 'aktiv' : 'inaktiv'}</strong></div></div>
    </div>
    <div class="mini-card stack"><strong>⚡ Aktionen</strong><div class="action-grid">
      <button on:click={() => appState.setDialog({ type: 'personMeta', personId: person.id })}>✏️ Stammdaten</button>
      {#if person.active}<button on:click={() => appState.mutateProject(p => p.events.push(createEvent('person-deactivated', asOfDate, { personId: person.id, reason: 'Auszug' })))}>🚪 Deaktivieren</button>{:else}<button on:click={() => appState.mutateProject(p => p.events.push(createEvent('person-reactivated', asOfDate, { personId: person.id, reason: 'Wiedereinzug' })))}>🔄 Reaktivieren</button>{/if}
      <button on:click={startTransfer}>🔁 Alle Anteile übertragen</button>
      <button on:click={startDissolve}>🧹 Alle Anteile auflösen</button>
    </div><div class="notice">Übertragen/Auflösen startet eine neue Umverteilung und öffnet direkt den Prüf-Dialog.</div></div>
  </div>
</div></section>
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
        <h3>🔁 Anteile übertragen</h3>
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
