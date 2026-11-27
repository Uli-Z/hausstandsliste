<script>
  import { translate, formatPercent } from '../src/lib/i18n.js';
  import { normShares, shareTotal } from '../src/lib/domain.js';
  import NumericDraftInput from './NumericDraftInput.svelte';
  import { parseShareInput } from './form-behavior.js';
  import { addPurchaseOwner, removePurchaseOwner } from './purchase-owners.js';
  export let people=[];
  export let shares={};
  export let individual=false;
  export let keepFunding=false;
  $: selected=Object.entries(shares);
  // Keep keyed rows mounted across payment modes, including incomplete input
  // text. The first single-payer view still starts with an empty owner list.
  $: rows=keepFunding ? [...people.map(p=>p.id),...Object.keys(shares).filter(id=>!people.some(p=>p.id===id))] : Object.keys(shares);
  $: available=people.filter(p=>p.active!==false&&!Object.hasOwn(shares,p.id));
  $: total=shareTotal(normShares(shares));
  function change(id,value){shares={...shares,[id]:value};}
  function add(event){
    shares=addPurchaseOwner(shares,event.currentTarget.value,people);
    event.currentTarget.value='';
  }
</script>
<section class="purchase-owner-list" class:individual>
  <div class="owner-heading"><strong>{$translate(individual?'purchase.people':'purchase.ownerTitle')}</strong>
    {#if Object.keys(normShares(shares)).length>1}<button type="button" class="small" on:click={()=>shares=Object.fromEntries(Object.keys(normShares(shares)).map(id=>[id,1]))}>{$translate('items.equalShares')}</button>{/if}
  </div>
  {#if individual || selected.length}
    <div class="owner-row owner-columns" aria-hidden="true"><span>{$translate('purchase.personColumn')}</span><span>{$translate('purchase.unitsColumn')}</span><span>%</span><span>{individual?$translate('purchase.paidColumn'):''}</span></div>
  {/if}
  {#each rows as id (id)}
    {@const person=people.find(p=>p.id===id)}
    {@const units=Object.hasOwn(shares,id)?shares[id]:0}
    <div class="owner-row purchase-person-row" data-person={id} hidden={!individual&&!Object.hasOwn(shares,id)}>
      <span class="share-person-name">{person?.name||id}{#if !person||person.active===false}<small class="unavailable">{$translate('purchase.ownerUnavailable')}</small>{/if}</span>
      <NumericDraftInput inputClass="purchase-units" label={(person?.name||id)+' – '+$translate('ui.units-1xtsz9u')} value={units} parse={parseShareInput} onValue={value=>change(id,value)}
        disabled={person?.active===false&&!Object.hasOwn(shares,id)}/>
      <small class="share-percent">{formatPercent(total>0?Math.max(0,Number(units)||0)/total:0)}</small>
      {#if keepFunding}
        <div class="owner-payment" hidden={!individual}><slot name="amount" personId={id} personName={person?.name||id}/></div>
      {/if}
      {#if !individual}
        <button type="button" class="remove-owner small" aria-label={$translate('purchase.removeOwner',{name:person?.name||id})} on:click={()=>shares=removePurchaseOwner(shares,id)}>×</button>
      {/if}
    </div>
  {/each}
  {#if individual}
    <small>{$translate('purchase.zeroShares')}</small>
  {/if}
  {#if individual || selected.length}
    <small>{$translate('purchase.totalUnits',{units:total})}</small>
  {:else}
    <p class="muted">{$translate('purchase.noOwners')}</p>
  {/if}
  {#if !individual && available.length}
    <label>{$translate('purchase.addOwner')}
      <select class="purchase-owner-select" on:change={add}>
        <option value="">{$translate('purchase.choose')}</option>
        {#each available as person (person.id)}<option value={person.id}>{person.name}</option>{/each}
      </select>
    </label>
  {:else if !rows.length}
    <p class="muted">{$translate('purchase.noEligibleOwners')}</p>
  {/if}
</section>
<style>
  .purchase-owner-list{display:grid;gap:6px;min-width:0}
  .owner-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
  .owner-row{display:grid;grid-template-columns:minmax(0,1fr) 64px 46px 36px;align-items:center;gap:5px}
  .individual .owner-row{grid-template-columns:minmax(0,1fr) minmax(48px,82px) minmax(38px,58px) minmax(70px,115px)}
  .owner-row[hidden],.owner-payment[hidden]{display:none}
  .owner-payment{min-width:0}
  .owner-row :global(input){width:100%;min-width:0;padding:5px}
  .owner-row .share-person-name{overflow-wrap:anywhere;min-width:0;font-size:13px}
  .owner-row .share-percent{text-align:right;font-size:12px}
  .owner-columns{font-size:11px;color:var(--muted)}
  .remove-owner{min-height:36px;padding:2px;color:var(--danger)}
  .unavailable{display:block;color:var(--warn)}
  .purchase-owner-list p{margin:0}
  @media(max-width:540px){.individual .owner-row{grid-template-columns:minmax(0,1fr) 50px 38px 76px;gap:4px}.owner-columns{overflow-wrap:anywhere}.owner-row .share-percent{font-size:10px}}
  @media(max-width:380px){.owner-row{grid-template-columns:minmax(0,1fr) 48px 40px 32px;gap:4px}.individual .owner-row{grid-template-columns:minmax(0,1fr) 44px 35px 68px}}
</style>
