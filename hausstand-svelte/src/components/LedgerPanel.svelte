<script>
  import { appState } from '../stores/projectStore.js';
  import { money } from '../lib/domain.js';
  import { dateDE } from '../lib/util.js';

  export let project;
  export let data;
  export let asOfDate;

  let showDetails = false;
  $: people = new Map((project.people || []).map(person => [person.id, person.name || person.id]));
  $: items = new Map((project.items || []).map(item => [item.id, item.name || item.id]));
  const personName = id => people.get(id) || id;
  const itemName = id => items.get(id) || id;

  function editSource(claim) {
    const event = (project.events || []).find(entry => entry.id === claim.sourceEventId);
    if (!event) return;
    appState.setDialog({
      type: event.type === 'redistribution-executed' ? 'executedRedistributionEdit' : 'eventEdit',
      eventId: event.id
    });
  }
</script>

<section class="panel" style="margin-top:16px">
  <div class="panel-header">
    <h2>💶 Forderungen und Nettoschulden</h2>
    <span class="hint">Stichtag {dateDE(asOfDate)}</span>
  </div>
  <div class="panel-body stack">
    <div class="notice">
      Forderungen entstehen aus entgeltlichen Anteilsänderungen. Gegenläufige Ansprüche
      werden automatisch verrechnet; reale Geldzahlungen werden derzeit nicht erfasst.
      Ältere Ereignisse ohne finanzielle Kennzeichnung erzeugen keine Schulden.
    </div>
    <div class="grid-2">
      <section class="mini-card stack">
        <strong>Offen je Gegenpartei</strong>
        {#if data.pairwise.length}
          <table class="tight">
            <thead><tr><th>Von → an</th><th class="money">Saldo</th></tr></thead>
            <tbody>
              {#each data.pairwise as row}
                <tr>
                  <td>{personName(row.fromPersonId)} → {personName(row.toPersonId)}</td>
                  <td class="money">{money(row.amountCents / 100)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <div class="muted">Keine gegenseitigen Nettoschulden zum Stichtag.</div>
        {/if}
      </section>
      <section class="mini-card stack">
        <strong>Vereinfachte Gesamtübersicht</strong>
        <div class="muted small-text">Rechnerischer Vorschlag für eine gemeinsame Verrechnung; dabei können sich die Zahlungsempfänger ändern.</div>
        {#if data.simplified.length}
          <table class="tight">
            <thead><tr><th>Von → an</th><th class="money">Betrag</th></tr></thead>
            <tbody>
              {#each data.simplified as row}
                <tr>
                  <td>{personName(row.fromPersonId)} → {personName(row.toPersonId)}</td>
                  <td class="money">{money(row.amountCents / 100)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <div class="muted">Alle Forderungen sind rechnerisch ausgeglichen.</div>
        {/if}
      </section>
    </div>
    <button class="small" on:click={() => showDetails = !showDetails}>
      {showDetails ? 'Einzelvorgänge ausblenden' : 'Einzelvorgänge anzeigen'} ({data.claims.length})
    </button>
    {#if showDetails && data.claims.length}
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>Datum</th><th>Gegenstand</th><th>Schuldner → Gläubiger</th><th class="money">Betrag</th><th>Quelle</th></tr></thead>
          <tbody>
            {#each data.claims as claim, index (claim.sourceEventId + ':' + (claim.childEventId || '') + ':' + claim.debtorPersonId + ':' + claim.creditorPersonId + ':' + index)}
              <tr>
                <td>{dateDE(claim.date)}</td>
                <td>{itemName(claim.itemId)}</td>
                <td>{personName(claim.debtorPersonId)} → {personName(claim.creditorPersonId)}</td>
                <td class="money">{money(claim.amountCents / 100)}</td>
                <td><button class="small ghost" on:click={() => editSource(claim)}>Ereignis bearbeiten</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</section>

<style>
  .small-text { font-size: 0.85rem; }
  .tight td { padding: 4px 6px; }
</style>
