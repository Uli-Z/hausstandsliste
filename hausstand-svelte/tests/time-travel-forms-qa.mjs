// Manually triggered browser QA (not part of push/PR CI).
import assert from 'node:assert/strict';

const key = 'hausstand_svelte_v07_working_copy';
const project = {
  schemaVersion:1, appVersion:'0.7.0-svelte', currency:'EUR',
  community:{name:'Zeitreise-Formulare'},
  people:[{id:'anna',name:'Anna'},{id:'ben',name:'Ben'}],
  items:[{id:'chair',name:'Sessel',tags:[]}],
  events:[
    {id:'p1',type:'person-added',date:'2025-01-01',order:1,personId:'anna',name:'Anna'},
    {id:'p2',type:'person-added',date:'2025-01-01',order:2,personId:'ben',name:'Ben'},
    {id:'buy',type:'item-added',date:'2025-01-02',order:3,itemId:'chair',name:'Sessel',
     initialValue:100,valuation:{type:'fixed',minimumValue:0},shares:{anna:1,ben:1},
     financialMode:'derived',financedByPersonId:'anna'},
    {id:'future1',type:'shares-set',date:'2029-06-01',order:1,itemId:'chair',
     shares:{anna:1,ben:1},financialMode:'none',note:'First future entry'},
    {id:'future2',type:'shares-set',date:'2029-06-01',order:2,itemId:'chair',
     shares:{anna:2,ben:1},financialMode:'none',note:'Second future entry'},
    {id:'future3',type:'shares-set',date:'2030-01-01',order:1,itemId:'chair',
     shares:{anna:2,ben:1},financialMode:'none',note:'Latest future entry'}
  ],
  drafts:[],lastSavedAt:'2025-01-02T09:00:00.000Z',versionHistory:{format:'portable-v1',entries:[]}
};

export async function timeTravelFormsAcceptance(browser,url) {
  const context=await browser.newContext({locale:'de-DE',viewport:{width:1280,height:820}});
  try {
    const page=await context.newPage();
    const failures=[];
    page.on('pageerror',error=>failures.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(url);
    await page.evaluate(({key,project})=>localStorage.setItem(key,JSON.stringify({
      project,savedProject:project,fileName:'time-travel.json',dirty:false
    })),{key,project});
    await page.reload();
    await page.getByText('Zeitreise-Formulare').first().waitFor();
    const nav=name=>page.locator('.sidebar-links').getByRole('button',{name});
    const snapshot=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).project,key);
    async function cutoff(date) {
      if (!await page.locator('#time-travel-panel').count()) {
        await page.locator('.time-travel-toggle').click();
      }
      await page.locator('#state-date').fill(date);
    }
    const dialog=page.locator('[role="dialog"]');
    const dateField=page.locator('#event-effective-date');

    await cutoff('2026-01-01');
    await nav('Gegenstände').click();
    await page.locator('.item-tile').filter({hasText:'Sessel'}).locator('.tile-open').click();
    const timeline = page.locator('.timeline-panel');
    const eventCards = timeline.locator('.timeline-event-card');
    async function checkHistory(expectedFuture) {
      // Future events are collapsed by default; preserve the application's choice
      // when already expanded while changing the date within the item detail.
      if (expectedFuture > 0 && !await timeline.locator('.future-event').count()) {
        await timeline.locator('.timeline-more').first().click();
      }
      assert.equal(await eventCards.count(), 4, 'Q14: all four item events visible');
      const cards = await eventCards.locator('.event-summary').allTextContents();
      assert.match(cards[0], /Latest future entry/);
      assert.match(cards[1], /Second future entry/);
      assert.match(cards[2], /First future entry/);
      assert.match(cards[3], /Startwert/);
      const actualFuture = await eventCards.evaluateAll(nodes =>
        nodes.map(node => node.classList.contains('future-event')));
      assert.deepEqual(actualFuture, Array.from({length: 4}, (_, i) => i < expectedFuture),
        'Q14: future markers match the selected date without changing chronological order');
    }
    const beforeHistory = await snapshot();
    await checkHistory(3);
    await timeline.locator('.timeline-event-card').filter({hasText:'Latest future entry'}).locator('.event-open-overlay').press('Enter');
    assert.equal(await dialog.locator('input[type="date"]').inputValue(),'2030-01-01');
    await dialog.locator('.modal-header > button.ghost').click();

    await cutoff('2029-06-01'); // same-day entries cross the cutoff together
    await checkHistory(1);
    await cutoff('2030-01-01'); // latest entry is now part of the historical state
    await checkHistory(0);
    await cutoff('2025-01-02'); // back to the purchase date
    await checkHistory(3);
    await cutoff('2026-01-01');
    await page.locator('.time-travel-today').click();
    const today = await page.evaluate(() => {
      const d = new Date();
      return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
    });
    await checkHistory(['2030-01-01', '2029-06-01', '2029-06-01'].filter(date => date > today).length);
    assert.deepEqual((await snapshot()).events, beforeHistory.events, 'Q14: browsing history never rewrites events');
    await cutoff('2026-01-01');
    await nav('Gegenstände').click();
    await page.locator('.page-heading button').first().click();
    assert.equal(await dateField.inputValue(),'2026-01-01');
    await dateField.fill('2031-01-15');
    await dialog.locator('.form-grid input').first().fill('Zeitreise-Lampe');
    await dialog.locator('.modal-footer .primary').click();
    await dialog.waitFor({state:'hidden'});
    const lamp = (await snapshot()).events.find(e=>e.name==='Zeitreise-Lampe');
    assert.equal(lamp?.date,'2031-01-15');
    assert.match(await page.locator('.time-travel-selected-text strong').innerText(), /15\.01\.2031/);

    // Share changes and archiving use the selected date, even when edited in
    // the open form. The current item must still exist on that effective date.
    await nav('Gegenstände').click();
    await page.locator('.item-tile').filter({hasText:'Zeitreise-Lampe'}).locator('.tile-open').click();
    await page.getByRole('button',{name:'Eigentumsanteile ändern'}).click();
    assert.equal(await dateField.inputValue(),'2031-01-15', 'share editor starts on the lamp purchase date');
    await dateField.fill('2031-02-01');
    await dialog.locator('.share-row input[type="number"]').first().fill('2');
    await dialog.locator('.modal-footer .primary').click();
    await dialog.waitFor({state:'hidden'});
    assert.ok((await snapshot()).events.some(e=>e.type==='shares-set' &&
      e.itemId===lamp.itemId && e.date==='2031-02-01'));

    await page.locator('.secondary-actions summary').click();
    await page.getByRole('button',{name:'Gegenstand beenden'}).click();
    assert.equal(await dateField.inputValue(),'2031-02-01');
    await dateField.fill('2031-03-01');
    await dialog.locator('.modal-footer .danger').click();
    await dialog.waitFor({state:'hidden'});
    assert.ok((await snapshot()).events.some(e=>e.type==='item-ended' &&
      e.itemId===lamp.itemId && e.date==='2031-03-01'));

    await nav('Personen').click();
    await page.locator('.page-heading button').first().click();
    assert.equal(await dateField.inputValue(),'2031-03-01', 'new person inherits the latest cutoff after archiving');
    await dateField.fill('2032-03-11');
    await dialog.locator('.person-name-field input').fill('Carla');
    await dialog.locator('.modal-footer .primary').click();
    await dialog.waitFor({state:'hidden'});
    assert.equal((await snapshot()).events.find(e=>e.name==='Carla')?.date,'2032-03-11');

    await page.locator('.person-tile').filter({hasText:'Anna'}).locator('.person-bottom button').click();
    // Person actions are intentionally collapsed in the detail view.
    const personActions = page.locator('.detail-hero .secondary-actions');
    async function openPersonActions() {
      if (await personActions.getAttribute('open') === null) {
        await personActions.locator('summary').click();
      }
    }
    await openPersonActions();
    await personActions.getByRole('button',{name:'Als ausgezogen markieren'}).click();
    assert.equal(await dateField.inputValue(),'2032-03-11');
    await dateField.fill('2032-04-05');
    await dialog.locator('.modal-footer .primary').click();
    await dialog.waitFor({state:'hidden'});
    assert.equal((await snapshot()).events.find(e=>e.type==='person-deactivated'&&e.personId==='anna')?.date,'2032-04-05');
    await openPersonActions();
    await personActions.getByRole('button',{name:'Wieder aufnehmen'}).click();
    assert.equal(await dateField.inputValue(),'2032-04-05');
    await dateField.fill('2032-05-05');
    await dialog.locator('.modal-footer .primary').click();
    await dialog.waitFor({state:'hidden'});
    assert.equal((await snapshot()).events.find(e=>e.type==='person-reactivated'&&e.personId==='anna')?.date,'2032-05-05');

    await nav('Überblick').click();
    await page.locator('.quick-actions .task-grid > button').nth(1).click();
    assert.equal(await page.locator('#redistribution-effective-date').inputValue(),'2032-05-05');
    await page.locator('#redistribution-effective-date').fill('2024-01-01');
    assert.equal(await dialog.locator('.redistribution-item-card').count(),0);
    await page.locator('#redistribution-effective-date').fill('2032-05-05');
    assert.ok(await dialog.locator('.redistribution-item-card').count()>0);
    await dialog.locator('.modal-header > button.ghost').click();

    // Manual payment recording lives on the money page, not the overview.
    await nav('Geld & Ausgleich').click();
    await page.getByRole('button',{name:'Zahlung erfassen',exact:true}).click();
    assert.equal(await dialog.getByLabel('Zahlungsdatum').inputValue(),'2032-05-05');
    await dialog.locator('.modal-header > button.ghost').click();

    // Replacement forms are dated; plain metadata edits are intentionally not.
    await nav('Gegenstände').click();
    await page.locator('.item-tile').filter({hasText:'Sessel'}).locator('.tile-open').click();
    await page.locator('.secondary-actions summary').click();
    await page.locator('.secondary-actions .action-grid button').filter({hasText:'Durch neuen Gegenstand ersetzen'}).click();
    assert.equal(await dateField.inputValue(),'2032-05-05');
    await dialog.locator('.modal-header > button.ghost').click();
    await page.locator('.secondary-actions .action-grid button').first().click();
    assert.equal(await dateField.count(),0);
    await dialog.locator('.modal-header > button.ghost').click();

    await nav('Gegenstände').click();
    await page.locator('.page-heading button').first().click();
    await dateField.fill('2027-07-07');
    await dialog.locator('.form-grid input').first().fill('Geplanter Gegenstand');
    await dialog.getByRole('button',{name:'Als Entwurf sichern'}).click();
    await dialog.waitFor({state:'hidden'});
    assert.equal((await snapshot()).drafts.find(d=>d.data?.name==='Geplanter Gegenstand')?.data?.effectiveDate,'2027-07-07');
    await cutoff('2033-01-01');
    await nav('Überblick').click();
    await page.locator('.draft-row').filter({hasText:'Geplanter Gegenstand'}).getByRole('button',{name:'Weiter'}).click();
    assert.equal(await dateField.inputValue(),'2027-07-07');
    await dialog.locator('.modal-header > button.ghost').click();

    assert.deepEqual(failures,[]);
    console.log('Q14/Q15/Q19 time-travel form and chronological UI acceptance passed');
  } finally {
    await context.close();
  }
}
