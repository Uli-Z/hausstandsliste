<script>
  import { translate } from '../src/lib/i18n.js';
  import { appState } from '../src/stores/projectStore.js';
    import HelpTip from '../src/components/HelpTip.svelte';
  import ActionIcon from '../src/components/ActionIcon.svelte';
  import { money, normShares, shareTotal } from '../src/lib/domain.js';
  import { 
    redistributionPreview, 
    buildRedistributionItemRows,
    buildTransferChanges, 
    buildRemovePersonChanges, 
    soleOwnedItems, 
    buildAddPersonChanges,
    sharesEqual
  } from '../src/lib/redistribution.js';
  import ShareEditor from './ShareEditor.svelte';
  import { validShareMap } from '../src/lib/shareUnits.js';
  import { isEnterForSubmit } from './form-behavior.js';
  import RedistributionItemList from '../src/components/RedistributionItemList.svelte';
  import { uid, clone, nextEventOrder } from '../src/lib/util.js';
  import { executeRedistribution } from '../src/lib/itemMutations.js';
  import { validCalendarDate } from '../src/lib/timeTravel.js';
  
  export let dialog;
  export let project;
  export let projection;

  // Lokale Arbeitskopie
  let redistribution = clone(dialog.redistribution || (project.drafts || []).find(d => d.id === dialog.id));
  // Old saved drafts remain financially neutral until explicitly enabled.
  if (redistribution && !redistribution.financialMode) redistribution.financialMode = 'none';
  
  $: preview = redistribution ? redistributionPreview(project, redistribution) : { base: null, rows: [], payments: [] };
  
  $: people = preview.base?.people || projection.people;
  $: dateValid = validCalendarDate(redistribution?.effectiveDate);
  // Existing draft changes must still refer to owned items at the chosen date.
  $: invalidItems = (redistribution?.changes || []).filter(change =>
    !preview.base?.activeItems.some(item => item.id === change.itemId));
  $: canExecute = dateValid && !invalidItems.length && !!redistribution?.changes?.length;
  $: itemsAtDate = preview.base?.activeItems || [];
  $: itemRows = preview.base ? buildRedistributionItemRows(preview.base, redistribution.changes || []) : [];

  let filterText = "";

  // Sub-Modals
  let activeSubModal = null; // 'item', 'special-transfer', 'special-remove', 'special-add'
  let subModalData = {};

  function upsertChange(itemId, shares) {
    if (!validShareMap(shares)) { alert($translate('forms.invalidShares')); return false; }
    const clean = normShares(shares);
    if (shareTotal(clean) <= 0) {
      alert($translate("ui.an-active-item-needs-at-least-one--na47gt"));
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
        alert($translate('dialog.lastOwners', { items: blocked.map(item => item.name).join(', ') }));
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
    if (canExecute) execute();
  }

  function saveAsDraft() {
    if (!dateValid) return;
    if (appState.upsertDraft(redistribution)) appState.closeDialog();
  }

  function execute() {
    if (!canExecute) return;
    if (!confirm($translate("ui.apply-this-redistribution-now-kiu6zk"))) return;
    const saved = appState.mutateProject(p => executeRedistribution(p, redistribution));
    if (saved) appState.closeDialog();
  }
</script>

<div class="modal-backdrop">
  <div class="modal large-modal" role="dialog" aria-modal="true" aria-label={$translate("app.transfer")} on:keydown={confirmFromInput}>
    <div class="modal-header">
      <h3>{$translate("ui.transfer-or-redistribute-shares-1u1uj43")}</h3>
      <button type="button" class="ghost" on:click={() => appState.closeDialog()} aria-label={$translate("ui.close-1qnddid")}>✕</button>
    </div>
    
    <div class="modal-body grid-redistribution">
      <div class="stack content-left">
        <section class="redistribution-main-fields">
          <label>{$translate('timeTravel.effectiveDate')}
            <input id="redistribution-effective-date" type="date" bind:value={redistribution.effectiveDate}/>
          </label>
          <label>{$translate("ui.should-financial-claims-arise-qd7qky")}
            <select bind:value={redistribution.financialMode}>
              <option value="derived">{$translate("ui.yes-calculate-claims-automatically-1jigawo")}</option>
              <option value="none">{$translate("ui.no-gift-or-correction-dim67p")}</option>
            </select>
          </label>
        </section>
        {#if !dateValid}<p role="alert" class="notice warn">{$translate('timeTravel.invalidDate')}</p>{/if}
        {#if invalidItems.length}<p role="alert" class="notice warn">{$translate('timeTravel.itemsUnavailable')}</p>{/if}
        <section class="redistribution-items">
          <div class="split redistribution-item-heading">
            <strong>{$translate("ui.select-items-and-edit-shares-1wul31y")}</strong>
            {#if itemRows.length > 4 || filterText}
              <input type="search" placeholder={$translate('items.search')} aria-label={$translate('items.searchLabel')} bind:value={filterText} class="small-input"/>
            {/if}
          </div>
          <RedistributionItemList rows={itemRows} {filterText} emptyLabel={$translate('redistribution.noItems')}
            on:select={(event) => {
              const item = itemsAtDate.find(entry => entry.id === event.detail.row.itemId);
              if (item) openItemEdit(item);
            }}
          />
        </section>
        <section class="redistribution-advanced" aria-label={$translate('redistribution.moreActions')}>
          <div class="stack">
            <label>{$translate("ui.description-kc1lkc")}
              <input bind:value={redistribution.title} placeholder={$translate('redistribution.titleExample')}>
            </label>
            <div class="redistribution-bulk-actions">
              <button class="small" on:click={() => { activeSubModal = 'special-transfer'; subModalData = { sourceId: dialog.sourcePersonId || '', targetId: '' }; }}>{$translate("ui.transfer-all-shares-to-one-person-m0ednu")}</button>
              <button class="small" on:click={() => { activeSubModal = 'special-remove'; subModalData = { sourceId: dialog.sourcePersonId || '' }; }}>{$translate("ui.remove-a-person-s-shares-from-all-i-1eiw9j2")}</button>
              <button class="small" on:click={() => { activeSubModal = 'special-add'; subModalData = { targetId: '', units: 1 }; }}>{$translate("ui.give-a-person-shares-in-all-items-9usel9")}</button>
            </div>
          </div>
        </section>
      </div>

      <div class="stack content-right">
        <section class="redistribution-preview">
          <div class="help-heading">
            <strong>{$translate("ui.effect-of-the-change-13xavst")}</strong>
            <HelpTip label={$translate("ui.what-does-paid-ownership-mean")}>{$translate("ui.paid-ownership-explained")}</HelpTip>
          </div>
          {#if redistribution?.changes?.length}
            {#if preview.rows.length}
              <div class="muted">{$translate("ui.change-in-ownership-value-132omm0")}</div>
              <table class="tight">
                <tbody>
                  {#each preview.rows as row}
                    <tr><td>{row.personName}</td><td class="money" class:positive={row.delta > 0} class:negative={row.delta < 0}>{row.delta >= 0 ? '+' : ''}{money(row.delta)}</td></tr>
                  {/each}
                </tbody>
              </table>
            {:else}
              <p class="muted">{$translate("ui.no-transfer-of-value-awxg5c")}</p>
            {/if}
            <strong>{$translate('redistribution.claimEffect')}</strong>
            {#if preview.payments.length}
              <table class="tight">
                <tbody>
                  {#each preview.payments as p}
                    <tr><td>{p.from} → {p.to}</td><td class="money">{money(p.amount)}</td></tr>
                  {/each}
                </tbody>
              </table>
            {:else}
              <p class="muted">{redistribution.financialMode === 'derived' ? $translate("ui.no-settlement-suggested-utyl3l") : $translate('redistribution.withoutClaims')}</p>
            {/if}
            <p class="redistribution-notice">{$translate('redistribution.noPaymentRecorded')}</p>
          {:else}
            <p class="muted">{$translate('redistribution.selectItemFirst')}</p>
          {/if}
        </section>
      </div>
    </div>

    <div class="modal-footer">
      <button on:click={() => appState.closeDialog()}>{$translate("ui.cancel-cl4zc9")}</button>
      <div style="flex:1"></div>
      <button on:click={saveAsDraft} disabled={!dateValid || $appState.readOnly}><ActionIcon name="download" size={17}/>{$translate("ui.save-as-draft-sz9zgy")}</button>
      <button class="primary" on:click={execute} disabled={!canExecute || $appState.readOnly}>{$translate("ui.apply-changes-7tqg8a")}</button>
    </div>
  </div>
</div>

<!-- Sub-Modals -->
{#if activeSubModal}
  <div class="modal-backdrop sub-modal">
    <div class="modal" role="dialog" aria-modal="true" aria-label={$translate("items.change")} style="max-width: 600px">
      <div class="modal-header">
        <h3>
          {#if activeSubModal === 'item'}{$translate('dialog.editItemShares', { name: subModalData.item.name })}{/if}
          {#if activeSubModal === 'special-transfer'}{$translate('ui.transfer-all-shares-to-one-person-m0ednu')}{/if}
          {#if activeSubModal === 'special-remove'}{$translate('ui.remove-a-person-s-shares-from-all-i-1eiw9j2')}{/if}
          {#if activeSubModal === 'special-add'}{$translate('dialog.addToAll')}{/if}
        </h3>
      </div>
      <div class="modal-body stack">
        {#if activeSubModal === 'item'}
          <div class="grid-2">
            <div class="stack">
              <div class="muted">{$translate("ui.before-qdpwf0")}</div>
              {#each Object.entries(subModalData.item.shares) as [pid, u]}
                <div class="small-text">{people.find(p=>p.id===pid)?.name || pid}: {u}</div>
              {/each}
            </div>
            <div class="stack">
              <div class="muted">{$translate("ui.after-121v6a3")}</div>
              <ShareEditor {people} bind:shares={subModalData.shares} />
            </div>
          </div>
        {:else if activeSubModal === 'special-transfer'}
          <div class="form-grid">
            <label>{$translate("ui.from-person-1iellgp")} <select bind:value={subModalData.sourceId}><option value="">{$translate("ui.choose-1h2n4nz")}</option>{#each people as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
            <label>{$translate("ui.to-person-ufc7mo")} <select bind:value={subModalData.targetId}><option value="">{$translate("ui.choose-1h2n4nz")}</option>{#each people as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
          </div>
        {:else if activeSubModal === 'special-remove'}
          <label>{$translate("ui.remove-person-s3vc87")} <select bind:value={subModalData.sourceId}><option value="">{$translate("ui.choose-1h2n4nz")}</option>{#each people as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
        {:else if activeSubModal === 'special-add'}
          <div class="form-grid">
            <label>{$translate("ui.person-to-add-4m6xic")} <select bind:value={subModalData.targetId}><option value="">{$translate("ui.choose-1h2n4nz")}</option>{#each people as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
            <label>{$translate("ui.units-1xtsz9u")} <input type="number" step="1" bind:value={subModalData.units}></label>
          </div>
        {/if}
      </div>
      <div class="modal-footer">
        <button on:click={() => activeSubModal = null}>{$translate("ui.cancel-cl4zc9")}</button>
        <button class="primary" on:click={() => {
          if (activeSubModal === 'item') { if (upsertChange(subModalData.item.id, subModalData.shares)) activeSubModal = null; }
          else applySpecial();
        }}>{$translate("ui.apply-opxyc3")}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-footer button{display:inline-flex;align-items:center;justify-content:center;gap:7px}
  .large-modal{width:min(95vw,1000px);max-height:90vh;height:auto;display:grid;grid-template-rows:auto minmax(0,1fr) auto}
  .grid-redistribution{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(260px,.8fr);gap:18px;overflow:auto;align-items:start;min-height:0}
  .content-left,.content-right{min-width:0}
  .redistribution-main-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr);gap:12px}
  .redistribution-items{display:grid;gap:10px;min-width:0}
  .redistribution-item-heading{align-items:center;flex-wrap:wrap}
  .redistribution-item-heading .small-input{min-width:150px;max-width:210px}
  .redistribution-advanced{border-top:1px solid var(--border);padding-top:10px}
  .redistribution-advanced>.stack{gap:8px}
  .redistribution-bulk-actions{display:flex;gap:8px;flex-wrap:wrap}
  .redistribution-bulk-actions>button{white-space:normal;text-align:left}
  .redistribution-preview{display:grid;gap:10px;border:1px solid var(--border);border-radius:12px;padding:14px;min-width:0}
  .redistribution-preview p{margin:0;line-height:1.55}
  .redistribution-preview table{width:100%}
  .redistribution-notice{font-size:12px;color:var(--muted)}
  .small-text{font-size:.85rem}
  .small-input{padding:6px 9px;border-radius:8px;border:1px solid var(--border);font-size:.88rem}
  .tight td{padding:5px 0}
  .positive{color:var(--ok)}
  .negative{color:var(--warn)}
  .sub-modal{z-index:100}
  .financial-help-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .help-heading{display:flex;align-items:center;gap:8px}
  @media(max-width:820px){
    .grid-redistribution{grid-template-columns:minmax(0,1fr)}
    .redistribution-main-fields{grid-template-columns:minmax(0,1fr)}
    .large-modal{max-height:94vh}
  }
</style>
