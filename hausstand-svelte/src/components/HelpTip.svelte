<script>
  export let label = 'Hilfe anzeigen';

  let open = false;
  let trigger;
  let root;
  let left = 12;
  let top = 48;
  let popupWidth = 320;

  function toggle() {
    if (open) { open = false; return; }
    if (typeof window !== 'undefined' && trigger) {
      const rect = trigger.getBoundingClientRect();
      popupWidth = Math.min(320, Math.max(200, window.innerWidth - 24));
      left = Math.min(Math.max(12, rect.left - 20), Math.max(12, window.innerWidth - popupWidth - 12));
      const availableBelow = window.innerHeight - rect.bottom;
      top = availableBelow > 190 ? rect.bottom + 8 : Math.max(12, rect.top - 220);
    }
    open = true;
  }

  function onWindowClick(event) {
    if (open && root && !root.contains(event.target)) open = false;
  }
  function onWindowKeydown(event) {
    if (open && event.key === 'Escape') { open = false; trigger?.focus(); }
  }
</script>

<svelte:window on:click={onWindowClick} on:keydown={onWindowKeydown} on:scroll|capture={() => open = false} on:resize={() => open = false} />

<span class="help-wrap" bind:this={root}>
  <button
    bind:this={trigger}
    type="button"
    class="help-trigger"
    aria-label={label}
    title={label}
    aria-expanded={open}
    on:click={toggle}
  >?</button>
  {#if open}
    <span
      class="help-popup"
      role="note"
      style:left={left + 'px'}
      style:top={top + 'px'}
      style:width={popupWidth + 'px'}
    >
      <slot/>
    </span>
  {/if}
</span>

<style>
  .help-wrap{display:inline-flex;align-items:center;vertical-align:middle;flex:none}
  .help-trigger{
    display:inline-flex;justify-content:center;align-items:center;
    width:32px;height:32px;min-width:32px;min-height:32px;padding:0;
    border:1px solid var(--border);border-radius:50%;
    background:transparent;color:var(--muted);font-size:12px;font-weight:700;
    line-height:1;box-shadow:none;cursor:pointer
  }
  .help-trigger:hover,.help-trigger[aria-expanded="true"]{
    background:var(--soft);color:var(--text);border-color:var(--muted)
  }
  .help-trigger:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .help-popup{
    position:fixed;z-index:150;display:block;box-sizing:border-box;max-height:min(270px,48vh);overflow-y:auto;
    border:1px solid var(--border);border-radius:12px;
    background:var(--panel);color:var(--text);
    padding:13px 15px;box-shadow:0 12px 34px rgba(20,40,50,.18);
    font-size:12px;font-weight:400;line-height:1.6;text-align:left;
    white-space:normal;overflow-wrap:anywhere
  }
  .help-popup :global(p){margin:0 0 8px}
  .help-popup :global(p:last-child){margin-bottom:0}
</style>
