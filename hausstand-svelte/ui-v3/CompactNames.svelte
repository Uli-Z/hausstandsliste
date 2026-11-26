<script>
  import { translate } from '../src/lib/i18n.js';
  import { visibleNames } from '../src/lib/overviewNames.js';
  export let entries = [];
  export let onMore = null;
  export let onName = null;
  let expanded = false;
  $: summary = visibleNames(entries, expanded);
</script>
{#if entries.length}
  <div class="compact-names">
    <ul class="name-list">
      {#each summary.visible as entry (entry.id)}
        <li class="name-chip">
          {#if onName}<button type="button" class="name-link" on:click={() => onName(entry.id)}>{entry.name}</button>{:else}{entry.name}{/if}
          {#if entry.roles?.length}<span class="name-role"> · {entry.roles.map(role=>$translate(role)).join(' / ')}</span>{/if}
          {#if entry.detail}<span class="name-role"> {entry.detail}</span>{/if}
        </li>
      {/each}
    </ul>
    {#if summary.remaining}
      <button type="button" class="name-more" aria-expanded={onMore ? undefined : expanded} on:click={() => onMore ? onMore() : expanded = !expanded}>{expanded ? $translate('overview.less') : $translate('overview.more',{count:summary.remaining})}</button>
    {/if}
  </div>
{/if}
<style>
  .compact-names{min-width:0;max-width:100%;font-size:12px;line-height:1.35;position:relative;z-index:2}
  .name-list{display:flex;flex-wrap:wrap;gap:4px;list-style:none;padding:0;margin:0;min-width:0}
  .name-chip{background:var(--soft);border-radius:8px;padding:3px 6px;max-width:100%;min-width:0;overflow-wrap:anywhere;color:var(--text)}
  .name-role{font-size:11px;color:var(--muted)}
  .name-link,.name-more{background:transparent;color:var(--accent);border:0;padding:2px 0;font-size:inherit;text-align:left;overflow-wrap:anywhere;max-width:100%;white-space:normal}
  .name-more{min-height:32px;text-decoration:underline}
  .name-link:focus-visible,.name-more:focus-visible{outline:2px solid var(--accent)}
</style>
