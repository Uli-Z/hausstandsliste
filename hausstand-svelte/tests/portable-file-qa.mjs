// Q05: portable-file acceptance across genuine Chromium, Firefox and WebKit engines.
// Runs against the built offline HTML, independently of any browser working copy.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPortableSave, readPortableVersion } from '../src/lib/versionHistory.js';
import { encryptProject, decryptProject } from '../src/lib/crypto.js';

const STORAGE_KEY = 'hausstand_svelte_v07_working_copy';
const PASSWORD = 'q05-portable-archive-passphrase';

function pseudoRandomText(length, seed) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let state = (seed + 42) >>> 0;
  let output = '';
  for (let index = 0; index < length; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    output += alphabet[(state >>> 16) % alphabet.length];
  }
  return output;
}

async function makeArchive() {
  let project = await createPortableSave({
    schemaVersion: 1, appVersion: '0.7.0-svelte', currency: 'EUR',
    community: { name: 'Q05 Archiv 00', note: 'Original' },
    people: [{ id: 'anna', name: 'Anna' }, { id: 'ben', name: 'Ben' }],
    items: [{ id: 'lamp', name: 'Lampe', tags: [] }],
    events: [
      { id: 'join-a', type: 'person-added', personId: 'anna', name: 'Anna', date: '2025-01-01', order: 1 },
      { id: 'join-b', type: 'person-added', personId: 'ben', name: 'Ben', date: '2025-01-01', order: 2 },
      { id: 'purchase', type: 'item-added', itemId: 'lamp', name: 'Lampe',
        date: '2025-01-02', order: 1, initialValue: 123.45,
        valuation: { type: 'fixed', minimumValue: 0 },
        financialMode: 'derived', financedByPersonId: 'anna', shares: { anna: 1, ben: 1 } },
      { id: 'payment', type: 'claim-settlement-recorded', debtorPersonId: 'ben',
        creditorPersonId: 'anna', settlementKind: 'paid', amountCents: 1248,
        date: '2025-01-03', order: 1, note: 'Teilzahlung 12,48 EUR' },
      { id: 'departure', type: 'person-deactivated', personId: 'ben',
        date: '2027-01-12', order: 1 }
    ],
    drafts: []
  }, null, '2025-01-02T12:00:00.000Z');
  // Repeated confirmed saves must preserve every older complete state,
  // including large, poorly compressible Unicode-safe user data.
  for (let index = 1; index <= 35; index++) {
    project = await createPortableSave({
      ...project,
      community: { name: 'Q05 Archiv ' + String(index).padStart(2, '0'),
        note: pseudoRandomText(40_000, index) }
    }, project, new Date(Date.UTC(2025, 0, 3, 0, index)).toISOString());
  }
  assert.equal(project.versionHistory.entries.length, 35);
  assert.ok(JSON.stringify(project).length > 500_000, 'Exercise a substantial compressed archive');
  return project;
}

async function openSave(page, mobile = false) {
  if (!mobile) {
    await page.locator('.sidebar').getByRole('button', { name: 'Sichern & Teilen' }).click();
    return;
  }
  await page.getByRole('button', { name: 'Weitere Bereiche öffnen' }).click();
  await page.locator('.mobile-more-menu').getByRole('button', { name: /Sichern & Teilen/ }).click();
}

async function importJson(page, project) {
  await page.locator('.save-basic-actions input[type=file]').setInputFiles({
    name: 'q05-portable.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project))
  });
  await page.locator('.header-context').getByText(project.community.name).waitFor();
}

async function savedDownload(page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}

async function rejectedImport(page, value, expectedMessage) {
  const rejected = new Promise(resolve => page.once('dialog', async dialog => {
    const message = dialog.message();
    await dialog.accept();
    resolve(message);
  }));
  await page.locator('.save-basic-actions input[type=file]').setInputFiles({
    name: 'invalid.json', mimeType: 'application/json',
    buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))
  });
  assert.match(await rejected, expectedMessage);
}

async function exerciseQuota(page, entryCount) {
  // Fill available storage *after* a valid import, leaving less than a single
  // project save's space. This tests the real QuotaExceededError path without
  // depending on a browser-specific fixed quota size.
  const filled = await page.evaluate(() => {
    let largest = 0;
    for (let n = 1; n <= 80; n++) {
      try {
        localStorage.setItem('q05-quota-filler', 'x'.repeat(n * 256 * 1024));
        largest = n * 256 * 1024;
      } catch (error) {
        if (error?.name !== 'QuotaExceededError') throw error;
        break;
      }
    }
    return largest;
  });
  assert.ok(filled >= 256 * 1024, 'A browser quota could not be simulated');
  const picker = page.locator('section[aria-label="Gespeicherte Dateiversionen"] select');
  await picker.selectOption({ index: entryCount }); // oldest saved version
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Als ungespeicherten Arbeitsstand wiederherstellen' }).click();
  await page.locator('.header-context').getByText('Q05 Archiv 00').waitFor();
  await page.locator('main [role="alert"]').filter({ hasText: /Browser/ }).waitFor();
  const downloaded = await savedDownload(page);
  assert.equal(downloaded.community.name, 'Q05 Archiv 00');
  assert.equal(downloaded.versionHistory.entries.length, entryCount + 1,
    'Saving a restored version must append the previously current version');
  await page.evaluate(() => localStorage.removeItem('q05-quota-filler'));
}

let cachedArchive;
let cachedCipher;

export async function portableFileAcceptance(browser, url, engine) {
  cachedArchive ||= await makeArchive();
  cachedCipher ||= await encryptProject(cachedArchive, PASSWORD);
  const archive = cachedArchive;
  const first = archive.versionHistory.entries[0];
  const last = archive.versionHistory.entries.at(-1);
  const mobile = engine === 'WebKit';
  const context = await browser.newContext({
    locale: 'de-DE',
    viewport: mobile ? { width: 375, height: 812 } : { width: 1280, height: 800 },
    acceptDownloads: true
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await openSave(page, mobile);
    await importJson(page, archive);

    // A normal no-change Save must keep all archived binary payloads, checksums,
    // dates and IDs byte-for-byte instead of building a new technical history.
    const exported = await savedDownload(page);
    assert.equal(exported.lastSavedAt, archive.lastSavedAt);
    assert.deepEqual(exported.events, archive.events);
    assert.deepEqual(exported.versionHistory, archive.versionHistory);
    assert.equal((await readPortableVersion(exported, first.id)).community.name, 'Q05 Archiv 00');
    assert.equal((await readPortableVersion(exported, last.id)).community.name, 'Q05 Archiv 34');
    assert.equal(exported.events.find(e => e.id === 'payment').amountCents, 1248);
    assert.equal(exported.events.find(e => e.id === 'departure').date, '2027-01-12');

    // The same JSON opens in another browser profile with no shared cache.
    const another = await browser.newContext({ locale: 'de-DE', acceptDownloads: true });
    try {
      const otherPage = await another.newPage();
      await otherPage.goto(url);
      assert.equal(await otherPage.evaluate(key => localStorage.getItem(key), STORAGE_KEY), null);
      await openSave(otherPage);
      await importJson(otherPage, exported);
      assert.deepEqual((await savedDownload(otherPage)).versionHistory, archive.versionHistory);
    } finally { await another.close(); }

    // Reject stale/invalid formats and malformed files, without changing the
    // already loaded and valid current project or silently migrating formats.
    await openSave(page, mobile);
    await rejectedImport(page, { ...archive, schemaVersion: 0 }, /Nicht unterstütztes Projektformat/);
    await rejectedImport(page, { ...archive, versionHistory: undefined }, /Nicht unterstütztes Projektformat/);
    await rejectedImport(page, '{ invalid json', /Öffnen fehlgeschlagen/);
    assert.equal(await page.locator('.header-context').innerText().then(t => t.includes('Q05 Archiv 35')), true);
    assert.deepEqual((await savedDownload(page)).versionHistory, archive.versionHistory);

    if (engine === 'Chromium') {
      await openSave(page);
      await exerciseQuota(page, archive.versionHistory.entries.length);
    }
    assert.deepEqual(errors, [], engine + ' JavaScript errors');
  } finally { await context.close(); }

  // An encrypted whole-file transfer uses an independent new context and
  // never writes the decrypted version archive into localStorage.
  assert.equal(JSON.stringify(cachedCipher).includes('portable-v1'), false);
  const secured = await browser.newContext({ locale: 'de-DE', acceptDownloads: true });
  try {
    const page = await secured.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await openSave(page);
    await page.getByRole('button', { name: /Passwortgeschützte Dateien verwalten/ }).click();
    await page.getByLabel('Passwort für diese Datei').fill(PASSWORD);
    await page.locator('.storage-choices input[accept=".json,.enc"]').setInputFiles({
      name: 'q05.crypt.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(cachedCipher))
    });
    await page.locator('.header-context').getByText('Q05 Archiv 35').waitFor();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY), null,
      'Never cache a decrypted protected project');

    // Restore an older archived state, then save encrypted again, preserving
    // the old snapshot and archiving the previously current version.
    await openSave(page);
    await page.locator('section[aria-label="Gespeicherte Dateiversionen"] select')
      .selectOption({ index: 1 });
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Als ungespeicherten Arbeitsstand wiederherstellen' }).click();
    await page.locator('.header-context').getByText('Q05 Archiv 34').waitFor();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    const encryptedSave = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
    assert.equal(encryptedSave.format, 'hausstand-aesgcm-v1');
    assert.equal(JSON.stringify(encryptedSave).includes('Q05 Archiv 34'), false);
    const decrypted = (await decryptProject(encryptedSave, PASSWORD)).project;
    assert.equal(decrypted.community.name, 'Q05 Archiv 34');
    assert.equal(decrypted.versionHistory.entries.length, 36);
    assert.equal((await readPortableVersion(decrypted, first.id)).community.name, 'Q05 Archiv 00');
    assert.equal(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY), null);
    assert.deepEqual(errors, [], engine + ' encrypted page errors');
  } finally { await secured.close(); }
  console.log('Q05 ' + engine + ': portable JSON, invalid import, independent profile, ' +
    'archive SHA-256 and encrypted restore/re-save passed' + (engine === 'Chromium' ? ', quota tested' : ''));
}
