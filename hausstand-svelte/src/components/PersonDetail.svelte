<script>
  import { appState, createEvent, createRedistribution } from '../stores/projectStore.js';
  import { money, normShares } from '../lib/domain.js';
  export let person;
  export let projection;
  export let asOfDate;

  function startDissolve() {
    const changes = person.holdings.map(h => {
      const shares = { ...(h.item.shares || {}) };
      delete shares[person.id];
      return { itemId: h.item.id, shares: normShares(shares) };
    }).filter(c => Object.keys(c.shares).length);
    const redistribution = createRedistribution(`Alle Anteile von ${person.name} auflösen`, asOfDate, changes);
    appState.mutateProject(p => p.redistributions.push(redistribution));
    appState.setDialog({ type: 'redistributionEdit', id: redistribution.id, initialAction: 'remove-person-shares', sourcePersonId: person.id });
  }

  function startTransfer() {
    const redistribution = createRedistribution(`Alle Anteile von ${person.name} übertragen`, asOfDate, []);
    appState.mutateProject(p => p.redistributions.push(redistribution));
    appState.setDialog({ type: 'redistributionEdit', id: redistribution.id, initialAction: 'transfer-person-shares', sourcePersonId: person.id });
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
  <section class="panel"><div class="panel-header"><h2>🕒 Personen-Timeline</h2></div><div class="panel-body stack">{#each $appState.project.events.filter(e => e.personId === person.id || (e.events || []).some(c => c.personId === person.id)) as e}<div class="event-card"><div class="event-type">{e.type}</div><strong>{e.date}</strong></div>{/each}</div></section>
</section>
