<script>
  import { translate, getLocale } from '../src/lib/i18n.js';
  import { onMount } from 'svelte';
  import HelpTip from '../src/components/HelpTip.svelte';
  // Explizite Build-Kapazität: HTML-Builds besitzen keine Serverablage.
  const SERVER_MODE = import.meta.env.VITE_HAUSSTAND_SERVER_MODE === 'true';
  import { appState } from '../src/stores/projectStore.js';
  import { exportProject } from '../src/lib/persistence.js';
  import { requireProjectFile } from '../src/lib/domain.js';
  import { createPortableSave, readPortableVersion } from '../src/lib/versionHistory.js';
  import { encryptProject, decryptProject, hashSecret, randomSecret } from '../src/lib/crypto.js';

  let showProtected = false, showShared = false, busy = false, error = '', message = '';
  let password = '', newPassword = '', fileName = '';
  let serverCanCreate = false, serverReady = false;
  let files = [], selectedPortableVersion = '';
  $: portableVersions = Array.isArray($appState.project.versionHistory?.entries)
    ? [...$appState.project.versionHistory.entries].reverse() : [];
  let openedId = '', revision = 0, editToken = '', leaseToken = '', leaseExpires = 0;
  let activePassword = '';

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
    return !$appState.dirty || confirm($translate("ui.there-are-unsaved-changes-export-a-19yj4yk"));
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
    const token = editToken || randomSecret();
    const saved = await createPortableSave($appState.project, $appState.savedProject);
    const envelope = await encryptProject(exportProject(saved, $appState.asOfDate), password, token);
    download(envelope, (fileName.trim() || 'hausstand') + '.hausstand.enc.json');
    if (!openedId) {
      editToken = token;
      activePassword = password;
      if ($appState.secure) appState.markSaved(saved); // Keep session Undo across saves.
      else appState.importProject(saved, fileName || 'Verschlüsselt', true);
    }
    // An online project is not saved on the server by downloading a backup.
    message = openedId ? 'Verschlüsselte Sicherung heruntergeladen; Online-Änderungen noch nicht gespeichert.' : 'Verschlüsselte Projektdatei heruntergeladen.';
  }
  async function importEncrypted(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (!ensureNoOverwrite()) return;
      if (!password) throw new Error($translate("ui.enter-the-password-before-opening-knmdd9"));
      const { project, editToken: token } = await decryptProject(JSON.parse(await file.text()), password);
      appState.importProject(requireProjectFile(project), file.name, true);
      editToken = token; activePassword = password; fileName = file.name;
      openedId = ''; leaseToken = ''; revision = 0; selectedPortableVersion = '';
      message = $translate("ui.encrypted-local-file-opened-1hrvhww"); error = '';
    } catch (e) { report(e); }
    finally { input.value = ''; }
  }
  async function refreshFiles() {
    files = (await api('files')).files || [];
    message = files.length + ' Datei(en) in der Online-Ablage.';
  }
  async function openRemote(file) {
    if (!ensureNoOverwrite()) return;
    if (!password) throw new Error($translate("ui.enter-the-file-password-pv05g4"));
    const result = await api('read', null, { id: file.id });
    const decrypted = await decryptProject(result.envelope, password);
    editToken = decrypted.editToken; activePassword = password;
    openedId = file.id; fileName = file.name; revision = result.revision;
    leaseToken = ''; leaseExpires = 0; selectedPortableVersion = '';
    appState.importProject(requireProjectFile(decrypted.project), file.name, true, true);
    message = $translate("ui.opened-read-only-check-out-to-edit-3jcsh9");
  }
  async function createRemote() {
    if (!fileName.trim()) throw new Error($translate("ui.a-filename-is-required-14d9i2"));
    if (!serverCanCreate) throw new Error($translate("ui.creating-projects-is-disabled-on-t-1eru9h5"));
    if (!password || password.length < 8) throw new Error($translate("ui.enter-a-project-password-of-at-lea-1r6gpqg"));
    if (!ensureNoOverwrite()) return;
    const id = crypto.randomUUID(), token = randomSecret();
    const saved = await createPortableSave($appState.project, $appState.savedProject);
    const envelope = await encryptProject(exportProject(saved, $appState.asOfDate), password, token);
    const result = await api('create', {
      id, name: fileName.trim(), envelope, tokenHash: await hashSecret(token)
    });
    openedId = id; editToken = token; revision = result.revision;
    activePassword = password; leaseToken = ''; leaseExpires = 0;
    appState.importProject(saved, fileName.trim(), true, true);
    await refreshFiles();
    message = $translate("ui.new-encrypted-file-created-check-o-7hax1o");
  }
  async function checkout() {
    if (!openedId) throw new Error($translate("ui.no-file-selected-k8inyf"));
    const result = await api('checkout', { id: openedId, expectedRevision: revision }, {}, true);
    leaseToken = result.leaseToken; leaseExpires = result.expiresAt;
    appState.setReadOnly(false);
    message = 'Ausgecheckt bis ' + new Date(leaseExpires * 1000).toLocaleString(getLocale() === 'de' ? 'de-DE' : 'en-GB') + '.';
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
    message = 'Revision ' + revision + ' gespeichert. Mailstatus: ' + result.mailStatus + '.';
  }
  async function checkin() {
    if ($appState.dirty && !confirm($translate("ui.there-are-unsaved-changes-check-in-12iq14o"))) return;
    await api('checkin', { id: openedId }, {}, true);
    leaseToken = ''; leaseExpires = 0; appState.setReadOnly(true);
    message = $translate("ui.checked-in-the-edit-lease-has-been-1ts6shy");
  }
  export async function saveFromHeader() {
    if (busy) return { handled: true, ok: false, message: 'Ein Speichervorgang läuft bereits.' };
    if (!openedId && (!$appState.secure || !activePassword)) return { handled: false };
    if (openedId && !leaseToken) return { handled: false };
    busy = true; error = ''; message = '';
    try {
      if (!openedId) {
        // A decrypted local file has an in-memory password from this session.
        // Re-export with that password; never convert it to a plaintext download.
        const saved = await createPortableSave($appState.project, $appState.savedProject);
        const envelope = await encryptProject(exportProject(saved, $appState.asOfDate), activePassword, editToken);
        download(envelope, (fileName.trim() || 'hausstand') + '.hausstand.enc.json');
        appState.markSaved(saved);
        message = $translate("ui.encrypted-download-started-keep-th-9p9noq");
        return { handled: true, ok: true, message };
      }
      await saveRemote();
      return { handled: true, ok: true, message };
    } catch (e) {
      report(e);
      return { handled: true, ok: false, message: error };
    } finally { busy = false; }
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
<div class="storage-choices">
  {#if busy}<p class="storage-feedback muted" role="status">{$translate("ui.working-1tl7cca")}</p>{/if}
  {#if error}<p role="alert" class="storage-feedback inline-info warning">{error}</p>{/if}
  {#if message}<p role="status" class="storage-feedback inline-info">{message}</p>{/if}
  <section class="ux-panel storage-choice">
    <div class="storage-choice-top"><div class="storage-help-heading"><h2>{$translate("ui.password-protected-backup-15wmsu8")}</h2><HelpTip label={$translate("ui.how-does-an-encrypted-backup-work-1boievp")}>{$translate("ui.you-can-create-or-open-an-encrypte-1npbaaq")}</HelpTip></div></div>
    <button class="outline-action" aria-expanded={showProtected} on:click={() => showProtected = !showProtected}>{showProtected ? $translate("ui.show-less-fnh5rv") : $translate("ui.manage-password-protected-files-1syzh81")} <span aria-hidden="true">{showProtected ? '↑' : '↓'}</span></button>
    {#if showProtected}
      <div class="storage-form">
        <div class="form-grid">
          <label>{$translate("ui.password-for-this-file-119cdf1")}<input type="password" autocomplete="off" bind:value={password} placeholder={$translate("ui.long-secure-password-iwutru")}/></label>
          <label>{$translate("ui.backup-name-11t2ioh")}<input bind:value={fileName} placeholder={$translate("app.household")}/></label>
        </div>
        <div class="storage-action-row">
          <button class="solid-action" disabled={busy} on:click={() => run(exportEncrypted)}>{$translate("ui.download-encrypted-file-1m533vw")}</button>
          <label class="file-button">{$translate("ui.open-encrypted-file-wuiwbq")}<input type="file" accept=".json,.enc" on:change={importEncrypted}/></label>
        </div>

      </div>
    {/if}
  </section>
  {#if portableVersions.length}
    <section class="ux-panel storage-choice" aria-label={$translate("ui.saved-file-versions-9wc9wn")}>
      <h2>{$translate("ui.saved-versions-magvuo")}</h2>
      <div class="stack">
        <label>{$translate("ui.select-a-previous-saved-state-1mfrevx")}
          <select bind:value={selectedPortableVersion}>
            <option value="">{$translate("ui.please-select-1qm0osl")}</option>
            {#each portableVersions as v (v.id)}
              <option value={v.id}>{v.savedAt ? new Date(v.savedAt).toLocaleString('de-DE') : $translate("ui.previous-version-date-unknown-1cpadmd")}</option>
            {/each}
          </select>
        </label>
        <button disabled={busy || $appState.readOnly || !selectedPortableVersion} on:click={() => run(restorePortable)}>{$translate("ui.restore-as-unsaved-working-copy-r3yheu")}</button>
      </div>
    </section>
  {/if}
  {#if SERVER_MODE}
  <section class="ux-panel storage-choice">
    <div class="storage-choice-top"><div class="storage-help-heading"><h2>{$translate("ui.online-projects-133womh")}</h2><HelpTip label={$translate("ui.how-do-online-projects-work-25z9zy")}>{$translate("ui.open-and-edit-shared-project-files-fzled")}</HelpTip></div></div>
    <button class="outline-action" aria-expanded={showShared} on:click={() => showShared = !showShared}>{showShared ? $translate("ui.show-less-fnh5rv") : $translate("ui.show-online-projects-s0fco2")} <span aria-hidden="true">{showShared ? '↑' : '↓'}</span></button>
    {#if showShared}
      <div class="storage-form stack">
        <div class="form-grid">
          <label>{$translate("ui.project-file-password-1618dbp")}<input type="password" autocomplete="off" bind:value={password} placeholder={$translate("ui.password-guxqaw")}/></label>
          <label>{$translate("ui.project-name-for-new-file-syz2yo")}<input bind:value={fileName} placeholder={$translate("app.household")}/></label>
        </div>
        <div class="storage-action-row">
          <button class="solid-action" disabled={busy} on:click={() => run(refreshFiles)}>{$translate("ui.show-available-files-13dqiqu")}</button>
          {#if serverCanCreate}<button disabled={busy || !serverReady} on:click={() => run(createRemote)}>{$translate("ui.create-online-project-from-current-kdw39x")}</button>{/if}
        </div>
        {#if serverReady && !serverCanCreate && !files.length}
          <p class="muted">{$translate("ui.there-are-no-projects-yet-creating-1ldmw5h")}</p>
        {/if}
        {#if files.length}
          <div class="shared-files">
            <h3>{$translate("ui.available-projects-1cnj4sr")}</h3>
            {#each files as f (f.id)}
              <div class="shared-file"><div><strong>{f.name}</strong><small>Version {f.revision} · zuletzt geändert: {f.updatedAt}</small></div><button class="outline-action" disabled={busy} on:click={() => run(() => openRemote(f))}>{$translate("ui.open-14klu42")}</button></div>
            {/each}
          </div>
        {/if}
        {#if openedId}
          <div class="current-shared">
            
            <h3>{fileName}</h3><p>Version {revision} · {leaseToken ? 'Du bearbeitest dieses Projekt. Reserviert bis ' + new Date(leaseExpires * 1000).toLocaleString('de-DE') : $translate("ui.currently-read-only-1lrmnzs")}</p>
            <div class="storage-action-row">
              {#if !leaseToken}
                <button class="solid-action" disabled={busy} on:click={() => run(checkout)}>{$translate("ui.start-editing-amk33u")}</button>
              {:else}
                <button class="solid-action" disabled={busy} on:click={() => run(saveRemote)}>{$translate("ui.save-changes-for-everyone-1usd0bn")}</button>
                <button disabled={busy} on:click={() => run(renew)}>{$translate("ui.extend-editing-time-ieh1xj")}</button>
                <button disabled={busy} on:click={() => run(checkin)}>{$translate("ui.stop-editing-14s9xpw")}</button>
              {/if}
            </div>
            {#if leaseToken}
              <label>{$translate("ui.new-password-for-the-shared-file-1h62si2")}<input type="password" autocomplete="new-password" bind:value={newPassword}/></label>
              <button disabled={busy} on:click={() => run(changePassword)}>{$translate("ui.change-file-password-1btazly")}</button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </section>
  {/if}
</div>

<style>
  .storage-feedback{grid-column:1/-1;margin:0}
  .storage-help-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .storage-help-heading h2{margin:0}
</style>
