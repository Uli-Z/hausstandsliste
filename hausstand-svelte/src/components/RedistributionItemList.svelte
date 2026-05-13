<script>
  import { createEventDispatcher } from 'svelte';
  import { money } from '../lib/domain.js';

  export let rows = [];
  export let filterText = '';
  export let selectedItemId = null;
  export let emptyLabel = 'Keine Gegenstände gefunden.';

  const dispatch = createEventDispatcher();

  $: needle = String(filterText || '').toLocaleLowerCase('de');
  $: filteredRows = rows.filter(row => row.itemName.toLocaleLowerCase('de').includes(needle));
</script>

{#if filteredRows.length}
  <div class="redistribution-item-list">
    {#each filteredRows as row}
      <button
        type="button"
        class="redistribution-item-card"
        class:is-selected={selectedItemId === row.itemId}
        class:is-changed={row.changed}
        on:click={() => dispatch('select', { row })}
      >
        <div class="split redistribution-item-head">
          <div class="stack compact-gap">
            <strong>{row.itemName}</strong>
            <div class="muted small-text">Wert: {money(row.itemValue)}</div>
          </div>
          <div class="row">
            {#if row.changed}
              <span class="badge ok">geändert</span>
            {:else}
              <span class="badge">unverändert</span>
            {/if}
          </div>
        </div>

        {#if row.changedPeople.length}
          <div class="redistribution-delta-list">
            {#each row.changedPeople as person}
              <div class="redistribution-delta-row">
                <span>{person.personName}</span>
                <span class="muted small-text">
                  {#if person.unitsDelta > 0}
                    bekommt {person.unitsDelta} Anteile
                  {:else}
                    gibt {Math.abs(person.unitsDelta)} Anteile ab
                  {/if}
                </span>
                <span class:positive={person.valueDelta > 0} class:negative={person.valueDelta < 0} class="money small-text">
                  {person.valueDelta > 0 ? '+' : ''}{money(person.valueDelta)}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </button>
    {/each}
  </div>
{:else}
  <div class="empty">{emptyLabel}</div>
{/if}

<style>
  .redistribution-item-list {
    display: grid;
    gap: 10px;
    overflow-y: auto;
    padding-right: 2px;
  }

  .redistribution-item-card {
    display: grid;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--panel);
  }

  .redistribution-item-card.is-changed {
    border-color: #b7ebcc;
    background: var(--ok-soft);
  }

  .redistribution-item-card.is-selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.12);
  }

  .redistribution-item-head {
    align-items: start;
  }

  .compact-gap {
    gap: 4px;
  }

  .small-text {
    font-size: 0.85rem;
  }

  .redistribution-delta-list {
    display: grid;
    gap: 6px;
    padding-top: 2px;
  }

  .redistribution-delta-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 10px;
    align-items: baseline;
    padding-top: 6px;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
  }

  .positive {
    color: var(--ok);
  }

  .negative {
    color: var(--warn);
  }

  @media (max-width: 1000px) {
    .redistribution-delta-row {
      grid-template-columns: 1fr;
      gap: 2px;
    }
  }
</style>
