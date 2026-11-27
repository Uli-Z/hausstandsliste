import { readFile, writeFile, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const run = (args, env) => {
  const result = spawnSync(process.execPath, args, {cwd:root, env, stdio:'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(args.join(' ') + ' failed (' + result.status + ')');
};
// Manuell aufrufbarer eigener Build. Die PHP-Ausgabe nutzt die aktuelle mobile V3
// und schaltet nur dort die Serveranbindung ein. Alle HTML-Builds bleiben lokal.
const env = { ...process.env, VITE_HAUSSTAND_SERVER_MODE:'true' };
run([path.join(root,'node_modules','vite','bin','vite.js'),'build','--config','vite.ui-v3.config.js'],env);
run([path.join(root,'scripts','inline-ui-v3.mjs'),'--php'],env);
const releaseTag = process.env.HAUSSTAND_RELEASE_TAG || 'development';
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(releaseTag)) throw new Error('Invalid release tag');
const backend = await readFile('server-php/backend.php', 'utf8');
const marker = "define('HAUSSTAND_RELEASE_TAG', 'development');";
if (!backend.includes(marker)) throw new Error('Release tag marker missing');
const php = backend.replace(marker, "define('HAUSSTAND_RELEASE_TAG', '" + releaseTag + "');");
const html = await readFile('dist/php-ui.html', 'utf8');
if (!html.includes('<!doctype html>') || !php.startsWith('<?php') || !html.includes('Online-Projekte')) {
  throw new Error('PHP bundle does not contain the expected server-enabled UI V3.');
}
if (html.includes('X-Workspace-Key') || html.includes('PHP-API-Adresse')) {
  throw new Error('A manual API connection or workspace key leaked into the PHP user interface.');
}
await writeFile('dist/hausstand.php', php + '\n' + html, 'utf8');
await unlink('dist/php-ui.html');
console.log('Generated deployable single-file PHP app: dist/hausstand.php');
