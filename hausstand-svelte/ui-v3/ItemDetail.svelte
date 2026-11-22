<script>
  import { appState, ledger } from '../src/stores/projectStore.js';
  import { money, pct } from '../src/lib/domain.js';
  import { label as valuationLabel } from '../src/lib/valuation.js';
  import { dateDE } from '../src/lib/util.js';
  import Timeline from './Timeline.svelte';
  import HelpTip from '../src/components/HelpTip.svelte';
  export let item;
  $: itemClaims = ($ledger.claims || []).filter(claim => claim.itemId === item.id);
  $: fundingEvents = ($appState.project.events || []).filter(event =>
    event.type === 'item-added' && event.itemId === item.id && event.date <= $appState.asOfDate &&
    event.financialMode === 'derived' && event.financedByPersonId);
  const personName = id => $appState.project.people.find(p => p.id === id)?.name || id;
</script>

<section class="panel">
  <div class="panel-body">
    <div class="breadcrumb">
      <button on:click={() => appState.setRoute({ page: 'dashboard' })}>← Übersicht</button>
      <span>Gegenstand</span>
    </div>
    <div class="detail-hero">
      <div class="stack">
        <div class="detail-title">
          <h2>{item.name}</h2>
          {#if item.status !== 'active'}<span class="item-status-text">Nicht mehr im Bestand</span>{/if}
        </div>
        {#if item.tags?.length}<p class="item-categories">Kategorien: {item.tags.join(', ')}</p>{/if}
        {#if item.note}<p class="item-description">{item.note}</p>{/if}
        <div class="grid-3">
          <div class="mini-card"><div class="muted">Wert</div><strong>{money(item.value)}</strong></div>
          <div class="mini-card"><div class="muted">Anteilseigner</div><strong>{item.shareRows.length}</strong></div>
          <div class="mini-card"><div class="muted">Bewertung</div><strong>{valuationLabel(item.runtime.valuation)}</strong></div>
        </div>
      </div>
      <div class="mini-card stack">
        <strong>Mögliche Aktionen</strong>
        <div class="action-grid">
          <button on:click={() => appState.setDialog({ type: 'itemMeta', itemId: item.id })}>Gegenstand bearbeiten</button>
          <button on:click={() => appState.setDialog({ type: 'shareSet', itemId: item.id })}>Eigentumsanteile ändern</button>
          <button on:click={() => appState.setDialog({ type: 'itemEnd', itemId: item.id })}>Beenden / archivieren</button>
          <button on:click={() => appState.setDialog({ type: 'itemContinue', itemId: item.id })}>Durch neuen Gegenstand ersetzen</button>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="grid-2" style="margin-top:16px">
  <section class="panel">
    <div class="panel-header"><h2>Wem gehört wie viel?</h2></div>
    <div class="panel-body">
      {#if item.shareRows.length}
        <table>
          <thead>
            <tr><th>Person</th><th class="right">Einheiten</th><th class="right">Prozent</th><th class="money">Wertanteil</th></tr>
          </thead>
          <tbody>
            {#each item.shareRows as row}
              <tr>
                <td>{row.personName}{#if !row.active} <span class="muted">(inaktiv)</span>{/if}</td>
                <td class="right">{row.units}</td>
                <td class="right">{pct(row.fraction)}</td>
                <td class="money">{money(row.value)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <div class="empty">Keine Anteile.</div>
      {/if}
    </div>
  </section>

  <section class="panel">
    <Timeline project={$appState.project} asOfDate={$appState.asOfDate} itemId={item.id} title="Änderungen dieses Gegenstands" />
  </section>
</section>

<section class="panel" style="margin-top:16px">
  <div class="panel-header"><div class="help-heading"><h2>Finanzierung &amp; Wertausgleich</h2><HelpTip label="Wie entstehen diese Beträge?">Hier siehst du, wer den Kauf ursprünglich finanziert hat und welchen Wert andere durch Anteile erhalten haben. Tatsächliche Zahlungen werden nur im gemeinsamen Ausgleichssaldo verrechnet und keinem Gegenstand einzeln als bezahlt zugeordnet.</HelpTip></div></div>
  <div class="panel-body stack">
    {#each fundingEvents as event (event.id)}
      <div class="funding-fact">
        <strong>Beim Kauf eingebracht</strong>
        <span>{personName(event.financedByPersonId)} · {money(event.initialValue)} · {dateDE(event.date)}</span>
      </div>
    {/each}
    {#if itemClaims.length}
      <div style="overflow-x:auto">
        <table class="tight">
          <thead><tr><th>Datum</th><th>Wert abgegeben von</th><th>Wert erhalten durch</th><th class="money">Wert</th></tr></thead>
          <tbody>
            {#each itemClaims as claim, index (claim.sourceEventId + ':' + index)}
              <tr><td>{dateDE(claim.date)}</td><td>{personName(claim.creditorPersonId)}</td><td>{personName(claim.debtorPersonId)}</td><td class="money">{money(claim.amountCents / 100)}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="muted">Für diesen Gegenstand ist zum gewählten Stichtag kein finanzieller Ausgleich hinterlegt.</div>
    {/if}
  </div>
</section>

<style>
  .help-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .item-status-text{color:var(--muted);font-size:12px}
  .funding-fact{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:13px;padding:10px 0;border-bottom:1px solid var(--border)}
  .funding-fact span{color:var(--muted)}
  .item-categories,.item-description{margin:0;color:var(--muted);font-size:12px;line-height:1.55}
</style>
