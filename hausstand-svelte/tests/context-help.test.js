import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('context help can be discovered and dismissed via touch and keyboard', () => {
  const tip = source('src/components/HelpTip.svelte');
  assert.match(tip, /aria-label=\{label\}/);
  assert.match(tip, /aria-expanded=\{open\}/);
  assert.match(tip, /aria-controls=\{open \? popupId : undefined\}/);
  assert.match(tip, /aria-describedby=\{open \? popupId : undefined\}/);
  assert.match(tip, /id=\{popupId\}/);
  assert.match(tip, /role="tooltip"/);
  assert.match(tip, /event\.key === 'Escape'/);
  assert.match(tip, /event\.stopPropagation\(\)/);
  assert.match(tip, /close\(true\)/);
  assert.match(tip, /on:click=\{toggle\}/);
  assert.match(tip, /on:scroll\|capture=\{onWindowScroll\}/);
  assert.match(tip, /popup\?\.contains\(event\.target\)/);
  assert.match(tip, /availableAbove > availableBelow/);
  assert.match(tip, /popup\.scrollHeight/);
  assert.match(tip, /label !== openedForLabel/);
  assert.match(tip, /:focus-visible/);
});

test('redundant help icons are removed while meaningful explanations and warnings remain', () => {
  const app = source('ui-v3/App.svelte');
  const save = app.slice(app.indexOf("{:else if activeSection === 'save'}"), app.indexOf("{:else if activeSection === 'settings'}"));
  assert.equal((save.match(/<HelpTip/g) || []).length, 0, 'the saving task is explained directly without redundant help buttons');
  const storage = source('ui-v3/StorageView.svelte');
  assert.equal((storage.match(/<HelpTip/g) || []).length, 1, 'only online collaboration needs contextual help');
  assert.match(storage, /storage\.openExplanation/);
  const settings = app.slice(app.indexOf("{:else if activeSection === 'settings'}"), app.indexOf("{/key}"));
  assert.ok(!settings.includes("<HelpTip label={$translate('language.title')}"));
  assert.ok(!settings.includes('ui.what-happens-when-starting-a-new-p-8ivv1x'));
  assert.ok(settings.includes('inline-info warning'));
  assert.ok(app.includes('ui.how-are-settlement-suggestions-cal-6ze5l4'));
  assert.ok(app.includes('ui.what-does-value-settlement-mean-9p85pk'));
  const payment = source('src/components/SettlementDialog.svelte');
  assert.ok(payment.includes('ui.has-this-payment-already-been-made-120a38k'));
  assert.ok(!payment.includes('ui.what-does-confirmation-mean-1c76cot'));
  assert.ok(payment.includes('ui.what-happens-when-recording-this-ni3kz3'));
  const redistribution = source('ui-v3/ExecutedRedistributionEditDialog.svelte');
  assert.ok(!redistribution.includes('class="workflow-help"'));
  assert.ok(redistribution.includes('ui.what-is-the-financial-effect-of-thi-g85db9'));
});


test('Q17: long help is keyboard-scrollable without an extra tab stop or page scroll', () => {
  const tip=source('src/components/HelpTip.svelte');
  assert.match(tip,/on:focusin=\{onWindowFocus\}/);
  assert.match(tip,/!root\.contains\(event\.target\)\) close\(\)/);
  assert.match(tip,/event\.target !== trigger/);
  assert.match(tip,/popup\.scrollHeight <= popup\.clientHeight/);
  assert.match(tip,/popup\.scrollTop \+= increments\[event\.key\]/);
  assert.match(tip,/ArrowDown: 32, ArrowUp: -32/);
  assert.match(tip,/event\.key === 'Home' \|\| event\.key === 'End'/);
  assert.match(tip,/@media \(pointer:coarse\).*min-width:44px;min-height:44px/);
});
