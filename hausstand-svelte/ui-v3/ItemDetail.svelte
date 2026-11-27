<script>
  import { itemDisplayName } from '../src/lib/itemNames.js';
  import CompactNames from './CompactNames.svelte';
  import { locale } from '../src/lib/i18n.js';
  import { itemPeople } from '../src/lib/overviewNames.js';
  import { translate } from '../src/lib/i18n.js';
  import { appState, ledger } from '../src/stores/projectStore.js';
  import { money, pct } from '../src/lib/domain.js';
  import { label as valuationLabel } from '../src/lib/valuation.js';
  import { dateDE } from '../src/lib/util.js';
  import { recordedContributions } from '../src/lib/purchaseFinancing.js';
  import { purchaseBreakdown } from '../src/lib/ledger.js';
  import PurchaseBreakdown from './PurchaseBreakdown.svelte';
  import Timeline from './Timeline.svelte';
  import ActionIcon from '../src/components/ActionIcon.svelte';
  export let item;
  $: itemClaims = ($ledger.claims || []).filter(claim => claim.itemId === item.id);
  $: fundingEvents = ($appState.project.events || []).filter(event =>
    event.type === 'item-added' && event.itemId === item.id && event.date <= $appState.asOfDate &&
    event.financialMode === 'derived' && recordedContributions(event));
  $: purchaseIds = new Set(fundingEvents.map(event => event.id));
  $: transferClaims = itemClaims.filter(claim => !purchaseIds.has(claim.sourceEventId));
  $: names = new Map($appState.project.people.map(p => [p.id,p.name]));
  $: personName = id => names.get(id) || id;
</script>

<section class="panel">
  <div class="panel-body">
    <div class="detail-hero">
      <div class="stack">
        <div class="detail-title">
          <h2>{itemDisplayName(item)}</h2>
          {#if item.status !== 'active'}<span class="item-status-text">{$translate("ui.no-longer-owned-2uva14")}</span>{/if}
        </div>
        {#if item.tags?.length}<p class="item-categories">{item.tags.join(' · ')}</p>{/if}
        {#if item.note}<p class="item-description">{item.note}</p>{/if}
        <div class="grid-2 item-core-facts">
          <div class="mini-card"><div class="muted">{$translate("ui.value-opx6hb")}</div><strong>{money(item.value)}</strong></div>
          <div class="mini-card"><div class="muted">{$translate("ui.owners-1df2egp")}</div><strong>{item.shareRows.length}</strong></div>
        </div>
        <CompactNames entries={itemPeople(item, fundingEvents, $appState.project.people, $locale)}/>
        <div class="valuation-detail">
          <strong>{$translate("ui.valuation-13jfos6")}:</strong> {valuationLabel(item.runtime.valuation)}
        </div>
      </div>
      <div class="secondary-actions" role="group" aria-label={$translate("ui.moreActions")}>
        <div class="action-grid">
          <button on:click={() => appState.setDialog({ type: 'itemMeta', itemId: item.id })}><ActionIcon name="edit" size={17}/>{$translate("ui.edit-item-birsg")}</button>
          <button on:click={() => appState.setDialog({ type: 'itemEnd', itemId: item.id })}><ActionIcon name="archive" size={17}/>{$translate("ui.archive-qlwwpx")}</button>
          <button on:click={() => appState.setDialog({ type: 'itemContinue', itemId: item.id })}><ActionIcon name="plus" size={17}/>{$translate('items.replace')}</button>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="grid-2" style="margin-top:16px">
  <section class="panel">
    <div class="panel-header ownership-header">
      <h2>{$translate("ui.who-owns-what-16guwgm")}</h2>
      <button class="outline-action" on:click={() => appState.setDialog({ type: 'shareSet', itemId: item.id })}><ActionIcon name="arrows" size={17}/>{$translate("ui.change-ownership-shares-1x7cqup")}</button>
    </div>
    <div class="panel-body">
      {#if item.shareRows.length}
        <table>
          <thead>
            <tr><th>{$translate("ui.person-1i84mn4")}</th><th class="right">{$translate("ui.units-1xtsz9u")}</th><th class="right">{$translate("ui.percent-1yxgj4j")}</th><th class="money">{$translate("ui.share-value-169kov6")}</th></tr>
          </thead>
          <tbody>
            {#each item.shareRows as row}
              <tr>
                <td>{row.personName}{#if !row.active} <span class="muted">{$translate("ui.inactive-1om8jzu")}</span>{/if}</td>
                <td class="right">{row.units}</td>
                <td class="right">{pct(row.fraction)}</td>
                <td class="money">{money(row.value)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <div class="empty">{$translate("ui.no-shares-1ttxgf1")}</div>
      {/if}
    </div>
  </section>

  <section class="panel">
    <Timeline project={$appState.project} asOfDate={$appState.asOfDate} itemId={item.id} title={$translate("ui.changes-to-this-item-sq1px7")} />
  </section>
</section>

<section class="panel" style="margin-top:16px">
  <div class="panel-header"><div class="help-heading"><h2>{$translate("ui.financing-amp-settlement-gbf737")}</h2></div></div>
  <div class="panel-body stack">
    {#each fundingEvents as event (event.id)}
      <div class="stack">
        <strong>{$translate('purchase.original')} · {dateDE(event.date)} · {money(event.initialValue)}</strong>
        <PurchaseBreakdown rows={purchaseBreakdown(Math.round(event.initialValue*100), event.shares, recordedContributions(event))} {personName}/>
        {#if itemClaims.some(claim => claim.sourceEventId === event.id)}
          <strong>{$translate('purchase.purchaseHistory')}</strong>
          {#each itemClaims.filter(claim => claim.sourceEventId === event.id) as claim}
            <span>{$translate('items.purchaseClaimRow',{debtor:personName(claim.debtorPersonId),creditor:personName(claim.creditorPersonId),amount:money(claim.amountCents/100)})}</span>
          {/each}
        {/if}
      </div>
    {/each}
    <strong>{$translate('purchase.later')}</strong>
    {#if transferClaims.length}
      <div style="overflow-x:auto">
        <table class="tight">
          <thead><tr><th>{$translate("ui.date-o4j91o")}</th><th>{$translate("ui.value-given-up-by-1bmqwa8")}</th><th>{$translate("ui.value-received-by-1h70mou")}</th><th class="money">{$translate("ui.value-opx6hb")}</th></tr></thead>
          <tbody>
            {#each transferClaims as claim, index (claim.sourceEventId + ':' + index)}
              <tr><td>{dateDE(claim.date)}</td><td>{personName(claim.creditorPersonId)}</td><td>{personName(claim.debtorPersonId)}</td><td class="money">{money(claim.amountCents / 100)}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="muted">{$translate('purchase.noLater')}</div>
    {/if}
    <p class="muted">{$translate('purchase.historyNote')}</p>
  </div>
</section>

<style>
  .action-grid button{display:inline-flex;align-items:center;justify-content:center;gap:8px}
  .help-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .item-status-text{color:var(--muted);font-size:12px}
  .item-core-facts{margin:0}
  .valuation-detail{font-size:12px;color:var(--muted)}
  .secondary-actions{align-self:start;min-width:0}
  .secondary-actions .action-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))}
  .secondary-actions button{min-height:44px;white-space:normal}
  .ownership-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .ownership-header .outline-action{display:inline-flex;gap:8px;align-items:center}
  .item-categories,.item-description{margin:0;color:var(--muted);font-size:12px;line-height:1.55}
</style>
