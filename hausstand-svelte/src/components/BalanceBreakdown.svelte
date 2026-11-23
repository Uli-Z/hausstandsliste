<script>
  import { translate } from '../lib/i18n.js';
  import { money } from '../lib/domain.js';
  export let detail = null;
  export let balanceCents = 0;
  const lines = [
    { key: 'fundedCents', label: 'Finanzierte Anschaffungen', sign: 1 },
    { key: 'initialSharesCents', label: 'Erhaltene Anteile beim Kauf', sign: -1 },
    { key: 'sharesGivenCents', label: 'Abgegebene Eigentumsanteile', sign: 1 },
    { key: 'sharesTakenCents', label: 'Übernommene Eigentumsanteile', sign: -1 },
    { key: 'paidCents', label: 'Geleistete Ausgleichszahlungen', sign: 1 },
    { key: 'receivedPaymentsCents', label: 'Erhaltene Ausgleichszahlungen', sign: -1 },
    { key: 'adjustmentsPlusCents', label: 'Sonstige Ausgleiche (Gutschrift)', sign: 1 },
    { key: 'adjustmentsMinusCents', label: 'Sonstige Ausgleiche (Belastung)', sign: -1 }
  ];
  $: visible = lines.filter(line => (detail?.[line.key] || 0) > 0);
</script>

<div class="balance-explanation">
  {#if visible.length}
    <dl class="balance-rows">
      {#each visible as line (line.key)}
        <div class="balance-row">
          <dt>{line.label}</dt>
          <dd>{line.sign > 0 ? '+' : '−'}{money((detail?.[line.key] || 0) / 100)}</dd>
        </div>
      {/each}
      <div class="balance-row balance-result">
        <dt>{balanceCents > 0 ? $translate("people.toReceive") : balanceCents < 0 ? $translate("people.toSettle") : 'Ausgeglichen'}</dt>
        <dd>{balanceCents > 0 ? '+' : balanceCents < 0 ? '−' : ''}{money(Math.abs(balanceCents) / 100)}</dd>
      </div>
    </dl>
  {:else}
    <p class="balance-footnote">{$translate("ui.no-financial-value-transfers-at-the-1uuqwnq")}</p>
  {/if}
</div>

<style>
  .balance-explanation { display:grid;gap:12px;min-width:0; }
  .balance-rows { display:grid;gap:0;margin:0; }
  .balance-row { display:flex;justify-content:space-between;gap:18px;align-items:baseline;padding:10px 0;border-bottom:1px solid var(--border);font-size:13px; }
  .balance-row dt { color:var(--muted);line-height:1.4; }
  .balance-row dd { margin:0;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:620; }
  .balance-result { border:0;padding-top:15px;font-size:15px; }
  .balance-result dt,.balance-result dd { color:var(--text);font-weight:760; }
  .balance-footnote { color:var(--muted);font-size:12px;line-height:1.55;margin:0; }
  @media(max-width:420px){ .balance-row{gap:8px}.balance-row dt{max-width:62%} }
</style>
