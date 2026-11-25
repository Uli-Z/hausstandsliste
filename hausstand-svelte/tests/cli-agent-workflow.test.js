import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/hausstand.mjs', import.meta.url));

// Black-box agent contract: no domain imports, fixture IDs or private helpers.
// Follow only commands and payloads advertised in the exported skill.
test('agent discovers skill, creates household, settles a purchase and restores a version', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hausstand-agent-'));
  try {
    const call = (args, payload) => spawnSync(process.execPath, [bin, ...args], {
      cwd: dir, encoding: 'utf8',
      input: payload === undefined ? undefined : JSON.stringify(payload),
      env: { ...process.env, HAUSSTAND_PASSWORD: '' }
    });
    const ok = (args, payload) => {
      const r = call(args, payload);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stderr, '');
      return r.stdout;
    };
    const data = (args, payload) => {
      const r = JSON.parse(ok(args, payload));
      assert.equal(r.responseVersion, 1);
      return r.data;
    };
    const help = ok(['--help']);
    assert.match(help, /skill export --output/);
    const skillPath = join(dir, 'SKILL.md');
    ok(['skill', 'export', '--output', skillPath]);
    const skill = readFileSync(skillPath, 'utf8');
    assert.equal(skill, ok(['skill', 'show']));
    for (const command of ['project create', 'people add', 'people list', 'items add',
      'balances show', 'payments record', 'versions list', 'versions restore', 'project validate']) {
      assert.ok(skill.includes(command), 'Missing skill command: ' + command);
    }

    let current = join(dir, 'initial.json');
    data(['project', 'create', '--payload', '-', '--output', current], { name: 'Agent household' });
    let index = 0;
    const mutate = (command, payload, confirm = false) => {
      const next = join(dir, 'step-' + (++index) + '.json');
      const previous = readFileSync(current);
      const args = [...command, '--input', current, '--payload', '-'];
      assert.equal(data([...args, '--dry-run'], payload).saved, false);
      assert.equal(existsSync(next), false);
      if (confirm) {
        const rejected = call([...args, '--output', next], payload);
        assert.equal(rejected.status, 2);
        assert.equal(rejected.stdout, '');
        assert.equal(existsSync(next), false);
      }
      assert.equal(data([...args, '--output', next, ...(confirm ? ['--confirm'] : [])], payload).saved, true);
      assert.deepEqual(readFileSync(current), previous);
      current = next;
      assert.equal(data(['project', 'validate', '--input', current]).valid, true);
    };
    const date = '2026-01-01';
    for (const name of ['Anna', 'Ben', 'Clara']) mutate(['people', 'add'], { name });
    const people = data(['people', 'list', '--input', current, '--as-of', date]).rows;
    const ids = Object.fromEntries(people.map(person => [person.name, person.id]));
    assert.equal(Object.keys(ids).length, 3);
    const purchaseDate = '2026-01-02';
    mutate(['items', 'add'], {
      name: 'Shared table', date: purchaseDate, initialValueCents: 30000,
      valuation: { type: 'fixed', minimumValueCents: 0 },
      shares: { [ids.Anna]: 1, [ids.Ben]: 1, [ids.Clara]: 1 },
      purchaseContributionsCents: {[ids.Anna]:30000}
    });
    const purchaseFile = current;
    const balances = asOf => Object.fromEntries(
      data(['balances', 'show', '--input', current, '--as-of', asOf]).balances
        .map(row => [row.personId, row.balanceCents])
    );
    const expected = (a, b, c) => ({ [ids.Anna]: a, [ids.Ben]: b, [ids.Clara]: c });
    assert.deepEqual(balances(date), expected(0, 0, 0));
    assert.deepEqual(balances(purchaseDate), expected(20000, -10000, -10000));
    const paymentDate = '2026-01-03';
    const pay = (name, amountCents) => mutate(['payments', 'record'], {
      date: paymentDate, amountCents, debtorPersonId: ids[name],
      creditorPersonId: ids.Anna, settlementKind: 'paid'
    }, true);
    pay('Ben', 6000);
    assert.deepEqual(balances(paymentDate), expected(14000, -4000, -10000));
    pay('Clara', 10000);
    pay('Ben', 4000);
    assert.deepEqual(balances(paymentDate), expected(0, 0, 0));
    assert.deepEqual(balances(purchaseDate), expected(20000, -10000, -10000));
    const settledFile = current;

    // Find the pre-payment snapshot by inspecting archived previews, not by assuming
    // the order of archive entries or predicting their generated IDs.
    const purchase = data(['project', 'show', '--input', purchaseFile]);
    const archive = data(['versions', 'list', '--input', current]).rows;
    assert.equal(archive.length, 7);
    const snapshot = archive.find(entry => {
      const preview = data(['versions', 'restore', '--input', current, '--id', entry.id, '--dry-run']);
      return JSON.stringify(preview.project.events) === JSON.stringify(purchase.events);
    });
    assert.ok(snapshot, 'Purchase-only state must be recoverable');
    const beforeRestore = readFileSync(settledFile);
    current = join(dir, 'restored.json');
    data(['versions', 'restore', '--input', settledFile, '--id', snapshot.id, '--output', current]);
    assert.deepEqual(readFileSync(settledFile), beforeRestore);
    assert.equal(data(['project', 'validate', '--input', current]).valid, true);
    assert.deepEqual(balances(paymentDate), expected(20000, -10000, -10000));
    assert.equal(data(['versions', 'list', '--input', current]).total, 8);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
