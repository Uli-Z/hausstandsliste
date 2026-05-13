<script>
  import { appState } from '../stores/projectStore.js';
  import { money, pct } from '../lib/domain.js';
  import { label as valuationLabel } from '../lib/valuation.js';
  import { dateDE } from '../lib/util.js';
  import Timeline from './Timeline.svelte';
  export let item;
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
          <h2>📦 {item.name}</h2>
          <span class="badge" class:ok={item.status==='active'} class:warn={item.status!=='active'}>{item.status}</span>
        </div>
        <div>
          {#if item.tags?.length}
            {#each item.tags as tag}<span class="tag">{tag}</span>{/each}
          {:else}
            <span class="muted">keine Tags</span>
          {/if}
        </div>
        {#if item.note}<div class="notice">{item.note}</div>{/if}
        <div class="grid-3">
          <div class="mini-card"><div class="muted">Wert</div><strong>{money(item.value)}</strong></div>
          <div class="mini-card"><div class="muted">Anteilseigner</div><strong>{item.shareRows.length}</strong></div>
          <div class="mini-card"><div class="muted">Bewertung</div><strong>{valuationLabel(item.runtime.valuation)}</strong></div>
        </div>
      </div>
      <div class="mini-card stack">
        <strong>⚡ Aktionen</strong>
        <div class="action-grid">
          <button on:click={() => appState.setDialog({ type: 'itemMeta', itemId: item.id })}>✏️ Stammdaten</button>
          <button on:click={() => appState.setDialog({ type: 'shareSet', itemId: item.id })}>🧮 Anteile ändern</button>
          <button on:click={() => appState.setDialog({ type: 'itemEnd', itemId: item.id })}>📦 Beenden</button>
          <button on:click={() => appState.setDialog({ type: 'itemContinue', itemId: item.id })}>🔄 Als neue Version fortführen</button>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="grid-2" style="margin-top:16px">
  <section class="panel">
    <div class="panel-header"><h2>🧮 Anteile</h2></div>
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
    <Timeline project={$appState.project} asOfDate={$appState.asOfDate} itemId={item.id} title="🕒 Gegenstands-Timeline" />
  </section>
</section>
