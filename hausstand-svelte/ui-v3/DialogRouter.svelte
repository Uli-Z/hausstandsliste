<script>
  import { translate, parseDecimal, localizeDiagnostic } from '../src/lib/i18n.js';
  import { appState, createEvent, createRedistribution } from '../src/stores/projectStore.js';
  import { uid, parseTags } from '../src/lib/util.js';
  import { projectAt } from '../src/lib/projector.js';
  import { buildTransferChanges, buildRemovePersonChanges, soleOwnedItems } from '../src/lib/redistribution.js';
  import { validCalendarDate } from '../src/lib/timeTravel.js';
  import { validShareMap } from '../src/lib/shareUnits.js';
  import { normShares, money } from '../src/lib/domain.js';
  import { purchaseClaims as derivePurchaseClaims, personBalances } from '../src/lib/ledger.js';
  import PurchaseFinancing from './PurchaseFinancing.svelte';
  import { normalizePersonName, duplicatePersonName, addPerson as applyPersonAdd, renamePerson, personStatusProblem, changePersonStatus, previewPersonStatus } from '../src/lib/personMutations.js';
  import { addItem as applyItemAdd, continueItem as applyItemContinue, updateItemMetadata, setItemShares, endItem as applyItemEnd, validMoney } from '../src/lib/itemMutations.js';
  import { createItemDraft } from '../src/lib/draftMutations.js';
  import { personDeletionEligibility, deleteUnusedPerson } from '../src/lib/personDeletion.js';
  import RedistributionDialog from './RedistributionDialog.svelte';
  import EventEditDialog from './EventEditDialog.svelte';
  import ExecutedRedistributionEditDialog from './ExecutedRedistributionEditDialog.svelte';
  import ShareEditor from './ShareEditor.svelte';
  import SettlementDialog from '../src/components/SettlementDialog.svelte';
  import HelpTip from '../src/components/HelpTip.svelte';
  import { isEnterForSubmit, rebaseUneditedMap } from './form-behavior.js';
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
  let archiveTarget = '';
  // App keys this component by a primitive dialog session revision. Initialize
  // once for that session, not whenever a field is cleared or a store emits.
  if (dialog) {
    const draft = dialog.id ? (project.drafts || []).find(d => d.id === dialog.id) : null;
    effectiveDate = draft?.data?.effectiveDate || asOfDate;
    if (dialog.effectiveDate) effectiveDate = dialog.effectiveDate;
    reason = dialog.reason || '';
    archiveTarget = dialog.archiveTarget || '';
    paymentDate = effectiveDate;
    itemExtrasOpen = dialog.type === 'itemContinue' || !!dialog.id;
    const current = projectAt(project, effectiveDate).activeItems.find(i => i.id === dialog.itemId);
    if (dialog.type === 'personMeta') name = project.people.find(p => p.id === dialog.personId)?.name || '';
    if (dialog.type === 'itemMeta') {
      const metadata = project.items.find(i => i.id === dialog.itemId);
      itemName = metadata?.name || '';
      tags = (metadata?.tags || []).join(', ');
      note = metadata?.note || '';
    }
    if (dialog.type === 'itemAdd' && !dialog.id) {
      shares = Object.fromEntries(projectAt(project, effectiveDate).people
        .filter(p => p.active).map(p => [p.id, 1]));
    }
    if (dialog.type === 'itemAdd' && draft?.type === 'item') {
      itemName = draft.data.name ?? '';
      tags = (draft.data.tags || []).join(', ');
      note = draft.data.note || '';
      initialValue = draft.data.initialValue;
      valuationType = draft.data.valuation?.type ?? 'linear';
      durationYears = draft.data.valuation?.durationYears ?? 6;
      annualRate = draft.data.valuation?.annualRate ?? 0.2;
      minimumValue = draft.data.valuation?.minimumValue ?? 0;
      shares = { ...(draft.data.shares || {}) };
      purchaseContributionsCents = draft.data.purchaseContributionsCents ?? null;
      alreadySettled = !!draft.data.settledPaymentDate;
      paymentDate = draft.data.settledPaymentDate || effectiveDate;
    }
    if (dialog.type === 'shareSet' && current) shares = { ...current.shares };
    if (dialog.type === 'itemContinue' && current) {
      shares = { ...current.shares };
      itemName = current.name + ' (neu)';
      tags = (current.tags || []).join(', ');
      note = current.note || '';
      initialValue = Math.round(current.value * 100) / 100;
      valuationType = current.runtime.valuation.type;
      durationYears = current.runtime.valuation.durationYears ?? 6;
      annualRate = current.runtime.valuation.annualRate ?? 0.2;
      minimumValue = current.runtime.valuation.minimumValue ?? 0;
    }
  }
  let shareDefaults = {...shares};
  let manualShareIds = new Set();
  let replacementDefault = initialValue;
  let replacementEdited = false;
  $: dateValid = validCalendarDate(effectiveDate);
  $: entryProjection = dateValid ? projectAt(project, effectiveDate) : projection;
  $: hasEventDate = ['personStatus', 'itemAdd', 'itemContinue', 'shareSet', 'itemEnd'].includes(dialog?.type);
  $: needsActiveItem = ['itemContinue', 'shareSet', 'itemEnd'].includes(dialog?.type);
  $: itemAvailable = !needsActiveItem || !!entryProjection.activeItems.find(item => item.id === dialog.itemId);
  $: itemNeedsOwners = ['itemAdd', 'itemContinue'].includes(dialog?.type);
  $: peopleAvailable = !itemNeedsOwners || entryProjection.people.some(person => person.active);
  $: statusTargetValid = dialog?.type !== 'personStatus' ||
    !personStatusProblem(project, { personId: dialog.personId, date: effectiveDate, kind: dialog.kind });
  $: statusPreview = dialog?.type === 'personStatus' && dateValid && statusTargetValid
    ? previewPersonStatus(project, {personId:dialog.personId,date:effectiveDate,kind:dialog.kind}) : null;
  $: archiveTargets = entryProjection.people.filter(p=>p.active && p.id!==dialog?.personId);
  $: archiveSoleItems = dialog?.type === 'personStatus' && dialog.kind === 'deactivate'
    ? soleOwnedItems(entryProjection,dialog.personId) : [];
  $: archiveGiftChanges = dialog?.type === 'personStatus' && dialog.kind === 'deactivate'
    ? buildRemovePersonChanges(entryProjection,dialog.personId) : [];
  $: itemCost = Number(initialValue);
  $: itemCostCents = Math.round(itemCost * 100);
  $: itemCostValid = !itemNeedsOwners || validMoney(itemCost);
  $: ownersValid = (!itemNeedsOwners && dialog?.type !== 'shareSet') || (validShareMap(shares) && Object.keys(normShares(shares)).length > 0 &&
    (dialog?.type !== 'itemAdd' || Object.keys(normShares(shares)).every(id=>entryProjection.peopleById.get(id)?.active)));
  $: itemNameValid = !itemNeedsOwners || !!String(itemName || '').trim();
  // Keep the raw minimum-value text while typing: a German decimal comma must
  // neither collapse the details panel nor silently be stored as zero.
  $: minimumValueAmount = String(minimumValue ?? '').trim() === '' ? 0 : parseDecimal(minimumValue);
  $: minimumValueValid = !itemNeedsOwners || valuationType === 'fixed' || validMoney(minimumValueAmount);
  $: valuationValid = !itemNeedsOwners || (valuationType === 'linear' ? Number.isFinite(durationYears) && durationYears > 0 : valuationType === 'degressive' ? Number.isFinite(annualRate) && annualRate >= 0 && annualRate <= 1 : valuationType === 'fixed');
  $: canSubmitDated = dateValid && itemAvailable && peopleAvailable && statusTargetValid && !statusPreview?.problem &&
    itemCostValid && ownersValid && itemNameValid && minimumValueValid && valuationValid &&
    (dialog?.type !== 'itemAdd' || (financingValid && (!alreadySettled || validCalendarDate(paymentDate))));
  $: purchaseShares = normShares(shares);
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
          // Rebase only untouched defaults. Explicitly edited rows survive
          // repeated date changes, even if their value matches a later default.
          const rebased = rebaseUneditedMap(shares, shareDefaults, item.shares, manualShareIds);
          shares = rebased.values;
          manualShareIds = rebased.editedKeys;
          shareDefaults = {...item.shares};
          if (dialog.type === 'itemContinue') {
            replacementEdited ||= !Object.is(initialValue,replacementDefault);
            replacementDefault = Math.round(item.value * 100) / 100;
            if (!replacementEdited) initialValue = replacementDefault;
          }
          dateSharesRebased = true;
        }
      }
      // A different purchase date must not erase entered owners. The matrix
      // keeps referenced participants visible; eligibility blocks invalid save.
    }
    if (paymentDate === effectiveDate) paymentDate = nextDate;
    effectiveDate = nextDate;
  }

  function finishDatedChange(saved) {
    if (!saved) return;
    const confirmedDate = effectiveDate;
    const returning = !!dialog.returnTo;
    close();
    if (!returning && confirmedDate > asOfDate) appState.setAsOfDate(confirmedDate);
  }
  $: normalizedName = normalizePersonName(name);
  $: duplicatePerson = dialog?.type === 'personAdd'
    ? duplicatePersonName(project, name)
    : (dialog?.type === 'personMeta'
      ? duplicatePersonName(project, name, person?.id)
      : null);
  $: duplicateProjection = duplicatePerson ? entryProjection.peopleById.get(duplicatePerson.id) : null;
  $: duplicateIsActive = !!duplicateProjection?.active;
  $: canSavePersonName = !!normalizedName && !duplicatePerson;

  $: person = dialog?.personId ? project.people.find(p => p.id === dialog.personId) : null;
  $: deleteEligibility = person ? personDeletionEligibility(project, person.id) : { allowed: false, reason: 'Keine Person ausgewählt.' };
  $: item = dialog?.itemId ? project.items.find(i => i.id === dialog.itemId) : null;
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

  function close() { appState.closeDialog(); }
  function addPerson() {
    if (!canSavePersonName) return;
    const saved = appState.mutateProject(p => { applyPersonAdd(p, { name }); });
    if (saved) close();
  }
  function savePersonMeta() {
    if (!canSavePersonName) return;
    const saved = appState.mutateProject(p => { renamePerson(p, { personId: person.id, name }); });
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

  // Preserve the selected date and reason while using existing preparation dialogs.
  function archiveReturn() {
    return {type:'personStatus',personId:dialog.personId,kind:'deactivate',effectiveDate,reason,archiveTarget};
  }
  function archiveItemStep(type, itemId) {
    appState.setDialog({type,itemId,effectiveDate,returnTo:archiveReturn()});
  }
  function archiveBulkStep(gift) {
    const target = archiveTargets.find(p=>p.id===archiveTarget);
    if (!gift && !target) return;
    const changes = gift ? archiveGiftChanges : buildTransferChanges(entryProjection,dialog.personId,target.id);
    if (!changes.length) return;
    const title = $translate(gift ? 'dialog.dissolveTitle' : 'dialog.transferTitle',
      gift ? {name:person.name} : {from:person.name,to:target.name});
    appState.startRedistribution(title,effectiveDate,changes,{
      sourcePersonId:person.id,initialFinancialMode:gift?'none':'derived',returnTo:archiveReturn()
    });
  }
  function archiveSettlementStep(transfer) {
    appState.setDialog({type:'settlementAdd',effectiveDate,payerPersonId:transfer.fromPersonId,
      recipientPersonId:transfer.toPersonId,amountCents:transfer.amountCents,returnTo:archiveReturn()});
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
    // Incomplete but valid drafts are allowed. Never silently replace a
    // malformed value with zero or discard the entire contribution map.
    if (!validShareMap(shares) || !valuationValid ||
        (initialValue != null && !validMoney(Number(initialValue))) ||
        (purchaseContributionsCents && !Object.values(purchaseContributionsCents).every(c=>Number.isSafeInteger(c)&&c>=0)) ||
        (alreadySettled && !validCalendarDate(paymentDate))) {
      alert($translate('forms.invalidDraft'));
      return;
    }
    const draftId = dialog.id;
    const initialShares = {...shares};
    try {
      const draft = createItemDraft({
      id: draftId,
      title: itemName || 'Neuer Gegenstand (Entwurf)',
      data: {
        effectiveDate,
        name: itemName,
        tags: parseTags(tags),
        note,
        ...(initialValue != null ? {initialValue:Number(initialValue)} : {}),
        valuation: {
          type: valuationType,
          durationYears: valuationType === 'linear' ? Number(durationYears) : undefined,
          annualRate: valuationType === 'degressive' ? Number(annualRate) : undefined,
          minimumValue: valuationType === 'fixed' && !validMoney(minimumValueAmount) ? 0 : minimumValueAmount
        },
        shares: initialShares,
        ...(purchaseContributionsCents ? {purchaseContributionsCents} : {}),
        ...(alreadySettled ? {settledPaymentDate:paymentDate} : {})
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
        durationYears: Number(durationYears), annualRate: Number(annualRate), minimumValue: valuationType === 'fixed' && !validMoney(minimumValueAmount) ? 0 : minimumValueAmount },
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
    <div class="modal" class:item-entry-modal={itemNeedsOwners} role="dialog" aria-modal="true" aria-labelledby="active-dialog-title" style="max-width:720px" on:keydown={confirmFromInput}>
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
          {#if !itemNeedsOwners}<label class="event-effective-date">{$translate('timeTravel.effectiveDate')}
            <input id="event-effective-date" type="date" value={effectiveDate} on:change={changeEffectiveDate} />
          </label>{/if}
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
              ({$translate(duplicateIsActive ? 'people.active' : 'people.moved')}).
            </div>
          {/if}
          {#if dialog.type === 'personMeta'}
            {#if deleteEligibility.allowed}
              <div class="notice">{$translate("ui.permanent-deletion-is-only-possible-1k5oppq")}</div>
            {:else}
              <div class="notice warn">{$translate('dialog.deleteBlocked')} {localizeDiagnostic(deleteEligibility.reason)} {$translate('dialog.moveOut')}</div>
            {/if}
          {/if}
        {:else if dialog.type === 'personStatus'}
          {#if dialog.kind === 'deactivate' && statusPreview}
            <section class="stack archive-preparation">
              <strong>{$translate('archive.requirements')}</strong>
              <div class="split"><span>{$translate('archive.holdings')}</span><strong>{statusPreview.holdings.length}</strong></div>
              {#if statusPreview.holdings.length}
                <div class="archive-item-steps">
                  {#each statusPreview.holdings as h (h.item.id)}
                    <div class="archive-step">
                      <strong>{h.item.name}</strong>
                      <div class="archive-step-actions">
                        <button type="button" disabled={$appState.readOnly} on:click={() => archiveItemStep('shareSet',h.item.id)}>{$translate('ui.change-ownership-shares-1x7cqup')}</button>
                        {#if archiveSoleItems.some(i=>i.id===h.item.id)}
                          <button type="button" disabled={$appState.readOnly} on:click={() => archiveItemStep('itemEnd',h.item.id)}>{$translate('ui.archive-item-1j10bca')}</button>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
                {#if archiveTargets.length}
                  <label>{$translate('archive.transferTarget')}
                    <select bind:value={archiveTarget}>
                      <option value="">{$translate('ui.choose-1h2n4nz')}</option>
                      {#each archiveTargets as target}<option value={target.id}>{target.name}</option>{/each}
                    </select>
                  </label>
                  <button type="button" disabled={!archiveTargets.some(p=>p.id===archiveTarget) || $appState.readOnly} on:click={() => archiveBulkStep(false)}>{$translate('archive.transferAll')}</button>
                {/if}
                {#if archiveGiftChanges.length}
                  <button type="button" disabled={$appState.readOnly} on:click={() => archiveBulkStep(true)}>{$translate('archive.giftRemaining')}</button>
                {/if}
                {#if archiveSoleItems.length}
                  <p class="muted">{$translate('archive.soleItems',{items:archiveSoleItems.map(i=>i.name).join(', ')})}</p>
                {/if}
              {/if}
              <div class="split"><span>{$translate('archive.balance')}</span><strong>{money(statusPreview.balanceCents / 100)}</strong></div>
              {#if !statusPreview.holdings.length && statusPreview.balanceCents !== 0}
                {#each statusPreview.transfers || [] as transfer}
                  <div class="archive-step">
                    <span>{entryProjection.peopleById.get(transfer.fromPersonId)?.name || transfer.fromPersonId} → {entryProjection.peopleById.get(transfer.toPersonId)?.name || transfer.toPersonId} · {money(transfer.amountCents / 100)}</span>
                    <button type="button" disabled={$appState.readOnly} on:click={() => archiveSettlementStep(transfer)}>{$translate('archive.recordSettlement')}</button>
                  </div>
                {/each}
                <p class="muted">{$translate('archive.paymentHint')}</p>
              {/if}
              {#if statusPreview.holdings.length || statusPreview.balanceCents !== 0}
                <p class="muted">{$translate('archive.prepareHint')}</p>
              {/if}
            </section>
          {/if}
          {#if statusPreview?.problem}
            <p role="alert" class="notice warn">{$translate(statusPreview.problem.key,statusPreview.problem.params)}</p>
          {:else if statusPreview && dialog.kind === 'deactivate'}
            <p role="status" class="notice">{$translate('archive.ready')}</p>
          {/if}
          <label>{$translate("ui.reason-1rj1mxt")} <input bind:value={reason} placeholder={dialog.kind === 'deactivate' ? $translate('timeTravel.moveOut') : $translate('timeTravel.rejoin')} /></label>
        {:else if dialog.type === 'itemAdd' || dialog.type === 'itemContinue'}
          <div class="item-entry-flow">
            <div class="form-grid item-primary-fields">
              <label class="item-name-field">{$translate("ui.name-4el6o6")}
                <input bind:value={itemName} enterkeyhint="done" autocomplete="off">
              </label>
              <label>{$translate("ui.purchase-price-in-euros-1858jaw")}
                <input type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00" bind:value={initialValue}>
              </label>
              <label class="event-effective-date">{$translate('timeTravel.effectiveDate')}
                <input id="event-effective-date" type="date" value={effectiveDate} on:change={changeEffectiveDate} />
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
              {#if valuationType !== 'fixed'}
                <label>{$translate("ui.minimum-value-hzgo71")}
                  <input type="text" inputmode="decimal" autocomplete="off" bind:value={minimumValue} aria-invalid={!minimumValueValid}>
                </label>
              {/if}
            </div>
            {#if !minimumValueValid}<p class="notice warn" role="alert">{$translate('errors.invalidItemValue')}</p>{/if}
            {#if !valuationValid}<p class="notice warn" role="alert">{$translate('errors.invalidItemValue')}</p>{/if}
            {#if !itemNameValid}<p class="notice warn" role="alert">{$translate('items.enterName')}</p>{/if}
            {#if !itemCostValid}<p class="notice warn" role="alert">{$translate('errors.invalidItemValue')}</p>{/if}
            <section class="item-ownership-fields">
              {#if dialog.type === 'itemAdd'}
                <PurchaseFinancing people={project.people} ownerPeople={entryProjection.people} bind:shares
                  amountCents={itemCostCents} bind:contributions={purchaseContributionsCents} bind:valid={financingValid} />
              {:else}
                <div class="item-flow-heading"><strong>{$translate("ui.who-owns-this-item-nnrc3g")}</strong></div>
                <ShareEditor people={entryProjection.people.filter(p=>p.active || Object.hasOwn(shares,p.id))} bind:shares allowEqualize={true} allPeople={true} />
              {/if}
              {#if !ownersValid}<p role="alert" class="notice warn">{$translate('forms.invalidShares')}</p>{/if}
            </section>
            {#if dialog.type === 'itemAdd'}
              {#if itemCostValid && ownersValid && financingValid}
                <section class="item-purchase-preview" aria-live="polite">
                  <strong>{$translate('items.purchasePreview')}</strong>
                  {#if purchaseClaims.length}
                    <ul>
                      {#each purchaseBalances as [id,cents]}
                        <li>{entryProjection.peopleById.get(id)?.name || id}: {cents>0?'+':''}{money(cents/100)}</li>
                      {/each}
                    </ul>
                    <label class="purchase-settled"><input type="checkbox" bind:checked={alreadySettled}> {$translate('purchase.alreadySettled')}</label>
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
                
                <label>{$translate("ui.categories-2lwhku")}
                  <input bind:value={tags} placeholder={$translate("ui.kitchen-electronics-yb541o")}>
                </label>
                <label class="wide">{$translate("ui.note-86vuh")}
                  <textarea bind:value={note}></textarea>
                </label>
              </div>
            </details>
          </div>
        {:else if dialog.type === 'itemMeta'}
          <div class="form-grid"><label>{$translate("ui.name-4el6o6")} <input bind:value={itemName} enterkeyhint="done"></label><label>{$translate("ui.categories-2lwhku")} <input bind:value={tags}></label><label class="wide">{$translate("ui.note-86vuh")} <textarea bind:value={note}></textarea></label></div>
        {:else if dialog.type === 'shareSet'}
          <ShareEditor people={entryProjection.people} bind:shares />
          {#if !ownersValid}<p role="alert" class="notice warn">{$translate('forms.invalidShares')}</p>{/if}
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
        {#if dialog.type === 'personAdd'}<button class="primary" on:click={addPerson} disabled={!canSavePersonName || $appState.readOnly}>{$translate("ui.create-zqi05d")}</button>{/if}
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
  .archive-item-steps,.archive-step{display:grid;gap:8px;min-width:0}
  .archive-step{padding:10px 0;border-bottom:1px solid var(--border)}
  .archive-step-actions{display:flex;gap:8px;flex-wrap:wrap}
  .item-entry-flow{display:grid;gap:12px;min-width:0}
  .item-entry-modal .modal-body{gap:8px;align-content:start}
  .item-entry-modal .form-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
  .item-entry-modal .item-primary-fields{grid-template-columns:minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr)}
  .item-entry-modal .item-valuation-fields{grid-template-columns:minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr)}
  .item-entry-modal .event-effective-date input{min-width:0}
  @media(max-width:680px){
    .item-entry-modal .item-primary-fields{grid-template-columns:minmax(0,1.35fr) minmax(0,1fr)}
    .item-entry-modal .item-primary-fields .event-effective-date{grid-column:1/-1}
    .item-entry-modal .item-valuation-fields{grid-template-columns:repeat(2,minmax(0,1fr))}
    .item-valuation-fields>label:first-child{grid-column:1/-1}
  }
  .item-entry-flow label{min-width:0}
  .item-entry-flow input,.item-entry-flow select{min-width:0;max-width:100%}
  .item-entry-flow .notice{margin:0;padding:7px 9px}
  .purchase-settled{display:flex;align-items:center;gap:8px}
  .purchase-settled input{width:auto;flex:none}
  .item-entry-modal .modal-footer{gap:6px}
  .item-primary-fields,.item-valuation-fields{align-items:end}
  .item-valuation-fields{padding:2px 0 6px}
  .item-ownership-fields{display:grid;gap:6px;min-width:0}
  .item-flow-heading{display:flex;align-items:center;gap:8px;font-size:14px}
  .item-purchase-preview{display:grid;gap:6px;background:var(--soft);border-radius:10px;padding:12px;font-size:12px}
  .item-purchase-preview p,.item-purchase-preview ul{margin:0}
  .item-purchase-preview ul{padding-left:18px}
  .item-purchase-preview small{color:var(--muted);line-height:1.5}
  .item-extra-fields{border-top:1px solid var(--border);padding-top:6px;min-width:0}
  .item-extra-fields>summary{cursor:pointer;min-height:44px;display:flex;align-items:center;flex-wrap:wrap;gap:6px;color:#246f85;font-size:13px;font-weight:650}
  .item-extra-fields[open]>summary{margin-bottom:12px}
  .item-extra-fields>.form-grid{min-width:0}
  @media(max-width:540px){
    .item-entry-modal .modal-body{padding:12px}
    .item-entry-modal .modal-footer>button{flex:1 1 0;min-width:0;padding:7px 5px;overflow-wrap:anywhere}
    .item-entry-modal .modal-footer>div{display:none}
    .item-entry-modal .form-grid .wide{grid-column:1/-1}
  }
</style>
