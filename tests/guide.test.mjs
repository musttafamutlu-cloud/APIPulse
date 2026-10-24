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
