<script>
  import Header from './components/Header.svelte';
  import Timeline from './components/Timeline.svelte';
  import PeoplePanel from './components/PeoplePanel.svelte';
  import ItemsPanel from './components/ItemsPanel.svelte';
  import PersonDetail from './components/PersonDetail.svelte';
  import ItemDetail from './components/ItemDetail.svelte';
  import DialogRouter from './components/DialogRouter.svelte';
  import { appState, projection } from './stores/projectStore.js';
  import { exportProject } from './lib/persistence.js';
  import { money } from './lib/domain.js';
  let tab = 'redistributions';
  $: route = $appState.route;
  $: person = route.page === 'person' ? ($projection.people.find(p => p.id === route.id) || $projection.peopleById.get(route.id)) : null;
  $: item = route.page === 'item' ? $projection.items.find(i => i.id === route.id) : null;
</script>

<Header />
<main>
  {#if route.page === 'dashboard'}
    <section class="dashboard-3">
      <Timeline project={$appState.project} asOfDate={$appState.asOfDate} />
      <PeoplePanel people={$projection.people} totalValue={$projection.totalValue} activeItems={$projection.activeItems} />
      <ItemsPanel items={$projection.activeItems} tags={$projection.allTags} />
    </section>
    <section class="panel" style="margin-top:16px">
      <div class="tabs"><button class="tab" class:active={tab==='redistributions'} on:click={() => tab='redistributions'}>🔁 Umverteilungen</button><button class="tab" class:active={tab==='archive'} on:click={() => tab='archive'}>📦 Archiv</button><button class="tab" class:active={tab==='json'} on:click={() => tab='json'}>🧾 JSON</button></div>
      <div class="panel-body">
        {#if tab === 'redistributions'}
          {#if $appState.project.redistributions?.length}<div class="stack">{#each $appState.project.redistributions as r}<div class="event-card"><div class="split"><div><div class="event-type">redistribution</div><strong>{r.title}</strong><div class="muted">{r.effectiveDate} · {r.changes?.length || 0} Änderung(en)</div></div><button class="small" on:click={() => appState.setDialog({ type: 'redistributionEdit', id: r.id })}>✏️ Öffnen</button></div></div>{/each}</div>{:else}<div class="empty">Keine gespeicherten Umverteilungen.</div>{/if}
        {:else if tab === 'archive'}
          {#if $projection.archivedItems.length}<table><thead><tr><th>Gegenstand</th><th>Status</th><th>Tags</th></tr></thead><tbody>{#each $projection.archivedItems as i}<tr><td>{i.name}</td><td>{i.status}</td><td>{(i.tags || []).join(', ')}</td></tr>{/each}</tbody></table>{:else}<div class="empty">Noch keine archivierten Gegenstände.</div>{/if}
        {:else}
          <pre class="json-preview">{JSON.stringify(exportProject($appState.project, $appState.asOfDate), null, 2)}</pre>
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
