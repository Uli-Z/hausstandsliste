<script>
  import NumericDraftInput from './NumericDraftInput.svelte';
  import PurchaseOwners from './PurchaseOwners.svelte';
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
  let mode = editing || contributions ? 'individual' : 'single';
  let payer = '';
  let individualDraft = contributions ? {...contributions} : null;
  $: tablePeople = ownerPeople ? people.map(p => ({...p,active:ownerPeople.find(o=>o.id===p.id)?.active ?? false}))
    .filter(p=>editing || p.active || Object.hasOwn(shares,p.id) || Object.hasOwn(individualDraft || {},p.id) || p.id===payer) : people;
  // Independent mode state. The active contribution map is a projection; it
  // never becomes the source of the other mode's manually edited amounts.
  $: contributions = mode === 'individual' ? individualDraft :
    (payer && people.some(p => p.id === payer) && Number.isSafeInteger(amountCents) && amountCents >= 0
      ? {[payer]:amountCents} : null);
  $: total = contributionTotal(contributions);
  $: valid = !contributionProblem(amountCents, contributions, new Set(people.map(p=>p.id)));
  function selectMode(next) {
    if (next === mode) return;
    if (next === 'individual' && individualDraft === null) {
      const owners = Object.fromEntries(eligible.filter(p=>shares[p.id]>0).map(p=>[p.id,1]));
      individualDraft = Number.isSafeInteger(amountCents) && amountCents >= 0 ? allocateCents(amountCents, owners) : {};
    }
    mode = next;
  }
  function parseContribution(raw) {
    const amount = raw.trim() === '' ? NaN : parseDecimal(raw);
    return validMoney(amount) ? Math.round(amount*100) : NaN;
  }
  function change(id, cents) {
    const next = {...(individualDraft || {}), [id]:cents};
    if (!editing && cents === 0 && !eligible.some(p=>p.id===id)) delete next[id];
    individualDraft = next;
  }
  const displayContribution = cents => Number.isFinite(cents) ? String(cents/100) : '';
</script>
<section class="stack item-financing-field">
  {#if !editing}
    <div class="purchase-payment-mode">
    <label>{$translate('purchase.mode')}
      <select class="purchase-mode" value={mode} on:change={e=>selectMode(e.currentTarget.value)}>
        <option value="single">{$translate('purchase.single')}</option>
        <option value="individual">{$translate('purchase.individual')}</option>
      </select>
    </label>
    {#if mode === 'single'}
    <label>{$translate('purchase.payer')}
      <select class="purchase-payer" bind:value={payer}>
        <option value="">{$translate('purchase.choose')}</option>
        {#if payer && !eligible.some(p=>p.id===payer)}<option value={payer}>{people.find(p=>p.id===payer)?.name || payer}</option>{/if}
        {#each eligible as person (person.id)}<option value={person.id}>{person.name}</option>{/each}
      </select>
    </label>
    {/if}
    </div>
  {/if}
  <PurchaseOwners people={tablePeople} bind:shares individual={mode === 'individual'} keepFunding={editing || individualDraft !== null} {editing}>
    <svelte:fragment slot="amount" let:personId let:personName>
      <NumericDraftInput inputClass="purchase-contribution" label={personName} description={$translate('purchase.paidColumn')}
        value={individualDraft && Object.hasOwn(individualDraft,personId) ? individualDraft[personId] : 0}
        display={displayContribution} parse={parseContribution} onValue={cents=>change(personId,cents)} />
    </svelte:fragment>
  </PurchaseOwners>
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
  @media(max-width:540px){.purchase-payment-mode{grid-template-columns:minmax(0,1fr)}:global(.purchase-contribution){font-size:13px}}
  .financing-total,.item-financing-field .notice{margin:0;font-size:13px}
  .item-financing-field .notice{padding:7px 9px}
</style>
