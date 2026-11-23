<script>
  import { translate } from '../srclib/i18n.js';
  import { normShares } from '../src/lib/domain.js';
  import { parseShareInput } from './form-behavior.js';
  export let people = [];
  export let shares = {};
  function setShare(personId, value) { shares = { ...shares, [personId]: parseShareInput(value) }; }
  function removeShare(personId) { const next = { ...shares }; delete next[personId]; shares = next; }
  function addPerson(personId) { if (!personId) return; shares = { ...shares, [personId]: shares[personId] || 1 }; }
  $: positiveOwnerCount = Object.keys(normShares(shares)).length;
  $: available = people.filter(p => !(p.id in shares));
</script>
<div class="stack">
  {#each Object.entries(shares) as [personId, units]}
    <div class="share-row">
      <label>{$translate("ui.person-1i84mn4")} <select disabled><option>{people.find(p=>p.id===personId)?.name || personId}</option></select></label>
      <label>{$translate("ui.units-1xtsz9u")} <input type="number" min="0" step="0.01" value={units ?? ''} on:input={e => setShare(personId, e.currentTarget.value)}></label>
      <button class="danger" on:click={() => removeShare(personId)} type="button" aria-label={$translate("ui.remove-person-s-share-xybgun")}
        disabled={positiveOwnerCount === 1 && Number(units) > 0}
        title={positiveOwnerCount === 1 && Number(units) > 0 ? 'Letzte Eigentümerin bzw. letzten Eigentümer erst übertragen oder Gegenstand beenden' : $translate("ui.remove-share-xy7097")}>{$translate("ui.remove-9iqu14")}</button>
    </div>
  {/each}
  {#if available.length}
    <label>{$translate("ui.add-another-person-sw2l01")} <select on:change={e => { addPerson(e.currentTarget.value); e.currentTarget.value=''; }}><option value="">{$translate("ui.select-1ija1xu")}</option>{#each available as person}<option value={person.id}>{person.name}</option>{/each}</select></label>
  {/if}
</div>
