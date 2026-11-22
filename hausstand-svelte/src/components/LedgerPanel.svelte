<script>
  import { appState } from '../stores/projectStore.js';
  import { money } from '../lib/domain.js';
  import { PAYMENT_STATUS_NOTICE, BILATERAL_BALANCE_DESCRIPTION, MULTILATERAL_SUGGESTION_DESCRIPTION, DERIVED_CLAIMS_DESCRIPTION } from '../lib/financialLabels.js';
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
    <h2>Forderungen, Gegenbuchungen &amp; Nettosalden</h2>
    <span class="hint">Stichtag {dateDE(asOfDate)}</span>
  </div>
  <div class="panel-body stack">
    <div class="notice">
      {PAYMENT_STATUS_NOTICE} Forderungen entstehen aus entgeltlichen Anteilsänderungen.
      Gegenläufige Ansprüche werden rechnerisch verrechnet, nicht als überwiesen markiert.
      Ältere Ereignisse ohne finanzielle Kennzeichnung erzeugen keine Forderungen.
    </div>
    <div class="grid-2">
      <section class="mini-card stack">
        <strong>Bilaterale Forderungssalden</strong>
        <div class="muted small-text">{BILATERAL_BALANCE_DESCRIPTION}</div>
        {#if data.pairwise.length}
          <table class="tight">
            <thead><tr><th>Von → an</th><th class="money">Saldo</th></tr></thead>
            <tbody>
              {#each data.pairwise as row}
                <tr>
                  <td><button class="person-link" on:click={() => appState.setRoute({ page: 'person', id: row.fromPersonId })}>{personName(row.fromPersonId)}</button> → <button class="person-link" on:click={() => appState.setRoute({ page: 'person', id: row.toPersonId })}>{personName(row.toPersonId)}</button></td>
                  <td class="money">{money(row.amountCents / 100)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <div class="muted">Kein offener bilateraler Saldo. Das kann an Zahlungen, Gegenbuchungen oder gegenseitigen Ansprüchen liegen.</div>
        {/if}
      </section>
      <section class="mini-card stack">
        <strong>Unverbindlicher Überweisungsvorschlag</strong>
        <div class="muted small-text">{MULTILATERAL_SUGGESTION_DESCRIPTION}</div>
        {#if data.simplified.length}
          <table class="tight">
            <thead><tr><th>Von → an</th><th class="money">Betrag</th></tr></thead>
            <tbody>
              {#each data.simplified as row}
                <tr>
                  <td><button class="person-link" on:click={() => appState.setRoute({ page: 'person', id: row.fromPersonId })}>{personName(row.fromPersonId)}</button> → <button class="person-link" on:click={() => appState.setRoute({ page: 'person', id: row.toPersonId })}>{personName(row.toPersonId)}</button></td>
                  <td class="money">{money(row.amountCents / 100)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <div class="muted">Kein Überweisungsvorschlag aus dem aktuellen Nettosaldo. Das bedeutet nicht, dass Forderungen bezahlt wurden.</div>
        {/if}
      </section>
    </div>
    {#if data.counterclaims?.length}
      <div class="mini-card stack">
        <strong>Dokumentierte Gegenbuchungen ({data.counterclaims.length})</strong>
        <div class="muted small-text">Zahlungen erzeugen rechnerisch eine Forderung in Gegenrichtung. Extern verbucht oder erlassen bedeutet nicht, dass Geld überwiesen wurde. Buchungen bleiben unabhängig von Anschaffungen bestehen.</div>
        <div style="overflow-x:auto">
          <table class="tight">
            <thead><tr><th>Datum</th><th>Art</th><th>Von → an</th><th class="money">Betrag</th></tr></thead>
            <tbody>
              {#each data.counterclaims as entry, index (entry.sourceEventId + ':' + index)}
                <tr>
                  <td>{dateDE(entry.date)}</td>
                  <td>{entry.entryKind === 'paid' ? 'Zahlung' : entry.entryKind === 'external' ? 'Extern verbucht' : 'Erlassen'}</td>
                  <td>{personName(entry.creditorPersonId)} → {personName(entry.debtorPersonId)}</td>
                  <td class="money">{money(entry.amountCents / 100)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
    {#if data.warnings?.length}
      <div class="notice">Achtung: {data.warnings.length} ungültige oder doppelte Gegenbuchungen wurden nicht angerechnet. Bitte im Ereignisverlauf prüfen.</div>
    {/if}
    <button class="small" on:click={() => showDetails = !showDetails}>
      {showDetails ? 'Entstandene Forderungen ausblenden' : 'Entstandene Forderungen anzeigen'} ({data.claims.length})
    </button>
    {#if showDetails && data.claims.length}
      <p class="muted small-text">{DERIVED_CLAIMS_DESCRIPTION}</p>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>Datum</th><th>Gegenstand</th><th>Schuldner → Gläubiger</th><th class="money">Forderung</th><th>Quelle</th></tr></thead>
          <tbody>
            {#each data.claims as claim, index (claim.sourceEventId + ':' + (claim.childEventId || '') + ':' + claim.debtorPersonId + ':' + claim.creditorPersonId + ':' + index)}
              <tr>
                <td>{dateDE(claim.date)}</td>
                <td>{itemName(claim.itemId)}</td>
                <td><button class="person-link" on:click={() => appState.setRoute({ page: 'person', id: claim.debtorPersonId })}>{personName(claim.debtorPersonId)}</button> → <button class="person-link" on:click={() => appState.setRoute({ page: 'person', id: claim.creditorPersonId })}>{personName(claim.creditorPersonId)}</button></td>
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
  .person-link { border: 0; background: transparent; color: var(--accent); text-decoration: underline; cursor: pointer; padding: 1px; font: inherit; }
</style>
