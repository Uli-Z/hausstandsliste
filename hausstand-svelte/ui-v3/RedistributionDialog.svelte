<script>
  import { appState } from '../src/stores/projectStore.js';
  import { REDISTRIBUTION_SUGGESTION_TITLE, REDISTRIBUTION_SUGGESTION_NOTICE } from '../src/lib/financialLabels.js';
  import HelpTip from '../src/components/HelpTip.svelte';
  import { money, normShares, shareTotal } from '../src/lib/domain.js';
  import { 
    redistributionPreview, 
    redistributionMarkdown, 
    buildRedistributionItemRows,
    buildTransferChanges, 
    buildRemovePersonChanges, 
    soleOwnedItems, 
    buildAddPersonChanges,
    sharesEqual
  } from '../src/lib/redistribution.js';
  import ShareEditor from './ShareEditor.svelte';
  import { isEnterForSubmit } from './form-behavior.js';
  import RedistributionItemList from '../src/components/RedistributionItemList.svelte';
  import { uid, clone, dateDE, nextEventOrder } from '../src/lib/util.js';
  
  export let dialog;
  export let project;
  export let projection;

  // Lokale Arbeitskopie
  let redistribution = clone(dialog.redistribution || (project.drafts || []).find(d => d.id === dialog.id));
  // Old saved drafts remain financially neutral until explicitly enabled.
  if (redistribution && !redistribution.financialMode) redistribution.financialMode = 'none';
  
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
    if (shareTotal(clean) <= 0) {
      alert('Ein aktiver Gegenstand braucht mindestens eine Person mit positivem Eigentumsanteil. Bitte erst Anteile übertragen oder den Gegenstand ausdrücklich beenden.');
      return false;
    }
    const baseItem = preview.base?.items.find(item => item.id === itemId);
    const idx = redistribution.changes.findIndex(c => c.itemId === itemId);
    if (baseItem && sharesEqual(baseItem.shares, clean)) {
      redistribution.changes = redistribution.changes.filter(c => c.itemId !== itemId);
    } else if (idx >= 0) redistribution.changes[idx] = { itemId, shares: clean };
    else redistribution.changes.push({ itemId, shares: clean });
    redistribution = { ...redistribution };
    return true;
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
      const blocked = soleOwnedItems(preview.base, subModalData.sourceId);
      if (blocked.length) {
        alert('Die letzte Eigentümerin bzw. der letzte Eigentümer kann bei diesen Gegenständen nicht entfernt werden: '
          + blocked.map(item => item.name).join(', ')
          + '. Bitte die Anteile übertragen oder die Gegenstände ausdrücklich beenden. Andere Gegenstände werden bearbeitet.');
      }
      changes = buildRemovePersonChanges(preview.base, subModalData.sourceId);
    } else if (activeSubModal === 'special-add') {
      changes = buildAddPersonChanges(preview.base, subModalData.targetId, Number(subModalData.units) || 1);
    }
    for (const c of changes) upsertChange(c.itemId, c.shares);
    activeSubModal = null;
  }

  function confirmFromInput(event) {
    if (!isEnterForSubmit(event)) return;
    if (activeSubModal) return; // Unterdialog hat eine eigene Bestätigung.
    event.preventDefault();
    if (redistribution?.changes?.length) execute();
  }

  function saveAsDraft() {
    appState.upsertDraft(redistribution);
    appState.closeDialog();
  }

  function execute() {
    if (!confirm('Umverteilung jetzt ausführen?')) return;
    const saved = appState.mutateProject(p => {
      p.events.push({ 
        id: uid('event'), type: 'redistribution-executed', date: redistribution.effectiveDate, order: nextEventOrder(p, redistribution.effectiveDate), title: redistribution.title, financialMode: redistribution.financialMode,
        events: redistribution.changes.map(c => ({ id: uid('event_child'), type: 'shares-set', itemId: c.itemId, shares: normShares(c.shares), note: redistribution.title })) 
      });
      p.drafts = (p.drafts || []).filter(d => d.id !== redistribution.id);
    });
    if (saved) appState.closeDialog();
  }
</script>

<div class="modal-backdrop">
  <div class="modal large-modal" role="dialog" aria-modal="true" aria-label="Anteile übertragen" on:keydown={confirmFromInput}>
    <div class="modal-header">
      <div class="stack">
        <h3>Anteile übertragen oder neu verteilen</h3>
        <div class="muted">Gültig ab {dateDE(redistribution?.effectiveDate)} · Das Datum wird oben in der Ansicht gewählt</div>
      </div>
      <button class="ghost" on:click={() => appState.closeDialog()}>✕</button>
    </div>
    
    <div class="modal-body grid-redistribution">
      <!-- Linke Seite: Spezialaktionen und Items -->
      <div class="stack content-left">
        <section class="mini-card stack">
          <label>Beschreibung <input bind:value={redistribution.title} placeholder="z. B. Auszug Anna"></label>
          <label>Sollen Geldforderungen entstehen?
            <select bind:value={redistribution.financialMode}>
              <option value="derived">Ja – Forderungen automatisch berechnen</option>
              <option value="none">Nein – Schenkung oder Korrektur</option>
            </select>
          </label>
          <strong>Schnellaktionen</strong>
          <div class="row">
            <button class="small" on:click={() => { activeSubModal = 'special-transfer'; subModalData = { sourceId: dialog.sourcePersonId || '', targetId: '' }; }}>Alle Anteile an eine Person übertragen</button>
            <button class="small" on:click={() => { activeSubModal = 'special-remove'; subModalData = { sourceId: dialog.sourcePersonId || '' }; }}>Alle Anteile einer Person entfernen</button>
            <button class="small" on:click={() => { activeSubModal = 'special-add'; subModalData = { targetId: '', units: 1 }; }}>Person an allen Gegenständen beteiligen</button>
          </div>
        </section>

        <section class="stack" style="flex: 1; overflow: hidden;">
          <div class="split">
            <strong>Gegenstände auswählen und Anteile ändern</strong>
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
            <strong>So wirkt sich die Änderung aus</strong>
            <button class="small ghost" on:click={() => navigator.clipboard.writeText(redistributionMarkdown(redistribution, preview)).then(() => alert('Markdown kopiert.'))}>📋 MD</button>
          </div>
          <div class="stack">
            <div class="muted">Veränderung der Wertanteile</div>
            {#if preview.rows.length}
              <table class="tight">
                <tbody>
                  {#each preview.rows as row}
                    <tr><td>{row.personName}</td><td class="money" class:positive={row.delta > 0} class:negative={row.delta < 0}>{row.delta >= 0 ? '+' : ''}{money(row.delta)}</td></tr>
                  {/each}
                </tbody>
              </table>
            {:else}<div class="empty-small">Keine Verschiebung.</div>{/if}
            
            <div class="financial-help-heading"><strong>{redistribution.financialMode === 'derived' ? 'Ausgleichsvorschlag' : 'Kein Ausgleich'}</strong><HelpTip label="Wie wirkt sich die Anteilsänderung finanziell aus?">{REDISTRIBUTION_SUGGESTION_TITLE} {REDISTRIBUTION_SUGGESTION_NOTICE}</HelpTip></div>
            {#if preview.payments.length}
              <table class="tight">
                <tbody>
                  {#each preview.payments as p}
                    <tr><td>{p.from} → {p.to}</td><td class="money">{money(p.amount)}</td></tr>
                  {/each}
                </tbody>
              </table>
                
            {:else}<div class="notice-small">{redistribution.financialMode === 'derived' ? 'Kein Ausgleich vorgeschlagen.' : 'Unentgeltlich – kein Ausgleich.'}</div>{/if}
          </div>
        </section>
        <div class="workflow-help"><HelpTip label="Hilfe zum Ablauf">Ein Entwurf wird gespeichert, verändert aber noch keine Eigentumsanteile. Erst wenn du die Änderung übernimmst, wird sie wirksam.</HelpTip></div>
      </div>
    </div>

    <div class="modal-footer">
      <button on:click={() => appState.closeDialog()}>Abbrechen</button>
      <div style="flex:1"></div>
      <button on:click={saveAsDraft}>💾 Als Entwurf speichern</button>
      <button class="primary" on:click={execute} disabled={!redistribution.changes.length}>Änderung übernehmen</button>
    </div>
  </div>
</div>

<!-- Sub-Modals -->
{#if activeSubModal}
  <div class="modal-backdrop sub-modal">
    <div class="modal" role="dialog" aria-modal="true" aria-label="Anteile ändern" style="max-width: 600px">
      <div class="modal-header">
        <h3>
          {#if activeSubModal === 'item'}Eigentumsanteile ändern: {subModalData.item.name}{/if}
          {#if activeSubModal === 'special-transfer'}Alle Anteile an eine Person übertragen{/if}
          {#if activeSubModal === 'special-remove'}Alle Anteile einer Person entfernen{/if}
          {#if activeSubModal === 'special-add'}Person an allen Gegenständen beteiligen{/if}
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
          if (activeSubModal === 'item') { if (upsertChange(subModalData.item.id, subModalData.shares)) activeSubModal = null; }
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
  .financial-help-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .financial-help-heading strong{font-size:13px}
  .workflow-help{display:flex;justify-content:flex-end}
</style>
