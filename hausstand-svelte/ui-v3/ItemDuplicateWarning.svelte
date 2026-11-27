<script>
  import { translate } from '../src/lib/i18n.js';
  import { itemDisplayName, duplicateItemStatus } from '../src/lib/itemNames.js';
  export let matches = [];
  export let projection;
</script>
<!-- Keep a live region mounted, but do not treat a duplicate as a validation error. -->
<span id="item-duplicate-warning" class="item-duplicate-warning" class:has-matches={matches.length > 0} role="status" aria-live="polite" aria-atomic="true">
  {#if matches.length}
    <strong>{$translate('items.duplicateWarning')}</strong>
    {#each matches as item (item.id)}
      <span class="duplicate-item-match">{itemDisplayName(item)}{#if duplicateItemStatus(item,projection) !== 'active'} · {$translate('items.duplicate.' + duplicateItemStatus(item,projection))}{/if}</span>
    {/each}
  {/if}
</span>
<style>
  .item-duplicate-warning{display:block;min-width:0;overflow-wrap:anywhere}
  .item-duplicate-warning.has-matches{font-size:.8rem;line-height:1.4;color:var(--warn);background:var(--warn-soft);border-radius:6px;padding:6px 8px;margin-top:3px}
  .duplicate-item-match{display:block}
</style>
