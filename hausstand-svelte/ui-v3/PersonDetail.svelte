<script>
  import CompactNames from './CompactNames.svelte';
  import { locale } from '../src/lib/i18n.js';
  import { rankedItems } from '../src/lib/overviewNames.js';
  import { translate, pluralMessage } from '../src/lib/i18n.js';
  import { appState } from '../src/stores/projectStore.js';
  import { money } from '../src/lib/domain.js';
  import { buildTransferChanges, buildRemovePersonChanges, soleOwnedItems } from '../src/lib/redistribution.js';
  import { dateDE } from '../src/lib/util.js';
  import Timeline from './Timeline.svelte';
  import BalanceBreakdown from '../src/components/BalanceBreakdown.svelte';
  import HelpTip from '../src/components/HelpTip.svelte';
  import ActionIcon from '../src/components/ActionIcon.svelte';
  export let person;
  export let projection;
  export let asOfDate;
  export let ledger = null;
  $: balanceCents = ledger?.balances?.get(person.id) || 0;
  $: balanceDetail = ledger?.details?.get(person.id) || null;
  $: transfersForPerson = (ledger?.simplified || []).filter(t => t.fromPersonId === person.id || t.toPersonId === person.id);
  const nameOf = id => $appState.project.people.find(p => p.id === id)?.name || id;
  let transferDialogOpen = false;
  let transferTargetId = '';

  $: activeTargets = (projection?.people || []).filter(p => p.active && String(p.id) !== String(person.id));

  function runTransfer(target) {
    if (!target) return;
    const changes = buildTransferChanges(projection,person.id,target.id);

    appState.startRedistribution(
      $translate('dialog.transferTitle', { from: person.name, to: target.name }),
      asOfDate,
      changes,
      { sourcePersonId: person.id, targetPersonId: target.id }
    );
  }

  function startDissolve() {
    if (!appState.requireEditing()) return;
    const blocked = soleOwnedItems(projection,person.id);
    if (blocked.length) {
      alert($translate('dialog.lastOwners',{items:blocked.map(item=>item.name).join(', ')}));
      return;
    }
    const changes = buildRemovePersonChanges(projection,person.id);
    appState.startRedistribution($translate('dialog.dissolveTitle', { name: person.name }), asOfDate, changes, { sourcePersonId: person.id, initialFinancialMode:'none' });
  }

  function startTransfer() {
    if (!appState.requireEditing()) return;
    if (!activeTargets.length) {
      alert($translate("ui.no-active-recipient-available-1ybrt33"));
      return;
    }
    if (activeTargets.length === 1) {
      runTransfer(activeTargets[0]);
      return;
    }
    transferTargetId = '';
    transferDialogOpen = true;
  }

  function confirmTransferTarget() {
    if (!appState.requireEditing()) return;
    const target = activeTargets.find(p => String(p.id) === String(transferTargetId));
    if (!target) return;
    transferDialogOpen = false;
    runTransfer(target);
  }
</script>
<section class="panel"><div class="panel-body">
  <div class="detail-hero">
    <div class="stack">
      <div class="detail-title"><h2>{person.name}</h2>{#if !person.active}<span class="person-inactive">{person.inactiveFrom ? $translate("people.moved") : $translate("people.inactive")}</span>{/if}</div>
      <div class="grid-2 person-core-facts">
        <div class="mini-card"><div class="muted">{balanceCents > 0 ? $translate("people.toReceive") : balanceCents < 0 ? $translate("people.toSettle") : $translate('balance.zero')}</div><strong>{money(Math.abs(balanceCents) / 100)}</strong></div>
        <div class="mini-card"><div class="muted">{$translate("ui.total-value-1bsjxfe")}</div><strong>{money(person.totalValue || 0)}</strong><small>{pluralMessage('people.itemCount', person.holdings?.length || 0)}</small></div>
      </div>
      <CompactNames entries={rankedItems((person.holdings || []).map(h => h.item), $locale)}/>
    </div>
    <div class="secondary-actions" role="group" aria-label={$translate("ui.moreActions")}>
      <div class="action-grid">
        {#if person.active}<button on:click={() => appState.setDialog({type:'personStatus', personId:person.id, kind:'deactivate'})}><ActionIcon name="archive" size={17}/>{$translate("ui.mark-as-moved-out-11arjl")}</button>{:else}<button on:click={() => appState.setDialog({type:'personStatus', personId:person.id, kind:'reactivate'})}><ActionIcon name="person-add" size={17}/>{$translate("ui.reactivate-iggdm2")}</button>{/if}
        <button on:click={() => appState.setDialog({ type: 'personMeta', personId: person.id })}><ActionIcon name="edit" size={17}/>{$translate("ui.edit-person-jstaod")}</button>
        <button disabled={!person.active || !person.holdings?.length} on:click={startTransfer}><ActionIcon name="arrows" size={17}/>{$translate("app.transfer")}</button>
        <button disabled={!person.active || !person.holdings?.length} on:click={startDissolve}><ActionIcon name="archive" size={17}/>{$translate("ui.remove-shares-5g2njo")}</button>
      </div>
    </div>
  </div>
</div></section>

{#if transfersForPerson.length}
  <section class="panel" style="margin-top:16px">
    <div class="panel-header"><div class="help-heading"><h2>{$translate("ui.settlement-options-1u5xuy7")}</h2><HelpTip label={$translate("ui.what-do-these-settlement-options-me-xd2ddh")}>{$translate("ui.these-are-potential-payment-routes--1gkcqar")}</HelpTip></div></div>
    <div class="panel-body stack">
      {#each transfersForPerson as transfer, index (transfer.fromPersonId + ':' + transfer.toPersonId + ':' + index)}
        <div class="split action-card">
          <span>{nameOf(transfer.fromPersonId)} → {nameOf(transfer.toPersonId)} · <strong>{money(transfer.amountCents / 100)}</strong></span>
          <button class="card-primary" type="button" on:click={() => appState.setDialog({ type: 'settlementAdd', payerPersonId: transfer.fromPersonId, recipientPersonId: transfer.toPersonId, amountCents: transfer.amountCents })}><ActionIcon name="wallet" size={17}/>{$translate("app.settle")}</button>
        </div>
      {/each}
    </div>
  </section>
{/if}
<section class="panel" style="margin-top:16px">
  <div class="panel-header"><div class="help-heading"><h2>{$translate("ui.balance-breakdown-kyjlab")}</h2><HelpTip label={$translate("ui.how-is-this-balance-calculated-n09gh")}>{$translate("ui.the-balance-comes-from-historical-p-1kuufew")}</HelpTip></div></div>
  <div class="panel-body">
    <BalanceBreakdown detail={balanceDetail} {balanceCents}/>
  </div>
</section>
<section class="grid-2" style="margin-top:16px">
  <section class="panel"><div class="panel-header"><h2>{$translate("ui.which-items-does-this-person-own-553tea")}</h2></div><div class="panel-body">
    {#if person.holdings?.length}<table><thead><tr><th>{$translate("ui.item-7uthuv")}</th><th class="right">{$translate("ui.units-1xtsz9u")}</th><th class="money">{$translate("ui.share-value-169kov6")}</th></tr></thead><tbody>{#each person.holdings as h}<tr class="clickable-row" on:click={() => appState.setRoute({ page: 'item', id: h.item.id })}><td>{h.item.name}</td><td class="right">{h.units}</td><td class="money">{money(h.value)}</td></tr>{/each}</tbody></table>{:else}<div class="empty">{$translate("ui.no-shares-at-the-selected-date-1hdgjmi")}</div>{/if}
  </div></section>
  <section class="panel">
    <Timeline project={$appState.project} asOfDate={$appState.asOfDate} personId={person.id} title={$translate("ui.changes-involving-this-person-1xmckgg")} />
  </section>
</section>

{#if transferDialogOpen}
  <div class="modal-backdrop">
    <div class="modal" style="max-width: 520px">
      <div class="modal-header">
        <h3>{$translate("app.transfer")}</h3>
        <button class="ghost" on:click={() => transferDialogOpen = false}>✕</button>
      </div>
      <div class="modal-body stack">
        {#if $appState.readOnly}<p role="alert" class="notice warn">{$translate('errors.readOnly')} {$appState.readOnlyReason}</p>{/if}
        <div>{$translate("ui.who-should-receive-all-shares-from-127tl3u")} <strong>{person.name}</strong> {$translate("ui.-1w10f1b")}</div>
        <label>{$translate("ui.recipient-1e4y0g0")}
          <select bind:value={transferTargetId}>
            <option value="">{$translate("ui.choose-1h2n4nz")}</option>
            {#each activeTargets as target}
              <option value={target.id}>{target.name}</option>
            {/each}
          </select>
        </label>
      </div>
      <div class="modal-footer">
        <button on:click={() => transferDialogOpen = false}>{$translate("ui.cancel-cl4zc9")}</button>
        <button class="primary" on:click={confirmTransferTarget} disabled={!transferTargetId || $appState.readOnly}>{$translate("ui.continue-bcvyff")}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .action-grid button{display:inline-flex;align-items:center;justify-content:center;gap:8px}
  .help-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .person-inactive { color:var(--muted);font-size:13px; }
  .person-core-facts{margin:0}
  .person-core-facts small{display:block;margin-top:6px;font-size:11px;color:var(--muted)}
  .secondary-actions{align-self:start;min-width:0}
  .secondary-actions .action-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))}
  .secondary-actions button{min-height:44px;white-space:normal}
</style>
