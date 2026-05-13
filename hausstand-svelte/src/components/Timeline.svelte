<script>
  import { appState } from '../stores/projectStore.js';
  import { dateDE } from '../lib/util.js';
  import { money } from '../lib/domain.js';
  import { projectBeforeEvent, shareDeltasForChange } from '../lib/projector.js';
  import { redistributionPreview } from '../lib/redistribution.js';
  export let project;
  export let asOfDate;
  export let itemId = null;
  export let personId = null;
  export let title = '🕒 Timeline';

  let pastLimit = 10;
  let showFuture = false;

  $: allEvents = [...(project.events || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || (a.order ?? 0) - (b.order ?? 0));
  $: events = allEvents.filter(e => {
    if (itemId) return e.itemId === itemId || (e.events || []).some(c => c.itemId === itemId);
    if (personId) return e.personId === personId || (e.events || []).some(c => c.personId === personId);
    return true;
  });
  $: future = events.filter(e => e.date > asOfDate);
  $: past = events.filter(e => e.date <= asOfDate).reverse();
  $: visiblePast = past.slice(0, pastLimit);

  const labels = {
    'redistribution-executed': 'Umverteilung',
    'shares-set': 'Anteilssatz',
    'person-added': 'Einzug',
    'person-deactivated': 'Auszug',
    'person-reactivated': 'Wiedereinzug',
    'item-added': 'Neuanschaffung',
    'item-ended': 'Ausbuchung'
  };

  function summary(event) {
    if (event.type === 'redistribution-executed') {
      const preview = redistributionPreview(project, { title: event.title, effectiveDate: event.date, changes: (event.events || []).filter(e => e.type === 'shares-set') });
      return `${event.title || 'Umverteilung'} · ${(event.events || []).length} Änderungen · ${preview.payments.length} Zahlungen`;
    }
    if (event.type === 'shares-set') {
      const before = projectBeforeEvent(project, event.id, event.date);
      const deltas = shareDeltasForChange(before, event);
      if (deltas.length === 0) return event.note || 'Manuelle Korrektur';
      return `${event.note || 'Anteile'} · ${deltas.map(d => `${d.personName} ${d.delta >= 0 ? '+' : ''}${money(d.delta)}`).join(' · ')}`;
    }
    if (event.type === 'person-added') return `Willkommen, ${event.name || event.personId}!`;
    if (event.type === 'person-deactivated') return `${event.personId}: ${event.reason || 'Auszug'}`;
    if (event.type === 'person-reactivated') return `${event.personId}: ${event.reason || 'Rückkehr'}`;
    if (event.type === 'item-added') return `${event.name || event.itemId} (${money(event.initialValue)})`;
    if (event.type === 'item-ended') return `${event.itemId}: ${event.reason || 'Beendet'}`;
    return event.type;
  }

  function openEdit(event) {
    appState.setDialog({ 
      type: event.type === 'redistribution-executed' ? 'executedRedistributionEdit' : 'eventEdit', 
      eventId: event.id 
    });
  }
</script>

<section class="panel timeline-panel">
  <div class="panel-header"><h2>{title}</h2><span class="hint">Klicken zum Bearbeiten</span></div>
  <div class="panel-body stack">
    {#if future.length}
      <button class="timeline-more" on:click={() => showFuture = !showFuture}>
        {future.length} zukünftige Ereignisse {showFuture ? 'ausblenden' : 'anzeigen'}
      </button>
      {#if showFuture}
        {#each future as event}
          <div class="event-card clickable" on:click={() => openEdit(event)}>
            <div class="event-meta">
              <span class="label">{labels[event.type] || event.type}</span>
              <span class="date">{dateDE(event.date)}</span>
            </div>
            <div class="event-summary">{summary(event)}</div>
          </div>
        {/each}
      {/if}
    {/if}

    <div class="timeline-marker">Stichtag {dateDE(asOfDate)}</div>

    {#if visiblePast.length}
      {#each visiblePast as event}
        <div class="event-card clickable" on:click={() => openEdit(event)}>
          <div class="event-meta">
            <span class="label">{labels[event.type] || event.type}</span>
            <span class="date">{dateDE(event.date)}</span>
          </div>
          <div class="event-summary">{summary(event)}</div>
        </div>
      {/each}
      {#if past.length > visiblePast.length}
        <button class="timeline-more" on:click={() => pastLimit += 10}>⬇️ Ältere Ereignisse</button>
      {/if}
    {:else if !events.length}
      <div class="empty">Keine Ereignisse vorhanden.</div>
    {/if}
  </div>
</section>

<style>
  .timeline-panel {
    font-size: 0.9rem;
  }
  .event-card.clickable {
    cursor: pointer;
    transition: transform 0.1s, box-shadow 0.1s;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--panel);
  }
  .event-card.clickable:hover {
    background: var(--soft);
    border-color: var(--accent);
    transform: translateX(2px);
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
