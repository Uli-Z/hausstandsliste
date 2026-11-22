<script>
  import { appState } from '../stores/projectStore.js';
  import { createClaimSettlementEvent, claimSettlementErrors } from '../lib/claimSettlement.js';
  import { money } from '../lib/domain.js';
  import { nextEventOrder, todayISO, dateDE } from '../lib/util.js';

  export let dialog;
  export let project;
  export let asOfDate;

  let initializedFor;
  let date = '';
  let payer = '';
  let recipient = '';
  let amount = '';
  let kind = 'paid';
  let note = '';
  let advanced = false;
  let busy = false;

  $: original = dialog?.eventId
    ? (project.events || []).find(e => e.id === dialog.eventId && e.type === 'claim-settlement-recorded')
    : null;
  $: if (dialog && dialog !== initializedFor) {
    initializedFor = dialog;
    date = original?.date || todayISO();
    payer = original?.debtorPersonId || dialog.payerPersonId || '';
    recipient = original?.creditorPersonId || dialog.recipientPersonId || '';
    amount = original ? (original.amountCents / 100).toFixed(2).replace('.', ',')
      : dialog.amountCents != null ? (dialog.amountCents / 100).toFixed(2).replace('.', ',') : '';
    kind = original?.settlementKind || 'paid';
    note = original?.note || '';
    advanced = kind !== 'paid';
    busy = false;
  }

  // No negative amounts, exponent notation, or floating-point cent fractions.
  $: cents = /^\d+(?:[.,]\d{1,2})?$/.test(amount.trim())
    ? Math.round(Number(amount.trim().replace(',', '.')) * 100) : NaN;
  $: people = project.people || [];
  $: valid = payer && recipient && payer !== recipient
    && people.some(p => p.id === payer) && people.some(p => p.id === recipient)
    && Number.isSafeInteger(cents) && cents > 0
    && /^\d{4}-\d{2}-\d{2}$/.test(date);
  $: editing = !!dialog?.eventId;

  function close() { appState.closeDialog(); }

  function save() {
    if (!valid || busy) return;
    busy = true;
    let updated;
    try {
      updated = original
        ? { ...original, date, order: original.date === date ? original.order : nextEventOrder(project, date),
            amountCents: cents, debtorPersonId: payer, creditorPersonId: recipient,
            settlementKind: kind, note }
        : createClaimSettlementEvent(project, {
            date, amountCents: cents, debtorPersonId: payer, creditorPersonId: recipient,
            settlementKind: kind, note
          });
      const problems = claimSettlementErrors(updated);
      if (problems.length) throw new Error(problems.join(' '));
      const saved = appState.mutateProject(p => {
        if (original) {
          const i = p.events.findIndex(e => e.id === original.id && e.type === 'claim-settlement-recorded');
          if (i === -1) throw new Error('Die ursprüngliche Buchung wurde nicht gefunden.');
          p.events[i] = updated;
        } else p.events.push(updated);
      });
      if (saved) {
        // If a newly documented payment happens after the viewed cutoff,
        // reveal its effect instead of leaving an apparently unchanged balance.
        if (date > asOfDate) appState.setAsOfDate(date);
        close();
      } else busy = false;
    } catch (error) {
      busy = false;
      alert('Ausgleich nicht gespeichert: ' + error.message);
    }
  }

  function remove() {
    if (!original || busy) return;
    if (!confirm('Diesen dokumentierten Ausgleich wirklich löschen? Der Ausgleichssaldo wird danach neu berechnet.')) return;
    busy = true;
    const saved = appState.mutateProject(p => {
      const i = p.events.findIndex(e => e.id === original.id && e.type === 'claim-settlement-recorded');
      if (i !== -1) p.events.splice(i, 1);
    });
    if (saved) close();
    else busy = false;
  }
</script>

<div class="modal-backdrop">
  <div class="modal" role="dialog" aria-modal="true" aria-label={editing ? 'Ausgleich bearbeiten' : 'Ausgleich dokumentieren'} style="max-width:560px" on:keydown={event => { if (event.key === 'Escape') close(); }}>
    <div class="modal-header">
      <h3>{editing ? 'Ausgleich bearbeiten' : kind === 'paid' ? 'Zahlung dokumentieren' : 'Ausgleich dokumentieren'}</h3>
      <button class="ghost" type="button" aria-label="Schließen" on:click={close}>×</button>
    </div>
    <form on:submit|preventDefault={save}>
      <div class="modal-body stack">
        <p class="settlement-intro">{kind === 'paid' ? 'Hier erfasst du eine Zahlung, die bereits stattgefunden hat. Die App überweist selbst kein Geld.' : 'Hier dokumentierst du eine Verrechnung ohne neue Überweisung.'} Die Eigentumsanteile bleiben unverändert.</p>
        {#if date > asOfDate}<p class="settlement-date-note">Du betrachtest den Stand vom {dateDE(asOfDate)}. Nach dem Speichern wechselt die Ansicht zum {dateDE(date)}, damit du die Wirkung des Ausgleichs siehst.</p>{/if}
        <div class="form-grid">
          <label>{kind === 'paid' ? 'Wer hat bezahlt?' : 'Von wem geht der Ausgleich aus?'}
            <select bind:value={payer}>
              <option value="">Person auswählen</option>
              {#each people as person (person.id)}
                <option value={person.id}>{person.name}</option>
              {/each}
            </select>
          </label>
          <label>{kind === 'paid' ? 'Wer hat das Geld erhalten?' : 'Wessen Saldo wird ausgeglichen?'}
            <select bind:value={recipient}>
              <option value="">Person auswählen</option>
              {#each people as person (person.id)}
                <option value={person.id}>{person.name}</option>
              {/each}
            </select>
          </label>
          <label>{kind === 'paid' ? 'Gezahlter Betrag in Euro' : 'Ausgleichsbetrag in Euro'}
            <input type="text" inputmode="decimal" placeholder="0,00" bind:value={amount} autocomplete="off"/>
          </label>
          <label>{kind === 'paid' ? 'Zahlungsdatum' : 'Datum des Ausgleichs'}
            <input type="date" bind:value={date}/>
          </label>
          <label class="wide">Notiz (optional)
            <textarea rows="2" bind:value={note} placeholder="z. B. Überweisung am 22.11."></textarea>
          </label>
        </div>
        <details open={advanced}>
          <summary>Andere Ausgleichsarten</summary>
          <label>Art des Ausgleichs
            <select bind:value={kind}>
              <option value="paid">Tatsächlich gezahlt</option>
              <option value="external">Extern abgerechnet (hier nicht mehr offen)</option>
              <option value="waived">Erlassen (ohne Geldfluss)</option>
            </select>
          </label>
          <p class="muted">„Extern abgerechnet“ und „Erlassen“ verringern nur den hier angezeigten Saldo. Sie belegen keine Überweisung.</p>
        </details>
        <div class="settlement-confirmation">
          <strong>{kind === 'paid' ? 'Ist diese Zahlung bereits erfolgt?' : 'Ist dieser Ausgleich vereinbart und erfolgt?'}</strong>
          <p>Mit dem Speichern dokumentierst du diesen Vorgang verbindlich im Änderungsverlauf. Der Betrag kann später korrigiert oder die Buchung gelöscht werden.</p>
        </div>
        {#if Number.isSafeInteger(cents) && cents > 0 && payer !== recipient && payer && recipient}
          <p class="settlement-effect">Danach ändert sich der Ausgleichssaldo um <strong>+{money(cents / 100)}</strong> für {people.find(p => p.id === payer)?.name} und <strong>−{money(cents / 100)}</strong> für {people.find(p => p.id === recipient)?.name}.</p>
        {/if}
      </div>
      <div class="modal-footer">
        {#if editing}
          <button class="danger" type="button" disabled={busy || $appState.readOnly} on:click={remove}>Löschen</button>
        {/if}
        <button type="button" on:click={close}>Abbrechen</button>
        <button class="primary" type="submit" disabled={!valid || busy || $appState.readOnly}>{editing ? 'Änderungen speichern' : kind === 'paid' ? 'Zahlung als erfolgt erfassen' : 'Ausgleich dokumentieren'}</button>
      </div>
    </form>
  </div>
</div>

<style>
  .settlement-intro{margin:0;color:var(--muted);font-size:13px;line-height:1.6}
  .settlement-date-note{font-size:12px;line-height:1.6;color:var(--muted);border-left:3px solid var(--accent);padding:8px 12px;margin:0}
  .settlement-confirmation{border-top:1px solid var(--border);padding-top:15px;display:grid;gap:5px}
  .settlement-confirmation strong{font-size:14px}
  .settlement-confirmation p{font-size:12px;color:var(--muted);line-height:1.55;margin:0}
  .settlement-effect{font-size:12px;color:var(--muted);line-height:1.55;margin:0}
  .settlement-effect strong{font-variant-numeric:tabular-nums;color:var(--text)}
  details summary{cursor:pointer;font-size:12px;color:var(--muted);padding:8px 0}
  details label{margin-top:12px}
</style>
