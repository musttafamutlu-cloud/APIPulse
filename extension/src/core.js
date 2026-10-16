// APIpulse core logic. Pure functions only: no DOM, no storage.
// This file is unit-tested in /tests (run: npm test).

export const LEVELS = ['Excellent', 'Good', 'Warning', 'Critical'];
export const LATENCY_LABELS = ['Fast', 'Moderate', 'Slow', 'Very slow'];
export const ERROR_LABELS = ['Low errors', 'Acceptable', 'Elevated', 'High errors'];
export const LEVEL_EMOJI = ['🟢', '🟡', '🟠', '🔴'];

// Each threshold list has 3 values: [Excellent below, Good below, Warning below].
// At or above the third value the result is Critical.
// NOTE: these presets are illustrative starting points. Calibrate them to your
// real supplier agreements (see docs/ROADMAP.md).
export const BENCHMARKS = {
  generic: {
    name: 'Generic B2B API',
    ratio: [10000, 100000, 500000],
    latency: [1500, 3000, 6000],
    errors: [2, 5, 10],
  },
  flights: {
    name: 'TravelTech / Flights',
    ratio: [20000, 150000, 600000],
    latency: [1500, 3000, 6000],
    errors: [2, 5, 10],
  },
  hotels: {
    name: 'Hotels / Bedbanks',
    ratio: [10000, 80000, 400000],
    latency: [1500, 3000, 6000],
    errors: [2, 5, 10],
  },
};

export function cloneThresholds(t) {
  return { ratio: [...t.ratio], latency: [...t.latency], errors: [...t.errors] };
}

export function presetThresholds(key) {
  return cloneThresholds(BENCHMARKS[key] || BENCHMARKS.generic);
}

// Returns a safe thresholds object: invalid or non-ascending lists fall back.
export function normalizeThresholds(t, fallback = presetThresholds('generic')) {
  const out = cloneThresholds(fallback);
  if (!t) return out;
  for (const k of ['ratio', 'latency', 'errors']) {
    const a = t[k];
    if (Array.isArray(a) && a.length === 3 && a.every((n) => n !== '' && n !== null && Number.isFinite(Number(n)) && Number(n) >= 0)) {
      const nums = a.map(Number);
      if (nums[0] <= nums[1] && nums[1] <= nums[2]) out[k] = nums;
    }
  }
  return out;
}

export function level(value, t) {
  if (value < t[0]) return 0;
  if (value < t[1]) return 1;
  if (value < t[2]) return 2;
  return 3;
}

const isBlank = (v) => v === '' || v === null || v === undefined;

export function formatRatio(ratio) {
  if (ratio === null) return 'n/a';
  if (!Number.isFinite(ratio)) return 'Infinity:1';
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(ratio)}:1`;
}

// input: { searches, bookings, latency, errors } as numbers or numeric strings
// (plain JS Number() parsing; use parseNumber() first for pasted text).
export function evaluate(input, thresholds) {
  const th = normalizeThresholds(thresholds);
  const searches = isBlank(input.searches) ? NaN : Number(input.searches);
  const bookings = isBlank(input.bookings) ? NaN : Number(input.bookings);
  const latency = isBlank(input.latency) ? NaN : Number(input.latency);
  const errors = isBlank(input.errors) ? null : Number(input.errors);

  const valid =
    [searches, bookings, latency].every((n) => Number.isFinite(n) && n >= 0) &&
    Number.isInteger(searches) &&
    Number.isInteger(bookings) &&
    (errors === null || (Number.isFinite(errors) && errors >= 0 && errors <= 100));

  if (!valid) {
    return { valid: false, searches, bookings, latency, errors, ratio: null, ratioText: '—', levels: null, health: null, healthIndex: -1 };
  }

  // No bookings: infinite L2B. No searches AND no bookings: nothing to rate.
  let ratio;
  if (bookings === 0) ratio = searches === 0 ? null : Infinity;
  else ratio = searches / bookings;

  const levels = {
    ratio: ratio === null ? 0 : level(ratio, th.ratio),
    latency: level(latency, th.latency),
    errors: errors === null ? 0 : level(errors, th.errors),
  };
  const healthIndex = Math.max(levels.ratio, levels.latency, levels.errors);
  return {
    valid: true,
    searches,
    bookings,
    latency,
    errors,
    ratio,
    ratioText: formatRatio(ratio),
    levels,
    health: LEVELS[healthIndex],
    healthIndex,
  };
}

// One-line report, suitable for Slack / e-mail.
export function formatReport({ supplier, period, ev }) {
  const name = (supplier || '').trim() || 'Unnamed supplier';
  const parts = [
    `${LEVEL_EMOJI[ev.healthIndex] ?? '⚪'} ${name} Health Report`,
    ...(period && period.trim() ? [`Period: ${period.trim()}`] : []),
    `L2B: ${ev.ratioText}`,
    `Latency: ${ev.latency}ms`,
    `Errors: ${ev.errors === null ? 'N/A' : `${ev.errors}%`}`,
    `Status: ${ev.health}`,
  ];
  return parts.join(' | ');
}

// ---------- Pasted-table parsing (batch mode) ----------

// Accepts "8500", "8,500", "8.500" (Turkish thousands), "0,4" (decimal comma), "0.4%".
export function parseNumber(value) {
  if (typeof value === 'number') return value;
  let s = String(value ?? '').replace(/[\s\u00a0%]/g, '');
  if (s === '') return NaN;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^\d+,\d+$/.test(s)) s = s.replace(',', '.');
  return Number(s);
}

function detectDelimiter(text) {
  if (text.includes('\t')) return '\t';
  if (text.includes(';')) return ';';
  return ',';
}

// Expected columns: Supplier, Searches, Bookings, Avg latency (ms), Error rate % (optional).
// A header row is detected and skipped automatically.
export function parseBatch(text) {
  const rows = [];
  const problems = [];
  const raw = String(text || '');
  const delimiter = detectDelimiter(raw);
  let seenFirst = false;

  raw.split(/\r?\n/).forEach((lineRaw, idx) => {
    const line = lineRaw.trim();
    if (!line) return;
    const cols = line.split(delimiter).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
    const isFirst = !seenFirst;
    seenFirst = true;

    if (isFirst && cols.length > 1 && Number.isNaN(parseNumber(cols[1]))) return; // header row

    const lineNo = idx + 1;
    if (cols.length < 4) {
      problems.push({ line: lineNo, message: 'Needs at least 4 columns: supplier, searches, bookings, latency' });
      return;
    }
    if (!cols[0]) {
      problems.push({ line: lineNo, message: 'Supplier name is empty' });
      return;
    }
    rows.push({
      line: lineNo,
      supplier: cols[0],
      searches: parseNumber(cols[1]),
      bookings: parseNumber(cols[2]),
      latency: parseNumber(cols[3]),
      errors: cols[4] === undefined || cols[4] === '' ? null : parseNumber(cols[4]),
    });
  });
  return { rows, problems };
}

// resolve(supplierName) -> thresholds object. Worst health first, then highest L2B.
export function evaluateBatch(rows, resolve) {
  const results = rows.map((row) => {
    const thresholds = normalizeThresholds(resolve(row.supplier));
    const ev = evaluate(row, thresholds);
    return { ...row, thresholds, ev };
  });
  const rank = (r) => (r.ev.valid ? r.ev.healthIndex : -1);
  const ratioOf = (r) => (r.ev.valid && r.ev.ratio !== null ? r.ev.ratio : -1);
  results.sort((a, b) => rank(b) - rank(a) || ratioOf(b) - ratioOf(a));
  return results;
}

export function formatBatchReport(results, period) {
  const head = `APIpulse batch report${period && period.trim() ? ` | Period: ${period.trim()}` : ''}`;
  const lines = results.map((r, i) => {
    if (!r.ev.valid) return `${i + 1}. ${r.supplier} | invalid data (line ${r.line})`;
    return `${i + 1}. ${LEVEL_EMOJI[r.ev.healthIndex]} ${r.supplier} | L2B: ${r.ev.ratioText} | Latency: ${r.ev.latency}ms | Errors: ${r.ev.errors === null ? 'N/A' : `${r.ev.errors}%`} | ${r.ev.health}`;
  });
  return [head, ...lines].join('\n');
}

// ---------- History records ----------

export function makeRecord({ supplier, period = '', searches, bookings, latency, errors, benchmark, thresholds, source = 'single', date }) {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    supplier: String(supplier).trim(),
    period: String(period || '').trim(),
    searches,
    bookings,
    latency,
    errors: errors === undefined ? null : errors,
    benchmark,
    thresholds: cloneThresholds(normalizeThresholds(thresholds)),
    source,
    date: date || new Date().toISOString(),
  };
}

export function evaluateRecord(rec) {
  return evaluate(rec, rec.thresholds);
}

// ---------- CSV export ----------

function csvCell(value, delimiter) {
  const s = String(value ?? '');
  return /["\r\n]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
}

// delimiter ';' + decimal ',' is what Excel expects on Turkish (and many EU) systems.
export function recordsToCSV(records, { delimiter = ',', decimal = '.' } = {}) {
  const num = (n) => (n === null || n === undefined || Number.isNaN(n) ? '' : String(n).replace('.', decimal));
  const header = ['Date', 'Supplier', 'Period', 'Searches', 'Bookings', 'L2B', 'Latency_ms', 'Error_pct', 'Status', 'Benchmark'];
  const lines = [header.map((h) => csvCell(h, delimiter)).join(delimiter)];
  for (const rec of records) {
    const ev = evaluateRecord(rec);
    const l2b = ev.valid && ev.ratio !== null ? (Number.isFinite(ev.ratio) ? num(Math.round(ev.ratio * 100) / 100) : 'Infinity') : '';
    lines.push(
      [
        rec.date,
        rec.supplier,
        rec.period,
        num(rec.searches),
        num(rec.bookings),
        l2b,
        num(rec.latency),
        num(rec.errors),
        ev.valid ? ev.health : 'Invalid',
        rec.benchmark,
      ]
        .map((c) => csvCell(c, delimiter))
        .join(delimiter),
    );
  }
  return lines.join('\r\n');
}
