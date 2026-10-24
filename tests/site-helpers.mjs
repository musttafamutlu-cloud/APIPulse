// Helpers for the static-site tests. Plain string parsing, no dependencies.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASE_URL = 'https://musttafamutlu-cloud.github.io/APIPulse/';
export const BASE_PATH = '/APIPulse/';

export const PAGES = [
  'index.html',
  'tool/index.html',
  'guide/index.html',
  'guide/look-to-book/index.html',
  'guide/latency/index.html',
  'guide/errors/index.html',
  'guide/thresholds/index.html',
  'teams/index.html',
  'privacy/index.html',
  '404.html',
];

export const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

// Prefix each page uses to reach the site root. 404.html is served at any
// URL by GitHub Pages, so it links with the absolute base path instead.
export function rootPrefix(page) {
  if (page === '404.html') return BASE_PATH;
  const depth = page.split('/').length - 1;
  return depth === 0 ? './' : '../'.repeat(depth);
}

export function between(html, open, close) {
  const i = html.indexOf(open);
  if (i < 0) return null;
  const j = html.indexOf(close, i);
  return j < 0 ? null : html.slice(i, j + close.length);
}

export function attrs(html, name) {
  const re = new RegExp(`\\s${name}="([^"]*)"`, 'g');
  return [...html.matchAll(re)].map((m) => m[1]);
}

export function metaContent(html, key, value) {
  const re = new RegExp(`<meta[^>]*${key}="${value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}"[^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return tag ? tag.match(/content="([^"]*)"/)?.[1] ?? null : null;
}

// Resolve a local href/src from a page to a repo file, or null if external.
export function resolveLocal(page, ref) {
  if (!ref || /^(https?:|mailto:|data:|#)/.test(ref)) return null;
  const clean = ref.split('#')[0].split('?')[0];
  if (!clean) return null;
  const rel = clean.startsWith(BASE_PATH) ? clean.slice(BASE_PATH.length) : path.posix.join(path.posix.dirname(page), clean);
  return path.posix.normalize(clean.endsWith('/') || rel === '' ? path.posix.join(rel, 'index.html') : rel);
}

export function fileExists(rel) {
  const p = path.join(ROOT, rel);
  return existsSync(p) && statSync(p).isFile();
}

export function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ');
}
