<script>
  import { translate } from '../src/lib/i18n.js';
  import { money } from '../src/lib/domain.js';
  import { validMoney } from '../src/lib/util.js';
  import { allocateCents } from '../src/lib/ledger.js';
  import { contributionProblem, contributionTotal } from '../src/lib/purchaseFinancing.js';
  export let people = [];
  export let shares = {};
  export let amountCents = 0;
  export let contributions = null;
  export let valid = false;
  export let editing = false;
  let mode = editing || contributions ? 'individual' : 'single';
  let payer = '';
  $: if (mode === 'single' && !editing) {
    contributions = payer && people.some(p => p.id === payer) && Number.isSafeInteger(amountCents) && amountCents >= 0
      ? {[payer]:amountCents} : null;
  }
  $: total = contributionTotal(contributions);
  $: valid = !contributionProblem(amountCents, contributions, new Set(people.map(p=>p.id)));
  function selectMode(next) {
    if (next === mode) return;
    mode = next;
    if (next === 'individual') {
      const owners = Object.fromEntries(people.filter(p=>shares[p.id]>0).map(p=>[p.id,1]));
      contributions = allocateCents(amountCents, owners);
    }
  }
  function change(id, raw) {
    const amount = raw === '' ? NaN : Number(raw);
    contributions = {...(contributions || {}), [id]:validMoney(amount) ? Math.round(amount*100) : NaN};
  }
</script>
<section class="stack item-financing-field">
  <strong>{$translate('purchase.financing')}</strong>
  {#if !editing}
    <label>{$translate('purchase.mode')}
      <select value={mode} on:change={e=>selectMode(e.currentTarget.value)}>
        <option value="single">{$translate('purchase.single')}</option>
        <option value="individual">{$translate('purchase.individual')}</option>
      </select>
    </label>
  {/if}
  {#if mode === 'single'}
    <label>{$translate('purchase.payer')}
      <select bind:value={payer}>
        <option value="">{$translate('purchase.choose')}</option>
        {#each people as person (person.id)}<option value={person.id}>{person.name}</option>{/each}
      </select>
    </label>
  {:else}
    {#each people as person (person.id)}
      <label class="contribution-row">{person.name}
        <input type="number" min="0" step="0.01" inputmode="decimal"
          value={Number.isFinite(contributions?.[person.id]) ? contributions[person.id]/100 : contributions && Object.hasOwn(contributions,person.id) ? '' : 0}
          on:input={e=>change(person.id,e.currentTarget.value)} />
      </label>
    {/each}
    {#if !contributions}<p class="notice warn">{$translate('purchase.unknown')}</p>{/if}
  {/if}
  {#if Number.isFinite(total)}<p class="financing-total">{$translate('purchase.total',{paid:money(total/100),price:money(amountCents/100)})}</p>{/if}
  {#if !valid}
    <p class="notice warn" role="alert">
      {#if Number.isFinite(total) && Number.isFinite(amountCents) && total !== amountCents}
        {$translate(total < amountCents ? 'purchase.missing' : 'purchase.excess',{amount:money(Math.abs(total-amountCents)/100)})}
      {:else}{$translate('errors.invalidPurchaseContributions')}{/if}
    </p>
  {/if}
</section>

<style>
  .item-financing-field{gap:7px;min-width:0;border-top:1px solid var(--border);padding-top:9px}
  .contribution-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(90px,42%);align-items:center;gap:8px;overflow-wrap:anywhere}
  .contribution-row input{min-width:0}
  .financing-total,.item-financing-field .notice{margin:0;font-size:13px}
  .item-financing-field .notice{padding:7px 9px}
</style>
