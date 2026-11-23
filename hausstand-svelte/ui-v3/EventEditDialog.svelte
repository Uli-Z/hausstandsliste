<script>
  import { translate } from '../src/lib/i18n.js';
  import { appState } from '../src/stores/projectStore.js';
  import { dateDE, uid, clone } from '../src/lib/util.js';
  import { normShares } from '../src/lib/domain.js';
  import ShareEditor from './ShareEditor.svelte';
  import HelpTip from '../src/components/HelpTip.svelte';
  import { isEnterForSubmit } from './form-behavior.js';

  export let dialog;
  export let project;
  export let projection;

  $: event = project.events.find(e => e.id === dialog.eventId);
  let edited = null;

  $: if (event && !edited) {
    edited = clone(event);
    if (edited.type === 'shares-set' && !edited.financialMode) edited.financialMode = 'none';
  }

  function confirmFromInput(event) {
    if (!isEnterForSubmit(event)) return;
    event.preventDefault();
    save();
  }

  function save() {
    if (!edited) return;
    const saved = appState.mutateProject(p => {
      const idx = p.events.findIndex(e => e.id === edited.id);
      if (idx >= 0) p.events[idx] = { ...edited };
    });
    if (saved) appState.closeDialog();
  }

  function remove() {
    if (!confirm($translate("ui.delete-this-event-1nrohzk"))) return;
    const saved = appState.mutateProject(p => {
      p.events = p.events.filter(e => e.id !== event.id);
    });
    if (saved) appState.closeDialog();
  }

  $: people = projection.people;
  $: items = projection.items;
</script>

<div class="modal-backdrop">
  <div class="modal" role="dialog" aria-modal="true" aria-label={$translate("ui.edit-change-1t2xk03")} on:keydown={confirmFromInput}>
    <div class="modal-header">
      <h3>{$translate("ui.edit-change-1t2xk03")}</h3>
      <button class="ghost" on:click={() => appState.closeDialog()}>✕</button>
    </div>
    <div class="modal-body stack">
      {#if edited}
        <div class="form-grid">
          <label>{$translate("ui.date-o4j91o")} <input type="date" bind:value={edited.date}></label>
          
          {#if edited.type === 'person-added'}
            <label>{$translate("ui.name-at-that-time-81lqvy")} <input bind:value={edited.name}></label>
            <div class="notice">{$translate("ui.note-the-current-display-name-is-ed-5yqtde")}</div>
          {:else if edited.type === 'person-deactivated'}
            <label>{$translate("ui.reason-1rj1mxt")} <input bind:value={edited.reason}></label>
          {:else if edited.type === 'person-reactivated'}
            <label>{$translate("ui.reason-1rj1mxt")} <input bind:value={edited.reason}></label>
          {:else if edited.type === 'item-added'}
            <label>{$translate("ui.name-at-that-time-81lqvy")} <input bind:value={edited.name}></label>
            <label>{$translate("ui.initial-value-1dch75t")} <input type="number" step="0.01" bind:value={edited.initialValue}></label>
            <section class="mini-card stack">
              <strong>{$translate("ui.valuation-13jfos6")}</strong>
              <label>{$translate("ui.type-893bfe")} <select bind:value={edited.valuation.type}>
                <option value="fixed">{$translate("ui.fixed-constant-whx6g5")}</option>
                <option value="linear">{$translate("ui.linear-over-time-1ybmzdf")}</option>
                <option value="degressive">{$translate("ui.depreciation-per-year-wte2b6")}</option>
              </select></label>
              {#if edited.valuation.type === 'linear'}
                <label>{$translate("ui.useful-life-years-jdfjkh")} <input type="number" bind:value={edited.valuation.durationYears}></label>
              {:else if edited.valuation.type === 'degressive'}
                <label>{$translate("ui.annual-rate-0-1-17rz98n")} <input type="number" step="0.01" bind:value={edited.valuation.annualRate}></label>
              {/if}
              <label>{$translate("ui.minimum-value-hzgo71")} <input type="number" step="0.01" bind:value={edited.valuation.minimumValue}></label>
            </section>
            <section class="mini-card stack">
              <strong>{$translate("ui.original-ownership-shares-sekno0")}</strong>
              <ShareEditor {people} bind:shares={edited.shares} />
              <label>{$translate("ui.financed-by-whom-1dlzo4q")}
                <select value={edited.financedByPersonId || ''} on:change={e => {
                  edited.financedByPersonId = e.currentTarget.value;
                  edited.financialMode = edited.financedByPersonId ? 'derived' : 'none';
                }}>
                  <option value="">{$translate("ui.not-recorded-no-claim-1ixt11b")}</option>
                  {#each project.people || [] as person}
                    <option value={person.id}>{person.name}</option>
                  {/each}
                </select>
              </label>
            </section>
          {:else if edited.type === 'item-ended'}
            <label>{$translate("ui.status-afterwards-1g54j6w")} <select bind:value={edited.statusAfter}>
              <option value="ended">{$translate("ui.ended-15wisyk")}</option>
              <option value="taken-private">{$translate("ui.taken-over-privately-2cs8a0")}</option>
              <option value="disposed">{$translate("ui.disposed-of-broken-1220x7v")}</option>
              <option value="succeeded">{$translate("ui.continued-as-a-new-version-qiofo1")}</option>
            </select></label>
            <label>{$translate("ui.reason-1rj1mxt")} <input bind:value={edited.reason}></label>
          {:else if edited.type === 'shares-set'}
            <label>{$translate("ui.note-86vuh")} <input bind:value={edited.note}></label>
            <section class="mini-card stack">
              <strong>{$translate("ui.shares-1y9v96b")}</strong>
              <ShareEditor {people} bind:shares={edited.shares} />
              <label>{$translate("ui.should-financial-claims-arise-qd7qky")}
                <select bind:value={edited.financialMode}>
                  <option value="derived">{$translate("ui.yes-calculate-the-amount-dz8214")}</option>
                  <option value="none">{$translate("ui.no-gift-or-correction-dim67p")}</option>
                </select>
              </label>
              <HelpTip label={$translate("ui.what-does-paid-ownership-mean")}>{$translate("ui.paid-ownership-explained")}</HelpTip>
            </section>
          {/if}
        </div>
      {:else}
        <div class="empty">{$translate("ui.event-not-found-xoq41p")}</div>
      {/if}
    </div>
    <div class="modal-footer">
      <button class="danger" on:click={remove}>{$translate("ui.delete-odpvb4")}</button>
      <div style="flex:1"></div>
      <button on:click={() => appState.closeDialog()}>{$translate("ui.cancel-cl4zc9")}</button>
      <button class="primary" on:click={save}>{$translate("ui.save-change-1pvx2yb")}</button>
    </div>
  </div>
</div>
