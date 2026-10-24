import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, presetThresholds, makeRecord } from '../extension/src/core.js';
import {
  SHARE_VERSION,
  MAX_SHARE_LENGTH,
  encodeShare,
  decodeShare,
  serializeBackup,
  parseBackup,
} from '../extension/src/share.js';

const custom = { ratio: [5000, 50000, 200000], latency: [800, 2000, 5000], errors: [1, 3, 8] };

const base = {
  supplier: 'Şahin Tur',
  period: '2026-W43',
  benchmark: 'hotels',
  thresholds: custom,
  searches: 450000,
  bookings: 60,
  latency: 1800,
  errors: 0.9,
};

function payloadOf(fragment) {
  const b64 = fragment.replace(/^#?v1=/, '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

test('share version constants', () => {
  assert.equal(SHARE_VERSION, 1);
  assert.equal(MAX_SHARE_LENGTH, 2048);
});

test('share round-trips a full state', () => {
  const frag = encodeShare(base, { includeSupplier: true });
  assert.match(frag, /^v1=[A-Za-z0-9_-]+$/);
  const out = decodeShare(frag);
  assert.equal(out.ok, true);
  assert.deepEqual(out.state, base);
});

test('share omits supplier unless asked', () => {
  assert.equal(decodeShare(encodeShare(base)).state.supplier, '');
  assert.equal(decodeShare('#' + encodeShare(base, { includeSupplier: true })).state.supplier, 'Şahin Tur');
});

test('share omits preset thresholds', () => {
  const frag = encodeShare({ ...base, thresholds: presetThresholds('hotels') });
  assert.equal('t' in payloadOf(frag), false);
  assert.deepEqual(decodeShare(frag).state.thresholds, presetThresholds('hotels'));
});

test('share keeps zero and null values', () => {
  const st = { ...base, searches: 5000, bookings: 0, errors: null, thresholds: presetThresholds('generic'), benchmark: 'generic' };
  const out = decodeShare(encodeShare(st));
  assert.equal(out.state.bookings, 0);
  assert.equal(out.state.errors, null);
  assert.equal(evaluate(out.state, out.state.thresholds).ratioText, 'Infinity:1');
  const none = decodeShare(encodeShare({ ...st, searches: 0 }));
  assert.equal(evaluate(none.state, none.state.thresholds).ratioText, 'n/a');
});

test('decodeShare rejects garbage', () => {
  for (const bad of ['v1=%%%', 'v1=', 'hello', '', '#', 'v1=bm90IGpzb24', null, undefined]) {
    const out = decodeShare(bad);
    assert.equal(out.ok, false, String(bad));
    assert.ok(out.error && out.error.length > 0);
  }
});

test('decodeShare rejects other versions', () => {
  const frag = encodeShare(base).replace(/^v1=/, 'v2=');
  const out = decodeShare(frag);
  assert.equal(out.ok, false);
  assert.match(out.error, /version/i);
});

test('decodeShare rejects oversized input', () => {
  const out = decodeShare('v1=' + 'A'.repeat(MAX_SHARE_LENGTH));
  assert.equal(out.ok, false);
});

test('decodeShare unknown benchmark falls back', () => {
  const frag = encodeShare({ ...base, benchmark: 'cruise' });
  const out = decodeShare(frag);
  assert.equal(out.ok, true);
  assert.equal(out.state.benchmark, 'generic');
  assert.ok(out.notice);
});

test('decodeShare rejects non-numeric values', () => {
  const json = JSON.stringify({ b: 'generic', n: ['x', 1, 2, null] });
  const b64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(decodeShare('v1=' + b64).ok, false);
});

function rec(supplier, i = 0) {
  return makeRecord({ supplier, period: 'W43', searches: 1000 + i, bookings: 5, latency: 300, errors: null, benchmark: 'generic', thresholds: presetThresholds('generic'), date: '2026-10-24T10:00:00.000Z' });
}

test('backup round-trips', () => {
  const history = [rec('İstanbul Beds'), rec('Amadeus')];
  const suppliers = { 'i̇stanbul beds': { name: 'İstanbul Beds', benchmark: 'hotels', thresholds: presetThresholds('hotels') } };
  const text = serializeBackup({ history, suppliers });
  const parsed = JSON.parse(text);
  assert.equal(parsed.app, 'APIPulse');
  assert.equal(parsed.kind, 'backup');
  assert.equal(parsed.version, 1);
  const out = parseBackup(text);
  assert.equal(out.ok, true);
  assert.deepEqual(out.history, history);
  assert.deepEqual(out.suppliers, suppliers);
});

test('parseBackup rejects foreign JSON', () => {
  for (const bad of ['{}', '[]', 'not json', '', JSON.stringify({ app: 'APIPulse', kind: 'backup', version: 2, history: [], suppliers: {} }), JSON.stringify({ name: 'apipulse', version: '1.1.0' })]) {
    const out = parseBackup(bad);
    assert.equal(out.ok, false, bad);
    assert.ok(out.error);
  }
});

test('parseBackup caps history at 200 and drops malformed records', () => {
  const history = Array.from({ length: 250 }, (_, i) => rec('S' + i, i));
  history.splice(3, 0, { supplier: 42 }, { supplier: 'X', searches: 'many' });
  const out = parseBackup(JSON.stringify({ app: 'APIPulse', kind: 'backup', version: 1, history, suppliers: {} }));
  assert.equal(out.ok, true);
  assert.equal(out.history.length, 200);
  assert.ok(out.history.every((r) => typeof r.supplier === 'string' && typeof r.searches === 'number'));
});
