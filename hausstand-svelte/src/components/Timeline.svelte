<script>
  import { appState } from '../stores/projectStore.js';
  import { dateDE } from '../lib/util.js';
  import { money } from '../lib/domain.js';
  import { redistributionPreview, projectBeforeEvent, shareDeltasForChange } from '../lib/projector.js';
  export let project;
  export let asOfDate;
  let pastLimit = 10;
  let showFuture = false;
  $: events = [...(project.events || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || (a.order ?? 0) - (b.order ?? 0));
  $: future = events.filter(e => e.date > asOfDate);
  $: past = events.filter(e => e.date <= asOfDate).reverse();
  $: visiblePast = past.slice(0, pastLimit);

  function summary(event) {
    if (event.type === 'redistribution-executed') {
      const preview = redistributionPreview({ ...project, events: project.events.filter(e => e.id !== event.id) }, { title: event.title, effectiveDate: event.date, changes: (event.events || []).filter(e => e.type === 'shares-set') });
      return `Umverteilung: ${event.title || 'Umverteilung'} · ${(event.events || []).length} Änderung(en) · ${preview.payments.length} Ausgleichszahlung(en)`;
    }
    if (event.type === 'shares-set') {
      const before = projectBeforeEvent(project, event.id, event.date);
      const deltas = shareDeltasForChange(before, event);
      return `Anteile geändert · ${deltas.map(d => `${d.personName} ${d.delta >= 0 ? '+' : ''}${money(d.delta)}`).join(' · ')}`;
    }
    if (event.type === 'person-added') return `Person hinzugefügt: ${event.name || event.personId}`;
    if (event.type === 'person-deactivated') return `Person deaktiviert: ${event.reason || ''}`;
    if (event.type === 'person-reactivated') return `Person reaktiviert: ${event.reason || ''}`;
    if (event.type === 'item-added') return `Gegenstand hinzugefügt: ${event.name || event.itemId}`;
    if (event.type === 'item-ended') return `Gegenstand beendet: ${event.reason || ''}`;
    return event.type;
  }
</script>

<section class="panel">
  <div class="panel-header"><h2>🕒 Timeline</h2><span class="hint">Stichtag markiert</span></div>
  <div class="panel-body stack">
    {#if future.length}
      <button class="timeline-more" on:click={() => showFuture = !showFuture}>{future.length} zukünftige Ereignisse {showFuture ? 'ausblenden' : 'anzeigen'}</button>
      {#if showFuture}
        {#each future as event}
          <div class="event-card">
            <div class="split"><div><div class="event-type">{event.type}</div><strong>{dateDE(event.date)}</strong></div><button class="small" on:click={() => appState.setDialog({ type: 'eventEdit', eventId: event.id })}>✏️ Bearbeiten</button></div>
            <div>{summary(event)}</div>
          </div>
        {/each}
      {/if}
    {/if}
    <div class="timeline-marker">Stichtag {dateDE(asOfDate)}</div>
    {#if visiblePast.length}
      {#each visiblePast as event}
        <div class="event-card">
          <div class="split"><div><div class="event-type">{event.type}</div><strong>{dateDE(event.date)}</strong></div><button class="small" on:click={() => appState.setDialog({ type: event.type === 'redistribution-executed' ? 'executedRedistributionEdit' : 'eventEdit', eventId: event.id })}>✏️ Bearbeiten</button></div>
          <div>{summary(event)}</div>
        </div>
      {/each}
      {#if past.length > visiblePast.length}<button class="timeline-more" on:click={() => pastLimit += 10}>⬇️ Weitere ältere Ereignisse anzeigen</button>{/if}
    {:else if !events.length}
      <div class="empty">Keine Ereignisse.</div>
    {/if}
  </div>
</section>
