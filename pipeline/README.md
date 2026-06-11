# Lebanon 2026 Pipeline

Python replacement for the Excel + VBS refresh loop (see `NEW SETUP.docx`).
Rebuilds all 9 Power Query outputs from the SurveyCTO export + the GTS
Google Sheet and updates the output workbook in the shared Drive folder —
no Excel, no laptop, no lock files.

## Architecture decision (2026-06-11)

`lebanon_2026` is an **encrypted SurveyCTO form** — group-level fields come
back blank from the plain `forms/data/wide/json` API because SurveyCTO only
decrypts them client-side, using the form's RSA private key
(`.secrets/lebanon2026.csprivatekey`, gitignored, NOT committed).

Plan: run this pipeline as a **Railway worker service** (cron-scheduled,
every 5 min) in this same project, alongside the dashboard. Each run:

1. Pull raw (encrypted) submissions via the SurveyCTO API
   (`/api/v2/forms/data/wide/json/lebanon_2026`).
2. Decrypt the per-submission AES keys with the RSA private key, then
   decrypt the encrypted field values — following SurveyCTO's documented
   field-encryption scheme (RSA-wrapped AES-256-CBC per submission). This
   replaces the "SurveyCTO Desktop does it for you" step.
3. Feed the decrypted wide dataframe into `transforms.run_all()` (already
   ported, see below).
4. Read the GTS Google Sheet + write the output workbook back to Drive
   (already implemented in `run_pipeline.py`).

### Status

- [x] `transforms.py` — all 9 query transforms ported from M code
- [x] `run_pipeline.py` — Drive read/write, GTS sheet read, workbook rebuild
- [x] SurveyCTO API auth confirmed working (server `gts`, form `lebanon_2026`)
- [ ] **Decryption step** — not yet implemented. This is the main remaining
      blocker. Needs a `decrypt.py` module implementing SurveyCTO's
      field-encryption spec (see SurveyCTO support article "Decrypting
      encrypted form data" for the algorithm: each submission has an
      RSA-2048-encrypted AES-256 key in its `*.key.enc` companion field;
      use it to AES-decrypt the field values).
- [ ] Railway worker service + cron schedule
- [ ] Validate output against current `Lebanon 2026 - Analysis.xlsx`

## Files

| File | Purpose |
|---|---|
| `run_pipeline.py` | Entry point — reads SurveyCTO + GTS, writes output workbook to Drive |
| `transforms.py` | The 9 query transformations, ported from the M code |
| `validate.py` | Diffs pipeline output against a known-good workbook |
| `extract_overrides.py` | Regenerates `config/overrides.json` from `data.m` |
| `config/overrides.json` | Per-UUID corrections (testing flags, locations, statuses) |
| `config/columns.json` | Exact output column order per sheet |
| `queries_m/*.m` | The original Power Query M source (reference) |
| `.secrets/lebanon2026.csprivatekey` | Form encryption private key (gitignored) |

## Environment

```
SURVEYCTO_SERVER=gts
SURVEYCTO_FORM_ID=lebanon_2026
SURVEYCTO_USER=infomgmtreportofficer@gmail.com
SURVEYCTO_PASSWORD=<password>
SURVEYCTO_PRIVATE_KEY_PATH=pipeline/.secrets/lebanon2026.csprivatekey
GOOGLE_SERVICE_ACCOUNT_JSON=<path to service-account key with Drive write access>
DRIVE_FOLDER_ID=<same folder id the dashboard reads>
```

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
