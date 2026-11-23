<script>
  import { appState } from '../src/stores/projectStore.js';
  import { locale, translate } from '../src/lib/i18n.js';
  import { money } from '../src/lib/domain.js';
  export let people = [];
  export let ledger = null;
  let search = '';
  $: filtered = people.filter(p => p.name.toLowerCase().includes(search.toLowerCase().trim()))
    .sort((a,b)=>Number(b.active)-Number(a.active) || a.name.localeCompare(b.name, $locale));
</script>

<section class="ux-panel">
  <div class="list-tools">
    <label class="search-wrap"><span class="sr-only">{$translate("people.searchLabel")}</span><input type="search" bind:value={search} placeholder={$translate("people.search")}/></label>
    <span class="result-count">{filtered.length} / {people.length} {$translate("nav.people")}</span>
  </div>
  {#if filtered.length}
    <div class="people-grid">
      {#each filtered as person (person.id)}
        {@const cents = ledger?.balances?.get(person.id) || 0}
        <article class="person-tile">
          <div class="person-heading">
            <h2>{person.name}</h2>
            {#if !person.active}<span class="person-status-text">{person.inactiveFrom ? $translate('people.moved') : $translate('people.inactive')}</span>{/if}
          </div>
          <div class="person-value"><span>{$translate("people.shareValue")}</span><strong>{money(person.totalValue || 0)}</strong></div>
          {#if cents !== 0}
            <div class="person-value">
              <span>{cents > 0 ? $translate('people.toReceive') : $translate('people.toSettle')}</span>
              <strong>{money(Math.abs(cents) / 100)}</strong>
            </div>
          {/if}
          <div class="person-bottom"><span>{person.holdings?.length || 0} Gegenstände</span><button on:click={() => appState.setRoute({page:'person',id:person.id})}>{$translate("people.profile")}</button></div>
        </article>
      {/each}
    </div>
  {:else}
    <div class="gentle-empty"><strong>{people.length ? $translate('people.noMatches') : $translate('people.none')}</strong>
      <p>{people.length ? $translate('people.try') : $translate('people.first')}</p>
      {#if !people.length}<button class="solid-action" on:click={() => appState.setDialog({type:'personAdd'})}>{$translate("app.personAdd")}</button>{/if}
    </div>
  {/if}
</section>

<style>
  .person-heading{align-items:baseline;flex-wrap:wrap}
  .person-heading h2{margin:0}
  .person-status-text{color:var(--muted);font-size:12px}
</style>
