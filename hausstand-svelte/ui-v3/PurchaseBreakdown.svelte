<script>
  import { translate } from '../src/lib/i18n.js';
  import { money } from '../src/lib/domain.js';
  export let rows = [];
  export let personName;
  const signed = cents => (cents > 0 ? '+' : '') + money(cents / 100);
</script>
<div class="purchase-breakdown">
  <table class="tight">
    <thead><tr><th>{$translate('purchase.personColumn')}</th><th class="money">{$translate('purchase.funded')}</th><th class="money">{$translate('purchase.ownershipValue')}</th><th class="money">{$translate('purchase.difference')}</th></tr></thead>
    <tbody>
      {#each rows as row (row.personId)}
        <tr data-person={row.personId}><td>{personName(row.personId)}</td><td class="money">{money(row.fundedCents / 100)}</td><td class="money">{money(row.ownershipCents / 100)}</td><td class="money">{signed(row.balanceCents)}</td></tr>
      {/each}
    </tbody>
  </table>
</div>
<p class="purchase-explanation">{$translate('purchase.differenceHelp')}</p>
{#if rows.length && rows.every(row => row.balanceCents === 0)}
  <p class="purchase-balanced">{$translate('purchase.balanced')}</p>
{/if}
<style>
  .purchase-breakdown{overflow-x:auto;max-width:100%;min-width:0}
  .purchase-breakdown table{width:100%;font-size:12px}
  .purchase-breakdown th,.purchase-breakdown td{padding:6px 4px}
  .purchase-breakdown th{white-space:normal}
  .purchase-breakdown td:first-child{overflow-wrap:anywhere}
  .purchase-explanation,.purchase-balanced{margin:0;font-size:12px;line-height:1.5}
  .purchase-explanation{color:var(--muted)}
</style>
