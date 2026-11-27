// Real-browser acceptance: offline Save/restore/Undo and two-browser PHP checkout.
// Run with: npm run build:single && npm run build:php && node tests/browser-qa.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, firefox, webkit } from 'playwright';
import { decryptProject, encryptProject, hashSecret, randomSecret } from '../src/lib/crypto.js';
import { ledgerAt } from '../src/lib/ledger.js';
import { projectAt } from '../src/lib/projector.js';
import { readPortableVersion } from '../src/lib/versionHistory.js';
import { portableFileAcceptance } from './portable-file-qa.mjs';
import { invalidInputAcceptance } from './invalid-input-qa.mjs';
import { timeTravelFormsAcceptance, guidedArchiveAcceptance } from './time-travel-forms-qa.mjs';

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
      financialMode: 'derived', purchaseContributionsCents:{anna:30000},
      shares: { anna: 1, ben: 1, clara: 1 }
    }
  ],
  drafts: [], lastSavedAt: '2025-01-02T09:00:00.000Z',
  versionHistory: { format: 'portable-v1', entries: [] }
};
const oneSaved = project => ({
  project, savedProject: project, savedHistoryIds: project.versionHistory.entries.map(entry => entry.id),
  dirty: false
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
// Q32: exercise intermediate values and DOM identity, not just the final submit.
async function itemEntryAcceptance(browser, url, engine) {
  for (const [width, locale] of [[320,'de-DE'], [375,'de-DE'], [390,'en-GB'], [1280,'en-GB']]) {
    const context = await browser.newContext({locale,viewport:{width,height:812}});
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await bootFixture(page,url);
      const snapshot = () => page.evaluate(k=>JSON.parse(localStorage.getItem(k)).project,key);
      const original = await snapshot();
      const open = () => page.locator('.quick-actions .task-grid > button').first().click();
      const modal = page.getByRole('dialog');
      const name = modal.locator('.item-primary-fields input:not([type=date]):not([type=number])');
      const cost = modal.locator('.item-primary-fields input[type=number]');
      const method = modal.locator('.item-valuation-fields select');
      const duration = modal.locator('.item-valuation-fields input[type=number]');
      const minimum = modal.locator('.item-valuation-fields input[inputmode=decimal][type=text]');
      const finance = modal.locator('.item-financing-field');
      const submit = modal.locator('.modal-footer .primary');
      const itemName = 'Q32 '+engine+' '+width;
      await open();
      await name.pressSequentially(itemName);
      await modal.locator('.modal-header h3').click();
      assert.equal(await name.inputValue(),itemName,'name survives click/blur');
      // Real tab focus/visibility notifications also refresh the store. Deliver
      // the focus event deterministically even in a single headless window.
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      assert.equal(await name.inputValue(),itemName,'name survives unrelated store notification');
      await cost.fill('300');
      await cost.press('Tab');
      assert.equal(await name.inputValue(),itemName);
      assert.equal(await cost.inputValue(),'300');
      await duration.fill('8');
      await modal.locator('.modal-header h3').click();
      assert.equal(await duration.inputValue(),'8');
      assert.equal(await name.inputValue(),itemName);
      assert.equal(await cost.inputValue(),'300');
      assert.equal(await minimum.isVisible(),true,'minimum must not be hidden in optional details');
      await minimum.fill('0');
      await minimum.press('Tab');
      assert.equal(await minimum.inputValue(),'0');
      await minimum.fill(locale==='de-DE'?'12,48':'12.48');
      await method.selectOption('degressive');
      assert.equal(await minimum.inputValue(),locale==='de-DE'?'12,48':'12.48');
      await duration.fill('0.3');
      await method.selectOption('linear');
      assert.equal(await duration.inputValue(),'8');
      await finance.locator('select').first().selectOption('individual');
      assert.equal(await finance.locator('.purchase-person-row:not(.purchase-column-head)').count(),3);
      assert.equal(await finance.locator('.purchase-units').count(),3);
      assert.equal(await finance.locator('.purchase-contribution').count(),3);
      for(const row of await finance.locator('.purchase-person-row:not(.purchase-column-head)').all()){
        const boxes=await row.locator('.purchase-units, .share-percent, .purchase-contribution').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y+r.height/2};}));
        assert.equal(boxes.length,3);
        assert.ok(Math.max(...boxes.map(b=>b.y))-Math.min(...boxes.map(b=>b.y))<5,'share units, percentage and payment must be on the same row');
        assert.ok(boxes[0].x<boxes[1].x && boxes[1].x<boxes[2].x,'person columns are in the correct order');
      }
      const dateBox = await modal.locator('#event-effective-date').boundingBox();
      const bodyBox = await modal.locator('.modal-body').boundingBox();
      if(width<=390) assert.ok(dateBox.width >= bodyBox.width-40,'date occupies full usable width');
      // Q33: each row is independently editable; do not undo the first
      // unequal share before touching the other rows (the old test did).
      const units=finance.locator('.purchase-units');
      const paid=finance.locator('.purchase-contribution');
      const readValues=async fields=>Promise.all((await fields.all()).map(field=>field.inputValue()));
      async function verifyRows(expectedUnits,expectedPaid,message){
        assert.deepEqual((await readValues(units)).map(v=>v.replace(',','.')),expectedUnits,message+' (units)');
        assert.deepEqual((await readValues(paid)).map(v=>v.replace(',','.')),expectedPaid,message+' (contributions)');
      }
      async function type(field, text){
        await field.fill('');
        await field.pressSequentially(text);
        await field.press('Tab');
      }
      await type(units.nth(0),'2');
      await verifyRows(['2','1','1'],['100','100','100'],'Q33 first share');
      await type(units.nth(1),'3');
      await verifyRows(['2','3','1'],['100','100','100'],'Q33 second share');
      await type(units.nth(2),'0.5');
      await verifyRows(['2','3','0.5'],['100','100','100'],'Q33 fractional share');
      await type(finance.getByLabel('Anna',{exact:true}),'150.25');
      await verifyRows(['2','3','0.5'],['150.25','100','100'],'Q33 first contribution');
      await type(finance.getByLabel('Ben',{exact:true}),'100');
      await type(finance.getByLabel('Clara',{exact:true}),'0');
      const unequal=['2','3','0.5'];
      await verifyRows(unequal,['150.25','100','0'],'Q33 sequential unequal entries');
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await verifyRows(unequal,['150.25','100','0'],'Q33 store focus notification');
      await cost.fill('301');
      await cost.press('Tab');
      await verifyRows(unequal,['150.25','100','0'],'Q33 changing purchase price');
      await cost.fill('300');
      await modal.locator('#event-effective-date').fill('2025-02-01');
      await verifyRows(unequal,['150.25','100','0'],'Q33 changing date');
      await method.selectOption('fixed');
      await method.selectOption('linear');
      await verifyRows(unequal,['150.25','100','0'],'Q33 changing valuation method');
      await finance.locator('select').first().selectOption('single');
      await finance.locator('select').last().selectOption('ben');
      await finance.locator('select').first().selectOption('individual');
      await verifyRows(unequal,['150.25','100','0'],'Q33 restoring individual financing after mode switch');
      assert.equal(await submit.isDisabled(),true,'invalid financing blocks save');
      const anna=finance.getByLabel('Anna',{exact:true});
      await anna.fill(locale==='de-DE'?'150,':'150.');
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await units.nth(1).click();
      await finance.locator('select').first().selectOption('single');
      await finance.locator('select').first().selectOption('individual');
      assert.equal(await anna.inputValue(),locale==='de-DE'?'150,':'150.','Q33 raw invalid text survives focus and mode switching');
      assert.equal(await submit.isDisabled(),true);
      await anna.fill(locale==='de-DE'?'150,25':'150.25');
      await modal.locator('.modal-body').evaluate(el=>el.scrollTop=0);
      assert.equal(await name.inputValue(),itemName);
      assert.equal(await cost.inputValue(),'300');
      assert.equal(await duration.inputValue(),'8');
      assert.equal(await minimum.inputValue(),locale==='de-DE'?'12,48':'12.48');
      await finance.getByLabel('Clara',{exact:true}).fill('49.75');
      await verifyRows(unequal,['150.25','100','49.75'],'Q33 correction preserves prior values');
      assert.equal(await submit.isEnabled(),true);
      assert.equal(await modal.locator('.item-purchase-preview input[type=checkbox]').isChecked(),false);
      assert.ok(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+2),'modal horizontal overflow');
      assert.ok(await modal.locator('.modal-body').evaluate(el=>el.scrollWidth<=el.clientWidth+2),'body horizontal overflow');
      assert.ok(await submit.isVisible(),'primary action remains reachable');
      if(process.env.Q32_SCREENSHOT_DIR){
        await mkdir(process.env.Q32_SCREENSHOT_DIR,{recursive:true});
        await modal.locator('.modal-body').evaluate(el=>el.scrollTop=0);
        await page.screenshot({path:join(process.env.Q32_SCREENSHOT_DIR,engine+'-'+width+'-top.png')});
        await modal.locator('.modal-body').evaluate(el=>el.scrollTop=el.scrollHeight);
        await page.screenshot({path:join(process.env.Q32_SCREENSHOT_DIR,engine+'-'+width+'-bottom.png')});
      }
      const effectiveDate=await modal.locator('#event-effective-date').inputValue();
      await submit.click();
      await modal.waitFor({state:'hidden'});
      const saved=await snapshot();
      const event=saved.events.find(e=>e.type==='item-added'&&e.name===itemName);
      assert.ok(event,'created event persisted');
      assert.equal(event.date,effectiveDate);
      assert.equal(event.initialValue,300);
      assert.deepEqual(event.valuation,{type:'linear',minimumValue:12.48,durationYears:8});
      assert.deepEqual(event.shares,{anna:2,ben:3,clara:0.5});
      assert.deepEqual(event.purchaseContributionsCents,{anna:15025,ben:10000,clara:4975});
      assert.equal(saved.events.length,original.events.length+1);
      assert.ok(projectAt(saved,effectiveDate).activeItems.some(i=>i.id===event.itemId&&i.value===300));
      await open();
      await name.fill('Cancelled Q32');
      await modal.locator('.modal-header h3').click();
      await modal.locator('.modal-footer button').first().click();
      await modal.waitFor({state:'hidden'});
      assert.deepEqual((await snapshot()).events,saved.events);
      assert.deepEqual(errors,[]);
    } finally { await context.close(); }
    console.log('Q32 '+engine+' '+width+' '+locale+' passed');
  }
}

// Q32 visual/functional edge cases: long lists, invalid financing, draft
// restoration, dated purchases, automatic settlements and historical editing.
async function itemEntryLongListAcceptance(browser,url,engine) {
  for(const width of [375,1280]){
    const context=await browser.newContext({locale:'de-DE',viewport:{width,height:812}});
    try{
      const page=await context.newPage();
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      const original=structuredClone(fixture);
      for(let i=0;i<6;i++){
        const id='extra-'+i, name='Mitbewohnerin '+(i+1)+' mit langem Namen';
        original.people.push({id,name});
        original.events.push({id:'join-'+id,type:'person-added',personId:id,name,date:'2025-01-01',order:4+i});
      }
      await page.goto(url);
      await page.evaluate(({key,copy})=>localStorage.setItem(key,JSON.stringify(copy)),{key,copy:oneSaved(original)});
      await page.reload();
      await page.getByText('Browser-Abnahme').first().waitFor();
      const snapshot=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)).project,key);
      const modal=page.getByRole('dialog');
      const open=()=>page.locator('.quick-actions .task-grid > button').first().click();
      const name=modal.locator('.item-primary-fields input:not([type=date]):not([type=number])');
      const cost=modal.locator('.item-primary-fields input[type=number]');
      const method=modal.locator('.item-valuation-fields select');
      const minimum=modal.locator('.item-valuation-fields input[type=text]');
      const finance=modal.locator('.item-financing-field');
      const submit=modal.locator('.modal-footer .primary');
      const screenshot=async suffix=>{
        if(!process.env.Q32_SCREENSHOT_DIR)return;
        await mkdir(process.env.Q32_SCREENSHOT_DIR,{recursive:true});
        await page.screenshot({path:join(process.env.Q32_SCREENSHOT_DIR,engine+'-'+width+'-long-'+suffix+'.png')});
      };
      await open();
      await screenshot('empty');
      await name.fill('Q32 Langliste');
      await cost.fill('900');
      await modal.locator('#event-effective-date').fill('2025-02-01');
      await method.selectOption('fixed');
      assert.equal(await minimum.count(),0);
      await method.selectOption('degressive');
      await modal.locator('.item-valuation-fields input[type=number]').fill('0.25');
      await minimum.fill('17,50');
      await finance.locator('select').last().selectOption('anna');
      assert.equal(await finance.locator('.purchase-person-row:not(.purchase-column-head)').count(),9);
      assert.equal(await submit.isEnabled(),true);
      const row=finance.locator('.purchase-person-row').filter({hasText:'Mitbewohnerin 6'});
      await row.locator('.purchase-units').fill('0');
      assert.match(await row.locator('.share-percent').innerText(),/^0(?:[,.]0+)?\s*%$/);
      await row.locator('.purchase-units').fill('1');
      await screenshot('middle');
      await modal.locator('.modal-body').evaluate(el=>el.scrollTop=el.scrollHeight);
      await screenshot('bottom');
      await modal.getByRole('button',{name:'Als Entwurf sichern'}).click();
      await modal.waitFor({state:'hidden'});
      const withDraft=await snapshot();
      const draft=withDraft.drafts.find(d=>d.data?.name==='Q32 Langliste');
      assert.equal(draft.data.effectiveDate,'2025-02-01');
      assert.deepEqual(draft.data.valuation,{type:'degressive',annualRate:0.25,minimumValue:17.5});
      assert.deepEqual(draft.data.purchaseContributionsCents,{anna:90000});
      assert.deepEqual(withDraft.events,original.events);
      await page.locator('.draft-row').filter({hasText:'Q32 Langliste'}).getByRole('button',{name:'Fortsetzen',exact:true}).click();
      assert.equal(await name.inputValue(),'Q32 Langliste');
      assert.equal(await cost.inputValue(),'900');
      assert.equal(await method.inputValue(),'degressive');
      assert.equal(Number((await minimum.inputValue()).replace(',','.')),17.5);
      assert.equal(await modal.locator('#event-effective-date').inputValue(),'2025-02-01');
      assert.equal(await finance.locator('.purchase-contribution').count(),9);
      await finance.getByLabel('Anna',{exact:true}).fill('800');
      assert.equal(await submit.isDisabled(),true);
      await screenshot('invalid');
      await finance.getByLabel('Anna',{exact:true}).fill('900');
      const checkbox=modal.locator('.item-purchase-preview input[type=checkbox]');
      assert.equal(await checkbox.isChecked(),false);
      await checkbox.check();
      await modal.getByLabel('Tatsächliches Zahlungsdatum').fill('2025-02-02');
      await screenshot('settled');
      await modal.getByRole('button',{name:'Als Entwurf sichern'}).click();
      await modal.waitFor({state:'hidden'});
      assert.equal((await snapshot()).drafts.find(d=>d.id===draft.id).data.settledPaymentDate,'2025-02-02');
      assert.deepEqual((await snapshot()).events,original.events,'Q33 draft must not book payments');
      await page.locator('.draft-row').filter({hasText:'Q32 Langliste'}).getByRole('button',{name:'Fortsetzen',exact:true}).click();
      assert.equal(await checkbox.isChecked(),true,'Q33 opt-in restored with draft');
      assert.equal(await modal.getByLabel('Tatsächliches Zahlungsdatum').inputValue(),'2025-02-02');
      await submit.click();
      await modal.waitFor({state:'hidden'});
      const saved=await snapshot();
      const event=saved.events.find(e=>e.type==='item-added'&&e.name==='Q32 Langliste');
      assert.ok(event);
      assert.equal(event.date,'2025-02-01');
      assert.equal(event.valuation.minimumValue,17.5);
      assert.equal(Object.keys(event.shares).length,9);
      const payments=saved.events.filter(e=>e.type==='claim-settlement-recorded');
      assert.equal(payments.length,8);
      assert.ok(payments.every(e=>e.amountCents===10000&&e.date==='2025-02-02'));
      assert.ok(!saved.drafts.some(d=>d.id===draft.id));
      if(width<780){
        await page.getByRole('button',{name:'Weitere Bereiche öffnen'}).click();
        await page.locator('.mobile-more-menu').getByRole('button',{name:'Änderungen'}).click();
      } else await page.locator('.sidebar-links').getByRole('button',{name:'Änderungen'}).click();
      await page.locator('.timeline-event-card').filter({hasText:'Q32 Langliste'}).locator('.event-open-overlay').click();
      assert.equal(await modal.locator('.purchase-contribution').count(),9);
      await modal.locator('.purchase-units').nth(0).fill('2');
      await modal.locator('.purchase-units').nth(1).fill('3');
      await modal.getByLabel('Anna',{exact:true}).fill('850.50');
      await modal.getByLabel('Ben',{exact:true}).fill('49.50');
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      assert.equal(await modal.locator('.purchase-units').nth(0).inputValue(),'2');
      assert.equal(await modal.locator('.purchase-units').nth(1).inputValue(),'3');
      assert.equal(Number(await modal.getByLabel('Anna',{exact:true}).inputValue()),850.5);
      assert.equal(Number(await modal.getByLabel('Ben',{exact:true}).inputValue()),49.5);
      await modal.locator('.item-valuation-edit-fields input[type=text]').fill('18,25');
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      assert.equal(await modal.locator('.item-valuation-edit-fields input[type=text]').inputValue(),'18,25');
      await screenshot('edit');
      await modal.locator('.modal-footer .primary').click();
      await modal.waitFor({state:'hidden'});
      const edited=await snapshot();
      assert.equal(edited.events.find(e=>e.id===event.id).valuation.minimumValue,18.25);
      assert.equal(edited.events.find(e=>e.id===event.id).shares.anna,2);
      assert.equal(edited.events.find(e=>e.id===event.id).shares.ben,3);
      assert.equal(edited.events.find(e=>e.id===event.id).purchaseContributionsCents.anna,85050);
      assert.equal(edited.events.find(e=>e.id===event.id).purchaseContributionsCents.ben,4950);
      assert.deepEqual(edited.events.filter(e=>e.type==='claim-settlement-recorded'),payments);
      assert.deepEqual(errors,[]);
    }finally{await context.close()}
    console.log('Q32 '+engine+' '+width+' long list, draft, date, edit and payments passed');
  }
}

// Q33: other dialog families keep their working values across real edits,
// blur, store notifications and deliberate navigation. Run in each engine.
async function formStateAcceptance(browser,url,engine) {
  for (const [width,locale] of [[375,'de-DE'],[1280,'en-GB']]) {
    const context=await browser.newContext({locale,viewport:{width,height:820}});
    try {
      const page=await context.newPage();
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('dialog',d=>d.accept());
      await bootFixture(page,url);
      const snapshot=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)).project,key);
      const original=await snapshot();
      const modal=page.getByRole('dialog');
      const quick=page.locator('.quick-actions .task-grid > button');
      const refresh=()=>page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      const close=async()=>{await modal.locator('.modal-header > button.ghost').click();await modal.waitFor({state:'hidden'});};
      async function section(id){
        const ids=['overview','items','people','money','activity'];
        if(width>780){
          if(['save','settings'].includes(id))await page.locator('.sidebar-bottom button').nth(id==='save'?0:1).click();
          else await page.locator('.sidebar-links button').nth(ids.indexOf(id)).click();
        } else if(ids.includes(id)&&ids.indexOf(id)<4)await page.locator('.mobile-bottom-nav > button').nth(ids.indexOf(id)).click();
        else {
          await page.locator('.mobile-more-slot > button').click();
          await page.locator('.mobile-more-menu > button').nth(({activity:0,save:1,settings:2})[id]).click();
        }
      }
      await quick.nth(2).click();
      const personName=modal.locator('.person-name-field input');
      await personName.pressSequentially('Q33 Person');
      await refresh();
      await modal.locator('.modal-header h3').click();
      assert.equal(await personName.inputValue(),'Q33 Person');
      await close();

      await page.locator('.simple-debts .debt-action').first().click();
      const payer=modal.locator('select').nth(0), recipient=modal.locator('select').nth(1);
      await payer.selectOption('ben');
      await recipient.selectOption('anna');
      const amount=modal.locator('input[inputmode=decimal]');
      const date=modal.locator('input[type=date]');
      const note=modal.locator('textarea');
      await amount.fill('12,');
      await note.fill('Q33 payment note');
      await date.fill('2025-02-03');
      await refresh();
      assert.equal(await amount.inputValue(),'12,');
      assert.equal(await payer.inputValue(),'ben');
      assert.equal(await recipient.inputValue(),'anna');
      assert.equal(await note.inputValue(),'Q33 payment note');
      assert.equal(await date.inputValue(),'2025-02-03');
      assert.equal(await modal.locator('.modal-footer .primary').isDisabled(),true);
      await amount.fill('12,34');
      await modal.locator('.modal-footer .primary').click();
      await modal.waitFor({state:'hidden'});
      const payment=(await snapshot()).events.at(-1);
      assert.equal(payment.amountCents,1234);
      assert.equal(payment.note,'Q33 payment note');

      await section('items');
      await page.locator('.item-tile').filter({hasText:'Kühlschrank'}).locator('.tile-open').click();
      await page.locator('.secondary-actions .action-grid button').first().click();
      const metadata=modal.locator('.form-grid');
      await metadata.locator('input').nth(0).fill('Q33 item name');
      await metadata.locator('input').nth(1).fill('Q33 category');
      await metadata.locator('textarea').fill('Q33 item note');
      await refresh();
      assert.equal(await metadata.locator('input').nth(0).inputValue(),'Q33 item name');
      assert.equal(await metadata.locator('input').nth(1).inputValue(),'Q33 category');
      assert.equal(await metadata.locator('textarea').inputValue(),'Q33 item note');
      await close();

      // Shared ownership editor: date rebasing keeps the explicit changes.
      await page.getByRole('button',{name:/Eigentumsanteile ändern|Change ownership shares|Edit ownership shares/i}).click();
      const shares=modal.locator('.share-row input[inputmode=decimal]');
      await shares.nth(0).fill('2');
      await shares.nth(1).fill('0,');
      await modal.locator('#event-effective-date').fill('2025-02-01');
      await refresh();
      assert.equal(await shares.nth(0).inputValue(),'2');
      assert.equal(await shares.nth(1).inputValue(),'0,');
      assert.equal(await modal.locator('.modal-footer .primary').isDisabled(),true);
      await shares.nth(1).fill('3');
      await modal.locator('select').last().selectOption('none');
      await modal.locator('#event-effective-date').fill('2025-03-01');
      assert.equal(await shares.nth(0).inputValue(),'2');
      assert.equal(await shares.nth(1).inputValue(),'3');
      await modal.locator('.modal-footer .primary').click();
      await modal.waitFor({state:'hidden'});
      const saved=(await snapshot()).events.at(-1);
      assert.deepEqual(saved.shareUnitDeltas,{anna:1,ben:2});

      await section('overview');
      await quick.nth(1).click();
      const main=page.locator('.large-modal');
      assert.equal(await main.locator('.redistribution-advanced input').isVisible(), true, 'Q35: description is directly visible');
      const title=main.locator('.redistribution-advanced input');
      await title.fill('Q33 redistribution draft');
      await main.locator('#redistribution-effective-date').fill('2025-04-01');
      await main.locator('.redistribution-item-card').first().click();
      const sub=page.locator('.sub-modal .modal');
      const subShares=sub.locator('.share-row input[inputmode=decimal]');
      await subShares.nth(0).fill('5');
      await subShares.nth(1).fill('2');
      await refresh();
      assert.equal(await subShares.nth(0).inputValue(),'5');
      assert.equal(await subShares.nth(1).inputValue(),'2');
      await sub.locator('.modal-footer .primary').click();
      await sub.waitFor({state:'hidden'});
      assert.equal(await title.inputValue(),'Q33 redistribution draft');
      await main.locator('.modal-footer button').nth(1).click();
      await main.waitFor({state:'hidden'});
      const draft=(await snapshot()).drafts.find(d=>d.title==='Q33 redistribution draft');
      assert.equal(draft.effectiveDate,'2025-04-01');
      assert.equal(draft.changes[0].shares.anna,5);
      await page.locator('.draft-row').filter({hasText:'Q33 redistribution draft'}).locator('.draft-buttons button').first().click();
      await main.locator('.redistribution-item-card').first().click();
      assert.equal(await subShares.nth(0).inputValue(),'5');
      assert.equal(await subShares.nth(1).inputValue(),'2');
      await sub.locator('.modal-footer button').first().click();
      await main.locator('.modal-header button.ghost').click();

      await section('save');
      const protectedCopy=page.locator('.storage-secondary').first();
      assert.equal(await protectedCopy.locator('input[type=password]').isVisible(), true, 'Q35: encrypted backup directly accessible');
      const pass=protectedCopy.locator('input[type=password]');
      const backup=protectedCopy.locator('input:not([type=password])');
      await pass.fill('test-only-passphrase');
      await backup.fill('Q33 backup');
      await refresh();
      await section('settings');
      await page.locator('#language-selection').selectOption(locale==='de-DE'?'en':'de');
      await section('save');
      assert.equal(await pass.inputValue(),'test-only-passphrase');
      assert.equal(await backup.inputValue(),'Q33 backup');
      assert.equal((await snapshot()).events.length,original.events.length+2);
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
    console.log('Q33 '+engine+' '+width+' '+locale+' other form drafts passed');
  }
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
  const desktop = page.locator('.sidebar').getByRole('button', { name: /Sichern & Öffnen/ });
  if (await desktop.isVisible()) return desktop.click();
  await page.getByRole('button', { name: 'Weitere Bereiche öffnen' }).click();
  return page.locator('.mobile-more-menu').getByRole('button', { name: /Sichern & Öffnen/ }).click();
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
  await page.getByRole('button', { name: 'Projektdatei herunterladen', exact: true }).first().click();
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
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#time-travel-panel').count(), 0, 'Escape closes date popover');
  assert.match(await page.locator('.time-travel-selected-text strong').innerText(), /02\.01\.2025/);
  await page.getByRole('button', { name: 'Stichtag wählen' }).click();
  await openFinance(page);
  assert.equal(await page.locator('#time-travel-panel').count(), 0, 'picker closes on navigation');
  assert.match(await page.locator('.time-travel-selected-text strong').innerText(), /02\.01\.2025/);
  await page.getByRole('button', { name: 'Stichtag wählen' }).click();
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
  await mobile.locator('.storage-versions > summary').click();
  const picker = mobile.locator('.storage-versions select');
  await picker.selectOption({ index: 1 });
  mobile.on('dialog', dialog => dialog.accept());
  await mobile.getByRole('button', { name: 'Als ungespeicherten Arbeitsstand wiederherstellen' }).click();
  await openFinance(mobile);
  await balance(mobile, 'Anna', '200,00');
  await openSave(mobile);
  assert.match(await mobile.locator('.storage-context').innerText(), /Änderungen seit/);
  const restored = await download(mobile);
  assert.equal(restored.versionHistory.entries.length, 2);
  assert.deepEqual(restored.events.filter(e => e.type === 'claim-settlement-recorded'), []);
  const beforeRestore = await readPortableVersion(restored, restored.versionHistory.entries[1].id);
  assert.equal(beforeRestore.events.filter(e => e.type === 'claim-settlement-recorded').length, 1,
    'Restoring the previous current file must archive the completed payment snapshot');

  // Local encrypted download carries the same complete portable history.
  await openSave(mobile);
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
    await encryptedPage.locator('.save-basic-actions input[type=file]').setInputFiles({
      name: 'portable-encrypted.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(encryptedFile))
    });
    await encryptedPage.getByLabel('Dateipasswort').fill('encrypted-browser-qa-secret');
    await encryptedPage.getByRole('button', { name: 'Verschlüsselte Datei öffnen' }).click();
    await encryptedPage.getByText('Browser-Abnahme').first().waitFor();
    await openFinance(encryptedPage);
    await balance(encryptedPage, 'Anna', '200,00');
    await openSave(encryptedPage);
    // Versions are displayed newest first: index 1 is the payment state.
    await encryptedPage.locator('.storage-versions > summary').click();
    await encryptedPage.locator('.storage-versions select')
      .selectOption({ index: 1 });
    encryptedPage.on('dialog', dialog => dialog.accept());
    await encryptedPage.getByRole('button', { name: 'Als ungespeicherten Arbeitsstand wiederherstellen' }).click();
    try {
      await encryptedPage.getByText(/Früherer Stand geladen/).waitFor({ timeout: 12000 });
    } catch {
      throw new Error('Encrypted restore did not finish: ' +
        (await encryptedPage.locator('.storage-flow').innerText()).slice(0, 900));
    }
    await openFinance(encryptedPage);
    await balance(encryptedPage, 'Anna', '140,00');
    // Header Save on an opened encrypted local file must directly download
    // an encrypted archive, not direct the user to an unencrypted backup.
    const saveEncryptedWait = encryptedPage.waitForEvent('download');
    await encryptedPage.getByRole('button', { name: 'Projektdatei herunterladen', exact: true }).first().click();
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
    await card.locator('.event-open-overlay').press('Enter');
    return page.locator('[role="dialog"]');
  };
  const assertBalances = async (expected, targetPage = page) => {
    await openFinance(targetPage);
    // Assert every person, direction, cents and absence of extraneous rows.
    // A zero balance is intentionally not displayed in the ledger.
    await targetPage.waitForFunction(expectedBalances => {
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
      const rendered = await targetPage.locator('.person-balance-row').allTextContents();
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
    if (!await page.locator('#time-travel-panel').count()) {
      await page.getByRole('button', { name: 'Stichtag wählen' }).click();
    }
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
      assert.equal(await dialog.getByLabel('Gezahlter Betrag in Euro').inputValue(), '100,00');
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
    await page.locator('.quick-actions .task-grid > button').first().click();
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
    assert.deepEqual(itemEvent?.purchaseContributionsCents, {anna:30000});
    assert.deepEqual(itemEvent?.shares, { anna: 1, ben: 1, clara: 1 });
    await returnToday();
    await assertBalances({ Anna: 20000, Ben: -10000, Clara: -10000 });

    // Q15: Both ways of opening a NEW payment must inherit the active
    // cutoff, while cancelling a prefilled dialog never records a payment.
    const browserToday = await page.evaluate(() => {
      const d = new Date();
      return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0')].join('-');
    });
    const beforeDateChecks = await readProject();
    for (const selectedDate of [browserToday, '2025-01-02', '2099-01-01']) {
      if (selectedDate === browserToday) await returnToday();
      else await setDate(selectedDate);
      await openFinance(page);
      for (const entry of ['manual', 'proposal']) {
        if (entry === 'manual') {
          await page.getByRole('button', { name: 'Zahlung erfassen', exact: true }).click();
        } else {
          await page.locator('.transfer-row').filter({ hasText: 'Ben zahlt an Anna' })
            .getByRole('button', { name: 'Ausgleichen' }).click();
        }
        const payment = page.getByRole('dialog', { name: 'Ausgleich dokumentieren' });
        assert.equal(await payment.getByLabel('Zahlungsdatum').inputValue(), selectedDate,
          'Q15: ' + entry + ' payment defaults to ' + selectedDate);
        await payment.getByRole('button', { name: 'Abbrechen', exact: true }).click();
        await closeDialog();
      }
      assert.deepEqual((await readProject()).events, beforeDateChecks.events,
        'Q15: cancelling payments must leave all events unchanged');
    }
    await returnToday();

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
    assert.equal(await purchaseEdit.locator('.modal-footer button.primary').isDisabled(), true);
    await purchaseEdit.getByLabel('Anna', {exact:true}).last().fill('330');
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
      await modal.locator('.share-row').nth(0).locator('input[inputmode=decimal]').fill(first);
      await modal.locator('.share-row').nth(1).locator('input[inputmode=decimal]').fill(second);
      await modal.locator('select').last().selectOption(mode);
      await modal.locator('.modal-footer button.primary').click();
      await modal.waitFor({ state: 'hidden' });
    };
    await changeShares('0', '2', 'derived');
    await assertBalances({ Anna: 30000, Ben: -20000, Clara: -10000 }, ownership);
    await ownership.locator('.sidebar-links').getByRole('button', { name: /Änderungen/ }).click();
    await ownership.locator('.timeline-event-card')
      .filter({ hasText: 'Kühlschrank' }).first().locator('.entity-link').first().click();
    // Anna has zero shares after the paid transfer, so the remaining rows
    // are Ben and Clara. Gift one of Ben's units to Clara.
    await changeShares('1', '2', 'none');
    await assertBalances({ Anna: 30000, Ben: -20000, Clara: -10000 }, ownership);
    await ownership.getByRole('button', { name: 'Zahlung erfassen', exact: true }).click();
    const groupPayment = ownership.getByRole('dialog', { name: 'Ausgleich dokumentieren' });
    await groupPayment.getByLabel('Wer hat bezahlt?').selectOption('ben');
    await groupPayment.getByLabel('Wer hat das Geld erhalten?').selectOption('clara');
    await groupPayment.getByLabel('Gezahlter Betrag in Euro').fill('50');
    await groupPayment.locator('textarea').fill('Q03 vereinbarte Gruppensaldierung');
    await groupPayment.getByRole('button', { name: 'Zahlung als erfolgt erfassen' }).click();
    await groupPayment.waitFor({ state: 'hidden' });
    await assertBalances({ Anna: 30000, Ben: -15000, Clara: -15000 }, ownership);
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


// Q04: Real Chromium checks at phone, tablet and desktop widths. These are
// viewport/browser-engine checks, not claims about physical device coverage.

async function purchaseFinancingAcceptance(browser, url) {
  const context = await browser.newContext({
    locale: 'de-DE', viewport: { width: 375, height: 812 }, acceptDownloads: true
  });
  const failures = [];
  const date = '2025-02-01';
  const paidDate = '2025-02-02';
  try {
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    await bootFixture(page, url);
    const snapshot = () => page.evaluate(k => JSON.parse(localStorage.getItem(k)).project, key);
    const original = await snapshot();
    const originalBalances = ledgerAt(original, paidDate).balances;
    await page.getByRole('button', {name:'Stichtag wählen'}).click();
    await page.locator('#state-date').fill(date);
    await page.keyboard.press('Escape');
    const dialog = page.locator('[role="dialog"]');
    const submit = dialog.locator('.modal-footer .primary');
    const financing = dialog.locator('.item-financing-field');
    const optIn = dialog.getByLabel('Ausgleichszahlungen bereits erfolgt – mitbuchen');
    async function prepare(name) {
      await page.locator('.quick-actions .task-grid > button').first().click();
      assert.equal(await dialog.locator('#event-effective-date').inputValue(), date);
      await dialog.locator('.item-primary-fields input').first().fill(name);
      await dialog.locator('.item-primary-fields input[type=number]').fill('300');
      assert.equal(await submit.isDisabled(), true, 'no implicit purchase financing');
      await financing.locator('select').first().selectOption('individual');
      for (const person of ['Anna','Ben','Clara']) {
        assert.equal(Number(await financing.getByLabel(person,{exact:true}).inputValue()), 100);
      }
      assert.equal(await dialog.locator('.item-purchase-preview').getByRole('checkbox').count(), 0,
        'balanced financing must not offer settlement payments');
      await financing.getByLabel('Anna',{exact:true}).fill('150');
      assert.equal(await submit.isDisabled(), true, 'excess must block creation');
      await financing.getByLabel('Ben',{exact:true}).fill('150');
      await financing.getByLabel('Clara',{exact:true}).fill('0');
      assert.equal(await submit.isEnabled(), true);
      assert.equal(await optIn.isChecked(), false, 'confirmation must be opt-in');
      const preview = dialog.locator('.item-purchase-preview .purchase-breakdown');
      for(const [id,expected] of [['anna',/\+.*50,00/],['ben',/\+.*50,00/],['clara',/-.*100,00/]]) {
        assert.match(await preview.locator(`tr[data-person="${id}"] td`).last().innerText(),expected);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+2));
    }

    // Opting in and then cancelling must create neither an item nor a payment.
    await prepare('Q31 cancelled');
    await optIn.check();
    assert.equal(await dialog.getByLabel('Tatsächliches Zahlungsdatum').inputValue(), date);
    await dialog.getByRole('button',{name:'Abbrechen',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    assert.deepEqual((await snapshot()).events, original.events);

    async function openPurchaseDetail(name) {
      await page.locator('.mobile-bottom-nav > button').nth(1).click();
      await page.locator('.item-tile').filter({hasText:name}).locator('.tile-open').click();
      await page.getByRole('heading',{name:'Finanzierung & Wertausgleich'}).waitFor();
    }
    async function returnToOverview() {
      await page.locator('.mobile-bottom-nav > button').first().click();
    }
    // Q34: genuinely unequal ownership with proportional actual contributions.
    await prepare('Q34 proportional');
    await financing.locator('.purchase-units').nth(0).fill('2');
    await financing.locator('.purchase-units').nth(1).fill('1');
    await financing.locator('.purchase-units').nth(2).fill('0');
    await financing.getByLabel('Anna',{exact:true}).fill('200');
    await financing.getByLabel('Ben',{exact:true}).fill('100');
    assert.equal(await dialog.locator('.item-purchase-preview .purchase-balanced').count(),1);
    assert.equal(await optIn.count(),0);
    const proportionalRows = await dialog.locator('.purchase-breakdown tbody tr').allTextContents();
    await submit.click();
    await dialog.waitFor({state:'hidden'});
    const proportional = await snapshot();
    const proportionalEvent = proportional.events.find(e=>e.name==='Q34 proportional');
    assert.deepEqual(ledgerAt(proportional,date).claims.filter(c=>c.sourceEventId===proportionalEvent.id),[]);
    await openPurchaseDetail('Q34 proportional');
    assert.deepEqual(await page.locator('.purchase-breakdown tbody tr').allTextContents(),proportionalRows);
    assert.equal(await page.locator('.purchase-balanced').count(),1);
    assert.equal(await page.getByText('Beim Kauf entstandene Forderungen (vor Zahlungen)',{exact:true}).count(),0);
    await returnToOverview();
    await page.getByRole('button',{name:/Rückgängig \(Strg\+Z\)/}).click();
    assert.deepEqual((await snapshot()).events,original.events);

    // With the checkbox off, outstanding purchase balances remain.
    await prepare('Q31 without settlement');
    const unpaidRows = await dialog.locator('.purchase-breakdown tbody tr').allTextContents();
    await submit.click();
    await dialog.waitFor({state:'hidden'});
    const unpaid = await snapshot();
    const unpaidEvent = unpaid.events.find(e => e.name === 'Q31 without settlement');
    assert.deepEqual(unpaidEvent.purchaseContributionsCents,{anna:15000,ben:15000,clara:0});
    assert.equal(unpaid.events.filter(e=>e.type==='claim-settlement-recorded').length,0);
    assert.equal(ledgerAt(unpaid,date).balances.get('anna'),originalBalances.get('anna')+5000);
    assert.equal(ledgerAt(unpaid,date).balances.get('ben'),originalBalances.get('ben')+5000);
    assert.equal(ledgerAt(unpaid,date).balances.get('clara'),originalBalances.get('clara')-10000);
    await openPurchaseDetail('Q31 without settlement');
    assert.deepEqual(await page.locator('.purchase-breakdown tbody tr').allTextContents(),unpaidRows);
    await page.getByText('Beim Kauf entstandene Forderungen (vor Zahlungen)',{exact:true}).waitFor();
    assert.equal(await page.locator('.purchase-balanced').count(),0);
    await returnToOverview();
    const undo = page.getByRole('button',{name:/Rückgängig \(Strg\+Z\)/});
    const redo = page.getByRole('button',{name:/Wiederholen \(Strg\+Y\)/});
    await undo.click();
    assert.deepEqual((await snapshot()).events,original.events);

    await prepare('Q31 with settlement');
    await optIn.check();
    await dialog.getByLabel('Tatsächliches Zahlungsdatum').fill(paidDate);
    await submit.click();
    await dialog.waitFor({state:'hidden'});
    const recorded = await snapshot();
    const acquisition = recorded.events.find(e=>e.name==='Q31 with settlement');
    assert.deepEqual(acquisition.purchaseContributionsCents,{anna:15000,ben:15000,clara:0});
    const payments = recorded.events.filter(e=>e.type==='claim-settlement-recorded');
    assert.equal(payments.length,2);
    assert.deepEqual(payments.map(e=>e.amountCents).sort(),[5000,5000]);
    assert.ok(payments.every(e=>e.date===paidDate));
    assert.equal(new Set(recorded.events.map(e=>e.id)).size,recorded.events.length);
    assert.equal(ledgerAt(recorded,date).balances.get('anna'),originalBalances.get('anna')+5000);
    assert.deepEqual(ledgerAt(recorded,paidDate).balances,originalBalances,
      'automatic settlement must not pay unrelated outstanding balances');
    await undo.click();
    assert.deepEqual((await snapshot()).events, original.events, 'one undo removes purchase and payments');
    await redo.click();
    assert.deepEqual((await snapshot()).events, recorded.events, 'one redo restores the identical events');
    const saved = await download(page);
    assert.deepEqual(saved.events, recorded.events);
    const fresh = await browser.newContext({locale:'de-DE',viewport:{width:375,height:812}});
    try {
      const target = await fresh.newPage();
      await target.goto(url);
      await openSave(target);
      await target.locator('.save-basic-actions input[type=file]').setInputFiles({
        name:'q31.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))
      });
      await target.getByText('Browser-Abnahme').first().waitFor();
      const restored = await target.evaluate(k=>JSON.parse(localStorage.getItem(k)).project,key);
      assert.deepEqual(restored.events,recorded.events);
      assert.deepEqual(ledgerAt(restored,paidDate).balances,originalBalances);
    } finally { await fresh.close(); }
    assert.deepEqual(failures,[]);
    console.log('Q31 mobile QA: explicit contributions, opt-in only, dates, unrelated balances, atomic undo/redo and JSON roundtrip passed');
  } finally { await context.close(); }
}

async function shareDeltaAcceptance(browser,url) {
  const context=await browser.newContext({locale:'de-DE',viewport:{width:1280,height:820},acceptDownloads:true});
  try {
    const page=await context.newPage();
    const failures=[];
    page.on('pageerror',e=>failures.push(e.message));
    const original=structuredClone(fixture);
    original.events.find(e=>e.type==='item-added').shares={anna:6,ben:4,clara:1};
    original.events.push({id:'q30-payment',type:'claim-settlement-recorded',date:'2025-01-03',order:1,
      debtorPersonId:'ben',creditorPersonId:'anna',amountCents:700,settlementKind:'paid'});
    await page.goto(url);
    await page.evaluate(({key,copy})=>localStorage.setItem(key,JSON.stringify(copy)),{key,copy:oneSaved(original)});
    await page.reload();
    await page.getByText('Browser-Abnahme').first().waitFor();
    const snapshot=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).project,key);
    const dialog=page.locator('[role="dialog"]');
    async function cutoff(date) {
      if (!await page.locator('#time-travel-panel').count()) await page.locator('.time-travel-toggle').click();
      await page.locator('#state-date').fill(date);
      await page.keyboard.press('Escape');
    }
    async function targetShares(date,values,accepted=true) {
      await cutoff(date);
      await page.getByRole('button',{name:'Eigentumsanteile ändern'}).click();
      assert.equal(await dialog.locator('#event-effective-date').inputValue(),date);
      for(const [name,units] of Object.entries(values)) {
        await dialog.locator('.share-row').filter({hasText:name}).locator('input[inputmode=decimal]').fill(String(units));
      }
      await dialog.locator('select').last().selectOption('derived');
      await dialog.locator('.modal-footer button.primary').click();
      if(accepted) await dialog.waitFor({state:'hidden'});
      else {
        await page.waitForFunction(()=>document.querySelector('[role="dialog"]')!==null);
        const error = page.locator('.notification[data-kind="error"]').filter({hasText:/Anteile.*2025-03-01/s});
        await error.waitFor();
        await error.getByRole('button').click();
        await dialog.getByRole('button',{name:'Abbrechen',exact:true}).click();
      }
    }
    await page.locator('.sidebar-links').getByRole('button',{name:'Gegenstände'}).click();
    await page.locator('.item-tile').filter({hasText:'Kühlschrank'}).locator('.tile-open').click();
    await targetShares('2025-03-01',{Anna:5,Ben:5,Clara:1});
    const later=await snapshot();
    const late=later.events.at(-1);
    assert.equal(late.type,'shares-set');
    assert.deepEqual(late.shareUnitDeltas,{anna:-1,ben:1});
    assert.ok(!Object.hasOwn(late,'shares'));
    await targetShares('2025-02-01',{Anna:6,Ben:3,Clara:2});
    const retro=await snapshot();
    assert.deepEqual(retro.events.at(-1).shareUnitDeltas,{ben:-1,clara:1});
    assert.deepEqual(retro.events.find(e=>e.id===late.id),late);
    assert.deepEqual(projectAt(retro,'2025-03-02').activeItems[0].shares,{anna:5,ben:4,clara:2});
    assert.deepEqual(retro.events.slice(0,original.events.length),original.events);
    assert.deepEqual(ledgerAt(retro,'2025-03-02').counterclaims,ledgerAt(original,'2025-03-02').counterclaims);
    await cutoff('2025-03-02');
    await page.locator('.timeline-event-card').filter({hasText:'01.03.2025'}).locator('.event-open-overlay').click();
    const actual={};
    for(const name of ['Anna','Ben','Clara'])
      actual[name]=Number(await dialog.locator('.share-row').filter({hasText:name}).locator('input[inputmode=decimal]').inputValue());
    assert.deepEqual(actual,{Anna:5,Ben:4,Clara:2});
    await dialog.getByRole('button',{name:'Abbrechen',exact:true}).click();
    await targetShares('2025-02-15',{Anna:0,Ben:9,Clara:2},false);
    assert.deepEqual((await snapshot()).events,retro.events,'conflicting insertion must be atomic');
    await page.getByRole('button',{name:/Rückgängig \(Strg\+Z\)/}).click();
    assert.deepEqual((await snapshot()).events,later.events);
    await page.getByRole('button',{name:/Wiederholen \(Strg\+Y\)/}).click();
    assert.deepEqual((await snapshot()).events,retro.events);
    const saved=await download(page);
    assert.deepEqual(saved.events,retro.events);
    await openSave(page);
    await page.locator('.save-basic-actions input[type=file]').setInputFiles({
      name:'q30.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))
    });
    await page.getByText('Browser-Abnahme').first().waitFor();
    assert.deepEqual((await snapshot()).events,retro.events);
    assert.deepEqual(failures,[]);
    console.log('Q30 browser: backdating, historical editor, atomic conflict, immutable payments, undo/redo and file roundtrip passed');
  } finally {await context.close();}
}

async function unitMovementDisplayAcceptance(browser,url) {
  for (const [locale,width] of [['de-DE',375],['en-GB',1280]]) {
    const context=await browser.newContext({locale,viewport:{width,height:820}});
    try {
      const page=await context.newPage();
      const errors=[]; page.on('pageerror',e=>errors.push(e.message));
      await bootFixture(page,url);
      await page.locator('.quick-actions .task-grid > button').nth(1).click();
      const main=page.locator('.large-modal');
      const item=main.locator('.redistribution-item-card').first();
      await item.click();
      const sub=page.locator('.sub-modal .modal');
      await sub.locator('.share-row').filter({hasText:'Anna'}).locator('input[inputmode=decimal]').fill('2');
      await sub.locator('.modal-footer .primary').click();
      await sub.waitFor({state:'hidden'});
      const rows=item.locator('.redistribution-delta-row');
      assert.equal(await rows.count(),1);
      assert.match(await rows.first().innerText(),/Anna/);
      assert.match(await rows.first().innerText(),/\+1/);
      assert.doesNotMatch(await rows.first().innerText(),/Ben|Clara/);
      const financial=main.locator('.redistribution-preview');
      assert.match(await financial.innerText(),/Ben/);
      assert.match(await financial.innerText(),/Clara/);
      await main.locator('.redistribution-advanced input').fill('Q36 units only');
      await main.locator('.modal-footer .primary').click();
      await main.waitFor({state:'hidden'});
      await page.locator('.overview-layout.second-row .section-header button').first().click();
      const event=page.locator('.timeline-event-card').filter({hasText:'Q36 units only'});
      const movements=event.locator('.event-unit-change');
      assert.equal(await movements.count(),1);
      assert.match(await movements.first().innerText(),/Anna.*\+1/s);
      assert.doesNotMatch(await movements.first().innerText(),/Ben|Clara/);
      // Q28: the executed redistribution editor keeps its preview and editing
      // action but exposes no Markdown/detail export in either UI language.
      await event.locator('.event-open-overlay').click();
      const edit=page.locator('.large-modal');
      await edit.waitFor();
      assert.equal(await edit.getByRole('button',{name:/markdown|details exportieren|export details/i}).count(),0);
      assert.equal(await edit.locator('.content-right .mini-card').first().isVisible(),true);
      assert.equal(await edit.locator('.modal-footer .primary').isVisible(),true);
      await edit.locator('.modal-header button.ghost').click();
      await edit.waitFor({state:'hidden'});
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
  }
}

async function wholeCardAcceptance(browser,url) {
  for (const [locale,width] of [['de-DE',375],['en-GB',1280]]) {
    const context=await browser.newContext({locale,viewport:{width,height:820}});
    try {
      const page=await context.newPage();
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await bootFixture(page,url);
      const goHome=()=>page.locator(width<600?'.mobile-bottom-nav > button':'.sidebar-links > button').first().click();
      const title=page.locator('.detail-title h2');
      const metric=page.locator('.metric-grid .metric');
      // Non-button content and padding must activate the same primary action.
      await metric.nth(1).locator('.name-chip').first().click({force:true});
      const item=page.locator('.item-tile').filter({hasText:'Kühlschrank'});
      await item.locator('h2').click({force:true});
      await title.filter({hasText:'Kühlschrank'}).waitFor();
      await goHome();
      await metric.nth(2).click({position:{x:3,y:3}});
      const anna=page.locator('.person-tile').filter({has:page.getByRole('heading',{name:'Anna',exact:true})});
      await anna.locator('.card-primary').focus();
      await page.keyboard.press('Enter');
      await title.filter({hasText:'Anna'}).waitFor();
      await goHome();
      // The viewing date must survive a navigation from a recent event.
      await page.locator('.time-travel-toggle').click();
      await page.locator('#state-date').fill('2025-01-02');
      await page.keyboard.press('Escape');
      const recent=page.locator('.timeline-preview [data-event-id="purchase"] .event-open-overlay');
      await recent.focus();
      await page.keyboard.press('Enter');
      await page.locator('.modal-backdrop').waitFor();
      assert.equal(await page.locator('.timeline-preview').count(),1);
      await page.locator('.modal-header button.ghost').click();
      await page.locator('.modal-backdrop').waitFor({state:'hidden'});
      assert.equal(await page.locator('.time-travel-toggle').getAttribute('aria-pressed'),'true');
      await goHome();
      // The payment card opens the existing confirmation form, not a payment.
      const debt=page.locator('.debt-row').first();
      await debt.locator('strong').first().click({force:true});
      await page.locator('.modal-backdrop').waitFor();
      await page.locator('.modal-footer button').first().click();
      await page.locator('.modal-backdrop').waitFor({state:'hidden'});
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
  }
}

async function archiveDiscoverabilityAcceptance(browser,url) {
  for (const [locale,width] of [['de-DE',375],['en-GB',1280]]) {
    const context=await browser.newContext({locale,viewport:{width,height:820}});
    try {
      const page=await context.newPage();
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      const de=locale==='de-DE';
      const archive=de?'Person archivieren':'Archive person';
      const reactivate=de?'Person reaktivieren':'Reactivate person';
      const copy=structuredClone(fixture);
      copy.people.push({id:'free',name:'Q40 Free'});
      copy.events.push({id:'join-free',type:'person-added',personId:'free',name:'Q40 Free',date:'2025-01-01',order:4});
      await page.goto(url);
      await page.evaluate(({key,copy})=>localStorage.setItem(key,JSON.stringify(copy)),{key,copy:oneSaved(copy)});
      await page.reload();
      await page.getByText('Browser-Abnahme').first().waitFor();
      await page.locator('.time-travel-toggle').click();
      await page.locator('#state-date').fill('2033-01-01');
      await page.keyboard.press('Escape');
      await page.locator('.metric-grid .metric').nth(2).locator('.metric-link').click();
      const tile=name=>page.locator('.person-tile').filter({has:page.getByRole('heading',{name,exact:true})});
      const dialog=page.getByRole('dialog');
      const submit=dialog.locator('.modal-footer .primary');
      const snapshot=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).project,key);
      await tile('Anna').getByRole('button',{name:archive,exact:true}).click();
      await dialog.waitFor();
      assert.equal(await submit.isDisabled(),true,'existing shares and balance still block archive');
      await dialog.locator('.modal-header button.ghost').click();
      await dialog.waitFor({state:'hidden'});
      const direct=tile('Q40 Free').getByRole('button',{name:archive,exact:true});
      assert.equal(await direct.isVisible(),true);
      await direct.focus();
      await page.keyboard.press('Enter');
      await dialog.waitFor();
      assert.equal(await page.locator('#event-effective-date').inputValue(),'2033-01-01');
      assert.equal(await submit.isEnabled(),true);
      assert.equal((await snapshot()).events.some(e=>e.type==='person-deactivated'&&e.personId==='free'),false);
      await submit.click();
      await dialog.waitFor({state:'hidden'});
      assert.equal((await snapshot()).events.find(e=>e.type==='person-deactivated'&&e.personId==='free')?.date,'2033-01-01');
      assert.equal(await tile('Q40 Free').count(),0);
      await page.locator('.people-status-filter button').nth(1).click();
      const archived=tile('Q40 Free');
      assert.equal(await archived.getByRole('button',{name:reactivate,exact:true}).isVisible(),true);
      await archived.locator('.card-primary').click();
      const detailAction=page.locator('.detail-hero').getByRole('button',{name:reactivate,exact:true});
      assert.equal(await detailAction.isVisible(),true);
      await detailAction.click();
      await dialog.waitFor();
      await page.locator('#event-effective-date').fill('2033-01-02');
      await submit.click();
      await dialog.waitFor({state:'hidden'});
      assert.equal((await snapshot()).events.find(e=>e.type==='person-reactivated'&&e.personId==='free')?.date,'2033-01-02');
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
  }
}

async function overviewNamesAcceptance(browser,url) {
  for (const [locale,width] of [['de-DE',375],['en-GB',1280]]) {
    const context=await browser.newContext({locale,viewport:{width,height:820}});
    try {
      const page=await context.newPage();
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      const copy=structuredClone(fixture);
      for(let i=0;i<10;i++) copy.people.push({id:'q29-person-'+i,name:'Person '+String(i).padStart(2,'0')});
      const purchase=copy.events.find(e=>e.id==='purchase');
      for(let i=0;i<12;i++){
        const id='q29-item-'+i,name='Q29 Item '+String(i).padStart(2,'0');
        copy.items.push({id,name,tags:[]});
        copy.events.push({...purchase,id:'q29-buy-'+i,itemId:id,name,initialValue:400+i,
          purchaseContributionsCents:{anna:(400+i)*100},shares:{ben:1},order:i+2});
      }
      // A formerly expensive item falls below other items in a later projection.
      copy.events.find(e=>e.id==='q29-buy-11').valuation={type:'linear',durationYears:1,minimumValue:0};
      await page.goto(url);
      await page.evaluate(({key,copy})=>localStorage.setItem(key,JSON.stringify(copy)),{key,copy:oneSaved(copy)});
      await page.reload();
      await page.getByText('Browser-Abnahme').first().waitFor();
      const metrics=page.locator('.metric-grid .metric');
      const items=metrics.nth(1), people=metrics.nth(2);
      const names=loc=>loc.locator('.name-chip').allTextContents();
      assert.equal((await names(people)).length,10);
      assert.match(await people.locator('.name-more').innerText(),/3/);
      assert.deepEqual((await names(items)).map(s=>s.trim()),Array.from({length:10},(_,i)=>'Q29 Item '+String(10-i).padStart(2,'0')));
      assert.match(await items.locator('.name-more').innerText(),/3/);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
      assert.equal(overflow,false);
      await people.locator('.name-more').click();
      assert.equal(await page.locator('.person-tile').count(),13);
      const goHome=()=>page.locator(width<600?'.mobile-bottom-nav > button':'.sidebar-links > button').first().click();
      await goHome();
      await page.locator('.time-travel-toggle').click();
      await page.locator('#state-date').fill('2025-01-02');
      await page.keyboard.press('Escape');
      assert.equal((await names(items))[0].trim(),'Q29 Item 11');
      await items.locator('.metric-link').click();
      const tile=page.locator('.item-tile').filter({has:page.getByRole('heading',{name:'Q29 Item 11',exact:true})});
      assert.match(await tile.locator('.compact-names').innerText(),/Ben/);
      await tile.locator('.tile-open').click();
      const detail=page.locator('.detail-hero .compact-names');
      assert.match(await detail.innerText(),/Anna/);
      assert.match(await detail.innerText(),/Ben/);
      assert.match(await detail.innerText(),locale==='de-DE'?/Finanzierung/:/Funder/);
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
  }
}

async function recentHistoryAcceptance(browser,url) {
  for (const [locale,width] of [['de-DE',375],['en-GB',1280]]) {
    const context=await browser.newContext({locale,viewport:{width,height:820}});
    try {
      const page=await context.newPage();
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      page.on('dialog',d=>d.accept());
      const copy=structuredClone(fixture);
      copy.items.push({id:'chair',name:'Q39 chair',tags:[]});
      copy.events.push({...copy.events.find(e=>e.type==='item-added'),id:'q39-buy-chair',itemId:'chair',name:'Q39 chair',order:2});
      // Five tied events already occupy the old dashboard's limit. The later
      // grouped event must come first, once, with both actual child movements.
      for(let i=0;i<5;i++) copy.events.push({id:'q39-single-'+i,type:'shares-set',date:'2025-03-01',order:1,
        itemId:'fridge',shareUnitDeltas:{anna:1},financialMode:i%2?'none':'derived',note:'Q39 single '+i});
      copy.events.push({id:'q39-group',type:'redistribution-executed',date:'2025-03-01',order:1,
        title:'Q39 group',financialMode:'derived',events:[
          {id:'q39-child1',type:'shares-set',itemId:'fridge',shareUnitDeltas:{ben:1}},
          {id:'q39-child2',type:'shares-set',itemId:'chair',shareUnitDeltas:{clara:1}}]});
      copy.events.push({id:'q39-future',type:'shares-set',date:'2099-01-01',order:1,itemId:'chair',shareUnitDeltas:{anna:1},financialMode:'none'});
      copy.events.push({id:'q39-backdated',type:'shares-set',date:'2025-02-01',order:1,itemId:'chair',shareUnitDeltas:{ben:1},financialMode:'none'});
      await page.goto(url);
      await page.evaluate(({key,copy})=>localStorage.setItem(key,JSON.stringify(copy)),{key,copy:oneSaved(copy)});
      await page.reload();
      await page.getByText('Browser-Abnahme').first().waitFor();
      const goHome=()=>page.locator(width<600?'.mobile-bottom-nav > button':'.sidebar-links > button').first().click();
      const cutoff=async date=>{
        await page.locator('.time-travel-toggle').click();
        await page.locator('#state-date').fill(date);
        await page.keyboard.press('Escape');
      };
      const rowIds=locator=>locator.evaluateAll(rows=>rows.map(r=>r.dataset.eventId));
      const compare=async expected=>{
        await page.locator('.recent-range').first().waitFor();
        const preview=await rowIds(page.locator('.timeline-preview .timeline-event-card'));
        assert.deepEqual(preview.slice(0,expected.length),expected);
        assert.ok(preview.length<=10);
        assert.equal(new Set(preview).size,preview.length);
        await page.locator('.overview-layout.second-row .section-header button').first().click();
        const history=await rowIds(page.locator('.timeline-event-card:not(.future-event)'));
        assert.deepEqual(history.slice(0,preview.length),preview);
      };
      await cutoff('2025-03-01');
      const grouped=page.locator('.timeline-preview [data-event-id="q39-group"]');
      assert.equal(await grouped.locator('.event-unit-change').count(),2);
      assert.match(await grouped.innerText(),/Ben.*\+1/s);
      assert.match(await grouped.innerText(),/Clara.*\+1/s);
      assert.match(await page.locator('.recent-range').first().innerText(),/10/);
      await compare(['q39-group','q39-single-4','q39-single-3','q39-single-2','q39-single-1']);
      assert.equal(await page.locator('[data-event-id="q39-group"]').count(),1);
      assert.equal(await page.locator('[data-event-id="q39-group"] .event-unit-change').count(),2);
      // Delete latest group and verify both views update; undo and redo restore
      // the same boundary. Underlying event order remains untouched.
      await page.locator('[data-event-id="q39-group"] .event-open-overlay').click();
      await page.locator('.modal-footer .danger').click();
      await page.locator('.modal-backdrop').waitFor({state:'hidden'});
      await goHome();
      await compare(['q39-single-4','q39-single-3','q39-single-2','q39-single-1','q39-single-0']);
      await page.locator('.session-history-actions button').first().click();
      await goHome();
      await compare(['q39-group','q39-single-4','q39-single-3','q39-single-2','q39-single-1']);
      await page.locator('.session-history-actions button').nth(1).click();
      await goHome();
      await compare(['q39-single-4','q39-single-3','q39-single-2','q39-single-1','q39-single-0']);
      await page.locator('.session-history-actions button').first().click();
      await goHome();
      await cutoff('2025-02-01');
      await compare(['q39-backdated','q39-buy-chair','purchase','join-clara','join-ben']);
      await goHome();
      await cutoff('2099-01-01');
      await compare(['q39-future','q39-group','q39-single-4','q39-single-3','q39-single-2']);
      // Scroll the manual fallback into view: the observer loads the next batch.
      const more=page.locator('.past-more');
      if(await more.count()) await more.scrollIntoViewIfNeeded();
      await page.waitForFunction(total=>document.querySelectorAll('.timeline-event-card').length===total,copy.events.length);
      assert.equal(new Set(await rowIds(page.locator('.timeline-event-card'))).size,copy.events.length);
      await cutoff('2025-02-15');
      const marker=page.locator('.timeline-marker');
      assert.equal(await marker.getAttribute('data-cutoff'),'2025-02-15');
      assert.equal(await marker.evaluate(el=>el.previousElementSibling.classList.contains('future-event') && !el.nextElementSibling.classList.contains('future-event')),true);
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
  }
}

async function responsiveUiAcceptance(browser, url, checks = [320, 375, 390, 768, 1280], engine = 'Chromium') {
  for (const width of checks) {
    const context = await browser.newContext({
      locale: 'de-DE', viewport: { width, height: 640 }, acceptDownloads: true
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const project = structuredClone(fixture);
      project.community.name = 'Übungs-WG Q04';
      // Enough actual content to scroll; do not inject fake DOM into the app.
      const purchase = project.events.find(e => e.type === 'item-added');
      for (let i = 1; i <= 20; i++) {
        const id = 'q04-item-' + i;
        const name = 'Küchenmöbel ' + i;
        project.items.push({ id, name, tags: [] });
        project.events.push({ ...purchase, id: 'q04-purchase-' + i,
          itemId: id, name, date: '2025-01-02', order: i + 1,
          initialValue: 30 + i, purchaseContributionsCents:{anna:(30+i)*100} });
      }
      await page.goto(url);
      await page.evaluate(({ storageKey, copy }) =>
        localStorage.setItem(storageKey, JSON.stringify(copy)),
        { storageKey: key, copy: oneSaved(project) });
      await page.reload();
      await page.getByText('Übungs-WG Q04').first().waitFor();

      async function section(id) {
        const ids = ['overview', 'items', 'people', 'money', 'activity'];
        if (width > 780) {
          if (['save', 'settings'].includes(id)) {
            await page.locator('.sidebar-bottom button').nth(id === 'save' ? 0 : 1).click();
          } else {
            await page.locator('.sidebar-links button').nth(ids.indexOf(id)).click();
          }
        } else if (ids.indexOf(id) < 4 && ids.includes(id)) {
          await page.locator('.mobile-bottom-nav > button').nth(ids.indexOf(id)).click();
        } else {
          await page.locator('.mobile-more-slot > button').click();
          await page.locator('.mobile-more-menu > button')
            .nth(({ activity: 0, save: 1, settings: 2 })[id]).click();
        }
      }
      async function noOverflow(stage) {
        const dimensions = await page.evaluate(() => ({
          document: document.documentElement.scrollWidth,
          viewport: innerWidth
        }));
        assert.ok(dimensions.document <= dimensions.viewport + 2,
          'Q04 ' + width + 'px ' + stage + ' horizontal overflow: ' +
          JSON.stringify(dimensions));
      }
      await noOverflow('overview');
      await section('items');
      await noOverflow('inventory');
      const header = page.locator('.app-header');
      const cssPosition = await header.evaluate(el => getComputedStyle(el).position);
      assert.equal(cssPosition, 'sticky', 'Header must use sticky positioning at ' + width + 'px');
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForFunction(() => window.scrollY > 100, null, { timeout: 2000 });
      const headerOnScroll = await header.boundingBox();
      assert.ok(Math.abs(headerOnScroll.y) <= 1,
        'Q04 ' + width + 'px header left the viewport: ' + JSON.stringify(headerOnScroll));

      // Item details must render umlauts and an ampersand as real characters.
      await page.locator('.item-tile').filter({ hasText: 'Kühlschrank' })
        .getByRole('button').click();
      await page.getByRole('heading', { name: 'Finanzierung & Wertausgleich' }).waitFor();
      assert.equal(await page.getByText('&amp;', { exact: false }).count(), 0);
      assert.ok(await page.locator('.action-grid button svg').count() >= 3);
      await noOverflow('item detail');
      // Ownership shares: editor fields and its save footer stay usable on a
      // narrow phone; accepting a change must close the dialog cleanly.
      await page.getByRole('button', { name: 'Eigentumsanteile ändern' }).click();
      const ownershipDialog = page.locator('[role="dialog"]');
      await noOverflow('share editor');
      const firstShare = ownershipDialog.locator('.share-row input[inputmode=decimal]').first();
      const shareBounds = await firstShare.boundingBox();
      assert.ok(shareBounds.x >= 0 && shareBounds.x + shareBounds.width <= width + 2,
        'Q04 ' + width + 'px ownership field clipped');
      await firstShare.fill('2');
      const ownershipFooter = await ownershipDialog.locator('.modal-footer').boundingBox();
      assert.ok(ownershipFooter.y + ownershipFooter.height <= 642,
        'Q04 ' + width + 'px ownership save footer not visible');
      await ownershipDialog.locator('.modal-footer button.primary').click();
      await ownershipDialog.waitFor({ state: 'hidden' });

      await section('items');
      await section('overview');
      await page.locator('.quick-actions .task-grid > button').nth(1).click();
      const transferDialog = page.locator('[role="dialog"]');
      await noOverflow('transfer dialog');
      const transferFooter = await transferDialog.locator('.modal-footer').first().boundingBox();
      assert.ok(transferFooter.y + transferFooter.height <= 642,
        'Q04 ' + width + 'px transfer footer clipped');
      await transferDialog.locator('.modal-footer button').first().click();
      await transferDialog.waitFor({ state: 'hidden' });

      await section('money');
      await noOverflow('settlement');
      const helpButton = page.locator('.ledger-v3 .help-trigger').first();
      await helpButton.click();
      const help = page.locator('.help-popup');
      await help.waitFor();
      assert.match(await help.innerText(), /Anna/);
      assert.match(await help.innerText(), /200\s*€/);
      assert.match(await help.innerText(), /100\s*€/);
      assert.match(await help.innerText(), /Ben und Clara/);
      assert.match(await help.innerText(), /nichts überwiesen/);
      const popup = await help.boundingBox();
      assert.ok(popup.x >= 0 && popup.x + popup.width <= width + 2,
        'Q04 ' + width + 'px help popup clipped horizontally: ' + JSON.stringify(popup));
      // Make the tooltip genuinely scrollable at every viewport width and
      // verify keyboard access to the entire text, not merely to the trigger.
      await help.evaluate(el=>{el.style.maxHeight='60px';});
      assert.ok(await help.evaluate(el=>el.scrollHeight>el.clientHeight));
      await helpButton.focus();
      const pageScroll=await page.evaluate(()=>window.scrollY);
      await helpButton.press('End');
      assert.ok(await help.evaluate(el=>el.scrollTop>0));
      assert.equal(await page.evaluate(()=>window.scrollY),pageScroll);
      await helpButton.press('Home');
      assert.equal(await help.evaluate(el=>el.scrollTop),0);
      await helpButton.press('Escape');
      assert.equal(await help.count(), 0, 'Help should close on Escape');
      assert.equal(await helpButton.evaluate(el=>document.activeElement===el),true);
      await helpButton.press('Enter');
      await help.waitFor();
      await helpButton.press('Tab');
      assert.equal(await help.count(),0,'Help closes when focus leaves the trigger');
      await helpButton.click();
      await page.locator('.page-heading').click();
      assert.equal(await help.count(), 0, 'Help should close when clicking outside');
      const undo = page.getByRole('button', { name: /Rückgängig \(Strg\+Z\)/ });
      const redo = page.getByRole('button', { name: /Wiederholen \(Strg\+Y\)/ });
      const beforeUndo = await undo.boundingBox();
      const beforeRedo = await redo.boundingBox();
      // Check chosen historical date is the default for new payments.
      await page.getByRole('button', { name: 'Stichtag wählen' }).click();
      await page.locator('#state-date').fill('2025-01-05');
      await noOverflow('active time travel header');
      assert.match(await page.locator('.time-travel-selected-text strong').innerText(), /05\.01\.2025/);
      const datePopover = await page.locator('#time-travel-panel').boundingBox();
      assert.ok(datePopover.x >= 0 && datePopover.x + datePopover.width <= width + 2,
        'Q16 ' + width + 'px date popover clipped: ' + JSON.stringify(datePopover));
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const timeTravelHeader = await header.boundingBox();
      assert.ok(Math.abs(timeTravelHeader.y) <= 1,
        'Q16 ' + width + 'px active time-travel header no longer sticky');
      assert.equal(await page.locator('.time-travel-selected-text strong').isVisible(), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#time-travel-panel').count(),0);
      const paymentButton=page.getByRole('button', { name: 'Zahlung erfassen', exact: true });
      await paymentButton.evaluate(el=>el.scrollIntoView({block:'center'}));
      await paymentButton.click();
      const paymentDialog = page.getByRole('dialog', { name: 'Ausgleich dokumentieren' });
      assert.equal(await paymentDialog.locator('input[type=date]').inputValue(), '2025-01-05');
      await paymentDialog.getByRole('button', { name: 'Abbrechen' }).click();
      await paymentDialog.waitFor({ state: 'hidden' });
      assert.match(await page.locator('.time-travel-selected-text strong').innerText(), /05\.01\.2025/);
      await page.getByRole('button', { name: 'Stichtag wählen' }).click();
      await page.getByRole('button', { name: 'Zurück zu heute' }).click();

      await payment(page, '5');
      const afterUndo = await undo.boundingBox();
      const afterRedo = await redo.boundingBox();
      assert.ok(Math.abs(beforeUndo.x - afterUndo.x) <= 1 &&
        Math.abs(beforeRedo.x - afterRedo.x) <= 1,
        'Q04 ' + width + 'px Undo/Redo shifted when unsaved state changed');
      const wait = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Projektdatei herunterladen', exact: true }).first().click();
      await wait;
      await page.locator('.save-feedback[role="status"]').waitFor();
      if (width === 375 && engine === 'Chromium') {
        await page.locator('.save-feedback').waitFor({ state: 'hidden', timeout: 7000 });
        const secondDownload = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Projektdatei herunterladen', exact: true }).first().click();
        await secondDownload;
        await page.locator('.save-feedback[role="status"]').waitFor();
      }
      const savedUndo = await undo.boundingBox();
      assert.ok(Math.abs(beforeUndo.x - savedUndo.x) <= 1,
        'Q04 ' + width + 'px Undo shifted after saving');
      // Notifications are independent of navigation and expire on their own.
      await section('people');
      await noOverflow('people');

      // Person editor must stay within viewport and Enter must confirm.
      const addPerson = page.locator('.page-heading button').first();
      await addPerson.click();
      const personInput = page.locator('.person-name-field input');
      const field = await personInput.boundingBox();
      assert.ok(field.width < width && field.x >= -1 && field.x + field.width <= width + 2,
        'Q04 ' + width + 'px person field extends outside viewport');
      await personInput.fill('Änne Über');
      await personInput.press('Enter');
      await page.locator('[role="dialog"]').waitFor({ state: 'hidden' });
      assert.equal(await page.getByText('Änne Über').count() > 0, true);
      const addedToast = page.locator('.notification[data-kind="success"]').filter({hasText:'Person wurde hinzugefügt.'});
      await addedToast.waitFor();
      await addedToast.getByRole('button',{name:'Schließen'}).click();
      await addedToast.waitFor({state:'hidden'});
      await page.locator('.save-feedback').waitFor({state:'hidden',timeout:7000});
      await noOverflow('person added');

      await section('activity');
      await noOverflow('timeline');
      await section('save');
      await noOverflow('storage');
      await section('settings');
      await noOverflow('settings');
      assert.deepEqual(errors, [], 'Q04 ' + width + 'px browser errors');
      console.log('Browser Q04 ' + engine + ' QA: ' + width +
        'px sticky header, fixed Undo/Redo, UTF-8, icons, help, dialogs, navigation and overflow passed');
    } finally {
      await context.close();
    }
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
      await editor.locator('.storage-create input[type=password]').fill('browser-test-passphrase');
      await editor.getByLabel('Name des neuen Online-Projekts').fill('Gemeinsame Browser-Abnahme');
      await editor.locator('.storage-online details .storage-form button').click();
      await editor.getByText('Gemeinsame Browser-Abnahme').first().waitFor();
      await editor.locator('.storage-primary').click();
      await editor.getByRole('button', { name: 'Bearbeitung beenden' }).waitFor();

      const viewer = await second.newPage();
      await viewer.goto(host + '/hausstand.php');
      await openSave(viewer);
      await viewer.locator('.storage-online-list').getByLabel('Passwort des Online-Projekts').fill('browser-test-passphrase');
      await viewer.locator('.storage-online').getByRole('button', { name: 'Liste aktualisieren' }).click();
      await viewer.locator('.shared-file').getByRole('button', { name: 'Öffnen' }).click();
      await viewer.locator('.storage-primary').click();
      await viewer.getByText(/bereits ausgecheckt/).waitFor();
      // A second browser can see balances but must not be able to mutate them.
      await openFinance(viewer);
      await balance(viewer, 'Ben', '100,00');
      assert.equal(await viewer.getByRole('button', { name: 'Zahlung erfassen', exact: true }).isEnabled(), true); // Q37: entry guard gives feedback instead of disabling
      assert.equal(await viewer.getByRole('button', { name: /Rückgängig \(Strg\+Z\)/ }).isDisabled(), true);
      assert.equal(await viewer.getByRole('button', { name: 'Bearbeitung starten', exact: true }).isVisible(), true);
      await openSave(viewer);

      await openFinance(editor);
      await payment(editor, '60');
      // Keep the actual save request pending so a second click cannot start a
      // duplicate upload. Both header and storage actions must share the lock.
      let releaseSave, signalSave;
      const saveGate = new Promise(resolve => { releaseSave = resolve; });
      const saveStarted = new Promise(resolve => { signalSave = resolve; });
      let saveRequests = 0;
      const saveUrl = '**/hausstand.php?api=save';
      await editor.route(saveUrl, async route => {
        saveRequests++;
        signalSave();
        await saveGate;
        await route.continue();
      });
      const headerSave = editor.getByRole('button', { name: 'Online speichern', exact: true });
      try {
        await headerSave.click();
        await Promise.race([saveStarted, pause(10000).then(() => { throw new Error('Q06: save request did not start'); })]);
        assert.equal(await headerSave.isDisabled(), true, 'Q06: header save must be disabled during upload');
        await headerSave.evaluate(button => button.click());
        await openSave(editor);
        assert.equal(await editor.locator('.storage-primary').isDisabled(), true, 'Q06: storage save must share the upload lock');
        assert.equal(await editor.locator('.save-basic-actions input[type=file]').isDisabled(), true, 'Q06: file import must wait for upload');
      } finally { releaseSave(); }
      await editor.getByText(/Serverversion 2/).first().waitFor();
      await editor.unroute(saveUrl);
      assert.equal(saveRequests, 1, 'Q06: exactly one upload');
      const files = (await (await fetch(host + '/hausstand.php?api=files')).json()).files;
      assert.equal(files.length, 1);
      const packet = await (await fetch(host + '/hausstand.php?api=read&id=' + files[0].id)).json();
      const decoded = (await decryptProject(packet.envelope, 'browser-test-passphrase')).project;
      assert.equal(decoded.versionHistory.entries.length, 1);
      assert.equal(decoded.events.filter(e => e.type === 'claim-settlement-recorded').length, 1);
      await openSave(editor);
      await editor.getByRole('button', { name: 'Bearbeitung beenden' }).click();
      await viewer.locator('.storage-primary').click();
      await viewer.getByText(/neuere Revision|HTTP 409/).waitFor();

      // Reopen the current revision, then make a new local change. Strip
      // the lease header from one save to provoke a real PHP rejection.
      await viewer.locator('.storage-online-list').getByLabel('Passwort des Online-Projekts').fill('browser-test-passphrase');
      await viewer.locator('.storage-online-list').getByRole('button', { name: 'Liste aktualisieren' }).click();
      await viewer.locator('.shared-file').getByRole('button', { name: 'Öffnen' }).click();
      await viewer.locator('.storage-primary').click();
      await viewer.getByRole('button', { name: 'Bearbeitung beenden' }).waitFor();
      await openFinance(viewer);
      await payment(viewer, '10');
      await balance(viewer, 'Ben', '30,00');
      await viewer.route(saveUrl, async route => {
        const headers = { ...route.request().headers() };
        delete headers['x-lease-token'];
        await route.continue({ headers });
      });
      try {
        await viewer.getByRole('button', { name: 'Online speichern', exact: true }).click();
        await viewer.getByRole('button', { name: 'Bearbeitung starten', exact: true }).waitFor();
        await balance(viewer, 'Ben', '30,00');
        assert.equal(await viewer.getByRole('button', { name: 'Zahlung erfassen', exact: true }).isEnabled(), true); // Q37: entry guard gives feedback instead of disabling
        await openSave(viewer);
        assert.match(await viewer.locator('.storage-context').innerText(), /Änderungen noch nicht online gespeichert/);
        assert.equal(await viewer.getByRole('button', { name: 'Bearbeitung beenden' }).count(), 0);
        const afterConflict = await (await fetch(host + '/hausstand.php?api=read&id=' + files[0].id)).json();
        assert.equal(afterConflict.revision, packet.revision);
        assert.deepEqual((await decryptProject(afterConflict.envelope, 'browser-test-passphrase')).project, decoded);
      } finally { await viewer.unroute(saveUrl); }
      console.log('Browser PHP QA: encrypted create/open, read-only UI, exclusive lease, Save, embedded archive, stale revision and rejected save recovery passed');
    } finally { await first.close(); await second.close(); }
  } finally {
    php.kill();
    await rm(privateDir, { recursive: true, force: true });
  }
}

async function q37ReadOnlyAcceptance(browser) {
  const privateDir = await mkdtemp(join(tmpdir(), 'hausstand-q37-'));
  const port = await freePort();
  const url = 'http://127.0.0.1:' + port + '/hausstand.php';
  const php = spawn('php', ['-S', '127.0.0.1:' + port, '-t', 'dist'], {
    env: {...process.env, HAUSSTAND_DATA_DIR: privateDir, HAUSSTAND_ADMIN_TOKEN: 'q37-browser-admin'},
    stdio: ['ignore','ignore','pipe']
  });
  const contexts = [];
  try {
    let ready = false;
    for (let i=0;i<80;i++) {
      try { ready = (await fetch(url+'?api=config')).ok; if (ready) break; } catch {}
      await pause(100);
    }
    assert.ok(ready,'Q37 PHP server ready');
    const password = 'q37-browser-password';
    const token = randomSecret();
    const seeded = await fetch(url+'?api=create', {method:'POST',headers:{
      'Content-Type':'application/json','X-Hausstand-Admin':'q37-browser-admin'
    },body:JSON.stringify({id:'hausstand-hauptdatei',name:'Q37',envelope:await encryptProject(fixture,password,token),tokenHash:await hashSecret(token)})});
    assert.equal(seeded.status,200);
    const login = async (locale,width) => {
      const context = await browser.newContext({locale,viewport:{width,height:812}});
      contexts.push(context);
      const page = await context.newPage();
      await page.goto(url);
      await page.getByLabel(locale==='de-DE'?'Passwort':'Password',{exact:true}).fill(password);
      await page.getByRole('button',{name:locale==='de-DE'?'Anmelden':'Sign in',exact:true}).click();
      await page.locator('.quick-actions').waitFor();
      return page;
    };
    const editor = await login('de-DE',1280);
    const reader = await login('en-GB',375);
    const rejected = async (page,control,expected,keyboard=false) => {
      if (keyboard) await control.press('Enter'); else await control.click();
      const toast = page.locator('.notification[data-kind="error"]').filter({hasText:expected});
      await toast.waitFor();
      await toast.getByRole('button').click();
      assert.equal(await page.locator('.modal-backdrop').count(),0,'no editing dialog in read-only mode');
    };
    for (const [page,pattern] of [[editor,/schreibgeschützt.*oben rechts/s],[reader,/read-only.*top right/s]]) {
      const actions = page.locator('.quick-actions .task-grid > button');
      for (let i=0;i<3;i++) await rejected(page,actions.nth(i),pattern,i===1);
      // Navigation and the financial overview remain readable.
      assert.ok(await page.locator('.financial-overview').isVisible());
      await rejected(page,page.locator('.debt-action').first(),pattern);
    }
    // Q38: select different viewing dates before acquiring the lease.
    const setDate = async (page, date) => {
      await page.locator('.time-travel-toggle').click();
      await page.locator('#state-date').fill(date);
      await page.locator('.time-travel-close').click();
    };
    const assertDate = async (page, date) => {
      assert.equal(await page.locator('.time-travel-toggle').getAttribute('aria-pressed'), 'true');
      await page.locator('.time-travel-toggle').click();
      assert.equal(await page.locator('#state-date').inputValue(), date);
      await page.locator('.time-travel-close').click();
    };
    await setDate(editor, '2025-01-03');
    await setDate(reader, '2099-12-01');
    await editor.getByRole('button',{name:'Bearbeitung starten',exact:true}).click();
    await editor.getByRole('button',{name:'Speichern und Bearbeitung beenden',exact:true}).waitFor();
    await assertDate(editor, '2025-01-03');
    const firstAction = editor.locator('.quick-actions .task-grid > button').nth(2);
    await firstAction.click();
    const modal = editor.locator('.modal-backdrop');
    await modal.locator('input').first().fill('Q37 Person');
    await modal.locator('.modal-footer .primary').click();
    await modal.waitFor({state:'hidden'});
    await reader.getByRole('button',{name:'Start editing',exact:true}).click();
    await reader.getByText(/Could not start editing:.*already checked out/i).waitFor();
    await assertDate(reader, '2099-12-01');
    await rejected(reader,reader.locator('.quick-actions .task-grid > button').first(),/read-only.*top right/s);
    await editor.getByRole('button',{name:'Speichern und Bearbeitung beenden',exact:true}).click();
    await editor.getByRole('button',{name:'Bearbeitung starten',exact:true}).waitFor();
    await assertDate(editor, '2025-01-03');
    await rejected(editor,firstAction,/schreibgeschützt.*oben rechts/s);
    // A new checkout after check-in must once again allow editing.
    await reader.getByRole('button',{name:'Start editing',exact:true}).click();
    await reader.getByRole('button',{name:'Save and finish editing',exact:true}).waitFor();
    await assertDate(reader, '2099-12-01');
    await reader.locator('.quick-actions .task-grid > button').first().click();
    await reader.locator('.modal-backdrop').waitFor();
    assert.equal(await reader.locator('#event-effective-date').inputValue(), '2099-12-01', 'Q38: new purchase uses the selected date after checkout');
    // Simulate server-side expiry in the private test directory (not an API
    // mock). The next actual renew request must revoke the UI's permission.
    const readerModal = reader.locator('.modal-backdrop');
    const nameInput = readerModal.locator('.item-primary-fields input:not([type=date]):not([type=number])');
    await nameInput.fill('Q37 unsaved input');
    const metaPath = join(privateDir,'files','hausstand-hauptdatei','meta.json');
    const meta = JSON.parse(await readFile(metaPath,'utf8'));
    meta.leaseExpires = 1;
    await writeFile(metaPath, JSON.stringify(meta));
    const renewResponse = reader.waitForResponse(response=>response.url().includes('api=renew') && response.status()===409);
    await reader.evaluate(()=>window.dispatchEvent(new Event('focus')));
    const lostToast = reader.locator('.notification[data-kind="error"]').filter({hasText:/read-only.*top right.*expired/s});
    await lostToast.waitFor();
    await lostToast.getByRole('button').click();
    assert.equal((await renewResponse).status(),409);
    await reader.getByRole('button',{name:'Start editing',exact:true}).waitFor();
    assert.equal(await readerModal.isVisible(),true);
    assert.equal(await nameInput.inputValue(),'Q37 unsaved input');
    assert.equal(await readerModal.locator('.modal-footer .primary').isDisabled(),true);
    assert.equal(await reader.locator('#event-effective-date').inputValue(),'2099-12-01');
    await readerModal.locator('.modal-header button.ghost').click();
    await readerModal.waitFor({state:'hidden'});
    await rejected(reader,reader.locator('.quick-actions .task-grid > button').first(),/read-only.*expired/s);
    const afterExpiry = JSON.parse(await readFile(metaPath,'utf8'));
    assert.equal(afterExpiry.revision,meta.revision,'rejected lease must not change server revision');
  } finally {
    for (const context of contexts) await context.close();
    php.kill();
    await rm(privateDir,{recursive:true,force:true});
  }
}

async function q42MailAcceptance(browser) {
  for (const mode of ['accepted','rejected','disabled']) {
    const root=await mkdtemp(join(tmpdir(),'hausstand-q42-'));
    const port=await freePort();
    const url='http://127.0.0.1:'+port+'/hausstand.php';
    const script=join(root,'sendmail.sh'), rejectFile=join(root,'reject');
    await writeFile(script,'#!/bin/sh\ncat >/dev/null\nif [ -f "$HAUSSTAND_TEST_REJECT" ]; then exit 1; fi\nexit 0\n',{mode:0o700});
    if(mode==='rejected') await writeFile(rejectFile,'reject');
    const php=spawn('php',['-d','sendmail_path='+script,'-S','127.0.0.1:'+port,'-t','dist'],{
      env:{...process.env,HAUSSTAND_DATA_DIR:root,HAUSSTAND_ADMIN_TOKEN:'q42-test-admin',
        HAUSSTAND_BACKUP_EMAIL:mode==='disabled'?'':'backup@example.test',
        HAUSSTAND_MAIL_FROM:mode==='disabled'?'':'sender@example.test',
        HAUSSTAND_TEST_REJECT:rejectFile},stdio:['ignore','ignore','pipe']
    });
    const de=mode!=='accepted';
    const context=await browser.newContext({locale:de?'de-DE':'en-GB',viewport:{width:de?375:1280,height:812}});
    try {
      let ready=false;
      for(let i=0;i<80;i++){try{ready=(await fetch(url+'?api=config')).ok;if(ready)break;}catch{} await pause(100);}
      assert.ok(ready);
      const id='hausstand-hauptdatei', password='q42-browser-password', token=randomSecret();
      const created=await fetch(url+'?api=create',{method:'POST',headers:{'Content-Type':'application/json','X-Hausstand-Admin':'q42-test-admin'},body:JSON.stringify({
        id,name:'Q42',envelope:await encryptProject(fixture,password,token),tokenHash:await hashSecret(token)
      })});
      assert.equal(created.status,200);
      const page=await context.newPage();
      await page.goto(url);
      await page.getByLabel(de?'Passwort':'Password',{exact:true}).fill(password);
      await page.getByRole('button',{name:de?'Anmelden':'Sign in',exact:true}).click();
      await page.locator('.quick-actions').waitFor();
      await page.getByRole('button',{name:de?'Bearbeitung starten':'Start editing',exact:true}).click();
      const save=page.getByRole('button',{name:de?'Speichern und Bearbeitung beenden':'Save and finish editing',exact:true});
      await save.waitFor();
      await page.locator('.quick-actions .task-grid > button').nth(2).click();
      const modal=page.locator('.modal-backdrop');
      await modal.locator('input').first().fill('Q42 '+mode);
      await modal.locator('.modal-footer .primary').click();
      await modal.waitFor({state:'hidden'});
      const saved=page.locator('.notification[data-kind="success"]').filter({hasText:de?'Verschlüsselter Projektstand auf dem Server gespeichert.':'Encrypted project saved on the server.'});
      if(mode==='disabled'){
        await page.route('**/hausstand.php?api=save',route=>route.abort());
        await save.click();
        await page.locator('.notification[data-kind="error"]').filter({hasText:/Speichern oder Einchecken fehlgeschlagen/}).waitFor();
        assert.equal(await saved.count(),0);
        assert.equal(await (await (await fetch(url+'?api=read&id='+id)).json()).revision,1);
        await page.unroute('**/hausstand.php?api=save');
      }
      let release, signal;
      const gate=new Promise(resolve=>release=resolve);
      const started=new Promise(resolve=>signal=resolve);
      let saves=0;
      await page.route('**/hausstand.php?api=save',async route=>{saves++;signal();await gate;await route.continue();});
      try {
        await save.click();
        await Promise.race([started,pause(10000).then(()=>{throw Error('Q42 save did not start');})]);
        assert.ok(await save.isDisabled());
        await page.locator('.server-edit-status').filter({hasText:de?'Speichern und E-Mail-Sicherung prüfen':'Saving and checking email backup'}).waitFor();
        assert.equal(await saved.count(),0);
        await save.evaluate(button=>button.click());
      } finally {release();}
      await saved.waitFor();
      assert.equal(saves,1);
      await page.unroute('**/hausstand.php?api=save');
      const mailText=mode==='accepted'?'Email backup accepted by the mail service. Delivery is not confirmed.':mode==='rejected'?'E-Mail-Sicherung fehlgeschlagen: Maildienst hat den Versandauftrag abgelehnt.':'E-Mail-Sicherung nicht eingerichtet; keine E-Mail versandt.';
      await page.locator('.notification').filter({hasText:mailText}).waitFor();
      await page.getByRole('button',{name:de?'Bearbeitung starten':'Start editing',exact:true}).waitFor();
      const packet=await (await fetch(url+'?api=read&id='+id)).json();
      assert.equal(packet.revision,2);
      assert.ok((await decryptProject(packet.envelope,password)).project.people.some(p=>p.name==='Q42 '+mode));
      if(mode==='rejected'){
        const retry=page.getByRole('button',{name:'E-Mail-Sicherung erneut versuchen',exact:true});
        await retry.waitFor();
        const metaPath=join(root,'files',id,'meta.json');
        const meta=JSON.parse(await readFile(metaPath,'utf8'));
        meta.mailQueue.find(e=>e.revision===2).lastAttempt=0;
        await writeFile(metaPath,JSON.stringify(meta));
        await rm(rejectFile);
        await retry.click();
        await page.locator('.notification').filter({hasText:'E-Mail-Sicherung vom Maildienst angenommen. Die Zustellung ist nicht bestätigt.'}).waitFor();
        await retry.waitFor({state:'hidden'});
        const after=await (await fetch(url+'?api=read&id='+id)).json();
        assert.equal(after.revision,2);
        assert.deepEqual(after.envelope,packet.envelope);
      }
    } finally { await context.close(); php.kill(); await rm(root,{recursive:true,force:true}); }
  }
}

let browser;
let server;
const extraBrowsers = [];
const failures = [];

// Each scenario owns independent browser contexts. A failed selector in one
// scenario must not prevent the PHP/security and other engine checks from
// producing their own results. The overall workflow still fails on any error.
async function acceptance(name, run) {
  console.log('Browser QA start: ' + name);
  try {
    await run();
    console.log('Browser QA passed: ' + name);
  } catch (error) {
    failures.push(new Error(name, { cause: error }));
    console.error('Browser QA failed: ' + name, error);
  }
}

try {
  browser = await chromium.launch({ headless: true });
  const offlineServer = await makeHttpServer();
  server = offlineServer.server;
  await acceptance('Chromium Q42 save and email backup feedback', () => q42MailAcceptance(browser));
  await acceptance('Chromium Q37 read-only dialog guard', () => q37ReadOnlyAcceptance(browser));
  await acceptance('Chromium Q32 item entry', () => itemEntryAcceptance(browser, offlineServer.url, 'Chromium'));
  await acceptance('Chromium Q32/Q33 long list', () => itemEntryLongListAcceptance(browser, offlineServer.url, 'Chromium'));
  await acceptance('Chromium Q33 other form drafts', () => formStateAcceptance(browser, offlineServer.url, 'Chromium'));
  await acceptance('Chromium localization', () => localization(browser, offlineServer.url));
  await acceptance('Chromium offline', () => offline(browser, offlineServer.url));
  await acceptance('Chromium portable file', () => portableFileAcceptance(browser, offlineServer.url, 'Chromium'));
  await acceptance('Chromium Q03 settlement', () => settlementEndToEnd(browser, offlineServer.url));
  await acceptance('Chromium Q06 invalid inputs', () => invalidInputAcceptance(browser, offlineServer.url));
  await acceptance('Chromium Q06 PHP online', () => phpOnline(browser));
  await acceptance('Chromium Q30 signed share changes', () => shareDeltaAcceptance(browser, offlineServer.url));
  await acceptance('Chromium Q36 unit movement display', () => unitMovementDisplayAcceptance(browser, offlineServer.url));
  await acceptance('Chromium Q25 whole cards', () => wholeCardAcceptance(browser, offlineServer.url));
  await acceptance('Chromium Q29 compact names', () => overviewNamesAcceptance(browser, offlineServer.url));
  await acceptance('Chromium Q39 recent history', () => recentHistoryAcceptance(browser, offlineServer.url));
  await acceptance('Chromium Q31 mobile financing', () => purchaseFinancingAcceptance(browser, offlineServer.url));
  await acceptance('Chromium Q27 guided archive', () => guidedArchiveAcceptance(browser, offlineServer.url));
  await acceptance('Chromium Q40 archive discoverability', () => archiveDiscoverabilityAcceptance(browser, offlineServer.url));
  await acceptance('Chromium Q14/Q15/Q19 time travel', () => timeTravelFormsAcceptance(browser, offlineServer.url));
  await acceptance('Chromium responsive UI', () => responsiveUiAcceptance(browser, offlineServer.url));
  for (const [name, browserType] of [['Firefox', firefox], ['WebKit', webkit]]) {
    await acceptance(name + ' browser launch', async () => {
      const additional = await browserType.launch({ headless: true });
      extraBrowsers.push(additional);
      await acceptance(name + ' Q32 item entry', () => itemEntryAcceptance(additional, offlineServer.url, name));
      await acceptance(name + ' Q32/Q33 long list', () => itemEntryLongListAcceptance(additional, offlineServer.url, name));
      await acceptance(name + ' Q33 other form drafts', () => formStateAcceptance(additional, offlineServer.url, name));
      await acceptance(name + ' Q36 unit movement display', () => unitMovementDisplayAcceptance(additional, offlineServer.url));
      await acceptance(name + ' Q25 whole cards', () => wholeCardAcceptance(additional, offlineServer.url));
      await acceptance(name + ' Q29 compact names', () => overviewNamesAcceptance(additional, offlineServer.url));
      await acceptance(name + ' Q40 archive discoverability', () => archiveDiscoverabilityAcceptance(additional, offlineServer.url));
      await acceptance(name + ' Q39 recent history', () => recentHistoryAcceptance(additional, offlineServer.url));
      await acceptance(name + ' responsive UI', () => responsiveUiAcceptance(additional, offlineServer.url, [375, 1280], name));
      await acceptance(name + ' portable file', () => portableFileAcceptance(additional, offlineServer.url, name));
    });
  }
  if (failures.length) throw new AggregateError(failures, failures.length + ' browser QA scenario(s) failed');
} finally {
  for (const extra of extraBrowsers) await extra.close();
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
