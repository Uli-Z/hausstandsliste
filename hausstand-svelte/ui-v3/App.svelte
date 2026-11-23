<script>
  import { onMount } from 'svelte';
  import { locale, languagePreference, setLanguage, translate } from '../src/lib/i18n.js';
  import { prepareDialogNumber, finishDialogNumber } from './form-behavior.js';
  import { appState, projection, ledger } from '../src/stores/projectStore.js';
  import { loadWorkingCopy, downloadProject, exportProject } from '../src/lib/persistence.js';
  import { createPortableSave } from '../src/lib/versionHistory.js';
  import { historyShortcut } from '../src/lib/sessionUndo.js';
  import { money, requireProjectFile } from '../src/lib/domain.js';
  import { addDays, eventDates, todayISO, dateDE } from '../src/lib/util.js';
  import Timeline from './Timeline.svelte';
  import PersonDetail from './PersonDetail.svelte';
  import ItemDetail from './ItemDetail.svelte';
  import DialogRouter from './DialogRouter.svelte';
  import InventoryView from './InventoryView.svelte';
  import PeopleView from './PeopleView.svelte';
  import LedgerView from './LedgerView.svelte';
  import HelpTip from '../src/components/HelpTip.svelte';
  import StorageView from './StorageView.svelte';
  const SERVER_MODE = import.meta.env.VITE_HAUSSTAND_SERVER_MODE === 'true';

  const navigation = [
    { id: 'overview', label: 'Überblick', glyph: '⌂' },
    { id: 'items', label: 'Gegenstände', glyph: '▦' },
    { id: 'people', label: 'Personen', glyph: '♙' },
    { id: 'money', label: 'Geld & Ausgleich', glyph: '⇄' },
    { id: 'activity', label: 'Änderungen', glyph: '◷' }
  ];
  let activeSection = 'overview';
  let showJson = false;
  let showDanger = false;
  let mobileMoreOpen = false;
  let storageView;
  let savingLocal = false;
  let saveMessage = '';

  onMount(() => {
    const stop = locale.subscribe(language => {
      document.documentElement.lang = language;
      document.title = 'Hausstandsliste – Shared Ownership Tracker';
    });
    const copy = loadWorkingCopy();
    if (copy && copy.project) {
      appState.restoreWorkingCopy(copy); // The view always opens at today, never at a stale historical date.
    }
    return stop;
  });

  $: route = $appState.route;
  $: personEntry = route.page === 'person' ? ($projection.people.find(p => p.id === route.id) || $projection.peopleById.get(route.id)) : null;
  $: person = personEntry ? { holdings: [], totalValue: 0, ...personEntry } : null;
  $: item = route.page === 'item' ? $projection.items.find(i => i.id === route.id) : null;
  $: drafts = $appState.project.drafts || [];
  $: dates = eventDates($appState.project);
  $: firstDate = dates[0] || null;
  $: lastDate = dates[dates.length - 1] || null;
  $: today = todayISO();
  $: dateMode = $appState.asOfDate > today ? 'future' : $appState.asOfDate < today ? 'past' : 'today';
  $: latestEvents = [...($appState.project.events || [])].filter(e => e.date && e.date <= $appState.asOfDate).sort((a,b)=>String(b.date).localeCompare(String(a.date)) || (b.order || 0) - (a.order || 0)).slice(0,5);
  $: futureEventCount = ($appState.project.events || []).filter(e => e.date > $appState.asOfDate).length;
  $: balances = $ledger.simplified || [];
  $: outstandingCents = balances.reduce((sum, transfer) => sum + transfer.amountCents, 0);

  function personName(id) { return $appState.project.people.find(p => p.id === id)?.name || 'Unbekannt'; }
  function itemName(id) { return $appState.project.items.find(i => i.id === id)?.name || 'Gegenstand'; }
  function eventName(e) {
    if (e.type === 'item-added') return 'Gegenstand erfasst: ' + (e.name || itemName(e.itemId));
    if (e.type === 'item-ended') return 'Gegenstand beendet: ' + itemName(e.itemId);
    if (e.type === 'person-added') return 'Person hinzugefügt: ' + (e.name || personName(e.personId));
    if (e.type === 'person-deactivated') return 'Person ausgeschieden: ' + personName(e.personId);
    if (e.type === 'person-reactivated') return 'Person wieder aufgenommen: ' + personName(e.personId);
    if (e.type === 'redistribution-executed') return 'Anteile verändert: ' + (e.title || 'Übertragung');
    if (e.type === 'shares-set') return 'Anteile verändert: ' + itemName(e.itemId);
    if (e.type === 'claim-settlement-recorded') return (e.settlementKind === 'paid' ? 'Zahlung' : e.settlementKind === 'external' ? 'Extern verbucht' : 'Erlass') + ': ' + personName(e.debtorPersonId) + ' an ' + personName(e.creditorPersonId) + ' (' + money(e.amountCents / 100) + ')';
    return e.title || e.note || 'Änderung';
  }
  function navigate(id) {
    mobileMoreOpen = false;
    activeSection = id;
    if ($appState.route.page !== 'dashboard') appState.setRoute({ page: 'dashboard' });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function goToDetailReturn() {
    appState.setRoute({ page: 'dashboard' });
  }
  function warnUnsavedBeforeLeaving(event) {
    if (!$appState.dirty) return;
    // Browser-controlled warning: local working copies and unfinished PHP
    // checkouts are not a replacement for explicit Save.
    event.preventDefault();
    event.returnValue = '';
  }
  function handleKeydown(e) {
    const shortcut = historyShortcut(e, !!$appState.activeDialog);
    if (shortcut) {
      const changed = shortcut === 'undo' ? appState.undo() : appState.redo();
      if (changed) e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && mobileMoreOpen) { mobileMoreOpen = false; return; }
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable || e.target?.closest?.('button, a, [role="tab"]') || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || $appState.activeDialog) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); appState.setAsOfDate(addDays($appState.asOfDate, -1)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); appState.setAsOfDate(addDays($appState.asOfDate, 1)); }
  }
  async function importFile(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data?.format?.startsWith('hausstand-aesgcm')) {
        navigate('save');
        throw new Error('Diese Datei ist passwortgeschützt. Bitte unter „Sichern & Teilen“ → „Mit Passwort sichern“ öffnen.');
      }
      if ($appState.dirty && !confirm('Der aktuelle Arbeitsstand hat noch nicht exportierte Änderungen. Trotzdem eine andere Datei öffnen?')) return;
      appState.importProject(requireProjectFile(data), file.name, false);
      navigate('overview');
    } catch (err) { alert('Öffnen fehlgeschlagen: ' + err.message); }
    finally { input.value = ''; }
  }
  async function exportNow() {
    if (savingLocal) return;
    if ($appState.secure) {
      // Protected projects must not silently export sensitive history in plaintext.
      navigate('save');
      return;
    }
    savingLocal = true;
    saveMessage = '';
    try {
      const saved = await createPortableSave($appState.project, $appState.savedProject);
      downloadProject(saved, $appState.asOfDate);
      appState.markSaved(saved);
      saveMessage = 'Download gestartet – die Datei bitte sicher aufbewahren.';
    } catch (error) {
      saveMessage = 'Speichern fehlgeschlagen: ' + (error?.message || error);
    } finally { savingLocal = false; }
  }
  async function saveNow() {
    if ($appState.secure) {
      const result = await storageView?.saveFromHeader?.();
      if (result?.handled) { saveMessage = result.message || ''; return; }
      navigate('save'); // Encrypted local file: requires the file password.
      return;
    }
    await exportNow();
  }
  function newProject() {
    if (!confirm('Neues Projekt beginnen? Der bisherige Arbeitsstand in diesem Browser wird ersetzt. Bitte vorher eine Sicherungskopie erstellen.')) return;
    appState.newProject();
    navigate('overview');
  }
</script>

<svelte:window on:keydown={handleKeydown} on:beforeunload={warnUnsavedBeforeLeaving} on:focusin={prepareDialogNumber} on:focusout={finishDialogNumber} />

<div class="app-shell">
  <aside class="sidebar" aria-label="Hauptnavigation">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">H</span>
      <div class="brand-name"><strong>Hausstandsliste</strong><span>Shared Ownership Tracker</span></div>
    </div>
    
    <nav class="sidebar-links" aria-label="Arbeitsbereiche">
      {#each navigation as nav (nav.id)}
        <button class:nav-active={route.page === 'dashboard' && activeSection === nav.id} aria-current={route.page === 'dashboard' && activeSection === nav.id ? 'page' : undefined} on:click={() => navigate(nav.id)}>
          <span class="nav-glyph" aria-hidden="true">{nav.glyph}</span><span>{$translate('nav.' + nav.id)}</span>
        </button>
      {/each}
    </nav>
    <div class="sidebar-bottom">
      <button class:nav-active={route.page === 'dashboard' && activeSection === 'save'} on:click={() => navigate('save')} aria-current={route.page === 'dashboard' && activeSection === 'save' ? 'page' : undefined}><span class="nav-glyph" aria-hidden="true">⇩</span> {$translate("nav.save")}</button>
      <button class:nav-active={route.page === 'dashboard' && activeSection === 'settings'} on:click={() => navigate('settings')} aria-current={route.page === 'dashboard' && activeSection === 'settings' ? 'page' : undefined}><span class="nav-glyph" aria-hidden="true">⚙</span> {$translate("nav.settings")}</button>
      
    </div>
  </aside>

  <div class="main-column">
    <header class="app-header">
      <div class="header-context">
        
        <strong><span class="mobile-header-brand">Hausstandsliste · </span>{$appState.project.community?.name || 'Meine Hausgemeinschaft'}</strong>
      </div>
      <div class="header-actions">
        <div class="session-history-actions" role="group" aria-label={$translate('app.undo')}>
          <button type="button" class="session-history-button" aria-label={$translate('app.undo')} title={$translate("app.undo")} disabled={$appState.readOnly || !!$appState.activeDialog || !$appState.history.undoCount} on:click={() => appState.undo()}>↶</button>
          <button type="button" class="session-history-button" aria-label={$translate('app.redo')} title="Wiederholen (Strg+Y / Strg+Umschalt+Z)" disabled={$appState.readOnly || !!$appState.activeDialog || !$appState.history.redoCount} on:click={() => appState.redo()}>↷</button>
        </div>
        <span class="working-indicator" title={$appState.secure ? 'Passwortgeschütztes Projekt: keine Klartext-Arbeitskopie im Browser' : 'Nicht verschlüsselte Projekte haben eine lokale Arbeitskopie im Browser'}>
          <span class="status-dot" class:needs-save={$appState.dirty}></span>
          {$translate($appState.dirty ? 'app.dirty' : 'app.clean')}
        </span>
        <button class="header-save" disabled={savingLocal} on:click={saveNow}>{$translate(savingLocal ? 'app.saving' : 'app.save')}</button>
      </div>
    </header>

    <main class="work-content">
      {#key $locale}
      {#if saveMessage}<p role="status" class="inline-info">{saveMessage}</p>{/if}
      {#if $appState.localCacheWarning}<p role="alert" class="inline-info warning">Der Browser konnte die Arbeitskopie nicht zwischenspeichern (Speicher voll oder nicht verfügbar). Bitte jetzt eine Projektdatei herunterladen.</p>{/if}
      <div class="date-toolbar" aria-label="Betrachtungsdatum">
        <div class="date-toolbar-label">
          <span>{$translate("app.dateAsOf")}</span>
          <strong>{$translate(dateMode === 'today' ? 'app.today' : dateMode === 'past' ? 'app.past' : 'app.future')}</strong>
        </div>
        <div class="date-toolbar-controls">
          <button title={$translate("app.first")} aria-label={$translate("app.first")} disabled={!firstDate} on:click={() => appState.setAsOfDate(firstDate)}>⇤<span class="mobile-jump-text">Anfang</span></button>
          <button title={$translate("app.previous")} aria-label={$translate("app.previous")} on:click={() => appState.setAsOfDate(addDays($appState.asOfDate, -1))}>‹</button>
          <label class="sr-only" for="state-date">{$translate("app.pickDate")}</label>
          <input id="state-date" type="date" value={$appState.asOfDate} on:change={e => appState.setAsOfDate(e.currentTarget.value || todayISO())}>
          <button title={$translate("app.next")} aria-label={$translate("app.next")} on:click={() => appState.setAsOfDate(addDays($appState.asOfDate, 1))}>›</button>
          <button title={$translate("app.last")} aria-label={$translate("app.last")} disabled={!lastDate} on:click={() => appState.setAsOfDate(lastDate)}>⇥<span class="mobile-jump-text">Ende</span></button>
          <button class="today-button" on:click={() => appState.setAsOfDate(todayISO())}>{$translate("app.today")}</button>
        </div>
        {#if dateMode !== 'today'}<span class="date-explanation">{dateMode === 'past' ? 'Du siehst den früheren Besitzstand.' : 'Du siehst den Stand für ein zukünftiges Datum.'}</span>{/if}
      </div>

      {#if route.page === 'person' && person}
        <div class="details-top"><button class="back-link" on:click={goToDetailReturn}>← Zurück zu {activeSection === 'people' ? 'Personen' : 'Übersicht'}</button></div>
        <PersonDetail {person} projection={$projection} asOfDate={$appState.asOfDate} ledger={$ledger} />
      {:else if route.page === 'item' && item}
        <div class="details-top"><button class="back-link" on:click={goToDetailReturn}>← Zurück zu {activeSection === 'items' ? 'Gegenständen' : 'Übersicht'}</button></div>
        <ItemDetail {item} />
      {:else if route.page !== 'dashboard'}
        <div class="blank-card"><p>Diese Detailansicht wurde nicht gefunden.</p><button on:click={() => navigate('overview')}>Zur Übersicht</button></div>
      {:else if activeSection === 'overview'}
        <section class="page-heading">
          <div><h1>{$translate("nav.overview")}</h1></div>
          <button class="solid-action" on:click={() => appState.setDialog({ type: 'itemAdd' })}>＋ {$translate("app.itemAdd")}</button>
        </section>

        {#if $appState.project.people.length === 0 && $appState.project.items.length === 0}
          <section class="getting-started">
            <div><h2>{$translate("app.intro")}</h2></div>
            <button class="solid-action" on:click={() => appState.setDialog({ type: 'personAdd' })}>{$translate("app.firstPerson")}</button>
          </section>
        {/if}

        <div class="metric-grid">
          <div class="metric"><span>{$translate("app.totalValue")}</span><strong>{money($projection.totalValue)}</strong><small>{$translate("app.activeItems")}</small></div>
          <div class="metric"><span>{$translate("nav.items")}</span><strong>{$projection.activeItems.length}</strong><small>{$translate("app.inInventory")}</small></div>
          <div class="metric"><span>{$translate("nav.people")}</span><strong>{$projection.people.filter(p=>p.active).length}</strong><small>{$translate("app.participants")}</small></div>
          <div class="metric"><span>{$translate("app.outstanding")}</span><strong>{money(outstandingCents / 100)}</strong><small>{$translate("app.sharedBalance")}</small></div>
        </div>

        <div class="overview-layout">
          <section class="ux-panel quick-actions">
            <div class="section-header"><div><h2>{$translate("app.tasks")}</h2></div></div>
            <div class="task-grid">
              <button on:click={() => appState.setDialog({ type: 'itemAdd' })}><strong>{$translate("app.addSomething")}</strong><small>{$translate("app.recordItem")}</small></button>
              <button on:click={() => appState.startRedistribution()}><strong>{$translate("app.transfer")}</strong><small>{$translate("app.split")}</small></button>
              <button on:click={() => appState.setDialog({ type: 'personAdd' })}><strong>{$translate("app.personAdd")}</strong><small>{$translate("app.join")}</small></button>
              <button on:click={() => navigate('save')}><strong>{$translate("app.backup")}</strong><small>{$translate("app.share")}</small></button>
            </div>
          </section>
          <section class="ux-panel financial-overview">
            <div class="section-header"><div class="help-heading"><h2>{$translate("app.suggestions")}</h2><HelpTip label="Wie entstehen die Ausgleichsvorschläge?">Aus dem finanzierten Wert und den Eigentumsanteilen wird berechnet, wer einen Ausgleich erhalten soll. Die Überweisungswege sind Vorschläge, keine dokumentierten Zahlungen.</HelpTip></div><button class="text-action" on:click={() => navigate('money')}>{$translate("app.viewAll")}</button></div>
            {#if balances.length}
              <div class="simple-debts">
                {#each balances.slice(0,5) as b}
                  <div class="debt-row">
                  <span>{personName(b.fromPersonId)} an {personName(b.toPersonId)}</span>
                  <strong>{money(b.amountCents / 100)}</strong>
                  <button class="debt-action" on:click={() => appState.setDialog({type:'settlementAdd',payerPersonId:b.fromPersonId,recipientPersonId:b.toPersonId,amountCents:b.amountCents})} disabled={$appState.readOnly}>{$translate("app.settle")}</button>
                </div>
                {/each}
              </div>
              {#if balances.length > 5}<p class="muted">Weitere {balances.length - 5} Verbindungen im Bereich „Geld & Ausgleich“.</p>{/if}
            {:else}
              <div class="gentle-empty"><strong>{$translate("app.settled")}</strong></div>
            {/if}
          </section>
        </div>
        <div class="overview-layout second-row">
          <section class="ux-panel">
            <div class="section-header"><div><h2>{$translate("app.recent")}</h2></div><button class="text-action" on:click={() => navigate('activity')}>{$translate("app.viewActivity")}</button></div>
            {#if latestEvents.length}
              <div class="recent-list">
                {#each latestEvents as event (event.id)}
                  <div class="recent-row"><div><strong>{eventName(event)}</strong><small>{dateDE(event.date)}</small></div></div>
                {/each}
              </div>
            {:else}
              <div class="gentle-empty"><p>{$translate("app.none")}</p></div>
            {/if}
          </section>
          <section class="ux-panel">
            <div class="section-header"><div><h2>{$translate("app.drafts")}</h2></div></div>
            {#if drafts.length}
              <div class="draft-list">
                {#each drafts as draft (draft.id)}
                  <div class="draft-row">
                    <div><strong>{draft.title || draft.data?.name || 'Unbenannter Entwurf'}</strong><small>{draft.type === 'redistribution' ? 'Anteile übertragen' : 'Gegenstand erfassen'}</small></div>
                    <div class="draft-buttons">
                      <button on:click={() => appState.setDialog({type:draft.type==='redistribution'?'redistributionEdit':'itemAdd',id:draft.id})}>{$translate("app.continue")}</button>
                      <button class="subtle-danger" title="Entwurf löschen" aria-label="Entwurf löschen" on:click={() => { if (confirm('Diesen Entwurf löschen?')) appState.deleteDraft(draft.id); }}>×</button>
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="gentle-empty"><p>{$translate("app.noDrafts")}</p></div>
            {/if}
          </section>
        </div>
      {:else if activeSection === 'items'}
        <div class="page-heading"><div><h1>{$translate("nav.items")}</h1></div><button class="solid-action" on:click={() => appState.setDialog({type:'itemAdd'})}>＋ {$translate("app.itemAdd")}</button></div>
        <InventoryView items={$projection.activeItems} archived={$projection.archivedItems} tags={$projection.allTags}/>
      {:else if activeSection === 'people'}
        <div class="page-heading"><div><h1>{$translate("nav.people")}</h1></div><button class="solid-action" on:click={() => appState.setDialog({type:'personAdd'})}>＋ {$translate("app.personAdd")}</button></div>
        <PeopleView people={$projection.people} ledger={$ledger}/>
      {:else if activeSection === 'money'}
        <div class="page-heading"><div><h1>{$translate("nav.money")}</h1></div><button class="outline-action" on:click={() => appState.startRedistribution()}>{$translate("app.transfer")}</button></div>
        <LedgerView project={$appState.project} data={$ledger} asOfDate={$appState.asOfDate}/>
      {:else if activeSection === 'activity'}
        <div class="page-heading"><div><h1>{$translate("nav.activity")}</h1></div></div>
        {#if futureEventCount}<div class="inline-info">{futureEventCount} Vorgang/Vorgänge liegen nach dem aktuell gewählten Datum. Sie können im Verlauf eingeblendet werden.</div>{/if}
        <Timeline project={$appState.project} asOfDate={$appState.asOfDate} title="Alle Änderungen nach Datum"/>
      {:else if activeSection === 'save'}
        <div class="page-heading"><div><h1>{$translate("nav.save")}</h1><HelpTip label="Wo werden die Projektdaten gespeichert?">{SERVER_MODE ? 'Du kannst Sicherungskopien erstellen und deine gemeinsamen Online-Projekte verwalten.' : 'Diese HTML-Version speichert ausschließlich lokal. Sichere deine Daten regelmäßig als Datei.'}</HelpTip></div></div>
        <div class="save-top-grid">
          <section class="ux-panel save-basic">
            <div class="section-header"><div class="help-heading"><h2>{$translate("app.backupTitle")}</h2><HelpTip label="Wozu dient die Sicherungskopie?">Lade deine Projektdaten als Datei herunter. So kannst du sie später auf diesem oder einem anderen Gerät wieder öffnen.</HelpTip></div></div>
            <div class="save-basic-actions">
              <button class="solid-action" on:click={exportNow}>{$translate("app.download")}</button>
              <label class="file-button">{$translate("app.openBackup")}<input type="file" accept="application/json,.json" on:change={importFile}/></label>
            </div>
            <div class="inline-info warning">Diese einfache Sicherung ist <strong>{$translate("app.unencrypted")}</strong>. Bewahre sie an einem geschützten Ort auf.</div>
          </section>
          <section class="ux-panel save-help">
            <div class="section-header"><div class="help-heading"><h2>{$translate("app.whereData")}</h2><HelpTip label="Wie funktioniert die lokale Datenspeicherung?">{$appState.secure ? 'Bei verschlüsselten Projekten wird keine unverschlüsselte Kopie im Browser abgelegt.' : SERVER_MODE ? 'Solange kein Online-Projekt geöffnet wurde, liegt der Arbeitsstand nur in diesem Browser. Für gemeinsame Speicherung nutze Online-Projekte.' : 'Der Arbeitsstand wird nur in diesem Browser gespeichert und nicht automatisch auf andere Geräte übertragen.'} Bitte sichere deine Daten regelmäßig als Datei.</HelpTip></div></div>
            <div class="status-definition"><div><strong>{$appState.secure ? 'Passwortgeschütztes Projekt' : 'Arbeitskopie in diesem Browser'}</strong></div></div>
            <div class="status-definition"><div><strong>{$appState.dirty ? 'Änderungen noch nicht exportiert' : 'Keine neuen Änderungen seit der letzten Sicherung'}</strong></div></div>
          </section>
        </div>
      {:else if activeSection === 'settings'}
        <div class="page-heading"><div><h1>{$translate("nav.settings")}</h1></div></div>
        <section class="ux-panel setting-panel">
          <div class="section-header"><div><h2>{$translate('language.title')}</h2></div></div>
          <label for="language-selection">{$translate('language.title')}
            <select id="language-selection" value={$languagePreference} on:change={e => setLanguage(e.currentTarget.value)}>
              <option value="auto">{$translate('language.auto')}</option>
              <option value="en">English</option>
              <option value="de">{$translate("language.german")}</option>
            </select>
          </label>
          <p class="muted">{$translate('language.help')}</p>
        </section>
        <section class="ux-panel setting-panel">
          <div class="section-header"><div><h2>{$translate('app.currentProject')}</h2></div></div>
          <dl class="project-metadata"><div><dt>{$translate("app.household")}</dt><dd>{$appState.project.community?.name || 'Hausgemeinschaft'}</dd></div><div><dt>{$translate("app.openFile")}</dt><dd>{$appState.fileName || $translate('app.noFile')}</dd></div><div><dt>{$translate("app.editing")}</dt><dd>{$appState.readOnly ? $translate('app.readonly') : $translate('app.editable')}</dd></div></dl>
        </section>
        <section class="ux-panel setting-panel">
          <div class="section-header"><div class="help-heading"><h2>{$translate("app.inspect")}</h2><HelpTip label="Was enthält die technische Ansicht?">Die technische Ansicht zeigt die vollständige Datenstruktur des Projekts zur Fehlersuche und zum Austausch mit anderen Programmen.</HelpTip></div></div>
          <button class="outline-action" aria-expanded={showJson} on:click={() => showJson = !showJson}>{showJson ? $translate('app.technicalClose') : $translate('app.technicalOpen')}</button>
          {#if showJson}<pre class="json-preview">{JSON.stringify(exportProject($appState.project, $appState.asOfDate), null, 2)}</pre>{/if}
        </section>
        <section class="ux-panel setting-panel dangerous-settings">
          <div class="section-header"><div class="help-heading"><h2>{$translate("app.newProject")}</h2><HelpTip label="Was passiert beim Projektwechsel?">Beim Zurücksetzen wird die bisherige Arbeitskopie in diesem Browser ersetzt. Erstelle vorher eine Sicherungskopie.</HelpTip></div></div>
          <button class="outline-action" aria-expanded={showDanger} on:click={() => showDanger = !showDanger}>{showDanger ? 'Abbrechen' : $translate('app.reset')}</button>
          {#if showDanger}<div class="inline-info warning"><strong>Der aktuelle Stand kann verloren gehen.</strong> Nach dem Zurücksetzen lässt er sich nur aus einer vorhandenen Sicherung wiederherstellen.</div><button class="dangerous-button" on:click={newProject}>Ja, neues Projekt beginnen</button>{/if}
        </section>
      {/if}
      {/key}
      <!-- Keep the collaborative-storage component mounted: the server lease, edit token,
           selected remote file and password must survive tab/detail navigation. -->
      <div class:storage-not-visible={route.page !== 'dashboard' || activeSection !== 'save'}>
        <StorageView bind:this={storageView}/>
      </div>
    </main>
  </div>
</div>
<!-- Mobile quick navigation: a stable bottom bar with all other areas in Mehr. -->
<nav class="mobile-bottom-nav" aria-label="Navigation auf dem Smartphone">
  {#each navigation.slice(0,4) as nav (nav.id)}
    <button type="button" class:nav-active={activeSection === nav.id}
      aria-current={activeSection === nav.id ? 'page' : undefined} on:click={() => navigate(nav.id)}>
      <span class="mobile-nav-icon" aria-hidden="true">{nav.glyph}</span>
      <span class="mobile-nav-label">{$translate(nav.id === 'overview' ? 'nav.home' : nav.id === 'items' ? 'nav.things' : nav.id === 'people' ? 'nav.people' : 'nav.cash')}</span>
    </button>
  {/each}
  <div class="mobile-more-slot">
    {#if mobileMoreOpen}
      <div class="mobile-more-menu" id="mobile-more-menu">
        <button type="button" class:nav-active={activeSection === 'activity'} on:click={() => navigate('activity')}><span aria-hidden="true">◷</span> {$translate("nav.activity")}</button>
        <button type="button" class:nav-active={activeSection === 'save'} on:click={() => navigate('save')}><span aria-hidden="true">⇩</span> {$translate("nav.save")}</button>
        <button type="button" class:nav-active={activeSection === 'settings'} on:click={() => navigate('settings')}><span aria-hidden="true">⚙</span> {$translate("nav.settings")}</button>
      </div>
    {/if}
    <button type="button" class:nav-active={['activity','save','settings'].includes(activeSection)}
      aria-expanded={mobileMoreOpen} aria-controls="mobile-more-menu"
      aria-label={mobileMoreOpen ? 'Weitere Bereiche schließen' : 'Weitere Bereiche öffnen'}
      on:click={() => mobileMoreOpen = !mobileMoreOpen}>
      <span class="mobile-nav-icon" aria-hidden="true">{mobileMoreOpen ? '×' : '⋯'}</span>
      <span class="mobile-nav-label">{$translate("nav.more")}</span>
    </button>
  </div>
</nav>
<DialogRouter dialog={$appState.activeDialog} project={$appState.project} projection={$projection} asOfDate={$appState.asOfDate}/>
