<script>
  import { appState } from '../src/stores/projectStore.js';
  import { money } from '../src/lib/domain.js';
  import { label as valuationLabel } from '../src/lib/valuation.js';
  import HelpTip from '../src/components/HelpTip.svelte';
  export let items = [];
  export let archived = [];
  export let tags = [];
  let search = '';
  let tag = '';
  let showArchive = false;
  $: filtered = items.filter(i => (!tag || (i.tags || []).includes(tag)) && (!search.trim() || [i.name, i.note, ...(i.tags||[])].join(' ').toLowerCase().includes(search.trim().toLowerCase()))).sort((a,b) => a.name.localeCompare(b.name, 'de'));
</script>

<section class="ux-panel inventory-panel">
  <div class="list-tools">
    <label class="search-wrap"><span class="sr-only">Gegenstände durchsuchen</span><input bind:value={search} type="search" placeholder="Gegenstand suchen …"/></label>
    <label class="filter-wrap"><span class="sr-only">Nach Kategorie filtern</span><select bind:value={tag}><option value="">Alle Kategorien</option>{#each tags as t}<option value={t}>{t}</option>{/each}</select></label>
    <span class="result-count">{filtered.length} von {items.length} Gegenständen</span>
  </div>
  {#if filtered.length}
    <div class="item-grid">
      {#each filtered as item (item.id)}
        <article class="item-tile">
          <div class="item-top"><span class="item-worth">{money(item.value)}</span></div>
          <h2>{item.name}</h2>
          {#if item.note}<p class="item-note">{item.note}</p>{/if}
          {#if item.tags?.length}<p class="item-categories">{item.tags.join(', ')}</p>{/if}
          <div class="item-facts"><span>{item.shareRows.length} Beteiligte</span><span>{valuationLabel(item.runtime.valuation)}</span></div>
          <button class="tile-open" on:click={() => appState.setRoute({page:'item',id:item.id})}>Anteile & Details ansehen <span aria-hidden="true">→</span></button>
        </article>
      {/each}
    </div>
  {:else}
    <div class="gentle-empty"><strong>Keine passenden Gegenstände</strong><p>{items.length ? 'Ändere die Suche oder den Kategorienfilter.' : 'Erfasse euren ersten Gegenstand – mit Wert, Personen und Anteilen.'}</p>{#if !items.length}<button class="solid-action" on:click={() => appState.setDialog({type:'itemAdd'})}>Gegenstand hinzufügen</button>{/if}</div>
  {/if}
</section>
<section class="ux-panel inventory-bottom">
  <div class="section-header"><div class="inventory-help-heading"><h2>Anteile ändern</h2><HelpTip label="Wie funktioniert eine Anteilsübertragung?">Wenn jemand Anteile übernimmt oder abgibt, kannst du die Änderungen gemeinsam prüfen. Entgeltliche Änderungen verändern die persönlichen Ausgleichssalden; eine tatsächliche Zahlung wird separat dokumentiert.</HelpTip></div><button class="outline-action" on:click={() => appState.startRedistribution()}>Übertragung vorbereiten</button></div>
</section>
<section class="ux-panel archive-view">
  <div class="section-header"><div><h2>Frühere Gegenstände{#if archived.length} ({archived.length}){/if}</h2></div><button class="text-action" aria-expanded={showArchive} on:click={() => showArchive = !showArchive}>{showArchive ? 'Ausblenden' : 'Ansehen'} {showArchive ? '↑' : '↓'}</button></div>
  {#if showArchive}
    {#if archived.length}
      <div class="archive-list">{#each archived as item (item.id)}<div class="archive-row"><div><strong>{item.name}</strong><small>{item.runtime.endedAt || 'Datum unbekannt'} · {item.runtime.endReason || item.status || 'Archiviert'}</small></div><button on:click={() => appState.setRoute({page:'item',id:item.id})}>Details ansehen →</button></div>{/each}</div>
    {:else}<p class="muted">Noch keine früheren Gegenstände.</p>{/if}
  {/if}
</section>

<style>
  .inventory-help-heading{display:flex;align-items:center;gap:8px}
  .item-top{justify-content:flex-end}
  .item-categories{font-size:11px;color:var(--muted);margin:0;line-height:1.5}
</style>
