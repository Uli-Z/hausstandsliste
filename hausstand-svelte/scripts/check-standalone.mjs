import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const html = await readFile('dist/hausstand-standalone.html', 'utf8');
assert.match(html, /<div\s+id=["']app["']\s*><\/div>/i, 'Application mount element is missing.');
assert.match(html, /<script\s+type=["']module["']>/i, 'Inlined JavaScript must stay a deferred module script.');
assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)=["']\/assets\//i, 'External Vite asset references found.');
assert.match(html, /<style>/i, 'CSS must be inlined.');
console.log('Standalone-HTML: module script, mount element and embedded assets verified.');
