<script>
  import { onMount } from 'svelte';
  import { translate, locale } from '../src/lib/i18n.js';
  import { sessionChangeText } from '../src/lib/sessionLog.js';
  export let log;
  export let locked = false;
  export let jump;
  export let close;
  let element;
  onMount(()=>{ element.showModal(); });
  function choose(index) {
    if (!locked && index!==log.cursor) jump(index);
  }
</script>

<dialog bind:this={element} class="session-log-dialog" aria-labelledby="session-log-title"
  on:cancel|preventDefault={close}>
  <div class="modal-header">
    <h3 id="session-log-title">{$translate('sessionLog.title')}</h3>
    <button type="button" class="ghost" aria-label={$translate('sessionLog.close')} on:click={close}>✕</button>
  </div>
  <div class="modal-body">
    <p class="muted">{$translate('sessionLog.intro')}</p>
    {#if locked}<p class="notice" role="status">{$translate('sessionLog.blocked')}</p>{/if}
    {#if log.savedOutside}<p class="muted">{$translate('sessionLog.savedOutside')}</p>{:else if !log.hasSaved}<p class="muted">{$translate('sessionLog.noSaved')}</p>{/if}
    {#if !log.entries.length}<p class="muted">{$translate('sessionLog.empty')}</p>{/if}
    <ol class="session-log-list" start="0">
      {#each [null,...log.entries] as entry,index (index===0?'start':log.steps[index-1].sequence)}
        <li>
          <button type="button" class:log-current={index===log.cursor} class:log-undone={index>log.cursor}
            aria-current={index===log.cursor?'step':undefined} disabled={locked}
            on:click={()=>choose(index)}>
            <span class="session-log-name">{entry?sessionChangeText(entry,$locale):$translate('sessionLog.start')}</span>
            <span class="session-log-status">
              {#if entry}<span class="session-log-step">#{log.steps[index-1].sequence} · <time datetime={log.steps[index-1].recordedAt}>{new Date(log.steps[index-1].recordedAt).toLocaleString($locale,{dateStyle:'short',timeStyle:'medium'})}</time> · </span>{/if}
              {index===log.cursor?$translate('sessionLog.current'):index>log.cursor?$translate('sessionLog.redoable'):$translate('sessionLog.applied')}
              {#if log.savedIndex===index} · {$translate('sessionLog.saved')}{/if}
            </span>
          </button>
        </li>
      {/each}
    </ol>
  </div>
</dialog>
