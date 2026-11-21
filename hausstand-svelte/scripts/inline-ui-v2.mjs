import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const bundle = path.join(root, 'dist', 'ui-v2-bundle');
let html = await readFile(path.join(bundle, 'index.html'), 'utf8');
const files = await readdir(path.join(bundle, 'assets'));

for (const file of files) {
  const content = await readFile(path.join(bundle, 'assets', file), 'utf8');
  if (file.endsWith('.js')) {
    html = html.replace(/<script\b[^>]*\bsrc=["']\/assets\/[^"']+\.js["'][^>]*><\/script>/i,
      () => '<script type="module">' + content + '</script>');
  } else if (file.endsWith('.css')) {
    html = html.replace(/<link\b[^>]*\bhref=["']\/assets\/[^"']+\.css["'][^>]*>/i,
      () => '<style>' + content + '</style>');
  }
}
assert.match(html, /<div\s+id=["']app["']\s*><\/div>/i, 'Mount element missing');
assert.match(html, /<script\s+type=["']module["']>/i, 'Deferred module bootstrap missing');
assert.match(html, /<style>/i, 'Inline CSS missing');
assert.doesNotMatch(html, /<(script|link)[^>]+(?:src|href)=["']\/assets\//i, 'Uninlined assets');
const out = path.join(root, 'dist', 'pages', 'ui-v2');
await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'index.html'), html, 'utf8');
console.log('UI-V2: dist/pages/ui-v2/index.html built and validated');
