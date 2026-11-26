<script>
  import NumericDraftInput from './NumericDraftInput.svelte';
  import ShareEditor from './ShareEditor.svelte';
  import { translate, parseDecimal } from '../src/lib/i18n.js';
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
  export let ownerPeople = null;
  $: eligible = editing ? people : (ownerPeople || people).filter(p=>p.active !== false);
  $: tablePeople = ownerPeople ? people.map(p => ({...p,active:ownerPeople.find(o=>o.id===p.id)?.active ?? false}))
    .filter(p=>editing || p.active || Object.hasOwn(shares,p.id) || Object.hasOwn(contributions || {},p.id)) : people;
  let mode = editing || contributions ? 'individual' : 'single';
  let payer = '';
  let individualDraft = contributions ? {...contributions} : null;
  $: if (mode === 'single' && !editing) {
    contributions = payer && eligible.some(p => p.id === payer) && Number.isSafeInteger(amountCents) && amountCents >= 0
      ? {[payer]:amountCents} : null;
  }
  $: total = contributionTotal(contributions);
  $: valid = !contributionProblem(amountCents, contributions, new Set(eligible.map(p=>p.id)));
  function selectMode(next) {
    if (next === mode) return;
    if (mode === 'individual') individualDraft = {...(contributions || {})};
    mode = next;
    if (next === 'individual') {
      const owners = Object.fromEntries(eligible.filter(p=>shares[p.id]>0).map(p=>[p.id,1]));
      contributions = individualDraft ? {...individualDraft} :
        (Number.isSafeInteger(amountCents) && amountCents >= 0 ? allocateCents(amountCents, owners) : {});
    }
  }
  function parseContribution(raw) {
    const amount = raw.trim() === '' ? NaN : parseDecimal(raw);
    return validMoney(amount) ? Math.round(amount*100) : NaN;
  }
  function change(id, cents) {
    const next = {...(contributions || {}), [id]:cents};
    if (!editing && cents === 0 && !eligible.some(p=>p.id===id)) delete next[id];
    contributions = next;
  }
  const displayContribution = cents => Number.isFinite(cents) ? String(cents/100) : '';
</script>
<section class="stack item-financing-field">
  {#if !editing}
    <div class="purchase-payment-mode">
    <label>{$translate('purchase.mode')}
      <select value={mode} on:change={e=>selectMode(e.currentTarget.value)}>
        <option value="single">{$translate('purchase.single')}</option>
        <option value="individual">{$translate('purchase.individual')}</option>
      </select>
    </label>
    {#if mode === 'single'}
    <label>{$translate('purchase.payer')}
      <select bind:value={payer}>
        <option value="">{$translate('purchase.choose')}</option>
        {#each eligible as person (person.id)}<option value={person.id}>{person.name}</option>{/each}
      </select>
    </label>
    {/if}
    </div>
  {/if}
  <ShareEditor people={tablePeople} bind:shares allPeople={true} showAmounts={true} allowEqualize={!editing}>
    <svelte:fragment slot="amount" let:personId let:personName>
      {#if mode === 'individual'}
        <NumericDraftInput inputClass="purchase-contribution" label={personName} description={$translate('purchase.paidColumn')}
          value={contributions && Object.hasOwn(contributions,personId) ? contributions[personId] : 0}
          display={displayContribution} parse={parseContribution} onValue={cents=>change(personId,cents)} />
      {:else}
        <span class="purchase-paid-text">{money((contributions?.[personId] ?? 0)/100)}</span>
      {/if}
    </svelte:fragment>
  </ShareEditor>
  {#if mode === 'individual' && !contributions}<p class="notice warn">{$translate('purchase.unknown')}</p>{/if}
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
  .purchase-payment-mode{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-items:end}
  .purchase-payment-mode label{min-width:0}
  .purchase-payment-mode select{min-width:0}
  :global(.purchase-contribution){min-width:0;width:100%;padding:5px}
  .purchase-paid-text{text-align:right;font-size:12px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
  @media(max-width:540px){.purchase-payment-mode{grid-template-columns:minmax(0,1fr)}:global(.purchase-contribution){font-size:13px}.purchase-paid-text{font-size:11px}}
  .financing-total,.item-financing-field .notice{margin:0;font-size:13px}
  .item-financing-field .notice{padding:7px 9px}
</style>
