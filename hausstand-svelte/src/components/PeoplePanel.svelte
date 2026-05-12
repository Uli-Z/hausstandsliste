<script>
  import { appState } from '../stores/projectStore.js';
  import { money } from '../lib/domain.js';
  export let people = [];
  export let totalValue = 0;
  export let activeItems = [];
</script>
<section class="panel">
  <div class="panel-header"><h2>👥 Personen</h2><button class="small" on:click={() => appState.setDialog({ type: 'personAdd' })}>➕ Person</button></div>
  <div class="panel-body stack">
    <div class="grid-3">
      <div class="mini-card"><div class="muted">Gesamtwert</div><strong>{money(totalValue)}</strong></div>
      <div class="mini-card"><div class="muted">Personen</div><strong>{people.length}</strong></div>
      <div class="mini-card"><div class="muted">Gegenstände</div><strong>{activeItems.length}</strong></div>
    </div>
    {#if people.length}
      <table>
        <thead><tr><th>Person</th><th>Status</th><th class="money">Wertanteil</th><th class="right">Positionen</th></tr></thead>
        <tbody>
          {#each people.slice().sort((a,b)=>b.totalValue-a.totalValue || a.name.localeCompare(b.name,'de')) as person}
            <tr class="clickable-row" on:click={() => appState.setRoute({ page: 'person', id: person.id })}>
              <td><strong>{person.name}</strong></td><td><span class="badge" class:ok={person.active} class:warn={!person.active}>{person.active ? 'aktiv' : 'inaktiv'}</span></td><td class="money">{money(person.totalValue)}</td><td class="right">{person.holdings.length}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}<div class="empty">Noch keine Personen oder Anteile zum Stichtag.</div>{/if}
  </div>
</section>
