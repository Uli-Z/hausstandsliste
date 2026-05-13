<script>
  import { appState } from '../stores/projectStore.js';
  import { money, normShares } from '../lib/domain.js';
  import { redistributionPreview, redistributionMarkdown, buildRedistributionItemRows, sharesEqual } from '../lib/redistribution.js';
  import ShareEditor from './ShareEditor.svelte';
  import RedistributionItemList from './RedistributionItemList.svelte';
  import { clone, dateDE } from '../lib/util.js';
  
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
  let filterText = '';
  $: activeEditedChild = edited?.events?.find(child => child.id === editingChildId) || null;

  function startEditChild(child) {
    editingChildId = child.id;
    editedChildShares = clone(child.shares);
  }

  function saveChild() {
    const idx = edited.events.findIndex(e => e.id === editingChildId);
    if (idx >= 0) {
      const clean = normShares(editedChildShares);
      const child = edited.events[idx];
      const baseItem = preview.base?.items.find(item => item.id === child.itemId);
      if (baseItem && sharesEqual(baseItem.shares, clean)) {
        edited.events = edited.events.filter(event => event.id !== editingChildId);
      } else {
        edited.events[idx].shares = clean;
      }
      edited = { ...edited };
    }
    editingChildId = null;
  }

  function removeChild(childId) {
    edited.events = edited.events.filter(e => e.id !== childId);
    edited = { ...edited };
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
  $: itemRows = preview.base
    ? buildRedistributionItemRows(preview.base, redistributionForPreview?.changes || [], (edited?.events || []).map(child => child.itemId))
    : [];

  function copyMarkdown() {
    const md = redistributionMarkdown(redistributionForPreview, preview);
    navigator.clipboard.writeText(md).then(() => alert('Markdown in Zwischenablage kopiert.'));
  }
</script>

<div class="modal-backdrop">
  <div class="modal large-modal">
    <div class="modal-header">
      <div class="stack">
        <h3>✏️ Umverteilung bearbeiten</h3>
        <div class="muted">Historischer Stichtag: {dateDE(edited?.date)}</div>
      </div>
      <button class="ghost" on:click={() => appState.closeDialog()}>✕</button>
    </div>
    <div class="modal-body grid-redistribution">
      {#if edited}
        <div class="stack content-left">
          <section class="mini-card stack">
            <div class="grid-2">
              <label>Titel <input bind:value={edited.title}></label>
              <label>Datum <input type="date" bind:value={edited.date}></label>
            </div>
            <div class="notice">Klick auf einen Gegenstand öffnet die Bearbeitung der Anteile. Wenn die Anteile wieder dem Zustand davor entsprechen, wird die Änderung entfernt.</div>
          </section>

          <section class="stack" style="flex: 1; overflow: hidden;">
            <div class="split">
              <strong>📋 Enthaltene Gegenstände</strong>
              <input type="text" placeholder="Filter …" bind:value={filterText} class="small-input">
            </div>
            <RedistributionItemList
              rows={itemRows}
              {filterText}
              emptyLabel="Diese Umverteilung enthält aktuell keine Gegenstände."
              selectedItemId={editingChildId ? edited.events.find(child => child.id === editingChildId)?.itemId : null}
              on:select={(event) => {
                const child = edited.events.find(entry => entry.itemId === event.detail.row.itemId);
                if (child) startEditChild(child);
              }}
            />
          </section>
        </div>

        <div class="stack content-right">
          <section class="mini-card stack">
            <div class="split">
              <strong>💶 Vorschau & Ausgleich</strong>
              <button class="small ghost" on:click={copyMarkdown}>📋 Markdown kopieren</button>
            </div>
            <div class="stack">
              <div class="muted">Wertverschiebung</div>
              {#if preview.rows.length}
                <table class="tight">
                  <tbody>
                    {#each preview.rows as row}
                      <tr><td>{row.personName}</td><td class="money" class:positive={row.delta > 0} class:negative={row.delta < 0}>{row.delta >= 0 ? '+' : ''}{money(row.delta)}</td></tr>
                    {/each}
                  </tbody>
                </table>
              {:else}
                <div class="empty-small">Keine Verschiebung.</div>
              {/if}

              <div class="muted" style="margin-top:8px">Empfohlener Ausgleich</div>
              {#if preview.payments.length}
                <table class="tight">
                  <tbody>
                    {#each preview.payments as p}
                      <tr><td>{p.from} → {p.to}</td><td class="money">{money(p.amount)}</td></tr>
                    {/each}
                  </tbody>
                </table>
              {:else}
                <div class="notice-small">Kein Ausgleich empfohlen.</div>
              {/if}
            </div>
          </section>

          {#if editingChildId}
            <section class="mini-card stack">
              <div class="split">
                <strong>✏️ Anteilssatz ändern</strong>
                <button class="small danger" on:click={() => removeChild(editingChildId)}>Änderung entfernen</button>
              </div>
              <div class="muted">{itemRows.find(row => row.itemId === activeEditedChild?.itemId)?.itemName || activeEditedChild?.itemId}</div>
              <ShareEditor {people} bind:shares={editedChildShares} />
              <div class="row" style="justify-content: flex-end; gap:8px">
                <button on:click={() => editingChildId = null}>Abbrechen</button>
                <button class="primary" on:click={saveChild}>💾 Übernehmen</button>
              </div>
            </section>
          {/if}
        </div>
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
  .large-modal { width: 95vw; max-width: 1100px; height: 85vh; display: flex; flex-direction: column; }
  .grid-redistribution { display: grid; grid-template-columns: 1fr 340px; gap: 24px; flex: 1; overflow: hidden; }
  .content-left { overflow: hidden; display: flex; flex-direction: column; }
  .small-input { padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border); font-size: 0.9rem; }
  .tight td { padding: 2px 0; }
  .empty-small { font-size: 0.85rem; color: var(--muted); font-style: italic; }
  .notice-small { font-size: 0.85rem; padding: 6px; background: var(--soft); border-radius: 4px; }
  .positive { color: var(--ok); }
  .negative { color: var(--warn); }
</style>
