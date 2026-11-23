<script>
  import { translate, formatPercent } from '../src/lib/i18n.js';
  import { normShares, shareTotal } from '../src/lib/domain.js';
  import { parseShareInput } from './form-behavior.js';
  export let people = [];
  export let shares = {};
  export let allowEqualize = false;
  function setShare(personId, value) { shares = { ...shares, [personId]: parseShareInput(value) }; }
  function removeShare(personId) { const next = { ...shares }; delete next[personId]; shares = next; }
  function addPerson(personId) { if (!personId) return; shares = { ...shares, [personId]: shares[personId] || 1 }; }
  $: positiveOwnerCount = Object.keys(normShares(shares)).length;
  $: totalUnits = shareTotal(normShares(shares));
  function equalize() {
    const selected = Object.keys(normShares(shares));
    if (selected.length < 2) return;
    shares = Object.fromEntries(selected.map(personId => [personId, 1]));
  }
  // Existing ownership rows may include inactive people, but new allocations
  // must choose someone participating on the event's effective date.
  $: available = people.filter(p => p.active !== false && !(p.id in shares));
</script>
<div class="stack">
  {#if allowEqualize && positiveOwnerCount > 1}
    <div class="share-editor-toolbar">
      <button type="button" class="small" on:click={equalize}>{$translate('items.equalShares')}</button>
    </div>
  {/if}
  {#each Object.entries(shares) as [personId, units]}
    <div class="share-row">
      <label>{$translate("ui.person-1i84mn4")} <select disabled><option>{people.find(p=>p.id===personId)?.name || personId}</option></select></label>
      <label>{$translate("ui.units-1xtsz9u")} <input type="number" min="0" step="0.01" value={units ?? ''} on:input={e => setShare(personId, e.currentTarget.value)}></label>
      <button class="danger" on:click={() => removeShare(personId)} type="button" aria-label={$translate("ui.remove-person-s-share-xybgun")}
        disabled={positiveOwnerCount === 1 && Number(units) > 0}
        title={positiveOwnerCount === 1 && Number(units) > 0 ? $translate("ui.transfer-the-last-owner-s-share-fi-1a7v21u") : $translate("ui.remove-share-xy7097")}>{$translate("ui.remove-9iqu14")}</button>
      {#if totalUnits > 0}
        <small class="share-percent">{formatPercent(Math.max(0, Number(units) || 0) / totalUnits)}</small>
      {/if}
    </div>
  {/each}
  {#if available.length}
    <label>{$translate("ui.add-another-person-sw2l01")} <select on:change={e => { addPerson(e.currentTarget.value); e.currentTarget.value=''; }}><option value="">{$translate("ui.select-1ija1xu")}</option>{#each available as person}<option value={person.id}>{person.name}</option>{/each}</select></label>
  {/if}
</div>

<style>
  .share-editor-toolbar{display:flex;justify-content:flex-end}
  .share-percent{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap;align-self:center}
  .share-row{grid-template-columns:minmax(0,1fr) 112px auto auto;gap:8px;align-items:end}
  @media(max-width:680px){.share-row{grid-template-columns:minmax(0,1fr) 1fr;gap:8px}.share-row>label:first-child{grid-column:1/-1}.share-row>label:nth-child(2){grid-column:1}.share-row>button{grid-column:2;grid-row:2;min-height:44px}.share-percent{grid-column:1/-1}}
</style>
