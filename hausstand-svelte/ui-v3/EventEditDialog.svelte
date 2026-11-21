<script>
  import { appState } from '../src/stores/projectStore.js';
  import { dateDE, uid, clone } from '../src/lib/util.js';
  import { normShares } from '../src/lib/domain.js';
  import ShareEditor from './ShareEditor.svelte';
  import { isEnterForSubmit } from './form-behavior.js';

  export let dialog;
  export let project;
  export let projection;

  $: event = project.events.find(e => e.id === dialog.eventId);
  let edited = null;

  $: if (event && !edited) {
    edited = clone(event);
    if (edited.type === 'shares-set' && !edited.financialMode) edited.financialMode = 'none';
  }

  function confirmFromInput(event) {
    if (!isEnterForSubmit(event)) return;
    event.preventDefault();
    save();
  }

  function save() {
    if (!edited) return;
    appState.mutateProject(p => {
      const idx = p.events.findIndex(e => e.id === edited.id);
      if (idx >= 0) p.events[idx] = { ...edited };
    });
    appState.closeDialog();
  }

  function remove() {
    if (!confirm('Ereignis wirklich löschen?')) return;
    appState.mutateProject(p => {
      p.events = p.events.filter(e => e.id !== event.id);
    });
    appState.closeDialog();
  }

  $: people = projection.people;
  $: items = projection.items;
</script>

<div class="modal-backdrop">
  <div class="modal" role="dialog" aria-modal="true" aria-label="Änderung bearbeiten" on:keydown={confirmFromInput}>
    <div class="modal-header">
      <h3>Änderung bearbeiten</h3>
      <button class="ghost" on:click={() => appState.closeDialog()}>✕</button>
    </div>
    <div class="modal-body stack">
      {#if edited}
        <div class="form-grid">
          <label>Datum <input type="date" bind:value={edited.date}></label>
          
          {#if edited.type === 'person-added'}
            <label>Name zum damaligen Zeitpunkt <input bind:value={edited.name}></label>
            <div class="notice">Hinweis: Der Stammdatenname wird in der Personenliste geändert.</div>
          {:else if edited.type === 'person-deactivated'}
            <label>Grund <input bind:value={edited.reason}></label>
          {:else if edited.type === 'person-reactivated'}
            <label>Grund <input bind:value={edited.reason}></label>
          {:else if edited.type === 'item-added'}
            <label>Name zum damaligen Zeitpunkt <input bind:value={edited.name}></label>
            <label>Startwert <input type="number" step="0.01" bind:value={edited.initialValue}></label>
            <section class="mini-card stack">
              <strong>Bewertung</strong>
              <label>Typ <select bind:value={edited.valuation.type}>
                <option value="fixed">Fixwert / Konstant</option>
                <option value="linear">Linear über Zeit</option>
                <option value="degressive">Degressiv % pro Jahr</option>
              </select></label>
              {#if edited.valuation.type === 'linear'}
                <label>Nutzungsdauer (Jahre) <input type="number" bind:value={edited.valuation.durationYears}></label>
              {:else if edited.valuation.type === 'degressive'}
                <label>Jährliche Rate (0-1) <input type="number" step="0.01" bind:value={edited.valuation.annualRate}></label>
              {/if}
              <label>Mindestwert <input type="number" step="0.01" bind:value={edited.valuation.minimumValue}></label>
            </section>
            <section class="mini-card stack">
              <strong>Ursprüngliche Eigentumsanteile</strong>
              <ShareEditor {people} bind:shares={edited.shares} />
              <label>Von wem finanziert?
                <select value={edited.financedByPersonId || ''} on:change={e => {
                  edited.financedByPersonId = e.currentTarget.value;
                  edited.financialMode = edited.financedByPersonId ? 'derived' : 'none';
                }}>
                  <option value="">Nicht dokumentiert / keine Forderung</option>
                  {#each project.people || [] as person}
                    <option value={person.id}>{person.name}</option>
                  {/each}
                </select>
              </label>
            </section>
          {:else if edited.type === 'item-ended'}
            <label>Status danach <select bind:value={edited.statusAfter}>
              <option value="ended">beendet</option>
              <option value="taken-private">privat übernommen</option>
              <option value="disposed">entsorgt / kaputt</option>
              <option value="succeeded">fortgeführt als neue Version</option>
            </select></label>
            <label>Grund <input bind:value={edited.reason}></label>
          {:else if edited.type === 'shares-set'}
            <label>Notiz <input bind:value={edited.note}></label>
            <section class="mini-card stack">
              <strong>Anteile</strong>
              <ShareEditor {people} bind:shares={edited.shares} />
              <label>Sollen Geldforderungen entstehen?
                <select bind:value={edited.financialMode}>
                  <option value="derived">Ja – Betrag automatisch berechnen</option>
                  <option value="none">Nein – Schenkung oder Korrektur</option>
                </select>
              </label>
            </section>
          {/if}
        </div>
      {:else}
        <div class="empty">Ereignis nicht gefunden.</div>
      {/if}
    </div>
    <div class="modal-footer">
      <button class="danger" on:click={remove}>Löschen</button>
      <div style="flex:1"></div>
      <button on:click={() => appState.closeDialog()}>Abbrechen</button>
      <button class="primary" on:click={save}>Änderung speichern</button>
    </div>
  </div>
</div>
