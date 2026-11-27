<script>
  import { valueCurve } from '../src/lib/valueCurve.js';
  import { translate, locale, formatMoney, formatDate } from '../src/lib/i18n.js';
  export let runtime;
  export let asOfDate;
  export let currentCents;
  export let knownEnd = null;
  $: curve=valueCurve(runtime,asOfDate,currentCents,knownEnd);
</script>
{#if curve}
  <figure class="value-curve">
    <figcaption><strong>{$translate('items.curveTitle')}</strong><span>{$translate('items.curveModel')}</span></figcaption>
    <div class="curve-scale">{formatMoney(curve.maxCents/100,$locale)}</div>
    <svg viewBox="0 0 480 154" role="img" aria-label={$translate('items.curveAccessible',{date:formatDate(asOfDate,$locale),value:formatMoney(currentCents/100,$locale)})}>
      <line x1="38" y1="22" x2="38" y2="132" class="axis"/>
      <line x1="38" y1="132" x2="452" y2="132" class="axis"/>
      {#if curve.minCents>0}<line x1="38" y1={curve.minimumY} x2={curve.ending?.x??452} y2={curve.minimumY} class="minimum"/>{/if}
      {#if curve.pastPath}<path d={curve.pastPath} class="model-line"/>{/if}
      {#if curve.futurePath}<path d={curve.futurePath} class="model-line future-line"/>{/if}
      {#if curve.ending}
        <line x1={curve.ending.x} y1="22" x2={curve.ending.x} y2="132" class="ending-line"/>
        <rect x={curve.ending.x-3} y="129" width="6" height="6" class="ending-point"/>
      {/if}
      <line x1={curve.marker.x} y1="22" x2={curve.marker.x} y2="132" class="date-line"/>
      <circle cx={curve.marker.x} cy={curve.marker.y} r="5" class="date-point"/>
    </svg>
    <div class="curve-zero">{formatMoney(0,$locale)}</div>
    <div class="curve-dates"><span>{formatDate(curve.startDate,$locale)}</span><span>{formatDate(curve.endDate,$locale)}</span></div>
    <div class="curve-legend">
      <span><i class="dot"></i>{formatDate(asOfDate,$locale)} · {formatMoney(currentCents/100,$locale)}</span>
      {#if curve.futurePath}<span><i class="dash"></i>{$translate('items.curveFuture')}</span>{/if}
      {#if curve.minCents>0}<span><i class="min-dash"></i>{$translate('items.minimumValue')} · {formatMoney(curve.minCents/100,$locale)}</span>{/if}
      {#if curve.ending}<span><i class="end-square"></i>{$translate('items.endDate')} · {formatDate(curve.ending.date,$locale)}</span>{/if}
    </div>
  </figure>
{/if}
<style>
  .value-curve{margin:0;min-width:0;position:relative}
  figcaption{display:grid;gap:2px;font-size:14px}
  figcaption span,.curve-dates,.curve-scale,.curve-zero,.curve-legend{font-size:11px;color:var(--muted)}
  svg{display:block;width:100%;height:auto;max-height:190px;overflow:visible}
  .axis{stroke:var(--border);stroke-width:1}
  .model-line{stroke:var(--accent);fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
  .future-line{stroke-dasharray:5 5}
  .minimum{stroke:var(--muted);stroke-dasharray:3 4;opacity:.65}
  .date-line{stroke:var(--accent);stroke-dasharray:2 4;opacity:.65}
  .date-point{fill:var(--accent);stroke:var(--panel);stroke-width:1.5}
  .ending-line{stroke:var(--muted);stroke-dasharray:2 4}
  .ending-point{fill:var(--muted)}
  .curve-scale{margin-top:8px}.curve-zero{margin-top:-4px}.curve-dates{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
  .curve-legend{display:flex;flex-wrap:wrap;gap:5px 13px;margin-top:8px}
  .curve-legend span{display:inline-flex;align-items:center;gap:5px}
  i{display:inline-block;width:12px;flex:none}
  .dot{width:8px;height:8px;border-radius:50%;background:var(--accent)}
  .dash,.min-dash{border-top:2px dashed var(--accent)}
  .min-dash{border-color:var(--muted)}
  .end-square{width:7px;height:7px;background:var(--muted)}
</style>
