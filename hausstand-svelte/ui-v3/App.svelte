<script>
  import { nameEntries, rankedItems } from '../src/lib/overviewNames.js';
  import { onMount, tick } from 'svelte';
  import { locale, languagePreference, setLanguage, resolveLocale, translate, pluralMessage, formatDate } from '../src/lib/i18n.js';
  import { prepareDialogNumber, finishDialogNumber } from './form-behavior.js';
  import { appState, projection, ledger } from '../src/stores/projectStore.js';
  import { loadWorkingCopy, exportProject } from '../src/lib/persistence.js';
  import { connectRouteHistory, routeSection } from '../src/lib/navigation.js';
  import { historyShortcut } from '../src/lib/sessionUndo.js';
  import { sessionChangeText } from '../src/lib/sessionLog.js';
  import SessionHistoryDialog from './SessionHistoryDialog.svelte';
  import ResetProjectDialog from './ResetProjectDialog.svelte';
  import { money } from '../src/lib/domain.js';
  import { verifyPortableHistory } from '../src/lib/versionHistory.js';
  import { requireShareEventFormat } from '../src/lib/shareUnits.js';
  import { addDays, eventDates, todayISO } from '../src/lib/util.js';
  import Timeline from './Timeline.svelte';
  import { groupedHistoryAt } from '../src/lib/eventHistory.js';
  import PersonDetail from './PersonDetail.svelte';
  import ItemDetail from './ItemDetail.svelte';
  import DialogRouter from './DialogRouter.svelte';
  import InventoryView from './InventoryView.svelte';
  import PeopleView from './PeopleView.svelte';
  import LedgerView from './LedgerView.svelte';
  import ActionIcon from '../src/components/ActionIcon.svelte';
  import StorageView from './StorageView.svelte';
  import PortableVersions from './PortableVersions.svelte';
  import ServerSession from './ServerSession.svelte';
  import NotificationStack from './NotificationStack.svelte';
  import { notifications } from '../src/lib/notifications.js';
  const SERVER_MODE = import.meta.env.VITE_HAUSSTAND_SERVER_MODE === 'true';
  const autoLanguage = resolveLocale('auto', typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language]));

  const navigation = [
    { id: 'overview', icon: 'home' },
    { id: 'items', icon: 'box' },
    { id: 'people', icon: 'people' },
    { id: 'money', icon: 'arrows' },
    { id: 'activity', icon: 'list' }
  ];
  let localReady = false;
  let mounted = false;
  let disconnectRouteHistory;
  function syncRouteConnection(ready) {
    if(ready && !disconnectRouteHistory) disconnectRouteHistory=connectRouteHistory(window,appState,()=>{
      mobileMoreOpen=false;
      window.scrollTo({top:0,behavior:'instant'});
    });
    else if(!ready && disconnectRouteHistory) { disconnectRouteHistory(); disconnectRouteHistory=undefined; }
  }
  $: syncRouteConnection(mounted && (SERVER_MODE ? serverAuthenticated : localReady));
  $: activeSection = routeSection(route);
  let showJson = false;
  let resetOpen = false;
  let resetTrigger;
  let mobileMoreOpen = false;
  let storageView;
  let serverSession;
  let serverAuthenticated = false;
  let serverEditing = false;
  let serverSaving = false;
  let mailRetryRevision = null;
  let onlineEditing = false;
  let onlineProjectOpen = false;
  let storageBusy = false;
  let timeTravelControl;
  let dateToggleButton;
  let historyOpen=false;
  let historyTrigger;
  $: sessionLog = ($appState, appState.sessionLog());
  $: undoDescription = sessionChangeText(sessionLog.entries[sessionLog.cursor-1],$locale);
  $: redoDescription = sessionChangeText(sessionLog.entries[sessionLog.cursor],$locale);
  function openHistory(event) {
    historyTrigger=event.currentTarget;
    appState.dismissDatePicker();
    historyOpen=true;
  }
  function closeHistory() {
    historyOpen=false;
    tick().then(()=>historyTrigger?.focus());
  }
  function jumpHistory(index) {
    if (!appState.jumpHistory(index)) notifications.notify($translate('sessionLog.jumpFailed'),{kind:'error'});
  }
  let adminToken = '';
  let updateBusy = false;
  let updateStatus = '';
  let currentRelease = '';
  let releases = [];
  let selectedRelease = '';
  let updateLoaded = false;
  function resetReleaseList() {
    releases = []; selectedRelease = ''; currentRelease = ''; updateLoaded = false; updateStatus = '';
  }
  async function updateRequest(action, body = {}) {
    const response = await fetch(location.pathname + '?api=' + action, {
      method: 'POST', headers: { 'Content-Type':'application/json', 'X-Hausstand-Admin':adminToken, 'X-Requested-With':'Hausstandsliste' },
      body: JSON.stringify(body), cache:'no-store'
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      const code = data.errorCode;
      const known = ['admin','rateLimit','rateStorage','method','origin','curl','github','selection','integrity','inlineConfig','php','invalidArtifact','incompatible','storage','lock','editing','backup','rollback'];
      throw new Error($translate(known.includes(code) ? 'update.error.' + code : 'session.updateFailed'));
    }
    return data;
  }
  async function checkServerReleases() {
    if (!adminToken.trim() || updateBusy) return;
    resetReleaseList(); updateBusy = true;
    try {
      const data = await updateRequest('update-list');
      currentRelease = data.current; releases = data.releases; updateLoaded = true;
    } catch (error) { updateStatus = error.message || $translate('session.updateFailed'); }
    finally { updateBusy = false; }
  }
  function releaseIsDowngrade(tag) {
    const index = releases.findIndex(r => r.tag === currentRelease);
    return index < 0 || releases.findIndex(r => r.tag === tag) > index;
  }
  async function installServerRelease() {
    if (updateBusy || storageBusy || serverEditing || $appState.dirty || !selectedRelease || !adminToken.trim()) return;
    const target = releases.find(r => r.tag === selectedRelease);
    if (!target || !target.verifiedDigest || target.tag === currentRelease) return;
    const warning = releaseIsDowngrade(target.tag) ? '\n\n' + $translate('update.downgradeWarning') : '';
    if (!confirm($translate('update.confirm',{current:currentRelease,target:target.tag}) + warning)) return;
    updateBusy = true; updateStatus = '';
    try {
      const data = await updateRequest('update', {tag:target.tag,current:currentRelease});
      updateStatus = $translate('session.updateOk',{version:data.version});
      setTimeout(() => location.reload(), 1200);
    } catch (error) {
      updateStatus = error.message || $translate('session.updateFailed');
      updateBusy = false;
    }
  }
  function showFeedback(message, isError = false) {
    notifications.notify(message, {kind:isError ? 'error' : 'success', source:'storage'});
  }

  onMount(() => {
    mounted=true;
    const stop = locale.subscribe(language => {
      document.documentElement.lang = language;
      document.title = 'Hausstandsliste – Shared Ownership Tracker';
    });
    async function restoreLocalCopy() {
    try {
      const copy = loadWorkingCopy();
      if (copy && copy.project) {
        requireShareEventFormat(copy.project);
        if (copy.savedProject) requireShareEventFormat(copy.savedProject);
        const beforeNumbers = JSON.stringify(copy.project.itemNumberRegistry || []);
        const needsNumbers = copy.project.items.some(item=>!Number.isSafeInteger(item.number));
        await verifyPortableHistory(copy.project, () => {}, [copy.savedProject]);
        const migrated = needsNumbers || beforeNumbers !== JSON.stringify(copy.project.itemNumberRegistry || []) ||
          (copy.savedProject?.items || []).some(item=>!Number.isSafeInteger(item.number));
        appState.restoreWorkingCopy(copy, { persistMigration:migrated }); // Open at today; persist assigned numbers without an Undo entry.
      }
    } catch {
      alert($translate('errors.incompatibleWorkingCopy'));
    } finally { localReady = true; }
    }
    if (!SERVER_MODE) void restoreLocalCopy();
    const refreshDay = () => appState.syncToday(todayISO());
    // Background timers can be throttled: also refresh after tab focus.
    const clock = window.setInterval(refreshDay, 30_000);
    window.addEventListener('focus', refreshDay);
    document.addEventListener('visibilitychange', refreshDay);
    refreshDay();
    return () => {
      syncRouteConnection(false);
      stop();
      window.clearInterval(clock);
      window.removeEventListener('focus', refreshDay);
      document.removeEventListener('visibilitychange', refreshDay);
    };
  });

  $: route = $appState.route;
  $: personEntry = route.page === 'person' ? ($projection.allPeople.find(p => p.id === route.id) || $projection.peopleById.get(route.id)) : null;
  $: person = personEntry ? { holdings: [], totalValue: 0, ...personEntry } : null;
  $: item = route.page === 'item' ? $projection.items.find(i => i.id === route.id) : null;
  $: drafts = $appState.project.drafts || [];
  $: dates = eventDates($appState.project);
  $: firstDate = dates[0] || null;
  $: lastDate = dates[dates.length - 1] || null;
  $: today = todayISO();
  $: dateMode = $appState.asOfDate > today ? 'future' : $appState.asOfDate < today ? 'past' : 'today';
  $: recentHistory = groupedHistoryAt($appState.project.events, $appState.asOfDate);
  $: latestEvents = recentHistory.recent;
  $: futureEventCount = recentHistory.futureEventCount;
  $: balances = $ledger.simplified || [];
  $: overviewItems = rankedItems($projection.activeItems, $locale).slice(0,20);
  $: overviewPeople = nameEntries($projection.people.filter(p=>p.active), $locale);

  function personName(id) { return $appState.project.people.find(p => p.id === id)?.name || $translate('ui.unknown-1qdpc2x'); }
  function navigate(id) {
    appState.dismissDatePicker();
    mobileMoreOpen = false;
    appState.setRoute({page:'dashboard',section:id});
  }
  function goToDetailReturn() {
    appState.setRoute({ page: 'dashboard', section:activeSection });
  }
  function warnUnsavedBeforeLeaving(event) {
    if (!$appState.dirty) return;
    // Browser-controlled warning: local working copies and unfinished PHP
    // checkouts are not a replacement for explicit Save.
    event.preventDefault();
    event.returnValue = '';
  }
  async function showDatePicker() {
    if ($appState.datePickerOpen) {
      appState.dismissDatePicker();
      return;
    }
    appState.openDatePicker();
    await tick();
    document.getElementById('state-date')?.focus();
  }
  function dismissPicker(restoreFocus = false) {
    appState.dismissDatePicker();
    if (restoreFocus) tick().then(() => dateToggleButton?.focus());
  }
  function handleOutsidePointer(event) {
    if ($appState.datePickerOpen && !timeTravelControl?.contains(event.target)) {
      appState.dismissDatePicker();
    }
  }
  function returnToday() {
    appState.exitTimeTravel();
    tick().then(() => dateToggleButton?.focus());
  }
  function handleKeydown(e) {
    const shortcut = historyShortcut(e, !!$appState.activeDialog || historyOpen || resetOpen);
    if (shortcut) {
      const changed = shortcut === 'undo' ? appState.undo() : appState.redo();
      if (changed) e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && mobileMoreOpen) { mobileMoreOpen = false; return; }
    if (e.key === 'Escape' && $appState.datePickerOpen) { e.preventDefault(); dismissPicker(true); }
  }
  async function saveNow() {
    if (storageBusy) return;
    if (SERVER_MODE) { await serverSession?.save(); return; }
    const result = await storageView?.saveFromHeader?.();
    if (result?.handled) {
      if (result.message) showFeedback(result.message, result.ok === false);
      return;
    }
    navigate('save');
  }
  function openReset(event) {
    if (storageBusy || !appState.requireEditing()) return;
    resetTrigger = event.currentTarget;
    appState.dismissDatePicker();
    resetOpen = true;
  }
  function closeReset() {
    resetOpen = false;
    tick().then(() => resetTrigger?.focus());
  }
  async function resetProject() {
    if (storageBusy || !appState.requireEditing()) return false;
    if (SERVER_MODE) {
      if (!(await serverSession?.resetProject())) return false;
    } else {
      if (storageView?.prepareToReplace?.() === false) return false;
      try { if (!appState.newProject()) return false; }
      catch { notifications.notify($translate('reset.failed'), {kind:'error'}); return false; }
      notifications.notify($translate('reset.success'), {kind:'success'});
    }
    resetOpen = false; historyOpen = false; showJson = false;
    navigate('overview');
    return true;
  }
</script>

<svelte:window on:keydown={handleKeydown} on:pointerdown={handleOutsidePointer} on:beforeunload={warnUnsavedBeforeLeaving} on:focusin={prepareDialogNumber} on:focusout={finishDialogNumber} />

<NotificationStack/>

{#if SERVER_MODE}
  <ServerSession bind:this={serverSession} bind:authenticated={serverAuthenticated} bind:editing={serverEditing} bind:saving={serverSaving} bind:mailRetryRevision={mailRetryRevision} bind:busy={storageBusy}/>
{/if}
{#if (SERVER_MODE && serverAuthenticated) || (!SERVER_MODE && localReady)}
<div class="app-shell">
  <aside class="sidebar" aria-label={$translate('nav.primary')}>
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">H</span>
      <div class="brand-name"><strong>Hausstandsliste</strong><span>Shared Ownership Tracker</span></div>
    </div>
    
    <nav class="sidebar-links" aria-label={$translate('nav.sections')}>
      {#each navigation as nav (nav.id)}
        <button class:nav-active={route.page === 'dashboard' && activeSection === nav.id} aria-current={route.page === 'dashboard' && activeSection === nav.id ? 'page' : undefined} on:click={() => navigate(nav.id)}>
          <span class="nav-glyph"><ActionIcon name={nav.icon} size={20}/></span><span>{$translate('nav.' + nav.id)}</span>
        </button>
      {/each}
    </nav>
    <div class="sidebar-bottom">
      <button class:nav-active={route.page === 'dashboard' && activeSection === 'save'} on:click={() => navigate('save')} aria-current={route.page === 'dashboard' && activeSection === 'save' ? 'page' : undefined}><span class="nav-glyph" aria-hidden="true">⇩</span> {$translate("nav.save")}</button>
      <button class:nav-active={route.page === 'dashboard' && activeSection === 'settings'} on:click={() => navigate('settings')} aria-current={route.page === 'dashboard' && activeSection === 'settings' ? 'page' : undefined}><span class="nav-glyph" aria-hidden="true">⚙</span> {$translate("nav.settings")}</button>
      
    </div>
  </aside>

  <div class="main-column">
    <header class="app-header" class:header-in-time-travel={$appState.timeTravelActive}>
      <div class="header-context">
        
        <button type="button" class="household-rename" title={$translate('household.rename')} aria-label={$translate('household.rename') + ': ' + ($appState.project.community?.name || $translate('app.household'))} aria-haspopup="dialog" on:click={() => appState.setDialog({type:'householdRename'})}>
          <strong>{$appState.project.community?.name || $translate('app.household')}</strong><ActionIcon name="edit" size={16}/>
        </button>
        {#if SERVER_MODE}<span class="server-mode-label" title={$translate(serverEditing ? 'session.editing' : 'session.readOnly')}>{$translate(serverEditing ? 'session.modeEditing' : 'session.modeReadOnly')}</span>{/if}
        <button type="button" class="mobile-session-log" aria-label={$translate($appState.dirty?'app.dirty':'app.clean')+' · '+$translate('sessionLog.title')} aria-haspopup="dialog" disabled={!!$appState.activeDialog || storageBusy} on:click={openHistory}><span class="status-dot" class:needs-save={$appState.dirty}></span>{$translate('sessionLog.short')}</button>
      </div>
      <div class="header-actions">
        <div class="time-travel-control" bind:this={timeTravelControl}>
          <button type="button" class="time-travel-toggle" class:time-travel-selected={$appState.timeTravelActive}
            data-period={dateMode} bind:this={dateToggleButton}
            aria-label={$appState.timeTravelActive
              ? $translate('app.openTimeTravel') + ': ' + formatDate($appState.asOfDate, $locale) + ' · ' + $translate(dateMode === 'past' ? 'app.past' : dateMode === 'future' ? 'app.future' : 'app.today')
              : $translate('app.openTimeTravel')}
            title={$translate('app.openTimeTravel')} aria-haspopup="dialog"
            aria-expanded={$appState.datePickerOpen} aria-controls="time-travel-panel"
            aria-pressed={$appState.timeTravelActive} on:click={showDatePicker}>
            <ActionIcon name="clock" size={19}/>
            {#if $appState.timeTravelActive}
              <span class="time-travel-selected-text">
                <span>{$translate(dateMode === 'past' ? 'app.past' : dateMode === 'future' ? 'app.future' : 'app.today')}</span>
                <strong>{formatDate($appState.asOfDate, $locale)}</strong>
              </span>
            {:else}
              <span class="time-travel-toggle-label">{$translate('app.timeTravel')}</span>
            {/if}
          </button>
          {#if $appState.datePickerOpen}
            <div id="time-travel-panel" class="time-travel-popover" data-period={dateMode}
              role="dialog" aria-label={$translate('app.pickDate')} aria-modal="false">
              <div class="time-travel-popover-title">
                <strong>{$translate('app.pickDate')}</strong>
                <button type="button" class="time-travel-close" aria-label={$translate("ui.close-1qnddid")} on:click={() => dismissPicker(true)}><ActionIcon name="close" size={18}/></button>
              </div>
              <label for="state-date">{$translate('app.dateAsOf')}</label>
              <div class="time-travel-date-row">
                <button type="button" title={$translate('app.previous')} aria-label={$translate('app.previous')}
                  on:click={() => appState.setAsOfDate(addDays($appState.asOfDate, -1))}><ActionIcon name="chevron-left" size={21}/></button>
                <input id="state-date" type="date" value={$appState.asOfDate}
                  on:change={e => appState.setAsOfDate(e.currentTarget.value)}/>
                <button type="button" title={$translate('app.next')} aria-label={$translate('app.next')}
                  on:click={() => appState.setAsOfDate(addDays($appState.asOfDate, 1))}><ActionIcon name="chevron-right" size={21}/></button>
              </div>
              <div class="time-travel-quick-actions">
                <button type="button" disabled={!firstDate} on:click={() => appState.setAsOfDate(firstDate)}>{$translate('app.first')}</button>
                <button type="button" disabled={!lastDate} on:click={() => appState.setAsOfDate(lastDate)}>{$translate('app.last')}</button>
                <button type="button" class="time-travel-today" on:click={returnToday}>{$translate('app.returnToday')}</button>
              </div>
            </div>
          {/if}
        </div>
        <div class="session-history-actions" role="group" aria-label={$translate('app.undo')}>
          <button type="button" class="session-history-button" aria-label={$translate('app.undo')+(undoDescription?': '+undoDescription:'')} title={$translate('app.undo')+(undoDescription?': '+undoDescription:'')} disabled={$appState.readOnly || !!$appState.activeDialog || !$appState.history.undoCount} on:click={() => appState.undo()}><ActionIcon name="undo" size={20}/></button>
          <button type="button" class="session-history-button" aria-label={$translate('app.redo')+(redoDescription?': '+redoDescription:'')} title={$translate('app.redo')+(redoDescription?': '+redoDescription:'')} disabled={$appState.readOnly || !!$appState.activeDialog || !$appState.history.redoCount} on:click={() => appState.redo()}><ActionIcon name="redo" size={20}/></button>
        </div>
        <button type="button" class="working-indicator" aria-haspopup="dialog" title={$translate('sessionLog.title')} disabled={!!$appState.activeDialog || storageBusy} on:click={openHistory}>
          <span class="status-dot" class:needs-save={$appState.dirty}></span>
          {$translate($appState.dirty ? 'app.dirty' : 'app.clean')}
        </button>
        {#if SERVER_MODE || !(route.page === 'dashboard' && activeSection === 'save')}
          <button class="header-save" disabled={storageBusy} aria-busy={storageBusy} on:click={saveNow}
            aria-label={SERVER_MODE ? (serverEditing ? $translate('session.finish') : $translate('storage.startEditing')) : $translate(onlineProjectOpen ? (onlineEditing ? 'storage.primaryOnline' : 'storage.startEditing') : 'storage.primaryDownload')}
            title={SERVER_MODE ? (serverEditing ? $translate('session.finish') : $translate('storage.startEditing')) : $translate(onlineProjectOpen ? (onlineEditing ? 'storage.primaryOnline' : 'storage.startEditing') : 'storage.primaryDownload')}>
            <ActionIcon name={SERVER_MODE || onlineEditing ? 'check' : 'download'} size={17}/>
            <span class="header-save-long">{SERVER_MODE ? (serverEditing ? $translate('session.finishLong') : $translate('storage.startEditing')) : $translate(onlineProjectOpen ? (onlineEditing ? 'storage.primaryOnline' : 'storage.startEditing') : 'storage.primaryDownload')}</span>
            <span class="header-save-short">{SERVER_MODE ? (serverEditing ? $translate('session.finishShort') : $translate('storage.shortEditing')) : $translate(onlineProjectOpen ? (onlineEditing ? 'storage.shortOnline' : 'storage.shortEditing') : 'storage.shortDownload')}</span>
          </button>
        {/if}
      </div>
    </header>

    {#if SERVER_MODE}
      {#if serverSaving || storageBusy}<div class="server-edit-status" role="status">{serverSaving ? $translate('session.saving') : $translate('session.working')}</div>{/if}
      {#if mailRetryRevision !== null}<div class="server-edit-status"><button type="button" class="outline-action" disabled={storageBusy} on:click={() => serverSession?.retryMail()}>{$translate('mail.retry')}</button></div>{/if}
    {/if}

    <main class="work-content">
      {#key $locale}
      {#if $appState.localCacheWarning}<p role="alert" class="inline-info warning">{$translate("ui.the-browser-could-not-cache-the-wo-1u1cj1a")}</p>{/if}
      {#if route.page === 'person' && person}
        <div class="details-top"><button class="back-link" on:click={goToDetailReturn}>← {$translate('app.backTo')} {$translate('nav.'+activeSection)}</button></div>
        <PersonDetail {person} projection={$projection} asOfDate={$appState.asOfDate} ledger={$ledger} />
      {:else if route.page === 'item' && item}
        <div class="details-top"><button class="back-link" on:click={goToDetailReturn}>← {$translate('app.backTo')} {$translate('nav.'+activeSection)}</button></div>
        <ItemDetail {item} />
      {:else if route.page !== 'dashboard'}
        <div class="blank-card"><p>{$translate("ui.this-detail-view-could-not-be-foun-d4faaj")}</p><button on:click={() => navigate('overview')}>{$translate("ui.back-to-overview-h1kkqo")}</button></div>
      {:else if activeSection === 'overview'}
        <section class="page-heading">
          <div><h1>{$translate("nav.overview")}</h1></div>
        </section>

        <section class="ux-panel overview-total" data-metric="value">
          <span>{$translate("app.totalValue")}</span>
          <strong>{money($projection.totalValue)}</strong>
        </section>

        <div class="overview-directory-grid">
          <section class="ux-panel overview-directory" data-metric="items">
            <div class="section-header">
              <h2>{$translate("nav.items")}</h2>
              <button class="text-action metric-link" type="button" on:click={() => navigate("items")}>{$translate("overview.allItems")} <ActionIcon name="chevron-right" size={16}/></button>
            </div>
            <div class="overview-directory-actions">
              <button class="outline-action" data-overview-action="itemAdd" type="button" on:click={() => appState.setDialog({ type: 'itemAdd' })}><ActionIcon name="plus" size={16}/>{$translate("app.itemAdd")}</button>
              <button class="outline-action" data-overview-action="transfer" type="button" on:click={() => appState.startRedistribution()}><ActionIcon name="arrows" size={16}/>{$translate("app.transfer")}</button>
            </div>
            {#if overviewItems.length}
              <ul class="overview-entry-list">
                {#each overviewItems as item (item.id)}
                  <li><button class="overview-entry" data-overview-item={item.id} type="button" on:click={() => appState.setRoute({page:'item',id:item.id})}>
                    <span class="overview-entry-name">{item.name}</span><strong>{money(item.value)}</strong>
                  </button></li>
                {/each}
              </ul>
              {#if $projection.activeItems.length > 20}
                <button class="text-action overview-more" type="button" on:click={() => navigate("items")}>{$translate('overview.more',{count:$projection.activeItems.length-20})}</button>
              {/if}
            {:else}
              <p class="metric-empty">{$translate('overview.noItems')}</p>
            {/if}
          </section>
          <section class="ux-panel overview-directory" data-metric="people">
            <div class="section-header">
              <h2>{$translate("nav.people")}</h2>
              <button class="text-action metric-link" type="button" on:click={() => navigate("people")}>{$translate("overview.allPeople")} <ActionIcon name="chevron-right" size={16}/></button>
            </div>
            <div class="overview-directory-actions">
              <button class="outline-action" data-overview-action="personAdd" type="button" on:click={() => appState.setDialog({ type: 'personAdd' })}><ActionIcon name="person-add" size={16}/>{$translate("app.personAdd")}</button>
            </div>
            {#if overviewPeople.length}
              <ul class="overview-entry-list">
                {#each overviewPeople as person (person.id)}
                  <li><button class="overview-entry" data-overview-person={person.id} type="button" on:click={() => appState.setRoute({page:'person',id:person.id})}><span class="overview-entry-name">{person.name}</span><ActionIcon name="chevron-right" size={16}/></button></li>
                {/each}
              </ul>
            {:else}
              <p class="metric-empty">{$translate('overview.noPeople')}</p>
            {/if}
          </section>
        </div>
        <div class="overview-settlement">
          <section class="ux-panel financial-overview">
            <div class="section-header"><div class="help-heading"><h2>{$translate("app.suggestions")}</h2></div><button class="text-action" on:click={() => navigate('money')}>{$translate("app.viewAll")}</button></div>
            {#if balances.length}
              <p class="context-note">{$translate("help.suggestionsShort")}</p>
              <div class="simple-debts">
                {#each balances.slice(0,5) as b}
                  <div class="debt-row action-card">
                  <span>{$translate("help.paymentRoute",{from:personName(b.fromPersonId),to:personName(b.toPersonId)})}</span>
                  <strong>{money(b.amountCents / 100)}</strong>
                  <button class="debt-action card-primary" type="button" on:click={() => appState.setDialog({type:'settlementAdd',payerPersonId:b.fromPersonId,recipientPersonId:b.toPersonId,amountCents:b.amountCents})}><ActionIcon name="wallet" size={16}/>{$translate("app.settle")}</button>
                </div>
                {/each}
              </div>
              {#if balances.length > 5}<p class="muted">{pluralMessage('app.moreSuggestions', balances.length-5)}</p>{/if}
            {:else}
              <div class="gentle-empty"><strong>{$translate("app.settled")}</strong></div>
            {/if}
          </section>
        </div>
        <div class="overview-layout second-row" class:only-recent={!drafts.length}>
          <section class="ux-panel">
            <div class="section-header"><div><h2>{$translate("app.recent")}</h2></div><button class="text-action" on:click={() => navigate('activity')}>{$translate("app.viewActivity")}</button></div>
            <p class="recent-range">{$translate('app.recentRange', {shown:latestEvents.length,total:recentHistory.past.length,date:formatDate($appState.asOfDate,$locale)})}</p>
            <Timeline project={$appState.project} asOfDate={$appState.asOfDate} preview={true}/>
            {#if futureEventCount}<p class="recent-range">{pluralMessage('app.futureEvents',futureEventCount,$locale)}</p>{/if}
          </section>
          {#if drafts.length}
          <section class="ux-panel">
            <div class="section-header"><div><h2>{$translate("app.drafts")}</h2></div></div>
              <div class="draft-list">
                {#each drafts as draft (draft.id)}
                  <div class="draft-row action-card">
                    <div><strong>{draft.title || draft.data?.name || $translate("ui.untitled-draft-1uj507g")}</strong><small>{draft.type === 'redistribution' ? $translate("app.transfer") : $translate("ui.record-item-1dj7z2m")}</small></div>
                    <div class="draft-buttons">
                      <button class="card-primary" type="button" on:click={() => appState.setDialog({type:draft.type==='redistribution'?'redistributionEdit':'itemAdd',id:draft.id})}>{$translate("app.continue")}</button>
                      <button class="subtle-danger card-secondary" type="button" title={$translate("ui.delete-draft-eyd06t")} aria-label={$translate("ui.delete-draft-eyd06t")} on:click={() => { if (appState.requireEditing() && confirm($translate("ui.delete-this-draft-1eyj6m4"))) appState.deleteDraft(draft.id); }}>×</button>
                    </div>
                  </div>
                {/each}
              </div>
          </section>
          {/if}
        </div>
      {:else if activeSection === 'items'}
        <div class="page-heading"><div><h1>{$translate("nav.items")}</h1></div><button class="solid-action" on:click={() => appState.setDialog({type:'itemAdd'})}>＋ {$translate("app.itemAdd")}</button></div>
        <InventoryView items={$projection.activeItems} archived={$projection.archivedItems} tags={$projection.allTags}/>
      {:else if activeSection === 'people'}
        <div class="page-heading"><div><h1>{$translate("nav.people")}</h1></div><button class="solid-action" on:click={() => appState.setDialog({type:'personAdd'})}>＋ {$translate("app.personAdd")}</button></div>
        <PeopleView people={$projection.people} ledger={$ledger}/>
      {:else if activeSection === 'money'}
        <div class="page-heading"><div class="help-heading"><h1>{$translate("nav.money")}</h1></div></div>
        <LedgerView project={$appState.project} data={$ledger} asOfDate={$appState.asOfDate}/>
      {:else if activeSection === 'activity'}
        <div class="page-heading"><div><h1>{$translate("nav.activity")}</h1></div></div>
        {#if futureEventCount}<div class="inline-info">{pluralMessage('app.futureEvents', futureEventCount)}</div>{/if}
        <Timeline project={$appState.project} asOfDate={$appState.asOfDate} title={$translate('app.allChanges')} full={true}/>
      {:else if activeSection === 'save'}
        <div class="page-heading"><div><h1>{$translate('storage.pageTitle')}</h1></div></div>
        {#if SERVER_MODE}
          <div class="server-save-panels">
          <section class="ux-panel setting-panel">
            <h2>{$translate('session.backup')}</h2>
            <p>{$translate('session.backupHint')}</p>
            <button type="button" class="outline-action" disabled={storageBusy} on:click={() => serverSession?.downloadBackup()}>{$translate('session.backupDownload')}</button>
            <label>{$translate('session.backupUpload')}<input type="file" accept="application/json,.json" disabled={storageBusy} on:change={event => serverSession?.restoreBackup(event)} /></label>
          </section>
          <PortableVersions busy={storageBusy}/>
          </div>
        {/if}
      {:else if activeSection === 'settings'}
        <div class="page-heading"><div><h1>{$translate("nav.settings")}</h1></div></div>
        <section class="ux-panel setting-panel">
          <label for="language-selection">{$translate('language.title')}</label>
          <select id="language-selection" value={$languagePreference} on:change={e => setLanguage(e.currentTarget.value)}>
            <option value="auto">{$translate('language.auto')} ({autoLanguage === 'de' ? $translate('language.german') : $translate('language.english')})</option>
            <option value="en">English</option>
            <option value="de">Deutsch</option>
          </select>
        </section>
        {#if SERVER_MODE}
          <section class="ux-panel setting-panel"><h2>{$translate('session.backup')}</h2><button type="button" class="outline-action" on:click={() => navigate('save')}>{$translate('nav.save')}</button></section>
          <section class="ux-panel setting-panel">
            <h2>{$translate('session.update')}</h2>
            <label for="server-admin-token">{$translate('session.admin')}</label>
            <input id="server-admin-token" type="password" autocomplete="current-password" bind:value={adminToken} disabled={updateBusy} on:input={resetReleaseList} />
            <button class="outline-action" disabled={updateBusy || !adminToken.trim()} on:click={checkServerReleases}>{$translate(updateBusy && !updateLoaded ? 'session.updateChecking' : 'update.check')}</button>
            {#if updateLoaded}
              <p>{$translate('update.current',{version:currentRelease})}</p>
              {#if !releases.length}<p>{$translate('update.empty')}</p>{/if}
              <fieldset class="release-options">
                <legend>{$translate('update.choose')}</legend>
                {#each releases as release (release.tag)}
                  <div class="setting-advanced-block">
                    <label><input type="radio" name="target-release" value={release.tag} bind:group={selectedRelease}
                      disabled={updateBusy || release.tag === currentRelease || !release.verifiedDigest}/> <strong>{release.tag}</strong>
                      <span> · {formatDate(release.publishedAt.slice(0,10),$locale)}</span></label>
                    {#if release.tag === currentRelease}<p class="muted">{$translate('update.installed')}</p>
                    {:else if !release.verifiedDigest}<p class="muted">{$translate('update.error.integrity')}</p>
                    {:else if releaseIsDowngrade(release.tag)}<p class="muted">{$translate('update.downgrade')}</p>{/if}
                    <details><summary>{$translate('update.notes')}</summary><p style="white-space:pre-wrap;overflow-wrap:anywhere">{release.notes || $translate('update.noNotes')}</p></details>
                  </div>
                {/each}
              </fieldset>
              {#if serverEditing || $appState.dirty}<p class="inline-info">{$translate('update.error.editing')}</p>{/if}
              <button class="outline-action" disabled={updateBusy || storageBusy || serverEditing || $appState.dirty || !selectedRelease}
                on:click={installServerRelease}>{$translate(updateBusy ? 'update.installing' : 'update.install')}</button>
            {/if}
            {#if updateStatus}<p role="status">{updateStatus}</p>{/if}
          </section>
          <section class="ux-panel setting-panel"><h2>{$translate('session.login')}</h2><button type="button" class="outline-action" disabled={storageBusy} on:click={() => serverSession?.logout()}>{$translate('session.logout')}</button></section>
        {/if}
        <section class="ux-panel setting-panel settings-advanced" aria-label={$translate('settings.advanced')}>
          <div class="settings-advanced-body">
            <section class="setting-advanced-block">
              <div class="section-header"><div class="help-heading"><h2>{$translate("app.inspect")}</h2></div></div>
              <button class="outline-action" aria-expanded={showJson} on:click={() => showJson = !showJson}>{showJson ? $translate('app.technicalClose') : $translate('app.technicalOpen')}</button>
              {#if showJson}<pre class="json-preview">{JSON.stringify(exportProject($appState.project, $appState.asOfDate), null, 2)}</pre>{/if}
            </section>
            <section class="setting-advanced-block dangerous-settings">
              <div class="section-header"><h2>{$translate('reset.testOnly')}</h2></div>
              <button type="button" class="dangerous-button" disabled={storageBusy} on:click={openReset}>{$translate('reset.action')}</button>
            </section>
          </div>
        </section>
      {/if}
      {/key}
      <!-- Keep the collaborative-storage component mounted: the server lease, edit token,
           selected remote file and password must survive tab/detail navigation. -->
      {#if !SERVER_MODE}<div class:storage-not-visible={route.page !== 'dashboard' || activeSection !== 'save'}>
        <StorageView bind:this={storageView} bind:onlineEditing bind:onlineProjectOpen bind:busy={storageBusy} onProjectLoaded={() => navigate('overview')}/>
      </div>{/if}
    </main>
  </div>
</div>
<!-- Mobile quick navigation: a stable bottom bar with all other areas in Mehr. -->
<nav class="mobile-bottom-nav" aria-label={$translate('nav.mobile')}>
  {#each navigation.slice(0,4) as nav (nav.id)}
    <button type="button" class:nav-active={activeSection === nav.id}
      aria-current={activeSection === nav.id ? 'page' : undefined} on:click={() => navigate(nav.id)}>
      <span class="mobile-nav-icon"><ActionIcon name={nav.icon} size={23}/></span>
      <span class="mobile-nav-label">{$translate(nav.id === 'overview' ? 'nav.home' : nav.id === 'items' ? 'nav.things' : nav.id === 'people' ? 'nav.people' : 'nav.cash')}</span>
    </button>
  {/each}
  <div class="mobile-more-slot">
    {#if mobileMoreOpen}
      <div class="mobile-more-menu" id="mobile-more-menu">
        <button type="button" class:nav-active={activeSection === 'activity'} on:click={() => navigate('activity')}><ActionIcon name="list" size={20}/> {$translate("nav.activity")}</button>
        <button type="button" class:nav-active={activeSection === 'save'} on:click={() => navigate('save')}><ActionIcon name="download" size={20}/> {$translate("nav.save")}</button>
        <button type="button" class:nav-active={activeSection === 'settings'} on:click={() => navigate('settings')}><ActionIcon name="settings" size={20}/> {$translate("nav.settings")}</button>
      </div>
    {/if}
    <button type="button" class:nav-active={['activity','save','settings'].includes(activeSection)}
      aria-expanded={mobileMoreOpen} aria-controls="mobile-more-menu"
      aria-label={mobileMoreOpen ? $translate("ui.close-more-sections-eo21c3") : $translate("ui.open-more-sections-ytrtqo")}
      on:click={() => mobileMoreOpen = !mobileMoreOpen}>
      <span class="mobile-nav-icon" aria-hidden="true">{mobileMoreOpen ? '×' : '⋯'}</span>
      <span class="mobile-nav-label">{$translate("nav.more")}</span>
    </button>
  </div>
</nav>
{#if resetOpen}<ResetProjectDialog server={SERVER_MODE} reset={resetProject} close={closeReset}/>{/if}
{#if historyOpen}<SessionHistoryDialog log={sessionLog} locked={$appState.readOnly || storageBusy || !!$appState.activeDialog} jump={jumpHistory} close={closeHistory}/>{/if}
<!-- A primitive session key changes only on intentional dialog transitions. -->
{#key $appState.activeDialog ? $appState.dialogRevision : null}
  <DialogRouter dialog={$appState.activeDialog} project={$appState.project} projection={$projection} asOfDate={$appState.asOfDate}/>
{/key}
{/if}
