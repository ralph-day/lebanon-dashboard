# Lebanon Survey Dashboard — Handoff / Context Summary

Drop this file (and the project folder) into a new chat so it can pick up
where this session left off.

## What this project is

A React + Express dashboard for monitoring an in-field survey campaign in
Lebanon ("Emergency Response Perception Study 2026"). It shows survey
progress, QA/data-quality stats per enumerator, payments, a live map, and
a security-alerts feed scraped from Telegram channels — with WhatsApp
notifications to the field team.

- **Repo**: `https://github.com/ralph-day/lebanon-dashboard.git`, branch `main`
- **Local path**: `/Users/ralphbaydoun/lebanon-dashboard`
- **Deployed on**: Railway, project `perpetual-warmth`, service
  `lebanon-dashboard`, production environment
- **Live URL**: `dashboard.influeanswers.com`
- **Deploy mechanism**: `git push origin main` → Railway auto-redeploys.
  **Nothing is live until it's committed AND pushed.**

## Architecture

- `server/index.js` — single Express server. Serves the built React app
  AND the API (`/api/data`, `/api/survey/:id`, `/api/payments/*`,
  `/api/security-alerts*`, `/api/tasks/*`, etc.)
- `server/enumeratorConfig.js` — hardcoded enumerator list: name, code
  (e.g. `AZ01`), phone number (with `ENUMERATOR_PHONES` env var override).
- `server/locationConfig.js` — location/area config.
- `client/src/` — React app (Vite + Tailwind v4). Key components:
  - `pages/Dashboard.jsx` — top-level tabs: Overview, Field Progress,
    Locations, Enumerators, Data Quality, Map, Security, Team
  - `components/OverviewPanel.jsx` — daily progress, accepted/rejected/QA-fail
    dropdowns, per-enumerator stats
  - `components/EnumeratorPanel.jsx` — per-enumerator detail page
    (`/enumerator/:code`), date-range filter, "All Surveys" modal
  - `components/AnomalyAlerts.jsx` — anomaly cards, click → navigate to
    enumerator detail
  - `components/QAPanel.jsx` — Data Quality tab
  - `components/PaymentsPanel.jsx` — Team/Payments tab (gated by `requireTeam`)
  - `components/SecurityAlertsPanel.jsx` — Security tab, Telegram-sourced
    alerts, active-alert banner
  - `components/SurveyDetailModal.jsx` — reusable Q/A detail modal, used
    everywhere a survey ID is clickable

## Data pipeline (IMPORTANT — current open issue)

1. Field survey submissions land in a source spreadsheet.
2. **Moe** maintains a separate local Excel workbook
   (`Lebanon 2026 - Analysis.xlsx`) that has formulas/links pulling from
   the source data.
3. That `.xlsx` is synced to a shared Google Drive folder
   (`Shared with... > Lebanon 2026 A...`) — presumably via the Google
   Drive desktop sync client on Moe's laptop.
4. The dashboard server (`server/index.js` ~line 253-270) uses the
   `googleapis` Drive API (`drive.files.list` /
   `drive.files.get(... alt: 'media')`) to download the newest `.xlsx`
   matching mimeType
   `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
   from `DRIVE_FOLDER_ID`, saves it as `tmp_data.xlsx`, and parses it
   with `exceljs` (`wb.xlsx.readFile`, ~line 362) on a periodic
   `refreshCache()`.

**Open problem**: When Moe closes his laptop, Excel stops recalculating
the linked formulas and Drive stops receiving updated file versions —
so the dashboard keeps re-fetching the same stale file (last seen
update was at 2:04 PM). This is **not a bug in the dashboard code** —
the dashboard's fetch/refresh logic works correctly; it's an upstream
workflow dependency on Moe's machine being on.

**Proposed fix (not yet implemented)**: Convert `Lebanon 2026 -
Analysis.xlsx` to a **native Google Sheet**, replace Moe's
cross-workbook Excel formulas with `IMPORTRANGE`/`QUERY` (which Google
recalculates server-side, no laptop needed). If this path is taken, the
dashboard's Drive query (line 256 area) needs to also match
`mimeType='application/vnd.google-apps.spreadsheet'` and use
`drive.files.export` (to xlsx) instead of `drive.files.get` for native
Sheets, since `files.get?alt=media` doesn't work on native Google Docs
formats.

**Next step**: decide whether to pursue the Google Sheets/IMPORTRANGE
migration, and if so, update the Drive-fetch code accordingly.

## Key server constants / config (server/index.js)

- `DRIVE_FOLDER_ID` — Railway env var, required.
- `ALLOWED_EMAILS` / `ALLOWED_DOMAIN` — controls who can **log in**
  (Google OAuth), via `isAllowed()` (~line 101-110).
- `TEAM_EMAILS` (~line 183-189) — separate hardcoded allowlist gating
  `requireTeam` (Payments/Tasks pages):
  ```
  infomgmtreportofficer@gmail.com
  ralphbaydoun@gmail.com
  ralph@influeanswers.com
  ahmad.zaazou91@gmail.com
  nisrinekhoory@gmail.com
  ```
- WhatsApp team-alert phone constants (~line 932-938):
  ```js
  RALPH_PHONE  = '96176979198'  // +961 76 979 198
  NISRINE_PHONE= '9613046612'   // +961 3 046 612
  MOE_PHONE    = '96176999503'  // +961 76 999 503
  ALAA_PHONE   = '9613480629'   // +961 3 480 629  (Alaa Abbas, field coordinator)
  AHMAD_PHONE  = '96170823546'  // +961 70 823 546 (Ahmad Zaazou, Jafra manager)
  TEAM_ALERT_PHONES = [RALPH, NISRINE, MOE, ALAA, AHMAD]
  ```
  All five get: accepted-submission notifications, anomaly/QA alerts,
  and security alerts (when in watched areas).
- `WHATSAPP_ALERT_AREAS` (~line 1547) — districts that trigger WhatsApp
  security alerts (Beirut, Chouf, Aley, Zahle, West Bekaa, Rashaya,
  Kesserwan, Jbeil, Lassa, + English equivalents). NOTE: "الجنوب"
  (the South generally) and "بنت جبيل" (Bint Jbeil) are intentionally
  NOT in this list — only specific surveyed districts trigger WhatsApp.
- `LEBANON_AREAS` (~line 1528) — full area list used to *detect* areas
  mentioned in Telegram posts (much broader than the alert list, includes
  South Lebanon villages for context/map display).
- `extractMentionedAreas()` — recently fixed (commit `1b347bc`) to avoid
  "بنت جبيل" substring-matching as "جبيل" (Jbeil/Byblos).
- `ALERT_ACTIVE_MS` — security alert "active" window, currently **30
  minutes** (was 2 hours, changed in commit `36e8521`).
- `sendWhatsApp()` (~line 843) — Meta Business API (`META_WA_TOKEN`,
  `META_WA_PHONE_ID` env vars). Free-text messages work to anyone who's
  messaged the business number within 24h ("session"). Template messages
  (`survey_enumerator_alert`, `survey_manager_alert`) require Meta
  template approval — **as of this session both templates are still
  "In review"** in WhatsApp Manager, so template-based alerts fail with
  error 132001 for anyone without an open session. Workaround: have
  recipients message the business WhatsApp number once
  (number tied to `META_WA_PHONE_ID = 1192634320595033`) to open a
  session.
- `qaStatus` (✅ PASS / ⚠️ REVIEW / ❌ FAIL) = automated QA classification.
  `status` (e.g. `SurveyStatus_New`) = manual accept/reject pipeline
  status. These are independent — a survey can be both "+1 accepted"
  AND "❌ FAIL" (accepted into the dataset, but flagged by automated QA
  for review).
- GPS duplicate detection: Haversine distance, `DUPLICATE_THRESHOLD_M = 15`,
  `duplicateIds` Set, surfaced as `tooClose` field on QA rows.

## Recent work this session (all pushed to `main`)

| Commit | Change |
|---|---|
| `44a0b62` | Survey detail modal, alert tuning, map highlight |
| `3f99523` | Accepted-surveys list shows survey ID, opens detail |
| `a204e49` | Added Alaa Abbas to WhatsApp alerts; notify on every accepted submission (with first-run seeding to avoid flooding) |
| `f0ee01c` | Flag too-close/missing-GPS in accepted-submission WhatsApp message |
| `a135c6d` | Fixed Nisrine's WhatsApp number (digit-count bug) |
| `f0fba9a` | Fixed EnumeratorPanel Pass/Review/Fail to use automated `qaStatus` (was using manual `status`) |
| `301b742` | Anomaly cards & QA-fail badges navigate to enumerator detail / survey modal |
| `d04b468` | "Total Surveys" stat opens modal listing all surveys, each clickable |
| `ba23e3f` | Date-range filter (Today/Yesterday/7d/30d/All) on enumerator detail |
| `76bac7f` | Error banner on Payments page when a save fails (e.g. 403) |
| `21cd922` | Added Ahmad Zaazou to `TEAM_ALERT_PHONES` + manager broadcasts |
| `1b347bc` | Fixed false-positive "Jbeil" area match from "Bint Jbeil" text |
| `b6c43ab` | Renamed "evacuation alert" banner → "security alert" |
| `36e8521` | Removed countdown timer from security alert cards, active state now pink (was red), active window 30min (was 2h) |

## Open / unresolved items

1. **Moe's laptop dependency** (see Data pipeline section above) — needs
   a decision on the Google Sheets/IMPORTRANGE migration approach, then
   code changes to `server/index.js` Drive-fetch logic.
2. **Nisrine payments-edit permission** — `TEAM_EMAILS` includes
   `nisrinekhoory@gmail.com`; an error banner was added (`76bac7f`) so
   any future failure (e.g. email mismatch) will now show a visible
   error instead of failing silently. Not fully confirmed resolved —
   if it recurs, check what email shows in her dashboard top-right vs.
   `TEAM_EMAILS`.
3. **WhatsApp template approval** — `survey_enumerator_alert` and
   `survey_manager_alert` were still "In review" in Meta's WhatsApp
   Manager. Once approved, template-based alerts (to enumerators/managers
   without an open chat session) will start working without any code
   change. Until then, recipients should message the business WhatsApp
   number once to open a 24h session.

## Useful facts for the assistant

- User (Ralph) gets frustrated by **assumptions about names/identities**
  — always verify (grep/read source) rather than pattern-match similar
  names (e.g. "Ahmad Zaabouty" enumerator vs. "Ahmad Zaazou" manager are
  different people).
- Always commit + push to `main` for changes to take effect (Railway
  auto-deploys on push).
- This is not a git repo at the `/Users/ralphbaydoun` root — the dashboard
  project itself (`/Users/ralphbaydoun/lebanon-dashboard`) IS a git repo.
