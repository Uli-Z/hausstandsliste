<script>
  import { translate } from '../lib/i18n.js';
  import { appState } from '../stores/projectStore.js';
  import { createClaimSettlementEvent, claimSettlementErrors, validISODate } from '../lib/claimSettlement.js';
  import { money } from '../lib/domain.js';
  import HelpTip from './HelpTip.svelte';
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
    date = original?.date || asOfDate || todayISO();
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
    && validISODate(date);
  $: amountInvalid = amount.trim().length > 0 && (!Number.isSafeInteger(cents) || cents <= 0);
  $: samePerson = !!payer && payer === recipient;
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
          if (i === -1) throw new Error($translate("ui.the-original-settlement-entry-was--1huy9tm"));
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
      alert($translate("ui.settlement-was-not-saved-1tbmhev") + " " + error.message);
    }
  }

  function remove() {
    if (!original || busy) return;
    if (!confirm($translate("ui.delete-this-recorded-settlement-the-sa4wke"))) return;
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
  <div class="modal" role="dialog" aria-modal="true" aria-label={editing ? $translate("ui.edit-settlement-ok356z") : $translate("ui.record-settlement-1vfcczq")} style="max-width:560px" on:keydown={event => { if (event.key === 'Escape') close(); }}>
    <div class="modal-header">
      <div class="dialog-title"><h3>{editing ? $translate("ui.edit-settlement-ok356z") : kind === 'paid' ? $translate("ui.record-payment-10dyeok") : $translate("ui.record-settlement-1vfcczq")}</h3><HelpTip label={$translate("ui.what-happens-when-recording-this-ni3kz3")}>{kind === 'paid' ? $translate("ui.record-a-payment-that-has-already-h-fwt66e") : $translate("ui.record-a-non-cash-settlement-withou-1obvpjx")} {$translate("ui.ownership-shares-do-not-change-the--16v4sx")}</HelpTip></div>
      <button class="ghost" type="button" aria-label={$translate("ui.close-1qnddid")} on:click={close}>×</button>
    </div>
    <form class="settlement-form" on:submit|preventDefault={save}>
      <div class="modal-body stack">
        {#if date > asOfDate}<p class="settlement-date-note">{$translate('settlement.future', {date:dateDE(date)})}</p>{/if}
        <div class="form-grid">
          <label>{kind === 'paid' ? $translate("ui.who-paid-1tgy0m9") : $translate("ui.who-is-settling-mht70x")}
            <select bind:value={payer}>
              <option value="">{$translate("ui.select-person-10cm653")}</option>
              {#each people as person (person.id)}
                <option value={person.id}>{person.name}</option>
              {/each}
            </select>
          </label>
          <label>{kind === 'paid' ? $translate("ui.who-received-the-money-ztwo1k") : $translate("ui.whose-balance-is-being-settled-1h29lbp")}
            <select bind:value={recipient}>
              <option value="">{$translate("ui.select-person-10cm653")}</option>
              {#each people as person (person.id)}
                <option value={person.id}>{person.name}</option>
              {/each}
            </select>
          </label>
          <label>{$translate(kind === 'paid' ? 'settlement.paid' : 'settlement.amount')}
            <input type="text" inputmode="decimal" placeholder="0,00" bind:value={amount} autocomplete="off"/>
          </label>
          <label>{$translate(kind === 'paid' ? 'settlement.paymentDate' : 'ui.settlement-date-fw9ncy')}
            <input type="date" bind:value={date}/>
          </label>
          <label class="wide">{$translate("ui.note-optional-78uues")}
            <textarea rows="2" bind:value={note} placeholder={$translate("ui.e-g-bank-transfer-on-22-nov-bkvarc")}></textarea>
          </label>
        </div>
        {#if amountInvalid}<p class="settlement-form-error" role="alert">{$translate('errors.paymentAmount')}</p>{/if}
        {#if samePerson}<p class="settlement-form-error" role="alert">{$translate('errors.samePerson')}</p>{/if}
        <details open={advanced}>
          <summary>{$translate("ui.other-settlement-types-1d7grug")}</summary>
          <label>{$translate("ui.settlement-type-rrljhk")}
            <select bind:value={kind}>
              <option value="paid">{$translate("ui.actually-paid-1emrdll")}</option>
              <option value="external">{$translate("ui.settled-externally-no-longer-outsta-ktzy1w")}</option>
              <option value="waived">{$translate("ui.waived-without-payment-xuzqp4")}</option>
            </select>
          </label>
          <p class="muted">{$translate("ui.settled-externally-and-waived-only--ezm31f")}</p>
        </details>
        <div class="settlement-confirmation">
          <strong>{kind === 'paid' ? $translate("ui.has-this-payment-already-been-made-120a38k") : $translate("ui.has-this-settlement-been-agreed-and-uy5i03")}</strong>
        </div>
        {#if Number.isSafeInteger(cents) && cents > 0 && payer !== recipient && payer && recipient}
          <p class="settlement-effect">Saldo: {people.find(p => p.id === payer)?.name} <strong>+{money(cents / 100)}</strong> · {people.find(p => p.id === recipient)?.name} <strong>−{money(cents / 100)}</strong></p>
        {/if}
      </div>
      <div class="modal-footer">
        {#if editing}
          <button class="danger" type="button" disabled={busy || $appState.readOnly} on:click={remove}>{$translate("ui.delete-odpvb4")}</button>
        {/if}
        <button type="button" on:click={close}>{$translate("ui.cancel-cl4zc9")}</button>
        <button class="primary" type="submit" disabled={!valid || busy || $appState.readOnly}>{editing ? $translate("ui.save-changes-1wtqubg") : kind === 'paid' ? $translate("ui.record-payment-as-completed-1v8giio") : $translate("ui.record-settlement-1vfcczq")}</button>
      </div>
    </form>
  </div>
</div>

<style>
  .settlement-form{display:grid;grid-template-rows:minmax(0,1fr) auto;min-height:0;overflow:hidden}
  .dialog-title{display:flex;gap:8px;align-items:center;flex:1;min-width:0}
  .dialog-title h3{margin:0}
  .settlement-confirmation{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .settlement-form .modal-body{min-height:0;overflow-y:auto}
  .settlement-form .modal-footer{min-width:0}
  .settlement-intro{margin:0;color:var(--muted);font-size:13px;line-height:1.6}
  .settlement-date-note{font-size:12px;line-height:1.6;color:var(--muted);border-left:3px solid var(--accent);padding:8px 12px;margin:0}
  .settlement-confirmation{border-top:1px solid var(--border);padding-top:15px;display:grid;gap:5px}
  .settlement-confirmation strong{font-size:14px}
  .settlement-confirmation p{font-size:12px;color:var(--muted);line-height:1.55;margin:0}
  .settlement-effect{font-size:12px;color:var(--muted);line-height:1.55;margin:0}
  .settlement-form-error{margin:0;font-size:12px;color:var(--danger, #a12a2a)}
  .settlement-effect strong{font-variant-numeric:tabular-nums;color:var(--text)}
  details summary{cursor:pointer;font-size:12px;color:var(--muted);padding:8px 0}
  details label{margin-top:12px}
</style>
