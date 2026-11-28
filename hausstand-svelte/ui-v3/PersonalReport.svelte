<script>
  import { locale } from '../src/lib/i18n.js';
  import { reportCopy, assetLines, paymentLines, reportMoney, openPersonalReport } from '../src/lib/personalReportPrint.js';
  import { downloadPersonalReport } from '../src/lib/personalReportPdf.js';
  export let report;
  export let dirty = false;
  $: t = reportCopy($locale);
  let blocked = false;
  let generating = false;
  let failed = false;
  async function downloadReport() {
    if (generating) return;
    generating = true;
    failed = false;
    try { await downloadPersonalReport(report, $locale, dirty); }
    catch { failed = true; }
    finally { generating = false; }
  }
  function printReport() {
    blocked = !openPersonalReport(report, $locale, dirty);
  }
</script>
{#if report}
<section class="panel personal-report" style="margin-top:16px">
  <div class="panel-header"><h2>{t.title}</h2><div class="report-actions"><button class="primary" type="button" disabled={generating} on:click={downloadReport}>{generating ? t.generating : t.download}</button><button type="button" on:click={printReport}>{t.print}</button></div></div>
  <div class="panel-body stack">
    {#if failed}<p role="alert">{t.pdfError}</p>{/if}
    {#if blocked}<p role="alert">{t.blocked}</p>{/if}
    {#if dirty}<p class="context-note">{t.dirty}</p>{/if}
    {#if report.incomplete}<p role="alert">{t.incomplete}</p>{/if}
    <p class="context-note">{t.note}</p>
    <h3>{t.assets}</h3>
    <table><tbody>{#each assetLines as [key, sign]}<tr><th scope="row">{t[key]}</th><td class="money">{reportMoney(sign * report.totals[key], $locale)}</td></tr>{/each}</tbody></table>
    <h3>{t.payments}</h3>
    <table><tbody>
      {#each paymentLines as [key, sign]}<tr><th scope="row">{t[key]}</th><td class="money">{reportMoney(sign * report.finance[key], $locale)}</td></tr>{/each}
      {#each ['balance','receivables','liabilities'] as key}<tr><th scope="row">{t[key]}</th><td class="money"><strong>{reportMoney(report[key], $locale)}</strong></td></tr>{/each}
    </tbody></table>
  </div>
</section>
{/if}
<style>
  .personal-report .panel-header{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
  .report-actions{display:flex;gap:8px;flex-wrap:wrap}
  .personal-report th{text-align:left;font-weight:400;white-space:normal}
  .personal-report td{white-space:nowrap}
</style>
