<script>
  import { translate } from '../src/lib/i18n.js';
  export let busy=false;
  export let editable=false;
  export let dirty=false;
  export let rotate;
  let open=false, current='', next='', repeated='';
  function close(){open=false;current='';next='';repeated='';}
  async function submit(){
    if(busy || !editable || dirty || !current || next.length<8 || next===current || next!==repeated) return;
    if(!confirm($translate('session.rotationConfirm')))return;
    const success=await rotate(current,next,repeated);
    if(success)close();
    else {current='';next='';repeated='';}
  }
  $: if (!editable && !busy) close();
</script>
<section class="ux-panel setting-panel password-rotation">
  <h2>{$translate('session.rotationTitle')}</h2>
  <button type="button" class="outline-action" aria-expanded={open} disabled={busy || !editable || dirty}
    on:click={()=>open?close():open=true}>{$translate('session.rotationAction')}</button>
  {#if !editable && !busy}<p class="muted">{$translate('session.restoreReadOnly')}</p>
  {:else if dirty}<p class="muted">{$translate('session.saveFirst')}</p>{/if}
  {#if open}
    <form class="stack" on:submit|preventDefault={submit}>
      <p>{$translate('session.rotationHint')}</p>
      <label>{$translate('session.rotationCurrent')}<input type="password" autocomplete="current-password" bind:value={current} required disabled={busy}/></label>
      <label>{$translate('session.rotationNew')}<input type="password" autocomplete="new-password" bind:value={next} required minlength="8" disabled={busy}/></label>
      <label>{$translate('session.rotationRepeat')}<input type="password" autocomplete="new-password" bind:value={repeated} required minlength="8" disabled={busy}/></label>
      {#if next && next===current}<p role="alert">{$translate('session.rotationSame')}</p>
      {:else if repeated && next!==repeated}<p role="alert">{$translate('session.passwordMismatch')}</p>{/if}
      <div class="rotation-actions"><button type="button" disabled={busy} on:click={close}>{$translate('ui.cancel-cl4zc9')}</button>
        <button class="primary" type="submit" disabled={busy || !editable || dirty || !current || next.length<8 || next===current || next!==repeated}>{$translate('session.rotationAction')}</button></div>
    </form>
  {/if}
</section>
<style>
  .rotation-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
</style>
