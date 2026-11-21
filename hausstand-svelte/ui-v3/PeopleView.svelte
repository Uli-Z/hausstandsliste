<script>
  import { appState } from '../src/stores/projectStore.js';
  import { money } from '../src/lib/domain.js';
  export let people = [];
  let search = '';
  $: filtered = people.filter(p => p.name.toLowerCase().includes(search.toLowerCase().trim())).sort((a,b)=>Number(b.active)-Number(a.active) || a.name.localeCompare(b.name, 'de'));
</script>
<section class="ux-panel">
  <div class="list-tools"><label class="search-wrap"><span class="sr-only">Personen durchsuchen</span><input type="search" bind:value={search} placeholder="Person suchen …"/></label><span class="result-count">{filtered.length} von {people.length} Personen</span></div>
  {#if filtered.length}
    <div class="people-grid">
      {#each filtered as person (person.id)}
        <article class="person-tile">
          <div class="person-heading"><span class="avatar" aria-hidden="true">{person.name.trim().charAt(0).toUpperCase()}</span><span class:inactive={!person.active} class="person-status">{person.active ? 'Dabei' : 'Nicht mehr dabei'}</span></div>
          <h2>{person.name}</h2>
          <div class="person-value"><span>Wert der eigenen Anteile</span><strong>{money(person.totalValue || 0)}</strong></div>
          <div class="person-bottom"><span>{person.holdings?.length || 0} Gegenstände</span><button on:click={() => appState.setRoute({page:'person',id:person.id})}>Profil öffnen →</button></div>
        </article>
      {/each}
    </div>
  {:else}<div class="gentle-empty"><strong>{people.length ? 'Keine Treffer' : 'Noch keine Personen'}</strong><p>{people.length ? 'Versuche einen anderen Namen.' : 'Lege die ersten Personen an, bevor du gemeinsame Gegenstände erfasst.'}</p>{#if !people.length}<button class="solid-action" on:click={() => appState.setDialog({type:'personAdd'})}>Person hinzufügen</button>{/if}</div>{/if}
</section>
