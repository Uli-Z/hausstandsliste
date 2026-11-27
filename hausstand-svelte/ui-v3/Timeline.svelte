<script>
  import { itemDisplayName } from '../src/lib/itemNames.js';
  import CompactNames from './CompactNames.svelte';
  import { tick } from 'svelte';
  import { locale } from '../src/lib/i18n.js';
  import { eventPeople } from '../src/lib/overviewNames.js';
  import { translate, localizeGermanText, pluralMessage } from '../src/lib/i18n.js';
  import { appState } from '../src/stores/projectStore.js';
  import { dateDE } from '../src/lib/util.js';
  import { splitHistoryAt, groupedHistoryAt, RECENT_HISTORY_LIMIT } from '../src/lib/eventHistory.js';
  import { money } from '../src/lib/domain.js';
  import { eventUnitChangeRows } from '../src/lib/redistribution.js';
  import OwnershipHistorySummary from './OwnershipHistorySummary.svelte';
  import { projectBeforeEvent, shareDeltasForChange } from '../src/lib/projector.js';
  import { FINANCIAL_EVENT_NOTE, ITEM_FUNDING_NOTE } from '../src/lib/financialLabels.js';
  import ActionIcon from '../src/components/ActionIcon.svelte';
  import { iconForTimelineEvent, interactionForTimelineEvent } from '../src/lib/timelineActions.js';
  export let project;
  export let asOfDate;
  export let itemId = null;
  export let personId = null;
  export let title = 'Änderungsverlauf';

  export let preview = false;
  export let full = false;
  const PAGE_SIZE = RECENT_HISTORY_LIMIT;
  let pastLimit = PAGE_SIZE;
  let futureLimit = PAGE_SIZE;
  let showFuture = false;
  let expandedEventId = null;
  let expandedGroups = new Set();
  function toggleGroup(key) {
    const next=new Set(expandedGroups);
    if(next.has(key)) next.delete(key); else next.add(key);
    expandedGroups=next;
  }
  const groupLabelKeys={
    'settlement:paid':'timeline.group.paid', 'settlement:external':'timeline.group.external', 'settlement:waived':'timeline.group.waived',
    'settlement:unknown':'timeline.group.settlement', 'item-added':'timeline.group.purchased','item-ended':'timeline.group.ended',
    'person-added':'timeline.group.arrival','person-deactivated':'timeline.group.departure','person-reactivated':'timeline.group.return',
    'shares-set':'timeline.group.shares','redistribution-executed':'timeline.group.redistribution'
  };
  function groupLabel(group) {return $translate(groupLabelKeys[group.kind] || 'timeline.group.generic',{count:group.count});}
  function groupAmount(group) {return group.totalCents===null?'':$translate(group.type==='item-added'?'timeline.group.purchaseValue':'timeline.group.amount',{amount:money(group.totalCents/100)});}

    // View-only order: newest first on either side of the time-travel cutoff.
  $: allEvents = project.events || [];
  $: peopleById = new Map((project.people || []).map(person => [person.id, person.name || person.id]));
  $: itemsById = new Map((project.items || []).map(item => [item.id, itemDisplayName(item) || item.id]));

  function personName(personId) {
    if (!personId) return localizeGermanText('Unbekannte Person');
    return peopleById.get(personId) || personId;
  }

  function itemName(itemId, fallbackName = '') {
    if (!itemId) return fallbackName || localizeGermanText('Unbekannter Gegenstand');
    return itemsById.get(itemId) || itemDisplayName({name:fallbackName || itemId,number:project.itemNumberRegistry?.find(row=>row.id===itemId)?.number});
  }

  function openPerson(personId) {
    if (!personId) return;
    appState.setRoute({ page: 'person', id: personId });
  }

  function openItem(itemId) {
    if (!itemId) return;
    appState.setRoute({ page: 'item', id: itemId });
  }

  function eventLabel(eventType) {
    return labels[eventType] ? $translate(labels[eventType]) : eventType?.replaceAll('-', ' ') || localizeGermanText('Ereignis');
  }

  function affectsPersonByShareDelta(baseProjection, change) {
    return eventUnitChangeRows(change).some(row => row.people.some(person => person.personId === personId)) ||
      shareDeltasForChange(baseProjection, change).some(row => row.personId === personId);
  }

  function eventAffectsPerson(event) {
    if (event.personId === personId) return true;
    if (event.type === 'claim-settlement-recorded') return event.debtorPersonId === personId || event.creditorPersonId === personId;
    if ((event.events || []).some(child => child.personId === personId)) return true;
    if (event.type === 'item-added' && (Number(event.purchaseContributionsCents?.[personId] || 0) > 0 || Number(event.shares?.[personId] || 0) > 0)) return true;

    if (event.type === 'shares-set') {
      const before = projectBeforeEvent(project, event.id, event.date);
      return affectsPersonByShareDelta(before, event);
    }

    if (event.type === 'redistribution-executed') {
      const before = projectBeforeEvent(project, event.id, event.date);
      return (event.events || [])
        .filter(child => child.type === 'shares-set')
        .some(child => affectsPersonByShareDelta(before, child));
    }

    return false;
  }

  $: events = allEvents.filter(e => {
    if (itemId) {
      if (e.type === 'redistribution-executed') return eventUnitChangeRows(e).some(row => row.itemId === itemId);
      return e.type !== 'claim-settlement-recorded' && e.itemId === itemId;
    }
    if (personId) return eventAffectsPerson(e);
    return true;
  });
  // Group the shared dashboard/full chronology. Person/item detail histories
  // remain individually readable and keep their established filtering behavior.
  $: grouped = preview || full;
  $: history = grouped ? groupedHistoryAt(events,asOfDate) : splitHistoryAt(events, asOfDate);
  $: future = grouped ? history.future : history.future.map(event=>({key:'event:'+event.id,date:event.date,events:[event],count:1,type:event.type}));
  $: past = grouped ? history.past : history.past.map(event=>({key:'event:'+event.id,date:event.date,events:[event],count:1,type:event.type}));
  $: visiblePast = past.slice(0, preview ? RECENT_HISTORY_LIMIT : pastLimit);
  $: visibleFuture = preview ? [] : full ? future.slice(0, futureLimit) : showFuture ? future : [];
  // A single keyed sequence keeps existing cards mounted during pagination and
  // when the selected date moves an event across the marker.
  $: rows = [
    ...visibleFuture.map(group => ({key:group.key, group})),
    ...(!preview ? [{key:'cutoff'}] : []),
    ...visiblePast.map(group => ({key:group.key, group}))
  ];
  function loadPast() { pastLimit += PAGE_SIZE; }
  function loadFuture() { futureLimit += PAGE_SIZE; }
  // The same actual button is the keyboard/manual fallback. Re-observe after
  // each batch so short pages can continue filling the viewport.
  function autoLoad(node, load) {
    if (!full || typeof IntersectionObserver === 'undefined') return {};
    let active = true;
    const observer = new IntersectionObserver(async entries => {
      if (!active || !entries.some(entry => entry.isIntersecting)) return;
      observer.unobserve(node);
      load();
      await tick();
      if (active && node.isConnected) observer.observe(node);
    });
    observer.observe(node);
    return {destroy() { active = false; observer.disconnect(); }};
  }

  const labels = {
    'redistribution-executed': 'timeline.redistribution',
    'shares-set': 'timeline.shareSet',
    'person-added': 'timeline.arrival',
    'person-deactivated': 'timeline.departure',
    'person-reactivated': 'timeline.return',
    'item-added': 'timeline.purchased',
    'item-ended': 'timeline.ended',
    'claim-settlement-recorded': 'timeline.settlement'
  };

  function summary(event) {
    if (event.type === 'claim-settlement-recorded') {
      const kind = event.settlementKind === 'paid' ? localizeGermanText('Zahlung dokumentiert')
        : event.settlementKind === 'external' ? localizeGermanText('Extern verbucht') : localizeGermanText('Erlass');
      return `${kind}: ${personName(event.debtorPersonId)} → ${personName(event.creditorPersonId)} · ${money(event.amountCents / 100)}${event.note ? ' · ' + event.note : ''}`;
    }
    if (event.type === 'redistribution-executed') {
      const rows = eventUnitChangeRows(event);
      return `${event.title || localizeGermanText('Umverteilung')} · ${pluralMessage('timeline.changeCount', rows.length)} · ${localizeGermanText(FINANCIAL_EVENT_NOTE(event))}`;
    }
    if (event.type === 'shares-set') {
      const item = itemName(event.itemId);
      return `${item} · ${event.note || $translate('ui.shares-1y9v96b')} · ${localizeGermanText(FINANCIAL_EVENT_NOTE(event))}`;
    }
    if (event.type === 'person-added') return `${localizeGermanText('Willkommen,')} ${event.name || personName(event.personId)}!`;
    if (event.type === 'person-deactivated') return `${personName(event.personId)} · ${event.reason || localizeGermanText('Auszug')}`;
    if (event.type === 'person-reactivated') return `${personName(event.personId)} · ${event.reason || $translate('timeline.returnReason')}`;
    if (event.type === 'item-added') return `${itemName(event.itemId, event.name)} · ${localizeGermanText('Startwert')} ${money(event.initialValue)}`;
    if (event.type === 'item-ended') return `${itemName(event.itemId)} · ${event.reason || localizeGermanText('Beendet')}`;
    return event.note || event.name || event.reason || event.type;
  }

  function openEdit(event) {
    appState.setDialog({
      type: event.type === 'claim-settlement-recorded' ? 'settlementEdit' : event.type === 'redistribution-executed' ? 'executedRedistributionEdit' : 'eventEdit',
      eventId: event.id
    });
  }

  function activateEvent(event) {
    if (interactionForTimelineEvent(event.type, $appState.readOnly) === 'edit') {
      expandedEventId = null;
      openEdit(event);
    } else {
      expandedEventId = expandedEventId === event.id ? null : event.id;
    }
  }
</script>

<section class:panel={!preview} class="timeline-panel" class:timeline-preview={preview}>
  {#if !preview}<div class="panel-header"><h2>{localizeGermanText(title)}</h2></div>{/if}
  <div class="panel-body stack">
    {#if !preview && !full && future.length}
      <button class="timeline-more" on:click={() => showFuture = !showFuture}>
        {pluralMessage('timeline.future', future.length)} {localizeGermanText(showFuture ? 'ausblenden' : 'anzeigen')}
      </button>
    {/if}
    {#each rows as row (row.key)}
      {#if row.group}
        {@const group=row.group}
        <div class="timeline-group" class:future-event={group.date > asOfDate} data-group-key={group.key} data-group-count={group.count}>
          {#if group.count>1}
            <button class="timeline-group-toggle" type="button" aria-expanded={expandedGroups.has(group.key)} on:click={()=>toggleGroup(group.key)}>
              <span class="group-icon"><ActionIcon name={iconForTimelineEvent(group.type)} size={17}/></span>
              <span class="group-text"><strong>{groupLabel(group)}</strong>{#if group.totalCents!==null}<small>{groupAmount(group)}</small>{/if}</span>
              <span class="date">{dateDE(group.date)}</span>
              <span class="group-chevron" aria-hidden="true">{expandedGroups.has(group.key)?'▾':'▸'}</span>
            </button>
          {/if}
          <div class="timeline-group-members" class:group-expanded={group.count>1} hidden={group.count>1&&!expandedGroups.has(group.key)}>
            {#each group.events as event (event.id)}
        <div class="event-card timeline-event-card" data-event-id={event.id} class:future-event={event.date > asOfDate}>
            <button
              type="button"
              class="event-open-overlay"
              aria-label={`${$translate(interactionForTimelineEvent(event.type, $appState.readOnly) === 'edit' ? 'timeline.editEvent' : 'timeline.viewDetails')}: ${eventLabel(event.type)} · ${dateDE(event.date)}`}
              aria-expanded={interactionForTimelineEvent(event.type, $appState.readOnly) === 'details' ? expandedEventId === event.id : undefined}
              on:click={() => activateEvent(event)}
            ></button>
          <div class="event-meta">
            <span class="event-kind"><span class="event-icon" aria-hidden="true"><ActionIcon name={iconForTimelineEvent(event.type)} size={17}/></span><span class="label">{eventLabel(event.type)}</span></span>
            <span class="date">{dateDE(event.date)}</span>
          </div>
          <div class="event-summary">
            {#if event.type === 'redistribution-executed' || event.type === 'shares-set'}
                <OwnershipHistorySummary {event} {project} {itemId} {openItem} {openPerson}/>
                <div class="context-note">{$translate(event.financialMode === "derived" ? "help.claimsCalculated" : "help.noNewClaims")}</div>
              {:else if event.type === 'person-added'}
              <span>{$translate("ui.welcome-1051rti")} </span><button class="entity-link" on:click={() => openPerson(event.personId)}>{event.name || personName(event.personId)}</button><span>!</span>
            {:else if event.type === 'person-deactivated'}
              <button class="entity-link" on:click={() => openPerson(event.personId)}>{personName(event.personId)}</button><span> · {event.reason || localizeGermanText('Auszug')}</span>
            {:else if event.type === 'person-reactivated'}
              <button class="entity-link" on:click={() => openPerson(event.personId)}>{personName(event.personId)}</button><span> · {event.reason || $translate("ui.return-lfxhdv")}</span>
            {:else if event.type === 'item-added'}
              <button class="entity-link" on:click={() => openItem(event.itemId)}>{itemName(event.itemId, event.name)}</button><span> · {localizeGermanText('Startwert')} {money(event.initialValue)}</span>
            {:else if event.type === 'item-ended'}
              <button class="entity-link" on:click={() => openItem(event.itemId)}>{itemName(event.itemId)}</button><span> · {event.reason || localizeGermanText('Beendet')}</span>
            {:else}
              {summary(event)}
            {/if}
          </div>
          {#if event.type === "item-added" || event.type === "item-ended"}<CompactNames entries={eventPeople(project, event, $locale)}/>{/if}
          {#if interactionForTimelineEvent(event.type, $appState.readOnly) === 'details' && expandedEventId === event.id}
            <div class="event-readonly-details" role="region" aria-label={$translate('timeline.viewDetails')}>
              <p>{summary(event)}</p>
              {#if event.type === "item-added"}<p>{localizeGermanText(ITEM_FUNDING_NOTE(event))}</p>{/if}
              {#if event.note}<p>{event.note}</p>{/if}
              <p class="muted">{$translate($appState.readOnly ? 'errors.readOnly' : 'timeline.viewOnly')}</p>
              {#if $appState.readOnly && interactionForTimelineEvent(event.type,false)==='edit'}
                <button type="button" class="outline-action" on:click={()=>openEdit(event)}>{$translate('timeline.editEvent')}</button>
              {/if}
            </div>
          {/if}
        </div>
            {/each}
          </div>
        </div>
      {:else}
        {#if full && future.length > visibleFuture.length}
          <button class="timeline-more future-more" use:autoLoad={loadFuture} on:click={loadFuture}>
            {pluralMessage('timeline.future', future.slice(visibleFuture.length).reduce((n,g)=>n+g.count,0), $locale)} · {$translate("ui.older-events-ue6evx")}
          </button>
        {/if}
        <div class="timeline-marker" data-cutoff={asOfDate}>{$translate('timeline.asof')} {dateDE(asOfDate)}</div>
      {/if}
    {/each}
    {#if !preview && past.length > visiblePast.length}
      <button class="timeline-more past-more" use:autoLoad={loadPast} on:click={loadPast}>{$translate("ui.older-events-ue6evx")}</button>
    {/if}
    {#if preview ? !past.length : !events.length}
      <div class="empty">{$translate("ui.no-events-yet-kk73s4")}</div>
    {/if}
  </div>
</section>

<style>
  .timeline-panel {
    font-size: 0.9rem;
  }
  .timeline-preview .panel-body { padding: 0; }
  .timeline-group{min-width:0;display:grid;gap:5px}
  .timeline-group.future-event{border-left:0}
  .timeline-group-toggle{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:8px;text-align:left;border:1px solid var(--border);border-radius:8px;padding:10px 12px;background:var(--panel);min-height:54px;width:100%;overflow-wrap:anywhere}
  .timeline-group-toggle:hover,.timeline-group-toggle:focus-visible{border-color:var(--accent)}
  .future-event>.timeline-group-toggle{border-left:3px solid var(--accent)}
  .group-icon,.group-chevron{color:var(--muted)}
  .group-text{display:grid;gap:3px;min-width:0}
  .group-text small{color:var(--muted)}
  .timeline-group-members{display:grid;gap:5px;min-width:0}
  .timeline-group-members[hidden]{display:none}
  .timeline-group-members.group-expanded{margin-left:9px;border-left:2px solid var(--border);padding-left:7px}
  .timeline-group-members.group-expanded .timeline-event-card{min-height:0;padding:9px 10px}
  @media(max-width:380px){.timeline-group-toggle{gap:5px;padding:9px 7px}.timeline-group-members.group-expanded{margin-left:4px;padding-left:4px}}
  .timeline-event-card {
    min-width: 0;
    overflow-wrap: anywhere;
    position: relative;
    padding: 12px 14px;
    min-height: 66px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--panel);
    display: grid;
    gap: 6px;
  }
  .timeline-event-card:hover { border-color: var(--accent); background: var(--soft); }
  .timeline-event-card:focus-within { border-color: var(--accent); }
  .future-event { border-left: 3px solid var(--accent); }
  .event-open-overlay {
    position: absolute;
    inset: 0;
    z-index: 1;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: inherit;
    background: transparent;
    cursor: pointer;
  }
  .event-open-overlay:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
  .event-kind { display: inline-flex; align-items: center; gap: 8px; }
  .event-icon { display: inline-flex; color: var(--muted); }
  .event-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .label {
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--accent);
  }
  .date {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .event-summary {
    color: var(--text);
    line-height: 1.3;
  }
  .event-summary .entity-link {
    position: relative;
    z-index: 2;
  }
  .event-readonly-details {
    position: relative;
    z-index: 2;
    border-top: 1px solid var(--border);
    padding-top: 8px;
    line-height: 1.4;
  }
  .event-readonly-details p { margin: 0 0 6px; }
  .event-readonly-details .muted { color: var(--muted); }
  .entity-link {
    border: 1px solid transparent;
    background: var(--accent-soft);
    color: #1f4db6;
    padding: 1px 8px;
    border-radius: 999px;
    text-decoration: none;
    cursor: pointer;
    display: inline;
    font: inherit;
    font-size: 0.85rem;
    line-height: 1.35;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.12s ease;
    margin: 0 2px;
    vertical-align: baseline;
  }
  .entity-link:hover {
    background: #dbe8ff;
    border-color: #b6cbff;
    color: #163a8a;
  }
  .entity-link:active {
    transform: translateY(1px);
  }
  .entity-link:focus-visible {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.22);
  }
  .timeline-marker {
    font-size: 0.8rem;
    padding: 8px 0;
    text-align: center;
    color: var(--accent);
    font-weight: 600;
    border-top: 2px dashed var(--accent-soft);
    border-bottom: 2px dashed var(--accent-soft);
    margin: 8px 0;
  }
  .timeline-more {
    font-size: 0.8rem;
    padding: 6px;
  }
</style>
