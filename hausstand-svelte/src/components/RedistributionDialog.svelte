<script>
  import { appState } from '../stores/projectStore.js';
  import { money, normShares } from '../lib/domain.js';
  import { 
    redistributionPreview, 
    redistributionMarkdown, 
    buildRedistributionItemRows,
    buildTransferChanges, 
    buildRemovePersonChanges, 
    buildAddPersonChanges,
    sharesEqual
  } from '../lib/redistribution.js';
  import ShareEditor from './ShareEditor.svelte';
  import RedistributionItemList from './RedistributionItemList.svelte';
  import { uid, clone, dateDE } from '../lib/util.js';
  
  export let dialog;
  export let project;
  export let projection;

  // Lokale Arbeitskopie
  let redistribution = clone(dialog.redistribution || (project.drafts || []).find(d => d.id === dialog.id));
  
  $: preview = redistribution ? redistributionPreview(project, redistribution) : { base: null, rows: [], payments: [] };
  
  $: people = projection.people;
  $: itemsAtDate = preview.base?.activeItems || [];
  $: itemRows = preview.base ? buildRedistributionItemRows(preview.base, redistribution.changes || []) : [];

  let filterText = "";

  // Sub-Modals
  let activeSubModal = null; // 'item', 'special-transfer', 'special-remove', 'special-add'
  let subModalData = {};

  function upsertChange(itemId, shares) {
    const clean = normShares(shares);
    const baseItem = preview.base?.items.find(item => item.id === itemId);
    const idx = redistribution.changes.findIndex(c => c.itemId === itemId);
    if (baseItem && sharesEqual(baseItem.shares, clean)) {
      redistribution.changes = redistribution.changes.filter(c => c.itemId !== itemId);
    } else if (idx >= 0) redistribution.changes[idx] = { itemId, shares: clean };
    else redistribution.changes.push({ itemId, shares: clean });
    redistribution = { ...redistribution };
  }

  function openItemEdit(item) {
    const existing = redistribution.changes.find(c => c.itemId === item.id);
    activeSubModal = 'item';
    subModalData = {
      item,
      shares: clone(existing ? existing.shares : item.shares)
    };
  }

  function applySpecial() {
    let changes = [];
    if (activeSubModal === 'special-transfer') {
      changes = buildTransferChanges(preview.base, subModalData.sourceId, subModalData.targetId);
    } else if (activeSubModal === 'special-remove') {
      changes = buildRemovePersonChanges(preview.base, subModalData.sourceId);
    } else if (activeSubModal === 'special-add') {
      changes = buildAddPersonChanges(preview.base, subModalData.targetId, Number(subModalData.units) || 1);
    }
    for (const c of changes) upsertChange(c.itemId, c.shares);
    activeSubModal = null;
  }

  function saveAsDraft() {
    appState.upsertDraft(redistribution);
    appState.closeDialog();
  }

  function execute() {
    if (!confirm('Umverteilung jetzt ausführen?')) return;
    appState.mutateProject(p => {
      p.events.push({ 
        id: uid('event'), type: 'redistribution-executed', date: redistribution.effectiveDate, order: Date.now(), title: redistribution.title,
        events: redistribution.changes.map(c => ({ id: uid('event_child'), type: 'shares-set', itemId: c.itemId, shares: normShares(c.shares), note: redistribution.title })) 
      });
      p.drafts = (p.drafts || []).filter(d => d.id !== redistribution.id);
    });
    appState.closeDialog();
  }
</script>

<div class="modal-backdrop">
  <div class="modal large-modal">
    <div class="modal-header">
      <div class="stack">
        <h3>🔁 Umverteilung vorbereiten</h3>
        <div class="muted">Stichtag: {dateDE(redistribution?.effectiveDate)} (fixiert)</div>
      </div>
      <button class="ghost" on:click={() => appState.closeDialog()}>✕</button>
    </div>
    
    <div class="modal-body grid-redistribution">
      <!-- Linke Seite: Spezialaktionen und Items -->
      <div class="stack content-left">
        <section class="mini-card stack">
          <label>Titel <input bind:value={redistribution.title} placeholder="z. B. Auszug Anna"></label>
          <strong>🛠️ Spezialaktionen</strong>
          <div class="row">
            <button class="small" on:click={() => { activeSubModal = 'special-transfer'; subModalData = { sourceId: dialog.sourcePersonId || '', targetId: '' }; }}>Alle Anteile übertragen</button>
            <button class="small" on:click={() => { activeSubModal = 'special-remove'; subModalData = { sourceId: dialog.sourcePersonId || '' }; }}>Anteile entfernen</button>
            <button class="small" on:click={() => { activeSubModal = 'special-add'; subModalData = { targetId: '', units: 1 }; }}>Person überall hinzufügen</button>
          </div>
        </section>

        <section class="stack" style="flex: 1; overflow: hidden;">
          <div class="split">
            <strong>📋 Gegenstände zum Stichtag</strong>
            <input type="text" placeholder="Filter …" bind:value={filterText} class="small-input">
          </div>
          <RedistributionItemList rows={itemRows} {filterText} emptyLabel="Keine Gegenstände zum Stichtag."
            on:select={(event) => {
              const item = itemsAtDate.find(entry => entry.id === event.detail.row.itemId);
              if (item) openItemEdit(item);
            }}
          />
        </section>
      </div>

      <!-- Rechte Seite: Preview & Settlement -->
      <div class="stack content-right">
        <section class="mini-card stack">
          <div class="split">
            <strong>💶 Vorschau & Ausgleich</strong>
            <button class="small ghost" on:click={() => navigator.clipboard.writeText(redistributionMarkdown(redistribution, preview)).then(() => alert('Markdown kopiert.'))}>📋 MD</button>
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
            {:else}<div class="empty-small">Keine Verschiebung.</div>{/if}
            
            <div class="muted" style="margin-top:8px">Empfohlener Ausgleich</div>
            {#if preview.payments.length}
              <table class="tight">
                <tbody>
                  {#each preview.payments as p}
                    <tr><td>{p.from} → {p.to}</td><td class="money">{money(p.amount)}</td></tr>
                  {/each}
                </tbody>
              </table>
            {:else}<div class="notice-small">Kein Ausgleich empfohlen.</div>{/if}
          </div>
        </section>
        <div class="notice small-text">Entwürfe werden im Projekt-JSON gespeichert, wirken aber erst nach dem "Ausführen" auf die Timeline.</div>
      </div>
    </div>

    <div class="modal-footer">
      <button on:click={() => appState.closeDialog()}>Verwerfen / Schließen</button>
      <div style="flex:1"></div>
      <button on:click={saveAsDraft}>💾 Als Entwurf speichern</button>
      <button class="primary" on:click={execute} disabled={!redistribution.changes.length}>✅ Umverteilung ausführen</button>
    </div>
  </div>
</div>

<!-- Sub-Modals -->
{#if activeSubModal}
  <div class="modal-backdrop sub-modal">
    <div class="modal" style="max-width: 600px">
      <div class="modal-header">
        <h3>
          {#if activeSubModal === 'item'}Anteilssatz ändern: {subModalData.item.name}{/if}
          {#if activeSubModal === 'special-transfer'}Alle Anteile übertragen{/if}
          {#if activeSubModal === 'special-remove'}Alle Anteile einer Person entfernen{/if}
          {#if activeSubModal === 'special-add'}Person überall hinzufügen{/if}
        </h3>
      </div>
      <div class="modal-body stack">
        {#if activeSubModal === 'item'}
          <div class="grid-2">
            <div class="stack">
              <div class="muted">Bisher</div>
              {#each Object.entries(subModalData.item.shares) as [pid, u]}
                <div class="small-text">{people.find(p=>p.id===pid)?.name || pid}: {u}</div>
              {/each}
            </div>
            <div class="stack">
              <div class="muted">Neu</div>
              <ShareEditor {people} bind:shares={subModalData.shares} />
            </div>
          </div>
        {:else if activeSubModal === 'special-transfer'}
          <div class="form-grid">
            <label>Von Person <select bind:value={subModalData.sourceId}><option value="">wählen …</option>{#each people as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
            <label>Auf Person <select bind:value={subModalData.targetId}><option value="">wählen …</option>{#each people as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
          </div>
        {:else if activeSubModal === 'special-remove'}
          <label>Person entfernen <select bind:value={subModalData.sourceId}><option value="">wählen …</option>{#each people as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
        {:else if activeSubModal === 'special-add'}
          <div class="form-grid">
            <label>Hinzuzufügende Person <select bind:value={subModalData.targetId}><option value="">wählen …</option>{#each people as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
            <label>Einheiten <input type="number" step="1" bind:value={subModalData.units}></label>
          </div>
        {/if}
      </div>
      <div class="modal-footer">
        <button on:click={() => activeSubModal = null}>Abbrechen</button>
        <button class="primary" on:click={() => {
          if (activeSubModal === 'item') { upsertChange(subModalData.item.id, subModalData.shares); activeSubModal = null; }
          else applySpecial();
        }}>Anwenden</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .large-modal { width: 95vw; max-width: 1100px; height: 85vh; display: flex; flex-direction: column; }
  .grid-redistribution { display: grid; grid-template-columns: 1fr 340px; gap: 24px; flex: 1; overflow: hidden; }
  .small-text { font-size: 0.85rem; }
  .small-input { padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border); font-size: 0.9rem; }
  .tight td { padding: 2px 0; }
  .empty-small { font-size: 0.85rem; color: var(--muted); font-style: italic; }
  .notice-small { font-size: 0.85rem; padding: 6px; background: var(--soft); border-radius: 4px; }
  .positive { color: var(--ok); }
  .negative { color: var(--warn); }
  .sub-modal { z-index: 100; }
  .content-left { overflow: hidden; display: flex; flex-direction: column; }
</style>
