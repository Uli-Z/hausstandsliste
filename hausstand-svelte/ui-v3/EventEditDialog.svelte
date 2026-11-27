<script>
  import { notifications } from '../src/lib/notifications.js';
  const notifyError = message => notifications.notify(message, {kind:'error'});
  import { translate, parseDecimal } from '../src/lib/i18n.js';
  import { appState } from '../src/stores/projectStore.js';
  import { replaceEditableEvent, removeEvent, editableEventCopy, redateEditableEvent } from '../src/lib/eventMutations.js';
  import { dateDE, uid, clone } from '../src/lib/util.js';
  import { normShares } from '../src/lib/domain.js';
  import { validShareMap } from '../src/lib/shareUnits.js';
  import { projectAt } from '../src/lib/projector.js';
  import { recordedContributions } from '../src/lib/purchaseFinancing.js';
  import PurchaseFinancing from './PurchaseFinancing.svelte';
  import PurchaseBreakdown from './PurchaseBreakdown.svelte';
  import { purchaseBreakdown } from '../src/lib/ledger.js';
  import ShareEditor from './ShareEditor.svelte';
  import { isEnterForSubmit } from './form-behavior.js';

  export let dialog;
  export let project;
  export let projection;

  $: event = project.events.find(e => e.id === dialog.eventId);
  let edited = null;
  let contributions = null;
  let financingValid = false;
  $: isPurchase = event?.type === 'item-added' && !project.items.find(i=>i.id===event.itemId)?.predecessorItemId;

  $: if (event && !edited) {
    edited = editableEventCopy(project,event);
    if (event.type === 'item-added') contributions = recordedContributions(event);
    if (edited.type === 'shares-set' && !edited.financialMode) edited.financialMode = 'none';
  }

  // Keep localized decimal input as text until save; do not replace invalid
  // values with zero or lose the user's partially typed input.
  $: minimumRaw = edited?.type === 'item-added' ? String(edited.valuation?.minimumValue ?? '').trim() : '';
  $: minimumAmount = minimumRaw === '' ? 0 : parseDecimal(minimumRaw);
  $: minimumCents = Math.round(minimumAmount * 100);
  $: minimumValid = edited?.type !== 'item-added' || (Number.isFinite(minimumAmount) &&
    minimumAmount >= 0 && Number.isSafeInteger(minimumCents) &&
    Math.abs(minimumAmount * 100 - minimumCents) <= 1e-7);

  $: sharesValid = !['item-added','shares-set'].includes(edited?.type) ||
    (validShareMap(edited.shares) && Object.values(edited.shares).some(value=>value>0));

  $: purchaseRows = isPurchase && sharesValid && financingValid
    ? purchaseBreakdown(Math.round(edited.initialValue*100),normShares(edited.shares),contributions) : [];

  function confirmFromInput(event) {
    if (!isEnterForSubmit(event)) return;
    event.preventDefault();
    save();
  }

  function changeDate(inputEvent) {
    try {
      edited = redateEditableEvent(project,edited,inputEvent.currentTarget.value);
    } catch {
      inputEvent.currentTarget.value = edited.date;
      notifyError($translate('errors.shareDateConflict'));
    }
  }

  function save() {
    if (!edited || !minimumValid || !sharesValid || (isPurchase && !financingValid)) return;
    if (isPurchase) edited.purchaseContributionsCents = contributions;
    if (edited.type === 'item-added') edited.valuation.minimumValue = minimumAmount;
    const saved = appState.mutateProject(p => replaceEditableEvent(p, edited));
    if (saved) appState.closeDialog();
  }

  function remove() {
    if (!confirm($translate("ui.delete-this-event-1nrohzk"))) return;
    const saved = appState.mutateProject(p => removeEvent(p, event.id));
    if (saved) appState.closeDialog();
  }

  // Date edits see people participating on that event date, not the current view date.
  $: people = edited?.date ? projectAt(project, edited.date).allPeople : projection.allPeople;
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
          <label>{$translate("ui.date-o4j91o")} <input type="date" value={edited.date} on:change={changeDate}></label>
          
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
            <section class="stack item-valuation-edit-fields wide">
              <label>{$translate("ui.how-does-the-value-change-16f9eit")} <select bind:value={edited.valuation.type}>
                <option value="linear">{$translate("ui.value-decreases-linearly-1u8yk0y")}</option>
                <option value="degressive">{$translate("ui.value-decreases-by-a-percentage-eac-1g9op4c")}</option>
                <option value="fixed">{$translate("ui.value-remains-constant-1tdyxfv")}</option>
              </select></label>
              {#if edited.valuation.type === 'linear'}
                <label>{$translate("ui.useful-life-years-jdfjkh")} <input type="number" bind:value={edited.valuation.durationYears}></label>
              {:else if edited.valuation.type === 'degressive'}
                <label>{$translate("ui.annual-rate-0-1-17rz98n")} <input type="number" step="0.01" bind:value={edited.valuation.annualRate}></label>
              {/if}
              <label>{$translate("ui.minimum-value-hzgo71")} <input type="text" inputmode="decimal" autocomplete="off" bind:value={edited.valuation.minimumValue} aria-invalid={!minimumValid}></label>
              {#if !minimumValid}<p class="notice warn" role="alert">{$translate('errors.invalidItemValue')}</p>{/if}
            </section>
            <section class="stack wide">
              {#if isPurchase}
                <PurchaseFinancing people={project.people} ownerPeople={people} bind:shares={edited.shares}
                  amountCents={Math.round(edited.initialValue*100)} bind:contributions bind:valid={financingValid} editing={true} />
                <p class="muted">{$translate('purchase.editOriginalHint')}</p>
                {#if purchaseRows.length}<section class="stack purchase-edit-preview" aria-live="polite"><strong>{$translate('items.purchasePreview')}</strong><PurchaseBreakdown rows={purchaseRows} personName={id=>project.people.find(p=>p.id===id)?.name||id}/></section>{/if}
              {:else}
                <strong>{$translate("ui.original-ownership-shares-sekno0")}</strong>
                <ShareEditor {people} bind:shares={edited.shares} />
              {/if}
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
              <p class="context-note">{$translate("help.shareChange")}</p>
            </section>
          {/if}
        </div>
      {:else}
        <div class="empty">{$translate("ui.event-not-found-xoq41p")}</div>
      {/if}
    </div>
    {#if !sharesValid}<p role="alert" class="notice warn">{$translate('forms.invalidShares')}</p>{/if}
    <div class="modal-footer">
      <button class="danger" on:click={remove}>{$translate("ui.delete-odpvb4")}</button>
      <div style="flex:1"></div>
      <button on:click={() => appState.closeDialog()}>{$translate("ui.cancel-cl4zc9")}</button>
      <button class="primary" on:click={save} disabled={!minimumValid || !sharesValid || (isPurchase && !financingValid) || $appState.readOnly}>{$translate("ui.save-change-1pvx2yb")}</button>
    </div>
  </div>
</div>

<style>
  .item-valuation-edit-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;min-width:0}
  .item-valuation-edit-fields>label:first-child,.item-valuation-edit-fields>.notice{grid-column:1/-1}
  .item-valuation-edit-fields input,.item-valuation-edit-fields select{min-width:0;max-width:100%}
</style>
