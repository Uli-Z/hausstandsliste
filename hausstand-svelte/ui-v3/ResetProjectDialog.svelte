<script>
  import { onMount } from 'svelte';
  import { translate } from '../src/lib/i18n.js';
  export let server = false;
  export let reset;
  export let close;
  let element, word = '', busy = false;
  onMount(() => element.showModal());
  function cancel() { if (!busy) close(); }
  async function submit() {
    if (busy || word !== $translate('reset.word')) return;
    busy = true;
    // Close on failure as well so the shared error toast is not obscured by
    // the native dialog's top layer; retry requires deliberate reconfirmation.
    try { if (!(await reset())) close(); } finally { busy = false; }
  }
</script>

<dialog bind:this={element} class="session-log-dialog reset-project-dialog" aria-labelledby="reset-title" on:cancel|preventDefault={cancel}>
  <form on:submit|preventDefault={submit}>
    <div class="modal-header"><h3 id="reset-title">{$translate('reset.action')}</h3></div>
    <div class="modal-body">
      <p class="inline-info warning"><strong>{$translate('reset.testOnly')}</strong> {$translate('reset.warning')}</p>
      <p>{$translate(server ? 'reset.serverScope' : 'reset.localScope')}</p>
      <p>{$translate('reset.external')}</p>
      <label for="reset-confirm-word">{$translate('reset.typeWord',{word:$translate('reset.word')})}</label>
      <input id="reset-confirm-word" bind:value={word} disabled={busy} autocomplete="off" spellcheck="false" />
    </div>
    <div class="modal-footer">
      <button type="button" class="outline-action" disabled={busy} on:click={cancel}>{$translate('ui.cancel-cl4zc9')}</button>
      <button type="submit" class="dangerous-button" disabled={busy || word !== $translate('reset.word')}>{$translate(busy ? 'reset.running' : 'reset.confirm')}</button>
    </div>
  </form>
</dialog>

<style>
  .reset-project-dialog{width:min(480px,calc(100vw - 24px));max-height:calc(100dvh - 32px);overflow:auto}
  .reset-project-dialog input{width:100%;box-sizing:border-box}
  .reset-project-dialog .modal-footer{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
</style>
