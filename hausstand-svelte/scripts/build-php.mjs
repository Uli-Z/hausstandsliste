import { readFile, writeFile } from 'node:fs/promises';
const php = await readFile('server-php/backend.php', 'utf8');
const html = await readFile('dist/hausstand-standalone.html', 'utf8');
if (!html.includes('<!doctype html>') || !php.startsWith('<?php')) {
  throw new Error('Missing standalone HTML or PHP backend source.');
}
await writeFile('dist/hausstand.php', php + '\n' + html, 'utf8');
console.log('Generated: dist/hausstand.php');
