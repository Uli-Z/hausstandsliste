<script>
  import { appState } from '../stores/projectStore.js';
  import { money, normShares } from '../lib/domain.js';
  import { redistributionPreview, redistributionMarkdown } from '../lib/redistribution.js';
  import ShareEditor from './ShareEditor.svelte';
  import { uid, clone } from '../lib/util.js';
  
  export let dialog;
  export let project;
  export let projection;

  $: event = project.events.find(e => e.id === dialog.eventId);
  let edited = null;

  $: if (event && !edited) {
    edited = clone(event);
  }

  // Für die Vorschau brauchen wir ein temporäres Redistribution-Objekt
  $: redistributionForPreview = edited ? {
    id: edited.id,
    title: edited.title,
    effectiveDate: edited.date,
    changes: (edited.events || []).filter(e => e.type === 'shares-set').map(e => ({
      itemId: e.itemId,
      shares: e.shares
    }))
  } : null;

  // Für die Berechnung der Wertverschiebung muss das Original-Event aus dem Projekt entfernt werden,
  // damit die Basis-Projektion den Stand DAVOR korrekt wiedergibt.
  $: projectBefore = project.events.filter(e => e.id !== event?.id);
  $: preview = redistributionForPreview ? redistributionPreview({ ...project, events: projectBefore }, redistributionForPreview) : { rows: [], payments: [] };

  let editingChildId = null;
  let editedChildShares = {};

  function startEditChild(child) {
    editingChildId = child.id;
    editedChildShares = clone(child.shares);
  }

  function saveChild() {
    const idx = edited.events.findIndex(e => e.id === editingChildId);
    if (idx >= 0) {
      edited.events[idx].shares = normShares(editedChildShares);
    }
    editingChildId = null;
  }

  function removeChild(childId) {
    edited.events = edited.events.filter(e => e.id !== childId);
    if (editingChildId === childId) editingChildId = null;
  }

  function save() {
    appState.mutateProject(p => {
      const idx = p.events.findIndex(e => e.id === edited.id);
      if (idx >= 0) p.events[idx] = { ...edited };
    });
    appState.closeDialog();
  }

  function remove() {
    if (!confirm('Gesamte Umverteilung wirklich löschen?')) return;
    appState.mutateProject(p => {
      p.events = p.events.filter(e => e.id !== event.id);
    });
    appState.closeDialog();
  }

  $: people = projection.people;
  $: itemsById = projection.itemsById;

  function copyMarkdown() {
    const md = redistributionMarkdown(redistributionForPreview, preview);
    navigator.clipboard.writeText(md).then(() => alert('Markdown in Zwischenablage kopiert.'));
  }
</script>

<div class="modal-backdrop">
  <div class="modal">
    <div class="modal-header">
      <h3>✏️ Umverteilung bearbeiten: {edited?.title}</h3>
      <button class="ghost" on:click={() => appState.closeDialog()}>✕</button>
    </div>
    <div class="modal-body stack">
      {#if edited}
        <div class="grid-2">
          <label>Titel <input bind:value={edited.title}></label>
          <label>Datum <input type="date" bind:value={edited.date}></label>
        </div>

        <section class="mini-card stack">
          <strong>📋 Enthaltene Änderungen</strong>
          <table>
            <thead>
              <tr><th>Gegenstand</th><th>Anteile</th><th class="right">Aktionen</th></tr>
            </thead>
            <tbody>
              {#each edited.events as child}
                <tr class:changed-row={editingChildId === child.id}>
                  <td>{itemsById.get(child.itemId)?.name || child.itemId}</td>
                  <td>
                    {#each Object.entries(child.shares) as [pid, u]}
                      <span class="badge ghost">{people.find(p=>p.id===pid)?.name || pid}: {u}</span>
                    {/each}
                  </td>
                  <td class="right">
                    <button class="small" on:click={() => startEditChild(child)}>✏️</button>
                    <button class="small danger" on:click={() => removeChild(child.id)}>🗑️</button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>

          {#if editingChildId}
            <div class="edit-box mini-card stack" style="background: var(--bg-item); border: 1px solid var(--border)">
              <strong>Anteilssatz ändern</strong>
              <ShareEditor {people} bind:shares={editedChildShares} />
              <div class="row" style="justify-content: flex-end; gap:8px">
                <button on:click={() => editingChildId = null}>Abbrechen</button>
                <button class="primary" on:click={saveChild}>💾 Übernehmen</button>
              </div>
            </div>
          {/if}
        </section>

        <section class="mini-card stack">
          <div class="split">
            <strong>💶 Vorschau (historisch)</strong>
            <button class="small ghost" on:click={copyMarkdown}>📋 Markdown kopieren</button>
          </div>
          <div class="grid-2">
            <div class="stack">
              <div class="muted">Wertverschiebung</div>
              {#if preview.rows.length}
                <table>
                  <tbody>
                    {#each preview.rows as row}
                      <tr><td>{row.personName}</td><td class="money">{row.delta >= 0 ? '+' : ''}{money(row.delta)}</td></tr>
                    {/each}
                  </tbody>
                </table>
              {/if}
            </div>
            <div class="stack">
              <div class="muted">Ausgleich</div>
              {#if preview.payments.length}
                <table>
                  <tbody>
                    {#each preview.payments as p}
                      <tr><td>{p.from} → {p.to}</td><td class="money">{money(p.amount)}</td></tr>
                    {/each}
                  </tbody>
                </table>
              {/if}
            </div>
          </div>
        </section>
      {/if}
    </div>
    <div class="modal-footer">
      <button class="danger" on:click={remove}>🗑️ Umverteilung löschen</button>
      <div style="flex:1"></div>
      <button on:click={() => appState.closeDialog()}>Abbrechen</button>
      <button class="primary" on:click={save}>💾 Korrektur speichern</button>
    </div>
  </div>
</div>

<style>
  .badge.ghost { background: transparent; border: 1px solid var(--border); font-size: 0.8rem; }
  .edit-box { padding: 12px; margin-top: 8px; }
</style>
