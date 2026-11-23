<script>
  import { translate, localizeGermanText } from '../src/lib/i18n.js';
  import { appState } from '../src/stores/projectStore.js';
  import { REDISTRIBUTION_SUGGESTION_TITLE, REDISTRIBUTION_SUGGESTION_NOTICE } from '../src/lib/financialLabels.js';
  import HelpTip from '../src/components/HelpTip.svelte';
  import { money, normShares, shareTotal } from '../src/lib/domain.js';
  import { redistributionPreview, redistributionMarkdown, buildRedistributionItemRows, sharesEqual } from '../src/lib/redistribution.js';
  import ShareEditor from './ShareEditor.svelte';
  import { isEnterForSubmit } from './form-behavior.js';
  import RedistributionItemList from '../src/components/RedistributionItemList.svelte';
  import { clone, dateDE } from '../src/lib/util.js';
  
  export let dialog;
  export let project;
  export let projection;

  $: event = project.events.find(e => e.id === dialog.eventId);
  let edited = null;

  $: if (event && !edited) {
    edited = clone(event);
    if (!edited.financialMode) edited.financialMode = 'none';
  }

  // Für die Vorschau brauchen wir ein temporäres Redistribution-Objekt
  $: redistributionForPreview = edited ? {
    id: edited.id,
    title: edited.title,
    effectiveDate: edited.date,
    financialMode: edited.financialMode,
    changes: (edited.events || []).filter(e => e.type === 'shares-set').map(e => ({
      itemId: e.itemId,
      shares: e.shares
    }))
  } : null;

  // A07: Die Historienvorschau muss am bearbeiteten Datum exakt VOR diesem
  // Ereignis stoppen, auch wenn am selben Tag weitere Änderungen folgen.
  $: preview = redistributionForPreview
    ? redistributionPreview(project, redistributionForPreview, { beforeEventId: edited.id, order: edited.order })
    : { rows: [], payments: [] };

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
      if (shareTotal(clean) <= 0) {
        alert($translate("ui.an-active-item-must-have-at-least--1wzqqo1"));
        return;
      }
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

  function confirmFromInput(event) {
    if (!isEnterForSubmit(event)) return;
    event.preventDefault();
    if (editingChildId) saveChild();
    else save();
  }

  function save() {
    const saved = appState.mutateProject(p => {
      const idx = p.events.findIndex(e => e.id === edited.id);
      if (idx >= 0) p.events[idx] = { ...edited };
    });
    if (saved) appState.closeDialog();
  }

  function remove() {
    if (!confirm($translate("ui.delete-the-entire-redistribution-k464tv"))) return;
    const saved = appState.mutateProject(p => {
      p.events = p.events.filter(e => e.id !== event.id);
    });
    if (saved) appState.closeDialog();
  }

  $: people = preview.base?.people || projection.people;
  $: itemRows = preview.base
    ? buildRedistributionItemRows(preview.base, redistributionForPreview?.changes || [], (edited?.events || []).map(child => child.itemId))
    : [];

  function copyMarkdown() {
    const md = redistributionMarkdown(redistributionForPreview, preview);
    navigator.clipboard.writeText(md).then(() => alert('Markdown in Zwischenablage kopiert.'));
  }
</script>

<div class="modal-backdrop">
  <div class="modal large-modal" role="dialog" aria-modal="true" aria-label={$translate("ui.edit-ownership-change-1tqsrir")} on:keydown={confirmFromInput}>
    <div class="modal-header">
      <div class="stack">
        <h3>{$translate("ui.edit-earlier-ownership-change-s1489d")}</h3>
        <div class="muted">{$translate('redistribution.since')} {dateDE(edited?.date)}</div>
      </div>
      <button class="ghost" on:click={() => appState.closeDialog()}>✕</button>
    </div>
    <div class="modal-body grid-redistribution">
      {#if edited}
        <div class="stack content-left">
          <section class="mini-card stack">
            <div class="grid-2">
              <label>{$translate("ui.title-2r13zr")} <input bind:value={edited.title}></label>
              <label>{$translate("ui.date-o4j91o")} <input type="date" bind:value={edited.date}></label>
              <label>{$translate("ui.should-financial-claims-arise-qd7qky")}
                <select bind:value={edited.financialMode}>
                  <option value="derived">{$translate("ui.yes-recalculate-claims-1o04vr5")}</option>
                  <option value="none">{$translate("ui.no-gift-or-correction-dim67p")}</option>
                </select>
              </label>
              <div class="financial-mode-help"><HelpTip label={$translate("ui.what-does-paid-ownership-mean")}>{$translate("ui.paid-ownership-explained")}</HelpTip></div>
            </div>
          </section>

          <section class="stack" style="flex: 1; overflow: hidden;">
            <div class="split">
              <strong>{$translate("ui.affected-items-1nc8pe3")}</strong>
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
              <strong>{$translate("ui.effect-of-the-change-13xavst")}</strong>
              <button class="small ghost" on:click={copyMarkdown}>{$translate("ui.copy-markdown-pb2l7m")}</button>
            </div>
            <div class="stack">
              <div class="muted">{$translate("ui.change-in-ownership-value-132omm0")}</div>
              {#if preview.rows.length}
                <table class="tight">
                  <tbody>
                    {#each preview.rows as row}
                      <tr><td>{row.personName}</td><td class="money" class:positive={row.delta > 0} class:negative={row.delta < 0}>{row.delta >= 0 ? '+' : ''}{money(row.delta)}</td></tr>
                    {/each}
                  </tbody>
                </table>
              {:else}
                <div class="empty-small">{$translate("ui.no-transfer-of-value-awxg5c")}</div>
              {/if}

              <div class="financial-help-heading"><strong>{edited.financialMode === 'derived' ? 'Ausgleichsvorschlag' : 'Kein Ausgleich'}</strong><HelpTip label={$translate("ui.what-is-the-financial-effect-of-thi-g85db9")}>{localizeGermanText(REDISTRIBUTION_SUGGESTION_TITLE)} {localizeGermanText(REDISTRIBUTION_SUGGESTION_NOTICE)}</HelpTip></div>
              {#if preview.payments.length}
                <table class="tight">
                  <tbody>
                    {#each preview.payments as p}
                      <tr><td>{p.from} → {p.to}</td><td class="money">{money(p.amount)}</td></tr>
                    {/each}
                  </tbody>
                </table>
                
              {:else}
                <div class="notice-small">{edited.financialMode === 'derived' ? $translate("ui.no-settlement-suggested-utyl3l") : 'Unentgeltlich – kein Ausgleich.'}</div>
              {/if}
            </div>
          </section>

          {#if editingChildId}
            <section class="mini-card stack">
              <div class="split">
                <strong>{$translate("ui.change-ownership-shares-1x7cqup")}</strong>
                <button class="small danger" on:click={() => removeChild(editingChildId)}>{$translate("ui.remove-change-1lq0vel")}</button>
              </div>
              <div class="muted">{itemRows.find(row => row.itemId === activeEditedChild?.itemId)?.itemName || activeEditedChild?.itemId}</div>
              <ShareEditor {people} bind:shares={editedChildShares} />
              <div class="row" style="justify-content: flex-end; gap:8px">
                <button on:click={() => editingChildId = null}>{$translate("ui.cancel-cl4zc9")}</button>
                <button class="primary" on:click={saveChild}>{$translate("ui.apply-ltxt64")}</button>
              </div>
            </section>
          {/if}
        </div>
      {/if}
    </div>
    <div class="modal-footer">
      <button class="danger" on:click={remove}>{$translate("ui.delete-ownership-change-ei8m7d")}</button>
      <div style="flex:1"></div>
      <button on:click={() => appState.closeDialog()}>{$translate("ui.cancel-cl4zc9")}</button>
      <button class="primary" on:click={save}>{$translate("ui.save-change-1pvx2yb")}</button>
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
  .financial-help-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .financial-help-heading strong{font-size:13px}
  .workflow-help{display:flex;justify-content:flex-end}
</style>
