<script>
  import { translate, formatPercent } from '../src/lib/i18n.js';
  import { normShares, shareTotal } from '../src/lib/domain.js';
  import NumericDraftInput from './NumericDraftInput.svelte';
  import { parseShareInput } from './form-behavior.js';
  import { addPurchaseOwner, removePurchaseOwner } from './purchase-owners.js';
  export let people=[];
  export let shares={};
  $: selected=Object.entries(shares);
  $: available=people.filter(p=>p.active!==false&&!Object.hasOwn(shares,p.id));
  $: total=shareTotal(normShares(shares));
  function change(id,value){shares={...shares,[id]:value};}
  function add(event){
    shares=addPurchaseOwner(shares,event.currentTarget.value,people);
    event.currentTarget.value='';
  }
</script>
<section class="purchase-owner-list">
  <div class="owner-heading"><strong>{$translate('purchase.ownerTitle')}</strong>
    {#if Object.keys(normShares(shares)).length>1}<button type="button" class="small" on:click={()=>shares=Object.fromEntries(Object.keys(normShares(shares)).map(id=>[id,1]))}>{$translate('items.equalShares')}</button>{/if}
  </div>
  {#if selected.length}
    <div class="owner-row owner-columns" aria-hidden="true"><span>{$translate('purchase.personColumn')}</span><span>{$translate('purchase.unitsColumn')}</span><span>%</span><span></span></div>
    {#each selected as [id,units] (id)}
      {@const person=people.find(p=>p.id===id)}
      <div class="owner-row purchase-person-row" data-person={id}>
        <span class="share-person-name">{person?.name||id}{#if !person||person.active===false}<small class="unavailable">{$translate('purchase.ownerUnavailable')}</small>{/if}</span>
        <NumericDraftInput inputClass="purchase-units" label={(person?.name||id)+' – '+$translate('ui.units-1xtsz9u')} value={units} parse={parseShareInput} onValue={value=>change(id,value)}/>
        <small class="share-percent">{formatPercent(total>0?Math.max(0,Number(units)||0)/total:0)}</small>
        <button type="button" class="remove-owner small" aria-label={$translate('purchase.removeOwner',{name:person?.name||id})} on:click={()=>shares=removePurchaseOwner(shares,id)}>×</button>
      </div>
    {/each}
    <small>{$translate('purchase.totalUnits',{units:total})}</small>
  {:else}
    <p class="muted">{$translate('purchase.noOwners')}</p>
  {/if}
  {#if available.length}
    <label>{$translate('purchase.addOwner')}
      <select class="purchase-owner-select" on:change={add}>
        <option value="">{$translate('purchase.choose')}</option>
        {#each available as person (person.id)}<option value={person.id}>{person.name}</option>{/each}
      </select>
    </label>
  {:else if !selected.length}
    <p class="muted">{$translate('purchase.noEligibleOwners')}</p>
  {/if}
</section>
<style>
  .purchase-owner-list{display:grid;gap:6px;min-width:0}
  .owner-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
  .owner-row{display:grid;grid-template-columns:minmax(0,1fr) 64px 46px 36px;align-items:center;gap:5px}
  .owner-row :global(input){width:100%;min-width:0;padding:5px}
  .owner-row .share-person-name{overflow-wrap:anywhere;min-width:0;font-size:13px}
  .owner-row .share-percent{text-align:right;font-size:12px}
  .owner-columns{font-size:11px;color:var(--muted)}
  .remove-owner{min-height:36px;padding:2px;color:var(--danger)}
  .unavailable{display:block;color:var(--warn)}
  .purchase-owner-list p{margin:0}
  @media(max-width:380px){.owner-row{grid-template-columns:minmax(0,1fr) 48px 40px 32px;gap:4px}}
</style>
