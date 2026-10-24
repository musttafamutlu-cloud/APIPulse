# APIPulse Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a no-install APIPulse web tool inside a small knowledge hub (home, tool, guide, teams, privacy) served from the repo root on GitHub Pages.

**Architecture:** Static HTML pages at the repo root, shared `assets/site.css` and a tiny `assets/site.js`. The tool UI (`assets/tool.js`) imports the extension's pure modules (`extension/src/core.js`, `extension/src/storage.js`) plus a new pure module `extension/src/share.js` for share links and JSON backups. No build step; Node's built-in test runner checks logic and site integrity.

**Tech Stack:** HTML5, CSS custom properties, ES modules, `node:test` (Node 20+), GitHub Pages (deploy from `main` / root, `.nojekyll`).

**Spec:** `docs/superpowers/specs/2026-10-24-apipulse-website-design.md`

## Global Constraints

- No build step, no framework, no npm dependencies.
- Brand spelling on the site: **APIPulse**. The extension (`extension/**`) is not modified except adding `extension/src/share.js`.
- Base URL for absolute links: `https://musttafamutlu-cloud.github.io/APIPulse/` (canonical, `og:url`, `og:image`, `sitemap.xml` only). All other links relative.
- Every page has `<meta http-equiv="Content-Security-Policy">`, no inline `<script>`, no `style=""` attributes, no inline `<style>`.
  - Home and `/tool/`: `default-src 'self'; connect-src 'none'; form-action 'none'; img-src 'self' data:; base-uri 'none'`
  - `/teams/`: same but `form-action https://formspree.io mailto:`
  - Other pages: `default-src 'self'; connect-src 'none'; form-action 'none'; img-src 'self' data:; base-uri 'none'`
- Header (Tool · Guide · Teams · Add to Chrome) and footer (GitHub, Privacy, Apache-2.0, "Not affiliated with any supplier named on this site.") are identical static HTML on every page except for the relative path prefix (`./`, `../`, `../../`), since every page links relative to itself.
- Chrome Web Store URL: `https://chromewebstore.google.com/detail/lcmdjjckhlcoflpjfhgbgcpegommmjfi`
- GitHub URL: `https://github.com/musttafamutlu-cloud/APIPulse`
- Contact fallback: `mailto:musttafamutlu@gmail.com` on `/teams/` only, never as a byline.
- Copy: English, senior and calm; no "unlock / seamless / supercharge", no exclamation marks, no invented stats, users, customers or logos; no mention of CuddlyNest. Example thresholds labelled "illustrative".
- Theme follows `prefers-color-scheme` only; respect `prefers-reduced-motion`. Works at 360px and 1280px.
- Storage keys keep the `apipulse:` prefix (already in `storage.js`). History cap: 200 records.
- Pages list (used by the site test): `index.html`, `tool/index.html`, `guide/index.html`, `guide/look-to-book/index.html`, `guide/latency/index.html`, `guide/errors/index.html`, `guide/thresholds/index.html`, `teams/index.html`, `privacy/index.html`, `404.html`.

## Review Focus

1. A hand-edited, truncated or foreign share link (`#v1=garbage`, `#v2=...`, >2 KB) must show a calm notice and leave the form empty, never throw.
2. `localStorage` unavailable (Safari private mode, blocked storage): calculator, batch and share still work; history/profile features show "Saving is unavailable in this browser" instead of failing.
3. Turkish/Unicode supplier names (`Şahin Tur`, `İstanbul`) survive a share link and a JSON backup round-trip.
4. Importing a JSON file that is not an APIPulse backup, or is from a newer version, is rejected with a message and existing data is untouched.
5. Bookings = 0 and searches = 0 produce the same verdict and `Infinity:1` / `n/a` text as the extension, including after a share-link round-trip.

---

### Task 1: Share and backup helpers (`extension/src/share.js`)

**Files:**
- Create: `extension/src/share.js`
- Test: `tests/share.test.mjs`

**Interfaces:**
- Consumes: `normalizeThresholds`, `presetThresholds`, `BENCHMARKS`, `makeRecord`-shaped records from `core.js`.
- Produces:
  - `export const SHARE_VERSION = 1;` `export const MAX_SHARE_LENGTH = 2048;`
  - `encodeShare(state, { includeSupplier = false } = {}) -> string` — `state = { supplier?, period?, benchmark, thresholds, searches, bookings, latency, errors /* number|null */ }`. Returns `"v1=" + base64url(UTF-8 JSON)`. Keys in JSON: `s` supplier (only if `includeSupplier` and non-empty), `p` period (if non-empty), `b` benchmark key, `t` thresholds (only if different from `presetThresholds(b)`), `n` `[searches, bookings, latency, errors]`.
  - `decodeShare(fragment) -> { ok: true, state, notice?: string } | { ok: false, error: string }` — accepts with or without leading `#`. Unknown benchmark → `generic` + notice. Unknown extra keys ignored. Thresholds pass through `normalizeThresholds`.
  - `serializeBackup({ history, suppliers }) -> string` — pretty JSON `{ app: 'APIPulse', kind: 'backup', version: 1, exportedAt: ISOString, history, suppliers }`.
  - `parseBackup(text) -> { ok: true, history, suppliers } | { ok: false, error: string }` — requires `app === 'APIPulse'`, `kind === 'backup'`, `version === 1`; keeps only records with string `supplier` and numeric-or-null fields; normalizes thresholds; caps history at 200; suppliers keyed by lowercase name with `{ name, benchmark, thresholds }`.

- [ ] **Step 1: Write the failing tests** in `tests/share.test.mjs`:
  - `share round-trips a full state` — encode then decode equals input (thresholds normalized), `ok === true`.
  - `share omits supplier unless asked` — decoded `state.supplier === ''` by default; equals `'Şahin Tur'` with `{ includeSupplier: true }`.
  - `share omits preset thresholds` — `JSON` inside the payload has no `t` key when thresholds equal `presetThresholds('hotels')`.
  - `share keeps zero and null values` — `searches: 5000, bookings: 0, errors: null` round-trips; `evaluate(decoded).ratioText === 'Infinity:1'`.
  - `decodeShare rejects garbage` — `'v1=%%%'`, `'v1='`, `'hello'`, `''` → `ok === false` with non-empty `error`; never throws.
  - `decodeShare rejects other versions` — `'v2=' + payload` → `ok === false`, error mentions version.
  - `decodeShare rejects oversized input` — string of length `MAX_SHARE_LENGTH + 1` → `ok === false`.
  - `decodeShare unknown benchmark falls back` — `b: 'cruise'` → `state.benchmark === 'generic'`, `notice` set.
  - `backup round-trips` — `parseBackup(serializeBackup({history:[rec], suppliers:{x:{...}}}))` deep-equals input; includes a Turkish name.
  - `parseBackup rejects foreign JSON` — `'{}'`, `'[]'`, `'not json'`, `{app:'APIPulse',kind:'backup',version:2}` → `ok === false`.
  - `parseBackup caps history at 200` — 250 records in → 200 out.
- [ ] **Step 2: Run** `node --test tests/share.test.mjs` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `extension/src/share.js`. base64url via `TextEncoder`/`TextDecoder` + `btoa`/`atob` (available in Node 20 and browsers); wrap all decoding in try/catch. No `chrome.*`, no DOM.
- [ ] **Step 4: Run** `npm test` — Expected: all tests pass (13 existing + new).
- [ ] **Step 5: Commit** `feat(share): add share-link and backup helpers`

### Task 2: Site shell, styles and integrity test

**Files:**
- Create: `assets/site.css`, `assets/site.js`, `assets/img/icon.png` (copy of `extension/icons/icon128.png`), `.nojekyll`, `404.html`, `index.html` (placeholder main), `tool/index.html`, `guide/index.html`, `guide/look-to-book/index.html`, `guide/latency/index.html`, `guide/errors/index.html`, `guide/thresholds/index.html`, `teams/index.html`, `privacy/index.html` (all with real header/footer and a placeholder `<main>`)
- Test: `tests/site.test.mjs`
- Modify: `package.json` test script stays `node --test tests/*.test.mjs` (already picks up new files).

**Interfaces:**
- Produces: CSS classes later tasks use — layout `.wrap`, `.stack`, `.grid`; components `.card`, `.btn`, `.btn--primary`, `.field`, `.badge`, `.badge--0..3` (Excellent..Critical), `.notice`, `.notice--warn`, `.table`, `.prose`, `.kpi`. Header `<header class="site-header">`, nav toggle button `#nav-toggle` controlling `#site-nav` (handled by `site.js`).
- No `robots.txt`: on a GitHub Pages project site it would live at `/APIPulse/robots.txt`, which crawlers ignore (deviation from spec 12.13, noted for Mustafa). Instead the repo audit in Task 7 confirms nothing sensitive is published, and the sitemap is submitted later via Search Console.

- [ ] **Step 1: Write the failing test** `tests/site.test.mjs` iterating the Pages list:
  - `every page exists and has one <h1>, a <title>, a meta description and a canonical under the base URL`
  - `every page has a CSP meta tag` — and the policy for `index.html`/`tool/index.html` contains `connect-src 'none'`; `teams/index.html` contains `formspree.io`.
  - `no inline scripts or styles` — no `<script>` without `src`, no `<style`, no ` style="`.
  - `header and footer are identical across pages` — extract `<header class="site-header">…</header>` and `<footer class="site-footer">…</footer>`, replace each page's relative prefix (`./`, `../`, `../../`) with `ROOT/`, assert all equal.
  - `every internal href/src resolves to a file` — resolve relative to the page; directories resolve to `index.html`; ignore `http(s):`, `mailto:`, `#`.
  - `no forbidden words` — page text contains none of `CuddlyNest`, `unlock`, `seamless`, `supercharge`, `!` inside `<main>` text nodes.
- [ ] **Step 2: Run** `node --test tests/site.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** the shell and styles. `site.js` only toggles the mobile nav (`aria-expanded`) and marks the current nav link with `aria-current="page"`. Status colours with text labels; system font stack; monospace for numbers.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(site): add static shell, styles and integrity tests`

### Task 3: Web tool (`assets/tool.js`, `/tool/`)

**Files:**
- Create: `assets/tool.js`
- Modify: `tool/index.html` (main content), `assets/site.css` (tool-specific styles)

**Interfaces:**
- Consumes: everything exported by `core.js`; `get`, `set`, `loadAll` from `storage.js`; Task 1 exports.
- Produces: `export function mount(container: HTMLElement, { mode: 'compact' | 'full' }): void`. `compact` = single check only plus "Open full tool" link to `../tool/` (relative to page) carrying the share fragment. `full` = sections Single check · Batch · History, profiles, CSV (comma or Excel-EU `;` with decimal comma via `recordsToCSV`), Export backup / Import backup, Copy report, Copy share link with "Include supplier name" checkbox (unchecked by default). On load, if `location.hash` starts with `#v1=` → `decodeShare`, prefill, evaluate, show `notice` if any; never writes to storage.
- `tool/index.html` loads `<script type="module" src="../assets/tool.js">` and a module that calls `mount(document.querySelector('#tool'), { mode: 'full' })` — put that call at the bottom of `tool.js` keyed on `document.querySelector('[data-tool-mode]')` so pages stay inline-script-free.

- [ ] **Step 1: Implement** `mount` and the page. Storage wrapped so any thrown error sets a `storageAvailable = false` flag and shows the Review Focus #2 notice. Verdict and per-metric labels from `LEVELS`, `LATENCY_LABELS`, `ERROR_LABELS`; report text from `formatReport` / `formatBatchReport` only.
- [ ] **Step 2: Verify parity in a browser** (local static server rooted above the repo, open `/APIPulse/tool/`): README batch example ranks Sabre, ExampleSupplier, Hotelbeds, Amadeus in the same order and statuses as the extension; single cases `8500/125/245/0.4` → Excellent, `120000/80/3100/2.5` → Critical, `5000/0/950/–` → same as extension.
- [ ] **Step 3: Verify Review Focus #1, #2, #4, #5** manually: garbage hash shows notice; storage blocked (DevTools → disable site data) shows notice and calculator works; importing `package.json` is rejected; zero cases match.
- [ ] **Step 4: Verify** network panel on `/tool/` shows only same-origin static files and the console has no CSP errors.
- [ ] **Step 5: Run** `npm test` — PASS. **Commit** `feat(tool): add web version of the APIPulse calculator`

### Task 4: Home page

**Files:**
- Modify: `index.html`, `assets/site.css`

**Interfaces:**
- Consumes: `mount(container, { mode: 'compact' })` via `<div id="tool" data-tool-mode="compact">`.

- [ ] **Step 1: Implement** sections per spec 8.1: H1 "Supplier health for travel APIs.", subline "Look-to-book, latency and errors in one verdict.", compact tool, three guide cards (L2B, latency, errors), "Use it in Chrome" block (store link), "For teams" block (link to `teams/`), privacy line "Runs in your browser. Your numbers never leave your device."
- [ ] **Step 2: Verify** at 360px and 1280px, light and dark; "Open full tool" carries current inputs.
- [ ] **Step 3: Run** `npm test` — PASS. **Commit** `feat(site): add home page`

### Task 5: Guide

**Files:**
- Modify: `guide/index.html`, `guide/look-to-book/index.html`, `guide/latency/index.html`, `guide/errors/index.html`, `guide/thresholds/index.html`
- Test: `tests/guide.test.mjs`

**Interfaces:**
- Consumes: `BENCHMARKS` (test only); share links built by hand with `encodeShare` output pasted as static `href`s (generated once with a small node one-liner and checked by the test).
- Produces: `/guide/thresholds/` contains `<table data-benchmarks>` with one `<tr data-preset="generic|flights|hotels">` per preset and cells `data-metric="ratio|latency|errors"` holding the three values as `a / b / c`.

- [ ] **Step 1: Write the failing test** `tests/guide.test.mjs`:
  - `threshold table matches BENCHMARKS` — for each preset and metric, the cell text parsed into three numbers equals `BENCHMARKS[key][metric]`.
  - `every "try it" link decodes` — each `a[href*="#v1="]` in guide pages passes `decodeShare(...).ok === true`.
  - `each article has an answer paragraph, a worked example, and a Last reviewed date` — elements `.answer`, `.example`, `time[datetime]`.
- [ ] **Step 2: Run** `node --test tests/guide.test.mjs` — FAIL.
- [ ] **Step 3: Write** the index and four articles (600–1,200 words each) from public, general industry knowledge; all example numbers round and labelled illustrative; no supplier contract terms.
- [ ] **Step 4: Run** `npm test` — PASS. **Commit** `feat(guide): add L2B, latency, errors and thresholds guides (draft for review)`
- [ ] **Step 5: Hand-off:** ask Mustafa to review the four articles before the PR is merged.

### Task 6: Teams and privacy pages

**Files:**
- Modify: `teams/index.html`, `privacy/index.html`, `assets/site.css`

- [ ] **Step 1: Implement** `/teams/`: "What we are exploring" list (shared supplier registry, period comparison, contract limits, alerts, ingestion from logs/API); form fields: work e-mail (required, `type=email`), company, role, suppliers connected (`1–5`, `6–20`, `21–50`, `50+`), use case (textarea), consent checkbox (required) naming Formspree with a link to its privacy policy, hidden honeypot `name="_gotcha"`. Until a Formspree ID exists the form `action` is `mailto:musttafamutlu@gmail.com` with `method="post" enctype="text/plain"`; a `data-formspree-id=""` attribute marks where the ID goes.
- [ ] **Step 2: Implement** `/privacy/` per spec 8.5 and 12.1 (data lives in this browser and on this domain; export/import exists; no cookies; no analytics; the Teams form is the only data that leaves the device; same facts for the extension).
- [ ] **Step 3: Run** `npm test` — PASS. **Commit** `feat(site): add teams waitlist and privacy pages`

### Task 7: SEO, README and final verification

**Files:**
- Create: `sitemap.xml`, `assets/img/social-card.png` (1200×630, mark + "APIPulse — Supplier health for travel APIs")
- Modify: all pages' `<head>` (Open Graph, Twitter card), `README.md` (website link, local preview command, "change base URL on domain move" note)

- [ ] **Step 1: Add** `sitemap.xml` listing every page under the base URL; OG tags on every page pointing to the social card. Audit every tracked file (`git ls-files`) for employer names, credentials or private notes, since Pages publishes the whole repo root.
- [ ] **Step 2: Extend** `tests/site.test.mjs` with `sitemap lists every page`.
- [ ] **Step 3: Run** `npm test` — PASS.
- [ ] **Step 4: Browser check** (Playwright/Chromium, local server under `/APIPulse/`): every page at 360px and 1280px, light and dark, no console errors, no off-origin requests on `/` and `/tool/`; keyboard-only run through the tool.
- [ ] **Step 5: Commit** `chore(site): add sitemap, social card and README notes`; push branch; Mustafa opens the PR, merges, then enables Pages (Settings → Pages → Deploy from a branch → `main` / `(root)`); post-merge smoke test on the live URL.
