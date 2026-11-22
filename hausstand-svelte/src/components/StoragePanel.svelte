<script>
  import { appState } from '../stores/projectStore.js';
  import { exportProject } from '../lib/persistence.js';
  import { encryptProject, decryptProject, randomSecret } from '../lib/crypto.js';

  let expanded = false, busy = false, error = '', message = '';
  let password = '', fileName = '';

  function download(payload, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function run(job) {
    busy = true; error = ''; message = '';
    try { await job(); } catch (e) { error = e?.message || String(e); }
    finally { busy = false; }
  }
  async function exportEncrypted() {
    if (!password) throw new Error('Bitte zuerst ein Passwort eingeben.');
    const envelope = await encryptProject(exportProject($appState.project, $appState.asOfDate), password, randomSecret());
    download(envelope, (fileName.trim() || 'hausstand') + '.hausstand.enc.json');
    appState.importProject($appState.project, fileName || 'Verschlüsselt', true);
    appState.markExported();
    message = 'Verschlüsselte Projektdatei heruntergeladen.';
  }
  async function importEncrypted(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      if ($appState.dirty && !confirm('Nicht exportierte Änderungen vorhanden. Trotzdem eine andere Datei öffnen?')) return;
      if (!password) throw new Error('Bitte zuerst das Dateipasswort eingeben.');
      const {project} = await decryptProject(JSON.parse(await file.text()), password);
      appState.importProject(project, file.name, true);
      fileName = file.name;
      message = 'Verschlüsselte Datei geöffnet.'; error = '';
    } catch(e) { error = e?.message || String(e); }
    finally { event.currentTarget.value = ''; }
  }
</script>

<section class="panel" style="margin-top:16px">
  <div class="panel-header">
    <h2>Verschlüsselte Sicherung</h2>
    <button class="small" aria-expanded={expanded} on:click={() => expanded = !expanded}>{expanded ? 'Schließen' : 'Öffnen'}</button>
  </div>
  {#if expanded}
    <div class="panel-body stack">
      <div class="notice">Diese HTML-Version funktioniert vollständig lokal. Verschlüsselte Dateien können heruntergeladen und wieder geöffnet werden.</div>
      <div class="form-grid">
        <label>Dateipasswort <input type="password" autocomplete="off" bind:value={password} placeholder="Lange Passphrase"/></label>
        <label>Dateiname <input bind:value={fileName} placeholder="Hausgemeinschaft"/></label>
      </div>
      <div class="row" style="flex-wrap:wrap">
        <button disabled={busy} on:click={() => run(exportEncrypted)}>Verschlüsselt exportieren</button>
        <label class="buttonish">Verschlüsselte Datei öffnen <input type="file" accept=".json,.enc" style="display:none" on:change={importEncrypted}/></label>
      </div>
      <div class="muted">Für verschlüsselte Projekte wird keine Klartext-Arbeitskopie im Browser gespeichert. Bewahre die Sicherungsdatei und das Passwort sicher auf.</div>
      {#if busy}<div class="muted">Bearbeitung läuft …</div>{/if}
      {#if error}<div role="alert" class="notice warn">{error}</div>{/if}
      {#if message}<div role="status" class="notice">{message}</div>{/if}
    </div>
  {/if}
</section>
