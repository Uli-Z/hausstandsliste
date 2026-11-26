<script context="module">
  let nextHelpId = 0;
</script>

<script>
  import { tick } from 'svelte';

  export let label = 'Help';

  const popupId = `help-tip-${++nextHelpId}`;
  let open = false;
  let openedForLabel = label;
  let trigger;
  let popup;
  let root;
  let left = 12;
  let top = 12;
  let popupWidth = 320;

  function close(restoreFocus = false) {
    if (!open) return;
    open = false;
    if (restoreFocus) trigger?.focus();
  }

  function positionPopup() {
    if (typeof window === 'undefined' || !trigger || !popup) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(320, Math.max(0, window.innerWidth - 24));
    const availableBelow = window.innerHeight - rect.bottom - 12;
    const availableAbove = rect.top - 12;
    // Read the actual content height, rather than assuming all help has equal length.
    const height = Math.min(popup.scrollHeight + 2, 270, window.innerHeight * 0.48);
    popupWidth = width;
    left = Math.max(12, Math.min(rect.left - 20, window.innerWidth - width - 12));
    const above = availableBelow < Math.min(height, 160) && availableAbove > availableBelow;
    const desiredTop = above ? rect.top - height - 8 : rect.bottom + 8;
    top = Math.max(8, Math.min(desiredTop, window.innerHeight - height - 8));
  }

  async function toggle() {
    if (open) { close(); return; }
    if (typeof window !== 'undefined') popupWidth = Math.min(320, Math.max(0, window.innerWidth - 24));
    openedForLabel = label;
    open = true;
    await tick();
    if (open) positionPopup();
  }

  // A language/subject change must never leave outdated help visible.
  $: if (open && label !== openedForLabel) close();

  function onWindowClick(event) {
    if (open && root && !root.contains(event.target)) close();
  }
  function onWindowFocus(event) {
    // Keyboard users should not carry a floating help overlay into the next field.
    if (open && root && !root.contains(event.target)) close();
  }
  function onKeydown(event) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    // A tooltip is not a second tab stop. Keep focus on its trigger, but let
    // keyboard users scroll a long explanation without moving the page.
    if (event.target !== trigger || !popup || popup.scrollHeight <= popup.clientHeight) return;
    const increments = { ArrowDown: 32, ArrowUp: -32, PageDown: popup.clientHeight, PageUp: -popup.clientHeight };
    if (Object.hasOwn(increments, event.key)) {
      event.preventDefault();
      event.stopPropagation();
      popup.scrollTop += increments[event.key];
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      popup.scrollTop = event.key === 'Home' ? 0 : popup.scrollHeight;
    }
  }
  function onWindowScroll(event) {
    // The tooltip itself can scroll on short screens without disappearing.
    if (open && !popup?.contains(event.target)) close();
  }
</script>

<svelte:window
  on:click={onWindowClick}
  on:focusin={onWindowFocus}
  on:keydown={onKeydown}
  on:scroll|capture={onWindowScroll}
  on:resize={() => { if (open) positionPopup(); }}
/>

<span class="help-wrap" bind:this={root}>
  <button
    bind:this={trigger}
    type="button"
    class="help-trigger"
    aria-label={label}
    aria-expanded={open}
    aria-controls={open ? popupId : undefined}
    aria-describedby={open ? popupId : undefined}
    on:click={toggle}
    on:keydown={onKeydown}
  >?</button>
  {#if open}
    <span
      bind:this={popup}
      id={popupId}
      class="help-popup"
      role="tooltip"
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
    width:36px;height:36px;min-width:36px;min-height:36px;padding:0;
    border:1px solid var(--border);border-radius:50%;
    background:transparent;color:var(--muted);font-size:14px;font-weight:700;
    line-height:1;box-shadow:none;cursor:pointer
  }
  .help-trigger:hover,.help-trigger[aria-expanded="true"]{
    background:var(--soft);color:var(--text);border-color:var(--muted)
  }
  .help-trigger:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  @media (pointer:coarse){.help-trigger{width:44px;height:44px;min-width:44px;min-height:44px}}
  .help-popup{
    position:fixed;z-index:150;display:block;box-sizing:border-box;max-height:min(270px,48vh);overflow-y:auto;
    border:1px solid var(--border);border-radius:12px;
    background:var(--panel);color:var(--text);
    padding:13px 15px;box-shadow:0 12px 34px rgba(20,40,50,.18);
    font-size:13px;font-weight:400;line-height:1.5;text-align:left;
    white-space:normal;overflow-wrap:anywhere;overscroll-behavior:contain
  }
  .help-popup :global(p){margin:0 0 8px}
  .help-popup :global(p:last-child){margin-bottom:0}
</style>
