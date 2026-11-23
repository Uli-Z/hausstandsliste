<script>
  // Small, dependency-free line icons; SVG avoids font-dependent symbol glyphs.
  export let name = 'box';
  export let size = 19;
  export let strokeWidth = 1.9;
</script>

<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round"
  stroke-linejoin="round" aria-hidden="true" focusable="false" class="action-icon">
  {#if name === 'home'}
    <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>
  {:else if name === 'box'}
    <path d="m3 7 9-4 9 4v10l-9 4-9-4z"/><path d="m3 7 9 4 9-4M12 11v10"/>
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14"/>
  {:else if name === 'people'}
    <circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5v1"/>
  {:else if name === 'person-add'}
    <circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M19 8v8M15 12h8"/>
  {:else if name === 'arrows'}
    <path d="M4 7h16l-4-4M20 7l-4 4M20 17H4l4-4M4 17l4 4"/>
  {:else if name === 'download'}
    <path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>
  {:else if name === 'clock'}
    <circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>
  {:else if name === 'undo'}
    <path d="M9 14 4 9l5-5M4 9h9a7 7 0 0 1 0 14"/>
  {:else if name === 'redo'}
    <path d="m15 14 5-5-5-5m5 5h-9a7 7 0 0 0 0 14"/>
  {:else if name === 'edit'}
    <path d="M12 20h9M16 4a2 2 0 0 1 3 3L8 18l-5 1 1-5z"/>
  {:else if name === 'check'}
    <path d="m4 12 5 5L20 6"/>
  {:else if name === 'list'}
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
  {:else if name === 'settings'}
    <circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.2-1.7l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2.9-1.7L13.1 2h-4L8.7 4.6a7 7 0 0 0-2.9 1.7l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 3.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2.9 1.7l.4 2.6h4l.4-2.6a7 7 0 0 0 2.9-1.7l2.4 1 2-3.4-2-1.6A7 7 0 0 0 19 12z" transform="translate(1 0) scale(.91 1)"/>
  {:else if name === 'archive'}
    <rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 13h4"/>
  {:else if name === 'trash'}
    <path d="M4 7h16M10 4h4M6 7l1 14h10l1-14M10 11v6M14 11v6"/>
  {:else if name === 'wallet'}
    <rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 10h18M16 15h3"/>
  {:else if name === 'close'}
    <path d="M5 5 19 19M19 5 5 19"/>
  {/if}
</svg>

<style>
  .action-icon{display:inline-block;vertical-align:middle;flex:none}
</style>
