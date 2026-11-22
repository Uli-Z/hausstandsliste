<script>
  import { appState } from '../src/stores/projectStore.js';
  import { money } from '../src/lib/domain.js';
  import { dateDE } from '../src/lib/util.js';

  export let project;
  export let data;
  export let asOfDate;

  let showDetails = false;
  let showRecords = false;
  $: people = new Map((project.people || []).map(person => [person.id, person.name || person.id]));
  $: items = new Map((project.items || []).map(item => [item.id, item.name || item.id]));
  $: peopleWithBalance = [...(data.balances || new Map())].filter(([, amount]) => amount !== 0)
    .sort((a, b) => (b[1] - a[1]) || (people.get(a[0]) || a[0]).localeCompare(people.get(b[0]) || b[0], 'de'));
  $: proposed = data.simplified || [];
  const personName = id => people.get(id) || id;
  const itemName = id => items.get(id) || id;

  function addSettlement(proposal = null) {
    appState.setDialog({
      type: 'settlementAdd',
      payerPersonId: proposal?.fromPersonId || '',
      recipientPersonId: proposal?.toPersonId || '',
      amountCents: proposal?.amountCents
    });
  }
  function editClaim(claim) {
    const event = (project.events || []).find(e => e.id === claim.sourceEventId);
    if (event) appState.setDialog({
      type: event.type === 'redistribution-executed' ? 'executedRedistributionEdit' : 'eventEdit',
      eventId: event.id
    });
  }
</script>

<section class="panel ledger-v3">
  <div class="panel-header">
    <h2>Offene Ausgleichssalden</h2>
    <span class="hint">Stand {dateDE(asOfDate)}</span>
  </div>
  <div class="panel-body stack">
    <p>Hier geht es um den finanziellen Ausgleich eurer gemeinsamen Gegenstände. Die Werte entstehen automatisch beim Einbringen, Verteilen und Übertragen von Eigentumsanteilen. Geld verwaltet oder überweist die App nicht.</p>

    <section class="mini-card stack">
      <strong>Ausgleich pro Person</strong>
      {#if peopleWithBalance.length}
        <table class="tight">
          <thead><tr><th>Person</th><th>Ergebnis</th><th class="money">Betrag</th></tr></thead>
          <tbody>
            {#each peopleWithBalance as [personId, cents] (personId)}
              <tr>
                <td><button class="person-link" on:click={() => appState.setRoute({page:'person',id:personId})}>{personName(personId)}</button></td>
                <td>{cents > 0 ? 'Soll erhalten' : 'Soll ausgleichen'}</td>
                <td class="money">{money(Math.abs(cents) / 100)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <div class="muted">Zum gewählten Stichtag gibt es keinen offenen Ausgleichssaldo.</div>
      {/if}
    </section>

    <section class="mini-card stack">
      <strong>So könnt ihr die Salden ausgleichen</strong>
      <p class="muted small-text">Diese Vorschläge führen die gemeinsamen Salden mit möglichst wenigen Zahlungen auf null. Sie sind keine fest zugeordneten Schulden aus einem bestimmten Kauf.</p>
      {#if proposed.length}
        {#each proposed as transfer, index (transfer.fromPersonId + ':' + transfer.toPersonId + ':' + index)}
          <div class="split">
            <div>
              <strong>{personName(transfer.fromPersonId)} an {personName(transfer.toPersonId)}</strong>
              <div class="muted small-text">{money(transfer.amountCents / 100)}</div>
            </div>
            <button class="primary" on:click={() => addSettlement(transfer)} disabled={$appState.readOnly}>Ausgleichen</button>
          </div>
        {/each}
      {:else}
        <p class="muted">Keine weiteren Ausgleichszahlungen vorgeschlagen.</p>
      {/if}
      <div class="row">
        <button on:click={() => addSettlement()} disabled={$appState.readOnly}>Zahlung manuell erfassen</button>
      </div>
      <p class="muted small-text">„Ausgleichen“ öffnet einen vorausgefüllten Dialog. Erst deine Bestätigung dokumentiert eine bereits erfolgte Zahlung. Auch Teilzahlungen und Überzahlungen bleiben möglich.</p>
    </section>

    {#if data.warnings?.length}
      <div class="notice warn">Achtung: {data.warnings.length} ungültige oder doppelte Buchungen wurden nicht in den Saldo eingerechnet. Bitte in der Historie prüfen.</div>
    {/if}

    <button class="small" on:click={() => showRecords = !showRecords}>
      {showRecords ? 'Dokumentierte Ausgleiche ausblenden' : 'Dokumentierte Ausgleiche anzeigen'} ({data.counterclaims?.length || 0})
    </button>
    {#if showRecords}
      {#if data.counterclaims?.length}
        <div style="overflow-x:auto">
          <table class="tight">
            <thead><tr><th>Datum</th><th>Art</th><th>Von → an</th><th class="money">Betrag</th><th>Aktion</th></tr></thead>
            <tbody>
              {#each data.counterclaims as entry (entry.sourceEventId)}
                <tr>
                  <td>{dateDE(entry.date)}</td>
                  <td>{entry.entryKind === 'paid' ? 'Gezahlt' : entry.entryKind === 'external' ? 'Extern abgerechnet' : 'Erlassen'}</td>
                  <td>{personName(entry.creditorPersonId)} → {personName(entry.debtorPersonId)}</td>
                  <td class="money">{money(entry.amountCents / 100)}</td>
                  <td><button class="small ghost" on:click={() => appState.setDialog({type:'settlementEdit',eventId:entry.sourceEventId})}>Bearbeiten</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="muted">Noch keine Ausgleichszahlungen dokumentiert.</p>
      {/if}
    {/if}

    <button class="small" on:click={() => showDetails = !showDetails}>
      {showDetails ? 'Herkunft der Salden ausblenden' : 'Herkunft der Salden anzeigen'} ({data.claims.length})
    </button>
    {#if showDetails}
      <p class="muted small-text">Die zugrunde liegenden Wertverschiebungen aus Anschaffungen und Anteilsänderungen. Eine spätere Zahlung wird keiner einzelnen Anschaffung zugeordnet.</p>
      {#if data.claims.length}
        <div style="overflow-x:auto">
          <table class="tight">
            <thead><tr><th>Datum</th><th>Gegenstand</th><th>Erhalten von → an</th><th class="money">Wert</th><th>Aktion</th></tr></thead>
            <tbody>
              {#each data.claims as claim, index (claim.sourceEventId + ':' + index)}
                <tr>
                  <td>{dateDE(claim.date)}</td>
                  <td>{itemName(claim.itemId)}</td>
                  <td>{personName(claim.creditorPersonId)} → {personName(claim.debtorPersonId)}</td>
                  <td class="money">{money(claim.amountCents / 100)}</td>
                  <td><button class="small ghost" on:click={() => editClaim(claim)}>Ursprung ansehen</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="muted">Noch keine wertwirksamen Anschaffungen oder Anteilsänderungen.</p>
      {/if}
    {/if}
  </div>
</section>

<style>
  .small-text { font-size: .85rem; }
  .tight td { padding: 6px; }
  .person-link { border: 0; background: transparent; color: var(--accent); text-decoration: underline; cursor: pointer; padding: 1px; font: inherit; }
</style>
