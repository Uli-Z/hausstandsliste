<script>
  export let people = [];
  export let shares = {};
  function setShare(personId, value) { shares = { ...shares, [personId]: Number(value) || 0 }; }
  function removeShare(personId) { const next = { ...shares }; delete next[personId]; shares = next; }
  function addPerson(personId) { if (!personId) return; shares = { ...shares, [personId]: shares[personId] || 1 }; }
  $: available = people.filter(p => !(p.id in shares));
</script>
<div class="stack">
  {#each Object.entries(shares) as [personId, units]}
    <div class="share-row">
      <label>Person <select disabled><option>{people.find(p=>p.id===personId)?.name || personId}</option></select></label>
      <label>Einheiten <input type="number" min="0" step="0.01" value={units} on:input={e => setShare(personId, e.currentTarget.value)}></label>
      <button class="danger" on:click={() => removeShare(personId)}>🗑️</button>
    </div>
  {/each}
  {#if available.length}
    <label>➕ Person hinzufügen <select on:change={e => { addPerson(e.currentTarget.value); e.currentTarget.value=''; }}><option value="">auswählen …</option>{#each available as person}<option value={person.id}>{person.name}</option>{/each}</select></label>
  {/if}
</div>
