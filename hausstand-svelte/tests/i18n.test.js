import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLocale, dictionaries, message, loadLanguage, formatMoney, formatDate, parseDecimal, pluralMessage, LANGUAGE_KEY } from '../src/lib/i18n.js';

test('Q13: automatic language honors primary subtag and manual override', () => {
  for (const tag of ['de', 'de-DE', 'de-AT', 'de-CH']) assert.equal(resolveLocale('auto',[tag]),'de');
  assert.equal(resolveLocale('auto',['en-GB','de-DE']),'en');
  assert.equal(resolveLocale('auto',['fr-FR']),'en');
  assert.equal(resolveLocale('en',['de-DE']),'en');
  assert.equal(resolveLocale('de',['en-US']),'de');
});
test('Q13: two complete dictionaries and English fallback for unknown locale', () => {
  for (const key of Object.keys(dictionaries.en)) assert.ok(dictionaries.de[key]?.length,key);
  assert.equal(message('nav.people','de'),'Personen');
  assert.equal(message('nav.people','en'),'People');
  assert.equal(message('nav.people','fr'),'People');
});
test('Q13: local browser preference is validated', () => {
  assert.equal(loadLanguage({ getItem(key) { assert.equal(key,LANGUAGE_KEY);return 'de'; } }), 'de');
  assert.equal(loadLanguage({ getItem() { return 'fr'; } }), 'auto');
  assert.equal(loadLanguage({ getItem() { throw Error('quota'); } }), 'auto');
});
test('Q13: locale-sensitive display and comma/point parsing preserve values', () => {
  assert.match(formatMoney(1234.56,'de'),/1\.234,56/);
  assert.match(formatMoney(1234.56,'en'),/1,234\.56/);
  assert.notEqual(formatDate('2026-11-23','en'),formatDate('2026-11-23','de'));
  for (const number of ['1234,56','1234.56','1.234,56','1,234.56']) assert.equal(parseDecimal(number),1234.56);
  assert.ok(Number.isNaN(parseDecimal('1,2,3')));
});

test('Q13: plural categories follow the active language', () => {
  assert.equal(pluralMessage('people.itemCount', 1, 'en'), '1 item');
  assert.equal(pluralMessage('people.itemCount', 2, 'en'), '2 items');
  assert.equal(pluralMessage('people.itemCount', 1, 'de'), '1 Gegenstand');
  assert.equal(pluralMessage('people.itemCount', 2, 'de'), '2 Gegenstände');
  assert.match(pluralMessage('timeline.future', 1, 'de'), /zukünftiges Ereignis/);
});
