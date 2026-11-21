<script>
  import { onMount } from 'svelte';
  import { appState } from '../stores/projectStore.js';
  import { exportProject } from '../lib/persistence.js';
  import { encryptProject, decryptProject, hashSecret, randomSecret } from '../lib/crypto.js';

  let expanded = false, busy = false, error = '', message = '';
  let password = '', newPassword = '', apiUrl = '', workspaceKey = '', fileName = '';
  let files = [], versions = [], selectedVersion = '';
  let openedId = '', revision = 0, editToken = '', leaseToken = '', leaseExpires = 0;
  let activePassword = '';

  onMount(() => {
    if (location.pathname.endsWith('.php')) apiUrl = location.origin + location.pathname;
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
    if (!apiUrl.trim()) throw new Error('Bitte die URL der PHP-Ablage eingeben.');
    const endpoint = new URL(apiUrl.trim(), location.href);
    if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname))
      throw new Error('Für die Server-Ablage ist HTTPS erforderlich.');
    if (!endpoint.pathname.endsWith('.php')) throw new Error('Die Adresse muss auf die PHP-Datei enden.');
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
    if (workspaceKey) headers['X-Workspace-Key'] = workspaceKey;
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
    if (!workspaceKey) throw new Error('Zum Anlegen ist der Workspace-Schlüssel erforderlich.');
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

<section class="panel" style="margin-top:16px">
  <div class="panel-header">
    <h2>🔐 Dateien & Online</h2>
    <button class="small" on:click={() => expanded = !expanded}>{expanded ? 'Schließen' : 'Öffnen'}</button>
  </div>
  {#if expanded}
    <div class="panel-body stack">
      <div class="notice">Projekte werden im Browser verschlüsselt. Die Online-Funktion benötigt zusätzlich einen separat bereitgestellten PHP-Server.</div>
      <div class="form-grid">
        <label>Dateipasswort <input type="password" autocomplete="off" bind:value={password} placeholder="Lange Passphrase"/></label>
        <label>Dateiname <input bind:value={fileName} placeholder="Hausgemeinschaft"/></label>
      </div>
      <div class="row" style="flex-wrap:wrap">
        <button disabled={busy} on:click={() => run(exportEncrypted)}>Verschlüsselt exportieren</button>
        <label class="buttonish">Verschlüsselte Datei öffnen <input type="file" accept=".json,.enc" style="display:none" on:change={importEncrypted}/></label>
      </div>
      <div class="muted">Kein Klartext-Browsercache für verschlüsselt geöffnete Projekte. Ohne Speicherung können Änderungen beim Schließen verloren gehen.</div>
      <hr/>
      <strong>Gemeinsame Online-Ablage</strong>
      <div class="form-grid">
        <label class="wide">PHP-API-Adresse <input type="url" bind:value={apiUrl} placeholder="https://server.example/hausstand.php"/></label>
        <label>Workspace-Schlüssel (nur neue Dateien) <input type="password" autocomplete="off" bind:value={workspaceKey}/></label>
      </div>
      <div class="row" style="flex-wrap:wrap">
        <button disabled={busy} on:click={() => run(refreshFiles)}>Dateiliste laden</button>
        <button disabled={busy} on:click={() => run(createRemote)}>Als neue Online-Datei anlegen</button>
      </div>
      {#if files.length}
        <div style="overflow-x:auto">
          <table>
            <thead><tr><th>Dateiname</th><th>Rev.</th><th>Zuletzt geändert</th><th></th></tr></thead>
            <tbody>
              {#each files as f (f.id)}
                <tr><td>{f.name}</td><td>{f.revision}</td><td>{f.updatedAt}</td>
                  <td><button class="small" disabled={busy} on:click={() => run(() => openRemote(f))}>Mit Passwort öffnen</button></td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
      {#if openedId}
        <div class="mini-card stack">
          <strong>{fileName} · Revision {revision}</strong>
          <div class="muted">{leaseToken ? 'Ausgecheckt bis ' + new Date(leaseExpires * 1000).toLocaleString('de-DE') : 'Schreibgeschützt'}</div>
          <div class="row" style="flex-wrap:wrap">
            {#if !leaseToken}
              <button disabled={busy} on:click={() => run(checkout)}>Auschecken</button>
            {:else}
              <button class="primary" disabled={busy} on:click={() => run(saveRemote)}>Auf Server speichern</button>
              <button disabled={busy} on:click={() => run(renew)}>Sperre verlängern</button>
              <button disabled={busy} on:click={() => run(checkin)}>Einchecken</button>
            {/if}
            <button disabled={busy} on:click={() => run(getVersions)}>Versionen</button>
          </div>
          {#if versions.length}
            <label>Revision wiederherstellen <select bind:value={selectedVersion}>
              <option value="">Auswählen</option>
              {#each versions as v}<option value={v.revision}>{v.revision} · {v.createdAt}</option>{/each}
            </select></label>
            <button disabled={busy || !leaseToken || !selectedVersion} on:click={() => run(restore)}>Alte Revision als neue Revision wiederherstellen</button>
          {/if}
          {#if leaseToken}
            <label>Neues Passwort <input type="password" autocomplete="new-password" bind:value={newPassword}/></label>
            <button disabled={busy} on:click={() => run(changePassword)}>Passwort ändern</button>
          {/if}
        </div>
      {/if}
      {#if busy}<div class="muted">Bearbeitung läuft …</div>{/if}
      {#if error}<div role="alert" class="notice warn">{error}</div>{/if}
      {#if message}<div role="status" class="notice">{message}</div>{/if}
    </div>
  {/if}
</section>
