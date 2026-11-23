<script>
  import { translate, localizeGermanText, pluralMessage } from '../src/lib/i18n.js';
  import { appState } from '../src/stores/projectStore.js';
  import { dateDE } from '../src/lib/util.js';
  import { splitHistoryAt } from '../src/lib/eventHistory.js';
  import { money } from '../src/lib/domain.js';
  import { projectBeforeEvent, shareDeltasForChange } from '../src/lib/projector.js';
  import { FINANCIAL_EVENT_NOTE, ITEM_FUNDING_NOTE } from '../src/lib/financialLabels.js';
  import HelpTip from '../src/components/HelpTip.svelte';
  export let project;
  export let asOfDate;
  export let itemId = null;
  export let personId = null;
  export let title = 'Änderungsverlauf';

  let pastLimit = 10;
  let showFuture = false;

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
    return labels[eventType] ? localizeGermanText(labels[eventType]) : eventType?.replaceAll('-', ' ') || localizeGermanText('Ereignis');
  }

  function affectsPersonByShareDelta(baseProjection, change) {
    return shareDeltasForChange(baseProjection, change).some(row => row.personId === personId);
  }

  function eventAffectsPerson(event) {
    if (event.personId === personId) return true;
    if (event.type === 'claim-settlement-recorded') return event.debtorPersonId === personId || event.creditorPersonId === personId;
    if ((event.events || []).some(child => child.personId === personId)) return true;
    if (event.type === 'item-added' && (event.financedByPersonId === personId || Number(event.shares?.[personId] || 0) > 0)) return true;

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
    'redistribution-executed': localizeGermanText('Umverteilung'),
    'shares-set': 'Anteilssatz',
    'person-added': 'Einzug',
    'person-deactivated': localizeGermanText('Auszug'),
    'person-reactivated': 'Wiedereinzug',
    'item-added': 'Neuanschaffung',
    'item-ended': 'Ausbuchung',
    'claim-settlement-recorded': 'Ausgleich'
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
      return `${event.title || localizeGermanText('Umverteilung')} · ${(event.events || []).length} Änderungen · ${localizeGermanText(FINANCIAL_EVENT_NOTE(event))}${itemInfo}`;
    }
    if (event.type === 'shares-set') {
      const before = projectBeforeEvent(project, event.id, event.date);
      const deltas = shareDeltasForChange(before, event);
      const item = itemName(event.itemId);
      if (deltas.length === 0) return `${item} · ${event.note || localizeGermanText('Manuelle Korrektur')}`;
      return `${item} · ${event.note || 'Anteile'} · ${deltas.map(d => `${d.personName} ${d.delta >= 0 ? '+' : ''}${money(d.delta)}`).join(' · ')}`;
    }
    if (event.type === 'person-added') return `${localizeGermanText('Willkommen,')} ${event.name || personName(event.personId)}!`;
    if (event.type === 'person-deactivated') return `${personName(event.personId)} · ${event.reason || localizeGermanText('Auszug')}`;
    if (event.type === 'person-reactivated') return `${personName(event.personId)} · ${event.reason || 'Rückkehr'}`;
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
</script>

<section class="panel timeline-panel">
  <div class="panel-header"><h2>{localizeGermanText(title)}</h2><span class="hint">{$translate("ui.you-can-correct-events-using-edit-1bvsp4q")}</span></div>
  <div class="panel-body stack">
    {#if future.length}
      <button class="timeline-more" on:click={() => showFuture = !showFuture}>
        {pluralMessage('timeline.future', future.length)} {localizeGermanText(showFuture ? 'ausblenden' : 'anzeigen')}
      </button>
      {#if showFuture}
        {#each future as event}
          <div class="event-card timeline-event-card">
            <div class="event-meta">
              <span class="label">{eventLabel(event.type)}</span>
              <span class="date">{dateDE(event.date)}</span>
            </div>
            <div class="event-summary">
              {#if event.type === 'redistribution-executed'}
                {@const data = redistributionData(event)}
                <span>{event.title || localizeGermanText('Umverteilung')} · {(event.events || []).length} {localizeGermanText('Änderungen')}</span><HelpTip label={localizeGermanText('Finanzielle Wirkung')}>{localizeGermanText(FINANCIAL_EVENT_NOTE(event))}</HelpTip>
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
            <div class="event-actions">
              <button class="small ghost edit-button" title={$translate("ui.edit-change-1t2xk03")} on:click={() => openEdit(event)}>{$translate("ui.edit-m49ms0")}</button>
            </div>
          </div>
        {/each}
      {/if}
    {/if}

    <div class="timeline-marker">{localizeGermanText('Stichtag')} {dateDE(asOfDate)}</div>

    {#if visiblePast.length}
      {#each visiblePast as event}
        <div class="event-card timeline-event-card">
          <div class="event-meta">
            <span class="label">{eventLabel(event.type)}</span>
            <span class="date">{dateDE(event.date)}</span>
          </div>
          <div class="event-summary">
            {#if event.type === 'redistribution-executed'}
              {@const data = redistributionData(event)}
              <span>{event.title || localizeGermanText('Umverteilung')} · {(event.events || []).length} {localizeGermanText('Änderungen')}</span><HelpTip label={localizeGermanText('Finanzielle Wirkung')}>{localizeGermanText(FINANCIAL_EVENT_NOTE(event))}</HelpTip>
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
          <div class="event-actions">
            <button class="small ghost edit-button" title={$translate("ui.edit-change-1t2xk03")} on:click={() => openEdit(event)}>{$translate("ui.edit-m49ms0")}</button>
          </div>
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
    padding: 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--panel);
    display: grid;
    gap: 6px;
  }
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
  .event-actions {
    display: flex;
    justify-content: flex-end;
  }
  .edit-button {
    min-width: 86px;
    min-height: 30px;
    padding: 3px 6px;
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
