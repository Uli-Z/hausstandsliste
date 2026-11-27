import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { appState } from '../src/stores/projectStore.js';
import { setLanguage } from '../src/lib/i18n.js';
import { notifications } from '../src/lib/notifications.js';

test('Q37: read-only blocks all writing dialog entries and preserves an open draft on permission loss', () => {
  notifications.clear();
  const lastError = () => get(notifications).filter(n=>n.kind==='error').at(-1)?.message;
  try {
    setLanguage('en');
    appState.setReadOnly(true, 'Another session holds the checkout.');
    const before = get(appState);
    for (const type of ['personAdd','personMeta','personStatus','itemAdd','itemMeta','itemEnd','itemContinue','shareSet','redistributionEdit','executedRedistributionEdit','eventEdit','settlementAdd','settlementEdit','futureWritingDialog']) {
      appState.setDialog({ type, id: 'draft' });
      assert.equal(get(appState), before, type + ' must not change state');
      assert.match(lastError(), /read-only.*top right/s);
      assert.match(lastError(), /Another session/);
    }
    appState.startRedistribution();
    assert.equal(get(appState), before);
    assert.equal(appState.requireEditing(), false);
    assert.equal(appState.mutateProject(() => assert.fail('mutation called')), false);
    appState.setDialog({type:'options'});
    assert.equal(get(appState).activeDialog.type, 'options');
    appState.closeDialog();
    appState.setRoute({page:'person',id:'anna'});
    assert.equal(get(appState).route.page, 'person');
    appState.setReadOnly(false);
    assert.equal(appState.requireEditing(), true);
    assert.equal(get(appState).readOnlyReason, '');
    const parent = {type:'personStatus',personId:'anna'};
    const draft = {type:'itemAdd',id:'unfinished',returnTo:parent};
    appState.setDialog(draft);
    const open = get(appState);
    setLanguage('de');
    appState.setReadOnly(true, 'Checkout abgelaufen');
    const locked = get(appState);
    assert.equal(locked.activeDialog, draft);
    assert.equal(locked.dialogRevision, open.dialogRevision);
    assert.match(lastError(), /schreibgeschützt.*oben rechts/s);
    assert.match(lastError(), /Checkout abgelaufen/);
    appState.setDialog({type:'personAdd'});
    assert.equal(get(appState), locked);
    assert.equal(appState.mutateProject(() => assert.fail('mutation called')), false);
    appState.closeDialog();
    assert.equal(get(appState).activeDialog, null);
    appState.setReadOnly(false);
    appState.startRedistribution('Allowed');
    assert.equal(get(appState).activeDialog.type, 'redistributionEdit');
  } finally {
    appState.setReadOnly(false);
    appState.closeDialog();
    setLanguage('auto');
    notifications.clear();
  }
});


test('Q37: PHP main-file session checks leases and revokes access without replacing an open form', () => {
  const source = readFileSync(new URL('../ui-v3/ServerSession.svelte', import.meta.url),'utf8');
  assert.ok(source.includes('await api(\'renew\', {})'));
  assert.ok(source.includes('window.setInterval(checkLease, leaseCheckInterval)'));
  assert.ok(source.includes("document.visibilityState !== 'visible'"));
  assert.ok(source.includes('Date.now() >= leaseExpires * 1000'));
  assert.ok(source.includes('appState.setReadOnly(true, reason)'));
  assert.ok(source.includes('window.clearInterval(timer)'));
});
