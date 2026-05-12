<script>
  import { appState, createEvent, createRedistribution } from '../stores/projectStore.js';
  import { uid, parseTags } from '../lib/util.js';
  import { normShares } from '../lib/domain.js';
  import RedistributionDialog from './RedistributionDialog.svelte';
  import ShareEditor from './ShareEditor.svelte';
  export let dialog;
  export let project;
  export let projection;
  export let asOfDate;

  let name = '';
  let reason = '';
  let itemName = '';
  let tags = '';
  let note = '';
  let initialValue = 0;
  let valuationType = 'linear';
  let durationYears = 6;
  let minimumValue = 0;
  let shares = {};

  $: person = dialog?.personId ? project.people.find(p => p.id === dialog.personId) : null;
  $: item = dialog?.itemId ? project.items.find(i => i.id === dialog.itemId) : null;
  $: projectedItem = dialog?.itemId ? projection.items.find(i => i.id === dialog.itemId) : null;
  $: if (dialog?.type === 'personMeta' && person && !name) name = person.name;
  $: if (dialog?.type === 'itemMeta' && item && !itemName) { itemName = item.name; tags = (item.tags || []).join(', '); note = item.note || ''; }
  $: if (dialog?.type === 'shareSet' && projectedItem && Object.keys(shares).length === 0) shares = { ...(projectedItem.shares || {}) };

  function close() { appState.closeDialog(); name = ''; itemName = ''; tags = ''; note = ''; shares = {}; reason = ''; }
  function addPerson() {
    const personId = uid('person');
    appState.mutateProject(p => { p.people.push({ id: personId, name: name || 'Neue Person' }); p.events.push(createEvent('person-added', asOfDate, { personId, name: name || 'Neue Person' })); });
    close();
  }
  function savePersonMeta() { appState.mutateProject(p => { const x = p.people.find(y => y.id === person.id); if (x) x.name = name || x.name; }); close(); }
  function addItem() {
    const itemId = uid('item');
    const activePeople = projection.people.filter(p => p.active);
    const initialShares = Object.keys(shares).length ? normShares(shares) : Object.fromEntries(activePeople.map(p => [p.id, 1]));
    appState.mutateProject(p => {
      p.items.push({ id: itemId, name: itemName || 'Neuer Gegenstand', tags: parseTags(tags), note });
      p.events.push(createEvent('item-added', asOfDate, { itemId, name: itemName || 'Neuer Gegenstand', initialValue: Number(initialValue) || 0, valuation: { type: valuationType, durationYears: Number(durationYears) || 0, minimumValue: Number(minimumValue) || 0 }, shares: initialShares }));
    }); close();
  }
  function saveItemMeta() { appState.mutateProject(p => { const x = p.items.find(y => y.id === item.id); if (x) { x.name = itemName || x.name; x.tags = parseTags(tags); x.note = note; } }); close(); }
  function saveShareSet() { appState.mutateProject(p => p.events.push(createEvent('shares-set', asOfDate, { itemId: projectedItem.id, shares: normShares(shares), note: 'Anteile geändert' }))); close(); }
  function endItem() { appState.mutateProject(p => p.events.push(createEvent('item-ended', asOfDate, { itemId: projectedItem.id, statusAfter: 'ended', reason: reason || 'beendet' }))); close(); }
  function newRedistribution() {
    const r = createRedistribution(name || 'Neue Umverteilung', asOfDate, []);
    appState.mutateProject(p => p.redistributions.push(r));
    appState.setDialog({ type: 'redistributionEdit', id: r.id });
  }
</script>

{#if dialog?.type === 'redistributionEdit'}
  <RedistributionDialog {dialog} {project} {projection} />
{:else if dialog}
  <div class="modal-backdrop">
    <div class="modal" style="max-width:720px">
      <div class="modal-header"><h3>{dialog.type === 'personAdd' ? '➕ Person hinzufügen' : dialog.type === 'personMeta' ? '✏️ Personen-Stammdaten' : dialog.type === 'itemAdd' ? '➕ Gegenstand hinzufügen' : dialog.type === 'itemMeta' ? '✏️ Gegenstand-Stammdaten' : dialog.type === 'shareSet' ? '🧮 Anteile ändern' : dialog.type === 'itemEnd' ? '📦 Gegenstand beenden' : dialog.type === 'redistributionNew' ? '🔁 Umverteilung starten' : dialog.type === 'options' ? '⚙️ Optionen' : 'Dialog'}</h3><button class="ghost" on:click={close}>✕</button></div>
      <div class="modal-body stack">
        {#if dialog.type === 'personAdd' || dialog.type === 'personMeta'}
          <label>Name <input bind:value={name} placeholder="Name"></label>
        {:else if dialog.type === 'itemAdd'}
          <div class="form-grid"><label>Name <input bind:value={itemName}></label><label>Tags <input bind:value={tags} placeholder="Küche, Elektro"></label><label>Startwert <input type="number" bind:value={initialValue}></label><label>Bewertung <select bind:value={valuationType}><option value="linear">linear</option><option value="degressive">degressiv</option><option value="fixed">konstant</option></select></label><label>Nutzungsdauer/Jahre <input type="number" bind:value={durationYears}></label><label>Mindestwert <input type="number" bind:value={minimumValue}></label><label class="wide">Notiz <textarea bind:value={note}></textarea></label></div>
        {:else if dialog.type === 'itemMeta'}
          <div class="form-grid"><label>Name <input bind:value={itemName}></label><label>Tags <input bind:value={tags}></label><label class="wide">Notiz <textarea bind:value={note}></textarea></label></div>
        {:else if dialog.type === 'shareSet'}
          <ShareEditor people={projection.people} bind:shares />
        {:else if dialog.type === 'itemEnd'}
          <label>Grund <input bind:value={reason} placeholder="kaputt, verkauft, privat übernommen …"></label>
        {:else if dialog.type === 'redistributionNew'}
          <label>Titel <input bind:value={name} placeholder="z. B. Auszug Anna"></label>
        {:else if dialog.type === 'options'}
          <div class="notice">Optionen sind bewusst klein gehalten: Projekt öffnen, speichern und neues Projekt liegen rechts im Header. Weitere Einstellungen können hier später ergänzt werden.</div>
        {:else}
          <div class="notice warn">Dieser Dialogtyp ist noch nicht implementiert: {dialog.type}</div>
        {/if}
      </div>
      <div class="modal-footer"><button on:click={close}>Abbrechen</button>
        {#if dialog.type === 'personAdd'}<button class="primary" on:click={addPerson}>✅ Anlegen</button>{/if}
        {#if dialog.type === 'personMeta'}<button class="primary" on:click={savePersonMeta}>💾 Speichern</button>{/if}
        {#if dialog.type === 'itemAdd'}<button class="primary" on:click={addItem}>✅ Anlegen</button>{/if}
        {#if dialog.type === 'itemMeta'}<button class="primary" on:click={saveItemMeta}>💾 Speichern</button>{/if}
        {#if dialog.type === 'shareSet'}<button class="primary" on:click={saveShareSet}>✅ Ereignis anlegen</button>{/if}
        {#if dialog.type === 'itemEnd'}<button class="danger" on:click={endItem}>📦 Beenden</button>{/if}
        {#if dialog.type === 'redistributionNew'}<button class="primary" on:click={newRedistribution}>🔁 Umverteilung anlegen</button>{/if}
      </div>
    </div>
  </div>
{/if}
