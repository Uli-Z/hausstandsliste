<script>
  import { translate, localizeGermanText, pluralMessage } from '../src/lib/i18n.js';
  import { appState } from '../src/stores/projectStore.js';
  import { dateDE } from '../src/lib/util.js';
  import { splitHistoryAt } from '../src/lib/eventHistory.js';
  import { money } from '../src/lib/domain.js';
  import { projectBeforeEvent, shareDeltasForChange } from '../src/lib/projector.js';
  import { FINANCIAL_EVENT_NOTE, ITEM_FUNDING_NOTE } from '../src/lib/financialLabels.js';
  import HelpTip from '../src/components/HelpTip.svelte';
  import ActionIcon from '../src/components/ActionIcon.svelte';
  import { iconForTimelineEvent, interactionForTimelineEvent } from '../src/lib/timelineActions.js';
  export let project;
  export let asOfDate;
  export let itemId = null;
  export let personId = null;
  export let title = 'Änderungsverlauf';

  let pastLimit = 10;
  let showFuture = false;
  let expandedEventId = null;

    // View-only order: newest first on either side of the time-travel cutoff.
  $: allEvents = project.events || [];
  $: peopleById = new Map((project.people || []).map(person => [person.id, person.name || person.id]));
  $: itemsById = new Map((project.items || []).map(item => [item.id, item.name || item.id]));

  function personName(personId) {
    if (!personId) return localizeGermanText('Unbekannte Person');
    return peopleById.get(personId) || personId;
  }

  function itemName(itemId, fallbackName = '') {
    if (!itemId) return fallbackName || localizeGermanText('Unbekannter Gegenstand');
    return itemsById.get(itemId) || fallbackName || itemId;
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
    return shareDeltasForChange(baseProjection, change).some(row => row.personId === personId);
  }

  function eventAffectsPerson(event) {
    if (event.personId === personId) return true;
    if (event.type === 'claim-settlement-recorded') return event.debtorPersonId === personId || event.creditorPersonId === personId;
    if ((event.events || []).some(child => child.personId === personId)) return true;
    if (event.type === 'item-added' && (event.financedByPersonId === personId || Number(event.purchaseContributionsCents?.[personId] || 0) > 0 || Number(event.shares?.[personId] || 0) > 0)) return true;

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
    if (itemId) return e.type !== 'claim-settlement-recorded' && (e.itemId === itemId || (e.events || []).some(c => c.itemId === itemId));
    if (personId) return eventAffectsPerson(e);
    return true;
  });
  $: history = splitHistoryAt(events, asOfDate);
  $: future = history.future;
  $: past = history.past;
  $: visiblePast = past.slice(0, pastLimit);

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
      const affectedItems = [...new Set((event.events || []).filter(e => e.type === 'shares-set').map(e => itemName(e.itemId)).filter(Boolean))];
      const itemInfo = affectedItems.length ? ` · ${affectedItems.join(', ')}` : '';
      return `${event.title || localizeGermanText('Umverteilung')} · ${pluralMessage('timeline.changeCount', (event.events || []).length)} · ${localizeGermanText(FINANCIAL_EVENT_NOTE(event))}${itemInfo}`;
    }
    if (event.type === 'shares-set') {
      const before = projectBeforeEvent(project, event.id, event.date);
      const deltas = shareDeltasForChange(before, event);
      const item = itemName(event.itemId);
      if (deltas.length === 0) return `${item} · ${event.note || localizeGermanText('Manuelle Korrektur')}`;
      return `${item} · ${event.note || $translate('ui.shares-1y9v96b')} · ${deltas.map(d => `${d.personName} ${d.delta >= 0 ? '+' : ''}${money(d.delta)}`).join(' · ')}`;
    }
    if (event.type === 'person-added') return `${localizeGermanText('Willkommen,')} ${event.name || personName(event.personId)}!`;
    if (event.type === 'person-deactivated') return `${personName(event.personId)} · ${event.reason || localizeGermanText('Auszug')}`;
    if (event.type === 'person-reactivated') return `${personName(event.personId)} · ${event.reason || $translate('timeline.returnReason')}`;
    if (event.type === 'item-added') return `${itemName(event.itemId, event.name)} · ${localizeGermanText('Startwert')} ${money(event.initialValue)}`;
    if (event.type === 'item-ended') return `${itemName(event.itemId)} · ${event.reason || localizeGermanText('Beendet')}`;
    return event.note || event.name || event.reason || event.type;
  }

  function deltasFor(event) {
    const before = projectBeforeEvent(project, event.id, event.date);
    return shareDeltasForChange(before, event);
  }

  function redistributionData(event) {
    const shareEvents = (event.events || []).filter(e => e.type === 'shares-set');
    const affectedItems = [...new Set(shareEvents.map(e => e.itemId).filter(Boolean))];
    return { affectedItems };
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

<section class="panel timeline-panel">
  <div class="panel-header"><h2>{localizeGermanText(title)}</h2></div>
  <div class="panel-body stack">
    {#if future.length}
      <button class="timeline-more" on:click={() => showFuture = !showFuture}>
        {pluralMessage('timeline.future', future.length)} {localizeGermanText(showFuture ? 'ausblenden' : 'anzeigen')}
      </button>
      {#if showFuture}
        {#each future as event}
          <div class="event-card timeline-event-card" class:future-event={event.date > asOfDate}>
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
              {#if event.type === 'redistribution-executed'}
                {@const data = redistributionData(event)}
                <span>{event.title || localizeGermanText('Umverteilung')} · {pluralMessage('timeline.changeCount', (event.events || []).length)}</span><HelpTip label={localizeGermanText('Finanzielle Wirkung')}>{localizeGermanText(FINANCIAL_EVENT_NOTE(event))}</HelpTip>
                {#if data.affectedItems.length}
                  <span> · </span>
                  {#each data.affectedItems as currentItemId, index}
                    <button class="entity-link" on:click={() => openItem(currentItemId)}>{itemName(currentItemId)}</button>{#if index < data.affectedItems.length - 1}, {/if}
                  {/each}
                {/if}
              {:else if event.type === 'shares-set'}
                {@const deltas = deltasFor(event)}
                <button class="entity-link" on:click={() => openItem(event.itemId)}>{itemName(event.itemId)}</button>
                <span> · {event.note || $translate("ui.shares-1y9v96b")}</span>
                {#if deltas.length}
                  <span> · </span>
                  {#each deltas as delta, index}
                    <button class="entity-link" on:click={() => openPerson(delta.personId)}>{delta.personName}</button>
                    <span> {delta.delta >= 0 ? '+' : ''}{money(delta.delta)}</span>{#if index < deltas.length - 1}<span> · </span>{/if}
                  {/each}
                {/if}
                <HelpTip label={$translate("ui.financial-effect-of-the-ownership-c-1ojpegx")}>{localizeGermanText(FINANCIAL_EVENT_NOTE(event))}</HelpTip>
              {:else if event.type === 'person-added'}
                <span>{$translate("ui.welcome-1051rti")} </span><button class="entity-link" on:click={() => openPerson(event.personId)}>{event.name || personName(event.personId)}</button><span>!</span>
              {:else if event.type === 'person-deactivated'}
                <button class="entity-link" on:click={() => openPerson(event.personId)}>{personName(event.personId)}</button><span> · {event.reason || localizeGermanText('Auszug')}</span>
              {:else if event.type === 'person-reactivated'}
                <button class="entity-link" on:click={() => openPerson(event.personId)}>{personName(event.personId)}</button><span> · {event.reason || $translate("ui.return-lfxhdv")}</span>
              {:else if event.type === 'item-added'}
                <button class="entity-link" on:click={() => openItem(event.itemId)}>{itemName(event.itemId, event.name)}</button><span> · {localizeGermanText('Startwert')} {money(event.initialValue)}</span><HelpTip label={$translate("ui.financing-of-this-purchase-1s2bh1x")}>{localizeGermanText(ITEM_FUNDING_NOTE(event))}</HelpTip>
              {:else if event.type === 'item-ended'}
                <button class="entity-link" on:click={() => openItem(event.itemId)}>{itemName(event.itemId)}</button><span> · {event.reason || localizeGermanText('Beendet')}</span>
              {:else}
                {summary(event)}
              {/if}
            </div>
            {#if interactionForTimelineEvent(event.type, $appState.readOnly) === 'details' && expandedEventId === event.id}
              <div class="event-readonly-details" role="region" aria-label={$translate('timeline.viewDetails')}>
                <p>{summary(event)}</p>
                {#if event.note}<p>{event.note}</p>{/if}
                <p class="muted">{$translate($appState.readOnly ? 'errors.readOnly' : 'timeline.viewOnly')}</p>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    {/if}

    <div class="timeline-marker">{localizeGermanText('Stichtag')} {dateDE(asOfDate)}</div>

    {#if visiblePast.length}
      {#each visiblePast as event}
        <div class="event-card timeline-event-card" class:future-event={event.date > asOfDate}>
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
            {#if event.type === 'redistribution-executed'}
              {@const data = redistributionData(event)}
              <span>{event.title || localizeGermanText('Umverteilung')} · {pluralMessage('timeline.changeCount', (event.events || []).length)}</span><HelpTip label={localizeGermanText('Finanzielle Wirkung')}>{localizeGermanText(FINANCIAL_EVENT_NOTE(event))}</HelpTip>
              {#if data.affectedItems.length}
                <span> · </span>
                {#each data.affectedItems as currentItemId, index}
                  <button class="entity-link" on:click={() => openItem(currentItemId)}>{itemName(currentItemId)}</button>{#if index < data.affectedItems.length - 1}, {/if}
                {/each}
              {/if}
            {:else if event.type === 'shares-set'}
              {@const deltas = deltasFor(event)}
              <button class="entity-link" on:click={() => openItem(event.itemId)}>{itemName(event.itemId)}</button>
              <span> · {event.note || $translate("ui.shares-1y9v96b")}</span>
              {#if deltas.length}
                <span> · </span>
                {#each deltas as delta, index}
                  <button class="entity-link" on:click={() => openPerson(delta.personId)}>{delta.personName}</button>
                  <span> {delta.delta >= 0 ? '+' : ''}{money(delta.delta)}</span>{#if index < deltas.length - 1}<span> · </span>{/if}
                {/each}
              {/if}
              <HelpTip label={$translate("ui.financial-effect-of-the-ownership-c-1ojpegx")}>{localizeGermanText(FINANCIAL_EVENT_NOTE(event))}</HelpTip>
            {:else if event.type === 'person-added'}
              <span>{$translate("ui.welcome-1051rti")} </span><button class="entity-link" on:click={() => openPerson(event.personId)}>{event.name || personName(event.personId)}</button><span>!</span>
            {:else if event.type === 'person-deactivated'}
              <button class="entity-link" on:click={() => openPerson(event.personId)}>{personName(event.personId)}</button><span> · {event.reason || localizeGermanText('Auszug')}</span>
            {:else if event.type === 'person-reactivated'}
              <button class="entity-link" on:click={() => openPerson(event.personId)}>{personName(event.personId)}</button><span> · {event.reason || $translate("ui.return-lfxhdv")}</span>
            {:else if event.type === 'item-added'}
              <button class="entity-link" on:click={() => openItem(event.itemId)}>{itemName(event.itemId, event.name)}</button><span> · {localizeGermanText('Startwert')} {money(event.initialValue)}</span><HelpTip label={$translate("ui.financing-of-this-purchase-1s2bh1x")}>{localizeGermanText(ITEM_FUNDING_NOTE(event))}</HelpTip>
            {:else if event.type === 'item-ended'}
              <button class="entity-link" on:click={() => openItem(event.itemId)}>{itemName(event.itemId)}</button><span> · {event.reason || localizeGermanText('Beendet')}</span>
            {:else}
              {summary(event)}
            {/if}
          </div>
          {#if interactionForTimelineEvent(event.type, $appState.readOnly) === 'details' && expandedEventId === event.id}
            <div class="event-readonly-details" role="region" aria-label={$translate('timeline.viewDetails')}>
              <p>{summary(event)}</p>
              {#if event.note}<p>{event.note}</p>{/if}
              <p class="muted">{$translate($appState.readOnly ? 'errors.readOnly' : 'timeline.viewOnly')}</p>
            </div>
          {/if}
        </div>
      {/each}
      {#if past.length > visiblePast.length}
        <button class="timeline-more" on:click={() => pastLimit += 10}>{$translate("ui.older-events-ue6evx")}</button>
      {/if}
    {:else if !events.length}
      <div class="empty">{$translate("ui.no-events-yet-kk73s4")}</div>
    {/if}
  </div>
</section>

<style>
  .timeline-panel {
    font-size: 0.9rem;
  }
  .timeline-event-card {
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
  .event-summary :global(.help-wrap),
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
