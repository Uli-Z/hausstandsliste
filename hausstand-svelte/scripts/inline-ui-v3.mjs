import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),bundle=path.join(root,'dist','ui-v3-bundle');
let html=await readFile(path.join(bundle,'index.html'),'utf8');
for(const file of await readdir(path.join(bundle,'assets'))){
 const content=await readFile(path.join(bundle,'assets',file),'utf8');
 if(file.endsWith('.js')) html=html.replace(/<script\b[^>]*\bsrc=["']\/assets\/[^"']+\.js["'][^>]*><\/script>/i,()=>'<script type="module">'+content+'</script>');
 else if(file.endsWith('.css')) html=html.replace(/<link\b[^>]*\bhref=["']\/assets\/[^"']+\.css["'][^>]*>/i,()=>'<style>'+content+'</style>');
}
assert.match(html,/<div\s+id=["']app["']\s*><\/div>/i,'Mount element missing');
assert.match(html,/<script\s+type=["']module["']>/i,'Deferred module script missing');
assert.match(html,/<style>/i,'Inline CSS missing');
assert.doesNotMatch(html,/<(?:script|link)[^>]+(?:src|href)=["']\/assets\//i,'Uninlined assets');
for(const label of ['Gegenstände','Personen','Geld & Ausgleich','Änderungen','Sichern & Teilen'])assert.ok(html.includes(label),'Navigation missing: '+label);
assert.match(html,/mobile-bottom-nav/,'Mobile bottom navigation missing');
assert.match(html,/mobile-more-menu/,'Mobile more menu missing');
assert.match(html,/safe-area-inset-bottom/,'Mobile safe-area CSS missing');
// The current V3 finance screen uses responsive cards, not the old table
// with data-label="Betrag" cells. Verify its real mobile layout instead.
const ledgerSource = await readFile(path.join(root,'ui-v3','LedgerView.svelte'),'utf8');
for (const className of ['transfer-row', 'transfer-amount', 'person-balance-row', 'audit-row']) {
 assert.ok(ledgerSource.includes('class="'+className+'"'), 'Finance screen markup missing: '+className);
 assert.ok(html.includes(className), 'Finance screen missing from compiled bundle: '+className);
}
assert.match(ledgerSource,/@media\(max-width:620px\)/,'Finance screen mobile breakpoint missing');
assert.match(ledgerSource,/\.transfer-row\{grid-template-columns:minmax\(0,1fr\) auto/,'Mobile payment suggestions must fit two columns');
assert.match(ledgerSource,/\.transfer-action\{grid-column:1\/-1/,'Mobile settlement action must span full row');
assert.match(html,/person-name-field/,'Person name field must be layout-bounded');
assert.match(await readFile(path.join(root,'ui-v3','DialogRouter.svelte'),'utf8'),/confirmFromInput/,'Dialog Enter handling missing');

const phpMode=process.argv.includes('--php');
const out=phpMode ? path.join(root,'dist') : path.join(root,'dist','pages','ui-v3');
const filename=phpMode?'php-ui.html':'index.html';
await mkdir(out,{recursive:true});
await writeFile(path.join(out,filename),html,'utf8');
console.log((phpMode?'PHP UI V3':'Standalone UI V3')+' validated: '+path.join(out,filename));
