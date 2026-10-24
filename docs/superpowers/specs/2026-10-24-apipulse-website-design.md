# APIpulse Website — Design

Date: 2026-10-24
Owner: Mustafa Mutlu (product), Claude (builder)
Status: Draft for approval

## 1. Intent and why

APIpulse today is a Chrome extension (v1.1, ~5 users) that turns supplier traffic numbers (searches, bookings, latency, error rate) into one health verdict for travel API suppliers.

The goal is for APIpulse to become **the tool people in travel tech talk about** when they discuss supplier performance and look-to-book (L2B), to the point where companies ask to integrate it into their own stack. Selling is a possible later outcome, not the first goal.

Two problems block that today:

1. **Distribution.** A Chrome Web Store listing is a narrow door. Corporate laptops often block extension installs, and a popup cannot be shared as a link.
2. **Authority.** Nothing tells a visitor that APIpulse is built by people who understand supplier integrations.

The website fixes both: a **no-install web version of the tool** that anyone can open and share, wrapped in a **knowledge hub** (direction "C" from the brainstorm) whose tone shows senior-level understanding of travel supplier integrations.

## 2. Audience

- Integration / connectivity engineers and tech leads at OTAs, TMCs, metasearch and B2B travel platforms
- Technical account managers (TAMs) and supplier / partner managers
- Heads of supply or distribution who own supplier contracts (L2B caps, SLAs)

They know the vocabulary (L2B, p95, timeouts, bedbank, GDS, NDC). The site must speak it plainly and never over-explain basics in a marketing voice.

## 3. Goals

1. Anyone can run the full APIpulse calculation in the browser with no install and no sign-up.
2. Results can be shared as a link and as a one-line Slack/e-mail report.
3. The guide section is the best plain-English reference on supplier health metrics for travel APIs.
4. The Chrome extension keeps living and is promoted from the site; the site and the extension never disagree on a verdict.
5. A "Teams" waitlist captures demand for a team/integration version (first sales signal).

## 4. Non-goals (for this version)

- No accounts, no backend, no database, no server-side storage of user data.
- No team workspace, alerts, scheduled reports, or API/webhook ingestion (that is roadmap Level 3).
- No pricing page with real prices.
- No crowd-sourced benchmark data collection.
- No CMS or blog engine; guide pages are hand-written HTML.

## 5. Anti-goals (would make this a failure even if it works)

- **Breaking the privacy promise.** Inputs must never leave the visitor's browser. No analytics on calculator inputs, no third-party scripts on the tool page.
- **Fake authority.** No invented statistics, customer logos, testimonials, user counts or "trusted by" claims. Example thresholds are labelled as illustrative.
- **Employer entanglement.** No CuddlyNest name, data, screenshots, supplier contract figures or internal knowledge that is not public. Brand is APIpulse only, no personal byline.
- **Marketing voice.** No "unlock", "seamless", "supercharge", exclamation marks or hype. Senior, calm, precise.
- **Code drift.** The site must not re-implement the scoring logic; a second copy would eventually give different verdicts.
- **Killing the extension.** The site promotes the extension; it does not replace or deprecate it.

## 6. Constraints

- Lives in the existing public repo `musttafamutlu-cloud/APIPulse`, alongside `extension/`.
- No build step, no framework, no npm dependencies (same philosophy as the extension). Plain HTML, CSS and ES modules.
- Hosted free on **GitHub Pages**, deployed from the `main` branch, repo root.
- Default URL: `https://musttafamutlu-cloud.github.io/APIPulse/`. A custom domain can be added later without code changes (relative links only).
- Claude's GitHub token can push branches but cannot change repo settings or push workflow files, so Mustafa enables Pages himself (one setting) and no GitHub Actions are used.
- Must work on current Chrome, Edge, Safari and Firefox, desktop and phone (min. 360px wide).
- Accessible: semantic HTML, labelled inputs, keyboard usable, AA contrast, respects `prefers-color-scheme` and `prefers-reduced-motion`.

## 7. What was decided (by Mustafa)

- Direction **C: knowledge hub** with the tool inside it, senior tone, "built by people who know the sector".
- **APIpulse brand in front**, no personal name on the site.
- Website first; the extension stays.
- Possible later: team version / sales. A bedbank or B2C site is explicitly parked.

## 8. Site structure

```
/                    Home
/tool/               Web calculator (single, batch, history)
/guide/              Guide index
/guide/look-to-book/ What L2B is, how it is calculated, why suppliers cap it
/guide/latency/      Average vs p95/p99, timeouts, why averages lie
/guide/errors/       Technical vs business errors, what counts as an error
/guide/thresholds/   Illustrative thresholds by supplier type and how to calibrate them
/teams/              Teams waitlist
/privacy/            What the site and extension do and do not collect
```

All pages share one header (Tool · Guide · Teams · Add to Chrome) and one footer (GitHub, Privacy, licence, "Not affiliated with any supplier named on this site").

### 8.1 Home

- One-sentence positioning, e.g. "Supplier health for travel APIs. Look-to-book, latency and errors in one verdict."
- Compact calculator (single supplier) directly on the page, using the same component as `/tool/`, with a link "Open full tool" for batch and history.
- Three short cards linking to the guide (L2B, latency, errors).
- "Use it in your browser" (Add to Chrome) and "For teams" (waitlist) blocks.
- Privacy line: "Runs in your browser. Your numbers never leave your device."

### 8.2 Tool (`/tool/`)

Feature parity with extension v1.1:

- Single check: supplier, period, benchmark preset, searches, bookings, avg latency, optional error rate → verdict, per-metric levels, L2B ratio.
- Editable thresholds per supplier; saved supplier profiles.
- Batch mode: paste from Excel/SQL (tab, `;` or `,`), header auto-detected, Turkish/EU number formats, ranked worst-first.
- History (up to 200 records), CSV export (comma or Excel-EU `;` with decimal comma).
- Copy one-line report (single and batch).

New on the web:

- **Share link.** Encodes the current single-check inputs (supplier, period, benchmark, thresholds, values) in the URL **fragment** (`#...`). Fragments are not sent to the server, so the privacy promise holds. Opening the link pre-fills and evaluates. Batch results are not shareable in this version.
- **Data portability note.** History and profiles live in the browser's `localStorage` on that site, separate from the extension's storage. This is stated in the UI.

### 8.3 Guide

Four articles plus an index, each 600–1,200 words, with:

- a one-paragraph answer at the top,
- a worked example with round, obviously illustrative numbers,
- a "How APIpulse scores this" box linking to the tool with a pre-filled share link,
- "Last reviewed" date.

Claude drafts all guide text from general, public industry knowledge; Mustafa reviews every article before it is merged. Anything that sounds like a specific supplier's contract term is removed or generalised.

### 8.4 Teams (`/teams/`)

- What a team version would add (from roadmap Levels 2–3): shared supplier registry, period comparison, contract limits, alerts, ingestion from logs/API. Framed as "what we are exploring", not as a product for sale.
- Waitlist form: work e-mail, company, role, number of suppliers connected (ranges), what they would use it for (free text), consent checkbox.
- Form submits to an external form endpoint (see 9.4). Until the endpoint exists, the form falls back to a `mailto:` link.

### 8.5 Privacy (`/privacy/`)

Plain statement: the tool runs entirely client-side; inputs, history and profiles stay in the browser; the only data that leaves the device is what a visitor deliberately submits in the Teams form; which third party receives that; no cookies; no tracking on the tool. Same facts for the extension.

## 9. How it is built

### 9.1 Repository layout

```
index.html                 Home
tool/index.html
guide/index.html
guide/<slug>/index.html
teams/index.html
privacy/index.html
assets/site.css            Shared styles (design tokens, light/dark)
assets/site.js             Header/nav, theme, small shared helpers
assets/tool.js             Tool UI (web), imports the shared core
assets/img/                Icons, social card image
extension/                 Unchanged location; extension/src/core.js is the single source of scoring logic
tests/                     Existing tests + new tests for share-link encoding
.nojekyll                  So GitHub Pages serves files as-is
```

### 9.2 One scoring engine

`assets/tool.js` imports `../extension/src/core.js` directly (relative path; works because Pages serves the repo root). There is exactly one implementation of `evaluate`, `parseBatch`, `evaluateBatch`, `recordsToCSV`, thresholds and presets. New pure helpers needed by the web (share-link encode/decode) go into a sibling module `extension/src/share.js` with unit tests, so the extension can use them later and `core.js` stays unchanged (see 12.7).

### 9.3 Reusing extension UI code

`extension/src/storage.js` already falls back to `localStorage` outside the extension. The web tool reuses `storage.js` as-is. `popup.js` is refactored only if needed to make it mountable in a page container; if the refactor would risk the extension, the tool UI is written fresh in `assets/tool.js` against the same `core.js`, and the extension is left untouched. Either way the extension's behaviour and tests must not change.

### 9.4 Waitlist endpoint

Formspree (free tier) or an equivalent form service that needs no backend. Mustafa creates the account with a **personal (non-CuddlyNest) e-mail** and gives Claude the endpoint ID, which is public by design. Until then, `mailto:` fallback.

### 9.5 Analytics

None in this version. (Option for later: a cookie-less, privacy-first counter on non-tool pages only, announced on the privacy page.) Success is measured with Chrome Web Store installs, GitHub stars/traffic, waitlist sign-ups and inbound messages.

### 9.6 Look and feel

- Calm, technical, editorial: lots of white space, one accent colour, monospace for numbers and ratios, status colours only for verdicts (Excellent / Good / Warning / Critical) with text labels so colour is never the only signal.
- Light and dark themes via CSS custom properties.
- Uses the extension's existing icon as the mark; no new logo in this version.
- System font stack; no web fonts required.
- SEO basics: unique titles and descriptions, Open Graph tags and one social card image, `sitemap.xml`, `robots.txt`, canonical URLs.

### 9.7 Extension link-back

- Extension `README.md` and store description get a link to the website (store text is changed by Mustafa in the Chrome Web Store dashboard; Claude drafts the text).
- Optional, separate change: a small "Open web version / Guide" link in the extension popup footer. Ships as extension v1.2 only if Mustafa wants it.

## 10. Testing and acceptance

- `npm test` passes: existing 13 tests plus new tests for share-link encode/decode (round-trip, malformed input, oversized input).
- Same inputs give the identical verdict in the extension popup and on `/tool/` (checked with the README batch example and three single cases covering Excellent, Warning, Critical).
- Every page works at 360px and 1280px wide, in light and dark mode, with keyboard only.
- No network requests from `/tool/` other than its own static files (checked in the browser network panel).
- All internal links resolve under `/APIPulse/` on GitHub Pages.
- No text on the site mentions CuddlyNest, real contract figures, user counts or customers.

## 11. Delivery and workflow

1. Work happens on branch `site-v1`. Claude pushes the branch; Mustafa reviews and merges via a pull request on GitHub.
2. After merge, Mustafa enables GitHub Pages once: Settings → Pages → Deploy from a branch → `main` / `(root)`.
3. Suggested order: shared shell and styles → tool page → home → guide drafts (Mustafa review) → teams + privacy → SEO and polish.

## 12. Builder-check resolutions (Claude's calls, marked for review)

These came out of an independent builder review of this document. Each is Claude's call unless noted.

1. **Shared origin storage.** All Pages projects on `musttafamutlu-cloud.github.io` share one `localStorage`. Keys stay prefixed `apipulse:` (already the case in `storage.js`), the privacy page says data belongs to this browser and domain, and the tool gets **Export / Import (JSON)** for history and profiles so data survives a domain move.
2. **Absolute URLs.** Canonical, `og:url`, `og:image` and `sitemap.xml` use absolute URLs; everything else is relative. The base URL lives in those places only, with a "change on domain move" note in the README.
3. **Header/footer.** Static HTML in every page (no JS injection, for SEO and no-JS). A node test checks they are identical across pages and that every internal link resolves.
4. **Report text.** `formatReport` / `formatBatchReport` already live in `core.js`; the site uses them as-is.
5. **Tool UI.** Written fresh as `assets/tool.js` exposing `mount(container, { mode: 'compact' | 'full' })`, used on Home (compact) and `/tool/` (full). `popup.js` is not touched. All logic and wording come from `core.js`.
6. **Share link.** `#v1=` + base64url of compact UTF-8 JSON; dot decimals; thresholds only when different from the preset; links over 2 KB rejected; unknown fields/versions ignored with a notice. An "Include supplier name" checkbox, **off by default**, so supplier identities are not leaked into Slack by accident. Opening a link fills and evaluates but never writes to history/profiles until the user saves.
7. **Where share helpers live.** `extension/src/share.js`, a sibling pure module with unit tests. `core.js` is not changed in this version.
8. **CSP.** Every page carries a `<meta http-equiv="Content-Security-Policy">` with no inline scripts or styles. Tool and Home: `default-src 'self'; connect-src 'none'; form-action 'none'; img-src 'self' data:`. Teams: `form-action` allows only the form service origin. This makes "no network requests from the tool" enforced, not just promised.
9. **Modules.** `core.js` has no `chrome.*` usage and no imports, so `../extension/src/core.js` (or the right relative depth) works from every page. Local testing uses a static server rooted one level above the repo so URLs include `/APIPulse/`, matching production.
10. **Guide numbers.** Every preset threshold quoted in the guide comes from `BENCHMARKS`; a node test checks the threshold table in `/guide/thresholds/` against `core.js`. Worked-example values are visibly separate from presets.
11. **Theme.** Follows the system setting only; no toggle in this version.
12. **Known facts.** Licence Apache-2.0. Chrome Web Store listing: `https://chromewebstore.google.com/detail/lcmdjjckhlcoflpjfhgbgcpegommmjfi`. Icons 48 and 128 px exist; the 1200×630 social card is made by hand as a PNG.
13. **Public files.** Pages publishes the whole repo root. Before merge the repo is checked for sensitive or employer-related content; `robots.txt` disallows `/tests/` and `/docs/`.
14. **No preview before merge.** Tested locally under `/APIPulse/` across browsers and widths; after the first merge a short smoke test (links, CSP console errors, Safari clipboard). A small follow-up fix PR is expected and normal.
15. **Teams form spam.** Hidden honeypot field, no captcha script. Consent text names the form service and links to its privacy policy.

## 13. Calls left to the builder

- Exact copy, layout and component styling within the tone and anti-goals above.
- Exact list and order of guide sub-topics within each article.

## 14. Decisions needed from Mustafa

- Contact e-mail for the Teams waitlist (form service account and `mailto:` fallback). Must be a personal, non-CuddlyNest address, ideally a dedicated alias.
- Brand spelling on the site: "APIpulse" (as in the extension and store listing) or "APIPulse".
