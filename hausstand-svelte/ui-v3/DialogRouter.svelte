<script>
  import { translate, parseDecimal, localizeDiagnostic } from '../src/lib/i18n.js';
  import { appState, createEvent, createRedistribution } from '../src/stores/projectStore.js';
  import { uid, parseTags, nextEventOrder } from '../src/lib/util.js';
  import { projectAt } from '../src/lib/projector.js';
  import { validCalendarDate } from '../src/lib/timeTravel.js';
  import { normShares, money } from '../src/lib/domain.js';
  import { purchaseClaims as derivePurchaseClaims, personBalances } from '../src/lib/ledger.js';
  import PurchaseFinancing from './PurchaseFinancing.svelte';
  import { normalizePersonName, duplicatePersonName, addPerson as applyPersonAdd, renamePerson, personStatusProblem, changePersonStatus } from '../src/lib/personMutations.js';
  import { addItem as applyItemAdd, continueItem as applyItemContinue, updateItemMetadata, setItemShares, endItem as applyItemEnd, validMoney } from '../src/lib/itemMutations.js';
  import { createItemDraft } from '../src/lib/draftMutations.js';
  import { personDeletionEligibility, deleteUnusedPerson } from '../src/lib/personDeletion.js';
  import RedistributionDialog from './RedistributionDialog.svelte';
  import EventEditDialog from './EventEditDialog.svelte';
  import ExecutedRedistributionEditDialog from './ExecutedRedistributionEditDialog.svelte';
  import ShareEditor from './ShareEditor.svelte';
  import SettlementDialog from '../src/components/SettlementDialog.svelte';
  import HelpTip from '../src/components/HelpTip.svelte';
  import { isEnterForSubmit } from './form-behavior.js';
  export let dialog;
  export let project;
  export let projection;
  export let asOfDate;

  let name = '';
  let reason = '';
  let itemName = '';
  let tags = '';
  let note = '';
  let initialValue = 0;
  let valuationType = 'linear';
  let durationYears = 6;
  let annualRate = 0.2;
  let minimumValue = 0;
  let shares = {};
  let shareFinancialMode = 'derived';
  let purchaseContributionsCents = null;
  let financingValid = false;
  let alreadySettled = false;
  let paymentDate = '';
  let effectiveDate = '';
  let dateSharesRebased = false;
  let itemExtrasOpen = false;
  let initializedFor = null;
  // Effective dates are independent of the view once a dialog/draft is opened.
  $: if (dialog && dialog !== initializedFor) {
    initializedFor = dialog;
    const draft = dialog.id ? (project.drafts || []).find(d => d.id === dialog.id) : null;
    effectiveDate = draft?.data?.effectiveDate || asOfDate;
    dateSharesRebased = false;
    paymentDate = effectiveDate;
    alreadySettled = false;
    itemExtrasOpen = dialog.type === 'itemContinue' || !!dialog.id;
    if (dialog.type === 'itemAdd' && !dialog.id) {
      // Make the default equal ownership explicit rather than silently
      // assigning all currently active people only on save.
      shares = Object.fromEntries(projectAt(project, effectiveDate).people
        .filter(p => p.active).map(p => [p.id, 1]));
    }
  }
  $: dateValid = validCalendarDate(effectiveDate);
  $: entryProjection = dateValid ? projectAt(project, effectiveDate) : projection;
  $: hasEventDate = ['personAdd', 'personStatus', 'itemAdd', 'itemContinue', 'shareSet', 'itemEnd'].includes(dialog?.type);
  $: needsActiveItem = ['itemContinue', 'shareSet', 'itemEnd'].includes(dialog?.type);
  $: itemAvailable = !needsActiveItem || !!entryProjection.activeItems.find(item => item.id === dialog.itemId);
  $: itemNeedsOwners = ['itemAdd', 'itemContinue'].includes(dialog?.type);
  $: peopleAvailable = !itemNeedsOwners || entryProjection.people.some(person => person.active);
  $: statusTargetValid = dialog?.type !== 'personStatus' ||
    !personStatusProblem(project, { personId: dialog.personId, date: effectiveDate, kind: dialog.kind });
  $: itemCost = Number(initialValue);
  $: itemCostCents = Math.round(itemCost * 100);
  $: itemCostValid = !itemNeedsOwners || validMoney(itemCost);
  $: ownersValid = !itemNeedsOwners || Object.keys(normShares(shares)).length > 0;
  $: itemNameValid = !itemNeedsOwners || !!String(itemName || '').trim();
  // Keep the raw minimum-value text while typing: a German decimal comma must
  // neither collapse the details panel nor silently be stored as zero.
  $: minimumValueAmount = String(minimumValue ?? '').trim() === '' ? 0 : parseDecimal(minimumValue);
  $: minimumValueCents = Math.round(minimumValueAmount * 100);
  $: minimumValueValid = !itemNeedsOwners || validMoney(minimumValueAmount);
  $: canSubmitDated = dateValid && itemAvailable && peopleAvailable && statusTargetValid &&
    itemCostValid && ownersValid && itemNameValid && minimumValueValid &&
    (dialog?.type !== 'itemAdd' || (financingValid && (!alreadySettled || validCalendarDate(paymentDate))));
  $: purchaseShares = normShares(shares);
  $: purchaseOwnerCount = Object.keys(purchaseShares).length;
  $: purchaseClaims = dialog?.type === 'itemAdd' && itemCostValid && ownersValid && financingValid
    ? derivePurchaseClaims(itemCostCents,purchaseShares,purchaseContributionsCents) : [];
  $: purchaseBalances = [...personBalances(purchaseClaims)];
  function changeEffectiveDate(event) {
    const nextDate = event.currentTarget.value;
    if (validCalendarDate(nextDate)) {
      const atDate = projectAt(project, nextDate);
      if (['shareSet', 'itemContinue'].includes(dialog?.type)) {
        const item = atDate.activeItems.find(item => item.id === dialog.itemId);
        if (item) {
          // Default shares and replacement value must reflect the new date,
          // not the shares from when the dialog was first opened.
          shares = { ...item.shares };
          if (dialog.type === 'itemContinue') {
            initialValue = Math.round(item.value * 100) / 100;
          }
          dateSharesRebased = true;
        }
      } else if (dialog?.type === 'itemAdd') {
        // A future or former participant must not remain silently selected
        // as an owner when the user chooses another purchase date.
        shares = Object.fromEntries(Object.entries(shares).filter(([id]) =>
          atDate.peopleById.get(id)?.active));
        // Preserve explicitly entered contributions; invalid participants block saving.
      }
    }
    if (paymentDate === effectiveDate) paymentDate = nextDate;
    effectiveDate = nextDate;
  }

  function finishDatedChange(saved) {
    if (!saved) return;
    const confirmedDate = effectiveDate;
    close();
    if (confirmedDate > asOfDate) appState.setAsOfDate(confirmedDate);
  }
  $: normalizedName = normalizePersonName(name);
  $: duplicatePerson = dialog?.type === 'personAdd'
    ? duplicatePersonName(project, name)
    : (dialog?.type === 'personMeta'
      ? duplicatePersonName(project, name, person?.id)
      : null);
  $: duplicateProjection = duplicatePerson ? entryProjection.peopleById.get(duplicatePerson.id) : null;
  $: duplicateIsActive = !!duplicateProjection?.active;
  $: duplicateAddedEvent = duplicatePerson
    ? (project.events || []).find(e => e.type === 'person-added' && String(e.personId) === String(duplicatePerson.id))
    : null;
  $: duplicateIsFutureMoveIn = !!(duplicateAddedEvent?.date && duplicateAddedEvent.date > effectiveDate);
  $: duplicateLatestDeactivation = duplicatePerson
    ? [...(project.events || [])]
      .reverse()
      .find(e => e.type === 'person-deactivated' && String(e.personId) === String(duplicatePerson.id))
    : null;
  $: canSavePersonName = !!normalizedName && !duplicatePerson;

  $: person = dialog?.personId ? project.people.find(p => p.id === dialog.personId) : null;
  $: deleteEligibility = person ? personDeletionEligibility(project, person.id) : { allowed: false, reason: 'Keine Person ausgewählt.' };
  $: item = dialog?.itemId ? project.items.find(i => i.id === dialog.itemId) : null;
  $: projectedItem = dialog?.itemId ? projection.items.find(i => i.id === dialog.itemId) : null;
  $: if (dialog?.type === 'personMeta' && person && !name) name = person.name;
  $: if (dialog?.type === 'itemMeta' && item && !itemName) { itemName = item.name; tags = (item.tags || []).join(', '); note = item.note || ''; }
  $: if (dialog?.type === 'itemAdd' && dialog.id && !itemName) {
    const draft = (project.drafts || []).find(d => d.id === dialog.id);
    if (draft && draft.type === 'item') {
      itemName = draft.data.name;
      tags = (draft.data.tags || []).join(', ');
      note = draft.data.note;
      initialValue = draft.data.initialValue;
      valuationType = draft.data.valuation.type;
      durationYears = draft.data.valuation.durationYears || 6;
      annualRate = draft.data.valuation.annualRate || 0.2;
      minimumValue = draft.data.valuation.minimumValue || 0;
      shares = { ...(draft.data.shares || {}) };
      purchaseContributionsCents = draft.data.purchaseContributionsCents ?? null;
    }
  }
  $: if ((dialog?.type === 'shareSet' || (dialog?.type === 'itemAdd' && !dialog.id) || dialog?.type === 'itemContinue') && projectedItem && Object.keys(shares).length === 0) {
    shares = { ...(projectedItem.shares || {}) };
    if (dialog?.type === 'itemContinue') {
      itemName = projectedItem.name + ' (neu)';
      tags = (projectedItem.tags || []).join(', ');
      note = projectedItem.note || '';
      initialValue = Math.round(projectedItem.value * 100) / 100;
      valuationType = projectedItem.runtime.valuation.type;
      durationYears = projectedItem.runtime.valuation.durationYears || 6;
      annualRate = projectedItem.runtime.valuation.annualRate || 0.2;
      minimumValue = projectedItem.runtime.valuation.minimumValue || 0;
    }
  }

  // Enter bestätigt den primären Dialog-Button; Textbereiche und Auswahlfelder bleiben unbeeinflusst.
  function confirmFromInput(event) {
    if (!isEnterForSubmit(event)) return;
    const action = {
      personAdd: addPerson,
      personStatus: savePersonStatus,
      personMeta: savePersonMeta,
      itemAdd: addItem,
      itemContinue: continueItem,
      itemMeta: saveItemMeta,
      shareSet: saveShareSet,
      itemEnd: endItem
    }[dialog?.type];
    if (!action) return;
    event.preventDefault();
    if (['personAdd', 'personMeta'].includes(dialog.type) && !canSavePersonName) return;
    if (hasEventDate && !canSubmitDated) return;
    action();
  }

  function close() { appState.closeDialog(); name = ''; itemName = ''; tags = ''; note = ''; shares = {}; shareFinancialMode = 'derived'; purchaseContributionsCents = null; financingValid = false; alreadySettled = false; paymentDate = ''; reason = ''; initialValue = 0; valuationType = 'linear'; durationYears = 6; annualRate = 0.2; minimumValue = 0; }
  function addPerson() {
    if (!canSavePersonName) return;
    if (!dateValid) return;
    const saved = appState.mutateProject(p => { applyPersonAdd(p, { name, date: effectiveDate }); });
    finishDatedChange(saved);
  }
  function savePersonMeta() {
    if (!canSavePersonName) return;
    const saved = appState.mutateProject(p => { renamePerson(p, { personId: person.id, name }); });
    if (saved) close();
  }

  function pullMoveInForward(existingPerson) {
    if (!existingPerson) return;
    if (!dateValid) return;
    const saved = appState.mutateProject(p => {
      const event = p.events.find(e => e.type === 'person-added' && String(e.personId) === String(existingPerson.id));
      if (event) {
        if (event.date !== effectiveDate) event.order = nextEventOrder(p, effectiveDate);
        event.date = effectiveDate;
      }
    });
    finishDatedChange(saved);
  }

  function deleteMoveOut(existingPerson) {
    if (!existingPerson) return;
    const saved = appState.mutateProject(p => {
      const index = [...p.events].map((e, i) => ({ e, i }))
        .reverse()
        .find(x => x.e.type === 'person-deactivated' && String(x.e.personId) === String(existingPerson.id))?.i;
      if (index === undefined) return;
      p.events.splice(index, 1);
    });
    if (saved) close();
  }

  function deletePersonCompletely() {
    if (!person) return;
    if ($appState.readOnly) {
      alert($translate("ui.online-file-is-read-only-check-out--1kdczcr"));
      return;
    }
    const eligibility = personDeletionEligibility(project, person.id);
    if (!eligibility.allowed) {
      alert($translate('dialog.deleteFailure', { reason: localizeDiagnostic(eligibility.reason) }));
      return;
    }
    if (!confirm($translate("dialog.confirmRemovePerson", {name:person.name}))) return;

    let deleted = false;
    appState.mutateProject(p => {
      deleted = deleteUnusedPerson(p, person.id).allowed;
    });
    if (!deleted) {
      alert($translate('dialog.deleteLinked'));
      return;
    }
    close();
    appState.setRoute({ page: 'dashboard' });
  }

  function savePersonStatus() {
    if (!canSubmitDated || !person) return;
    const reasonText = reason.trim() || $translate(dialog.kind === 'deactivate' ? 'timeTravel.moveOut' : 'timeTravel.rejoin');
    const saved = appState.mutateProject(p => {
      changePersonStatus(p, { personId: person.id, date: effectiveDate, kind: dialog.kind, reason: reasonText });
    });
    finishDatedChange(saved);
  }

  function saveItemDraft() {
    if (!dateValid || !minimumValueValid) return;
    const draftId = dialog.id;
    const activePeople = entryProjection.people.filter(p => p.active);
    const initialShares = Object.keys(shares).length ? normShares(shares) : Object.fromEntries(activePeople.map(p => [p.id, 1]));
    try {
      const draft = createItemDraft({
      id: draftId,
      title: itemName || 'Neuer Gegenstand (Entwurf)',
      data: {
        effectiveDate,
        name: itemName || 'Neuer Gegenstand',
        tags: parseTags(tags),
        note,
        initialValue: Number(initialValue) || 0,
        valuation: {
          type: valuationType,
          durationYears: valuationType === 'linear' ? Number(durationYears) : undefined,
          annualRate: valuationType === 'degressive' ? Number(annualRate) : undefined,
          minimumValue: minimumValueAmount
        },
        shares: initialShares,
        purchaseContributionsCents: purchaseContributionsCents && Object.values(purchaseContributionsCents).every(Number.isSafeInteger) ? purchaseContributionsCents : undefined
      }
      });
      if (appState.upsertDraft(draft)) close();
    } catch {
      alert($translate('errors.changeFailed'));
    }
  }

  function itemPayload() {
    return { date: effectiveDate, name: itemName, tags: parseTags(tags), note,
      initialValue: Number(initialValue), valuation: { type: valuationType,
        durationYears: Number(durationYears), annualRate: Number(annualRate), minimumValue: minimumValueAmount },
      shares: normShares(shares) };
  }
  function addItem() {
    if (!canSubmitDated) return;
    const saved = appState.mutateProject(p => applyItemAdd(p, { ...itemPayload(),
      purchaseContributionsCents, ...(alreadySettled && purchaseClaims.length ? {settledPaymentDate:paymentDate}:{}), draftId: dialog.id }));
    finishDatedChange(saved);
  }
  function continueItem() {
    if (!canSubmitDated) return;
    let newItemId;
    const saved = appState.mutateProject(p => {
      newItemId = applyItemContinue(p, { ...itemPayload(), itemId: dialog.itemId,
        reason: 'Als neue Version fortgeführt' }).item.id;
    });
    if (!saved) return;
    finishDatedChange(saved);
    appState.setRoute({ page: 'item', id: newItemId });
  }
  function saveItemMeta() {
    const saved = appState.mutateProject(p => updateItemMetadata(p, {
      itemId: item.id, name: itemName || item.name, tags: parseTags(tags), note }));
    if (saved) close();
  }
  function saveShareSet() {
    if (!canSubmitDated) return;
    const saved = appState.mutateProject(p => setItemShares(p, { itemId: dialog.itemId, date: effectiveDate,
      shares: normShares(shares), financialMode: shareFinancialMode, note: 'Anteile geändert' }));
    finishDatedChange(saved);
  }
  function endItem() {
    if (!canSubmitDated) return;
    const saved = appState.mutateProject(p => applyItemEnd(p, { itemId: dialog.itemId, date: effectiveDate, reason: reason || 'beendet' }));
    finishDatedChange(saved);
  }

</script>

{#if dialog?.type === 'settlementAdd' || dialog?.type === 'settlementEdit'}
  <SettlementDialog {dialog} {project} {asOfDate} />
{:else if dialog?.type === 'redistributionEdit'}
  <RedistributionDialog {dialog} {project} {projection} />
{:else if dialog?.type === 'eventEdit'}
  <EventEditDialog {dialog} {project} {projection} />
{:else if dialog?.type === 'executedRedistributionEdit'}
  <ExecutedRedistributionEditDialog {dialog} {project} {projection} />
{:else if dialog}
  <div class="modal-backdrop">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="active-dialog-title" style="max-width:720px" on:keydown={confirmFromInput}>
      <div class="modal-header">
        <h3 id="active-dialog-title">{
          dialog.type === 'personAdd' ? $translate("app.personAdd") : 
          dialog.type === 'personMeta' ? $translate("ui.edit-person-jstaod") :
          dialog.type === 'personStatus' ? $translate(dialog.kind === 'deactivate' ? 'ui.mark-as-moved-out-11arjl' : 'ui.reactivate-iggdm2') : 
          dialog.type === 'itemAdd' ? $translate("app.recordItem") : 
          dialog.type === 'itemContinue' ? $translate("ui.replace-item-1p7orxr") :
          dialog.type === 'itemMeta' ? $translate("ui.edit-item-birsg") : 
          dialog.type === 'shareSet' ? $translate("ui.change-ownership-shares-1x7cqup") : 
          dialog.type === 'itemEnd' ? $translate("ui.archive-item-1j10bca") : 
          dialog.type === 'options' ? '⚙️ Optionen' : 'Dialog'
        }</h3>
        <button type="button" class="ghost" on:click={close} aria-label={$translate("ui.close-1qnddid")}>✕</button>
      </div>
      <div class="modal-body stack">
        {#if hasEventDate}
          <label class="event-effective-date">{$translate('timeTravel.effectiveDate')}
            <input id="event-effective-date" type="date" bind:value={effectiveDate} on:change={changeEffectiveDate} />
          </label>
          {#if !dateValid}<p role="alert" class="notice warn">{$translate('timeTravel.invalidDate')}</p>{/if}
          {#if dateValid && !itemAvailable}<p role="alert" class="notice warn">{$translate('timeTravel.itemUnavailable')}</p>{/if}
          {#if dateValid && !peopleAvailable}<p role="alert" class="notice warn">{$translate('timeTravel.peopleUnavailable')}</p>{/if}
          {#if dateValid && !statusTargetValid}<p role="alert" class="notice warn">{$translate('timeTravel.statusUnavailable')}</p>{/if}
          {#if dateSharesRebased}<p role="status" class="muted">{$translate('timeTravel.sharesRebased')}</p>{/if}
        {/if}
        {#if dialog.type === 'personAdd' || dialog.type === 'personMeta'}
          <label class="person-name-field">{$translate("ui.name-4el6o6")} <input bind:value={name} placeholder="Vor- und Nachname" autocomplete="name" enterkeyhint="done"></label>
          {#if duplicatePerson}
            <div class="notice warn">
              {$translate("ui.a-person-with-this-name-already-exi-15fux56")} <strong>{duplicatePerson.name}</strong>
              ({duplicateIsActive ? 'aktiv' : 'inaktiv'}).
            </div>
            {#if !duplicateIsActive}
              <div class="row">
                {#if duplicateIsFutureMoveIn}
                  <button class="small" on:click={() => pullMoveInForward(duplicatePerson)}>{$translate("ui.move-start-date-to-selected-date-1ukvpci")}</button>
                {/if}
                {#if duplicateLatestDeactivation}
                  <button class="small danger" on:click={() => deleteMoveOut(duplicatePerson)}>{$translate("ui.remove-last-departure-gtnl55")}</button>
                {/if}
              </div>
            {/if}
          {/if}
          {#if dialog.type === 'personMeta'}
            {#if deleteEligibility.allowed}
              <div class="notice">{$translate("ui.permanent-deletion-is-only-possible-1k5oppq")}</div>
            {:else}
              <div class="notice warn">{$translate('dialog.deleteBlocked')} {localizeDiagnostic(deleteEligibility.reason)} {$translate('dialog.moveOut')}</div>
            {/if}
          {/if}
        {:else if dialog.type === 'personStatus'}
          <label>{$translate("ui.reason-1rj1mxt")} <input bind:value={reason} placeholder={dialog.kind === 'deactivate' ? $translate('timeTravel.moveOut') : $translate('timeTravel.rejoin')} /></label>
        {:else if dialog.type === 'itemAdd' || dialog.type === 'itemContinue'}
          <div class="item-entry-flow">
            <div class="form-grid item-primary-fields">
              <label>{$translate("ui.name-4el6o6")}
                <input bind:value={itemName} enterkeyhint="done" autocomplete="off">
              </label>
              <label>{$translate("ui.purchase-price-in-euros-1858jaw")}
                <input type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00" bind:value={initialValue}>
              </label>
            </div>
            <div class="form-grid item-valuation-fields">
              <label>{$translate("ui.how-does-the-value-change-16f9eit")}
                <select bind:value={valuationType}>
                  <option value="linear">{$translate("ui.value-decreases-linearly-1u8yk0y")}</option>
                  <option value="degressive">{$translate("ui.value-decreases-by-a-percentage-eac-1g9op4c")}</option>
                  <option value="fixed">{$translate("ui.value-remains-constant-1tdyxfv")}</option>
                </select>
              </label>
              {#if valuationType === 'linear'}
                <label>{$translate("ui.useful-life-years-jdfjkh")}
                  <input type="number" min="1" step="1" inputmode="numeric" bind:value={durationYears}>
                </label>
              {:else if valuationType === 'degressive'}
                <label>{$translate("ui.annual-loss-in-value-0-2-20-1h9ss42")}
                  <input type="number" min="0" max="1" step="0.01" inputmode="decimal" bind:value={annualRate}>
                </label>
              {/if}
            </div>
            {#if !itemNameValid}<p class="notice warn" role="alert">{$translate('items.enterName')}</p>{/if}
            {#if !itemCostValid}<p class="notice warn" role="alert">{$translate('errors.invalidItemValue')}</p>{/if}
            <section class="item-ownership-fields">
              <div class="item-flow-heading">
                <strong>{$translate("ui.who-owns-this-item-nnrc3g")}</strong>
              </div>
              <ShareEditor people={entryProjection.people} bind:shares allowEqualize={true} />
              {#if !ownersValid}<p role="alert" class="notice warn">{$translate('items.selectOwner')}</p>{/if}
            </section>
            {#if dialog.type === 'itemAdd'}
              <PurchaseFinancing people={entryProjection.people.filter(p=>p.active)} shares={purchaseShares}
                amountCents={itemCostCents} bind:contributions={purchaseContributionsCents} bind:valid={financingValid} />
              {#if itemCostValid && ownersValid && financingValid}
                <section class="item-purchase-preview" aria-live="polite">
                  <strong>{$translate('items.purchasePreview')}</strong>
                  <p>{$translate('items.purchaseSummary', {owners:purchaseOwnerCount, amount:money(itemCost)})}</p>
                  {#if purchaseClaims.length}
                    <ul>
                      {#each purchaseBalances as [id,cents]}
                        <li>{entryProjection.peopleById.get(id)?.name || id}: {cents>0?'+':''}{money(cents/100)}</li>
                      {/each}
                    </ul>
                    <label><input type="checkbox" bind:checked={alreadySettled}> {$translate('purchase.alreadySettled')}</label>
                    {#if alreadySettled}
                      <label>{$translate('purchase.paymentDate')} <input type="date" bind:value={paymentDate}></label>
                      <ul>
                        {#each purchaseClaims as claim}
                          <li>{$translate('items.purchaseClaimRow',{debtor:entryProjection.peopleById.get(claim.debtorPersonId)?.name || claim.debtorPersonId,
                            creditor:entryProjection.peopleById.get(claim.creditorPersonId)?.name || claim.creditorPersonId,amount:money(claim.amountCents/100)})}</li>
                        {/each}
                      </ul>
                      <small>{$translate('purchase.confirmActual')}</small>
                    {/if}
                  {:else}
                    <p>{$translate('items.noPurchaseClaims')}</p>
                  {/if}
                </section>
              {/if}
            {/if}
            <details class="item-extra-fields" bind:open={itemExtrasOpen}>
              <summary>{$translate('items.moreDetails')}</summary>
              <div class="form-grid">
                <label>{$translate("ui.minimum-value-hzgo71")}
                  <input type="text" inputmode="decimal" autocomplete="off" bind:value={minimumValue} aria-invalid={!minimumValueValid}>
                </label>
                <label>{$translate("ui.categories-2lwhku")}
                  <input bind:value={tags} placeholder={$translate("ui.kitchen-electronics-yb541o")}>
                </label>
                <label class="wide">{$translate("ui.note-86vuh")}
                  <textarea bind:value={note}></textarea>
                </label>
              </div>
              {#if !minimumValueValid}<p class="notice warn" role="alert">{$translate('errors.invalidItemValue')}</p>{/if}
            </details>
          </div>
        {:else if dialog.type === 'itemMeta'}
          <div class="form-grid"><label>{$translate("ui.name-4el6o6")} <input bind:value={itemName} enterkeyhint="done"></label><label>{$translate("ui.categories-2lwhku")} <input bind:value={tags}></label><label class="wide">{$translate("ui.note-86vuh")} <textarea bind:value={note}></textarea></label></div>
        {:else if dialog.type === 'shareSet'}
          <ShareEditor people={entryProjection.people} bind:shares />
          <label>{$translate("ui.should-financial-claims-arise-qd7qky")}
            <select bind:value={shareFinancialMode}>
              <option value="derived">{$translate("ui.yes-calculate-automatically-1jfscg7")}</option>
              <option value="none">{$translate("ui.no-gift-or-correction-dim67p")}</option>
            </select>
          </label>
          <div class="financial-mode-help">
            <HelpTip label={$translate("ui.what-does-paid-ownership-mean")}>{$translate("ui.paid-ownership-explained")}</HelpTip>
          </div>
        {:else if dialog.type === 'itemEnd'}
          <label>{$translate("ui.reason-1rj1mxt")} <input bind:value={reason} placeholder={$translate("ui.broken-sold-taken-over-privately-29sy7l")}></label>
        {:else if dialog.type === 'options'}
          <p class="muted">{$translate("ui.the-project-file-and-its-backup-are-1al4mbb")}</p>
        {:else}
          <div class="notice warn">{$translate('dialog.missing')} {dialog.type}</div>
        {/if}
      </div>
      <div class="modal-footer"><button on:click={close}>{$translate("ui.cancel-cl4zc9")}</button>
        <div style="flex:1"></div>
        {#if dialog.type === 'personAdd'}<button class="primary" on:click={addPerson} disabled={!canSavePersonName || !canSubmitDated}>{$translate("ui.create-zqi05d")}</button>{/if}
        {#if dialog.type === 'personStatus'}<button class="primary" on:click={savePersonStatus} disabled={!canSubmitDated || $appState.readOnly}>{$translate(dialog.kind === 'deactivate' ? 'ui.mark-as-moved-out-11arjl' : 'ui.reactivate-iggdm2')}</button>{/if}
        {#if dialog.type === 'personMeta'}<button class="primary" on:click={savePersonMeta} disabled={!canSavePersonName}>{$translate("ui.save-sq2189")}</button>{/if}
        {#if dialog.type === 'personMeta'}<button class="danger" on:click={deletePersonCompletely} disabled={!deleteEligibility.allowed || $appState.readOnly}>{$translate("ui.delete-person-permanently-e06bgl")}</button>{/if}
        {#if dialog.type === 'itemAdd'}
          <button on:click={saveItemDraft} disabled={!dateValid || !minimumValueValid || $appState.readOnly}>{$translate("ui.save-as-draft-sz9zgy")}</button>
          <button class="primary" on:click={addItem} disabled={!canSubmitDated || $appState.readOnly}>{$translate("ui.create-zqi05d")}</button>
        {/if}
        {#if dialog.type === 'itemContinue'}<button class="primary" on:click={continueItem} disabled={!canSubmitDated || $appState.readOnly}>{$translate("ui.replace-and-archive-old-item-y6ooa2")}</button>{/if}
        {#if dialog.type === 'itemMeta'}<button class="primary" on:click={saveItemMeta}>{$translate("ui.save-sq2189")}</button>{/if}
        {#if dialog.type === 'shareSet'}<button class="primary" on:click={saveShareSet} disabled={!canSubmitDated || $appState.readOnly}>{$translate("ui.apply-changes-7tqg8a")}</button>{/if}
        {#if dialog.type === 'itemEnd'}<button class="danger" on:click={endItem} disabled={!canSubmitDated || $appState.readOnly}>{$translate("ui.archive-qlwwpx")}</button>{/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .item-entry-flow{display:grid;gap:16px;min-width:0}
  .item-primary-fields,.item-valuation-fields{align-items:end}
  .item-valuation-fields{padding:2px 0 6px}
  .item-ownership-fields{display:grid;gap:10px;padding-top:4px}
  .item-flow-heading{display:flex;align-items:center;gap:8px;font-size:14px}
  .item-purchase-preview{display:grid;gap:6px;background:var(--soft);border-radius:10px;padding:12px;font-size:12px}
  .item-purchase-preview p,.item-purchase-preview ul{margin:0}
  .item-purchase-preview ul{padding-left:18px}
  .item-purchase-preview small{color:var(--muted);line-height:1.5}
  .item-extra-fields{border-top:1px solid var(--border);padding-top:6px;min-width:0}
  .item-extra-fields>summary{cursor:pointer;min-height:44px;display:flex;align-items:center;flex-wrap:wrap;gap:6px;color:#246f85;font-size:13px;font-weight:650}
  .item-extra-fields[open]>summary{margin-bottom:12px}
  .item-extra-fields>.form-grid{min-width:0}
  @media(max-width:540px){.item-primary-fields{grid-template-columns:minmax(0,1fr)}}
</style>
