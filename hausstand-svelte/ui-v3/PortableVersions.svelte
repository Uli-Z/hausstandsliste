<script>
  import { appState } from '../src/stores/projectStore.js';
  import { getVersionEntries, readPortableVersion, withoutHistory } from '../src/lib/versionHistory.js';
  import { projectAt } from '../src/lib/projector.js';
  import { ledgerAt } from '../src/lib/ledger.js';
  import { todayISO } from '../src/lib/util.js';
  import { translate, locale, formatMoney, localizeDiagnostic } from '../src/lib/i18n.js';
  import { notifications } from '../src/lib/notifications.js';

  export let busy = false;
  let selected = '', snapshot = null, source = null, loading = false, error = '', request = 0;
  let asOfDate = todayISO();
  $: entries = [...getVersionEntries($appState.project)].reverse();
  // Never restore a preview from an earlier project or from before a checkout refresh.
  $: if (source && source !== $appState.project) clear();
  $: projected = snapshot ? projectAt(snapshot, asOfDate) : null;
  $: balances = snapshot ? ledgerAt(snapshot, asOfDate).balances : null;

  function clear() {
    request++; selected = ''; snapshot = null; source = null; error = ''; loading = false;
  }
  function savedLabel(entry, language) {
    const date = new Date(entry.savedAt || '');
    return Number.isFinite(date.getTime()) ? date.toLocaleString(language === 'de' ? 'de-DE' : 'en-GB') : $translate('ui.previous-version-date-unknown-1cpadmd');
  }
  async function previewVersion(id) {
    clear();
    if (!id) return;
    selected = id; source = $appState.project;
    const project = source, sequence = request;
    loading = true;
    try {
      const decoded = await readPortableVersion(project, id);
      if (sequence !== request || project !== $appState.project) return;
      snapshot = decoded;
      // Projected values use the local calendar day on which this file was saved,
      // not the live app's time-travel state. The preview date is independently editable.
      const date = new Date(entries.find(entry => entry.id === id)?.savedAt || '');
      asOfDate = Number.isFinite(date.getTime()) ? todayISO(date) : todayISO();
    } catch (e) {
      if (sequence === request) error = localizeDiagnostic(e.message);
    } finally { if (sequence === request) loading = false; }
  }
  function restore() {
    if (!snapshot || loading || busy || $appState.activeDialog || source !== $appState.project || $appState.readOnly) return;
    if (!confirm($translate($appState.dirty ? 'versions.confirmDirty' : 'versions.confirm'))) return;
    // The central store retains the current archive/baseline and resets the
    // session undo stack. Explicit local/online save is still required.
    appState.restoreVersion(snapshot);
    clear();
    notifications.notify($translate('ui.previous-state-loaded-it-becomes-a-mzgam7'), {kind:'success'});
  }
</script>

<section class="ux-panel storage-versions" aria-label={$translate('storage.earlierVersions')}>
  <h2>{$translate('storage.earlierVersions')}</h2>
  <p class="muted">{$translate('versions.explanation')}</p>
  {#if !entries.length}
    <p class="muted">{$translate('versions.empty')}</p>
  {:else}
    <label>{$translate('ui.select-a-saved-version-1mfrevx')}
      <select value={selected} disabled={busy} on:change={e => previewVersion(e.currentTarget.value)}>
        <option value="">{$translate('ui.please-select-1qm0osl')}</option>
        {#each entries as entry (entry.id)}
          <option value={entry.id}>{savedLabel(entry, $locale)}{entry.description ? ' · ' + entry.description : ''}</option>
        {/each}
      </select>
    </label>
    {#if loading}<p role="status">{$translate('versions.loading')}</p>{/if}
    {#if error}<p role="alert" class="inline-info warning">{error}</p>{/if}
    {#if snapshot && projected}
      <div class="version-preview" aria-label={$translate('versions.preview')}>
        <div class="version-preview-heading"><strong>{$translate('versions.preview')}</strong><button type="button" class="outline-action" on:click={clear}>{$translate('versions.close')}</button></div>
        <h3>{snapshot.community?.name}</h3>
        <label>{$translate('app.dateAsOf')}<input type="date" value={asOfDate} on:change={e => { if (e.currentTarget.value) asOfDate=e.currentTarget.value; }}/></label>
        <p>{$translate('app.totalValue')}: <strong>{formatMoney(projected.totalValue,$locale)}</strong></p>
        <h4>{$translate('nav.people')}</h4>
        <ul>{#each projected.people as person (person.id)}<li>{person.name} · {formatMoney((balances.get(person.id) || 0)/100,$locale)}{!person.active ? ' · ' + $translate('versions.inactive') : ''}</li>{/each}</ul>
        <h4>{$translate('nav.items')}</h4>
        <ul>{#each projected.items as item (item.id)}<li>{item.name} · {formatMoney(item.value,$locale)}{#if item.shareRows.length}<small>{item.shareRows.map(row => row.personName + ': ' + row.units).join(' · ')}</small>{/if}</li>{/each}</ul>
        <p class="muted">{$translate('versions.records', {events:snapshot.events.length,drafts:snapshot.drafts.length})}</p>
        <details><summary>{$translate('versions.data')}</summary><pre class="json-preview">{JSON.stringify(withoutHistory(snapshot),null,2)}</pre></details>
        {#if $appState.readOnly}<p class="muted">{$translate('versions.readOnly')}</p>{/if}
        {#if $appState.dirty}<p class="inline-info warning">{$translate('versions.dirty')}</p>{/if}
        <button type="button" class="outline-action" disabled={busy || $appState.readOnly || !!$appState.activeDialog || source !== $appState.project} on:click={restore}>{$translate('ui.restore-as-unsaved-working-copy-r3yheu')}</button>
      </div>
    {/if}
  {/if}
</section>

<style>
  .storage-versions{display:grid;gap:12px;min-width:0}
  .storage-versions h2,.storage-versions h3,.storage-versions h4,.storage-versions p{margin:0}
  .storage-versions label{display:grid;gap:6px;min-width:0}
  .storage-versions select,.storage-versions input{max-width:100%;min-width:0}
  .version-preview{display:grid;gap:12px;min-width:0;border-top:1px solid var(--border);padding-top:14px;overflow-wrap:anywhere}
  .version-preview-heading{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
  .version-preview ul{list-style:none;margin:0;padding:0;display:grid;gap:5px}
  .version-preview li{padding:5px 0;border-bottom:1px solid var(--border)}
  .version-preview small{display:block;color:var(--muted)}
  .version-preview pre{max-height:300px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}
</style>
