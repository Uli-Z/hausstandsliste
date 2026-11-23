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
        await page.getByRole('button',{name:'Stichtag wählen'}).click();
      }
      await page.locator('#state-date').fill(date);
    }
    const dialog=page.locator('[role="dialog"]');
    const dateField=page.locator('#event-effective-date');

    await cutoff('2026-01-01');
    await nav('Gegenstände').click();
    await page.locator('.item-tile').filter({hasText:'Sessel'}).locator('.tile-open').click();
    await page.locator('.timeline-panel .timeline-more').first().click();
    const cards=await page.locator('.timeline-panel .timeline-event-card .event-summary').allTextContents();
    assert.match(cards[0],/Latest future entry/);
    assert.match(cards[1],/Second future entry/);
    assert.match(cards[2],/First future entry/);
    await page.locator('.timeline-event-card').filter({hasText:'Latest future entry'}).locator('.edit-button').click();
    assert.equal(await dialog.locator('input[type="date"]').inputValue(),'2030-01-01');
    await dialog.locator('.modal-header button').click();

    await nav('Gegenstände').click();
    await page.locator('.page-heading button').first().click();
    assert.equal(await dateField.inputValue(),'2026-01-01');
    await dateField.fill('2031-01-15');
    await dialog.locator('.form-grid input').first().fill('Zeitreise-Lampe');
    await dialog.locator('.modal-footer .primary').click();
    await dialog.waitFor({state:'hidden'});
    assert.equal((await snapshot()).events.find(e=>e.name==='Zeitreise-Lampe')?.date,'2031-01-15');
    assert.equal(await page.locator('#state-date').inputValue(),'2031-01-15');

    await nav('Personen').click();
    await page.locator('.page-heading button').first().click();
    assert.equal(await dateField.inputValue(),'2031-01-15');
    await dateField.fill('2032-03-11');
    await dialog.locator('.person-name-field input').fill('Carla');
    await dialog.locator('.modal-footer .primary').click();
    await dialog.waitFor({state:'hidden'});
    assert.equal((await snapshot()).events.find(e=>e.name==='Carla')?.date,'2032-03-11');

    await page.locator('.person-tile').filter({hasText:'Anna'}).locator('.person-bottom button').click();
    await page.getByRole('button',{name:'Als ausgezogen markieren'}).click();
    assert.equal(await dateField.inputValue(),'2032-03-11');
    await dateField.fill('2032-04-05');
    await dialog.locator('.modal-footer .primary').click();
    await dialog.waitFor({state:'hidden'});
    assert.equal((await snapshot()).events.find(e=>e.type==='person-deactivated'&&e.personId==='anna')?.date,'2032-04-05');

    await nav('Geld & Ausgleich').click();
    await page.locator('.page-heading button').first().click();
    assert.equal(await page.locator('#redistribution-effective-date').inputValue(),'2032-04-05');
    await page.locator('#redistribution-effective-date').fill('2024-01-01');
    assert.equal(await dialog.locator('.redistribution-item-card').count(),0);
    await page.locator('#redistribution-effective-date').fill('2032-04-05');
    assert.ok(await dialog.locator('.redistribution-item-card').count()>0);
    await dialog.locator('.modal-header button').click();

    await page.getByRole('button',{name:'Zahlung erfassen',exact:true}).click();
    assert.equal(await dialog.getByLabel('Zahlungsdatum').inputValue(),'2032-04-05');
    await dialog.locator('.modal-header button').click();

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
    await dialog.locator('.modal-header button').click();

    assert.deepEqual(failures,[]);
    console.log('Q14/Q15/Q19 time-travel form and chronological UI acceptance passed');
  } finally {
    await context.close();
  }
}
