// Real-browser acceptance: offline Save/restore/Undo and two-browser PHP checkout.
// Run with: npm run build:single && npm run build:php && node tests/browser-qa.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { decryptProject } from '../src/lib/crypto.js';
import { readPortableVersion } from '../src/lib/versionHistory.js';

const fixture = {
  schemaVersion: 1, appVersion: '0.7.0-svelte', currency: 'EUR',
  community: { name: 'Browser-Abnahme' },
  people: [{ id: 'anna', name: 'Anna' }, { id: 'ben', name: 'Ben' }, { id: 'clara', name: 'Clara' }],
  items: [{ id: 'fridge', name: 'Kühlschrank', tags: [] }],
  events: [
    ...['anna', 'ben', 'clara'].map((id, i) => ({
      id: 'join-' + id, type: 'person-added', personId: id, name: id,
      date: '2025-01-01', order: i + 1
    })),
    {
      id: 'purchase', type: 'item-added', itemId: 'fridge', name: 'Kühlschrank',
      date: '2025-01-02', order: 1, initialValue: 300,
      valuation: { type: 'fixed', minimumValue: 0 },
      financialMode: 'derived', financedByPersonId: 'anna',
      shares: { anna: 1, ben: 1, clara: 1 }
    }
  ],
  drafts: [], lastSavedAt: '2025-01-02T09:00:00.000Z',
  versionHistory: { format: 'portable-v1', entries: [] }
};
const oneSaved = project => ({
  project, savedProject: project, savedHistoryIds: project.versionHistory.entries.map(entry => entry.id),
  fileName: 'browser-qa.json', dirty: false
});
const key = 'hausstand_svelte_v07_working_copy';
const pause = millis => new Promise(resolve => setTimeout(resolve, millis));
async function makeHttpServer() {
  const content = await readFile('dist/hausstand-standalone.html');
  const server = createServer((req, res) => {
    if (req.url !== '/hausstand-standalone.html') {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(content);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: 'http://127.0.0.1:' + server.address().port + '/hausstand-standalone.html' };
}
async function bootFixture(page, url) {
  await page.goto(url);
  await page.evaluate(({ key, copy }) => localStorage.setItem(key, JSON.stringify(copy)), {
    key, copy: oneSaved(fixture)
  });
  await page.reload();
  await page.getByText('Browser-Abnahme').first().waitFor();
}
async function localization(browser, url) {
  // Browser language chooses English; manual override stays in browser storage
  // and must not modify the shared ownership project.
  const context = await browser.newContext({ locale: 'en-GB', viewport: { width: 1280, height: 800 } });
  try {
    const page = await context.newPage();
    await bootFixture(page, url);
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.locator('.sidebar').getByRole('button', { name: 'Settings' }).click();
    const selection = page.locator('#language-selection');
    assert.equal(await selection.inputValue(), 'auto');
    await selection.selectOption('de');
    assert.equal(await page.locator('html').getAttribute('lang'), 'de');
    await page.locator('.sidebar').getByRole('button', { name: 'Einstellungen' }).waitFor();
    await page.reload();
    await page.locator('.sidebar').getByRole('button', { name: 'Einstellungen' }).click();
    assert.equal(await page.locator('html').getAttribute('lang'), 'de');
    assert.equal(await page.locator('#language-selection').inputValue(), 'de');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('hausstand_svelte_v07_working_copy')));
    assert.equal(Object.hasOwn(stored?.project || {}, 'language'), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('hausstand-language')), 'de');
    await page.locator('#language-selection').selectOption('auto');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.locator('.sidebar').getByRole('button', { name: 'Settings' }).waitFor();
    console.log('Browser i18n QA: English auto-detection, German override/reload, isolated preference passed');
  } finally { await context.close(); }
}

async function openFinance(page) {
  const desktop = page.locator('.sidebar').getByRole('button', { name: /Geld & Ausgleich/ });
  if (await desktop.isVisible()) return desktop.click();
  return page.locator('.mobile-bottom-nav').getByRole('button', { name: /Geld/ }).click();
}
async function openSave(page) {
  const desktop = page.locator('.sidebar').getByRole('button', { name: /Sichern & Teilen/ });
  if (await desktop.isVisible()) return desktop.click();
  await page.getByRole('button', { name: 'Weitere Bereiche öffnen' }).click();
  return page.locator('.mobile-more-menu').getByRole('button', { name: /Sichern & Teilen/ }).click();
}
async function balance(page, name, amount) {
  await page.waitForFunction(({ name, amount }) => [...document.querySelectorAll('.person-balance-row')]
    .some(row => row.textContent.includes(name) && row.textContent.includes(amount)), { name, amount }, { timeout: 10000 });
}
async function payment(page, sum) {
  await page.getByRole('button', { name: 'Zahlung erfassen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ausgleich dokumentieren' });
  await dialog.getByLabel('Wer hat bezahlt?').selectOption('ben');
  await dialog.getByLabel('Wer hat das Geld erhalten?').selectOption('anna');
  await dialog.getByLabel('Gezahlter Betrag in Euro').fill(String(sum));
  await dialog.getByRole('button', { name: 'Zahlung als erfolgt erfassen' }).click();
  await dialog.waitFor({ state: 'hidden' });
}
async function download(page) {
  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  const file = await wait;
  return JSON.parse(await readFile(await file.path(), 'utf8'));
}
async function offline(browser, url) {
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', e => failures.push(e.message));
  await bootFixture(page, url);
  await openFinance(page);
  await balance(page, 'Anna', '200,00');
  await balance(page, 'Ben', '100,00');
  await payment(page, '60');
  await balance(page, 'Anna', '140,00');
  await balance(page, 'Ben', '40,00');
  const undo = page.getByRole('button', { name: /Rückgängig \(Strg\+Z\)/ });
  const redo = page.getByRole('button', { name: /Wiederholen \(Strg\+Y\)/ });
  assert.equal(await undo.isEnabled(), true);
  await page.keyboard.press('Control+z');
  await balance(page, 'Anna', '200,00');
  await redo.click();
  await balance(page, 'Anna', '140,00');
  const stored = await download(page);
  assert.equal(stored.versionHistory.entries.length, 1);
  assert.equal(stored.events.filter(e => e.type === 'claim-settlement-recorded').length, 1);
  assert.equal(stored.versionHistory.entries[0].encoding, 'gzip-base64');
  await page.reload();
  assert.equal(await undo.isDisabled(), true, 'fine-grained Undo must not survive reload');
  await openFinance(page); // route/navigation state is intentionally not persisted.
  await balance(page, 'Anna', '140,00');
  assert.deepEqual(failures, []);
  await context.close();

  // A new browser context cannot share the first browser's local working copy.
  const fresh = await browser.newContext({ locale: 'de-DE', viewport: { width: 375, height: 812 }, acceptDownloads: true });
  const mobile = await fresh.newPage();
  const errors = [];
  mobile.on('pageerror', e => errors.push(e.message));
  await mobile.goto(url);
  await openSave(mobile);
  const upload = mobile.locator('.save-basic-actions input[type=file]');
  await upload.setInputFiles({
    name: 'downloaded.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(stored))
  });
  await mobile.getByText('Browser-Abnahme').first().waitFor();
  await openFinance(mobile);
  await balance(mobile, 'Anna', '140,00');
  const width = await mobile.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(width.document <= width.viewport + 2, 'Mobile page overflows: ' + JSON.stringify(width));
  await openSave(mobile);
  const picker = mobile.locator('section[aria-label="Gespeicherte Dateiversionen"] select');
  await picker.selectOption({ index: 1 });
  mobile.on('dialog', dialog => dialog.accept());
  await mobile.getByRole('button', { name: 'Als ungespeicherten Arbeitsstand wiederherstellen' }).click();
  await openFinance(mobile);
  await balance(mobile, 'Anna', '200,00');
  assert.equal(await mobile.getByText('Ungespeicherte Änderungen').count() > 0, true);
  const restored = await download(mobile);
  assert.equal(restored.versionHistory.entries.length, 2);
  assert.deepEqual(restored.events.filter(e => e.type === 'claim-settlement-recorded'), []);
  const beforeRestore = await readPortableVersion(restored, restored.versionHistory.entries[1].id);
  assert.equal(beforeRestore.events.filter(e => e.type === 'claim-settlement-recorded').length, 1,
    'Restoring the previous current file must archive the completed payment snapshot');

  // Local encrypted download carries the same complete portable history.
  await openSave(mobile);
  await mobile.getByRole('button', { name: /Passwortgeschützte Dateien verwalten/ }).click();
  await mobile.getByLabel('Passwort für diese Datei').fill('encrypted-browser-qa-secret');
  await mobile.getByLabel('Name der Sicherung').fill('verschlüsselt');
  const encryptedWait = mobile.waitForEvent('download');
  await mobile.getByRole('button', { name: 'Verschlüsselte Datei herunterladen' }).click();
  const encryptedFile = JSON.parse(await readFile(await (await encryptedWait).path(), 'utf8'));
  assert.equal(encryptedFile.format, 'hausstand-aesgcm-v1');
  assert.equal(JSON.stringify(encryptedFile).includes('portable-v1'), false);

  const encryptedContext = await browser.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 800 } });
  try {
    const encryptedPage = await encryptedContext.newPage();
    const encryptedErrors = [];
    encryptedPage.on('pageerror', e => encryptedErrors.push(e.message));
    await encryptedPage.goto(url);
    await openSave(encryptedPage);
    await encryptedPage.getByRole('button', { name: /Passwortgeschützte Dateien verwalten/ }).click();
    await encryptedPage.getByLabel('Passwort für diese Datei').fill('encrypted-browser-qa-secret');
    await encryptedPage.locator('.storage-choices input[accept=".json,.enc"]').setInputFiles({
      name: 'portable-encrypted.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(encryptedFile))
    });
    await encryptedPage.getByText('Browser-Abnahme').first().waitFor();
    await openFinance(encryptedPage);
    await balance(encryptedPage, 'Anna', '200,00');
    await openSave(encryptedPage);
    // Versions are displayed newest first: index 1 is the payment state.
    await encryptedPage.locator('section[aria-label="Gespeicherte Dateiversionen"] select')
      .selectOption({ index: 1 });
    encryptedPage.on('dialog', dialog => dialog.accept());
    await encryptedPage.getByRole('button', { name: 'Als ungespeicherten Arbeitsstand wiederherstellen' }).click();
    try {
      await encryptedPage.getByText(/Früherer Stand geladen/).waitFor({ timeout: 12000 });
    } catch {
      throw new Error('Encrypted restore did not finish: ' +
        (await encryptedPage.locator('.storage-choices').innerText()).slice(0, 900));
    }
    await openFinance(encryptedPage);
    await balance(encryptedPage, 'Anna', '140,00');
    // Header Save on an opened encrypted local file must directly download
    // an encrypted archive, not direct the user to an unencrypted backup.
    const saveEncryptedWait = encryptedPage.waitForEvent('download');
    await encryptedPage.getByRole('button', { name: 'Speichern', exact: true }).click();
    const savedEncrypted = JSON.parse(await readFile(await (await saveEncryptedWait).path(), 'utf8'));
    assert.equal(savedEncrypted.format, 'hausstand-aesgcm-v1');
    const savedEncryptedProject = (await decryptProject(savedEncrypted, 'encrypted-browser-qa-secret')).project;
    assert.equal(savedEncryptedProject.events.filter(e => e.type === 'claim-settlement-recorded').length, 1);
    assert.equal(savedEncryptedProject.versionHistory.entries.length, 3);
    assert.deepEqual(encryptedErrors, []);
  } finally { await encryptedContext.close(); }
  assert.deepEqual(errors, []);
  await fresh.close();
  console.log('Browser offline QA: money, Undo/Redo, JSON download, fresh-browser restore, encrypted file roundtrip and 375px layout passed');
}
async function freePort() {
  const srv = createServer();
  await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
  const port = srv.address().port;
  await new Promise(resolve => srv.close(resolve));
  return port;
}
async function phpOnline(browser) {
  const privateDir = await mkdtemp(join(tmpdir(), 'hausstand-browser-private-'));
  const port = await freePort();
  const host = 'http://127.0.0.1:' + port;
  const php = spawn('php', ['-S', '127.0.0.1:' + port, '-t', 'dist'], {
    env: { ...process.env, HAUSSTAND_DATA_DIR: privateDir, HAUSSTAND_ALLOW_CREATE: 'true' },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let phpLogs = '';
  php.stderr.on('data', part => { phpLogs += part.toString(); });
  try {
    let alive = false;
    for (let i = 0; i < 70; i++) {
      try {
        const res = await fetch(host + '/hausstand.php?api=config');
        alive = res.ok; if (alive) break;
      } catch {}
      await pause(150);
    }
    assert.ok(alive, 'PHP server did not start: ' + phpLogs);
    const first = await browser.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 800 } });
    const second = await browser.newContext({ locale: 'de-DE', viewport: { width: 375, height: 812 } });
    try {
      const editor = await first.newPage();
      await bootFixture(editor, host + '/hausstand.php');
      await openSave(editor);
      await editor.getByRole('button', { name: 'Online-Projekte anzeigen' }).click();
      await editor.getByLabel('Passwort der Projektdatei').fill('browser-test-passphrase');
      await editor.getByLabel('Projektname (für neue Datei)').fill('Gemeinsame Browser-Abnahme');
      await editor.getByRole('button', { name: 'Aktuellen Stand als Online-Projekt anlegen' }).click();
      await editor.getByText('Gemeinsame Browser-Abnahme').first().waitFor();
      await editor.getByRole('button', { name: 'Bearbeitung starten' }).click();
      await editor.getByRole('button', { name: 'Bearbeitung beenden' }).waitFor();

      const viewer = await second.newPage();
      await viewer.goto(host + '/hausstand.php');
      await openSave(viewer);
      await viewer.getByRole('button', { name: 'Online-Projekte anzeigen' }).click();
      await viewer.getByLabel('Passwort der Projektdatei').fill('browser-test-passphrase');
      await viewer.getByRole('button', { name: 'Verfügbare Dateien anzeigen' }).click();
      await viewer.locator('.shared-file').getByRole('button', { name: 'Öffnen' }).click();
      await viewer.getByRole('button', { name: 'Bearbeitung starten' }).click();
      await viewer.getByText(/bereits ausgecheckt/).waitFor();

      await openFinance(editor);
      await payment(editor, '60');
      await editor.getByRole('button', { name: 'Speichern', exact: true }).click();
      await editor.locator('main.work-content > p[role="status"]').filter({ hasText: /Revision 2 gespeichert/ }).waitFor();
      const files = (await (await fetch(host + '/hausstand.php?api=files')).json()).files;
      assert.equal(files.length, 1);
      const packet = await (await fetch(host + '/hausstand.php?api=read&id=' + files[0].id)).json();
      const decoded = (await decryptProject(packet.envelope, 'browser-test-passphrase')).project;
      assert.equal(decoded.versionHistory.entries.length, 1);
      assert.equal(decoded.events.filter(e => e.type === 'claim-settlement-recorded').length, 1);
      await openSave(editor);
      await editor.getByRole('button', { name: 'Bearbeitung beenden' }).click();
      await viewer.getByRole('button', { name: 'Bearbeitung starten' }).click();
      await viewer.getByText(/neuere Revision|HTTP 409/).waitFor();
      console.log('Browser PHP QA: encrypted create/open, exclusive lease, Save, embedded archive and stale revision passed');
    } finally { await first.close(); await second.close(); }
  } finally {
    php.kill();
    await rm(privateDir, { recursive: true, force: true });
  }
}
let browser;
let server;
try {
  browser = await chromium.launch({ headless: true });
  const offlineServer = await makeHttpServer();
  server = offlineServer.server;
  await localization(browser, offlineServer.url);
  await offline(browser, offlineServer.url);
  await phpOnline(browser);
} catch (error) {
  console.error('Real-browser QA failed:', error);
  throw error;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
