<script>
  import { onMount } from 'svelte';
  import HelpTip from '../src/components/HelpTip.svelte';
  // Explizite Build-Kapazität: HTML-Builds besitzen keine Serverablage.
  const SERVER_MODE = import.meta.env.VITE_HAUSSTAND_SERVER_MODE === 'true';
  import { appState } from '../src/stores/projectStore.js';
  import { exportProject } from '../src/lib/persistence.js';
  import { encryptProject, decryptProject, hashSecret, randomSecret } from '../src/lib/crypto.js';

  let showProtected = false, showShared = false, busy = false, error = '', message = '';
  let password = '', newPassword = '', fileName = '';
  let serverCanCreate = false, serverReady = false;
  let files = [], versions = [], selectedVersion = '';
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
    return !$appState.dirty || confirm('Ungespeicherte Änderungen vorhanden. Vorher verschlüsselt exportieren? Trotzdem öffnen?');
  }
  function apiEndpoint(action, params = {}) {
    if (!SERVER_MODE) throw new Error('Diese Offline-Version besitzt keine Server-Anbindung.');
    const endpoint = new URL(location.pathname, location.origin);
    if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname))
      throw new Error('Die Server-Version muss über HTTPS aufgerufen werden.');
    if (!endpoint.pathname.endsWith('.php')) throw new Error('Die Server-Version muss aus der PHP-Datei geöffnet werden.');
    endpoint.searchParams.set('api', action);
    for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, value);
    return endpoint.toString();
  }
  async function api(action, body = null, params = {}, authorized = false) {
    const headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (authorized) {
      if (!editToken) throw new Error('Zuerst mit dem Dateipasswort öffnen.');
      headers['X-File-Token'] = editToken;
    }
    if (leaseToken) headers['X-Lease-Token'] = leaseToken;
    const response = await fetch(apiEndpoint(action, params), {
      method: body ? 'POST' : 'GET', headers,
      body: body ? JSON.stringify(body) : undefined, cache: 'no-store'
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('Server liefert kein gültiges JSON.'); }
    if (!response.ok || data.ok === false) {
      if ([409, 423].includes(response.status)) appState.setReadOnly(true);
      throw new Error((data.error || 'Serverfehler') + ' (HTTP ' + response.status + ')');
    }
    return data;
  }
  async function exportEncrypted() {
    if (!password) throw new Error('Bitte eine Passphrase eingeben.');
    const token = editToken || randomSecret();
    const envelope = await encryptProject(exportProject($appState.project, $appState.asOfDate), password, token);
    download(envelope, (fileName.trim() || 'hausstand') + '.hausstand.enc.json');
    if (!openedId) {
      editToken = token;
      appState.importProject($appState.project, fileName || 'Verschlüsselt', true);
    }
    appState.markExported();
    message = 'Verschlüsselte Projektdatei exportiert.';
  }
  async function importEncrypted(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      if (!ensureNoOverwrite()) return;
      if (!password) throw new Error('Passwort vor dem Öffnen eingeben.');
      const { project, editToken: token } = await decryptProject(JSON.parse(await file.text()), password);
      appState.importProject(project, file.name, true);
      editToken = token; activePassword = password; fileName = file.name;
      openedId = ''; leaseToken = ''; revision = 0; versions = [];
      message = 'Verschlüsselte lokale Datei geöffnet.'; error = '';
    } catch (e) { report(e); }
    finally { event.currentTarget.value = ''; }
  }
  async function refreshFiles() {
    files = (await api('files')).files || [];
    message = files.length + ' Datei(en) in der Online-Ablage.';
  }
  async function openRemote(file) {
    if (!ensureNoOverwrite()) return;
    if (!password) throw new Error('Bitte Dateipasswort eingeben.');
    const result = await api('read', null, { id: file.id });
    const decrypted = await decryptProject(result.envelope, password);
    editToken = decrypted.editToken; activePassword = password;
    openedId = file.id; fileName = file.name; revision = result.revision;
    leaseToken = ''; leaseExpires = 0; versions = []; selectedVersion = '';
    appState.importProject(decrypted.project, file.name, true, true);
    message = 'Schreibgeschützt geöffnet. Zum Bearbeiten auschecken.';
  }
  async function createRemote() {
    if (!fileName.trim()) throw new Error('Dateiname fehlt.');
    if (!serverCanCreate) throw new Error('Neue Projekte sind auf diesem Server nicht freigegeben.');
    if (!password || password.length < 8) throw new Error('Bitte ein Projektpasswort mit mindestens acht Zeichen eingeben.');
    if (!ensureNoOverwrite()) return;
    const id = crypto.randomUUID(), token = randomSecret();
    const envelope = await encryptProject(exportProject($appState.project, $appState.asOfDate), password, token);
    const result = await api('create', {
      id, name: fileName.trim(), envelope, tokenHash: await hashSecret(token)
    });
    openedId = id; editToken = token; revision = result.revision;
    activePassword = password; leaseToken = ''; leaseExpires = 0;
    appState.importProject($appState.project, fileName.trim(), true, true);
    await refreshFiles();
    message = 'Neue verschlüsselte Datei angelegt. Zum Ändern auschecken.';
  }
  async function checkout() {
    if (!openedId) throw new Error('Keine Datei gewählt.');
    const result = await api('checkout', { id: openedId, expectedRevision: revision }, {}, true);
    leaseToken = result.leaseToken; leaseExpires = result.expiresAt;
    appState.setReadOnly(false);
    message = 'Ausgecheckt bis ' + new Date(leaseExpires * 1000).toLocaleString('de-DE') + '.';
  }
  async function renew() {
    const result = await api('renew', { id: openedId }, {}, true);
    leaseExpires = result.expiresAt; message = 'Sperre um zwei Stunden verlängert.';
  }
  async function commitProject(project, passphrase, token, rotate = false) {
    if (!openedId || !leaseToken) throw new Error('Die Datei muss zuerst ausgecheckt werden.');
    const envelope = await encryptProject(exportProject(project, $appState.asOfDate), passphrase, token);
    const payload = { id: openedId, expectedRevision: revision, envelope };
    if (rotate) payload.newTokenHash = await hashSecret(token);
    const result = await api('save', payload, {}, true);
    revision = result.revision; leaseExpires = result.expiresAt;
    if (rotate) editToken = token;
    appState.markExported();
    return result;
  }
  async function saveRemote() {
    const result = await commitProject($appState.project, activePassword, editToken);
    message = 'Revision ' + revision + ' gespeichert. Mailstatus: ' + result.mailStatus + '.';
  }
  async function checkin() {
    if ($appState.dirty && !confirm('Ungespeicherte Änderungen! Trotzdem einchecken?')) return;
    await api('checkin', { id: openedId }, {}, true);
    leaseToken = ''; leaseExpires = 0; appState.setReadOnly(true);
    message = 'Eingecheckt, Sperre aufgehoben.';
  }
  async function getVersions() {
    if (!openedId) throw new Error('Bitte eine Online-Datei öffnen.');
    versions = (await api('versions', null, { id: openedId })).versions || [];
  }
  async function restore() {
    if (!leaseToken || !selectedVersion) throw new Error('Auschecken und Revision auswählen.');
    if (!password) throw new Error('Passwort für diese historische Version eingeben.');
    if (!confirm('Historische Version als neue Revision speichern?')) return;
    const payload = await api('version', null, { id: openedId, rev: selectedVersion });
    const restored = await decryptProject(payload.envelope, password);
    await commitProject(restored.project, activePassword, editToken);
    appState.importProject(restored.project, fileName, true, false);
    message = 'Version ' + selectedVersion + ' wurde als Revision ' + revision + ' wiederhergestellt.';
  }
  async function changePassword() {
    if (!leaseToken) throw new Error('Vor Passwortwechsel auschecken.');
    if (!newPassword || newPassword.length < 8) throw new Error('Neues Passwort mit mindestens acht Zeichen wählen.');
    if (!confirm('Aktuelle Revision neu verschlüsseln und alte Bearbeitungsberechtigung sperren? Historische Revisionen und versandte Backups können weiterhin mit ihren alten Passwörtern entschlüsselt werden.')) return;
    const newToken = randomSecret();
    await commitProject($appState.project, newPassword, newToken, true);
    activePassword = newPassword; password = newPassword; newPassword = '';
    message = 'Passwort geändert und alte Schreibberechtigung widerrufen; ältere Revisionen behalten ihre bisherigen Passwörter.';
  }
</script>
<div class="storage-choices">
  <section class="ux-panel storage-choice">
    <div class="storage-choice-top"><div class="storage-help-heading"><h2>Mit Passwort sichern</h2><HelpTip label="Wie funktioniert eine verschlüsselte Sicherung?">Du kannst eine verschlüsselte Datei erstellen oder wieder öffnen. Ohne das Passwort kann sie nicht entschlüsselt werden; eine unverschlüsselte Browserkopie wird bei geschützten Projekten nicht gespeichert.</HelpTip></div></div>
    <button class="outline-action" aria-expanded={showProtected} on:click={() => showProtected = !showProtected}>{showProtected ? 'Weniger anzeigen' : 'Passwortgeschützte Dateien verwalten'} <span aria-hidden="true">{showProtected ? '↑' : '↓'}</span></button>
    {#if showProtected}
      <div class="storage-form">
        <div class="form-grid">
          <label>Passwort für diese Datei<input type="password" autocomplete="off" bind:value={password} placeholder="Langes, sicheres Passwort"/></label>
          <label>Name der Sicherung<input bind:value={fileName} placeholder="Hausgemeinschaft"/></label>
        </div>
        <div class="storage-action-row">
          <button class="solid-action" disabled={busy} on:click={() => run(exportEncrypted)}>Verschlüsselte Datei herunterladen</button>
          <label class="file-button">Verschlüsselte Datei öffnen<input type="file" accept=".json,.enc" on:change={importEncrypted}/></label>
        </div>

      </div>
    {/if}
  </section>
  {#if SERVER_MODE}
  <section class="ux-panel storage-choice">
    <div class="storage-choice-top"><div class="storage-help-heading"><h2>Online-Projekte</h2><HelpTip label="Wie funktionieren Online-Projekte?">Hier kannst du gemeinsame Projektdateien auf dem bereits konfigurierten Server öffnen und bearbeiten. Dafür benötigst du das Projektpasswort.</HelpTip></div></div>
    <button class="outline-action" aria-expanded={showShared} on:click={() => showShared = !showShared}>{showShared ? 'Weniger anzeigen' : 'Online-Projekte anzeigen'} <span aria-hidden="true">{showShared ? '↑' : '↓'}</span></button>
    {#if showShared}
      <div class="storage-form stack">
        <div class="form-grid">
          <label>Passwort der Projektdatei<input type="password" autocomplete="off" bind:value={password} placeholder="Passwort"/></label>
          <label>Projektname (für neue Datei)<input bind:value={fileName} placeholder="Hausgemeinschaft"/></label>
        </div>
        <div class="storage-action-row">
          <button class="solid-action" disabled={busy} on:click={() => run(refreshFiles)}>Verfügbare Dateien anzeigen</button>
          {#if serverCanCreate}<button disabled={busy || !serverReady} on:click={() => run(createRemote)}>Aktuellen Stand als Online-Projekt anlegen</button>{/if}
        </div>
        {#if serverReady && !serverCanCreate && !files.length}
          <p class="muted">Hier sind noch keine Projekte vorhanden. Das Anlegen neuer Projekte ist für diese Installation deaktiviert.</p>
        {/if}
        {#if files.length}
          <div class="shared-files">
            <h3>Verfügbare Projekte</h3>
            {#each files as f (f.id)}
              <div class="shared-file"><div><strong>{f.name}</strong><small>Version {f.revision} · zuletzt geändert: {f.updatedAt}</small></div><button class="outline-action" disabled={busy} on:click={() => run(() => openRemote(f))}>Öffnen</button></div>
            {/each}
          </div>
        {/if}
        {#if openedId}
          <div class="current-shared">
            
            <h3>{fileName}</h3><p>Version {revision} · {leaseToken ? 'Du bearbeitest dieses Projekt. Reserviert bis ' + new Date(leaseExpires * 1000).toLocaleString('de-DE') : 'Zurzeit nur lesbar'}</p>
            <div class="storage-action-row">
              {#if !leaseToken}
                <button class="solid-action" disabled={busy} on:click={() => run(checkout)}>Bearbeitung starten</button>
              {:else}
                <button class="solid-action" disabled={busy} on:click={() => run(saveRemote)}>Änderungen für alle sichern</button>
                <button disabled={busy} on:click={() => run(renew)}>Bearbeitungszeit verlängern</button>
                <button disabled={busy} on:click={() => run(checkin)}>Bearbeitung beenden</button>
              {/if}
              <button disabled={busy} on:click={() => run(getVersions)}>Ältere Versionen ansehen</button>
            </div>
            {#if versions.length}
              <label>Frühere Version auswählen<select bind:value={selectedVersion}><option value="">Bitte wählen</option>{#each versions as v}<option value={v.revision}>{v.revision} · {v.createdAt}</option>{/each}</select></label>
              <button disabled={busy || !leaseToken || !selectedVersion} on:click={() => run(restore)}>Gewählte Version wiederherstellen</button>
            {/if}
            {#if leaseToken}
              <label>Neues Passwort für die gemeinsame Datei<input type="password" autocomplete="new-password" bind:value={newPassword}/></label>
              <button disabled={busy} on:click={() => run(changePassword)}>Dateipasswort ändern</button>
            {/if}
          </div>
        {/if}
        {#if busy}<div class="muted" role="status">Vorgang wird ausgeführt …</div>{/if}
        {#if error}<div role="alert" class="inline-info warning">{error}</div>{/if}
        {#if message}<div role="status" class="inline-info">{message}</div>{/if}
      </div>
    {/if}
  </section>
  {/if}
</div>

<style>
  .storage-help-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .storage-help-heading h2{margin:0}
</style>
