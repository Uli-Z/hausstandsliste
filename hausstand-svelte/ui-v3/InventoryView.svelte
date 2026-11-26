<script>
  import CompactNames from './CompactNames.svelte';
  import { ownerNames } from '../src/lib/overviewNames.js';
  import { appState } from '../src/stores/projectStore.js';
  import { locale, translate, pluralMessage } from '../src/lib/i18n.js';
  import { money } from '../src/lib/domain.js';
  export let items = [];
  export let archived = [];
  export let tags = [];
  let search = '';
  let tag = '';
  let showArchive = false;
  $: filtered = items.filter(i => (!tag || (i.tags || []).includes(tag)) && (!search.trim() || [i.name, i.note, ...(i.tags||[])].join(' ').toLowerCase().includes(search.trim().toLowerCase()))).sort((a,b) => a.name.localeCompare(b.name, $locale));
</script>

<section class="ux-panel inventory-panel">
  <div class="list-tools">
    <label class="search-wrap"><span class="sr-only">{$translate("items.searchLabel")}</span><input bind:value={search} type="search" placeholder={$translate("items.search")}/></label>
    {#if tags.length > 1 || tag}
      <label class="filter-wrap"><span class="sr-only">{$translate("items.category")}</span><select bind:value={tag}><option value="">{$translate("items.all")}</option>{#each tags as t}<option value={t}>{t}</option>{/each}</select></label>
    {/if}
    {#if search.trim() || tag}
      <span class="result-count" aria-live="polite">{filtered.length} / {items.length} {$translate("nav.items")}</span>
    {/if}
  </div>
  {#if filtered.length}
    <div class="item-grid">
      {#each filtered as item (item.id)}
        <article class="item-tile action-card">
          <div class="item-top"><span class="item-worth">{money(item.value)}</span></div>
          <h2>{item.name}</h2>
          {#if item.note}<p class="item-note">{item.note}</p>{/if}
          {#if item.tags?.length}<p class="item-categories">{item.tags.join(', ')}</p>{/if}
          <div class="item-facts"><span>{pluralMessage('items.ownerCount', item.shareRows.length, $locale)}</span></div>
          <CompactNames entries={ownerNames(item, $locale)}/>
          <button class="tile-open card-primary" type="button" on:click={() => appState.setRoute({page:'item',id:item.id})}>{$translate("items.details")} <span aria-hidden="true">→</span></button>
        </article>
      {/each}
    </div>
  {:else}
    <div class="gentle-empty"><strong>{$translate("items.none")}</strong><p>{items.length ? $translate('items.try') : $translate('items.first')}</p>{#if !items.length}<button class="solid-action" on:click={() => appState.setDialog({type:'itemAdd'})}>{$translate("app.itemAdd")}</button>{/if}</div>
  {/if}
</section>
{#if archived.length}
  <section class="ux-panel archive-view">
    <div class="section-header">
      <div><h2>{$translate("items.old")} ({archived.length})</h2></div>
      <button class="text-action" type="button" aria-expanded={showArchive} on:click={() => showArchive = !showArchive}>{showArchive ? $translate('items.hide') : $translate('items.show')} {showArchive ? '↑' : '↓'}</button>
    </div>
    {#if showArchive}
      <div class="archive-list">
        {#each archived as item (item.id)}
          <div class="archive-row action-card"><div><strong>{item.name}</strong><small>{item.runtime.endedAt || $translate('items.dateUnknown')} · {item.runtime.endReason || item.status || $translate('items.archived')}</small></div><button class="card-primary" type="button" on:click={() => appState.setRoute({page:'item',id:item.id})}>{$translate("items.detailsLink")}</button></div>
        {/each}
      </div>
    {/if}
  </section>
{/if}

<style>
  .item-tile{padding:15px;gap:8px}
  .item-top{justify-content:flex-end}
  .item-categories{font-size:11px;color:var(--muted);margin:0;line-height:1.5}
  .item-tile h2{margin:0}
  .item-tile .item-facts{margin-top:2px}
</style>
