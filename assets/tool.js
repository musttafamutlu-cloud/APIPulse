// APIPulse web tool. All scoring and report text comes from the extension's
// pure modules, so the website and the extension always give the same verdict.
import {
  BENCHMARKS, LATENCY_LABELS, ERROR_LABELS, evaluate, evaluateRecord, evaluateBatch, parseBatch,
  formatReport, formatBatchReport, makeRecord, recordsToCSV, presetThresholds, cloneThresholds, normalizeThresholds,
} from '../extension/src/core.js';
import * as store from '../extension/src/storage.js';
import { encodeShare, decodeShare, serializeBackup, parseBackup } from '../extension/src/share.js';

const MAX_HISTORY = 200;
const KINDS = [['ratio', 'Look-to-book', 'searches per booking'], ['latency', 'Latency', 'ms'], ['errors', 'Error rate', '%']];
const BAND = ['Excellent below', 'Good below', 'Warning below'];
const NOTES = [
  'Healthy on every measure.',
  'Healthy, with some room to improve.',
  'Needs attention. At least one measure is outside the healthy range.',
  'Critical. At least one measure is far outside the healthy range.',
];
const BATCH_EXAMPLE = ['Supplier\tSearches\tBookings\tLatency\tErrors', 'Amadeus\t8500\t125\t245\t0.4', 'Sabre\t120000\t80\t3100\t2.5', 'Hotelbeds\t450000\t60\t1800\t0.9', 'ExampleSupplier\t5000\t0\t950'].join('\n');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtNum = (n) => (n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toLocaleString('en-US'));
const stamp = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const badge = (i, text) => `<span class="badge badge--${i}">${esc(text)}</span>`;
const benchmarkOptions = (withCustom) =>
  [...Object.entries(BENCHMARKS).map(([k, b]) => `<option value="${k}">${esc(b.name)}</option>`), withCustom ? '<option value="custom">Custom (edited)</option>' : ''].join('');

function storageWorks() {
  try {
    const k = 'apipulse:probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function singleMarkup(full) {
  const thresholdRows = KINDS.map(
    ([kind, label, unit]) =>
      `<fieldset class="fields thresholds__row"><legend class="label">${label} <span class="muted">(${unit})</span></legend>${BAND.map(
        (b, i) => `<div class="field"><label for="t-${kind}-${i}" class="small">${b}</label><input id="t-${kind}-${i}" data-kind="${kind}" data-i="${i}" type="number" min="0" step="any" inputmode="decimal"></div>`,
      ).join('')}</fieldset>`,
  ).join('');
  return `
  <form class="tool-single card" data-el="form" novalidate>
    <div class="fields">
      ${full ? `<div class="field"><label for="supplier">Supplier</label><input id="supplier" data-el="supplier" list="supplier-list" autocomplete="off" maxlength="80" placeholder="Hotelbeds"><datalist id="supplier-list" data-el="supplier-list"></datalist></div>
      <div class="field"><label for="period">Period <span class="opt">optional</span></label><input id="period" data-el="period" maxlength="40" placeholder="2026-W43"></div>` : ''}
      <div class="field"><label for="benchmark">Benchmark</label><select id="benchmark" data-el="benchmark">${benchmarkOptions(full)}</select></div>
    </div>
    <div class="fields">
      <div class="field"><label for="searches">Searches</label><input id="searches" data-el="searches" type="number" min="0" step="1" inputmode="numeric" placeholder="450000"></div>
      <div class="field"><label for="bookings">Bookings</label><input id="bookings" data-el="bookings" type="number" min="0" step="1" inputmode="numeric" placeholder="60"></div>
      <div class="field"><label for="latency">Avg. response time (ms)</label><input id="latency" data-el="latency" type="number" min="0" step="any" inputmode="decimal" placeholder="1800"></div>
      <div class="field"><label for="errors">Error rate (%) <span class="opt">optional</span></label><input id="errors" data-el="errors" type="number" min="0" max="100" step="any" inputmode="decimal" placeholder="0.9"></div>
    </div>
    ${full ? `<details class="thresholds"><summary>Thresholds</summary><p class="small muted">Presets are illustrative. Replace them with the limits in your supplier agreement; edited values are saved with the supplier.</p>${thresholdRows}</details>` : ''}
  </form>
  <section class="tool-result card" aria-live="polite" data-el="result">
    <div class="tool-result__head"><span class="label">Verdict</span><span data-el="verdict"></span></div>
    <div class="meter" aria-hidden="true">${[0, 1, 2, 3].map((i) => `<span class="meter__seg meter__seg--${i}" data-seg="${i}"></span>`).join('')}</div>
    <div class="grid grid--kpi">
      <div class="kpi"><span class="label">Look-to-book</span><span class="value" data-el="ratio">—</span></div>
      <div class="kpi"><span class="label">Latency</span><span class="value" data-el="latency-v">—</span> <span data-el="latency-b"></span></div>
      <div class="kpi"><span class="label">Error rate</span><span class="value" data-el="errors-v">—</span> <span data-el="errors-b"></span></div>
    </div>
    <p class="small" data-el="note"></p>
    <div class="btn-row">
      <button type="button" class="btn btn--primary" data-act="copy-report">Copy report</button>
      ${full
        ? `<button type="button" class="btn" data-act="copy-link">Copy share link</button>
      <label class="check"><input type="checkbox" data-el="include-supplier"> Include supplier name in link</label>
      <button type="button" class="btn" data-act="save">Save to history</button>
      <button type="button" class="btn btn--ghost" data-act="reset">Reset</button>`
        : '<a class="btn" data-el="open-full" href="tool/">Open full tool</a>'}
    </div>
  </section>`;
}

function fullMarkup() {
  return `
  <p class="notice notice--warn" data-el="share-notice" hidden></p>
  <p class="notice notice--warn" data-el="storage-notice" hidden>Saving is unavailable in this browser, so history and supplier profiles are turned off. Checks, batch analysis and share links still work.</p>
  <section class="tool-section" aria-labelledby="h-single"><h2 id="h-single">Single check</h2><div class="tool-split">${singleMarkup(true)}</div></section>
  <section class="tool-section" aria-labelledby="h-batch">
    <h2 id="h-batch">Batch</h2>
    <p class="muted">Paste a table from Excel or a SQL result: supplier, searches, bookings, average latency (ms), and optionally error rate (%). Tab, semicolon or comma separated; the header row is detected. Numbers like 8.500, 8,500 and 0,4 are understood.</p>
    <div class="card stack">
      <div class="fields">
        <div class="field"><label for="batch-period">Period <span class="opt">optional</span></label><input id="batch-period" data-el="batch-period" maxlength="40" placeholder="2026-W43"></div>
        <div class="field"><label for="batch-benchmark">Default benchmark</label><select id="batch-benchmark" data-el="batch-benchmark">${benchmarkOptions(false)}</select></div>
      </div>
      <div class="field"><label for="batch-input">Data</label><textarea id="batch-input" data-el="batch-input" spellcheck="false" placeholder="Supplier&#9;Searches&#9;Bookings&#9;Latency&#9;Errors"></textarea></div>
      <div class="btn-row"><button type="button" class="btn btn--primary" data-act="batch-run">Analyze</button><button type="button" class="btn" data-act="batch-example">Load example</button><button type="button" class="btn btn--ghost" data-act="batch-clear">Clear</button></div>
      <ul class="notice notice--warn problems" data-el="batch-problems" hidden></ul>
      <div data-el="batch-results" hidden>
        <div class="table-wrap"><table class="table"><thead><tr><th>Supplier</th><th class="num">L2B</th><th class="num">Latency</th><th class="num">Errors</th><th>Status</th></tr></thead><tbody data-el="batch-body"></tbody></table></div>
        <div class="btn-row tool-actions"><button type="button" class="btn" data-act="batch-copy">Copy report</button><button type="button" class="btn" data-act="batch-csv">Export CSV</button><button type="button" class="btn" data-act="batch-save">Save all to history</button></div>
        <p class="small muted">Suppliers with a saved profile are scored with their own thresholds; others use the default benchmark.</p>
      </div>
    </div>
  </section>
  <section class="tool-section" aria-labelledby="h-history">
    <h2 id="h-history">History and profiles</h2>
    <p class="muted">Stored in this browser on this site only, separate from the Chrome extension. Up to ${MAX_HISTORY} records. Use a backup file to move them.</p>
    <div class="card stack">
      <div class="fields"><div class="field"><label for="history-filter">Filter by supplier</label><input id="history-filter" data-el="history-filter" type="search" placeholder="Supplier name"></div></div>
      <p class="muted" data-el="history-empty">No saved checks yet.</p>
      <div class="table-wrap" data-el="history-wrap" hidden><table class="table"><thead><tr><th>Supplier</th><th>Period</th><th>Saved</th><th class="num">L2B</th><th class="num">Latency</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody data-el="history-body"></tbody></table></div>
      <h3>Supplier profiles</h3>
      <ul class="profile-list" data-el="profile-list"></ul>
      <div class="btn-row">
        <button type="button" class="btn" data-act="history-csv">Export CSV</button>
        <button type="button" class="btn" data-act="backup-export">Export backup</button>
        <label class="btn" for="backup-file">Import backup</label><input class="sr-only" id="backup-file" data-el="backup-file" type="file" accept="application/json,.json">
        <button type="button" class="btn btn--ghost" data-act="history-clear">Clear history</button>
      </div>
    </div>
  </section>`;
}

export function mount(container, { mode = 'full' } = {}) {
  const full = mode === 'full';
  container.classList.add('tool', `tool--${mode}`);
  container.innerHTML = (full ? fullMarkup() : `<div class="tool-split">${singleMarkup(false)}</div>`) + '<div class="toast" role="status" aria-live="polite" data-el="toast" hidden></div>';

  const el = (name) => container.querySelector(`[data-el="${name}"]`);
  const canSave = full && storageWorks();
  const state = { benchmark: 'generic', thresholds: presetThresholds('generic'), history: [], suppliers: {}, batch: [], batchDefault: 'generic' };

  let toastTimer;
  function toast(msg) {
    const t = el('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }
  async function copyText(text, ok) {
    try {
      await navigator.clipboard.writeText(text);
      toast(ok);
    } catch {
      toast('Copying is blocked in this browser. Select the text and copy it manually.');
    }
  }
  function download(content, filename, type) {
    const url = URL.createObjectURL(new Blob(content, { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function downloadCSV(records, filename) {
    const eu = (1.5).toLocaleString().includes(',');
    download(['﻿', recordsToCSV(records, eu ? { delimiter: ';', decimal: ',' } : {})], filename, 'text/csv;charset=utf-8');
    toast(`Exported ${records.length} record${records.length === 1 ? '' : 's'}`);
  }
  const findProfile = (name) => state.suppliers[String(name || '').trim().toLowerCase()] || null;
  async function persist() {
    if (!canSave) return;
    await store.set('history', state.history);
    await store.set('suppliers', state.suppliers);
  }

  // ---------- single check ----------
  const read = () => ({ searches: el('searches').value, bookings: el('bookings').value, latency: el('latency').value, errors: el('errors').value });

  function syncThresholds() {
    el('benchmark').value = state.benchmark;
    container.querySelectorAll('input[data-kind]').forEach((inp) => {
      inp.value = state.thresholds[inp.dataset.kind][Number(inp.dataset.i)];
    });
  }

  function currentShare() {
    const ev = evaluate(read(), state.thresholds);
    return {
      ev,
      state: { supplier: full ? el('supplier').value : '', period: full ? el('period').value : '', benchmark: state.benchmark, thresholds: normalizeThresholds(state.thresholds), searches: ev.searches, bookings: ev.bookings, latency: ev.latency, errors: ev.errors },
    };
  }

  function render() {
    const ev = evaluate(read(), state.thresholds);
    el('verdict').innerHTML = ev.valid ? badge(ev.healthIndex, ev.health) : '<span class="muted">Waiting for data</span>';
    container.querySelectorAll('[data-seg]').forEach((s) => s.classList.toggle('is-on', ev.valid && Number(s.dataset.seg) === ev.healthIndex));
    el('ratio').textContent = ev.valid ? ev.ratioText : '—';
    el('latency-v').textContent = ev.valid ? `${fmtNum(ev.latency)} ms` : '—';
    el('latency-b').innerHTML = ev.valid ? badge(ev.levels.latency, LATENCY_LABELS[ev.levels.latency]) : '';
    el('errors-v').textContent = ev.valid && ev.errors !== null ? `${ev.errors}%` : '—';
    el('errors-b').innerHTML = ev.valid && ev.errors !== null ? badge(ev.levels.errors, ERROR_LABELS[ev.levels.errors]) : '';
    el('note').textContent = ev.valid
      ? NOTES[ev.healthIndex] + (ev.errors === null ? ' Error rate not provided, so it is left out of the verdict.' : '')
      : 'Enter whole-number searches and bookings, and an average response time.';
    if (!full) {
      const link = el('open-full');
      const base = link.getAttribute('href').split('#')[0];
      link.setAttribute('href', ev.valid ? `${base}#${encodeShare(currentShare().state)}` : base);
    }
  }

  function setBenchmark(key) {
    state.benchmark = key;
    if (key !== 'custom') state.thresholds = presetThresholds(key);
    syncThresholds();
    render();
  }

  function renderSupplierList() {
    if (!full) return;
    const names = new Map();
    for (const p of Object.values(state.suppliers)) names.set(p.name.toLowerCase(), p.name);
    for (const r of state.history) if (!names.has(r.supplier.toLowerCase())) names.set(r.supplier.toLowerCase(), r.supplier);
    el('supplier-list').innerHTML = [...names.values()].sort((a, b) => a.localeCompare(b)).map((n) => `<option value="${esc(n)}"></option>`).join('');
  }

  el('form').addEventListener('submit', (e) => e.preventDefault());
  for (const id of ['searches', 'bookings', 'latency', 'errors']) el(id).addEventListener('input', render);
  el('benchmark').addEventListener('change', (e) => setBenchmark(e.target.value));
  container.querySelectorAll('input[data-kind]').forEach((inp) =>
    inp.addEventListener('input', () => {
      state.thresholds[inp.dataset.kind][Number(inp.dataset.i)] = inp.value === '' ? NaN : Number(inp.value);
      state.benchmark = 'custom';
      el('benchmark').value = 'custom';
      render();
    }),
  );

  // ---------- actions ----------
  const actions = {
    'copy-report': () => {
      const ev = evaluate(read(), state.thresholds);
      if (!ev.valid) return toast('Enter valid numbers first');
      copyText(formatReport({ supplier: full ? el('supplier').value : '', period: full ? el('period').value : '', ev }), 'Report copied');
    },
    'copy-link': () => {
      const { ev, state: st } = currentShare();
      if (!ev.valid) return toast('Enter valid numbers first');
      const url = `${location.origin}${location.pathname}#${encodeShare(st, { includeSupplier: el('include-supplier').checked })}`;
      copyText(url, 'Share link copied');
    },
    save: async () => {
      const ev = evaluate(read(), state.thresholds);
      const supplier = el('supplier').value.trim();
      if (!canSave) return toast('Saving is unavailable in this browser');
      if (!ev.valid) return toast('Enter valid numbers first');
      if (!supplier) return toast('Add a supplier name to save');
      const rec = makeRecord({ supplier, period: el('period').value, searches: ev.searches, bookings: ev.bookings, latency: ev.latency, errors: ev.errors, benchmark: state.benchmark, thresholds: state.thresholds });
      state.history = [rec, ...state.history].slice(0, MAX_HISTORY);
      state.suppliers[supplier.toLowerCase()] = { name: supplier, benchmark: state.benchmark, thresholds: cloneThresholds(normalizeThresholds(state.thresholds)) };
      await persistAnd('Saved to history');
    },
    reset: () => {
      for (const id of ['supplier', 'period', 'searches', 'bookings', 'latency', 'errors']) el(id).value = '';
      el('include-supplier').checked = false;
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      setBenchmark('generic');
    },
    'batch-run': runBatch,
    'batch-example': () => {
      el('batch-input').value = BATCH_EXAMPLE;
      runBatch();
    },
    'batch-clear': () => {
      el('batch-input').value = '';
      state.batch = [];
      el('batch-results').hidden = true;
      el('batch-problems').hidden = true;
    },
    'batch-copy': () => copyText(formatBatchReport(state.batch, el('batch-period').value), 'Batch report copied'),
    'batch-csv': () => {
      const recs = batchRecords();
      if (recs.length) downloadCSV(recs, `apipulse-batch-${stamp()}.csv`);
      else toast('Nothing valid to export');
    },
    'batch-save': async () => {
      if (!canSave) return toast('Saving is unavailable in this browser');
      const recs = batchRecords();
      if (!recs.length) return toast('Nothing valid to save');
      state.history = [...recs, ...state.history].slice(0, MAX_HISTORY);
      await persistAnd(`Saved ${recs.length} record${recs.length === 1 ? '' : 's'}`);
    },
    'history-csv': () => (state.history.length ? downloadCSV(state.history, `apipulse-history-${stamp()}.csv`) : toast('Nothing to export yet')),
    'backup-export': () => {
      download([serializeBackup({ history: state.history, suppliers: state.suppliers })], `apipulse-backup-${stamp()}.json`, 'application/json');
      toast('Backup downloaded');
    },
    'history-clear': async (btn) => {
      if (!state.history.length) return;
      if (btn.dataset.armed !== '1') {
        btn.dataset.armed = '1';
        btn.textContent = 'Click again to clear';
        setTimeout(() => {
          btn.dataset.armed = '';
          btn.textContent = 'Clear history';
        }, 3000);
        return;
      }
      btn.dataset.armed = '';
      btn.textContent = 'Clear history';
      state.history = [];
      await persistAnd('History cleared. Supplier profiles kept.');
    },
  };

  async function persistAnd(msg) {
    try {
      await persist();
      toast(msg);
    } catch {
      toast('Could not save. Storage may be full or blocked.');
    }
    renderHistory();
    renderSupplierList();
  }

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (btn && actions[btn.dataset.act]) actions[btn.dataset.act](btn);
  });

  // ---------- batch ----------
  function runBatch() {
    const { rows, problems } = parseBatch(el('batch-input').value);
    state.batchDefault = el('batch-benchmark').value;
    const defaults = presetThresholds(state.batchDefault);
    state.batch = evaluateBatch(rows, (name) => findProfile(name)?.thresholds ?? defaults);
    const list = el('batch-problems');
    list.hidden = problems.length === 0;
    list.innerHTML = problems.map((p) => `<li>Line ${p.line}: ${esc(p.message)}</li>`).join('');
    el('batch-results').hidden = state.batch.length === 0;
    el('batch-body').innerHTML = state.batch
      .map((r) =>
        r.ev.valid
          ? `<tr><td>${esc(r.supplier)}</td><td class="num">${esc(r.ev.ratioText)}</td><td class="num">${fmtNum(r.ev.latency)} ms</td><td class="num">${r.ev.errors === null ? '—' : `${r.ev.errors}%`}</td><td>${badge(r.ev.healthIndex, r.ev.health)}</td></tr>`
          : `<tr><td>${esc(r.supplier)}</td><td colspan="3" class="muted">Invalid data on line ${r.line}</td><td><span class="badge">Invalid</span></td></tr>`,
      )
      .join('');
    if (!rows.length && !problems.length) toast('Paste some data first');
  }

  function batchRecords() {
    const period = el('batch-period').value;
    return state.batch.filter((r) => r.ev.valid).map((r) =>
      makeRecord({ supplier: r.supplier, period, searches: r.ev.searches, bookings: r.ev.bookings, latency: r.ev.latency, errors: r.ev.errors, benchmark: findProfile(r.supplier)?.benchmark ?? state.batchDefault, thresholds: r.thresholds, source: 'batch' }),
    );
  }

  // ---------- history ----------
  function renderHistory() {
    if (!full) return;
    const q = el('history-filter').value.trim().toLowerCase();
    const items = state.history.filter((r) => !q || r.supplier.toLowerCase().includes(q));
    el('history-empty').hidden = state.history.length > 0;
    el('history-wrap').hidden = state.history.length === 0;
    el('history-body').innerHTML = items
      .map((r) => {
        const ev = evaluateRecord(r);
        return `<tr><td>${esc(r.supplier)}</td><td>${esc(r.period || '—')}</td><td>${esc(fmtDate(r.date))}</td><td class="num">${esc(ev.ratioText)}</td><td class="num">${fmtNum(r.latency)} ms</td><td>${ev.valid ? badge(ev.healthIndex, ev.health) : '<span class="badge">Invalid</span>'}</td><td><div class="btn-row"><button type="button" class="btn btn--small" data-row="load" data-id="${esc(r.id)}">Load</button><button type="button" class="btn btn--small btn--ghost" data-row="delete" data-id="${esc(r.id)}" aria-label="Delete ${esc(r.supplier)} record">Delete</button></div></td></tr>`;
      })
      .join('');
    const profiles = Object.entries(state.suppliers).sort((a, b) => a[1].name.localeCompare(b[1].name));
    el('profile-list').innerHTML = profiles.length
      ? profiles.map(([key, p]) => `<li><span>${esc(p.name)} <span class="muted small">${esc(BENCHMARKS[p.benchmark]?.name ?? 'Custom thresholds')}</span></span><button type="button" class="btn btn--small btn--ghost" data-row="remove-profile" data-key="${esc(key)}" aria-label="Remove profile ${esc(p.name)}">Remove</button></li>`).join('')
      : '<li class="muted">No profiles yet. Saving a check creates one with its thresholds.</li>';
  }

  function loadRecord(rec) {
    el('supplier').value = rec.supplier;
    el('period').value = rec.period || '';
    el('searches').value = rec.searches ?? '';
    el('bookings').value = rec.bookings ?? '';
    el('latency').value = rec.latency ?? '';
    el('errors').value = rec.errors ?? '';
    state.benchmark = rec.benchmark === 'custom' || BENCHMARKS[rec.benchmark] ? rec.benchmark : 'custom';
    state.thresholds = normalizeThresholds(rec.thresholds);
    syncThresholds();
    render();
    el('form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (full) {
    el('supplier').addEventListener('input', () => {
      const p = findProfile(el('supplier').value);
      if (p) {
        state.benchmark = p.benchmark;
        state.thresholds = normalizeThresholds(p.thresholds);
        syncThresholds();
      }
      render();
    });
    el('history-filter').addEventListener('input', renderHistory);
    container.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-row]');
      if (!b) return;
      if (b.dataset.row === 'load') {
        const rec = state.history.find((r) => r.id === b.dataset.id);
        if (rec) loadRecord(rec);
      } else if (b.dataset.row === 'delete') {
        state.history = state.history.filter((r) => r.id !== b.dataset.id);
        await persistAnd('Record deleted');
      } else if (b.dataset.row === 'remove-profile') {
        delete state.suppliers[b.dataset.key];
        await persistAnd('Profile removed');
      }
    });
    el('backup-file').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!canSave) return toast('Saving is unavailable in this browser');
      if (file.size > 5_000_000) return toast('This file is too large to be an APIPulse backup.');
      const out = parseBackup(await file.text());
      if (!out.ok) return toast(out.error);
      const seen = new Set(state.history.map((r) => r.id));
      state.history = [...out.history.filter((r) => !seen.has(r.id)), ...state.history]
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, MAX_HISTORY);
      state.suppliers = { ...state.suppliers, ...out.suppliers };
      await persistAnd(`Imported ${out.history.length} record${out.history.length === 1 ? '' : 's'} and ${Object.keys(out.suppliers).length} profile${Object.keys(out.suppliers).length === 1 ? '' : 's'}`);
    });
  }

  // ---------- start ----------
  syncThresholds();
  if (full && /^#v\d+=/.test(location.hash)) {
    const out = decodeShare(location.hash);
    const notice = el('share-notice');
    if (out.ok) {
      const s = out.state;
      el('supplier').value = s.supplier;
      el('period').value = s.period;
      el('searches').value = s.searches;
      el('bookings').value = s.bookings;
      el('latency').value = s.latency;
      el('errors').value = s.errors ?? '';
      state.benchmark = s.benchmark;
      state.thresholds = cloneThresholds(s.thresholds);
      syncThresholds();
      notice.textContent = `Showing a shared result. Nothing is saved unless you choose Save to history.${out.notice ? ' ' + out.notice : ''}`;
    } else {
      notice.textContent = out.error;
    }
    notice.hidden = false;
  }
  render();

  if (full) {
    if (!canSave) {
      el('storage-notice').hidden = false;
      return;
    }
    store.loadAll().then(
      (loaded) => {
        state.history = loaded.history;
        state.suppliers = loaded.suppliers;
        renderHistory();
        renderSupplierList();
      },
      () => toast('Saved history could not be loaded.'),
    );
    renderHistory();
  }
}

const host = document.querySelector('[data-tool-mode]');
if (host) mount(host, { mode: host.dataset.toolMode });
