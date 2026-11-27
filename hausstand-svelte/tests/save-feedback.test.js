import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmedSave, mailFeedback } from '../src/lib/saveFeedback.js';
import { dictionaries } from '../src/lib/i18n.js';

test('Q42 save confirmation is independent of mail failure', () => {
  const result = {saveStatus:'saved',revision:2,mailStatus:'failed',mailErrorCode:'rejected',mailRetryable:true};
  assert.equal(confirmedSave(result),true);
  assert.deepEqual(mailFeedback(result),{key:'mail.rejected',kind:'warning',retryable:true});
  for (const value of [{ok:false,revision:2},{saveStatus:'saved',revision:0},{mailStatus:'accepted',revision:2},null])
    assert.equal(confirmedSave(value),false);
});
test('Q42 mail submission is not delivery; unknown status is never success', () => {
  assert.deepEqual(mailFeedback({mailStatus:'accepted'}),{key:'mail.accepted',kind:'success',retryable:false});
  assert.equal(mailFeedback({mailStatus:'disabled'}).kind,'info');
  assert.equal(mailFeedback({mailStatus:'unknown',mailRetryable:true}).retryable,false);
  assert.equal(mailFeedback({}).key,'mail.unknown');
  assert.equal(mailFeedback({mailStatus:'failed',mailErrorCode:'private-path-or-secret'}).key,'mail.failed');
  for (const code of ['configuration','preparation','unavailable','rejected','pending','cooldown']) {
    const {key,kind}=mailFeedback({mailStatus:'failed',mailErrorCode:code});
    assert.equal(kind,'warning');
    assert.ok(dictionaries.en[key]);
    assert.ok(dictionaries.de[key]);
  }
  assert.match(dictionaries.en['mail.accepted'],/Delivery is not confirmed/);
  assert.match(dictionaries.de['mail.accepted'],/Zustellung ist nicht bestätigt/);
});

test('Q49 session feedback is not a second inline action-result channel', async () => {
  const {readFileSync}=await import('node:fs');
  const session=readFileSync(new URL('../ui-v3/ServerSession.svelte',import.meta.url),'utf8');
  const app=readFileSync(new URL('../ui-v3/App.svelte',import.meta.url),'utf8');
  assert.doesNotMatch(session,/export let feedback|feedbackError/);
  assert.doesNotMatch(app,/serverFeedback|bind:feedback/);
  assert.match(session,/sessionNotice\(committedResult \? 'session.finishOnly' : 'session.finishNoSave'\)/);
  assert.match(session,/finally \{[\s\S]*?if \(committedResult\) reportMail\(committedResult\)/);
  assert.match(dictionaries.en['session.finishNoSave'],/no new email backup/);
  assert.match(dictionaries.de['session.finishNoSave'],/keine neue E-Mail-Sicherung/);
});
