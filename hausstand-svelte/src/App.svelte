<script>
  import Header from './components/Header.svelte';
  import Timeline from './components/Timeline.svelte';
  import PeoplePanel from './components/PeoplePanel.svelte';
  import ItemsPanel from './components/ItemsPanel.svelte';
  import PersonDetail from './components/PersonDetail.svelte';
  import ItemDetail from './components/ItemDetail.svelte';
  import DialogRouter from './components/DialogRouter.svelte';
  import { appState, projection } from './stores/projectStore.js';
  import { exportProject, loadWorkingCopy } from './lib/persistence.js';
  import { money } from './lib/domain.js';
  import { addDays } from './lib/util.js';
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
  $: person = route.page === 'person' ? ($projection.people.find(p => p.id === route.id) || $projection.peopleById.get(route.id)) : null;
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
<main>
  {#if route.page === 'dashboard'}
    <section class="dashboard-3">
      <Timeline project={$appState.project} asOfDate={$appState.asOfDate} />
      <div class="stack">
        <PeoplePanel people={$projection.people} totalValue={$projection.totalValue} activeItems={$projection.activeItems} />
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
      </div>
      <ItemsPanel items={$projection.activeItems} tags={$projection.allTags} />
    </section>
    <section class="panel" style="margin-top:16px">
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
    <PersonDetail {person} projection={$projection} asOfDate={$appState.asOfDate} />
  {:else if route.page === 'item' && item}
    <ItemDetail {item} />
  {:else}
    <section class="panel"><div class="panel-body"><button on:click={() => appState.setRoute({ page: 'dashboard' })}>← Übersicht</button><div class="empty" style="margin-top:12px">Nicht gefunden.</div></div></section>
  {/if}
</main>

<DialogRouter dialog={$appState.activeDialog} project={$appState.project} projection={$projection} asOfDate={$appState.asOfDate} />
