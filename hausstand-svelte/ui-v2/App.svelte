<script>
  import Header from '../src/components/Header.svelte';
  import Timeline from '../src/components/Timeline.svelte';
  import PeoplePanel from '../src/components/PeoplePanel.svelte';
  import ItemsPanel from '../src/components/ItemsPanel.svelte';
  import PersonDetail from '../src/components/PersonDetail.svelte';
  import ItemDetail from '../src/components/ItemDetail.svelte';
  import DialogRouter from '../src/components/DialogRouter.svelte';
  import LedgerPanel from '../src/components/LedgerPanel.svelte';
  import StoragePanel from '../src/components/StoragePanel.svelte';
  import { appState, projection, ledger } from '../src/stores/projectStore.js';
  import { exportProject, loadWorkingCopy } from '../src/lib/persistence.js';
  import { money } from '../src/lib/domain.js';
  import { addDays } from '../src/lib/util.js';
  import { onMount } from 'svelte';

  let tab = 'archive';

  onMount(() => {
    const copy = loadWorkingCopy();
    if (copy && copy.project) {
      appState.importProject(copy.project, copy.fileName);
      if (copy.asOfDate) appState.setAsOfDate(copy.asOfDate);
    }
  });

  $: route = $appState.route;
  $: personEntry = route.page === 'person' ? ($projection.people.find(p => p.id === route.id) || $projection.peopleById.get(route.id)) : null;
  // A former member may have debts despite not holding any active items.
  $: person = personEntry ? { holdings: [], totalValue: 0, ...personEntry } : null;
  $: item = route.page === 'item' ? $projection.items.find(i => i.id === route.id) : null;
  $: drafts = $appState.project.drafts || [];

  function handleKeydown(e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      appState.setAsOfDate(addDays($appState.asOfDate, -1));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      appState.setAsOfDate(addDays($appState.asOfDate, 1));
    }
  }

  function startNewProject() {
    const message = 'Achtung: Der aktuelle Arbeitsstand im Browser wird gelöscht. Bitte vorher speichern oder exportieren. Neues Projekt starten?';
    if (!confirm(message)) return;
    appState.newProject();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<Header />
<main class="preview-main">
  {#if route.page === 'dashboard'}
    <section class="workspace-intro">
      <div class="workspace-intro-copy">
        <span class="eyebrow">HAUSSTAND / ÜBERSICHT</span>
        <h1>Alles im Blick.</h1>
        <p>Bestand verwalten, Anteile nachvollziehen und Forderungen transparent ausgleichen.</p>
      </div>
      <div class="hero-actions">
        <button class="hero-primary" on:click={() => appState.setDialog({ type: 'itemAdd' })}>＋ Gegenstand hinzufügen</button>
        <button on:click={() => appState.setDialog({ type: 'personAdd' })}>＋ Person anlegen</button>
        <button on:click={() => appState.startRedistribution()}>↗ Umverteilung planen</button>
      </div>
    </section>
    <section class="summary-strip" aria-label="Bestandszahlen">
      <div class="summary-card"><span>Gesamtwert</span><strong>{money($projection.totalValue)}</strong><small>zum gewählten Stichtag</small></div>
      <div class="summary-card"><span>Aktive Gegenstände</span><strong>{$projection.activeItems.length}</strong><small>im aktuellen Bestand</small></div>
      <div class="summary-card"><span>Personen</span><strong>{$projection.people.filter(p => p.active).length}</strong><small>aktuell beteiligt</small></div>
      <div class="summary-card"><span>Einzelforderungen</span><strong>{$ledger.claims.length}</strong><small>automatisch abgeleitet</small></div>
    </section>
    <nav class="workspace-nav" aria-label="Bereiche">
      <a href="#personen">Personen</a><a href="#gegenstaende">Gegenstände</a><a href="#zeitverlauf">Zeitverlauf</a><a href="#forderungen">Forderungen</a><a href="#dateien">Dateien & Online</a><a href="#archiv">Archiv & Daten</a>
    </nav>
    <section class="workspace-grid">
      <div class="workspace-activity" id="zeitverlauf">
        <Timeline project={$appState.project} asOfDate={$appState.asOfDate} />
      </div>
      <div class="workspace-data">
        <div id="personen"><PeoplePanel people={$projection.people} totalValue={$projection.totalValue} activeItems={$projection.activeItems} /></div>
        {#if drafts.length}
          <section class="panel">
            <div class="panel-header">
              <h2>📝 Entwürfe</h2>
              <span class="badge accent">{drafts.length}</span>
            </div>
            <div class="panel-body">
              <div class="stack">
                {#each drafts as d}
                  <div class="event-card">
                    <div class="split">
                      <div>
                        <div class="event-type">{d.type === 'redistribution' ? 'Umverteilung' : 'Gegenstand'}</div>
                        <strong>{d.title || d.data?.name || 'Unbenannter Entwurf'}</strong>
                        <div class="muted">
                          {#if d.type === 'redistribution'}
                            {d.effectiveDate} · {d.changes?.length || 0} Änderung(en)
                          {:else if d.type === 'item'}
                            {d.data.valuation.type} · {money(d.data.initialValue)}
                          {/if}
                        </div>
                      </div>
                      <div class="row">
                        <button class="small ghost danger" on:click={() => { if(confirm('Entwurf löschen?')) appState.deleteDraft(d.id); }}>🗑️ Löschen</button>
                        <button class="small" on:click={() => appState.setDialog({ type: d.type === 'redistribution' ? 'redistributionEdit' : 'itemAdd', id: d.id })}>✏️ Öffnen</button>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </section>
        {/if}
        <div id="gegenstaende"><ItemsPanel items={$projection.activeItems} tags={$projection.allTags} /></div>
      </div>
    </section>
    <section class="workspace-secondary" id="forderungen">
      <LedgerPanel project={$appState.project} data={$ledger} asOfDate={$appState.asOfDate} />
    </section>
    <section class="workspace-secondary" id="dateien"><StoragePanel /></section>
    <section class="panel archive-panel" id="archiv">
      <div class="tabs">
        <button class="tab" class:active={tab==='archive'} on:click={() => tab='archive'}>📦 Archiv</button>
        <button class="tab" class:active={tab==='json'} on:click={() => tab='json'}>🧾 JSON</button>
        <button class="tab" class:active={tab==='new'} on:click={() => tab='new'}>✨ Neues Projekt</button>
      </div>
      <div class="panel-body">
        {#if tab === 'archive'}
          {#if $projection.archivedItems.length}
            <table>
              <thead>
                <tr><th>Gegenstand</th><th>Status</th><th>Enddatum</th><th>Grund</th><th>Tags</th></tr>
              </thead>
              <tbody>
                {#each $projection.archivedItems as i}
                  <tr class="clickable-row" on:click={() => appState.setRoute({ page: 'item', id: i.id })}>
                    <td>{i.name}</td>
                    <td><span class="badge ghost">{i.status}</span></td>
                    <td>{i.runtime.endedAt || '–'}</td>
                    <td>{i.runtime.endReason || '–'}</td>
                    <td>{(i.tags || []).join(', ')}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {:else}
            <div class="empty">Noch keine archivierten Gegenstände.</div>
          {/if}
        {:else if tab === 'json'}
          <pre class="json-preview">{JSON.stringify(exportProject($appState.project, $appState.asOfDate), null, 2)}</pre>
        {:else}
          <div class="split" style="align-items:flex-start">
            <div>
              <div class="event-type">Neues Projekt</div>
              <strong>Nur selten nötig</strong>
              <div class="muted">Der aktuelle Arbeitsstand im Browser wird gelöscht. Bitte vorher speichern oder exportieren.</div>
            </div>
            <button class="danger" on:click={startNewProject}>✨ Neues Projekt starten</button>
          </div>
        {/if}
      </div>
    </section>
  {:else if route.page === 'person' && person}
    <PersonDetail {person} projection={$projection} asOfDate={$appState.asOfDate} ledger={$ledger} />
  {:else if route.page === 'item' && item}
    <ItemDetail {item} />
  {:else}
    <section class="panel"><div class="panel-body"><button on:click={() => appState.setRoute({ page: 'dashboard' })}>← Übersicht</button><div class="empty" style="margin-top:12px">Nicht gefunden.</div></div></section>
  {/if}
</main>

<DialogRouter dialog={$appState.activeDialog} project={$appState.project} projection={$projection} asOfDate={$appState.asOfDate} />
