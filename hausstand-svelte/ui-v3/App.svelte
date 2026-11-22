<script>
  import { onMount } from 'svelte';
  import { prepareDialogNumber, finishDialogNumber } from './form-behavior.js';
  import { appState, projection, ledger } from '../src/stores/projectStore.js';
  import { loadWorkingCopy, downloadProject, exportProject } from '../src/lib/persistence.js';
  import { money } from '../src/lib/domain.js';
  import { PAYMENT_STATUS_NOTICE } from '../src/lib/financialLabels.js';
  import { addDays, eventDates, todayISO, dateDE } from '../src/lib/util.js';
  import Timeline from './Timeline.svelte';
  import PersonDetail from './PersonDetail.svelte';
  import ItemDetail from './ItemDetail.svelte';
  import DialogRouter from './DialogRouter.svelte';
  import InventoryView from './InventoryView.svelte';
  import PeopleView from './PeopleView.svelte';
  import LedgerView from './LedgerView.svelte';
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

  onMount(() => {
    const copy = loadWorkingCopy();
    if (copy && copy.project) {
      appState.importProject(copy.project, copy.fileName);
      if (copy.asOfDate) appState.setAsOfDate(copy.asOfDate);
    }
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
  $: balances = $ledger.pairwise || [];

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
  function handleKeydown(e) {
    if (e.key === 'Escape' && mobileMoreOpen) { mobileMoreOpen = false; return; }
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable || e.target?.closest?.('button, a, [role="tab"]') || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || $appState.activeDialog) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); appState.setAsOfDate(addDays($appState.asOfDate, -1)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); appState.setAsOfDate(addDays($appState.asOfDate, 1)); }
  }
  async function importFile(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data?.format?.startsWith('hausstand-aesgcm')) {
        navigate('save');
        throw new Error('Diese Datei ist passwortgeschützt. Bitte unter „Sichern & Teilen“ → „Mit Passwort sichern“ öffnen.');
      }
      if ($appState.dirty && !confirm('Der aktuelle Arbeitsstand hat noch nicht exportierte Änderungen. Trotzdem eine andere Datei öffnen?')) return;
      appState.importProject(data, file.name, false);
      navigate('overview');
    } catch (err) { alert('Öffnen fehlgeschlagen: ' + err.message); }
    finally { event.currentTarget.value = ''; }
  }
  function exportNow() {
    if ($appState.secure && !confirm('Diese Sicherungskopie ist nicht verschlüsselt. Soll sie trotzdem heruntergeladen werden?')) return;
    downloadProject($appState.project, $appState.asOfDate);
    appState.markExported();
  }
  function newProject() {
    if (!confirm('Neues Projekt beginnen? Der bisherige Arbeitsstand in diesem Browser wird ersetzt. Bitte vorher eine Sicherungskopie erstellen.')) return;
    appState.newProject();
    navigate('overview');
  }
</script>

<svelte:window on:keydown={handleKeydown} on:focusin={prepareDialogNumber} on:focusout={finishDialogNumber} />

<div class="app-shell">
  <aside class="sidebar" aria-label="Hauptnavigation">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">H</span>
      <div class="brand-name"><strong>Hausstand</strong><span>Gemeinsam verwalten</span></div>
    </div>
    <div class="sidebar-section-title">ARBEITSBEREICHE</div>
    <nav class="sidebar-links" aria-label="Arbeitsbereiche">
      {#each navigation as nav (nav.id)}
        <button class:nav-active={route.page === 'dashboard' && activeSection === nav.id} aria-current={route.page === 'dashboard' && activeSection === nav.id ? 'page' : undefined} on:click={() => navigate(nav.id)}>
          <span class="nav-glyph" aria-hidden="true">{nav.glyph}</span><span>{nav.label}</span>
        </button>
      {/each}
    </nav>
    <div class="sidebar-bottom">
      <button class:nav-active={route.page === 'dashboard' && activeSection === 'save'} on:click={() => navigate('save')} aria-current={route.page === 'dashboard' && activeSection === 'save' ? 'page' : undefined}><span class="nav-glyph" aria-hidden="true">⇩</span> Sichern & Teilen</button>
      <button class:nav-active={route.page === 'dashboard' && activeSection === 'settings'} on:click={() => navigate('settings')} aria-current={route.page === 'dashboard' && activeSection === 'settings' ? 'page' : undefined}><span class="nav-glyph" aria-hidden="true">⚙</span> Einstellungen</button>
      <div class="sidebar-note">UI-Entwurf 3 · Original unverändert</div>
    </div>
  </aside>

  <div class="main-column">
    <header class="app-header">
      <div class="header-context">
        <span class="context-kicker">HAUSGEMEINSCHAFT</span>
        <strong><span class="mobile-header-brand">Hausstand · </span>{$appState.project.community?.name || 'Meine Hausgemeinschaft'}</strong>
      </div>
      <div class="header-actions">
        <span class="working-indicator" title={$appState.secure ? 'Passwortgeschütztes Projekt: keine Klartext-Arbeitskopie im Browser' : 'Nicht verschlüsselte Projekte haben eine lokale Arbeitskopie im Browser'}>
          <span class="status-dot" class:needs-save={$appState.dirty}></span>
          {$appState.secure ? 'Geschützt geöffnet' : $appState.dirty ? 'Änderungen sichern' : 'Lokale Arbeitskopie'}
        </span>
        <button class="header-save" on:click={() => navigate('save')}>Sichern</button>
      </div>
    </header>

    <main class="work-content">
      <div class="date-toolbar" aria-label="Betrachtungsdatum">
        <div class="date-toolbar-label">
          <span>Stand der Daten</span>
          <strong>{dateMode === 'today' ? 'Heute' : dateMode === 'past' ? 'Vergangener Stand' : 'Geplanter Stand'}</strong>
        </div>
        <div class="date-toolbar-controls">
          <button title="Zum ersten Ereignis" aria-label="Zum ersten Ereignis" disabled={!firstDate} on:click={() => appState.setAsOfDate(firstDate)}>⇤<span class="mobile-jump-text">Anfang</span></button>
          <button title="Einen Tag zurück" aria-label="Einen Tag zurück" on:click={() => appState.setAsOfDate(addDays($appState.asOfDate, -1))}>‹</button>
          <label class="sr-only" for="state-date">Datum wählen</label>
          <input id="state-date" type="date" value={$appState.asOfDate} on:change={e => appState.setAsOfDate(e.currentTarget.value || todayISO())}>
          <button title="Einen Tag vor" aria-label="Einen Tag vor" on:click={() => appState.setAsOfDate(addDays($appState.asOfDate, 1))}>›</button>
          <button title="Zum letzten Ereignis" aria-label="Zum letzten Ereignis" disabled={!lastDate} on:click={() => appState.setAsOfDate(lastDate)}>⇥<span class="mobile-jump-text">Ende</span></button>
          <button class="today-button" on:click={() => appState.setAsOfDate(todayISO())}>Heute</button>
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
          <div><span class="overline">ÜBERBLICK</span><h1>Was gibt es Neues?</h1><p>Das Wichtigste zu eurem gemeinsamen Besitz, auf einen Blick.</p></div>
          <button class="solid-action" on:click={() => appState.setDialog({ type: 'itemAdd' })}>＋ Gegenstand hinzufügen</button>
        </section>

        {#if $appState.project.people.length === 0 && $appState.project.items.length === 0}
          <section class="getting-started">
            <div><span class="overline">DER EINSTIEG</span><h2>Beginne mit den Personen.</h2><p>Lege zuerst die Mitbewohnerinnen und Mitbewohner an, danach eure gemeinsamen Gegenstände. Ihre Anteile kannst du dabei direkt festlegen.</p></div>
            <button class="solid-action" on:click={() => appState.setDialog({ type: 'personAdd' })}>Erste Person hinzufügen</button>
          </section>
        {/if}

        <div class="metric-grid">
          <div class="metric"><span>Gemeinsamer Bestandswert</span><strong>{money($projection.totalValue)}</strong><small>Wert aller aktiven Gegenstände</small></div>
          <div class="metric"><span>Gegenstände</span><strong>{$projection.activeItems.length}</strong><small>im aktuellen Bestand</small></div>
          <div class="metric"><span>Personen</span><strong>{$projection.people.filter(p=>p.active).length}</strong><small>aktuell dabei</small></div>
          <div class="metric"><span>Bilaterale Nettosalden</span><strong>{balances.length}</strong><small>inklusive dokumentierter Gegenbuchungen</small></div>
        </div>

        <div class="overview-layout">
          <section class="ux-panel quick-actions">
            <div class="section-header"><div><span class="section-eyebrow">DIREKT ERLEDIGEN</span><h2>Was möchtest du tun?</h2></div></div>
            <div class="task-grid">
              <button on:click={() => appState.setDialog({ type: 'itemAdd' })}><span class="task-icon">＋</span><strong>Etwas hinzufügen</strong><small>Neuen Gegenstand erfassen</small></button>
              <button on:click={() => appState.startRedistribution()}><span class="task-icon">⇄</span><strong>Anteile übertragen</strong><small>Besitz neu aufteilen</small></button>
              <button on:click={() => appState.setDialog({ type: 'personAdd' })}><span class="task-icon">♙</span><strong>Person hinzufügen</strong><small>Einzug oder neue Beteiligung</small></button>
              <button on:click={() => navigate('save')}><span class="task-icon">⇩</span><strong>Daten sichern</strong><small>Sicherung erstellen oder gemeinsam arbeiten</small></button>
            </div>
          </section>
          <section class="ux-panel financial-overview">
            <div class="section-header"><div><span class="section-eyebrow">GELD</span><h2>Rechnerische Forderungssalden</h2></div><button class="text-action" on:click={() => navigate('money')}>Alle Beträge ansehen →</button></div>
            <p class="muted">{PAYMENT_STATUS_NOTICE}</p>
            {#if balances.length}
              <div class="simple-debts">
                {#each balances.slice(0,5) as b}
                  <div class="debt-row"><span>{personName(b.fromPersonId)} <span class="muted">an</span> {personName(b.toPersonId)}</span><strong>{money(b.amountCents / 100)}</strong></div>
                {/each}
              </div>
              {#if balances.length > 5}<p class="muted">Weitere {balances.length - 5} Verbindungen im Bereich „Geld & Ausgleich“.</p>{/if}
            {:else}
              <div class="gentle-empty"><span class="empty-symbol">✓</span><strong>Kein rechnerischer Nettosaldo</strong><p>Zum Stichtag gleichen sich die abgeleiteten Forderungen aus oder es bestehen keine. Das bedeutet nicht, dass Zahlungen erfolgt sind.</p></div>
            {/if}
          </section>
        </div>
        <div class="overview-layout second-row">
          <section class="ux-panel">
            <div class="section-header"><div><span class="section-eyebrow">ZULETZT</span><h2>Was hat sich verändert?</h2></div><button class="text-action" on:click={() => navigate('activity')}>Alle Änderungen →</button></div>
            {#if latestEvents.length}
              <div class="recent-list">
                {#each latestEvents as event (event.id)}
                  <div class="recent-row"><span class="event-dot"></span><div><strong>{eventName(event)}</strong><small>{dateDE(event.date)}</small></div></div>
                {/each}
              </div>
            {:else}
              <div class="gentle-empty"><p>Es gibt noch keine Änderungen. Sobald du Personen oder Gegenstände erfasst, erscheinen sie hier.</p></div>
            {/if}
          </section>
          <section class="ux-panel">
            <div class="section-header"><div><span class="section-eyebrow">IN BEARBEITUNG</span><h2>Entwürfe</h2></div><span class="count-pill">{drafts.length}</span></div>
            {#if drafts.length}
              <div class="draft-list">
                {#each drafts as draft (draft.id)}
                  <div class="draft-row">
                    <div><strong>{draft.title || draft.data?.name || 'Unbenannter Entwurf'}</strong><small>{draft.type === 'redistribution' ? 'Anteile übertragen' : 'Gegenstand erfassen'}</small></div>
                    <div class="draft-buttons">
                      <button on:click={() => appState.setDialog({type:draft.type==='redistribution'?'redistributionEdit':'itemAdd',id:draft.id})}>Fortsetzen</button>
                      <button class="subtle-danger" title="Entwurf löschen" aria-label="Entwurf löschen" on:click={() => { if (confirm('Diesen Entwurf löschen?')) appState.deleteDraft(draft.id); }}>×</button>
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="gentle-empty"><p>Keine offenen Entwürfe. Du kannst neue Gegenstände und geplante Übertragungen vor dem Abschließen als Entwurf speichern.</p></div>
            {/if}
          </section>
        </div>
      {:else if activeSection === 'items'}
        <div class="page-heading"><div><span class="overline">BESTAND</span><h1>Gegenstände</h1><p>Welche Dinge gehören zur Gemeinschaft – und wem gehören welche Anteile?</p></div><button class="solid-action" on:click={() => appState.setDialog({type:'itemAdd'})}>＋ Gegenstand hinzufügen</button></div>
        <InventoryView items={$projection.activeItems} archived={$projection.archivedItems} tags={$projection.allTags}/>
      {:else if activeSection === 'people'}
        <div class="page-heading"><div><span class="overline">MITGLIEDER</span><h1>Personen</h1><p>Alle Beteiligten, ihre Gegenstände und ihr jeweiliger Wertanteil.</p></div><button class="solid-action" on:click={() => appState.setDialog({type:'personAdd'})}>＋ Person hinzufügen</button></div>
        <PeopleView people={$projection.people} ledger={$ledger}/>
      {:else if activeSection === 'money'}
        <div class="page-heading"><div><span class="overline">FINANZEN</span><h1>Geld & Ausgleich</h1><p>Forderungen und dokumentierte Gegenbuchungen ergeben bilaterale Nettosalden. Eine Eingabemaske für Zahlungen folgt.</p></div><button class="outline-action" on:click={() => appState.startRedistribution()}>Anteile übertragen</button></div>
        <LedgerView project={$appState.project} data={$ledger} asOfDate={$appState.asOfDate}/>
      {:else if activeSection === 'activity'}
        <div class="page-heading"><div><span class="overline">NACHVOLLZIEHBAR</span><h1>Änderungen</h1><p>Einzüge, Anschaffungen, Übertragungen und andere Vorgänge im zeitlichen Verlauf.</p></div></div>
        {#if futureEventCount}<div class="inline-info">{futureEventCount} Vorgang/Vorgänge liegen nach dem aktuell gewählten Datum. Sie können im Verlauf eingeblendet werden.</div>{/if}
        <Timeline project={$appState.project} asOfDate={$appState.asOfDate} title="Alle Änderungen nach Datum"/>
      {:else if activeSection === 'save'}
        <div class="page-heading"><div><span class="overline">DATEN & ZUSAMMENARBEIT</span><h1>Sichern & Teilen</h1><p>{SERVER_MODE ? 'Erstelle Sicherungskopien oder verwalte eure gemeinsamen Online-Projekte.' : 'Erstelle eine Sicherungskopie oder öffne eine Datei. Diese HTML-Version speichert ausschließlich lokal.'}</p></div></div>
        <div class="save-top-grid">
          <section class="ux-panel save-basic">
            <div class="section-header"><div><span class="section-eyebrow">EINFACH</span><h2>Sicherungskopie erstellen</h2></div></div>
            <p>Speichere deinen aktuellen Stand als Datei auf diesem Gerät. Du kannst die Datei jederzeit wieder öffnen.</p>
            <div class="save-basic-actions">
              <button class="solid-action" on:click={exportNow}>Sicherung herunterladen</button>
              <label class="file-button">Vorhandene Sicherung öffnen<input type="file" accept="application/json,.json" on:change={importFile}/></label>
            </div>
            <div class="inline-info warning">Diese einfache Sicherung ist <strong>nicht verschlüsselt</strong>. Bewahre sie an einem geschützten Ort auf.</div>
          </section>
          <section class="ux-panel save-help">
            <div class="section-header"><div><span class="section-eyebrow">DEIN ARBEITSSTAND</span><h2>Wo liegen deine Daten?</h2></div></div>
            <div class="status-definition"><span class="status-symbol">●</span><div><strong>{$appState.secure ? 'Passwortgeschütztes Projekt' : 'Arbeitskopie in diesem Browser'}</strong><p>{$appState.secure ? 'Aus Sicherheitsgründen wird keine unverschlüsselte Arbeitskopie im Browser abgelegt.' : SERVER_MODE ? 'Solange kein gemeinsames Projekt geöffnet wurde, liegt dein Arbeitsstand nur in diesem Browser. Nutze „Online-Projekte“ zum gemeinsamen Speichern.' : 'Deine Änderungen werden lokal in diesem Browser vorgehalten. Sie sind nicht automatisch auf anderen Geräten verfügbar.'}</p></div></div>
            <div class="status-definition"><span class="status-symbol">{ $appState.dirty ? '!' : '✓' }</span><div><strong>{$appState.dirty ? 'Änderungen noch nicht exportiert' : 'Keine neuen Änderungen seit der letzten Sicherung'}</strong><p>{SERVER_MODE ? 'Für zuverlässige Backups sichere regelmäßig eine Datei oder speichere deine Änderungen am Online-Projekt.' : 'Für zuverlässige Backups speichere regelmäßig eine Datei.'}</p></div></div>
          </section>
        </div>
      {:else if activeSection === 'settings'}
        <div class="page-heading"><div><span class="overline">VERWALTUNG</span><h1>Einstellungen</h1><p>Technische Informationen und selten benötigte Aktionen für dieses Projekt.</p></div></div>
        <section class="ux-panel setting-panel">
          <div class="section-header"><div><span class="section-eyebrow">PROJEKT</span><h2>Aktuelles Projekt</h2></div></div>
          <dl class="project-metadata"><div><dt>Hausgemeinschaft</dt><dd>{$appState.project.community?.name || 'Hausgemeinschaft'}</dd></div><div><dt>Geöffnete Datei</dt><dd>{$appState.fileName || 'Keine Datei ausgewählt'}</dd></div><div><dt>Bearbeitung</dt><dd>{$appState.readOnly ? 'Schreibgeschützt' : 'Bearbeitbar'}</dd></div></dl>
        </section>
        <section class="ux-panel setting-panel">
          <div class="section-header"><div><span class="section-eyebrow">FÜR FORTGESCHRITTENE</span><h2>Projektdaten ansehen</h2></div></div>
          <p>Technische Datenstruktur zur Fehlersuche oder zum Austausch mit anderen Programmen.</p>
          <button class="outline-action" aria-expanded={showJson} on:click={() => showJson = !showJson}>{showJson ? 'Technische Ansicht schließen' : 'JSON-Daten anzeigen'}</button>
          {#if showJson}<pre class="json-preview">{JSON.stringify(exportProject($appState.project, $appState.asOfDate), null, 2)}</pre>{/if}
        </section>
        <section class="ux-panel setting-panel dangerous-settings">
          <div class="section-header"><div><span class="section-eyebrow">VORSICHT</span><h2>Neues Projekt beginnen</h2></div></div>
          <p>Diese Funktion ersetzt die bisherige Arbeitskopie in diesem Browser. Erstelle vorher unbedingt eine Sicherungskopie.</p>
          <button class="outline-action" aria-expanded={showDanger} on:click={() => showDanger = !showDanger}>{showDanger ? 'Abbrechen' : 'Projekt zurücksetzen …'}</button>
          {#if showDanger}<div class="inline-info warning"><strong>Der aktuelle Stand kann verloren gehen.</strong> Nach dem Zurücksetzen lässt er sich nur aus einer vorhandenen Sicherung wiederherstellen.</div><button class="dangerous-button" on:click={newProject}>Ja, neues Projekt beginnen</button>{/if}
        </section>
      {/if}
      <!-- Keep the collaborative-storage component mounted: the server lease, edit token,
           selected remote file and password must survive tab/detail navigation. -->
      <div class:storage-not-visible={route.page !== 'dashboard' || activeSection !== 'save'}>
        <StorageView/>
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
      <span class="mobile-nav-label">{nav.id === 'overview' ? 'Start' : nav.id === 'items' ? 'Dinge' : nav.id === 'people' ? 'Personen' : 'Geld'}</span>
    </button>
  {/each}
  <div class="mobile-more-slot">
    {#if mobileMoreOpen}
      <div class="mobile-more-menu" id="mobile-more-menu">
        <button type="button" class:nav-active={activeSection === 'activity'} on:click={() => navigate('activity')}><span aria-hidden="true">◷</span> Änderungen</button>
        <button type="button" class:nav-active={activeSection === 'save'} on:click={() => navigate('save')}><span aria-hidden="true">⇩</span> Sichern & Teilen</button>
        <button type="button" class:nav-active={activeSection === 'settings'} on:click={() => navigate('settings')}><span aria-hidden="true">⚙</span> Einstellungen</button>
      </div>
    {/if}
    <button type="button" class:nav-active={['activity','save','settings'].includes(activeSection)}
      aria-expanded={mobileMoreOpen} aria-controls="mobile-more-menu"
      aria-label={mobileMoreOpen ? 'Weitere Bereiche schließen' : 'Weitere Bereiche öffnen'}
      on:click={() => mobileMoreOpen = !mobileMoreOpen}>
      <span class="mobile-nav-icon" aria-hidden="true">{mobileMoreOpen ? '×' : '⋯'}</span>
      <span class="mobile-nav-label">Mehr</span>
    </button>
  </div>
</nav>
<DialogRouter dialog={$appState.activeDialog} project={$appState.project} projection={$projection} asOfDate={$appState.asOfDate}/>
