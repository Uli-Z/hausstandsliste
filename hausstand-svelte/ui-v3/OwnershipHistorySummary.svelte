<script>
  import { itemDisplayName } from '../src/lib/itemNames.js';
  import CompactNames from './CompactNames.svelte';
  import { nameEntries } from '../src/lib/overviewNames.js';
  import { translate, locale, pluralMessage } from '../src/lib/i18n.js';
  import { eventUnitChangeRows } from '../src/lib/redistribution.js';

  export let event;
  export let project;
  export let itemId = null;
  export let compact = false;
  export let openItem = null;
  export let openPerson = null;

  $: people = new Map((project.people || []).map(p => [p.id,p.name || p.id]));
  $: items = new Map((project.items || []).map(i => [i.id,itemDisplayName(i) || i.id]));
  $: group = event.type === 'redistribution-executed';
  $: rows = eventUnitChangeRows(event).filter(row => !itemId || row.itemId === itemId);
  $: visible = compact ? rows.slice(0,2) : rows;
</script>

<div class="ownership-history-summary">
  <div class="ownership-event-heading">
    {#if group}
      <span>{event.title || $translate('timeline.redistribution')} · {pluralMessage('timeline.changeCount', rows.length, $locale)}</span>
    {:else}
      {#if openItem}
        <button type="button" class="entity-link" on:click={() => openItem(event.itemId)}>{items.get(event.itemId) || event.itemId}</button>
      {:else}
        <strong>{items.get(event.itemId) || event.itemId}</strong>
      {/if}
      <span> · {event.note || $translate('timeline.shareSet')}</span>
    {/if}
  </div>
  {#each visible as row (row.itemId)}
    <div class="event-unit-change">
      {#if group}
        {#if openItem}
          <button type="button" class="entity-link" on:click={() => openItem(row.itemId)}>{items.get(row.itemId) || row.itemId}</button>
        {:else}
          <span>{items.get(row.itemId) || row.itemId}</span>
        {/if}
        <span> · </span>
      {/if}
      <CompactNames entries={nameEntries(row.people.map(person => ({
        id:person.personId, name:people.get(person.personId) || person.personId,
        detail:(person.unitsDelta > 0 ? '+' : '') + person.unitsDelta + ' ' + $translate('ui.units-1xtsz9u')
      })), $locale)} onName={openPerson}/>
    </div>
  {/each}
  {#if !rows.length}<div class="muted">{$translate('timeline.noUnitChanges')}</div>{/if}
  {#if rows.length > visible.length}<div class="muted">{$translate('timeline.moreItems',{count:rows.length-visible.length})}</div>{/if}
</div>

<style>
  .ownership-history-summary{min-width:0;overflow-wrap:anywhere}
  .ownership-event-heading{font-weight:600}
  .ownership-event-heading strong{display:inline}
  .event-unit-change{margin-top:4px;line-height:1.4}
  .entity-link{position:relative;z-index:2;border:0;background:transparent;color:var(--accent);padding:0;max-width:100%;white-space:normal;overflow-wrap:anywhere;text-align:left;display:inline;font:inherit;font-weight:600}
  .entity-link:hover{text-decoration:underline}
  .entity-link:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style>
