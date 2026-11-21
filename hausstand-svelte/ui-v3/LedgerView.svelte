<script>
  import { appState } from '../src/stores/projectStore.js';
  import { money } from '../src/lib/domain.js';
  import { dateDE } from '../src/lib/util.js';

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

<section class="panel ledger-v3">
  <div class="panel-header">
    <h2>Wer muss wem wie viel zahlen?</h2>
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
        <strong>Beträge zwischen zwei Personen</strong>
        {#if data.pairwise.length}
          <table class="tight">
            <thead><tr><th>Von → an</th><th class="money">Saldo</th></tr></thead>
            <tbody>
              {#each data.pairwise as row}
                <tr>
                  <td data-label="Personen"><button class="person-link" on:click={() => appState.setRoute({ page: 'person', id: row.fromPersonId })}>{personName(row.fromPersonId)}</button> → <button class="person-link" on:click={() => appState.setRoute({ page: 'person', id: row.toPersonId })}>{personName(row.toPersonId)}</button></td>
                  <td data-label="Betrag" class="money">{money(row.amountCents / 100)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <div class="muted">Zwischen den Personen ist derzeit kein Geld offen.</div>
        {/if}
      </section>
      <section class="mini-card stack">
        <strong>Wenn ihr alles gemeinsam ausgleicht</strong>
        <div class="muted small-text">Ein Vorschlag für möglichst wenige Überweisungen. Dabei kann eine andere Person das Geld erhalten als ursprünglich.</div>
        {#if data.simplified.length}
          <table class="tight">
            <thead><tr><th>Von → an</th><th class="money">Betrag</th></tr></thead>
            <tbody>
              {#each data.simplified as row}
                <tr>
                  <td data-label="Personen"><button class="person-link" on:click={() => appState.setRoute({ page: 'person', id: row.fromPersonId })}>{personName(row.fromPersonId)}</button> → <button class="person-link" on:click={() => appState.setRoute({ page: 'person', id: row.toPersonId })}>{personName(row.toPersonId)}</button></td>
                  <td data-label="Betrag" class="money">{money(row.amountCents / 100)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <div class="muted">Alle erfassten Ansprüche gleichen sich aus.</div>
        {/if}
      </section>
    </div>
    <button class="small" on:click={() => showDetails = !showDetails}>
      {showDetails ? 'Herkunft der Beträge ausblenden' : 'Herkunft der Beträge ansehen'} ({data.claims.length})
    </button>
    {#if showDetails && data.claims.length}
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>Datum</th><th>Gegenstand</th><th>Schuldner → Gläubiger</th><th class="money">Betrag</th><th>Quelle</th></tr></thead>
          <tbody>
            {#each data.claims as claim, index (claim.sourceEventId + ':' + (claim.childEventId || '') + ':' + claim.debtorPersonId + ':' + claim.creditorPersonId + ':' + index)}
              <tr>
                <td data-label="Datum">{dateDE(claim.date)}</td>
                <td data-label="Gegenstand">{itemName(claim.itemId)}</td>
                <td data-label="Von → an"><button class="person-link" on:click={() => appState.setRoute({ page: 'person', id: claim.debtorPersonId })}>{personName(claim.debtorPersonId)}</button> → <button class="person-link" on:click={() => appState.setRoute({ page: 'person', id: claim.creditorPersonId })}>{personName(claim.creditorPersonId)}</button></td>
                <td data-label="Betrag" class="money">{money(claim.amountCents / 100)}</td>
                <td data-label="Ursprung"><button class="small ghost" on:click={() => editSource(claim)}>Ereignis bearbeiten</button></td>
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
  .person-link { border: 0; background: transparent; color: var(--accent); text-decoration: underline; cursor: pointer; padding: 1px; font: inherit; }
</style>
