<script>
  import { translate } from '../src/lib/i18n.js';
  import { appState, ledger } from '../src/stores/projectStore.js';
  import { money, pct } from '../src/lib/domain.js';
  import { label as valuationLabel } from '../src/lib/valuation.js';
  import { dateDE } from '../src/lib/util.js';
  import Timeline from './Timeline.svelte';
  import HelpTip from '../src/components/HelpTip.svelte';
  import ActionIcon from '../src/components/ActionIcon.svelte';
  export let item;
  $: itemClaims = ($ledger.claims || []).filter(claim => claim.itemId === item.id);
  $: fundingEvents = ($appState.project.events || []).filter(event =>
    event.type === 'item-added' && event.itemId === item.id && event.date <= $appState.asOfDate &&
    event.financialMode === 'derived' && event.financedByPersonId);
  const personName = id => $appState.project.people.find(p => p.id === id)?.name || id;
</script>

<section class="panel">
  <div class="panel-body">
    <div class="detail-hero">
      <div class="stack">
        <div class="detail-title">
          <h2>{item.name}</h2>
          {#if item.status !== 'active'}<span class="item-status-text">{$translate("ui.no-longer-owned-2uva14")}</span>{/if}
        </div>
        {#if item.tags?.length}<p class="item-categories">{item.tags.join(' · ')}</p>{/if}
        {#if item.note}<p class="item-description">{item.note}</p>{/if}
        <div class="grid-2 item-core-facts">
          <div class="mini-card"><div class="muted">{$translate("ui.value-opx6hb")}</div><strong>{money(item.value)}</strong></div>
          <div class="mini-card"><div class="muted">{$translate("ui.owners-1df2egp")}</div><strong>{item.shareRows.length}</strong></div>
        </div>
        <details class="valuation-detail">
          <summary>{$translate("ui.valuation-13jfos6")}</summary>
          <div>{valuationLabel(item.runtime.valuation)}</div>
        </details>
      </div>
      <details class="secondary-actions">
        <summary>{$translate("ui.moreActions")}</summary>
        <div class="action-grid">
          <button disabled={$appState.readOnly} on:click={() => appState.setDialog({ type: 'itemMeta', itemId: item.id })}><ActionIcon name="edit" size={17}/>{$translate("ui.edit-item-birsg")}</button>
          <button disabled={$appState.readOnly} on:click={() => appState.setDialog({ type: 'itemEnd', itemId: item.id })}><ActionIcon name="archive" size={17}/>{$translate("ui.archive-qlwwpx")}</button>
          <button disabled={$appState.readOnly} on:click={() => appState.setDialog({ type: 'itemContinue', itemId: item.id })}><ActionIcon name="plus" size={17}/>{$translate('items.replace')}</button>
        </div>
      </details>
    </div>
  </div>
</section>

<section class="grid-2" style="margin-top:16px">
  <section class="panel">
    <div class="panel-header ownership-header">
      <h2>{$translate("ui.who-owns-what-16guwgm")}</h2>
      <button class="outline-action" disabled={$appState.readOnly} on:click={() => appState.setDialog({ type: 'shareSet', itemId: item.id })}><ActionIcon name="arrows" size={17}/>{$translate("ui.change-ownership-shares-1x7cqup")}</button>
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
  <div class="panel-header"><div class="help-heading"><h2>{$translate("ui.financing-amp-settlement-gbf737")}</h2><HelpTip label={$translate("ui.how-are-these-amounts-calculated-1c65kpc")}>{$translate("ui.this-shows-who-originally-financed--1psxqs5")}</HelpTip></div></div>
  <div class="panel-body stack">
    {#each fundingEvents as event (event.id)}
      <div class="funding-fact">
        <strong>{$translate("ui.contributed-at-purchase-rw2le5")}</strong>
        <span>{personName(event.financedByPersonId)} · {money(event.initialValue)} · {dateDE(event.date)}</span>
      </div>
    {/each}
    {#if itemClaims.length}
      <div style="overflow-x:auto">
        <table class="tight">
          <thead><tr><th>{$translate("ui.date-o4j91o")}</th><th>{$translate("ui.value-given-up-by-1bmqwa8")}</th><th>{$translate("ui.value-received-by-1h70mou")}</th><th class="money">{$translate("ui.value-opx6hb")}</th></tr></thead>
          <tbody>
            {#each itemClaims as claim, index (claim.sourceEventId + ':' + index)}
              <tr><td>{dateDE(claim.date)}</td><td>{personName(claim.creditorPersonId)}</td><td>{personName(claim.debtorPersonId)}</td><td class="money">{money(claim.amountCents / 100)}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="muted">{$translate("ui.no-financial-settlement-for-this-it-3rpwkf")}</div>
    {/if}
  </div>
</section>

<style>
  .action-grid button{display:inline-flex;align-items:center;justify-content:center;gap:8px}
  .help-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .item-status-text{color:var(--muted);font-size:12px}
  .item-core-facts{margin:0}
  .valuation-detail{font-size:12px;color:var(--muted)}
  .valuation-detail summary,.secondary-actions summary{cursor:pointer;min-height:44px;display:flex;align-items:center;color:#246f85;font-weight:650}
  .valuation-detail>div{padding:0 0 8px 14px}
  .secondary-actions{align-self:start}
  .secondary-actions .action-grid{padding:8px 0;display:grid;gap:8px}
  .ownership-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .ownership-header .outline-action{display:inline-flex;gap:8px;align-items:center}
  .funding-fact{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:13px;padding:10px 0;border-bottom:1px solid var(--border)}
  .funding-fact span{color:var(--muted)}
  .item-categories,.item-description{margin:0;color:var(--muted);font-size:12px;line-height:1.55}
</style>
