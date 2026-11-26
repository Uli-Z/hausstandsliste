<script>
  import { onMount, tick } from 'svelte';
  import { locale, languagePreference, setLanguage, resolveLocale, translate, pluralMessage, formatDate } from '../src/lib/i18n.js';
  import { prepareDialogNumber, finishDialogNumber } from './form-behavior.js';
  import { appState, projection, ledger } from '../src/stores/projectStore.js';
  import { loadWorkingCopy, exportProject } from '../src/lib/persistence.js';
  import { historyShortcut } from '../src/lib/sessionUndo.js';
  import { money } from '../src/lib/domain.js';
  import { requireShareEventFormat } from '../src/lib/shareUnits.js';
  import { addDays, eventDates, todayISO, dateDE } from '../src/lib/util.js';
  import Timeline from './Timeline.svelte';
  import PersonDetail from './PersonDetail.svelte';
  import ItemDetail from './ItemDetail.svelte';
  import DialogRouter from './DialogRouter.svelte';
  import InventoryView from './InventoryView.svelte';
  import PeopleView from './PeopleView.svelte';
  import LedgerView from './LedgerView.svelte';
  import HelpTip from '../src/components/HelpTip.svelte';
  import ActionIcon from '../src/components/ActionIcon.svelte';
  import StorageView from './StorageView.svelte';
  const SERVER_MODE = import.meta.env.VITE_HAUSSTAND_SERVER_MODE === 'true';
  const autoLanguage = resolveLocale('auto', typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language]));

  const navigation = [
    { id: 'overview', icon: 'home' },
    { id: 'items', icon: 'box' },
    { id: 'people', icon: 'people' },
    { id: 'money', icon: 'arrows' },
    { id: 'activity', icon: 'list' }
  ];
  let activeSection = 'overview';
  let showJson = false;
  let showDanger = false;
  let mobileMoreOpen = false;
  let storageView;
  let onlineEditing = false;
  let onlineProjectOpen = false;
  let storageBusy = false;
  let saveMessage = '';
  let saveMessageError = false;
  let feedbackTimer;
  let timeTravelControl;
  let dateToggleButton;
  function dismissFeedback() {
    if (feedbackTimer) window.clearTimeout(feedbackTimer);
    feedbackTimer = undefined;
    saveMessage = '';
  }
  function showFeedback(message, isError = false) {
    dismissFeedback();
    saveMessage = message;
    saveMessageError = isError;
    // Success is a brief, non-blocking notification. Errors remain until dismissed.
    if (!isError) feedbackTimer = window.setTimeout(() => { saveMessage = ''; feedbackTimer = undefined; }, 4500);
  }

  onMount(() => {
    const stop = locale.subscribe(language => {
      document.documentElement.lang = language;
      document.title = 'Hausstandsliste – Shared Ownership Tracker';
    });
    try {
      const copy = loadWorkingCopy();
      if (copy && copy.project) {
        requireShareEventFormat(copy.project);
        if (copy.savedProject) requireShareEventFormat(copy.savedProject);
        appState.restoreWorkingCopy(copy); // The view always opens at today, never at a stale historical date.
      }
    } catch {
      alert($translate('errors.incompatibleWorkingCopy'));
    }
    const refreshDay = () => appState.syncToday(todayISO());
    // Background timers can be throttled: also refresh after tab focus.
    const clock = window.setInterval(refreshDay, 30_000);
    window.addEventListener('focus', refreshDay);
    document.addEventListener('visibilitychange', refreshDay);
    refreshDay();
    return () => {
      stop();
      window.clearInterval(clock);
      window.removeEventListener('focus', refreshDay);
      document.removeEventListener('visibilitychange', refreshDay);
      if (feedbackTimer) window.clearTimeout(feedbackTimer);
    };
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

  function personName(id) { return $appState.project.people.find(p => p.id === id)?.name || $translate('ui.unknown-1qdpc2x'); }
  function itemName(id) { return $appState.project.items.find(i => i.id === id)?.name || $translate('timeline.unknownItem'); }
  function eventName(e) {
    if (e.type === 'item-added') return $translate("ui.item-recorded-sylo1j") + " " + (e.name || itemName(e.itemId));
    if (e.type === 'item-ended') return $translate("ui.item-archived-132z2tu") + " " + itemName(e.itemId);
    if (e.type === 'person-added') return $translate("ui.person-added-1bh7i23") + " " + (e.name || personName(e.personId));
    if (e.type === 'person-deactivated') return $translate("ui.person-left-1bmnpom") + " " + personName(e.personId);
    if (e.type === 'person-reactivated') return $translate("ui.person-rejoined-1rgz8oi") + " " + personName(e.personId);
    if (e.type === 'redistribution-executed') return $translate("ui.shares-changed-fw5fph") + " " + (e.title || $translate('timeline.genericTransfer'));
    if (e.type === 'shares-set') return $translate("ui.shares-changed-fw5fph") + " " + itemName(e.itemId);
    if (e.type === 'claim-settlement-recorded') return $translate('timeline.summaryPayment', { kind: $translate(e.settlementKind === 'paid' ? 'timeline.payment' : e.settlementKind === 'external' ? 'timeline.external' : 'timeline.waiver'), from: personName(e.debtorPersonId), to: personName(e.creditorPersonId), amount: money(e.amountCents / 100) });
    return e.title || e.note || $translate('timeline.genericChange');
  }
  function navigate(id) {
    appState.dismissDatePicker();
    dismissFeedback();
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
    const shortcut = historyShortcut(e, !!$appState.activeDialog);
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
    const result = await storageView?.saveFromHeader?.();
    if (result?.handled) {
      if (result.message) showFeedback(result.message, result.ok === false);
      return;
    }
    navigate('save');
  }
  function newProject() {
    if (!confirm($translate("ui.start-a-new-project-the-current-wo-1m8g44d"))) return;
    if (storageView?.prepareToReplace?.() === false) return;
    appState.newProject();
    navigate('overview');
  }
</script>

<svelte:window on:keydown={handleKeydown} on:pointerdown={handleOutsidePointer} on:beforeunload={warnUnsavedBeforeLeaving} on:focusin={prepareDialogNumber} on:focusout={finishDialogNumber} />

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
        
        <strong><span class="mobile-header-brand">Hausstandsliste · </span>{$appState.project.community?.name || 'Meine Hausgemeinschaft'}</strong>
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
          <button type="button" class="session-history-button" aria-label={$translate('app.undo')} title={$translate("app.undo")} disabled={$appState.readOnly || !!$appState.activeDialog || !$appState.history.undoCount} on:click={() => appState.undo()}><ActionIcon name="undo" size={20}/></button>
          <button type="button" class="session-history-button" aria-label={$translate('app.redo')} title={$translate("app.redo")} disabled={$appState.readOnly || !!$appState.activeDialog || !$appState.history.redoCount} on:click={() => appState.redo()}><ActionIcon name="redo" size={20}/></button>
        </div>
        <span class="working-indicator" title={$translate($appState.secure ? 'app.protectedTooltip' : 'app.localTooltip')}>
          <span class="status-dot" class:needs-save={$appState.dirty}></span>
          {$translate($appState.dirty ? 'app.dirty' : 'app.clean')}
        </span>
        {#if !(route.page === 'dashboard' && activeSection === 'save')}
          <button class="header-save" disabled={storageBusy} on:click={saveNow}
            aria-label={$translate(onlineProjectOpen ? (onlineEditing ? 'storage.primaryOnline' : 'storage.startEditing') : 'storage.primaryDownload')}
            title={$translate(onlineProjectOpen ? (onlineEditing ? 'storage.primaryOnline' : 'storage.startEditing') : 'storage.primaryDownload')}>
            <ActionIcon name={onlineEditing ? 'check' : 'download'} size={17}/>
            <span class="header-save-long">{$translate(onlineProjectOpen ? (onlineEditing ? 'storage.primaryOnline' : 'storage.startEditing') : 'storage.primaryDownload')}</span>
            <span class="header-save-short">{$translate(onlineProjectOpen ? (onlineEditing ? 'storage.shortOnline' : 'storage.shortEditing') : 'storage.shortDownload')}</span>
          </button>
        {/if}
      </div>
    </header>

    {#if saveMessage}
      <div class="save-feedback" class:save-feedback-error={saveMessageError}
        role={saveMessageError ? 'alert' : 'status'}>
        <span>{saveMessage}</span>
        <button type="button" on:click={dismissFeedback} aria-label={$translate("ui.close-1qnddid")}>
          <ActionIcon name="close" size={17}/>
        </button>
      </div>
    {/if}
    <main class="work-content">
      {#key $locale}
      {#if $appState.localCacheWarning}<p role="alert" class="inline-info warning">{$translate("ui.the-browser-could-not-cache-the-wo-1u1cj1a")}</p>{/if}
      {#if route.page === 'person' && person}
        <div class="details-top"><button class="back-link" on:click={goToDetailReturn}>← {$translate('app.backTo')} {$translate(activeSection === 'people' ? 'nav.people' : 'nav.overview')}</button></div>
        <PersonDetail {person} projection={$projection} asOfDate={$appState.asOfDate} ledger={$ledger} />
      {:else if route.page === 'item' && item}
        <div class="details-top"><button class="back-link" on:click={goToDetailReturn}>← {$translate('app.backTo')} {$translate(activeSection === 'items' ? 'nav.items' : 'nav.overview')}</button></div>
        <ItemDetail {item} />
      {:else if route.page !== 'dashboard'}
        <div class="blank-card"><p>{$translate("ui.this-detail-view-could-not-be-foun-d4faaj")}</p><button on:click={() => navigate('overview')}>{$translate("ui.back-to-overview-h1kkqo")}</button></div>
      {:else if activeSection === 'overview'}
        <section class="page-heading">
          <div><h1>{$translate("nav.overview")}</h1></div>
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
              <button on:click={() => appState.setDialog({ type: 'itemAdd' })}><span class="task-icon"><ActionIcon name="box" size={22}/></span><strong>{$translate("app.addSomething")}</strong><small>{$translate("app.recordItem")}</small></button>
              <button on:click={() => appState.startRedistribution()}><span class="task-icon"><ActionIcon name="arrows" size={22}/></span><strong>{$translate("app.transfer")}</strong><small>{$translate("app.split")}</small></button>
              <button on:click={() => appState.setDialog({ type: 'personAdd' })}><span class="task-icon"><ActionIcon name="person-add" size={22}/></span><strong>{$translate("app.personAdd")}</strong><small>{$translate("app.join")}</small></button>
              <button on:click={() => navigate('save')}><span class="task-icon"><ActionIcon name="download" size={22}/></span><strong>{$translate("app.backup")}</strong><small>{$translate("app.share")}</small></button>
            </div>
          </section>
          <section class="ux-panel financial-overview">
            <div class="section-header"><div class="help-heading"><h2>{$translate("app.suggestions")}</h2><HelpTip label={$translate("ui.how-are-settlement-suggestions-cal-6ze5l4")}>{$translate("ui.who-should-receive-a-settlement-is-5lw302")}</HelpTip></div><button class="text-action" on:click={() => navigate('money')}>{$translate("app.viewAll")}</button></div>
            {#if balances.length}
              <div class="simple-debts">
                {#each balances.slice(0,5) as b}
                  <div class="debt-row">
                  <span>{personName(b.fromPersonId)} an {personName(b.toPersonId)}</span>
                  <strong>{money(b.amountCents / 100)}</strong>
                  <button class="debt-action" on:click={() => appState.setDialog({type:'settlementAdd',payerPersonId:b.fromPersonId,recipientPersonId:b.toPersonId,amountCents:b.amountCents})} disabled={$appState.readOnly}><ActionIcon name="wallet" size={16}/>{$translate("app.settle")}</button>
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
          {#if drafts.length}
          <section class="ux-panel">
            <div class="section-header"><div><h2>{$translate("app.drafts")}</h2></div></div>
              <div class="draft-list">
                {#each drafts as draft (draft.id)}
                  <div class="draft-row">
                    <div><strong>{draft.title || draft.data?.name || $translate("ui.untitled-draft-1uj507g")}</strong><small>{draft.type === 'redistribution' ? $translate("app.transfer") : $translate("ui.record-item-1dj7z2m")}</small></div>
                    <div class="draft-buttons">
                      <button on:click={() => appState.setDialog({type:draft.type==='redistribution'?'redistributionEdit':'itemAdd',id:draft.id})}>{$translate("app.continue")}</button>
                      <button class="subtle-danger" title={$translate("ui.delete-draft-eyd06t")} aria-label={$translate("ui.delete-draft-eyd06t")} on:click={() => { if (confirm($translate("ui.delete-this-draft-1eyj6m4"))) appState.deleteDraft(draft.id); }}>×</button>
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
        <div class="page-heading"><div class="help-heading"><h1>{$translate("nav.money")}</h1><HelpTip label={$translate("ui.what-does-value-settlement-mean-9p85pk")}>{$translate("ui.when-people-finance-items-or-acquir-mc1vof")}</HelpTip></div></div>
        <LedgerView project={$appState.project} data={$ledger} asOfDate={$appState.asOfDate}/>
      {:else if activeSection === 'activity'}
        <div class="page-heading"><div><h1>{$translate("nav.activity")}</h1></div></div>
        {#if futureEventCount}<div class="inline-info">{pluralMessage('app.futureEvents', futureEventCount)}</div>{/if}
        <Timeline project={$appState.project} asOfDate={$appState.asOfDate} title={$translate('app.allChanges')}/>
      {:else if activeSection === 'save'}
        <div class="page-heading"><div><h1>{$translate('storage.pageTitle')}</h1></div></div>
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
        <details class="ux-panel setting-panel settings-advanced">
          <summary>{$translate('settings.advanced')}</summary>
          <div class="settings-advanced-body">
            <section class="setting-advanced-block">
              <div class="section-header"><div class="help-heading"><h2>{$translate("app.inspect")}</h2><HelpTip label={$translate("ui.what-does-the-technical-view-show-fofuc8")}>{$translate("ui.the-technical-view-shows-the-compl-xkqom1")}</HelpTip></div></div>
              <button class="outline-action" aria-expanded={showJson} on:click={() => showJson = !showJson}>{showJson ? $translate('app.technicalClose') : $translate('app.technicalOpen')}</button>
              {#if showJson}<pre class="json-preview">{JSON.stringify(exportProject($appState.project, $appState.asOfDate), null, 2)}</pre>{/if}
            </section>
            <section class="setting-advanced-block dangerous-settings">
              <div class="section-header"><h2>{$translate("app.newProject")}</h2></div>
              <button class="outline-action" aria-expanded={showDanger} on:click={() => showDanger = !showDanger}>{showDanger ? $translate("ui.cancel-cl4zc9") : $translate('app.reset')}</button>
              {#if showDanger}<div class="inline-info warning"><strong>{$translate("ui.the-current-state-may-be-lost-1b4b05v")}</strong> {$translate("ui.you-can-only-restore-it-from-a-pre-yyoqfw")}</div><button class="dangerous-button" disabled={storageBusy} on:click={newProject}>{$translate("ui.yes-start-a-new-project-wbff79")}</button>{/if}
            </section>
          </div>
        </details>
      {/if}
      {/key}
      <!-- Keep the collaborative-storage component mounted: the server lease, edit token,
           selected remote file and password must survive tab/detail navigation. -->
      <div class:storage-not-visible={route.page !== 'dashboard' || activeSection !== 'save'}>
        <StorageView bind:this={storageView} bind:onlineEditing bind:onlineProjectOpen bind:busy={storageBusy} onProjectLoaded={() => navigate('overview')}/>
      </div>
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
{#key $appState.activeDialog}
  <DialogRouter dialog={$appState.activeDialog} project={$appState.project} projection={$projection} asOfDate={$appState.asOfDate}/>
{/key}
