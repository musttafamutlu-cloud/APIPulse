import {
  BENCHMARKS,
  LATENCY_LABELS,
  ERROR_LABELS,
  evaluate,
  evaluateRecord,
  evaluateBatch,
  parseBatch,
  formatReport,
  formatBatchReport,
  formatRatio,
  makeRecord,
  recordsToCSV,
  presetThresholds,
  cloneThresholds,
  normalizeThresholds,
} from './core.js';
import * as store from './storage.js';

const MAX_HISTORY = 200;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const state = {
  benchmark: 'generic',
  thresholds: presetThresholds('generic'),
  history: [],
  suppliers: {}, // key: lower-case name -> { name, benchmark, thresholds }
  batch: [], // last batch results
};

// ---------- helpers ----------

let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

async function copyText(text, okMessage) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMessage);
  } catch {
    toast('Clipboard unavailable. Please try in Chrome.');
  }
}

function downloadCSV(records, filename) {
  // Turkish/EU Excel expects ";" as delimiter and "," as decimal separator.
  const euStyle = (1.5).toLocaleString().includes(',');
  const csv = recordsToCSV(records, euStyle ? { delimiter: ';', decimal: ',' } : {});
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(`Exported ${records.length} record${records.length === 1 ? '' : 's'}`);
}

const stamp = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const fmtNum = (n) => (n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toLocaleString('en-US'));

function findProfile(name) {
  return state.suppliers[String(name).trim().toLowerCase()] || null;
}

async function persist() {
  await store.set('history', state.history);
  await store.set('suppliers', state.suppliers);
}

// ---------- tabs ----------

function showTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  for (const p of ['calc', 'batch', 'history']) $(`panel-${p}`).hidden = p !== name;
  $('footer-text').textContent = name === 'history' ? 'Saved on this device' : 'Local analysis. No data leaves your device.';
  if (name === 'history') renderHistory();
}

// ---------- calculator ----------

function fillBenchmarkSelects() {
  const options = Object.entries(BENCHMARKS).map(([k, b]) => `<option value="${k}">${esc(b.name)}</option>`);
  $('benchmark').innerHTML = [...options, '<option value="custom">Custom (edited)</option>'].join('');
  $('batch-benchmark').innerHTML = options.join('');
}

function syncThresholdInputs() {
  document.querySelectorAll('#thresholds input[data-kind]').forEach((inp) => {
    inp.value = state.thresholds[inp.dataset.kind][Number(inp.dataset.i)];
  });
  $('benchmark').value = state.benchmark;
}

function readInputs() {
  return { searches: $('searches').value, bookings: $('bookings').value, latency: $('latency').value, errors: $('errors').value };
}

function setBadge(el, cls, text) {
  el.className = `badge ${cls}`;
  el.textContent = text;
}

function renderCalc() {
  const ev = evaluate(readInputs(), state.thresholds);
  const cls = ev.valid ? `l${ev.healthIndex}` : 'neutral';

  $('ratio-panel').className = `ratio-panel ${cls}`;
  setBadge($('status-badge'), cls, ev.valid ? ev.health : 'Awaiting data');
  $('ratio-number').textContent = ev.valid ? ev.ratioText : '—';

  const marker = $('track-marker');
  marker.hidden = !ev.valid;
  if (ev.valid) marker.style.left = `${(ev.healthIndex + 0.5) * 25}%`;

  $('latency-value').textContent = ev.valid ? ev.latency.toLocaleString('en-US') : '—';
  setBadge($('latency-status'), ev.valid ? `l${ev.levels.latency}` : 'neutral', ev.valid ? LATENCY_LABELS[ev.levels.latency] : 'No data');

  const noErr = !ev.valid || ev.errors === null;
  $('errors-value').textContent = noErr ? '—' : ev.errors;
  setBadge($('errors-status'), noErr ? 'neutral' : `l${ev.levels.errors}`, !ev.valid ? 'No data' : ev.errors === null ? 'Not provided' : ERROR_LABELS[ev.levels.errors]);

  const messages = [
    'All systems healthy. This supplier is performing well.',
    'Healthy performance. A little room to optimize.',
    'Performance needs attention. Review supplier metrics.',
    'Critical performance. Investigate this supplier.',
  ];
  const note = $('health-note');
  note.className = `note ${cls}`;
  note.textContent = ev.valid ? messages[ev.healthIndex] + (ev.errors === null ? ' Error rate excluded from evaluation.' : '') : 'Enter valid counts and latency to evaluate.';

  $('copy-btn').disabled = !ev.valid;
  $('save-btn').disabled = !ev.valid || !$('supplier').value.trim();
}

function setBenchmark(key) {
  state.benchmark = key;
  if (key !== 'custom') state.thresholds = presetThresholds(key);
  syncThresholdInputs();
  renderCalc();
}

function renderSupplierList() {
  const names = new Map();
  for (const p of Object.values(state.suppliers)) names.set(p.name.toLowerCase(), p.name);
  for (const r of state.history) if (!names.has(r.supplier.toLowerCase())) names.set(r.supplier.toLowerCase(), r.supplier);
  $('supplier-list').innerHTML = [...names.values()]
    .sort((a, b) => a.localeCompare(b))
    .map((n) => `<option value="${esc(n)}"></option>`)
    .join('');
}

async function saveCurrent() {
  const ev = evaluate(readInputs(), state.thresholds);
  const supplier = $('supplier').value.trim();
  if (!ev.valid || !supplier) return;
  const rec = makeRecord({
    supplier,
    period: $('period').value,
    searches: ev.searches,
    bookings: ev.bookings,
    latency: ev.latency,
    errors: ev.errors,
    benchmark: state.benchmark,
    thresholds: state.thresholds,
  });
  state.history = [rec, ...state.history].slice(0, MAX_HISTORY);
  state.suppliers[supplier.toLowerCase()] = { name: supplier, benchmark: state.benchmark, thresholds: cloneThresholds(state.thresholds) };
  try {
    await persist();
    toast('Saved to history');
  } catch {
    toast('Could not save. Please try again.');
  }
  refreshCounts();
  renderSupplierList();
}

function resetCalc() {
  for (const id of ['supplier', 'period', 'searches', 'bookings', 'latency', 'errors']) $(id).value = '';
  setBenchmark('generic');
  toast('Inputs reset');
}

function loadRecordIntoCalc(rec) {
  $('supplier').value = rec.supplier;
  $('period').value = rec.period || '';
  $('searches').value = rec.searches ?? '';
  $('bookings').value = rec.bookings ?? '';
  $('latency').value = rec.latency ?? '';
  $('errors').value = rec.errors ?? '';
  state.benchmark = rec.benchmark === 'custom' || BENCHMARKS[rec.benchmark] ? rec.benchmark : 'custom';
  state.thresholds = normalizeThresholds(rec.thresholds);
  syncThresholdInputs();
  renderCalc();
  showTab('calc');
}

function bindCalc() {
  for (const id of ['searches', 'bookings', 'latency', 'errors']) $(id).addEventListener('input', renderCalc);

  $('supplier').addEventListener('input', () => {
    const profile = findProfile($('supplier').value);
    if (profile) {
      state.benchmark = profile.benchmark;
      state.thresholds = normalizeThresholds(profile.thresholds);
      syncThresholdInputs();
    }
    renderCalc();
  });

  $('benchmark').addEventListener('change', (e) => setBenchmark(e.target.value));

  document.querySelectorAll('#thresholds input[data-kind]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const { kind, i } = inp.dataset;
      state.thresholds[kind][Number(i)] = inp.value === '' ? NaN : Number(inp.value);
      // Only mark as custom if the edited list is still valid; otherwise evaluate() falls back safely.
      state.benchmark = 'custom';
      $('benchmark').value = 'custom';
      renderCalc();
    }),
  );

  $('copy-btn').addEventListener('click', () => {
    const ev = evaluate(readInputs(), state.thresholds);
    if (ev.valid) copyText(formatReport({ supplier: $('supplier').value, period: $('period').value, ev }), 'Report copied to clipboard');
  });
  $('save-btn').addEventListener('click', saveCurrent);
  $('reset-btn').addEventListener('click', resetCalc);
}

// ---------- batch ----------

const BATCH_EXAMPLE = ['Supplier\tSearches\tBookings\tLatency\tErrors', 'Amadeus\t8500\t125\t245\t0.4', 'Sabre\t120000\t80\t3100\t2.5', 'Hotelbeds\t450000\t60\t1800\t0.9', 'ExampleSupplier\t5000\t0\t950'].join('\n');

function runBatch() {
  const { rows, problems } = parseBatch($('batch-input').value);
  const defaults = presetThresholds($('batch-benchmark').value);
  state.batch = evaluateBatch(rows, (name) => findProfile(name)?.thresholds ?? defaults);
  state.batchDefault = $('batch-benchmark').value;

  const list = $('batch-problems');
  list.hidden = problems.length === 0;
  list.innerHTML = problems.map((p) => `<li>Line ${p.line}: ${esc(p.message)}</li>`).join('');

  $('batch-results').hidden = state.batch.length === 0;
  $('batch-body').innerHTML = state.batch
    .map((r) => {
      if (!r.ev.valid) return `<tr><td>${esc(r.supplier)}</td><td colspan="3" title="Check searches, bookings (whole numbers), latency and error %">invalid data (line ${r.line})</td><td><span class="badge neutral">Invalid</span></td></tr>`;
      return `<tr><td>${esc(r.supplier)}</td><td>${esc(r.ev.ratioText)}</td><td>${fmtNum(r.ev.latency)} ms</td><td>${r.ev.errors === null ? '—' : r.ev.errors}</td><td><span class="badge l${r.ev.healthIndex}">${r.ev.health}</span></td></tr>`;
    })
    .join('');

  if (!rows.length && !problems.length) toast('Paste some data first');
}

function batchRecords() {
  const period = $('batch-period').value;
  return state.batch
    .filter((r) => r.ev.valid)
    .map((r) =>
      makeRecord({
        supplier: r.supplier,
        period,
        searches: r.ev.searches,
        bookings: r.ev.bookings,
        latency: r.ev.latency,
        errors: r.ev.errors,
        benchmark: findProfile(r.supplier)?.benchmark ?? state.batchDefault ?? 'generic',
        thresholds: r.thresholds,
        source: 'batch',
      }),
    );
}

async function saveBatch() {
  const records = batchRecords();
  if (!records.length) return toast('Nothing valid to save');
  state.history = [...records, ...state.history].slice(0, MAX_HISTORY);
  try {
    await persist();
    toast(`Saved ${records.length} record${records.length === 1 ? '' : 's'}`);
  } catch {
    toast('Could not save. Please try again.');
  }
  refreshCounts();
  renderSupplierList();
}

function bindBatch() {
  $('batch-run').addEventListener('click', runBatch);
  $('batch-example').addEventListener('click', () => {
    $('batch-input').value = BATCH_EXAMPLE;
    runBatch();
  });
  $('batch-clear').addEventListener('click', () => {
    $('batch-input').value = '';
    state.batch = [];
    $('batch-results').hidden = true;
    $('batch-problems').hidden = true;
  });
  $('batch-copy').addEventListener('click', () => copyText(formatBatchReport(state.batch, $('batch-period').value), 'Batch report copied'));
  $('batch-csv').addEventListener('click', () => {
    const records = batchRecords();
    if (records.length) downloadCSV(records, `apipulse-batch-${stamp()}.csv`);
  });
  $('batch-save').addEventListener('click', saveBatch);
}

// ---------- history ----------

function refreshCounts() {
  $('history-count').textContent = state.history.length;
  $('profile-count').textContent = Object.keys(state.suppliers).length;
}

function renderHistory() {
  const q = $('history-filter').value.trim().toLowerCase();
  const items = state.history.filter((r) => !q || r.supplier.toLowerCase().includes(q));
  $('history-empty').hidden = state.history.length > 0;
  $('history-list').innerHTML = items
    .map((r) => {
      const ev = evaluateRecord(r);
      const badge = ev.valid ? `<span class="badge l${ev.healthIndex}">${ev.health}</span>` : '<span class="badge neutral">Invalid</span>';
      const meta = [r.period, fmtDate(r.date)].filter(Boolean).join(' · ');
      return `<li class="history-item"><div class="history-main"><div class="history-name">${esc(r.supplier)}</div><div class="history-meta">${esc(meta)}</div><div class="history-meta">L2B ${esc(ev.ratioText)} · ${fmtNum(r.latency)} ms · ${r.errors === null ? 'no error rate' : r.errors + '% errors'}</div></div><div class="history-actions">${badge}<button class="mini" data-action="load" data-id="${esc(r.id)}">Load</button><button class="mini del" data-action="delete" data-id="${esc(r.id)}" aria-label="Delete record">✕</button></div></li>`;
    })
    .join('');

  const profiles = Object.entries(state.suppliers).sort((a, b) => a[1].name.localeCompare(b[1].name));
  $('profile-list').innerHTML = profiles.length
    ? profiles
        .map(([key, p]) => `<li class="profile-item"><span>${esc(p.name)} <span class="history-meta">${esc(BENCHMARKS[p.benchmark]?.name ?? 'Custom thresholds')}</span></span><button class="mini del" data-action="remove-profile" data-key="${esc(key)}" aria-label="Remove profile">✕</button></li>`)
        .join('')
    : '<li class="hint">No profiles yet.</li>';
  refreshCounts();
}

function bindHistory() {
  $('history-filter').addEventListener('input', renderHistory);

  $('history-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const rec = state.history.find((r) => r.id === btn.dataset.id);
    if (btn.dataset.action === 'load' && rec) loadRecordIntoCalc(rec);
    if (btn.dataset.action === 'delete') {
      state.history = state.history.filter((r) => r.id !== btn.dataset.id);
      await persist();
      renderHistory();
      renderSupplierList();
    }
  });

  $('profile-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action="remove-profile"]');
    if (!btn) return;
    delete state.suppliers[btn.dataset.key];
    await persist();
    renderHistory();
    renderSupplierList();
  });

  $('history-csv').addEventListener('click', () => {
    if (!state.history.length) return toast('Nothing to export yet');
    downloadCSV(state.history, `apipulse-history-${stamp()}.csv`);
  });

  let armed = false;
  let armTimer;
  $('history-clear').addEventListener('click', async (e) => {
    if (!state.history.length) return;
    if (!armed) {
      armed = true;
      e.target.textContent = 'Click again to confirm';
      armTimer = setTimeout(() => {
        armed = false;
        e.target.textContent = 'Clear history';
      }, 3000);
      return;
    }
    clearTimeout(armTimer);
    armed = false;
    e.target.textContent = 'Clear history';
    state.history = [];
    await persist();
    renderHistory();
    renderSupplierList();
    toast('History cleared (supplier profiles kept)');
  });
}

// ---------- init ----------

async function init() {
  fillBenchmarkSelects();
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
  bindCalc();
  bindBatch();
  bindHistory();
  syncThresholdInputs();
  renderCalc();
  try {
    const loaded = await store.loadAll();
    state.history = loaded.history;
    state.suppliers = loaded.suppliers;
  } catch {
    toast('History could not be loaded.');
  }
  refreshCounts();
  renderSupplierList();
}

init();
