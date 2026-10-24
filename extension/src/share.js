// APIPulse share links and backups. Pure functions only: no DOM, no storage.
// Share links live in the URL fragment (#v1=...), which browsers never send
// to a server, so sharing a result does not leak data to any host.

import { BENCHMARKS, normalizeThresholds, presetThresholds } from './core.js';

export const SHARE_VERSION = 1;
export const MAX_SHARE_LENGTH = 2048;
const MAX_HISTORY = 200;

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64) {
  if (!/^[A-Za-z0-9_-]+$/.test(b64)) throw new Error('bad encoding');
  const std = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const sameThresholds = (a, b) => ['ratio', 'latency', 'errors'].every((k) => a[k].every((v, i) => v === b[k][i]));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v) => v === null || isNum(v);

export function encodeShare(state, { includeSupplier = false } = {}) {
  const benchmark = String(state.benchmark || 'generic');
  const payload = {};
  const supplier = String(state.supplier || '').trim();
  const period = String(state.period || '').trim();
  if (includeSupplier && supplier) payload.s = supplier;
  if (period) payload.p = period;
  payload.b = benchmark;
  const th = normalizeThresholds(state.thresholds, presetThresholds(benchmark));
  if (!sameThresholds(th, presetThresholds(benchmark))) payload.t = [th.ratio, th.latency, th.errors];
  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  payload.n = [num(state.searches), num(state.bookings), num(state.latency), num(state.errors)];
  return `v${SHARE_VERSION}=${toBase64Url(JSON.stringify(payload))}`;
}

export function decodeShare(fragment) {
  const fail = (error) => ({ ok: false, error });
  if (typeof fragment !== 'string') return fail('No shared result in this link.');
  const raw = fragment.replace(/^#/, '');
  if (!raw) return fail('No shared result in this link.');
  if (raw.length > MAX_SHARE_LENGTH) return fail('This shared link is too long to be valid.');
  const m = /^v(\d+)=(.*)$/.exec(raw);
  if (!m) return fail('This link does not contain an APIPulse result.');
  if (Number(m[1]) !== SHARE_VERSION) return fail(`This link was made by a newer APIPulse version (v${m[1]}).`);

  let data;
  try {
    data = JSON.parse(fromBase64Url(m[2]));
  } catch {
    return fail('This shared link is damaged or incomplete.');
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.n) || data.n.length !== 4) {
    return fail('This shared link is damaged or incomplete.');
  }
  const [searches, bookings, latency, errors] = data.n;
  if (![searches, bookings, latency].every(isNum) || !isNumOrNull(errors)) {
    return fail('This shared link contains values that are not numbers.');
  }

  let notice;
  let benchmark = typeof data.b === 'string' ? data.b : 'generic';
  if (!Object.hasOwn(BENCHMARKS, benchmark)) {
    notice = `Unknown benchmark "${benchmark}", using Generic B2B API instead.`;
    benchmark = 'generic';
  }
  let thresholds = presetThresholds(benchmark);
  if (Array.isArray(data.t) && data.t.length === 3) {
    thresholds = normalizeThresholds({ ratio: data.t[0], latency: data.t[1], errors: data.t[2] }, thresholds);
  }

  const state = {
    supplier: typeof data.s === 'string' ? data.s.trim() : '',
    period: typeof data.p === 'string' ? data.p.trim() : '',
    benchmark,
    thresholds,
    searches,
    bookings,
    latency,
    errors,
  };
  return notice ? { ok: true, state, notice } : { ok: true, state };
}

// ---------- Backups ----------

export function serializeBackup({ history, suppliers }) {
  return JSON.stringify(
    { app: 'APIPulse', kind: 'backup', version: 1, exportedAt: new Date().toISOString(), history: history || [], suppliers: suppliers || {} },
    null,
    2,
  );
}

function cleanRecord(r) {
  if (!r || typeof r !== 'object' || typeof r.supplier !== 'string' || !r.supplier.trim()) return null;
  if (![r.searches, r.bookings, r.latency, r.errors ?? null].every(isNumOrNull)) return null;
  const benchmark = Object.hasOwn(BENCHMARKS, r.benchmark) ? r.benchmark : 'generic';
  return {
    ...r,
    period: typeof r.period === 'string' ? r.period : '',
    errors: r.errors ?? null,
    benchmark,
    thresholds: normalizeThresholds(r.thresholds, presetThresholds(benchmark)),
  };
}

export function parseBackup(text) {
  const fail = (error) => ({ ok: false, error });
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return fail('This file is not valid JSON.');
  }
  if (!data || typeof data !== 'object' || data.app !== 'APIPulse' || data.kind !== 'backup') {
    return fail('This file is not an APIPulse backup.');
  }
  if (data.version !== 1) return fail(`This backup was made by a newer APIPulse version (${data.version}).`);

  const history = (Array.isArray(data.history) ? data.history : []).map(cleanRecord).filter(Boolean).slice(0, MAX_HISTORY);
  const suppliers = {};
  for (const p of Object.values(data.suppliers && typeof data.suppliers === 'object' ? data.suppliers : {})) {
    if (!p || typeof p.name !== 'string' || !p.name.trim()) continue;
    const benchmark = Object.hasOwn(BENCHMARKS, p.benchmark) ? p.benchmark : 'generic';
    suppliers[p.name.trim().toLowerCase()] = { name: p.name.trim(), benchmark, thresholds: normalizeThresholds(p.thresholds, presetThresholds(benchmark)) };
  }
  return { ok: true, history, suppliers };
}
