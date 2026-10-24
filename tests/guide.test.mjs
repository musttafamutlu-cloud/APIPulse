import test from 'node:test';
import assert from 'node:assert/strict';
import { BENCHMARKS } from '../extension/src/core.js';
import { decodeShare } from '../extension/src/share.js';
import { read, attrs, between, textOf } from './site-helpers.mjs';

const ARTICLES = ['guide/look-to-book/index.html', 'guide/latency/index.html', 'guide/errors/index.html', 'guide/thresholds/index.html'];
const GUIDE = ['guide/index.html', ...ARTICLES];

const nums = (s) => s.split('/').map((x) => Number(x.replace(/[^\d.]/g, '')));

test('threshold table matches BENCHMARKS', () => {
  const html = read('guide/thresholds/index.html');
  const table = between(html, '<table class="table" data-benchmarks>', '</table>');
  assert.ok(table, 'table[data-benchmarks] present');
  for (const [key, preset] of Object.entries(BENCHMARKS)) {
    const row = between(table, `<tr data-preset="${key}">`, '</tr>');
    assert.ok(row, `row for ${key}`);
    for (const metric of ['ratio', 'latency', 'errors']) {
      const cell = row.match(new RegExp(`<td[^>]*data-metric="${metric}"[^>]*>([^<]*)</td>`))?.[1];
      assert.ok(cell, `${key}.${metric} cell`);
      assert.deepEqual(nums(cell), preset[metric], `${key}.${metric}`);
    }
  }
});

test('every "try it" link in the guide decodes', () => {
  let count = 0;
  for (const page of GUIDE) {
    for (const href of attrs(read(page), 'href').filter((h) => h.includes('#v1='))) {
      count++;
      const out = decodeShare(href.slice(href.indexOf('#')));
      assert.equal(out.ok, true, `${page}: ${href}`);
    }
  }
  assert.ok(count >= 4, 'each article links to a worked example in the tool');
});

for (const page of ARTICLES) {
  test(`${page}: answer, example, review date and length`, () => {
    const html = read(page);
    assert.match(html, /class="answer"/);
    assert.match(html, /class="example"/);
    assert.match(html, /<time datetime="\d{4}-\d{2}-\d{2}">/);
    const words = textOf(between(html, '<main', '</main>')).split(' ').filter(Boolean).length;
    assert.ok(words >= 600 && words <= 1500, `${page} has ${words} words`);
  });
}

test('latency example: stated average and percentiles match its own data', () => {
  const html = read('guide/latency/index.html');
  const ex = html.match(/data-fast-count="(\d+)" data-fast-ms="(\d+)" data-slow-count="(\d+)" data-slow-ms="(\d+)"/);
  assert.ok(ex, 'example carries its data');
  const [fc, fm, sc, sm] = ex.slice(1).map(Number);
  const values = [...Array(fc).fill(fm), ...Array(sc).fill(sm)].sort((a, b) => a - b);
  const pct = (p) => values[Math.ceil((p / 100) * values.length) - 1];
  const stat = (name) => Number(html.match(new RegExp(`data-stat="${name}">([\\d,]+) ms`))[1].replace(/,/g, ''));
  assert.equal(stat('avg'), values.reduce((a, b) => a + b, 0) / values.length);
  assert.equal(stat('p95'), pct(95));
  assert.equal(stat('p99'), pct(99));
  assert.ok(pct(95) === sm, 'p95 lands in the slow tail, as the article argues');
});
