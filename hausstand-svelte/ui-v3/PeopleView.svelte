<script>
  import ActionIcon from '../src/components/ActionIcon.svelte';
  import { appState } from '../src/stores/projectStore.js';
  import { locale, translate } from '../src/lib/i18n.js';
  import { money } from '../src/lib/domain.js';
  export let people = [];
  export let ledger = null;
  let search = '';
  let showArchived = false;
  $: activeCount = people.filter(p=>p.active).length;
  $: archivedCount = people.length - activeCount;
  $: visiblePeople = people.filter(p => showArchived ? !p.active : p.active);
  $: filtered = visiblePeople.filter(p => p.name.toLowerCase().includes(search.toLowerCase().trim()))
    .sort((a,b)=>a.name.localeCompare(b.name, $locale));
</script>

<section class="ux-panel">
  <div class="people-status-filter" role="group" aria-label={$translate('people.statusFilter')}>
    <button type="button" aria-pressed={!showArchived} class:primary={!showArchived} on:click={() => showArchived=false}>{$translate('people.active')} ({activeCount})</button>
    <button type="button" aria-pressed={showArchived} class:primary={showArchived} on:click={() => showArchived=true}>{$translate('people.moved')} ({archivedCount})</button>
  </div>
  <div class="list-tools">
    <label class="search-wrap"><span class="sr-only">{$translate("people.searchLabel")}</span><input type="search" bind:value={search} placeholder={$translate("people.search")}/></label>
    {#if search.trim()}
      <span class="result-count" aria-live="polite">{filtered.length} / {visiblePeople.length} {$translate("nav.people")}</span>
    {/if}
  </div>
  {#if filtered.length}
    <div class="people-table" role="table" aria-label={$translate('nav.people')}>
      <div class="people-table-header" role="row">
        <span role="columnheader">{$translate('people.columnName')}</span>
        <span role="columnheader">{$translate('people.columnItems')}</span>
        <span role="columnheader">{$translate('people.columnValue')}</span>
        <span role="columnheader">{$translate('people.columnBalance')}</span>
        <span role="columnheader">{$translate('people.columnActions')}</span>
      </div>
      {#each filtered as person (person.id)}
        {@const cents = ledger?.balances?.get(person.id) || 0}
        <div class="person-row action-card" role="row" data-person-id={person.id}>
          <div class="person-name-cell" role="cell">
            <button class="person-name card-primary" type="button" on:click={() => appState.setRoute({page:'person',id:person.id})}>{person.name}</button>
          </div>
          <div class="person-count" role="cell">
            <span class="mobile-cell-label">{$translate('people.columnItems')}</span>
            <strong>{(person.holdings || []).filter(h => h.units > 0).length}</strong>
          </div>
          <div class="person-share-value" role="cell">
            <span class="mobile-cell-label">{$translate('people.columnValue')}</span>
            <strong>{money(person.totalValue || 0)}</strong>
          </div>
          <div class="person-balance" role="cell" class:receivable={cents > 0} class:payable={cents < 0}>
            <span class="mobile-cell-label">{$translate('people.columnBalance')}</span>
            <strong>{money(Math.abs(cents) / 100)}</strong>
            <span class="balance-direction">{cents === 0 ? $translate('balance.zero') : cents > 0 ? $translate('people.toReceive') : $translate('people.toSettle')}</span>
          </div>
          <div class="person-action-cell" role="cell">
            <button class="card-secondary person-status-action" type="button" on:click={() => appState.setDialog({type:'personStatus',personId:person.id,kind:person.active?'deactivate':'reactivate'})}><ActionIcon name={person.active?'archive':'person-add'} size={16}/><span>{$translate(person.active?'ui.mark-as-moved-out-11arjl':'ui.reactivate-iggdm2')}</span></button>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="gentle-empty"><strong>{visiblePeople.length ? $translate('people.noMatches') : $translate(showArchived ? 'people.noneArchived' : 'people.noneActive')}</strong>
      {#if visiblePeople.length}<p>{$translate('people.try')}</p>
      {:else if !showArchived}<button class="solid-action" on:click={() => appState.setDialog({type:'personAdd'})}>{$translate("app.personAdd")}</button>{/if}
    </div>
  {/if}
</section>

<style>
  .people-status-filter{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
  .people-status-filter button{min-height:44px}
  .people-table{min-width:0}
  .people-table-header,.person-row{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,.65fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.05fr);align-items:center;gap:12px;padding:12px 8px}
  .people-table-header{font-size:12px;font-weight:600;color:var(--muted);border-bottom:1px solid var(--border)}
  .person-row{min-height:62px;border-bottom:1px solid var(--border);font-size:14px}
  .person-row:last-child{border-bottom:0}
  .person-row:hover{background:var(--soft)}
  .person-row > div,.people-table-header > span{min-width:0;overflow-wrap:anywhere}
  .person-name{border:0;background:transparent;padding:4px 0;font-size:15px;font-weight:650;text-align:left;white-space:normal;overflow-wrap:anywhere;max-width:100%;color:var(--accent)}
  .person-count,.person-share-value,.person-balance{font-variant-numeric:tabular-nums}
  .balance-direction{display:block;color:var(--muted);font-size:11px;line-height:1.4}
  .receivable strong{color:var(--ok)}
  .payable strong{color:var(--danger)}
  .person-status-action{display:inline-flex;align-items:center;gap:5px;min-height:44px;white-space:normal;padding:5px 7px;font-size:12px;text-align:left;max-width:100%}
  .person-status-action span{min-width:0;overflow-wrap:anywhere}
  .mobile-cell-label{display:none}
  @media(max-width:850px){
    .people-table-header{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;padding:0;border:0}
    .person-row{grid-template-columns:repeat(3,minmax(0,1fr));gap:5px 8px;padding:10px 4px;align-items:start}
    .person-name-cell{grid-column:1/3;grid-row:1;align-self:center}
    .person-action-cell{grid-column:3;grid-row:1;justify-self:end}
    .person-count,.person-share-value,.person-balance{grid-row:2}
    .mobile-cell-label{display:block;font-size:11px;color:var(--muted);line-height:1.3;margin-bottom:2px}
    .person-status-action{font-size:11px}
  }
</style>
