// One-off, request-triggered UI inventory. Uses only fictitious test data.
// AUDIT_IMAGE lines are JPEG snapshots from the actual browser rendering.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const project = {
  schemaVersion: 1, appVersion: '0.7.0-svelte', currency: 'EUR',
  community: { name: 'Beispiel-WG für UX-Abnahme' },
  people: [
    { id: 'anna', name: 'Anna' }, { id: 'ben', name: 'Ben' },
    { id: 'clara', name: 'Clara' }
  ],
  items: [{ id: 'fridge', name: 'Kühlschrank', note: 'Gemeinsame Küche', tags: ['Küche'] }],
  events: [
    ...['anna','ben','clara'].map((id, i) => ({
      id:'join-' + id, type:'person-added', personId:id, name:id,
      date:'2025-01-01', order:i+1
    })),
    { id:'purchase', type:'item-added', itemId:'fridge', name:'Kühlschrank',
      date:'2025-01-02', order:1, initialValue:300,
      valuation:{type:'fixed',minimumValue:0},
      financialMode:'derived', financedByPersonId:'anna',
      shares:{anna:1,ben:1,clara:1} }
  ],
  drafts: [], lastSavedAt:'2025-01-02T09:00:00.000Z',
  versionHistory:{format:'portable-v1',entries:[]}
};
const copy = {project,savedProject:project,savedHistoryIds:[],fileName:'qa.json',dirty:false};
const storageKey = 'hausstand_svelte_v07_working_copy';

const html = await readFile('dist/hausstand-standalone.html');
const server = createServer((req,res) => {
  res.writeHead(200,{'content-type':'text/html; charset=utf-8', 'cache-control':'no-store'});
  res.end(html);
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const url = 'http://127.0.0.1:' + server.address().port + '/app';
const browser = await chromium.launch({headless:true});
const issues = [];
try {
  for (const width of [1280,375]) {
    const isMobile = width < 600;
    const context = await browser.newContext({locale:'de-DE',viewport:{width,height:isMobile?812:900}});
    const page = await context.newPage();
    page.on('pageerror', error => issues.push(width + 'px: ' + error.message));
    await page.goto(url);
    await page.evaluate(([key,value]) => localStorage.setItem(key,JSON.stringify(value)),[storageKey,copy]);
    await page.reload();
    await page.getByText('Beispiel-WG für UX-Abnahme').first().waitFor();

    async function nav(name) {
      if (!isMobile) {
        if (name === 'save') await page.locator('.sidebar-bottom button').nth(0).click();
        else if (name === 'settings') await page.locator('.sidebar-bottom button').nth(1).click();
        else await page.locator('.sidebar-links button').nth(['overview','items','people','money','activity'].indexOf(name)).click();
      } else if (['overview','items','people','money'].includes(name)) {
        await page.locator('.mobile-bottom-nav > button').nth(['overview','items','people','money'].indexOf(name)).click();
      } else {
        await page.locator('.mobile-more-slot > button').click();
        await page.locator('.mobile-more-menu button').nth(['activity','save','settings'].indexOf(name)).click();
      }
      await page.waitForTimeout(80);
    }
    async function snapshot(name, capture = true) {
      const data = await page.evaluate(() => {
        const elements = [...document.querySelectorAll('button')].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
        });
        const help = [...document.querySelectorAll('[aria-label]')].filter(e => {
          const s = e.getAttribute('aria-label') || '';
          return /was|wie|warum|what|how|why|hilf/i.test(s) && e.getBoundingClientRect().height > 0;
        });
        return {
          title: document.querySelector('.page-heading h1')?.textContent?.trim() || document.querySelector('.detail-title h2')?.textContent?.trim() || '',
          headings: [...document.querySelectorAll('main h2,main h3,[role=dialog] h3')].filter(e => e.getBoundingClientRect().height>0).map(e => e.textContent.trim()).slice(0,22),
          buttons: elements.map(e=>e.getAttribute('aria-label') || e.textContent.trim()).filter(Boolean).slice(0,38),
          visibleButtons: elements.length,
          helpCount: help.length,
          smallButtons: elements.filter(e=>e.getBoundingClientRect().height<34).map(e => e.getAttribute('aria-label') || e.textContent.trim()).filter(Boolean).slice(0,12),
          alerts: [...document.querySelectorAll('[role=alert],.inline-info.warning,.notice.warn')].filter(e => e.getBoundingClientRect().height>0).map(e=>e.textContent.trim().slice(0,120)),
          viewportWidth:innerWidth,scrollWidth:document.documentElement.scrollWidth,
          screenHeight:document.documentElement.scrollHeight,
          htmlLang:document.documentElement.lang
        };
      });
      console.log('AUDIT_SCREEN|' + width + '|' + name + '|' + JSON.stringify(data));
      assert.ok(data.scrollWidth <= width+3,name + ' horizontal overflow at ' + width);
      if (capture) {
        const jpeg=await page.screenshot({type:'jpeg',quality:48,fullPage:false});
        console.log('AUDIT_IMAGE|' + width + '-' + name + '|' + jpeg.toString('base64'));
      }
    }
    await snapshot('overview');
    for(const name of ['items','people','money','activity','save','settings']) {
      await nav(name); await snapshot(name);
      if (name==='save' || name==='settings') {
        await page.evaluate(() => window.scrollTo(0,document.documentElement.scrollHeight));
        await page.waitForTimeout(100);
        await snapshot(name + '-bottom');
      }
    }

    await nav('items');
    await page.locator('.item-tile .tile-open').first().click();
    await snapshot('item-detail');
    await nav('people');
    await page.locator('.person-tile button').first().click();
    await snapshot('person-detail');

    await nav('overview');
    await page.locator('.task-grid button').nth(0).click();
    await page.getByRole('dialog').waitFor();
    await snapshot('dialog-add-item');
    await page.reload();

    await page.locator('.task-grid button').nth(2).click();
    await page.getByRole('dialog').waitFor();
    await snapshot('dialog-add-person');
    await page.reload();

    await page.locator('.task-grid button').nth(1).click();
    await page.getByRole('dialog').waitFor();
    await snapshot('dialog-redistribution');
    await page.reload();

    await page.locator('.debt-action').first().click();
    await page.getByRole('dialog').waitFor();
    await snapshot('dialog-settlement');
    await page.reload();

    await nav('items');
    await page.locator('.item-tile .tile-open').first().click();
    const edit = page.getByRole('button',{name:'Eigentumsanteile ändern'});
    if (await edit.count()) {
      await edit.click();
      await page.getByRole('dialog').waitFor();
      await snapshot('dialog-ownership');
    }
    await context.close();
  }
  assert.deepEqual(issues,[]);
  console.log('AUDIT_DONE|20+ route, detail and dialog snapshots; errors=0');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}