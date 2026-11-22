<script>
  import { appState } from '../src/stores/projectStore.js';
  import { money } from '../src/lib/domain.js';
  import { dateDE } from '../src/lib/util.js';
  import BalanceBreakdown from '../src/components/BalanceBreakdown.svelte';

  export let project;
  export let data;
  export let asOfDate;

  $: names = new Map((project.people || []).map(p => [p.id, p.name || p.id]));
  $: itemNames = new Map((project.items || []).map(item => [item.id, item.name || item.id]));
  $: eventById = new Map((project.events || []).map(event => [event.id, event]));
  $: balances = [...(data.balances || new Map())]
    .filter(([, cents]) => cents !== 0)
    .map(([id, cents]) => ({ id, cents }))
    .sort((a, b) => (b.cents - a.cents) || (names.get(a.id) || a.id).localeCompare(names.get(b.id) || b.id, 'de'));
  $: suggestions = data.simplified || [];
  $: recorded = [...(data.counterclaims || [])].reverse();

  function personName(id) { return names.get(id) || id; }
  function itemName(id) { return itemNames.get(id) || id; }
  function addSettlement(transfer = null) {
    appState.setDialog({
      type: 'settlementAdd',
      payerPersonId: transfer?.fromPersonId || '',
      recipientPersonId: transfer?.toPersonId || '',
      amountCents: transfer?.amountCents
    });
  }
  function editClaim(claim) {
    const event = eventById.get(claim.sourceEventId);
    if (!event) return;
    appState.setDialog({
      type: event.type === 'redistribution-executed' ? 'executedRedistributionEdit' : 'eventEdit',
      eventId: event.id
    });
  }
</script>

<section class="panel ledger-v3 settlement-screen">
  <div class="panel-header">
    <h2>Wertausgleich</h2>
    <span class="hint">Stand {dateDE(asOfDate)}</span>
  </div>
  <div class="panel-body settlement-content">
    <p class="intro">Wenn jemand Gegenstände finanziert oder Anteile übernimmt, entsteht ein persönlicher Ausgleichssaldo. Hier seht ihr, wie ihr diese Werte ausgleichen könnt.</p>

    <section class="settlement-section">
      <h3>So könnt ihr ausgleichen</h3>
      {#if suggestions.length}
        <p class="section-description">Diese Zahlungswege gleichen alle persönlichen Salden aus. Sie sind Vorschläge, keine bereits erfolgten Zahlungen.</p>
        <div class="transfer-list">
          {#each suggestions as transfer, index (transfer.fromPersonId + ':' + transfer.toPersonId + ':' + index)}
            <div class="transfer-row">
              <div class="transfer-people">
                <strong>{personName(transfer.fromPersonId)} zahlt an {personName(transfer.toPersonId)}</strong>
              </div>
              <strong class="transfer-amount">{money(transfer.amountCents / 100)}</strong>
              <button class="primary transfer-action" type="button" on:click={() => addSettlement(transfer)} disabled={$appState.readOnly}>Ausgleichen</button>
            </div>
          {/each}
        </div>
        <p class="section-footnote">„Ausgleichen“ dokumentiert eine Zahlung erst nach deiner Bestätigung. Die App überweist kein Geld.</p>
      {:else}
        <p class="settled-message">Es gibt zum gewählten Stichtag keine offenen Ausgleichssalden.</p>
      {/if}
    </section>

    <section class="settlement-section">
      <h3>Salden der Personen</h3>
      <p class="section-description">Ein positiver Saldo bedeutet, dass die Person noch Geld erhalten kann. Öffne eine Person, um zu sehen, wie sich ihr Saldo zusammensetzt.</p>
      {#if balances.length}
        <div class="person-balance-list">
          {#each balances as balance (balance.id)}
            <details class="person-balance-row">
              <summary>
                <span class="person-balance-name">{personName(balance.id)}</span>
                <span class="person-balance-amount">{balance.cents > 0 ? 'Erhält' : 'Gleicht aus'} <strong>{money(Math.abs(balance.cents) / 100)}</strong></span>
              </summary>
              <div class="balance-expand">
                <BalanceBreakdown detail={data.details?.get(balance.id)} balanceCents={balance.cents}/>
                <button class="text-link" type="button" on:click={() => appState.setRoute({page:'person',id:balance.id})}>Personenprofil ansehen</button>
              </div>
            </details>
          {/each}
        </div>
      {:else}
        <p class="muted">Alle persönlichen Ausgleichssalden stehen bei null.</p>
      {/if}
    </section>

    <div class="manual-payment">
      <div>
        <strong>Eine Zahlung unabhängig vom Vorschlag eintragen</strong>
        <p>Für Teilzahlungen, andere Zahlungswege oder nachträglich erfasste Zahlungen.</p>
      </div>
      <button type="button" on:click={() => addSettlement()} disabled={$appState.readOnly}>Zahlung erfassen</button>
    </div>

    {#if data.warnings?.length}
      <p class="notice warn">{data.warnings.length} ungültige oder doppelte Ausgleichsbuchungen wurden nicht berücksichtigt. Bitte die Buchungen im Verlauf prüfen.</p>
    {/if}

    <div class="audit-area">
      <details class="audit-disclosure">
        <summary>Dokumentierte Ausgleiche <span class="disclosure-count">{recorded.length}</span></summary>
        <p class="section-description">Hier stehen tatsächlich dokumentierte Zahlungen und andere verrechnete Ausgleiche. Jede Buchung bleibt bearbeitbar.</p>
        {#if recorded.length}
          <div class="audit-list">
            {#each recorded as entry (entry.sourceEventId)}
              <div class="audit-row">
                <div class="audit-main">
                  <strong>{personName(entry.creditorPersonId)} an {personName(entry.debtorPersonId)}</strong>
                  <span>{dateDE(entry.date)} · {entry.entryKind === 'paid' ? 'Zahlung' : entry.entryKind === 'external' ? 'Extern abgerechnet' : 'Erlassen'}</span>
                  {#if eventById.get(entry.sourceEventId)?.note}<span>{eventById.get(entry.sourceEventId).note}</span>{/if}
                </div>
                <strong class="audit-amount">{money(entry.amountCents / 100)}</strong>
                <button class="audit-edit" type="button" on:click={() => appState.setDialog({type:'settlementEdit',eventId:entry.sourceEventId})}>Bearbeiten</button>
              </div>
            {/each}
          </div>
        {:else}
          <p class="muted">Noch kein Ausgleich dokumentiert.</p>
        {/if}
      </details>
      <details class="audit-disclosure">
        <summary>Herkunft der Wertverschiebungen <span class="disclosure-count">{data.claims.length}</span></summary>
        <p class="section-description">Diese Beträge ergeben sich automatisch aus Anschaffungen und Anteilsänderungen. Zahlungen werden keinem einzelnen Gegenstand zugeordnet.</p>
        {#if data.claims.length}
          <div class="audit-list">
            {#each data.claims as claim, index (claim.sourceEventId + ':' + index)}
              <div class="audit-row">
                <div class="audit-main">
                  <strong>{itemName(claim.itemId)}</strong>
                  <span>{dateDE(claim.date)} · Wert von {personName(claim.creditorPersonId)} an {personName(claim.debtorPersonId)}</span>
                </div>
                <strong class="audit-amount">{money(claim.amountCents / 100)}</strong>
                <button class="audit-edit" type="button" on:click={() => editClaim(claim)}>Vorgang ansehen</button>
              </div>
            {/each}
          </div>
        {:else}
          <p class="muted">Noch keine finanziellen Wertverschiebungen erfasst.</p>
        {/if}
      </details>
    </div>
  </div>
</section>

<style>
  .settlement-content{display:grid;gap:27px}
  .intro{margin:0;color:var(--muted);font-size:13px;line-height:1.65;max-width:760px}
  .settlement-section{display:grid;gap:12px;min-width:0}
  .settlement-section h3{font-size:16px;letter-spacing:-.018em;margin:0}
  .section-description,.section-footnote{margin:0;color:var(--muted);font-size:12px;line-height:1.6}
  .section-footnote{font-size:11.5px}
  .transfer-list,.person-balance-list,.audit-list{display:grid;min-width:0}
  .transfer-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:15px;align-items:center;padding:15px 0;border-bottom:1px solid var(--border)}
  .transfer-row:last-child{border-bottom:0}
  .transfer-people strong{font-size:14px;font-weight:650}
  .transfer-amount,.audit-amount{font-variant-numeric:tabular-nums;white-space:nowrap;font-size:15px}
  .transfer-action{min-height:40px;min-width:106px}
  .settled-message{margin:0;padding:16px;border:1px solid var(--border);border-radius:11px;color:var(--muted)}
  .person-balance-row{border-bottom:1px solid var(--border)}
  .person-balance-row summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:16px;padding:15px 4px;justify-content:space-between}
  .person-balance-row summary::-webkit-details-marker,.audit-disclosure summary::-webkit-details-marker{display:none}
  .person-balance-row summary:after{content:'⌄';color:var(--muted);font-size:17px}
  .person-balance-row[open] summary:after{content:'⌃'}
  .person-balance-name{font-weight:640;font-size:13px;min-width:0}
  .person-balance-amount{margin-left:auto;text-align:right;color:var(--muted);font-size:12px}
  .person-balance-amount strong{color:var(--text);font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap}
  .balance-expand{padding:4px 6px 19px 12px;max-width:680px}
  .text-link{border:0;background:transparent;color:var(--accent);padding:10px 0 0;font-size:12px;font-weight:650}
  .manual-payment{display:flex;justify-content:space-between;gap:18px;align-items:center;padding:17px 18px;border:1px solid var(--border);border-radius:13px}
  .manual-payment strong{font-size:13px}
  .manual-payment p{font-size:12px;margin:4px 0 0;color:var(--muted);line-height:1.5}
  .manual-payment button{flex:none;min-height:40px}
  .audit-area{border-top:1px solid var(--border);padding-top:6px}
  .audit-disclosure{border-bottom:1px solid var(--border);padding:14px 0}
  .audit-disclosure summary{cursor:pointer;list-style:none;font-size:13px;font-weight:650;display:flex;align-items:center;gap:9px;min-height:30px}
  .audit-disclosure summary:before{content:'›';font-size:18px;color:var(--muted);line-height:1}
  .audit-disclosure[open] summary:before{transform:rotate(90deg)}
  .disclosure-count{font-size:12px;font-weight:500;color:var(--muted)}
  .audit-disclosure .section-description{padding:9px 0}
  .audit-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:15px;border-top:1px solid var(--border);padding:13px 0}
  .audit-main{display:grid;gap:4px;min-width:0}
  .audit-main strong{font-size:13px}
  .audit-main span{font-size:11px;color:var(--muted);overflow-wrap:anywhere}
  .audit-amount{font-size:13px}
  .audit-edit{font-size:12px;min-height:38px}
  @media(max-width:620px){
    .transfer-row{grid-template-columns:minmax(0,1fr) auto;gap:10px}
    .transfer-action{grid-column:1/-1;justify-self:stretch;min-height:46px}
    .transfer-amount{font-size:15px}
    .manual-payment{align-items:stretch;flex-direction:column}
    .manual-payment button{min-height:44px}
    .audit-row{grid-template-columns:minmax(0,1fr) auto;gap:10px}
    .audit-edit{grid-column:1/-1;justify-self:start}
    .person-balance-row summary{gap:9px}
  }
</style>
