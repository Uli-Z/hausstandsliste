<script>
  import { translate } from '../src/lib/i18n.js';
  import { appState, createEvent, createRedistribution } from '../src/stores/projectStore.js';
  import { uid, parseTags } from '../src/lib/util.js';
  import { normShares } from '../src/lib/domain.js';
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
  let financedByPersonId = '';
  const normalizePersonName = value => String(value || '').trim().toLocaleLowerCase('de');

  $: normalizedName = normalizePersonName(name);
  $: duplicatePerson = dialog?.type === 'personAdd'
    ? (project.people || []).find(p => normalizePersonName(p.name) === normalizedName)
    : (dialog?.type === 'personMeta'
      ? (project.people || []).find(p => String(p.id) !== String(person?.id) && normalizePersonName(p.name) === normalizedName)
      : null);
  $: duplicateProjection = duplicatePerson ? projection.peopleById.get(duplicatePerson.id) : null;
  $: duplicateIsActive = !!duplicateProjection?.active;
  $: duplicateAddedEvent = duplicatePerson
    ? (project.events || []).find(e => e.type === 'person-added' && String(e.personId) === String(duplicatePerson.id))
    : null;
  $: duplicateIsFutureMoveIn = !!(duplicateAddedEvent?.date && duplicateAddedEvent.date > asOfDate);
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
      financedByPersonId = draft.data.financedByPersonId || '';
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
    action();
  }

  function close() { appState.closeDialog(); name = ''; itemName = ''; tags = ''; note = ''; shares = {}; shareFinancialMode = 'derived'; financedByPersonId = ''; reason = ''; initialValue = 0; durationYears = 6; annualRate = 0.2; minimumValue = 0; }
  function addPerson() {
    if (!canSavePersonName) return;
    const personId = uid('person');
    appState.mutateProject(p => { 
      p.people.push({ id: personId, name: name || 'Neue Person' }); 
      p.events.push(createEvent('person-added', asOfDate, { personId, name: name || 'Neue Person' }, p)); 
    });
    close();
  }
  function savePersonMeta() {
    if (!canSavePersonName) return;
    appState.mutateProject(p => { const x = p.people.find(y => y.id === person.id); if (x) x.name = name || x.name; });
    close();
  }

  function pullMoveInForward(existingPerson) {
    if (!existingPerson) return;
    appState.mutateProject(p => {
      const event = p.events.find(e => e.type === 'person-added' && String(e.personId) === String(existingPerson.id));
      if (event) event.date = asOfDate;
    });
    close();
  }

  function deleteMoveOut(existingPerson) {
    if (!existingPerson) return;
    appState.mutateProject(p => {
      const index = [...p.events].map((e, i) => ({ e, i }))
        .reverse()
        .find(x => x.e.type === 'person-deactivated' && String(x.e.personId) === String(existingPerson.id))?.i;
      if (index === undefined) return;
      p.events.splice(index, 1);
    });
    close();
  }

  function deletePersonCompletely() {
    if (!person) return;
    if ($appState.readOnly) {
      alert($translate("ui.online-file-is-read-only-check-out--1kdczcr"));
      return;
    }
    const eligibility = personDeletionEligibility(project, person.id);
    if (!eligibility.allowed) {
      alert(`Löschen nicht möglich: ${eligibility.reason}`);
      return;
    }
    if (!confirm(`Die unbeteiligte Person "${person.name}" endgültig löschen? Ihr Eintragsereignis wird ebenfalls entfernt.`)) return;

    let deleted = false;
    appState.mutateProject(p => {
      deleted = deleteUnusedPerson(p, person.id).allowed;
    });
    if (!deleted) {
      alert('Löschen nicht möglich: Es bestehen inzwischen Verknüpfungen mit der Person.');
      return;
    }
    close();
    appState.setRoute({ page: 'dashboard' });
  }

  function saveItemDraft() {
    const draftId = dialog.id || uid('draft_item');
    const activePeople = projection.people.filter(p => p.active);
    const initialShares = Object.keys(shares).length ? normShares(shares) : Object.fromEntries(activePeople.map(p => [p.id, 1]));
    appState.upsertDraft({
      id: draftId,
      type: 'item',
      title: itemName || 'Neuer Gegenstand (Entwurf)',
      createdAt: new Date().toISOString(),
      data: {
        name: itemName || 'Neuer Gegenstand',
        tags: parseTags(tags),
        note,
        initialValue: Number(initialValue) || 0,
        valuation: {
          type: valuationType,
          durationYears: valuationType === 'linear' ? Number(durationYears) : undefined,
          annualRate: valuationType === 'degressive' ? Number(annualRate) : undefined,
          minimumValue: Number(minimumValue) || 0
        },
        shares: initialShares,
        financedByPersonId: financedByPersonId || undefined
      }
    });
    close();
  }

  function addItem() {
    const itemId = uid('item');
    const activePeople = projection.people.filter(p => p.active);
    const initialShares = Object.keys(shares).length ? normShares(shares) : Object.fromEntries(activePeople.map(p => [p.id, 1]));
    const saved = appState.mutateProject(p => {
      p.items.push({ id: itemId, name: itemName || 'Neuer Gegenstand', tags: parseTags(tags), note });
      p.events.push(createEvent('item-added', asOfDate, { 
        itemId, 
        name: itemName || 'Neuer Gegenstand', 
        initialValue: Number(initialValue) || 0, 
        valuation: { 
          type: valuationType, 
          durationYears: valuationType === 'linear' ? Number(durationYears) : undefined, 
          annualRate: valuationType === 'degressive' ? Number(annualRate) : undefined,
          minimumValue: Number(minimumValue) || 0 
        }, 
        shares: initialShares,
        financedByPersonId: financedByPersonId || undefined,
        financialMode: financedByPersonId ? 'derived' : 'none'
      }, p));
      if (dialog.id) {
        p.drafts = (p.drafts || []).filter(d => d.id !== dialog.id);
      }
    });
    if (saved) close();
  }

  function continueItem() {
    const newItemId = uid('item');
    const saved = appState.mutateProject(p => {
      // 1. Altes Item beenden
      p.events.push(createEvent('item-ended', asOfDate, { 
        itemId: projectedItem.id, 
        statusAfter: 'succeeded', 
        reason: 'Als neue Version fortgeführt' 
      }, p));
      // 2. Neues Item Stammdaten
      p.items.push({ 
        id: newItemId, 
        name: itemName || projectedItem.name, 
        tags: parseTags(tags), 
        note,
        predecessorItemId: projectedItem.id
      });
      // 3. Neues Item Event
      p.events.push(createEvent('item-added', asOfDate, { 
        itemId: newItemId, 
        name: itemName || projectedItem.name, 
        initialValue: Number(initialValue) || 0, 
        valuation: { 
          type: valuationType, 
          durationYears: valuationType === 'linear' ? Number(durationYears) : undefined, 
          annualRate: valuationType === 'degressive' ? Number(annualRate) : undefined,
          minimumValue: Number(minimumValue) || 0 
        }, 
        shares: normShares(shares) 
      }, p));
    });
    if (!saved) return;
    close();
    appState.setRoute({ page: 'item', id: newItemId });
  }

  function saveItemMeta() { appState.mutateProject(p => { const x = p.items.find(y => y.id === item.id); if (x) { x.name = itemName || x.name; x.tags = parseTags(tags); x.note = note; } }); close(); }
  function saveShareSet() {
    const saved = appState.mutateProject(p => p.events.push(createEvent('shares-set', asOfDate, {
      itemId: projectedItem.id, shares: normShares(shares), financialMode: shareFinancialMode, note: 'Anteile geändert'
    }, p)));
    if (saved) close();
  }
  function endItem() { appState.mutateProject(p => p.events.push(createEvent('item-ended', asOfDate, { itemId: projectedItem.id, statusAfter: 'ended', reason: reason || 'beendet' }, p))); close(); }
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
    <div class="modal" role="dialog" aria-modal="true" aria-label={$translate("ui.edit-m49ms0")} style="max-width:720px" on:keydown={confirmFromInput}>
      <div class="modal-header">
        <h3>{
          dialog.type === 'personAdd' ? $translate("app.personAdd") : 
          dialog.type === 'personMeta' ? $translate("ui.edit-person-jstaod") : 
          dialog.type === 'itemAdd' ? $translate("app.recordItem") : 
          dialog.type === 'itemContinue' ? $translate("ui.replace-item-1p7orxr") :
          dialog.type === 'itemMeta' ? $translate("ui.edit-item-birsg") : 
          dialog.type === 'shareSet' ? $translate("ui.change-ownership-shares-1x7cqup") : 
          dialog.type === 'itemEnd' ? $translate("ui.archive-item-1j10bca") : 
          dialog.type === 'options' ? '⚙️ Optionen' : 'Dialog'
        }</h3>
        <button class="ghost" on:click={close}>✕</button>
      </div>
      <div class="modal-body stack">
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
              <div class="notice warn">Endgültiges Löschen gesperrt: {deleteEligibility.reason} Bei einem Auszug die Person stattdessen über ihr Profil als ausgezogen markieren.</div>
            {/if}
          {/if}
        {:else if dialog.type === 'itemAdd' || dialog.type === 'itemContinue'}
          <div class="form-grid">
            <label>{$translate("ui.name-4el6o6")} <input bind:value={itemName} enterkeyhint="done"></label>
            <label>{$translate("ui.categories-2lwhku")} <input bind:value={tags} placeholder={$translate("ui.kitchen-electronics-yb541o")}></label>
            <label>{$translate("ui.purchase-price-in-euros-1858jaw")} <input type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00" bind:value={initialValue}></label>
            <label>{$translate("ui.how-does-the-value-change-16f9eit")} <select bind:value={valuationType}>
              <option value="linear">{$translate("ui.value-decreases-linearly-1u8yk0y")}</option>
              <option value="degressive">{$translate("ui.value-decreases-by-a-percentage-eac-1g9op4c")}</option>
              <option value="fixed">{$translate("ui.value-remains-constant-1tdyxfv")}</option>
            </select></label>
            {#if valuationType === 'linear'}
              <label>{$translate("ui.useful-life-years-jdfjkh")} <input type="number" min="0" step="1" inputmode="numeric" bind:value={durationYears}></label>
            {:else if valuationType === 'degressive'}
              <label>{$translate("ui.annual-loss-in-value-0-2-20-1h9ss42")} <input type="number" min="0" max="1" step="0.01" inputmode="decimal" bind:value={annualRate}></label>
            {/if}
            <label>{$translate("ui.minimum-value-hzgo71")} <input type="number" min="0" step="0.01" inputmode="decimal" bind:value={minimumValue}></label>
            <label class="wide">{$translate("ui.note-86vuh")} <textarea bind:value={note}></textarea></label>
            <section class="wide mini-card stack">
              <strong>{$translate("ui.who-owns-this-item-nnrc3g")}</strong>
              <ShareEditor people={projection.people} bind:shares />
              {#if dialog.type === 'itemAdd'}
                <label>{$translate("ui.who-paid-for-this-item-57n9ck")}
                  <select bind:value={financedByPersonId}>
                    <option value="">{$translate("ui.no-financing-recorded-no-claim-8fndbn")}</option>
                    {#each project.people || [] as person}
                      <option value={person.id}>{person.name}</option>
                    {/each}
                  </select>
                </label>
                <HelpTip label={$translate("ui.how-is-financing-taken-into-account-ohdukf")}>{$translate("ui.the-financing-person-contributes-th-1aq7dq2")}</HelpTip>
              {/if}
            </section>
          </div>
        {:else if dialog.type === 'itemMeta'}
          <div class="form-grid"><label>{$translate("ui.name-4el6o6")} <input bind:value={itemName} enterkeyhint="done"></label><label>{$translate("ui.categories-2lwhku")} <input bind:value={tags}></label><label class="wide">{$translate("ui.note-86vuh")} <textarea bind:value={note}></textarea></label></div>
        {:else if dialog.type === 'shareSet'}
          <ShareEditor people={projection.people} bind:shares />
          <label>{$translate("ui.should-financial-claims-arise-qd7qky")}
            <select bind:value={shareFinancialMode}>
              <option value="derived">{$translate("ui.yes-calculate-automatically-1jfscg7")}</option>
              <option value="none">{$translate("ui.no-gift-or-correction-dim67p")}</option>
            </select>
          </label>
        {:else if dialog.type === 'itemEnd'}
          <label>{$translate("ui.reason-1rj1mxt")} <input bind:value={reason} placeholder={$translate("ui.broken-sold-taken-over-privately-29sy7l")}></label>
        {:else if dialog.type === 'options'}
          <p class="muted">{$translate("ui.the-project-file-and-its-backup-are-1al4mbb")}</p>
        {:else}
          <div class="notice warn">Dieser Dialogtyp ist noch nicht implementiert: {dialog.type}</div>
        {/if}
      </div>
      <div class="modal-footer"><button on:click={close}>{$translate("ui.cancel-cl4zc9")}</button>
        <div style="flex:1"></div>
        {#if dialog.type === 'personAdd'}<button class="primary" on:click={addPerson} disabled={!canSavePersonName}>{$translate("ui.create-zqi05d")}</button>{/if}
        {#if dialog.type === 'personMeta'}<button class="primary" on:click={savePersonMeta} disabled={!canSavePersonName}>{$translate("ui.save-sq2189")}</button>{/if}
        {#if dialog.type === 'personMeta'}<button class="danger" on:click={deletePersonCompletely} disabled={!deleteEligibility.allowed || $appState.readOnly}>{$translate("ui.delete-person-permanently-e06bgl")}</button>{/if}
        {#if dialog.type === 'itemAdd'}
          <button on:click={saveItemDraft}>{$translate("ui.save-as-draft-sz9zgy")}</button>
          <button class="primary" on:click={addItem}>{$translate("ui.create-zqi05d")}</button>
        {/if}
        {#if dialog.type === 'itemContinue'}<button class="primary" on:click={continueItem}>{$translate("ui.replace-and-archive-old-item-y6ooa2")}</button>{/if}
        {#if dialog.type === 'itemMeta'}<button class="primary" on:click={saveItemMeta}>{$translate("ui.save-sq2189")}</button>{/if}
        {#if dialog.type === 'shareSet'}<button class="primary" on:click={saveShareSet}>{$translate("ui.apply-changes-7tqg8a")}</button>{/if}
        {#if dialog.type === 'itemEnd'}<button class="danger" on:click={endItem}>{$translate("ui.archive-qlwwpx")}</button>{/if}
      </div>
    </div>
  </div>
{/if}
