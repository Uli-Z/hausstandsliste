<script>
  import { translate } from '../src/lib/i18n.js';
  import { visibleNames, nameRoleGroups } from '../src/lib/overviewNames.js';
  export let entries = [];
  // Names are plain throughout the app; explicit prop retained for callers.
  export let plain = true;
  export let onMore = null;
  export let onName = null;
  let expanded = false;
  $: summary = visibleNames(entries, expanded);
  $: groups = nameRoleGroups(summary.visible, entries);
</script>
{#if entries.length}
  <div class="compact-names" class:plain-names={plain}>
    {#each groups as group (group.role || 'names')}
      <div class="name-group">
        {#if group.label}<span class="name-group-label">{$translate(group.label)}: </span>{/if}
        <ul class="name-list" aria-label={group.label ? $translate(group.label) : undefined}>
          {#each group.entries as entry (entry.id)}
            <li class="name-chip">
              {#if onName}<button type="button" class="name-link" on:click={() => onName(entry.id)}>{entry.name}</button>{:else}{entry.name}{/if}
              {#if entry.detail}<span class="name-detail"> {entry.detail}</span>{/if}
            </li>
          {/each}
        </ul>
      </div>
    {/each}
    {#if summary.remaining}
      <button type="button" class="name-more" aria-expanded={onMore ? undefined : expanded} on:click={() => onMore ? onMore() : expanded = !expanded}>{expanded ? $translate('overview.less') : $translate('overview.more',{count:summary.remaining})}</button>
    {/if}
  </div>
{/if}
<style>
  .compact-names{min-width:0;max-width:100%;font-size:12px;line-height:1.5;position:relative;z-index:2;pointer-events:none}
  .name-group+.name-group{margin-top:3px}
  .name-group-label{font-weight:600;color:var(--muted)}
  .name-list{display:inline;list-style:none;padding:0;margin:0}
  .name-chip{display:inline;padding:0;background:transparent;overflow-wrap:anywhere;color:var(--text)}
  .name-chip:not(:last-child)::after{content:", "}
  .name-detail{font-size:11px;color:var(--muted);white-space:normal}
  .name-link,.name-more{background:transparent;color:var(--accent);border:0;padding:2px 0;font-size:inherit;text-align:left;overflow-wrap:anywhere;max-width:100%;white-space:normal;pointer-events:auto}
  .name-more{display:block;min-height:32px;text-decoration:underline;padding:3px 0 0;font-weight:600}
  .name-link:focus-visible,.name-more:focus-visible{outline:2px solid var(--accent)}
  .plain-names{font-size:13px}
</style>
