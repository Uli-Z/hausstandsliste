<script>
  import { appState } from '../src/stores/projectStore.js';
  import { money } from '../src/lib/domain.js';
  export let people = [];
  export let ledger = null;
  let search = '';
  $: filtered = people.filter(p => p.name.toLowerCase().includes(search.toLowerCase().trim()))
    .sort((a,b)=>Number(b.active)-Number(a.active) || a.name.localeCompare(b.name, 'de'));
</script>

<section class="ux-panel">
  <div class="list-tools">
    <label class="search-wrap"><span class="sr-only">Personen durchsuchen</span><input type="search" bind:value={search} placeholder="Person suchen …"/></label>
    <span class="result-count">{filtered.length} von {people.length} Personen</span>
  </div>
  {#if filtered.length}
    <div class="people-grid">
      {#each filtered as person (person.id)}
        {@const cents = ledger?.balances?.get(person.id) || 0}
        <article class="person-tile">
          <div class="person-heading">
            <h2>{person.name}</h2>
            {#if !person.active}<span class="person-status-text">{person.inactiveFrom ? 'Ausgezogen' : 'Nicht mehr dabei'}</span>{/if}
          </div>
          <div class="person-value"><span>Aktueller Wert der Anteile</span><strong>{money(person.totalValue || 0)}</strong></div>
          {#if cents !== 0}
            <div class="person-value">
              <span>{cents > 0 ? 'Noch zu erhalten' : 'Noch auszugleichen'}</span>
              <strong>{money(Math.abs(cents) / 100)}</strong>
            </div>
          {/if}
          <div class="person-bottom"><span>{person.holdings?.length || 0} Gegenstände</span><button on:click={() => appState.setRoute({page:'person',id:person.id})}>Profil öffnen →</button></div>
        </article>
      {/each}
    </div>
  {:else}
    <div class="gentle-empty"><strong>{people.length ? 'Keine Treffer' : 'Noch keine Personen'}</strong>
      <p>{people.length ? 'Versuche einen anderen Namen.' : 'Lege die ersten Personen an, bevor du gemeinsame Gegenstände erfasst.'}</p>
      {#if !people.length}<button class="solid-action" on:click={() => appState.setDialog({type:'personAdd'})}>Person hinzufügen</button>{/if}
    </div>
  {/if}
</section>

<style>
  .person-heading{align-items:baseline;flex-wrap:wrap}
  .person-heading h2{margin:0}
  .person-status-text{color:var(--muted);font-size:12px}
</style>
