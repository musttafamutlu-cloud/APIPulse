# APIpulse

Chrome extension to evaluate **API supplier health** for travel-tech integrations: look-to-book (L2B) ratio, latency and error rate in one verdict. Everything runs locally. No data leaves your device.

## Features (v1.1)

- **Calculator:** enter searches, bookings, avg. latency and (optional) error rate. The worst of the three decides the status: Excellent / Good / Warning / Critical.
- **Supplier profiles:** pick a saved supplier from the name field and its benchmark and thresholds load automatically.
- **Editable thresholds:** replace the presets with the limits from your supplier agreement.
- **Period field:** label every record (e.g. `2026-10`, `W42`).
- **Batch mode:** paste a table from Excel or a SQL result and get all suppliers ranked worst-first.
- **History + CSV export:** up to 200 records, Excel-friendly CSV (Turkish/EU locale aware).
- **One-line report** to paste into Slack or e-mail.

> The benchmark presets (Generic, Flights, Hotels) are illustrative starting points. Calibrate them to real agreements.

## Install (unpacked)

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select the `extension/` folder of this repo.
3. Pin APIpulse from the puzzle-piece menu.

After changing any file, click the reload icon on the extension card.

## Batch input format

Tab (Excel paste), `;` or `,` separated. A header row is detected automatically.

```
Supplier   Searches   Bookings   Latency(ms)   Errors%
Amadeus    8500       125        245           0.4
Sabre      120000     80         3100          2.5
```

Numbers like `8.500`, `8,500` and `0,4` are understood.

## Project structure

```
extension/
  manifest.json      Chrome extension manifest (MV3)
  popup.html/.css    UI
  src/core.js        Calculation, parsing, reports, CSV (pure functions, tested)
  src/storage.js     chrome.storage.local wrapper + v1.0 history migration
  src/popup.js       UI logic
tests/               Unit tests (node:test)
docs/ROADMAP.md      Product roadmap
```

No build step: edit the files and reload the extension.

## Tests

```
npm test
```

(Node 20+ required. No dependencies.)

## Privacy

Permissions: `storage` (history/profiles on your device) and `clipboardWrite`. The extension has no host permissions, no content scripts and makes no network requests.

## Kurulum (Türkçe kısa)

`chrome://extensions` → Geliştirici modu → **Paketlenmemiş öğe yükle** → bu repodaki `extension` klasörünü seç.

## License

Apache-2.0, see [LICENSE](LICENSE).
