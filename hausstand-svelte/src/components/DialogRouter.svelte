<script>
  import { appState, createEvent, createRedistribution } from '../stores/projectStore.js';
  import { uid, parseTags } from '../lib/util.js';
  import { normShares } from '../lib/domain.js';
  import { personDeletionEligibility, deleteUnusedPerson } from '../lib/personDeletion.js';
  import RedistributionDialog from './RedistributionDialog.svelte';
  import EventEditDialog from './EventEditDialog.svelte';
  import ExecutedRedistributionEditDialog from './ExecutedRedistributionEditDialog.svelte';
  import ShareEditor from './ShareEditor.svelte';
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
      alert('Online-Datei ist schreibgeschützt. Bitte zuerst auschecken.');
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

{#if dialog?.type === 'redistributionEdit'}
  <RedistributionDialog {dialog} {project} {projection} />
{:else if dialog?.type === 'eventEdit'}
  <EventEditDialog {dialog} {project} {projection} />
{:else if dialog?.type === 'executedRedistributionEdit'}
  <ExecutedRedistributionEditDialog {dialog} {project} {projection} />
{:else if dialog}
  <div class="modal-backdrop">
    <div class="modal" style="max-width:720px">
      <div class="modal-header">
        <h3>{
          dialog.type === 'personAdd' ? '➕ Person hinzufügen' : 
          dialog.type === 'personMeta' ? '✏️ Personen-Stammdaten' : 
          dialog.type === 'itemAdd' ? '➕ Gegenstand hinzufügen' : 
          dialog.type === 'itemContinue' ? '🔄 Als neue Version fortführen' :
          dialog.type === 'itemMeta' ? '✏️ Gegenstand-Stammdaten' : 
          dialog.type === 'shareSet' ? '🧮 Anteile ändern' : 
          dialog.type === 'itemEnd' ? '📦 Gegenstand beenden' : 
          dialog.type === 'options' ? '⚙️ Optionen' : 'Dialog'
        }</h3>
        <button class="ghost" on:click={close}>✕</button>
      </div>
      <div class="modal-body stack">
        {#if dialog.type === 'personAdd' || dialog.type === 'personMeta'}
          <label>Name <input bind:value={name} placeholder="Name"></label>
          {#if duplicatePerson}
            <div class="notice warn">
              Eine Person mit diesem Namen existiert bereits: <strong>{duplicatePerson.name}</strong>
              ({duplicateIsActive ? 'aktiv' : 'inaktiv'}).
            </div>
            {#if !duplicateIsActive}
              <div class="row">
                {#if duplicateIsFutureMoveIn}
                  <button class="small" on:click={() => pullMoveInForward(duplicatePerson)}>Einzug auf Stichtag vorziehen</button>
                {/if}
                {#if duplicateLatestDeactivation}
                  <button class="small danger" on:click={() => deleteMoveOut(duplicatePerson)}>Letzten Auszug löschen</button>
                {/if}
              </div>
            {/if}
          {/if}
          {#if dialog.type === 'personMeta'}
            {#if deleteEligibility.allowed}
              <div class="notice">Endgültiges Löschen ist nur möglich, solange eine Person noch an keinem Gegenstand, Ereignis oder Entwurf beteiligt war.</div>
            {:else}
              <div class="notice warn">Endgültiges Löschen gesperrt: {deleteEligibility.reason} Bei einem Auszug die Person stattdessen über ihr Profil als ausgezogen markieren.</div>
            {/if}
          {/if}
        {:else if dialog.type === 'itemAdd' || dialog.type === 'itemContinue'}
          <div class="form-grid">
            <label>Name <input bind:value={itemName}></label>
            <label>Tags <input bind:value={tags} placeholder="Küche, Elektro"></label>
            <label>Startwert <input type="number" step="0.01" bind:value={initialValue}></label>
            <label>Bewertung <select bind:value={valuationType}>
              <option value="linear">linear</option>
              <option value="degressive">degressiv</option>
              <option value="fixed">konstant</option>
            </select></label>
            {#if valuationType === 'linear'}
              <label>Nutzungsdauer/Jahre <input type="number" bind:value={durationYears}></label>
            {:else if valuationType === 'degressive'}
              <label>Jährliche Rate (0-1) <input type="number" step="0.01" bind:value={annualRate}></label>
            {/if}
            <label>Mindestwert <input type="number" step="0.01" bind:value={minimumValue}></label>
            <label class="wide">Notiz <textarea bind:value={note}></textarea></label>
            <section class="wide mini-card stack">
              <strong>Initiale Anteile</strong>
              <ShareEditor people={projection.people} bind:shares />
              {#if dialog.type === 'itemAdd'}
                <label>Finanziert / eingebracht von
                  <select bind:value={financedByPersonId}>
                    <option value="">Keine Finanzierung zuordnen (keine Forderung)</option>
                    {#each project.people || [] as person}
                      <option value={person.id}>{person.name}</option>
                    {/each}
                  </select>
                </label>
                <div class="muted">Wenn eine Person den ganzen Gegenstand finanziert hat, schulden andere Anteilseigner ihr automatisch ihren Anteil am Startwert.</div>
              {/if}
            </section>
          </div>
        {:else if dialog.type === 'itemMeta'}
          <div class="form-grid"><label>Name <input bind:value={itemName}></label><label>Tags <input bind:value={tags}></label><label class="wide">Notiz <textarea bind:value={note}></textarea></label></div>
        {:else if dialog.type === 'shareSet'}
          <ShareEditor people={projection.people} bind:shares />
          <label>Finanzielle Wirkung
            <select bind:value={shareFinancialMode}>
              <option value="derived">Entgeltlich – Forderung berechnen</option>
              <option value="none">Unentgeltlich / Korrektur – keine Forderung</option>
            </select>
          </label>
        {:else if dialog.type === 'itemEnd'}
          <label>Grund <input bind:value={reason} placeholder="kaputt, verkauft, privat übernommen …"></label>
        {:else if dialog.type === 'options'}
          <div class="notice">Optionen sind bewusst klein gehalten: Projekt öffnen, speichern und neues Projekt liegen rechts im Header. Weitere Einstellungen können hier später ergänzt werden.</div>
        {:else}
          <div class="notice warn">Dieser Dialogtyp ist noch nicht implementiert: {dialog.type}</div>
        {/if}
      </div>
      <div class="modal-footer"><button on:click={close}>Abbrechen</button>
        <div style="flex:1"></div>
        {#if dialog.type === 'personAdd'}<button class="primary" on:click={addPerson} disabled={!canSavePersonName}>✅ Anlegen</button>{/if}
        {#if dialog.type === 'personMeta'}<button class="primary" on:click={savePersonMeta} disabled={!canSavePersonName}>💾 Speichern</button>{/if}
        {#if dialog.type === 'personMeta'}<button class="danger" on:click={deletePersonCompletely} disabled={!deleteEligibility.allowed || $appState.readOnly}>🗑️ Komplett löschen</button>{/if}
        {#if dialog.type === 'itemAdd'}
          <button on:click={saveItemDraft}>💾 Als Entwurf speichern</button>
          <button class="primary" on:click={addItem}>✅ Anlegen</button>
        {/if}
        {#if dialog.type === 'itemContinue'}<button class="primary" on:click={continueItem}>🔄 Neu anlegen & alt beenden</button>{/if}
        {#if dialog.type === 'itemMeta'}<button class="primary" on:click={saveItemMeta}>💾 Speichern</button>{/if}
        {#if dialog.type === 'shareSet'}<button class="primary" on:click={saveShareSet}>✅ Ereignis anlegen</button>{/if}
        {#if dialog.type === 'itemEnd'}<button class="danger" on:click={endItem}>📦 Beenden</button>{/if}
      </div>
    </div>
  </div>
{/if}
