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
assert.match(html,/data-label="Betrag"/,'Mobile finance row labels missing');

const out=path.join(root,'dist','pages','ui-v3');await mkdir(out,{recursive:true});await writeFile(path.join(out,'index.html'),html,'utf8');
console.log('Standalone UI V3 validated: dist/pages/ui-v3/index.html');
