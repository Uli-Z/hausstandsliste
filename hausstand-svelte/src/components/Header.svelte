<script>
  import { appState } from '../stores/projectStore.js';
  import { addDays, eventDates, todayISO } from '../lib/util.js';
  import { downloadProject } from '../lib/persistence.js';
  $: dates = eventDates($appState.project);
  $: firstDate = dates[0] || null;
  $: lastDate = dates[dates.length - 1] || null;
  $: today = todayISO();
  $: dateStatus = $appState.asOfDate > today ? 'future' : $appState.asOfDate < today ? 'past' : 'today';
  $: dateStatusIcon = '⚠️';
  $: dateStatusMessage = dateStatus === 'future'
    ? 'Achtung: Stichtag liegt in der Zukunft'
    : dateStatus === 'past'
      ? 'Achtung: Stichtag liegt in der Vergangenheit'
      : '';

  async function importFile(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      appState.importProject(JSON.parse(await file.text()), file.name);
    } catch (err) {
      alert(`Importfehler: ${err.message}`);
    } finally {
      event.currentTarget.value = '';
    }
  }
  function exportNow() {
    downloadProject($appState.project, $appState.asOfDate);
    appState.markExported();
  }
</script>

<header>
  <div class="topbar">
    <div class="brand">
      <h1>🏠 Hausstand – Anteilsverwaltung</h1>
      <p>{$appState.project.community?.name || 'Hausgemeinschaft'} · {$appState.fileName || 'keine Datei geladen'} · {$appState.dirty ? 'ungespeicherte Änderungen' : 'gespeichert/exportiert'}</p>
    </div>

    <div class="datebar">
      <div class:future={dateStatus === 'future'} class:past={dateStatus === 'past'} class="date-controls">
        <button title="erstes Timeline-Ereignis" disabled={!firstDate} on:click={() => appState.setAsOfDate(firstDate)}>⏮️</button>
        <button title="1 Tag zurück" on:click={() => appState.setAsOfDate(addDays($appState.asOfDate, -1))}>◀️</button>
        <div class="date-input-group">
          <input type="date" value={$appState.asOfDate} on:change={e => appState.setAsOfDate(e.currentTarget.value || todayISO())}>
        </div>
        <button title="1 Tag vor" on:click={() => appState.setAsOfDate(addDays($appState.asOfDate, 1))}>▶️</button>
        <button title="letztes Timeline-Ereignis" disabled={!lastDate} on:click={() => appState.setAsOfDate(lastDate)}>⏭️</button>
        <button on:click={() => appState.setAsOfDate(todayISO())}>📍 Heute</button>
        {#if dateStatus !== 'today'}
          <span class="date-status-icon" title={dateStatusMessage} aria-label={dateStatusMessage} role="img">{dateStatusIcon}</span>
        {/if}
      </div>
    </div>

    <div class="rightbar">
      <button class="primary" on:click={exportNow}>💾 Exportieren</button>
      <label class="buttonish">📂 Öffnen <input type="file" accept="application/json,.json" style="display:none" on:change={importFile}></label>
    </div>
  </div>
</header>
