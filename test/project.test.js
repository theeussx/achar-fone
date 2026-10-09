import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const exists = f => existsSync(new URL(`../${f}`, import.meta.url));

test('todos os arquivos pré-cacheados pelo service worker existem', () => {
  const list = read('sw.js').match(/const FILES = \[([\s\S]*?)\];/)[1];
  const files = [...list.matchAll(/'([^']+)'/g)].map(m => m[1]).filter(f => f !== './');
  assert.ok(files.length > 0);
  for (const f of files) assert.ok(exists(f), `faltando: ${f}`);
});

test('manifest é JSON válido e seus ícones existem', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.ok(manifest.name && manifest.start_url && manifest.icons.length);
  for (const icon of manifest.icons) assert.ok(exists(icon.src), icon.src);
});

test('todo id usado em app.js existe no index.html', () => {
  const html = read('index.html');
  const ids = new Set([...read('src/app.js').matchAll(/\$\('([\w-]+)'\)/g)].map(m => m[1]));
  for (const id of ids) assert.ok(html.includes(`id="${id}"`), `id ausente: ${id}`);
});

test('index.html referencia apenas arquivos locais existentes', () => {
  const refs = [...read('index.html').matchAll(/(?:href|src)="((?!https?:)[^"#]+)"/g)].map(m => m[1]);
  for (const r of refs) assert.ok(exists(r), `faltando: ${r}`);
});

test('todos os botões têm type e toda a página tem lang', () => {
  const html = read('index.html');
  assert.match(html, /<html lang="pt-BR">/);
  for (const tag of html.match(/<button[^>]*>/g)) assert.match(tag, /type="button"/);
});
