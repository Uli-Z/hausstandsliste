<script>
  import { onMount } from 'svelte';
  import { translate, serverErrorMessage, localizeDiagnostic } from '../src/lib/i18n.js';
  import { appState } from '../src/stores/projectStore.js';
  import { notifications } from '../src/lib/notifications.js';
  import { mailFeedback, confirmedSave } from '../src/lib/saveFeedback.js';
  import { exportProject } from '../src/lib/persistence.js';
  import { emptyProject, requireProjectFile } from '../src/lib/domain.js';
  import { createPortableSave, verifyPortableHistory } from '../src/lib/versionHistory.js';
  import { encryptProject, decryptProject, hashSecret, randomSecret } from '../src/lib/crypto.js';

  const id = 'hausstand-hauptdatei';
  const deviceKey = `hausstand-session:${location.pathname}`;
  export let authenticated = false;
  export let editing = false;
  export let busy = false;
  export let saving = false;
  export let mailRetryRevision = null;
  // Session actions report directly to the shared stack, independent of navigation.
  function sessionNotice(key, kind = 'success', params = {}) {
    notifications.dismissSource('server-session');
    notifications.notify($translate(key, params), {kind, source:'server-session'});
  }
  let initialized = null, pass = '', repeat = '', admin = '', error = '';
  let activePassword = '', editToken = '', leaseToken = '', revision = 0;
  let leaseExpires = 0;
  const leaseCheckInterval = 60_000;

  function loseLease(reason) {
    editing = false; leaseToken = ''; leaseExpires = 0;
    sessionStorage.removeItem(deviceKey + ':lease');
    appState.setReadOnly(true, reason);
  }

  // Check the server's existing lease rather than assuming that a tab retains
  // write permission indefinitely. Do not renew hidden or signed-out tabs.
  async function checkLease() {
    if (!authenticated || !editing || !leaseToken || busy) return;
    if (leaseExpires && Date.now() >= leaseExpires * 1000) {
      const reason = serverErrorMessage('leaseExpired',409);
      loseLease(reason); sessionNotice('session.leaseLost', 'error', {reason});
      return;
    }
    if (document.visibilityState !== 'visible') return;
    busy = true;
    try {
      const result = await api('renew', {});
      leaseExpires = result.expiresAt;
    } catch (e) {
      // A transient network failure does not revoke a still-valid lease.
      // The existing API guard handles explicit server rejection immediately.
      if (!editing) sessionNotice('session.leaseLost', 'error', {reason:localizeDiagnostic(e.message)});
    } finally { busy = false; }
  }

  // The key is non-extractable; the saved passphrase is encrypted at rest in IndexedDB.
  function database() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('hausstand-device-login', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('credentials');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function deviceStore(mode, value) {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('credentials', mode === 'get' ? 'readonly' : 'readwrite');
        const store = tx.objectStore('credentials');
        const req = mode === 'get' ? store.get(deviceKey) : mode === 'delete' ? store.delete(deviceKey) : store.put(value, deviceKey);
        req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
      });
    } finally { db.close(); }
  }
  async function remember(password) {
    const key = await crypto.subtle.generateKey({name:'AES-GCM',length:256}, false, ['encrypt','decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv}, key, new TextEncoder().encode(password));
    await deviceStore('put', {key, iv, encrypted});
  }
  async function rememberedPassword() {
    const saved = await deviceStore('get');
    if (!saved) return '';
    return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:saved.iv}, saved.key, saved.encrypted));
  }
  async function api(action, body = null, extraHeaders = {}) {
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set('api', action);
    if (action === 'read') url.searchParams.set('id', id);
    const headers = {Accept:'application/json', ...extraHeaders};
    if (body) headers['Content-Type'] = 'application/json';
    if (editToken) headers['X-File-Token'] = editToken;
    if (leaseToken) headers['X-Lease-Token'] = leaseToken;
    const response = await fetch(url, {method:body ? 'POST' : 'GET', headers, body:body ? JSON.stringify({id,...body}) : undefined, cache:'no-store'});
    const data = await response.json();
    if (!response.ok || !data.ok) {
      const reason = serverErrorMessage(data.errorCode, response.status);
      if (['checkout','renew','save','checkin','restore'].includes(action) && [403,409,423].includes(response.status)) {
        loseLease(reason);
      }
      throw new Error(reason);
    }
    return data;
  }
  async function checkout() {
    try {
      if ($appState.dirty) throw new Error($translate('session.saveFirst'));
      // Refresh before acquiring the lease so an older read-only view cannot
      // silently overwrite a revision saved by another person.
      const current = await api('read');
      const decrypted = await decryptProject(current.envelope, activePassword);
      const project = requireProjectFile(decrypted.project);
      await verifyPortableHistory(project);
      editToken = decrypted.editToken;
      revision = current.revision;
      if (mailRetryRevision !== revision) mailRetryRevision = null;
      const result = await api('checkout', {expectedRevision:revision});
      leaseToken = result.leaseToken; leaseExpires = result.expiresAt;
      sessionStorage.setItem(deviceKey + ':lease', leaseToken);
      appState.importProject(project, {secure:true, readOnly:false, sameProjectRefresh:true});
      editing = true; appState.setReadOnly(false);
      sessionNotice('session.checkoutOk');
    } catch (e) {
      editing = false; appState.setReadOnly(true, e.message);
      sessionNotice('session.checkoutFailed', 'error', {reason:localizeDiagnostic(e.message)});
    }
  }
  async function unlock(password, establishSession = true) {
    const data = await api('read');
    const decrypted = await decryptProject(data.envelope, password);
    const project = requireProjectFile(decrypted.project);
    await verifyPortableHistory(project);
    editToken = decrypted.editToken; activePassword = password; revision = data.revision;
    if (establishSession) await api('login', {});
    appState.importProject(project, {secure:true, readOnly:true});
    authenticated = true; pass = ''; admin = ''; repeat = '';
    // Restore a lease belonging to this tab after a reload, without starting a
    // new checkout just because somebody signed in.
    const savedLease = sessionStorage.getItem(deviceKey + ':lease');
    if (savedLease) {
      leaseToken = savedLease;
      try { const renewed = await api('renew', {}); leaseExpires = renewed.expiresAt; editing = true; appState.setReadOnly(false); }
      catch { leaseToken = ''; leaseExpires = 0; sessionStorage.removeItem(deviceKey + ':lease'); }
    }
  }
  async function initializeSession() {
    try {
      initialized = (await api('config')).initialized;
      if (initialized && (await api('session')).authenticated) {
        const saved = await rememberedPassword();
        if (saved) await unlock(saved, false);
      }
    } catch (e) { error = localizeDiagnostic(e.message) || $translate('session.unreachable'); }
  }
  onMount(() => {
    void initializeSession();
    const timer = window.setInterval(checkLease, leaseCheckInterval);
    window.addEventListener('focus', checkLease);
    document.addEventListener('visibilitychange', checkLease);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', checkLease);
      document.removeEventListener('visibilitychange', checkLease);
    };
  });
  async function submit() {
    if (busy) return;
    busy = true; error = '';
    try {
      if (!initialized) {
        if (pass.length < 8) throw new Error($translate('session.passwordLength'));
        if (pass !== repeat) throw new Error($translate('session.passwordMismatch'));
        if (!admin) throw new Error($translate('session.adminRequired'));
        const token = randomSecret();
        const saved = await createPortableSave(emptyProject(), null);
        const envelope = await encryptProject(exportProject(saved, $appState.asOfDate), pass, token);
        const result = await api('create', {name:'Hausstandsliste', envelope, tokenHash:await hashSecret(token)}, {'X-Hausstand-Admin':admin});
        if (!confirmedSave(result)) throw new Error($translate('session.saveUnconfirmed'));
        reportConfirmedSave(result);
        initialized = true;
      }
      const chosen = pass;
      await unlock(chosen);
      notifications.dismissSource('login');
      notifications.notify($translate('toast.signedIn'), {kind:'success'});
      try { await remember(chosen); } catch { notifications.notify($translate('session.rememberFailed'), {kind:'warning'}); }
    } catch (e) {
      error = localizeDiagnostic(e.message) || $translate('session.loginFailed');
      notifications.dismissSource('login');
      notifications.notify($translate('session.loginFailed'), {kind:'error', source:'login'});
    }
    finally { busy = false; }
  }
  function reportMail(result) {
    const outcome = mailFeedback(result);
    notifications.dismissSource('mail');
    notifications.notify($translate(outcome.key), {kind:outcome.kind, duration:outcome.kind==='warning' ? 0 : 15000, source:'mail'});
    mailRetryRevision = outcome.retryable ? result.revision : null;
  }
  function reportConfirmedSave(result) {
    notifications.dismissSource('server-save');
    notifications.notify($translate('session.serverSaved'), {kind:'success', source:'server-save'});
    reportMail(result);
  }
  export async function retryMail() {
    if (busy || mailRetryRevision === null) return;
    busy = true;
    try {
      const result = await api('retryMail', {expectedRevision:mailRetryRevision});
      reportMail(result);
    } catch(e) {
      notifications.dismissSource('mail');
      notifications.notify($translate('mail.retryFailed', {reason:localizeDiagnostic(e.message)}), {kind:'error', source:'mail'});
    } finally { busy = false; }
  }
  export async function save() {
    if (busy) return;
    busy = true;
    notifications.dismissSource('server-session');
    let committedResult = null;
    try {
      if (!editing) { await checkout(); return; }
      saving = true;
      if ($appState.dirty) {
        const saved = await createPortableSave($appState.project, $appState.savedProject);
        const envelope = await encryptProject(exportProject(saved, $appState.asOfDate), activePassword, editToken);
        const result = await api('save', {expectedRevision:revision, envelope});
        if (!confirmedSave(result)) throw new Error($translate('session.saveUnconfirmed'));
        revision = result.revision; leaseExpires = result.expiresAt; appState.markSaved(saved);
        committedResult = result;
        notifications.dismissSource('server-save');
        notifications.notify($translate('session.serverSaved'), {kind:'success', source:'server-save'});
      }
      await api('checkin', {});
      leaseToken = ''; leaseExpires = 0; sessionStorage.removeItem(deviceKey + ':lease');
      editing = false; appState.setReadOnly(true);
      sessionNotice(committedResult ? 'session.finishOnly' : 'session.finishNoSave');
    } catch (e) {
      sessionNotice(committedResult ? 'session.finishFailed' : 'session.checkinFailed', 'error', {reason:localizeDiagnostic(e.message)});
    } finally {
      // Show the independent mail outcome after the check-in request settles,
      // even when release fails. Never send or retry mail from this path.
      if (committedResult) reportMail(committedResult);
      busy = false; saving = false;
    }
  }
  export async function downloadBackup() {
    if (busy) return;
    busy = true;
    try {
      const saved = await createPortableSave($appState.project, $appState.savedProject);
      const envelope = await encryptProject(exportProject(saved, $appState.asOfDate), activePassword, randomSecret());
      const url = URL.createObjectURL(new Blob([JSON.stringify(envelope)], {type:'application/json'}));
      const a = document.createElement('a'); a.href = url; a.download = 'hausstand-sicherung.enc.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      sessionNotice('session.backupOk');
    } catch (e) { sessionNotice('session.backupFailed', 'error', {reason:localizeDiagnostic(e.message)}); } finally { busy = false; }
  }
  export async function restoreBackup(event) {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (!file || busy) return;
    if (!confirm($translate('session.restoreConfirm'))) return;
    const backupPassword = prompt($translate('session.backupPassword'));
    if (!backupPassword) return;
    busy = true;
    try {
      if (!editing) throw new Error($translate('session.restoreReadOnly'));
      const decrypted = await decryptProject(JSON.parse(await file.text()), backupPassword);
      const project = requireProjectFile(decrypted.project); await verifyPortableHistory(project);
      const saved = await createPortableSave(project, $appState.savedProject);
      const envelope = await encryptProject(exportProject(saved, $appState.asOfDate), activePassword, editToken);
      const result = await api('save', {expectedRevision:revision, envelope});
      if (!confirmedSave(result)) throw new Error($translate('session.saveUnconfirmed'));
      revision = result.revision; leaseExpires = result.expiresAt; appState.importProject(saved, {secure:true, readOnly:false});
      reportConfirmedSave(result);
    } catch(e) { sessionNotice('session.restoreFailed', 'error', {reason:localizeDiagnostic(e.message)}); }
    finally { busy = false; }
  }
  export async function logout() {
    if (busy || ($appState.dirty && !confirm($translate('session.logoutConfirm')))) return;
    busy = true;
    try {
      if (leaseToken) await api('checkin', {});
      await api('logout', {});
      await deviceStore('delete'); sessionStorage.removeItem(deviceKey + ':lease');
      leaseToken = ''; leaseExpires = 0; editToken = ''; activePassword = ''; editing = false; authenticated = false;
      mailRetryRevision = null; notifications.dismissSource('mail');
    } catch(e) { sessionNotice('session.logoutFailed', 'error', {reason:localizeDiagnostic(e.message)}); }
    finally { busy = false; }
  }
</script>

{#if !authenticated}
  <main class="server-login">
    <form class="login-card" on:submit|preventDefault={submit}>
      <span class="login-mark" aria-hidden="true">H</span>
      <h1>Hausstandsliste</h1>
      {#if initialized === null}
        {#if error}<p class="login-error" role="alert">{error}</p><button type="button" on:click={() => location.reload()}>{$translate('session.retry')}</button>{:else}<p>{$translate('session.connecting')}</p>{/if}
      {:else}
        <h2>{initialized ? $translate('session.signIn') : $translate('session.setup')}</h2>
        <p>{initialized ? $translate('session.signInHint') : $translate('session.setupHint')}</p>
        {#if !initialized}<label>{$translate('session.admin')}<input type="password" autocomplete="off" bind:value={admin} required /></label>{/if}
        <label>{$translate('session.password')}<input type="password" autocomplete={initialized ? 'current-password' : 'new-password'} bind:value={pass} required minlength="8" /></label>
        {#if !initialized}<label>{$translate('session.repeat')}<input type="password" autocomplete="new-password" bind:value={repeat} required minlength="8" /></label>{/if}
        {#if error}<p class="login-error" role="alert">{error}</p>{/if}
        <button type="submit" disabled={busy}>{busy ? $translate('session.wait') : initialized ? $translate('session.signIn') : $translate('session.setupSubmit')}</button>
        <small>{$translate('session.rememberHint')}</small>
      {/if}
    </form>
  </main>
{/if}

<style>
  .server-login{min-height:100vh;display:grid;place-items:center;padding:24px;background:#f4f6f4;color:#23372d;font-family:system-ui,sans-serif}
  .login-card{width:min(100%,420px);display:grid;gap:16px;background:white;padding:32px;border:1px solid #dce5df;border-radius:18px;box-shadow:0 12px 40px #193d2614}
  .login-card h1,.login-card h2,.login-card p{margin:0}.login-card h1{font-size:1.35rem}.login-card h2{font-size:1.15rem}.login-card p,.login-card small{color:#56675d;line-height:1.45}.login-mark{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;background:#174b37;color:white;font-weight:700}
  .login-card label{display:grid;gap:7px;font-weight:600}.login-card input{font:inherit;padding:12px;border:1px solid #9cab9f;border-radius:8px;min-width:0}.login-card button{font:inherit;font-weight:700;padding:13px;border:0;border-radius:8px;color:white;background:#174b37;cursor:pointer}.login-card button:disabled{opacity:.6}.login-card .login-error{color:#a22}
</style>
