<script>
  import { fade } from 'svelte/transition';
  import { notifications } from '../src/lib/notifications.js';
  import { translate } from '../src/lib/i18n.js';
  const exitDuration = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 0 : 180;
  const symbols = { success: '✓', error: '!', warning: '!', info: 'i' };
</script>

<!-- Always mounted, including on the unauthenticated server login screen. -->
<div class="notification-stack" aria-label={$translate('toast.region')}>
  <div class="notification-lane" aria-live="polite" aria-relevant="additions">
    {#each $notifications.filter(entry => entry.kind !== 'error') as entry (entry.id)}
      <div class="notification" out:fade={{duration:exitDuration()}} class:save-feedback={entry.source === 'storage'} data-kind={entry.kind} role="status">
        <span class="notification-symbol" aria-hidden="true">{symbols[entry.kind]}</span>
        <div class="notification-body"><strong>{$translate('toast.' + entry.kind)}</strong><span>{entry.message}</span></div>
        <button type="button" on:click={() => notifications.dismiss(entry.id)} aria-label={$translate('ui.close-1qnddid')}>×</button>
      </div>
    {/each}
  </div>
  <div class="notification-lane" aria-live="assertive" aria-relevant="additions">
    {#each $notifications.filter(entry => entry.kind === 'error') as entry (entry.id)}
      <div class="notification" out:fade={{duration:exitDuration()}} class:save-feedback={entry.source === 'storage'} data-kind="error" role="alert">
        <span class="notification-symbol" aria-hidden="true">!</span>
        <div class="notification-body"><strong>{$translate('toast.error')}</strong><span>{entry.message}</span></div>
        <button type="button" on:click={() => notifications.dismiss(entry.id)} aria-label={$translate('ui.close-1qnddid')}>×</button>
      </div>
    {/each}
  </div>
</div>

<style>
  .notification-stack{position:fixed;z-index:10000;inset-block-start:max(12px,env(safe-area-inset-top));inset-inline-end:max(12px,env(safe-area-inset-right));width:min(360px,calc(100vw - 24px));display:grid;gap:4px;pointer-events:none;max-height:calc(100dvh - 90px);overflow:auto}
  .notification-lane{display:grid;gap:8px}
  .notification.notification{position:relative;display:grid;grid-template-columns:24px minmax(0,1fr) 32px;align-items:start;gap:10px;box-sizing:border-box;margin:0;padding:12px;background:#fff;color:#23372d;border:1px solid #cad7cf;border-inline-start:4px solid #417c59;border-radius:10px;box-shadow:0 4px 18px #142d2424;pointer-events:none;animation:appear .15s ease-out}
  .notification[data-kind="error"]{border-inline-start-color:#a42b35}
  .notification[data-kind="warning"]{border-inline-start-color:#92600d}
  .notification[data-kind="info"]{border-inline-start-color:#356a9b}
  .notification-body{display:grid;gap:3px;font-size:.875rem;line-height:1.35;overflow-wrap:anywhere}
  .notification-symbol{font-size:1.1rem;font-weight:700;text-align:center}
  .notification button{display:grid;place-items:center;background:transparent;color:inherit;border:0;border-radius:5px;width:32px;height:32px;font:inherit;font-size:1.3rem;cursor:pointer;pointer-events:auto}
  .notification button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
  @keyframes appear{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}
  @media(max-width:600px){.notification-stack{inset-block-start:auto;inset-block-end:calc(76px + env(safe-area-inset-bottom));max-height:calc(100dvh - 160px)}}
  @media(prefers-reduced-motion:reduce){.notification.notification{animation:none}}
</style>
