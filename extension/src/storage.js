// Storage wrapper. Uses chrome.storage.local inside the extension and falls back
// to localStorage so popup.html can also be opened as a normal page for testing.
// All data stays on the device.

import { presetThresholds } from './core.js';

const area = () => globalThis.chrome?.storage?.local;
const PREFIX = 'apipulse:';

export async function get(key, fallback) {
  const a = area();
  if (a) {
    const result = await a.get(key);
    return result[key] ?? fallback;
  }
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function set(key, value) {
  const a = area();
  if (a) return a.set({ [key]: value });
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

// v1.0 stored up to 5 records under "providerHistory" with a different shape.
function convertLegacy(rec) {
  const inputs = rec.inputs || {};
  const benchmark = ['generic', 'flights', 'hotels'].includes(rec.benchmark) ? rec.benchmark : 'generic';
  const num = (v) => (v === '' || v === undefined || v === null ? null : Number(v));
  return {
    id: rec.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    supplier: String(inputs.provider || 'Unnamed supplier').trim(),
    period: '',
    searches: num(inputs.searches),
    bookings: num(inputs.bookings),
    latency: num(inputs.latency),
    errors: num(inputs.errors),
    benchmark,
    thresholds: presetThresholds(benchmark),
    source: 'legacy',
    date: rec.date || new Date().toISOString(),
  };
}

export async function loadAll() {
  let history = await get('history', null);
  if (history === null) {
    const legacy = await get('providerHistory', []);
    history = Array.isArray(legacy) ? legacy.map(convertLegacy) : [];
    if (history.length) await set('history', history);
  }
  const suppliers = await get('suppliers', {});
  return { history: Array.isArray(history) ? history : [], suppliers: suppliers && typeof suppliers === 'object' ? suppliers : {} };
}
