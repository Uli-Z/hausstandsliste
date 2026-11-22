<script>
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
      <label>Person <select disabled><option>{people.find(p=>p.id===personId)?.name || personId}</option></select></label>
      <label>Einheiten <input type="number" min="0" step="0.01" value={units ?? ''} on:input={e => setShare(personId, e.currentTarget.value)}></label>
      <button class="danger" on:click={() => removeShare(personId)} type="button" aria-label="Anteil der Person entfernen"
        disabled={positiveOwnerCount === 1 && Number(units) > 0}
        title={positiveOwnerCount === 1 && Number(units) > 0 ? 'Letzte Eigentümerin bzw. letzten Eigentümer erst übertragen oder Gegenstand beenden' : 'Anteil entfernen'}>Entfernen</button>
    </div>
  {/each}
  {#if available.length}
    <label>Weitere Person beteiligen <select on:change={e => { addPerson(e.currentTarget.value); e.currentTarget.value=''; }}><option value="">auswählen …</option>{#each available as person}<option value={person.id}>{person.name}</option>{/each}</select></label>
  {/if}
</div>
