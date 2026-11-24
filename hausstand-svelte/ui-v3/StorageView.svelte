<script>
  import { translate, getLocale } from '../src/lib/i18n.js';
  import { onMount } from 'svelte';
  import HelpTip from '../src/components/HelpTip.svelte';
  // Explizite Build-Kapazität: HTML-Builds besitzen keine Serverablage.
  const SERVER_MODE = import.meta.env.VITE_HAUSSTAND_SERVER_MODE === 'true';
  import { appState } from '../src/stores/projectStore.js';
  import { exportProject, downloadProject } from '../src/lib/persistence.js';
  import { requireProjectFile } from '../src/lib/domain.js';
  import { createPortableSave, readPortableVersion } from '../src/lib/versionHistory.js';
  import { encryptProject, decryptProject, hashSecret, randomSecret } from '../src/lib/crypto.js';

  export let onProjectLoaded = () => {};
  let showProtected = false, busy = false, error = '', message = '';
  let password = '', remotePassword = '', openPassword = '', newPassword = '';
  let backupName = '', remoteDraftName = '', openedName = '', pendingEncrypted = null, pendingFileName = '';
  let serverCanCreate = false, serverReady = false;
  let files = [], selectedPortableVersion = '';
  $: portableVersions = Array.isArray($appState.project.versionHistory?.entries)
    ? [...$appState.project.versionHistory.entries].reverse() : [];
  let openedId = '', revision = 0, editToken = '', leaseToken = '', leaseExpires = 0;
  let activePassword = '';
  export let onlineEditing = false;
  export let onlineProjectOpen = false;
  $: onlineEditing = !!(openedId && leaseToken);
  $: onlineProjectOpen = !!openedId;

  onMount(() => {
    if (!SERVER_MODE) return;
    // Gleiche PHP-Datei = Oberfläche und API. Keine URL vom Benutzer nötig.
    run(async () => {
      const config = await api('config');
      serverCanCreate = config.canCreate === true;
      serverReady = true;
      await refreshFiles();
    });
  });
  const report = e => { error = e?.message || String(e); message = ''; };
  async function run(job) {
    if (busy) return;
    busy = true; error = ''; message = '';
    try { await job(); } catch (e) { report(e); }
    finally { busy = false; }
  }
  function download(payload, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function ensureNoOverwrite() {
    return !$appState.dirty || confirm($translate('storage.replaceWorkingCopy'));
  }
  function requireLeaseReleased() {
    if (openedId && leaseToken) throw new Error($translate('storage.endEditingFirst'));
  }
  function clearOnlineLink() {
    openedId = ''; openedName = ''; revision = 0;
    leaseToken = ''; leaseExpires = 0; editToken = '';
    activePassword = ''; remotePassword = ''; selectedPortableVersion = ''; backupName = '';
  }
  export function prepareToReplace() {
    try { requireLeaseReleased(); clearOnlineLink(); return true; }
    catch (e) { alert(e.message); return false; }
  }
  async function exportPlain() {
    if ($appState.secure || openedId) throw new Error($translate('storage.plainExportUnavailable'));
    const saved = await createPortableSave($appState.project, $appState.savedProject);
    downloadProject(saved, $appState.asOfDate);
    appState.markSaved(saved);
    message = $translate('storage.plainDownloaded');
  }
  function apiEndpoint(action, params = {}) {
    if (!SERVER_MODE) throw new Error($translate("ui.the-offline-version-has-no-server--16chyt0"));
    const endpoint = new URL(location.pathname, location.origin);
    if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname))
      throw new Error($translate("ui.the-server-version-must-be-opened--1m44upg"));
    if (!endpoint.pathname.endsWith('.php')) throw new Error($translate("ui.the-server-version-must-be-opened--15di5sz"));
    endpoint.searchParams.set('api', action);
    for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, value);
    return endpoint.toString();
  }
  async function api(action, body = null, params = {}, authorized = false) {
    const headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (authorized) {
      if (!editToken) throw new Error($translate("ui.open-the-project-with-its-file-pas-16w4vw1"));
      headers['X-File-Token'] = editToken;
    }
    if (leaseToken) headers['X-Lease-Token'] = leaseToken;
    const response = await fetch(apiEndpoint(action, params), {
      method: body ? 'POST' : 'GET', headers,
      body: body ? JSON.stringify(body) : undefined, cache: 'no-store'
    });
    let data;
    try { data = await response.json(); } catch { throw new Error($translate("ui.the-server-returned-invalid-json-n82jl")); }
    if (!response.ok || data.ok === false) {
      if ([409, 423].includes(response.status)) appState.setReadOnly(true);
      throw new Error((data.error || 'Serverfehler') + ' (HTTP ' + response.status + ')');
    }
    return data;
  }
  async function exportEncrypted() {
    if (!password) throw new Error($translate("ui.enter-a-passphrase-1tygzij"));
    // Always create a detached encrypted copy, not a new credential for
    // the active working copy or a disclosure of the online edit capability.
    const token = randomSecret();
    const saved = await createPortableSave($appState.project, $appState.savedProject);
    const envelope = await encryptProject(exportProject(saved, $appState.asOfDate), password, token);
    download(envelope, (backupName.trim() || $appState.project.community?.name || 'hausstand') + '.hausstand.enc.json');
    // A local export counts as an explicit backup. It must not silently
    // switch a plaintext browser working copy to protected mode (or vice versa).
    if (!openedId) appState.markSaved(saved);
    // An online project is not saved on the server by downloading a backup.
    message = $translate(openedId ? 'storage.backupNotOnlineSave' : 'storage.encryptedDownloaded');
  }
  async function openLocalFile(event) {
    const input = event.currentTarget, file = input.files?.[0];
    if (!file) return;
    try {
      requireLeaseReleased();
      const data = JSON.parse(await file.text());
      if (data?.format?.startsWith('hausstand-aesgcm')) {
        pendingEncrypted = data; pendingFileName = file.name; openPassword = '';
        error = ''; message = $translate('storage.encryptedPasswordNeeded'); return;
      }
      const verified = requireProjectFile(data);
      if (!ensureNoOverwrite()) return;
      clearOnlineLink(); pendingEncrypted = null; pendingFileName = ''; openPassword = '';
      appState.importProject(verified);
      error = ''; message = $translate('storage.importedWorkingCopy');
      onProjectLoaded();
    } catch (e) {
      report(new Error($translate('storage.importFailed') + ': ' + (e?.message || String(e))));
    }
    finally { input.value = ''; }
  }
  async function finishEncryptedImport() {
    if (!pendingEncrypted) return;
    if (!openPassword) throw new Error($translate('storage.encryptedPasswordNeeded'));
    requireLeaseReleased();
    const { project, editToken: token } = await decryptProject(pendingEncrypted, openPassword);
    const verified = requireProjectFile(project);
    if (!ensureNoOverwrite()) return;
    clearOnlineLink();
    appState.importProject(verified, { secure: true });
    editToken = token; activePassword = openPassword;
    pendingEncrypted = null; pendingFileName = ''; openPassword = '';
    error = ''; message = $translate('storage.importedProtectedCopy');
    onProjectLoaded();
  }
  function cancelEncryptedImport() {
    pendingEncrypted = null; pendingFileName = ''; openPassword = ''; message = '';
  }
  async function refreshFiles() {
    files = (await api('files')).files || [];
    // Refresh does not overwrite user feedback.
  }
  async function openRemote(file) {
    requireLeaseReleased();
    if (!remotePassword) throw new Error($translate("ui.enter-the-file-password-pv05g4"));
    if (!ensureNoOverwrite()) return;
    const result = await api('read', null, { id: file.id });
    const decrypted = await decryptProject(result.envelope, remotePassword);
    const verified = requireProjectFile(decrypted.project);
    editToken = decrypted.editToken; activePassword = remotePassword;
    openedId = file.id; openedName = file.name; revision = result.revision; backupName = '';
    leaseToken = ''; leaseExpires = 0; selectedPortableVersion = '';
    pendingEncrypted = null; remotePassword = '';
    appState.importProject(verified, { secure: true, readOnly: true });
    message = $translate("ui.opened-read-only-check-out-to-edit-3jcsh9");
  }
  async function createRemote() {
    requireLeaseReleased();
    if (!remoteDraftName.trim()) throw new Error($translate("ui.a-filename-is-required-14d9i2"));
    if (!serverCanCreate) throw new Error($translate("ui.creating-projects-is-disabled-on-t-1eru9h5"));
    if (!remotePassword || remotePassword.length < 8) throw new Error($translate("ui.enter-a-project-password-of-at-lea-1r6gpqg"));
    if (!ensureNoOverwrite()) return;
    const id = crypto.randomUUID(), token = randomSecret();
    const saved = await createPortableSave($appState.project, $appState.savedProject);
    const envelope = await encryptProject(exportProject(saved, $appState.asOfDate), remotePassword, token);
    const result = await api('create', {
      id, name: remoteDraftName.trim(), envelope, tokenHash: await hashSecret(token)
    });
    openedId = id; openedName = remoteDraftName.trim(); editToken = token; revision = result.revision; backupName = '';
    activePassword = remotePassword; remotePassword = ''; leaseToken = ''; leaseExpires = 0;
    appState.importProject(saved, { secure: true, readOnly: true });
    await refreshFiles();
    message = $translate("ui.new-encrypted-file-created-check-o-7hax1o");
  }
  async function checkout() {
    if (!openedId) throw new Error($translate("ui.no-file-selected-k8inyf"));
    const result = await api('checkout', { id: openedId, expectedRevision: revision }, {}, true);
    leaseToken = result.leaseToken; leaseExpires = result.expiresAt;
    appState.setReadOnly(false);
    message = $translate('storage.editingUntil', { date: new Date(leaseExpires * 1000).toLocaleString(getLocale() === 'de' ? 'de-DE' : 'en-GB') });
  }
  async function renew() {
    const result = await api('renew', { id: openedId }, {}, true);
    leaseExpires = result.expiresAt; message = $translate("ui.edit-lease-extended-by-two-hours-fmaa4v");
  }
  async function commitProject(project, passphrase, token, rotate = false) {
    if (!openedId || !leaseToken) throw new Error($translate("ui.check-out-the-file-first-vyu7fx"));
    const saved = await createPortableSave(project, $appState.savedProject);
    const envelope = await encryptProject(exportProject(saved, $appState.asOfDate), passphrase, token);
    const payload = { id: openedId, expectedRevision: revision, envelope };
    if (rotate) payload.newTokenHash = await hashSecret(token);
    const result = await api('save', payload, {}, true);
    revision = result.revision; leaseExpires = result.expiresAt;
    if (rotate) editToken = token;
    appState.markSaved(saved);
    return result;
  }
  async function saveRemote() {
    if (!$appState.dirty) { message = $translate("ui.no-unsaved-changes-s17ea6"); return; }
    const result = await commitProject($appState.project, activePassword, editToken);
    message = $translate('storage.onlineSaved', { revision });
  }
  async function checkin() {
    if ($appState.dirty && !confirm($translate("ui.there-are-unsaved-changes-check-in-12iq14o"))) return;
    await api('checkin', { id: openedId }, {}, true);
    leaseToken = ''; leaseExpires = 0; appState.setReadOnly(true);
    message = $translate("ui.checked-in-the-edit-lease-has-been-1ts6shy");
  }
  export async function saveFromHeader() {
    if (busy) return { handled: true, ok: false, message: $translate('storage.busy') };
    // Never confuse a read-only online project with a local backup.
    if (openedId && !leaseToken) return { handled: false };
    if (!openedId && $appState.secure && !activePassword) return { handled: false };
    busy = true; error = ''; message = '';
    try {
      if (openedId) await saveRemote();
      else if ($appState.secure) {
        const saved = await createPortableSave($appState.project, $appState.savedProject);
        const envelope = await encryptProject(exportProject(saved, $appState.asOfDate), activePassword, editToken);
        download(envelope, ($appState.project.community?.name || 'hausstand') + '.hausstand.enc.json');
        appState.markSaved(saved);
        message = $translate('storage.encryptedDownloaded');
      } else await exportPlain();
      return { handled: true, ok: true, message };
    } catch (e) { report(e); return { handled: true, ok: false, message: error }; }
    finally { busy = false; }
  }
  async function savePrimary() {
    if (openedId && !leaseToken) { await run(checkout); return; }
    if ($appState.secure && !activePassword && !openedId) {
      showProtected = true; message = $translate('storage.protectedSessionUnavailable'); return;
    }
    await saveFromHeader();
  }
  async function restorePortable() {
    if ($appState.readOnly) throw new Error($translate("ui.enable-editing-before-restoring-1xm00bb"));
    if (!selectedPortableVersion) throw new Error($translate("ui.select-a-saved-version-kmh00f"));
    if (!confirm($translate("ui.open-this-version-as-an-unsaved-wo-1q3leot"))) return;
    const restored = await readPortableVersion($appState.project, selectedPortableVersion);
    appState.restoreVersion(restored);
    message = $translate("ui.previous-state-loaded-it-becomes-a-mzgam7");
  }
  async function changePassword() {
    if (!leaseToken) throw new Error($translate("ui.check-out-before-changing-the-pass-n2lncy"));
    if (!newPassword || newPassword.length < 8) throw new Error($translate("ui.choose-a-new-password-of-at-least--l9l2yc"));
    if (!confirm($translate("ui.re-encrypt-the-entire-project-file-13awrak"))) return;
    const newToken = randomSecret();
    await commitProject($appState.project, newPassword, newToken, true);
    activePassword = newPassword; password = newPassword; newPassword = '';
    message = $translate("ui.password-changed-the-full-version--1yx5s3b");
  }
</script>

<div class="storage-flow">
  {#if busy}<p class="storage-feedback muted" role="status">{$translate("ui.working-1tl7cca")}</p>{/if}
  {#if error}<p role="alert" class="storage-feedback inline-info warning">{error}</p>{/if}
  {#if message}<p role="status" class="storage-feedback inline-info">{message}</p>{/if}
  <section class="storage-context" aria-label={$translate('storage.current')}>
    <div><strong>{$appState.project.community?.name || $translate('app.household')}</strong><span>{$translate(openedId ? 'storage.online' : 'storage.local')}</span></div>
    <p>{$translate(openedId ? ($appState.dirty ? 'storage.dirtyOnline' : 'storage.cleanOnline') : ($appState.dirty ? 'storage.dirtyLocal' : 'storage.cleanLocal'))}</p>
  </section>
  <section class="ux-panel storage-main">
    <h2>{$translate('storage.save')}</h2>
    <p class="storage-explanation">{$translate(openedId ? 'storage.onlineSaveExplanation' : ($appState.secure ? 'storage.secureSaveExplanation' : 'storage.localSaveExplanation'))}</p>
    {#if !openedId && !$appState.secure}
      <p class="inline-info warning storage-plain-warning">{$translate('storage.plainWarning')}</p>
    {/if}
    <button type="button" class="solid-action storage-primary" disabled={busy} on:click={savePrimary}>
      {$translate(openedId ? (leaseToken ? 'storage.primaryOnline' : 'storage.startEditing') : 'storage.primaryDownload')}
    </button>
    <details class="storage-secondary" bind:open={showProtected}>
      <summary>{$translate('storage.protectCopy')}</summary>
      <p class="muted">{$translate('storage.protectCopyExplanation')}</p>
      <div class="storage-form">
        <div class="form-grid">
          <label>{$translate("ui.password-for-this-file-119cdf1")}<input type="password" autocomplete="new-password" bind:value={password} placeholder={$translate("ui.long-secure-password-iwutru")}/></label>
          <label>{$translate("ui.backup-name-11t2ioh")}<input bind:value={backupName} placeholder={$appState.project.community?.name || $translate("app.household")}/></label>
        </div>
        <button type="button" disabled={busy || !password} on:click={() => run(exportEncrypted)}>{$translate("ui.download-encrypted-file-1m533vw")}</button>
        {#if openedId}<p class="muted">{$translate('storage.backupNotOnlineSave')}</p>{/if}
      </div>
    </details>
  </section>
  <section class="ux-panel storage-open">
    <h2>{$translate('storage.open')}</h2>
    <p class="storage-explanation">{$translate('storage.openExplanation')}</p>
    <div class="save-basic-actions">
      <label class="file-button">{$translate('storage.pickFile')}<input type="file" accept="application/json,.json" on:change={openLocalFile} disabled={busy}/></label>
    </div>
    {#if pendingEncrypted}
      <div class="storage-form storage-unlock" role="group" aria-label={$translate('storage.unlockFile')}>
        <p>{$translate('storage.encryptedPasswordNeeded')} <strong>{pendingFileName}</strong></p>
        <label>{$translate('storage.filePassword')}<input type="password" autocomplete="off" bind:value={openPassword} on:keydown={e => { if (e.key === 'Enter') { e.preventDefault(); run(finishEncryptedImport); } }}/></label>
        <div class="storage-action-row">
          <button type="button" class="solid-action" disabled={busy || !openPassword} on:click={() => run(finishEncryptedImport)}>{$translate('storage.unlockFile')}</button>
          <button type="button" disabled={busy} on:click={cancelEncryptedImport}>{$translate('ui.cancel-cl4zc9')}</button>
        </div>
      </div>
    {/if}
  </section>
  {#if SERVER_MODE}
    <section class="ux-panel storage-online">
      <div class="storage-heading"><h2>{$translate('storage.collaborate')}</h2><HelpTip label={$translate("ui.how-do-online-projects-work-25z9zy")}>{$translate("ui.open-and-edit-shared-project-files-fzled")}</HelpTip></div>
      <p class="storage-explanation">{$translate('storage.onlineExplanation')}</p>
      {#if openedId}
        <div class="storage-online-current">
          <strong>{openedName}</strong><span>{$translate(leaseToken ? 'storage.editingOnline' : 'storage.readingOnline')}</span>
          <small>{$translate('storage.revision', { revision })}</small>
          <div class="storage-action-row">
            {#if leaseToken}
              <button type="button" disabled={busy} on:click={() => run(checkin)}>{$translate("ui.stop-editing-14s9xpw")}</button>
              <button type="button" disabled={busy} on:click={() => run(renew)}>{$translate("ui.extend-editing-time-ieh1xj")}</button>
            {/if}
          </div>
        </div>
      {/if}
      <div class="storage-online-list">
        <div class="storage-heading"><h3>{$translate("ui.available-projects-1cnj4sr")}</h3><button type="button" class="outline-action" disabled={busy} on:click={() => run(refreshFiles)}>{$translate('storage.refresh')}</button></div>
        {#if files.length}
          {#if !openedId || !leaseToken}
            <label>{$translate('storage.onlinePassword')}<input type="password" autocomplete="off" bind:value={remotePassword}/></label>
          {/if}
          <div class="shared-files">
            {#each files as f (f.id)}
              <div class="shared-file"><div><strong>{f.name}</strong><small>{$translate('storage.fileVersion', {revision:f.revision,date:f.updatedAt})}</small></div>
                <button type="button" class="outline-action" disabled={busy || !!leaseToken} on:click={() => run(() => openRemote(f))}>{$translate("ui.open-14klu42")}</button></div>
            {/each}
          </div>
        {:else if serverReady}<p class="muted">{$translate('storage.noProjects')}</p>{/if}
      </div>
      {#if serverCanCreate}
        <details class="storage-secondary">
          <summary>{$translate('storage.createOnline')}</summary>
          <div class="storage-form stack">
            <label>{$translate('storage.newOnlineName')}<input bind:value={remoteDraftName}/></label>
            <label>{$translate('storage.onlinePassword')}<input type="password" autocomplete="new-password" bind:value={remotePassword}/></label>
            <button type="button" disabled={busy || !!leaseToken || !serverReady} on:click={() => run(createRemote)}>{$translate('storage.createOnline')}</button>
          </div>
        </details>
      {/if}
      {#if openedId && leaseToken}
        <details class="storage-secondary">
          <summary>{$translate('storage.securityOptions')}</summary>
          <div class="storage-form stack">
            <label>{$translate("ui.new-password-for-the-shared-file-1h62si2")}<input type="password" autocomplete="new-password" bind:value={newPassword}/></label>
            <button type="button" disabled={busy} on:click={() => run(changePassword)}>{$translate("ui.change-file-password-1btazly")}</button>
          </div>
        </details>
      {/if}
    </section>
  {/if}
  {#if portableVersions.length}
    <details class="ux-panel storage-versions" aria-label={$translate("ui.saved-file-versions-9wc9wn")}>
      <summary>{$translate('storage.earlierVersions')}</summary>
      <p class="muted">{$translate('storage.restoreExplanation')}</p>
      <div class="storage-form stack">
        <label>{$translate("ui.select-a-previous-saved-state-1mfrevx")}
          <select bind:value={selectedPortableVersion}>
            <option value="">{$translate("ui.please-select-1qm0osl")}</option>
            {#each portableVersions as v (v.id)}
              <option value={v.id}>{v.savedAt ? new Date(v.savedAt).toLocaleString(getLocale() === 'de' ? 'de-DE' : 'en-GB') : $translate("ui.previous-version-date-unknown-1cpadmd")}</option>
            {/each}
          </select>
        </label>
        <button type="button" disabled={busy || $appState.readOnly || !selectedPortableVersion} on:click={() => run(restorePortable)}>{$translate("ui.restore-as-unsaved-working-copy-r3yheu")}</button>
      </div>
    </details>
  {/if}
</div>
<style>
  .storage-flow { display:grid;gap:14px;max-width:840px; }
  .storage-flow .ux-panel { padding:20px; }
  .storage-flow h2 { margin:0 0 6px;font-size:1.12rem; }
  .storage-explanation { margin:0 0 16px;color:var(--muted);font-size:.9rem;line-height:1.5; }
  .storage-context { display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:7px 22px;padding:11px 16px;border:1px solid var(--border);border-radius:13px;background:var(--soft); }
  .storage-context div { display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px; }
  .storage-context span,.storage-context p { color:var(--muted);font-size:.84rem; }
  .storage-context p { margin:0; }
  .storage-plain-warning { margin:0 0 12px;font-size:.84rem; }
  .storage-primary { min-height:44px; }
  .storage-secondary { margin-top:18px;padding-top:12px;border-top:1px solid var(--border); }
  .storage-secondary > summary,.storage-versions > summary { cursor:pointer;font-weight:600;min-height:38px; }
  .storage-secondary > summary:focus-visible,.storage-versions > summary:focus-visible { outline:2px solid var(--accent);outline-offset:3px; }
  .storage-form { display:grid;gap:12px;margin-top:12px; }
  .storage-form .form-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px; }
  .storage-form label,.storage-form input { min-width:0;width:100%; }
  .storage-unlock { padding:14px;background:var(--soft);border-radius:12px; }
  .storage-unlock p { margin:0; }
  .storage-online-current { display:grid;gap:6px;border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:20px; }
  .storage-online-current span,.storage-online-current small { color:var(--muted); }
  .storage-heading { display:flex;justify-content:space-between;align-items:center;gap:8px; }
  .storage-heading h2,.storage-heading h3 { margin:0; }
  .storage-online-list { display:grid;gap:12px; }
  .storage-online-list .storage-heading h3 { font-size:1rem; }
  .storage-online-list .shared-files { display:grid;gap:8px; }
  .storage-online-list .shared-file { display:flex;justify-content:space-between;align-items:center;gap:12px; }
  .storage-online-list .shared-file small { display:block;color:var(--muted); }
  .storage-feedback { margin:0; }
  @media(max-width:540px) {
    .storage-flow .ux-panel { padding:16px; }
    .storage-form .form-grid { grid-template-columns:1fr; }
    .storage-primary { width:100%; }
  }
</style>
