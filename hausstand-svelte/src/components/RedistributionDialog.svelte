<script>
  import { appState } from '../stores/projectStore.js';
  import { money, normShares } from '../lib/domain.js';
  import { redistributionPreview } from '../lib/projector.js';
  import ShareEditor from './ShareEditor.svelte';
  import { uid } from '../lib/util.js';
  export let dialog;
  export let project;
  export let projection;

  $: redistribution = (project.redistributions || []).find(r => r.id === dialog.id) || dialog.redistribution;
  $: preview = redistribution ? redistributionPreview(project, redistribution) : { rows: [], payments: [] };
  let editingItemId = null;
  let sourcePersonId = dialog.sourcePersonId || '';
  let targetPersonId = '';
  let units = 1;
  $: editingChange = redistribution?.changes?.find(c => c.itemId === editingItemId);
  $: people = projection.people;
  $: itemsAtDate = preview.base?.activeItems || [];

  function saveWork(mutator) {
    appState.mutateProject(p => {
      const r = p.redistributions.find(x => x.id === redistribution.id);
      if (r) mutator(r);
    });
  }
  function upsertChange(itemId, shares) {
    saveWork(r => {
      const clean = normShares(shares);
      const idx = r.changes.findIndex(c => c.itemId === itemId);
      if (idx >= 0) r.changes[idx] = { itemId, shares: clean };
      else r.changes.push({ itemId, shares: clean });
    });
  }
  function removeChange(itemId) { saveWork(r => { r.changes = r.changes.filter(c => c.itemId !== itemId); }); if (editingItemId === itemId) editingItemId = null; }
  function applyRemovePerson() {
    if (!sourcePersonId) return alert('Bitte Person wählen.');
    for (const item of itemsAtDate) if (item.shares?.[sourcePersonId]) { const shares = { ...item.shares }; delete shares[sourcePersonId]; upsertChange(item.id, shares); }
  }
  function applyAddPerson() {
    if (!targetPersonId) return alert('Bitte Person wählen.');
    for (const item of itemsAtDate) if (!item.shares?.[targetPersonId]) upsertChange(item.id, { ...item.shares, [targetPersonId]: Number(units) || 1 });
  }
  function applyTransferPerson() {
    if (!sourcePersonId || !targetPersonId) return alert('Bitte Quelle und Ziel wählen.');
    if (sourcePersonId === targetPersonId) return alert('Quelle und Ziel müssen verschieden sein.');
    for (const item of itemsAtDate) {
      const current = item.shares || {};
      if (!current[sourcePersonId]) continue;
      const shares = { ...current, [targetPersonId]: (Number(current[targetPersonId]) || 0) + (Number(current[sourcePersonId]) || 0) };
      delete shares[sourcePersonId];
      upsertChange(item.id, shares);
    }
  }
  function execute() {
    appState.mutateProject(p => {
      const idx = p.redistributions.findIndex(r => r.id === redistribution.id);
      if (idx < 0) return;
      const r = p.redistributions[idx];
      p.events.push({ id: uid('event'), type: 'redistribution-executed', date: r.effectiveDate, order: Date.now(), title: r.title, events: r.changes.map(c => ({ id: uid('event_child'), type: 'shares-set', itemId: c.itemId, shares: normShares(c.shares), note: r.title })) });
      p.redistributions.splice(idx, 1);
    });
    appState.closeDialog();
  }
</script>

<div class="modal-backdrop">
  <div class="modal">
    <div class="modal-header"><h3>🔁 Umverteilung: {redistribution?.title}</h3><button class="ghost" on:click={() => appState.closeDialog()}>✕</button></div>
    <div class="modal-body stack">
      {#if redistribution}
        <div class="grid-3"><label>Titel <input value={redistribution.title} on:input={e => saveWork(r => r.title = e.currentTarget.value)}></label><label>Datum <input type="date" value={redistribution.effectiveDate} on:change={e => saveWork(r => r.effectiveDate = e.currentTarget.value)}></label><div class="notice">Änderungen werden zunächst nur vorgemerkt.</div></div>

        <section class="mini-card stack"><strong>⚡ Personenaktion</strong><div class="form-grid">
          <label>Von Person <select bind:value={sourcePersonId}><option value="">auswählen …</option>{#each people as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
          <label>Auf Person <select bind:value={targetPersonId}><option value="">auswählen …</option>{#each people as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
          <label>Einheiten beim Hinzufügen <input type="number" min="0.01" step="0.01" bind:value={units}></label>
          <div class="row" style="align-self:end"><button on:click={applyTransferPerson}>🔁 alle Anteile übertragen</button><button on:click={applyRemovePerson}>🧹 alle Anteile entfernen</button><button on:click={applyAddPerson}>➕ Person überall hinzufügen</button></div>
        </div></section>

        <section class="mini-card stack"><strong>📋 Vorgemerkte Einzeländerungen</strong>
          {#if redistribution.changes?.length}
            <table><thead><tr><th>Gegenstand</th><th>Neue Anteilseigner</th><th></th></tr></thead><tbody>{#each redistribution.changes as change}<tr class:changed-row={editingItemId===change.itemId}><td>{itemsAtDate.find(i=>i.id===change.itemId)?.name || change.itemId}</td><td>{Object.entries(change.shares).map(([pid,u]) => `${people.find(p=>p.id===pid)?.name || pid}: ${u}`).join(' · ')}</td><td class="right"><button class="small" on:click={() => editingItemId = change.itemId}>✏️</button> <button class="small danger" on:click={() => removeChange(change.itemId)}>🗑️</button></td></tr>{/each}</tbody></table>
          {:else}<div class="empty">Noch keine Änderungen vorgemerkt.</div>{/if}
          <label>Gegenstand manuell bearbeiten <select on:change={e => { editingItemId = e.currentTarget.value; if (editingItemId && !redistribution.changes?.some(c => c.itemId === editingItemId)) { const item = itemsAtDate.find(i => i.id === editingItemId); upsertChange(editingItemId, item?.shares || {}); } }}><option value="">auswählen …</option>{#each itemsAtDate as item}<option value={item.id}>{item.name}</option>{/each}</select></label>
          {#if editingChange}
            <div class="notice">Bearbeitung: {itemsAtDate.find(i=>i.id===editingItemId)?.name || editingItemId}</div>
            <ShareEditor people={people} bind:shares={editingChange.shares} />
            <button on:click={() => upsertChange(editingItemId, editingChange.shares)}>💾 Einzeländerung speichern</button>
          {/if}
        </section>

        <section class="mini-card stack"><strong>💶 Wertverschiebung und Ausgleichsempfehlung</strong>
          {#if preview.rows.length}<table><thead><tr><th>Person</th><th class="money">Delta</th></tr></thead><tbody>{#each preview.rows as row}<tr><td>{row.personName}</td><td class="money">{row.delta >= 0 ? '+' : ''}{money(row.delta)}</td></tr>{/each}</tbody></table>{:else}<div class="empty">Keine Wertverschiebung.</div>{/if}
          {#if preview.payments.length}<table><thead><tr><th>Zahler</th><th>Empfänger</th><th class="money">Betrag</th></tr></thead><tbody>{#each preview.payments as p}<tr><td>{p.from}</td><td>{p.to}</td><td class="money">{money(p.amount)}</td></tr>{/each}</tbody></table>{:else}<div class="notice">Keine Ausgleichszahlung empfohlen.</div>{/if}
        </section>
      {/if}
    </div>
    <div class="modal-footer"><button on:click={() => appState.closeDialog()}>Schließen</button><button class="primary" disabled={!redistribution?.changes?.length} on:click={execute}>✅ Umverteilung ausführen</button></div>
  </div>
</div>
