import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const htmlPath = path.join(dist, 'index.html');
let html = await readFile(htmlPath, 'utf8');

const assetsDir = path.join(dist, 'assets');
let files = [];
try { files = await readdir(assetsDir); } catch {}

for (const file of files) {
  const p = path.join(assetsDir, file);
  if (file.endsWith('.js')) {
    const js = await readFile(p, 'utf8');
    html = html.replace(new RegExp(`<script[^>]+src=["']/assets/${file.replace('.', '\\.')}["'][^>]*></script>`), `<script>${js}</script>`);
  }
  if (file.endsWith('.css')) {
    const css = await readFile(p, 'utf8');
    html = html.replace(new RegExp(`<link[^>]+href=["']/assets/${file.replace('.', '\\.')}["'][^>]*>`), `<style>${css}</style>`);
  }
}

await writeFile(path.join(dist, 'hausstand-standalone.html'), html, 'utf8');
console.log('Erzeugt: dist/hausstand-standalone.html');
