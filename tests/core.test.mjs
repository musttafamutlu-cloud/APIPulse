import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BENCHMARKS,
  evaluate,
  level,
  normalizeThresholds,
  presetThresholds,
  parseNumber,
  parseBatch,
  evaluateBatch,
  formatReport,
  formatBatchReport,
  makeRecord,
  recordsToCSV,
} from '../extension/src/core.js';

const generic = presetThresholds('generic');

test('level() picks the right band', () => {
  const t = [10, 20, 30];
  assert.equal(level(9, t), 0);
  assert.equal(level(10, t), 1);
  assert.equal(level(29.9, t), 2);
  assert.equal(level(30, t), 3);
});

test('evaluate: healthy supplier', () => {
  const ev = evaluate({ searches: 8500, bookings: 125, latency: 245, errors: 0.4 }, generic);
  assert.equal(ev.valid, true);
  assert.equal(ev.ratioText, '68:1');
  assert.equal(ev.health, 'Excellent');
});

test('evaluate: worst of ratio / latency / errors wins', () => {
  const slow = evaluate({ searches: 1000, bookings: 100, latency: 7000, errors: 0 }, generic);
  assert.equal(slow.health, 'Critical');
  const errs = evaluate({ searches: 1000, bookings: 100, latency: 200, errors: 3 }, generic);
  assert.equal(errs.health, 'Good'); // 2 <= 3 < 5
  const errsHigh = evaluate({ searches: 1000, bookings: 100, latency: 200, errors: 12 }, generic);
  assert.equal(errsHigh.health, 'Critical');
});

test('evaluate: zero bookings = infinite L2B (critical), zero/zero = n/a', () => {
  const inf = evaluate({ searches: 500, bookings: 0, latency: 100, errors: null }, generic);
  assert.equal(inf.ratioText, 'Infinity:1');
  assert.equal(inf.health, 'Critical');
  const none = evaluate({ searches: 0, bookings: 0, latency: 100, errors: '' }, generic);
  assert.equal(none.valid, true);
  assert.equal(none.ratioText, 'n/a');
  assert.equal(none.health, 'Excellent');
});

test('evaluate: blank errors are excluded, bad input is invalid', () => {
  assert.equal(evaluate({ searches: 10, bookings: 1, latency: 100, errors: '' }, generic).errors, null);
  assert.equal(evaluate({ searches: '', bookings: 1, latency: 100 }, generic).valid, false);
  assert.equal(evaluate({ searches: 10.5, bookings: 1, latency: 100 }, generic).valid, false);
  assert.equal(evaluate({ searches: -1, bookings: 1, latency: 100 }, generic).valid, false);
  assert.equal(evaluate({ searches: 10, bookings: 1, latency: 100, errors: 101 }, generic).valid, false);
  assert.equal(evaluate({ searches: NaN, bookings: 1, latency: 100 }, generic).valid, false);
});

test('custom thresholds change the verdict', () => {
  const strict = { ratio: [100, 500, 1000], latency: [500, 1000, 2000], errors: [1, 2, 3] };
  const ev = evaluate({ searches: 8500, bookings: 125, latency: 245, errors: 0.4 }, strict);
  assert.equal(ev.ratioText, '68:1');
  assert.equal(ev.health, 'Excellent');
  const ev2 = evaluate({ searches: 60000, bookings: 100, latency: 245, errors: 0.4 }, strict); // 600:1
  assert.equal(ev2.health, 'Warning');
});

test('normalizeThresholds falls back on bad data', () => {
  const bad = { ratio: [30, 20, 10], latency: ['a', 1, 2], errors: [1, 2] };
  assert.deepEqual(normalizeThresholds(bad), presetThresholds('generic'));
  assert.deepEqual(normalizeThresholds(null), presetThresholds('generic'));
  const ok = normalizeThresholds({ ratio: ['5', '6', '7'] });
  assert.deepEqual(ok.ratio, [5, 6, 7]);
});

test('parseNumber handles EN and TR formats', () => {
  assert.equal(parseNumber('8500'), 8500);
  assert.equal(parseNumber('8,500'), 8500);
  assert.equal(parseNumber('8.500'), 8500);
  assert.equal(parseNumber('1.234.567'), 1234567);
  assert.equal(parseNumber('0,4'), 0.4);
  assert.equal(parseNumber('0.4%'), 0.4);
  assert.equal(parseNumber(' 12 '), 12);
  assert.ok(Number.isNaN(parseNumber('abc')));
  assert.ok(Number.isNaN(parseNumber('')));
});

test('parseBatch: tab separated with header, TR numbers, optional errors', () => {
  const text = ['Supplier\tSearches\tBookings\tLatency\tErrors', 'Amadeus\t8.500\t125\t245\t0,4', 'Sabre\t12000\t80\t3100', 'Broken line', '\tx\t1\t1'].join('\n');
  const { rows, problems } = parseBatch(text);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { line: 2, supplier: 'Amadeus', searches: 8500, bookings: 125, latency: 245, errors: 0.4 });
  assert.equal(rows[1].errors, null);
  assert.equal(problems.length, 2);
  assert.equal(problems[0].line, 4);
});

test('parseBatch: comma and semicolon, no header', () => {
  assert.equal(parseBatch('A,100,10,200,1\nB,50,5,300').rows.length, 2);
  assert.equal(parseBatch('A;100;10;200;1').rows[0].supplier, 'A');
});

test('evaluateBatch sorts worst first, invalid last, uses per-supplier thresholds', () => {
  const rows = [
    { line: 1, supplier: 'Good', searches: 100, bookings: 10, latency: 100, errors: null },
    { line: 2, supplier: 'Bad', searches: 100, bookings: 10, latency: 9000, errors: null },
    { line: 3, supplier: 'Junk', searches: NaN, bookings: 10, latency: 100, errors: null },
    { line: 4, supplier: 'Strict', searches: 100, bookings: 10, latency: 100, errors: null },
  ];
  const strict = { ratio: [1, 2, 3], latency: [1500, 3000, 6000], errors: [2, 5, 10] };
  const out = evaluateBatch(rows, (name) => (name === 'Strict' ? strict : generic));
  assert.deepEqual(out.map((r) => r.supplier), ['Bad', 'Strict', 'Good', 'Junk']);
  assert.equal(out[1].ev.health, 'Critical');
});

test('formatReport / formatBatchReport', () => {
  const ev = evaluate({ searches: 8500, bookings: 125, latency: 245, errors: 0.4 }, generic);
  const line = formatReport({ supplier: 'Amadeus', period: '2026-10', ev });
  assert.match(line, /Amadeus Health Report \| Period: 2026-10 \| L2B: 68:1 \| Latency: 245ms \| Errors: 0.4% \| Status: Excellent/);
  assert.doesNotMatch(formatReport({ supplier: '', period: '', ev }), /Period/);
  const results = evaluateBatch([{ line: 1, supplier: 'A', searches: 100, bookings: 10, latency: 100, errors: null }], () => generic);
  assert.match(formatBatchReport(results, 'W42'), /^APIpulse batch report \| Period: W42\n1\. .* A \| L2B: 10:1/);
});

test('recordsToCSV: quoting and Turkish Excel format', () => {
  const rec = makeRecord({
    supplier: 'Foo, "Bar" Ltd',
    period: 'W42',
    searches: 1000,
    bookings: 10,
    latency: 245.5,
    errors: 0.4,
    benchmark: 'generic',
    thresholds: BENCHMARKS.generic,
    date: '2026-10-16T10:00:00.000Z',
  });
  const en = recordsToCSV([rec]).split('\r\n');
  assert.equal(en[0], 'Date,Supplier,Period,Searches,Bookings,L2B,Latency_ms,Error_pct,Status,Benchmark');
  assert.equal(en[1], '2026-10-16T10:00:00.000Z,"Foo, ""Bar"" Ltd",W42,1000,10,100,245.5,0.4,Excellent,generic');
  const tr = recordsToCSV([rec], { delimiter: ';', decimal: ',' }).split('\r\n');
  assert.equal(tr[1], '2026-10-16T10:00:00.000Z;"Foo, ""Bar"" Ltd";W42;1000;10;100;245,5;0,4;Excellent;generic');
});
