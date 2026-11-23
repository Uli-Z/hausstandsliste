// Q06 manual real-browser acceptance. Called only by browser-qa.mjs,
// which is behind workflow_dispatch (not run on each push).
import assert from 'node:assert/strict';

const key = 'hausstand_svelte_v07_working_copy';
const fixture = {
  schemaVersion: 1, appVersion: '0.7.0-svelte', currency: 'EUR',
  community: { name: 'Q06 Guardrails' },
  people: [{ id: 'anna', name: 'Anna' }, { id: 'ben', name: 'Ben' }],
  items: [{ id: 'table', name: 'Table' }],
  events: [
    { id: 'join-anna', type: 'person-added', personId: 'anna', name: 'Anna', date: '2026-01-01', order: 1 },
    { id: 'join-ben', type: 'person-added', personId: 'ben', name: 'Ben', date: '2026-01-01', order: 2 },
    { id: 'purchase', type: 'item-added', itemId: 'table', name: 'Table',
      date: '2026-01-02', order: 3, initialValue: 100,
      valuation: { type: 'fixed', minimumValue: 0 }, financialMode: 'derived',
      financedByPersonId: 'anna', shares: { anna: 1, ben: 1 } }
  ],
  drafts: [], lastSavedAt: '2026-01-02T09:00:00.000Z',
  versionHistory: { format: 'portable-v1', entries: [] }
};

export async function invalidInputAcceptance(browser, url) {
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 375, height: 812 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.evaluate(({ key, fixture }) => localStorage.setItem(key, JSON.stringify({
      project: fixture, savedProject: fixture, fileName: 'q06.json', dirty: false
    })), { key, fixture });
    await page.reload();
    await page.getByText('Q06 Guardrails').first().waitFor();

    const readProject = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).project, key);
    const openFinance = async () => page.locator('.mobile-bottom-nav')
      .getByRole('button', { name: /Geld/ }).click();
    await openFinance();
    const before = await readProject();
    await page.getByRole('button', { name: 'Zahlung erfassen', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Ausgleich dokumentieren' });
    const submit = dialog.getByRole('button', { name: 'Zahlung als erfolgt erfassen' });
    const amount = dialog.getByLabel('Gezahlter Betrag in Euro');
    const date = dialog.getByLabel('Zahlungsdatum');
    const payer = dialog.getByLabel('Wer hat bezahlt?');
    const recipient = dialog.getByLabel('Wer hat das Geld erhalten?');
    assert.equal(await submit.isDisabled(), true, 'no people/amount must disable save');

    await payer.selectOption('ben');
    await recipient.selectOption('anna');
    for (const invalid of ['0', '-1', '12.345', 'abc', '999999999999999999999']) {
      await amount.fill(invalid);
      assert.equal(await submit.isDisabled(), true, 'invalid amount accepted: ' + invalid);
    }
    await amount.fill('12,48');
    assert.equal(await submit.isEnabled(), true);
    await recipient.selectOption('ben');
    assert.equal(await submit.isDisabled(), true, 'same payer and recipient accepted');
    await dialog.getByText('Bitte zwei unterschiedliche Personen wählen.').waitFor();
    await recipient.selectOption('anna');
    await date.fill('');
    assert.equal(await submit.isDisabled(), true, 'blank date accepted');
    // Date controls sanitize an impossible date to empty; domain validation
    // separately covers dates that are injected/edited outside the native picker.
    await date.fill('2026-02-31').catch(() => date.fill(''));
    assert.equal(await submit.isDisabled(), true, 'impossible date accepted');
    assert.deepEqual((await readProject()).events, before.events,
      'invalid input must not change the project');

    // A future-dated payment is deliberate, must be recorded exactly once,
    // and must change the cutoff so the effect is visible.
    await date.fill('2032-03-20');
    await submit.evaluate(button => { button.click(); button.click(); });
    await dialog.waitFor({ state: 'hidden' });
    const payments = (await readProject()).events.filter(e => e.type === 'claim-settlement-recorded');
    assert.equal(payments.length, 1, 'double click created duplicate payment');
    assert.equal(payments[0].amountCents, 1248);
    assert.equal(payments[0].date, '2032-03-20');
    assert.match(await page.locator('.time-travel-selected-text strong').innerText(), /20\.03\.2032/);
    await page.getByRole('button', { name: 'Stichtag wählen' }).click();
    await page.locator('#state-date').waitFor();
    assert.equal(await page.locator('#state-date').inputValue(), '2032-03-20');

    // Move the as-of date earlier: future payment remains stored but has no
    // influence on the displayed balance. Return to its date to edit it.
    await page.locator('#state-date').fill('2026-02-20');
    await page.locator('.person-balance-row').filter({ hasText: 'Ben' }).getByText(/50,00/).waitFor();
    assert.equal(await page.locator('.audit-row').filter({ hasText: '12,48' }).count(), 0);
    await page.locator('#state-date').fill('2032-03-20');
    await page.locator('.audit-disclosure').first().locator('summary').click();
    await page.locator('.audit-row').filter({ hasText: '12,48' })
      .getByRole('button', { name: 'Bearbeiten' }).click();
    const edit = page.getByRole('dialog', { name: 'Ausgleich bearbeiten' });
    assert.equal(await edit.getByLabel('Zahlungsdatum').inputValue(), '2032-03-20',
      'opening an existing payment must preserve its date');
    await edit.getByLabel('Zahlungsdatum').fill('2032-03-19');
    await edit.getByRole('button', { name: 'Änderungen speichern' }).click();
    await edit.waitFor({ state: 'hidden' });
    assert.equal((await readProject()).events.find(e => e.type === 'claim-settlement-recorded').date,
      '2032-03-19', 'manual date change did not persist');
    assert.deepEqual(errors, []);
    console.log('Browser Q06 QA: invalid amounts/people/dates, unchanged rejection, double click, future cutoff and edit passed');
  } finally {
    await context.close();
  }
}
