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
  // Q10: date controls are opt-in, remain across pages and reset on reload.
  assert.equal(await page.locator('#time-travel-panel').count(), 0);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#time-travel-panel').count(), 0);
  await page.getByRole('button', { name: 'Stichtag wählen' }).click();
  assert.equal(await page.locator('#time-travel-panel').isVisible(), true);
  await page.locator('#state-date').fill('2025-01-02');
  assert.equal(await page.locator('#state-date').inputValue(), '2025-01-02');
  await openFinance(page);
  assert.equal(await page.locator('#time-travel-panel').isVisible(), true);
  await page.getByRole('button', { name: 'Zurück zu heute' }).click();
  assert.equal(await page.locator('#time-travel-panel').count(), 0);
  await page.getByRole('button', { name: 'Stichtag wählen' }).click();
  await page.locator('#state-date').fill('2025-01-02');
  await page.reload();
  assert.equal(await page.locator('#time-travel-panel').count(), 0);
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

// Q03: The real UI is the system under test. Do not manufacture balances or
// call domain functions to assert results: inspect the rendered ledger after
// purchases, completed payments, edits, deletions and ownership changes.
async function settlementEndToEnd(browser, url) {
  const context = await browser.newContext({
    locale: 'de-DE', viewport: { width: 1280, height: 850 }, acceptDownloads: true
  });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  const readProject = () => page.evaluate(storageKey => {
    const record = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return record.project;
  }, key);
  const visitActivity = async () => {
    await page.locator('.sidebar-links').getByRole('button', { name: /Änderungen/ }).click();
  };
  const closeDialog = async () => {
    await page.locator('[role="dialog"]').waitFor({ state: 'hidden' });
  };
  const openEvent = async (needle) => {
    await visitActivity();
    const card = page.locator('.timeline-event-card').filter({ hasText: needle });
    assert.equal(await card.count(), 1, 'Expected exactly one event containing ' + needle);
    await card.locator('.edit-button').click();
    return page.locator('[role="dialog"]');
  };
  const assertBalances = async expected => {
    await openFinance(page);
    // Assert every person, direction, cents and absence of extraneous rows.
    // A zero balance is intentionally not displayed in the ledger.
    await page.waitForFunction(expectedBalances => {
      const rows = [...document.querySelectorAll('.person-balance-row')];
      const nonzero = Object.entries(expectedBalances).filter(([, cents]) => cents !== 0);
      if (rows.length !== nonzero.length) return false;
      return rows.every(row => {
        const name = row.querySelector('.person-balance-name')?.textContent?.trim();
        const amount = row.querySelector('.person-balance-amount');
        const raw = amount?.querySelector('strong')?.textContent || '';
        const cents = Math.round(Number(raw.replace(/[^0-9,.-]/g, '')
          .replace(/\./g, '').replace(',', '.')) * 100);
        const direction = amount?.textContent?.includes('Erhält') ? 1 :
          amount?.textContent?.includes('Gleicht aus') ? -1 : 0;
        return Object.hasOwn(expectedBalances, name) &&
          expectedBalances[name] === direction * cents;
      });
    }, expected, { timeout: 10000 }).catch(async error => {
      const rendered = await page.locator('.person-balance-row').allTextContents();
      throw new Error('Expected ledger ' + JSON.stringify(expected) +
        ', rendered ' + JSON.stringify(rendered) + ': ' + error.message);
    });
    const sum = Object.values(expected).reduce((a, b) => a + b, 0);
    assert.equal(sum, 0, 'Test fixture expectations must remain zero-sum');
  };
  const setDate = async date => {
    const panel = page.locator('#time-travel-panel');
    if (!(await panel.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Stichtag wählen' }).click();
    }
    await page.locator('#state-date').fill(date);
    assert.equal(await page.locator('#state-date').inputValue(), date);
  };
  const returnToday = async () => {
    await page.getByRole('button', { name: 'Zurück zu heute' }).click();
    assert.equal(await page.locator('#time-travel-panel').count(), 0);
  };
  const makePayment = async (payer, recipient, amount, date, note, suggested = false) => {
    await openFinance(page);
    if (suggested) {
      const proposal = page.locator('.transfer-row').filter({ hasText: 'Ben zahlt an Anna' });
      assert.equal(await proposal.count(), 1);
      await proposal.getByRole('button', { name: 'Ausgleichen' }).click();
    } else {
      await page.getByRole('button', { name: 'Zahlung erfassen', exact: true }).click();
    }
    const dialog = page.getByRole('dialog', { name: 'Ausgleich dokumentieren' });
    if (suggested) {
      assert.equal(await dialog.getByLabel('Wer hat bezahlt?').inputValue(), payer);
      assert.equal(await dialog.getByLabel('Wer hat das Geld erhalten?').inputValue(), recipient);
      assert.equal(await dialog.getByLabel('Gezahlter Betrag in Euro').inputValue(), String(amount) + ',00');
    }
    await dialog.getByLabel('Wer hat bezahlt?').selectOption(payer);
    await dialog.getByLabel('Wer hat das Geld erhalten?').selectOption(recipient);
    await dialog.getByLabel('Gezahlter Betrag in Euro').fill(String(amount));
    await dialog.locator('input[type=date]').fill(date);
    await dialog.locator('textarea').fill(note);
    await dialog.getByRole('button', { name: 'Zahlung als erfolgt erfassen' }).click();
    await closeDialog();
  };

  try {
    // A: Create the purchase through the actual UI, then settle it completely.
    await page.goto(url);
    const empty = structuredClone(fixture);
    empty.community.name = 'Q03 Browser-Wertausgleich';
    empty.items = [];
    empty.events = empty.events.filter(event => event.type === 'person-added');
    await page.evaluate(({ storageKey, copy }) => {
      localStorage.setItem(storageKey, JSON.stringify(copy));
    }, { storageKey: key, copy: oneSaved(empty) });
    await page.reload();
    await page.getByText('Q03 Browser-Wertausgleich').first().waitFor();
    await setDate('2025-01-02');
    await page.locator('.page-heading').getByRole('button', { name: /Gegenstand hinzufügen/ }).click();
    const purchase = page.locator('[role="dialog"]');
    await purchase.locator('.form-grid > label').first().locator('input').fill('Q03 Kühlschrank');
    await purchase.locator('input[type=number][step="0.01"]').first().fill('300');
    await purchase.locator('select').filter({ has: page.locator('option[value="fixed"]') })
      .first().selectOption('fixed');
    await purchase.locator('select').filter({ has: page.locator('option[value="anna"]') })
      .last().selectOption('anna');
    await purchase.locator('.modal-footer button.primary').click();
    await closeDialog();
    const afterPurchase = await readProject();
    const itemEvent = afterPurchase.events.find(event => event.type === 'item-added');
    assert.equal(itemEvent?.date, '2025-01-02');
    assert.equal(itemEvent?.initialValue, 300);
    assert.equal(itemEvent?.financedByPersonId, 'anna');
    assert.deepEqual(itemEvent?.shares, { anna: 1, ben: 1, clara: 1 });
    await returnToday();
    await assertBalances({ Anna: 20000, Ben: -10000, Clara: -10000 });

    await makePayment('ben', 'anna', 60, '2025-01-03', 'Q03 Ben 60', true);
    await assertBalances({ Anna: 14000, Ben: -4000, Clara: -10000 });
    await setDate('2025-01-02');
    await assertBalances({ Anna: 20000, Ben: -10000, Clara: -10000 });
    await setDate('2025-01-03');
    await assertBalances({ Anna: 14000, Ben: -4000, Clara: -10000 });
    await returnToday();

    await makePayment('clara', 'anna', 100, '2025-01-04', 'Q03 Clara 100');
    await assertBalances({ Anna: 4000, Ben: -4000, Clara: 0 });
    await makePayment('ben', 'anna', 40, '2025-01-05', 'Q03 Ben 40');
    await assertBalances({ Anna: 0, Ben: 0, Clara: 0 });
    // An overpayment becomes a reversed receivable, never discarded/capped.
    await makePayment('ben', 'anna', 25, '2025-01-06', 'Q03 overpayment');
    await assertBalances({ Anna: -2500, Ben: 2500, Clara: 0 });
    await makePayment('anna', 'ben', 25, '2025-01-07', 'Q03 reverse claim');
    await assertBalances({ Anna: 0, Ben: 0, Clara: 0 });

    // Change an acquisition retroactively. Completed payments keep their
    // original amount/date/identity while only derived claims recalculate.
    const beforeEdit = await readProject();
    const paymentsBefore = beforeEdit.events.filter(event =>
      event.type === 'claim-settlement-recorded');
    const purchaseEdit = await openEvent('Q03 Kühlschrank');
    await purchaseEdit.locator('input[type=number][step="0.01"]').first().fill('330');
    await purchaseEdit.locator('.modal-footer button.primary').click();
    await closeDialog();
    await assertBalances({ Anna: 2000, Ben: -1000, Clara: -1000 });
    const afterEdit = await readProject();
    assert.deepEqual(afterEdit.events.filter(event =>
      event.type === 'claim-settlement-recorded'), paymentsBefore,
      'Recorded money must survive edits to the underlying purchase unchanged');

    const paymentEdit = await openEvent('Q03 Ben 60');
    assert.equal(await paymentEdit.locator('input[type=date]').inputValue(), '2025-01-03');
    await paymentEdit.locator('input[inputmode=decimal]').fill('50');
    await paymentEdit.locator('.modal-footer button.primary').click();
    await closeDialog();
    await assertBalances({ Anna: 3000, Ben: -2000, Clara: -1000 });
    const editedPayments = (await readProject()).events.filter(event =>
      event.type === 'claim-settlement-recorded');
    assert.equal(editedPayments.length, 5);
    assert.equal(editedPayments.find(event => event.note === 'Q03 Ben 60')?.amountCents, 5000);
    assert.equal(editedPayments.find(event => event.note === 'Q03 Ben 60')?.id,
      paymentsBefore.find(event => event.note === 'Q03 Ben 60')?.id);

    const removePayment = await openEvent('Q03 Ben 60');
    await removePayment.locator('.modal-footer button.danger').click();
    await closeDialog();
    await assertBalances({ Anna: 8000, Ben: -7000, Clara: -1000 });
    assert.equal((await readProject()).events.filter(event =>
      event.type === 'claim-settlement-recorded').length, 4);

    const removePurchase = await openEvent('Q03 Kühlschrank');
    await removePurchase.locator('.modal-footer button.danger').click();
    await closeDialog();
    await assertBalances({ Anna: -14000, Ben: 4000, Clara: 10000 });
    const afterRemoval = await readProject();
    assert.equal(afterRemoval.events.some(event => event.type === 'item-added'), false);
    assert.equal(afterRemoval.events.filter(event =>
      event.type === 'claim-settlement-recorded').length, 4);

    // B: Paid and gifted ownership changes must have different financial
    // effects. A group-agreed payment can go to a different recipient.
    const ownership = await context.newPage();
    ownership.on('pageerror', error => failures.push(error.message));
    await bootFixture(ownership, url);
    await ownership.locator('.sidebar-links').getByRole('button', { name: /Änderungen/ }).click();
    await ownership.locator('.timeline-event-card')
      .filter({ hasText: 'Kühlschrank' }).locator('.entity-link').first().click();
    const changeShares = async (first, second, mode) => {
      await ownership.getByRole('button', { name: 'Eigentumsanteile ändern' }).click();
      const modal = ownership.locator('[role="dialog"]');
      await modal.locator('.share-row').nth(0).locator('input[type=number]').fill(first);
      await modal.locator('.share-row').nth(1).locator('input[type=number]').fill(second);
      await modal.locator('select').last().selectOption(mode);
      await modal.locator('.modal-footer button.primary').click();
      await modal.waitFor({ state: 'hidden' });
    };
    await changeShares('0', '2', 'derived');
    await openFinance(ownership);
    await ownership.waitForFunction(() => {
      const rendered = [...document.querySelectorAll('.person-balance-row')]
        .map(row => row.textContent.replace(/\s+/g, ' '));
      return rendered.length === 3 && rendered.some(x => x.includes('Anna') && x.includes('300,00')) &&
        rendered.some(x => x.includes('Ben') && x.includes('200,00')) &&
        rendered.some(x => x.includes('Clara') && x.includes('100,00'));
    });
    await ownership.locator('.sidebar-links').getByRole('button', { name: /Änderungen/ }).click();
    await ownership.locator('.timeline-event-card')
      .filter({ hasText: 'Kühlschrank' }).first().locator('.entity-link').first().click();
    // Anna has zero shares after the paid transfer, so the remaining rows
    // are Ben and Clara. Gift one of Ben's units to Clara.
    await changeShares('1', '2', 'none');
    await openFinance(ownership);
    await ownership.waitForFunction(() => {
      const rendered = [...document.querySelectorAll('.person-balance-row')]
        .map(row => row.textContent.replace(/\s+/g, ' '));
      return rendered.length === 3 && rendered.some(x => x.includes('Anna') && x.includes('300,00')) &&
        rendered.some(x => x.includes('Ben') && x.includes('200,00')) &&
        rendered.some(x => x.includes('Clara') && x.includes('100,00'));
    });
    await ownership.getByRole('button', { name: 'Zahlung erfassen', exact: true }).click();
    const groupPayment = ownership.getByRole('dialog', { name: 'Ausgleich dokumentieren' });
    await groupPayment.getByLabel('Wer hat bezahlt?').selectOption('ben');
    await groupPayment.getByLabel('Wer hat das Geld erhalten?').selectOption('clara');
    await groupPayment.getByLabel('Gezahlter Betrag in Euro').fill('50');
    await groupPayment.locator('input[type=date]').fill('2025-01-05');
    await groupPayment.locator('textarea').fill('Q03 vereinbarte Gruppensaldierung');
    await groupPayment.getByRole('button', { name: 'Zahlung als erfolgt erfassen' }).click();
    await groupPayment.waitFor({ state: 'hidden' });
    await ownership.waitForFunction(() => {
      const rendered = [...document.querySelectorAll('.person-balance-row')]
        .map(row => row.textContent.replace(/\s+/g, ' '));
      return rendered.length === 3 && rendered.some(x => x.includes('Anna') && x.includes('300,00')) &&
        rendered.some(x => x.includes('Ben') && x.includes('150,00')) &&
        rendered.some(x => x.includes('Clara') && x.includes('150,00'));
    });
    const secondCopy = await ownership.evaluate(storageKey =>
      JSON.parse(localStorage.getItem(storageKey)).project, key);
    assert.deepEqual(secondCopy.events.filter(e => e.type === 'shares-set')
      .map(e => e.financialMode), ['derived', 'none']);
    assert.equal(secondCopy.events.filter(e => e.type === 'claim-settlement-recorded').length, 1);
    assert.deepEqual(failures, [], 'No browser page errors are permitted');
    await ownership.close();
    console.log('Browser Q03 QA: purchased shares, complete/partial/over-payments, ' +
      'counterclaims, historical dates, edits/deletes, paid/gifted transfers and group settlement passed');
  } finally {
    await context.close();
  }
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
  await settlementEndToEnd(browser, offlineServer.url);
  await phpOnline(browser);
} catch (error) {
  console.error('Real-browser QA failed:', error);
  throw error;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
