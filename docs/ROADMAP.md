# Roadmap

## Level 1: done in v1.1
- Saved supplier profiles, editable thresholds per supplier
- Period field, history up to 200 records, CSV export
- Error scale now has 4 levels (previously "Good" was skipped)

## Level 2: team-grade workflow (next)
- Compare periods: "who got worse since last week"
- Per-supplier contract limits as first-class settings (L2B cap, latency SLA)
- More input shapes (JSON / API log snippets) for batch mode
- Import/export of supplier profiles (share with a colleague as a file)

## Level 3: SaaS
- Accounts and team workspace, shared supplier registry
- Time-series dashboards and trend charts
- Threshold alerts (Slack / e-mail), scheduled weekly report
- Data ingestion by endpoint/webhook instead of manual entry
- The extension stays as the quick-entry client

## Before building Level 3
- Talk to 5-10 TAMs / integration teams: how do they compute this today, what hurts most, would they pay?
- Calibrate default thresholds with real-world supplier agreements
- Review security/privacy needs (enterprise buyers will ask what data leaves the device)
