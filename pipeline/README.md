# Lebanon 2026 Pipeline

Python replacement for the Excel + VBS refresh loop (see `NEW SETUP.docx`).
Rebuilds all 9 Power Query outputs from `Lebanon 2026_WIDE.xlsx` + the GTS
Google Sheet and updates the output workbook in the shared Drive folder —
no Excel, no VBS, no lock files, ~10s per run.

## Architecture decision (2026-06-11)

Originally tried pulling submissions directly from the SurveyCTO REST API,
decrypting with the form's RSA private key (`pysurveycto`). That works for
decryption itself, but the API's "wide" JSON export uses different field
names/structure than SurveyCTO Desktop's WIDE export (repeat-group
prefixes, select_multiple option codes, geopoint splitting — ~45 column
mismatches), which would need a substantial field-mapping layer to
reconcile. Deferred — see `fetch_wide_from_surveycto()` in
`run_pipeline.py` and the `etl-pipeline` branch history if revisiting.

**Current approach**: keep using SurveyCTO Desktop's auto-sync to produce
`Lebanon 2026_WIDE.xlsx` (same format Moe's pipeline used — proven
column-compatible), but run the sync + this pipeline on **Ralph's Mac**
instead of Moe's laptop, via `launchd` every 2 minutes. This moves the
single point of failure from Moe's machine to Ralph's, but doesn't yet
remove the laptop dependency entirely — see "Future: fully cloud" below.

### Status

- [x] `transforms.py` — all 9 query transforms ported from M code
- [x] `run_pipeline.py` — reads local WIDE export, GTS sheet, writes output
      workbook to Drive
- [x] launchd job (`com.influeanswers.lebanon-pipeline.plist`) for 2-min runs
- [x] Validated against current `Lebanon 2026 - Analysis.xlsx`: 552/553
      rows match exactly across all 9 sheets. The 1 mismatch (row 440,
      `uuid:370f45a5-...`) is right at the 19-minute QA threshold — likely
      a sort-order tie-break between two near-simultaneous submissions,
      not a transform bug. Re-check if it recurs after a real run.
- [ ] **Future**: fully cloud-independent — needs either (a) the API
      field-mapping work above, or (b) SurveyCTO Desktop running headless
      on a small cloud VM with `.secrets/lebanon2026.csprivatekey`.

## Files

| File | Purpose |
|---|---|
| `run_pipeline.py` | Entry point — reads WIDE export + GTS, writes output workbook to Drive |
| `transforms.py` | The 9 query transformations, ported from the M code |
| `validate.py` | Diffs pipeline output against a known-good workbook |
| `extract_overrides.py` | Regenerates `config/overrides.json` from `data.m` |
| `config/overrides.json` | Per-UUID corrections (testing flags, locations, statuses) |
| `config/columns.json` | Exact output column order per sheet |
| `queries_m/*.m` | The original Power Query M source (reference) |
| `com.influeanswers.lebanon-pipeline.plist` | launchd job, runs every 2 min |
| `.secrets/lebanon2026.csprivatekey` | Form encryption private key (gitignored, only needed for the API path) |

## Setup (on Ralph's Mac)

1. `cd pipeline && pip3 install -r requirements.txt`
2. Make sure SurveyCTO Desktop is installed and synced
   (`/Users/ralphbaydoun/Desktop/SurveyCTO Exports/Lebanon 2026_WIDE.xlsx`
   exists and auto-sync is enabled in SurveyCTO Desktop settings).
3. Create `pipeline/.env`:
   ```
   WIDE_XLSX_PATH=/Users/ralphbaydoun/Desktop/SurveyCTO Exports/Lebanon 2026_WIDE.xlsx
   GOOGLE_SERVICE_ACCOUNT_JSON=/path/to/service-account.json
   DRIVE_FOLDER_ID=<same folder id the dashboard reads>
   ```
4. Test once by hand: `python3 run_pipeline.py`
5. Install the launchd job:
   ```
   cp com.influeanswers.lebanon-pipeline.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.influeanswers.lebanon-pipeline.plist
   ```
   Logs go to `pipeline/logs/`.

## Known intentional quirks (replicated from the M code)

- `FLAG_PercExp_AllMatch` always reports "not enough rated answers" — the
  M version has a shadowed-variable bug. The corrected logic is in
  `transforms.py` (`perc_exp_match_fixed`), switch when Moe fixes the M.
- Target_Tracker's `excluded_not_displaced` is always 0 — the M filters on
  `excluded because respondent is not displaced` but the data says
  `respondent is not displaced`.
- The `Dashboard` sheet's formulas are replaced with computed values each
  run (the dashboard server reads cached values, which would go stale).
- Manual notes typed below the Enumerator_Summary table are not preserved.
