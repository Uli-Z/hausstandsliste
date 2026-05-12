<script>
  import { appState } from '../stores/projectStore.js';
  import { money } from '../lib/domain.js';
  import { label as valuationLabel } from '../lib/valuation.js';
  export let items = [];
  export let tags = [];
  let search = '';
  let tag = '';
  $: filtered = items.filter(item => (!tag || (item.tags || []).includes(tag)) && (!search.trim() || [item.name, item.note, ...(item.tags || [])].join(' ').toLowerCase().includes(search.toLowerCase().trim()))).sort((a,b)=>a.name.localeCompare(b.name,'de'));
</script>
<section class="panel">
  <div class="panel-header"><h2>📦 Aktive Gegenstände</h2><div class="row"><button class="small" on:click={() => appState.setDialog({ type: 'itemAdd' })}>➕ Gegenstand</button><button class="small" on:click={() => appState.setDialog({ type: 'redistributionNew' })}>🔁 Umverteilung</button></div></div>
  <div class="panel-body stack">
    <div class="row"><input bind:value={search} placeholder="Suche nach Name, Tag oder Notiz …"><select bind:value={tag} style="max-width:220px"><option value="">Alle Tags</option>{#each tags as t}<option>{t}</option>{/each}</select></div>
    {#if filtered.length}
      <table><thead><tr><th>Gegenstand</th><th>Tags</th><th>Bewertung</th><th class="right">Anteilseigner</th><th class="money">Gesamtwert</th></tr></thead><tbody>
      {#each filtered as item}
        <tr class="clickable-row" on:click={() => appState.setRoute({ page: 'item', id: item.id })}>
          <td><strong>{item.name}</strong>{#if item.note}<div class="muted">{item.note}</div>{/if}</td>
          <td>{#if item.tags?.length}{#each item.tags as tag}<span class="tag">{tag}</span>{/each}{:else}<span class="muted">–</span>{/if}</td>
          <td>{valuationLabel(item.runtime.valuation)}</td><td class="right">{item.shareRows.length}</td><td class="money">{money(item.value)}</td>
        </tr>
      {/each}
      </tbody></table>
    {:else}<div class="empty">Keine passenden aktiven Gegenstände mit Wert.</div>{/if}
  </div>
</section>
