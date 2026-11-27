import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allocateCents } from '../src/lib/ledger.js';
import { parseDecimal } from '../src/lib/i18n.js';

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('item creation keeps ownership/financing explicit and directly visible metadata fields', () => {
  const dialog = source('ui-v3/DialogRouter.svelte');
  const block = dialog.slice(
    dialog.indexOf("{:else if dialog.type === 'itemAdd' || dialog.type === 'itemContinue'}"),
    dialog.indexOf("{:else if dialog.type === 'itemMeta'}")
  );
  assert.ok(block.length > 0);
  for (const name of ['itemName', 'initialValue', 'ShareEditor', 'PurchaseFinancing', 'item-purchase-preview']) {
    assert.ok(block.includes(name), name);
  }
  assert.ok(block.indexOf('bind:value={itemName}') < block.indexOf('ShareEditor'));
  assert.ok(block.includes('bind:shares')); // PurchaseFinancing and neutral successor use the shared editor.
  const financing = source('ui-v3/PurchaseFinancing.svelte');
  assert.ok(financing.includes('<ShareEditor people={tablePeople} bind:shares allPeople={true} showAmounts={true}'));
  assert.ok(financing.includes('slot="amount"'));
  assert.ok(block.includes('<section class="item-extra-fields"'));
  assert.ok(block.includes('bind:value={valuationType}'));
  assert.ok(block.includes('bind:value={durationYears}'));
  assert.ok(block.includes('bind:value={annualRate}'));
  assert.ok(block.includes('bind:value={minimumValue}'));
  assert.ok(block.includes('bind:value={tags}'));
  assert.ok(block.includes('bind:value={note}'));
  assert.ok(block.includes('allowEqualize={true}'));
});

test('new items start without owners; changed dates preserve references and reject unknown participants', () => {
  const dialog = source('ui-v3/DialogRouter.svelte');
  assert.match(dialog,/let shares = \{\};/);
  assert.match(dialog,/if \(dialog.type === 'itemAdd' && draft\?\.type === 'item'\)/);
  assert.match(dialog,/shares = \{ \.\.\.\(draft.data.shares \|\| \{\}\) \}/);
  assert.match(dialog,/Object.keys\(normShares\(shares\)\).every\(id=>entryProjection.peopleById.has\(id\)\)/);
  const financing=source('ui-v3/PurchaseFinancing.svelte');
  assert.match(financing,/eligible = editing \? people : \(ownerPeople \|\| people\).filter\(p=>p.active !== false\)/);
  assert.match(financing,/Object.hasOwn\(shares,p.id\)/);
  assert.match(financing,/!eligible.some\(p=>p.id===payer\)/);
  assert.ok(dialog.includes('dateSharesRebased = true'));
  assert.ok(dialog.includes('ownersValid'));
  assert.ok(dialog.includes('itemCostValid'));
  assert.ok(dialog.includes('itemNameValid'));
  assert.ok(dialog.includes('disabled={!canSubmitDated || $appState.readOnly}'));
  assert.ok(dialog.includes('effectiveDate = draft?.data?.effectiveDate || asOfDate'));
  assert.ok(dialog.includes('purchaseContributionsCents = draft.data.purchaseContributionsCents'));
});

test('purchase preview uses the exact same cent allocator as the financial ledger', () => {
  const dialog = source('ui-v3/DialogRouter.svelte');
  assert.ok(dialog.includes("purchaseClaims as derivePurchaseClaims"));
  assert.ok(dialog.includes('derivePurchaseClaims(itemCostCents,purchaseShares,purchaseContributionsCents)'));
  assert.ok(dialog.includes('bind:checked={alreadySettled}'));
  assert.ok(dialog.includes("items.purchaseClaimRow"));
  assert.ok(dialog.includes("purchase.confirmActual"));
  assert.ok(dialog.includes("items.noPurchaseClaims"));
  const allocation = allocateCents(10001, {anna: 1, ben: 1, clara: 1});
  assert.deepEqual(allocation, {anna:3334, ben:3334, clara:3333});
  assert.equal(allocation.ben + allocation.clara, 6667);
  assert.equal(Object.values(allocateCents(10001, {anna:1})).reduce((a,b)=>a+b,0),10001);
});

test('share editor keeps editing, optional equal split and localized percentages', () => {
  const editor = source('ui-v3/ShareEditor.svelte');
  assert.ok(editor.includes('export let allowEqualize = false'));
  assert.ok(editor.includes('const selected = Object.keys(normShares(shares))'));
  assert.ok(editor.includes('shares = Object.fromEntries(selected.map(personId => [personId, 1]))'));
  assert.ok(editor.includes('class="share-person-name"'));
  assert.ok(!editor.includes('<select disabled>'));
  assert.ok(editor.includes('formatPercent('));
  assert.ok(editor.includes('onValue={value=>setShare(person.id,value)}'));
  assert.ok(editor.includes('onValue={value=>setShare(personId,value)}'));
  assert.ok(editor.includes('positiveOwnerCount === 1'));
});

test('redistribution starts with dated item changes and a meaningful preview', () => {
  const dialog = source('ui-v3/RedistributionDialog.svelte');
  const body = dialog.slice(dialog.indexOf('<div class="modal-body grid-redistribution">'),dialog.indexOf('<!-- Sub-Modals -->'));
  assert.ok(body.includes('bind:value={redistribution.effectiveDate}'));
  assert.ok(body.includes('bind:value={redistribution.financialMode}'));
  assert.ok(body.includes('<RedistributionItemList'));
  assert.ok(body.includes('<section class="redistribution-advanced"'));
  assert.ok(body.includes('redistribution-bulk-actions'));
  assert.ok(body.includes('redistribution-preview'));
  assert.ok(body.includes('preview.rows.length'));
  assert.ok(body.includes('preview.payments.length'));
  assert.ok(body.includes('redistribution.noPaymentRecorded'));
  assert.ok(!body.includes('redistribution-export'));
  assert.ok(dialog.includes('redistributionPreview(project, redistribution)'));
  assert.ok(dialog.includes('executeRedistribution(p, redistribution)'));
  assert.ok(source('src/lib/itemMutations.js').includes("createEvent('redistribution-executed',effectiveDate"));
  assert.ok(dialog.includes('disabled={!canExecute || $appState.readOnly}'));
  const list = source('src/components/RedistributionItemList.svelte');
  assert.ok(list.includes('class:is-changed={row.changed}'));
  assert.ok(!list.includes('class="badge"'));
});

test('new fields have complete English and German translations', () => {
  const strings = source('src/lib/i18n.js');
  for (const key of [
    'items.equalShares', 'items.selectOwner', 'items.enterName', 'items.moreDetails', 'items.purchasePreview',
    'items.purchaseSummary', 'items.purchaseClaims', 'items.purchaseClaimRow', 'items.purchaseNoPayment',
    'items.noPurchaseClaims', 'redistribution.moreActions', 'redistribution.titleExample',
    'redistribution.noItems', 'redistribution.claimEffect', 'redistribution.withoutClaims',
    'redistribution.noPaymentRecorded', 'redistribution.export', 'redistribution.selectItemFirst'
  ]) {
    assert.equal(strings.split('"' + key + '"').length - 1, 2, key);
  }
});

test('Q22: depreciation is always visible; optional metadata is directly visible', () => {
  const dialog = source('ui-v3/DialogRouter.svelte');
  const block = dialog.slice(
    dialog.indexOf("{:else if dialog.type === 'itemAdd' || dialog.type === 'itemContinue'}"),
    dialog.indexOf("{:else if dialog.type === 'itemMeta'}")
  );
  const visible = block.slice(0, block.indexOf('<section class="item-ownership-fields">'));
  const extra = block.slice(block.indexOf('<section class="item-extra-fields"'));
  for (const key of ['bind:value={valuationType}', 'bind:value={durationYears}', 'bind:value={annualRate}']) {
    assert.ok(visible.includes(key), key);
    assert.ok(!extra.includes(key), 'not hidden: ' + key);
  }
  assert.ok(visible.indexOf('bind:value={valuationType}') > visible.indexOf('bind:value={initialValue}'));
  assert.ok(block.includes('<section class="item-extra-fields" aria-label='));
  assert.ok(!dialog.includes('itemExtrasOpen'));
  assert.ok(!block.includes('<details'));
  assert.ok(visible.includes('bind:value={minimumValue}'));
  assert.ok(!extra.includes('bind:value={minimumValue}'));
  assert.ok(visible.includes('input type="text" inputmode="decimal"'));
  assert.ok(dialog.includes("minimumValue: valuationType === 'fixed' && !validMoney(minimumValueAmount) ? 0 : minimumValueAmount"));
  // The draft and shared payload builder must both retain the localized minimum.
  assert.equal((dialog.match(/minimumValue: valuationType === 'fixed' && !validMoney\(minimumValueAmount\) \? 0 : minimumValueAmount/g) || []).length, 2);
  assert.ok(dialog.includes('applyItemAdd(p, { ...itemPayload()'));
  assert.ok(dialog.includes('applyItemContinue(p, { ...itemPayload()'));
  assert.ok(source('src/lib/itemMutations.js').includes('valuation:rule'));
  assert.ok(source('src/lib/itemMutations.js').includes('minimumValue:v.minimumValue??0'));
  assert.ok(dialog.includes('minimumValueValid') && dialog.includes('aria-invalid={!minimumValueValid}'));
  assert.equal(parseDecimal('12,48'), 12.48);
  assert.equal(parseDecimal('0,07'), 0.07);
  assert.equal(parseDecimal('12,345'), 12.345);
  assert.ok(Math.abs(parseDecimal('12,345') * 100 - Math.round(parseDecimal('12,345') * 100)) > 1e-7);
});

test('Q22: existing purchase editing preserves a localized minimum and the focus ring is accessible', () => {
  const editor = source('ui-v3/EventEditDialog.svelte');
  assert.ok(editor.includes('bind:value={edited.valuation.type}'));
  assert.ok(editor.includes('ui.how-does-the-value-change-16f9eit'));
  assert.ok(editor.includes('bind:value={edited.valuation.minimumValue} aria-invalid={!minimumValid}'));
  assert.ok(editor.includes('edited.valuation.minimumValue = minimumAmount'));
  assert.ok(editor.includes('disabled={!minimumValid || !sharesValid || (isPurchase && !financingValid) || $appState.readOnly}'));
  const css = source('ui-v3/design.css');
  assert.ok(css.includes('.modal-body input:focus-visible'));
  assert.ok(css.includes('outline:2px solid #276f84'));
  assert.ok(css.includes('.modal-body input[aria-invalid="true"]'));
  assert.ok(css.includes('.modal-body input:disabled'));
});
