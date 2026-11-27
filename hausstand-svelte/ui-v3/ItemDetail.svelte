<script>
  import { itemDisplayName } from '../src/lib/itemNames.js';
  import ItemValueCurve from './ItemValueCurve.svelte';
  import { locale, formatDate, formatMoney } from '../src/lib/i18n.js';
  import { translate } from '../src/lib/i18n.js';
  import { appState, ledger } from '../src/stores/projectStore.js';
  import { money, pct } from '../src/lib/domain.js';
  import { dateDE } from '../src/lib/util.js';
  import { recordedContributions } from '../src/lib/purchaseFinancing.js';
  import { purchaseBreakdown } from '../src/lib/ledger.js';
  import PurchaseBreakdown from './PurchaseBreakdown.svelte';
  import Timeline from './Timeline.svelte';
  import ActionIcon from '../src/components/ActionIcon.svelte';
  export let item;
  $: rule = item.runtime.valuation || {};
  $: knownEnd = ($appState.project.events || []).filter(e=>e.type==='item-ended' && e.itemId===item.id && e.date>=item.runtime.date).map(e=>e.date).sort()[0] || null;
  $: itemClaims = ($ledger.claims || []).filter(claim => claim.itemId === item.id);
  $: fundingEvents = ($appState.project.events || []).filter(event =>
    event.type === 'item-added' && event.itemId === item.id && event.date <= $appState.asOfDate &&
    event.financialMode === 'derived' && recordedContributions(event));
  $: purchaseIds = new Set(fundingEvents.map(event => event.id));
  $: transferClaims = itemClaims.filter(claim => !purchaseIds.has(claim.sourceEventId));
  $: names = new Map($appState.project.people.map(p => [p.id,p.name]));
  $: personName = id => names.get(id) || id;
</script>

<section class="panel item-overview">
  <div class="panel-body">
    <div class="detail-title">
      <h2>{itemDisplayName(item)}</h2>
      {#if item.status !== 'active'}<span class="item-status-text">{$translate("ui.no-longer-owned-2uva14")}</span>{/if}
    </div>
    <div class="detail-hero item-summary-layout">
      <div class="stack">
        <div class="item-core-facts">
          <div><span>{$translate('items.startValue')}</span><strong data-item-start-value>{formatMoney(item.runtime.initialValue,$locale)}</strong></div>
          <div><span>{$translate('items.currentValue')}</span><strong data-item-current-value>{formatMoney(item.value,$locale)}</strong><small>{formatDate($appState.asOfDate,$locale)}</small></div>
        </div>
        <dl class="valuation-detail">
          <div><dt>{$translate('items.startDate')}</dt><dd>{formatDate(item.runtime.date,$locale)}</dd></div>
          <div><dt>{$translate('ui.valuation-13jfos6')}</dt><dd>{rule.type==='linear'?$translate('valuation.linear',{years:rule.durationYears}):rule.type==='degressive'?$translate('valuation.degressive',{rate:Math.round((rule.annualRate||0)*1000)/10}):$translate('valuation.fixed')}</dd></div>
          <div><dt>{$translate('items.minimumValue')}</dt><dd>{formatMoney(rule.minimumValue||0,$locale)}</dd></div>
          {#if item.runtime.endedAt}<div><dt>{$translate('items.endDate')}</dt><dd>{formatDate(item.runtime.endedAt,$locale)}{#if item.runtime.endReason} · {item.runtime.endReason}{/if}</dd></div>{/if}
          {#if item.tags?.length}<div><dt>{$translate('ui.categories-2lwhku')}</dt><dd>{item.tags.join(' · ')}</dd></div>{/if}
          {#if item.note}<div><dt>{$translate('ui.note-86vuh')}</dt><dd class="item-description">{item.note}</dd></div>{/if}
        </dl>
      </div>
      <ItemValueCurve runtime={item.runtime} asOfDate={$appState.asOfDate} currentCents={item.valueCents} {knownEnd}/>
    </div>
    <div class="secondary-actions" role="group" aria-label={$translate("ui.moreActions")}>
      <div class="action-grid">
        <button class="outline-action" on:click={() => appState.setDialog({ type: 'itemMeta', itemId: item.id })}><ActionIcon name="edit" size={17}/>{$translate("ui.edit-item-birsg")}</button>
        {#if item.status === 'active'}
          <button class="outline-action" on:click={() => appState.setDialog({ type: 'itemContinue', itemId: item.id })}><ActionIcon name="arrows" size={17}/>{$translate('items.replace')}</button>
          <button class="item-end-action" on:click={() => appState.setDialog({ type: 'itemEnd', itemId: item.id })}><ActionIcon name="archive" size={17}/>{$translate("ui.archive-qlwwpx")}</button>
        {/if}
      </div>
    </div>
  </div>
</section>

<section class="grid-2" style="margin-top:16px">
  <section class="panel">
    <div class="panel-header ownership-header">
      <h2>{$translate("ui.who-owns-what-16guwgm")}</h2>
      {#if item.status === 'active'}<button class="outline-action" on:click={() => appState.setDialog({ type: 'shareSet', itemId: item.id })}><ActionIcon name="arrows" size={17}/>{$translate("ui.change-ownership-shares-1x7cqup")}</button>{/if}
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
  .item-overview .panel-body{overflow:hidden}
  .item-overview .detail-title{margin-bottom:16px}
  .item-summary-layout{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px}
  .item-summary-layout>*{min-width:0}
  .item-status-text{color:var(--muted);font-size:12px}
  .item-core-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .item-core-facts>div{display:grid;align-content:start;gap:3px;min-width:0}
  .item-core-facts span,.item-core-facts small{font-size:12px;color:var(--muted)}
  .item-core-facts strong{font-size:clamp(18px,2.7vw,28px);font-variant-numeric:tabular-nums;letter-spacing:-.035em;overflow-wrap:anywhere}
  .valuation-detail{margin:0;display:grid;gap:7px;font-size:13px}
  .valuation-detail>div{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:8px}
  .valuation-detail dt{color:var(--muted)}
  .valuation-detail dd{margin:0;min-width:0;overflow-wrap:anywhere}
  .item-description{white-space:pre-wrap}
  .secondary-actions{margin-top:20px;padding-top:12px;border-top:1px solid var(--border)}
  .secondary-actions .action-grid{display:flex;flex-wrap:wrap;gap:8px}
  .action-grid button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:44px;white-space:normal;font-size:13px}
  .item-end-action{background:transparent;color:var(--danger);border-color:var(--border)}
  .help-heading,.ownership-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .ownership-header .outline-action{display:inline-flex;gap:8px;align-items:center}
  @media(max-width:800px){.item-summary-layout{grid-template-columns:minmax(0,1fr);gap:18px}}
  @media(max-width:420px){.secondary-actions .action-grid button{flex:1 1 130px}}
</style>
