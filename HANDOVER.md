# Lebanon Survey Dashboard — Full Handover (Phase 1 → Phase 2)

> Living master document. Drop this into a new chat (with the repo) to resume with full context.
> Supersedes the older `HANDOFF.md`. Last updated: **2026-07-01**.

---

## 0. TL;DR

A React + Express dashboard for running a field survey in Lebanon — the **Emergency
Response Perception Study 2026** (AAP study; client **Ground Truth Solutions (GTS)**,
fielded by **Jafra / InflueAnswers**). It covers the whole operation: live field
progress, per-enumerator QA, payments, a live map, a Telegram-scraped security feed,
WhatsApp notifications to the field team — and, as of Phase 1's finale, a full
**AI Analysis + Report** suite (results explorer, qualitative theming, "Ask the data",
an interactive report builder with PDF/Word/NotebookLM export).

- **Repo**: `https://github.com/ralph-day/lebanon-dashboard.git`, branch `main`
- **Local**: `/Users/ralphbaydoun/lebanon-dashboard`
- **Deploy**: Railway (project `perpetual-warmth`, service `lebanon-dashboard`). `git push origin main` → auto-redeploy (~2 min). **Nothing is live until committed AND pushed.**
- **Live URL**: `dashboard.influeanswers.com`
- **Stack**: Node 20 · Express 5 · React 19 · Vite 8 · Tailwind v4 · Recharts 3 · Leaflet · exceljs · googleapis · @anthropic-ai/sdk · telegram (gramJS)

---

## 1. Project skeleton

```
lebanon-dashboard/
├── package.json                 # root: build (installs server+client, builds client), start (node server), dev (./dev.sh)
├── .node-version                # 20.x
├── dev.sh / start-dev.sh / start-vite-only.sh   # local dev launchers (DEV_AUTH_BYPASS)
├── HANDOVER.md                  # ← this file
├── HANDOFF.md / DEPLOY.md / README.md            # older docs (HANDOVER supersedes HANDOFF)
│
├── server/                      # Express API + serves built client
│   ├── index.js                 # ★ the whole backend (~2900 lines): auth, data pipeline, API, AI, WhatsApp, Telegram, cron
│   ├── analysisConfig.js        # indicator registry for the Analysis feature (DIMENSIONS/SINGLE/LIKERT/MULTI/TRUST/GAP/QUALITATIVE/OPEN_TEXT)
│   ├── enumeratorConfig.js      # ENUMERATOR_ASSIGNMENTS: {code, name, phone, entity, governorate, district, locations[]}
│   ├── locationConfig.js        # location/area metadata + GPS centroids
│   ├── telegram-auth.js         # one-off helper to mint the gramJS StringSession
│   ├── dev-mock.js              # mock data for local dev without Drive
│   ├── .env / .env.example / .env.production.example
│   └── package.json
│
├── client/                      # React app (Vite + Tailwind v4)
│   ├── index.html · vite.config.js · eslint.config.js
│   └── src/
│       ├── main.jsx · App.jsx · index.css
│       ├── lib/time.js          # Beirut timezone formatting helpers
│       ├── pages/
│       │   ├── Dashboard.jsx     # ★ top-level tabs + routing + access gating
│       │   ├── EnumeratorProfile.jsx   # /enumerator/:code
│       │   └── Login.jsx
│       └── components/
│           ├── AnalysisPanel.jsx       # ★ Analysis tab (charts, disaggregation, qualitative, theme cloud, Ask-the-data, map). Exports shared chart primitives.
│           ├── ReportBuilder.jsx       # ★ Report tab (block doc, drag-reorder, AI drafting, PDF/Word/NotebookLM export)
│           ├── NotesBubble.jsx         # per-entity team notes popover (fixed-position, viewport-clamped)
│           ├── OverviewPanel · QAPanel · EnumeratorPanel · EnumeratorProgress
│           ├── LocationPanel · MapPanel · LebanonMap · MiniMap
│           ├── PaymentsPanel · TaskBoard · AnomalyAlerts · SecurityAlertsPanel
│           └── SurveyDetailModal
│
└── pipeline/                    # data + local artifacts (GITIGNORED — never commit)
    ├── .env
    ├── .secrets/service-account.json   # Google Drive service account (LOCAL ONLY, gitignored)
    ├── data/                    # source workbook, export PDF, per-survey media CSVs
    └── logs/
```

**The two files that matter most: `server/index.js` (backend, everything) and
`client/src/components/AnalysisPanel.jsx` (the analysis brain + shared chart primitives
that ReportBuilder imports).**

---

## 2. Full data model / schema

### 2.1 Source of truth — the Google Drive workbook

A single `.xlsx` is fetched from a Drive folder (`DRIVE_FOLDER_ID`), matched by name
(`WORKBOOK_NAME_MATCH`, default `"Analysis"`). `parseExcel()` reads these sheets:

| Sheet | Role |
|---|---|
| `data` | Raw per-survey answers (one row per submission; every question column) |
| `Survey Comparison` | **GTS verdict — the client's source of truth.** `GTS_Match_Comment` = `Accepted` / `Rejected - …` / `Not Available in GTS Data`; `GTS_loc_4` = corrected location |
| `QA_Dashboard` | Per-survey QA pass/review/fail + submission timing |
| `QA_ByGroupSection` | Section-level timing per survey |
| `Query_All_Rules` | QA rule definitions |
| `Enumerator_Summary` | Per-enumerator rollups |
| `Target_Tracker` | Per-location targets vs. achieved |

Key identifiers: **`instanceID`** (unique per submission) and **`NameCode`**
(`"Enumerator Name (CODE)"`, parsed by regex `/^(.*?)\s*\(([^)]+)\)\s*$/`).

**Accept/reject rule:** a survey counts as accepted iff
`gtsMatchByInstance[instanceID]` starts with `"Accepted"`. GTS lags collection by days,
so operational views (map colour, daily counts, WhatsApp triggers) use the **immediate
QA verdict** (`qaStatus === '✅ PASS'`), while **Analysis uses the GTS verdict**.

### 2.2 In-memory cache (`cache.data`, rebuilt by `refreshCache()`)

`parseExcel()` returns:
```
{
  overview, locations, enumerators, assignments, activeEnumerators, anomalies,
  qa: { rows, pass, review, fail, rejected },
  sectionTimings, natTotals, genderTotals, gpsPoints,
  // private, stripped before /api/data is served:
  rawByInstance, sectionTimingByInstance, gtsMatchByInstance,
}
```
`/api/data` serves `publicData` = everything **except** `rawByInstance`,
`sectionTimingByInstance`, `gtsMatchByInstance` (those stay server-side; the raw sheet
never reaches the browser). `CACHE_TTL_MS` guards staleness; `/api/refresh` forces a rebuild.

### 2.3 Analysis projection (`/api/analysis`)

Projects accepted rows into a compact, **PII-free** dataset the browser cross-tabs:
```
{ n, dimensions:[{key,label}], meta:{ single, likert, multi, trust, gap, qualitative },
  respondents:[ { d:{…dimension tags…}, v:{…indicator values…} } ] }
```
`d` = disaggregation tags (nationality, gender, displacement, governorate, district,
ageGroup — see `analysisConfig.DIMENSIONS`). `v` = resolved indicator values (single
labels, likert 1–5, multi 0/1 members, trust per-actor, gap perception/expect pairs).
No names, no phones, no GPS, no free text in this payload.

### 2.4 `server/analysisConfig.js` — the indicator registry (the analysis schema)

- **DIMENSIONS** — 6 disaggregation axes.
- **SINGLE** — single-choice categoricals (nationality, living situation, registration, …).
- **LIKERT** — 1–5 scales (coping, in-control, community relations, needs covered).
- **MULTI** — multi-select (member `${key}_${suffix}` 0/1 columns discovered at runtime).
- **TRUST_ACTORS** — 9 actors trust-mean comparison.
- **GAP_DIMS** — 9 paired `perception_*` / `expect_*` accountability dims (flagship
  "expectation gap"). NB questionnaire misspells `transparency` as `transparenvy` — keep it.
- **QUALITATIVE** — 7 narrative open-text fields (sent for AI theming + theme cloud).
- **OPEN_TEXT** — 29 browsable free-text fields (superset; "show full data" viewer only).
- Non-response: `98`/`99`/blank excluded from denominators everywhere.

### 2.5 Persisted state (JSON on the Railway volume, `DATA_DIR`, via `atomicWrite`)

| File | Contents |
|---|---|
| `analysis_report.json` | The one living report doc `{ blocks:[…] }` |
| `notes.json` | Team notes `{id, entityType, entityId, entityLabel, text, author, createdAt}` |
| `tasks.json` | Task board items |
| `payments.json` | Payment coordination records |
| `qa_approvals.json` | Manual QA approve/unapprove overrides |
| `notifications.json` | Sent-WhatsApp ledger (dedupe) |
| `security_alerts.json` / `security_history.json` | Active + historical security alerts |
| `location_meta.json` | Editable per-location metadata |

### 2.6 Report document shape (`analysis_report.json`)

```
{ blocks: [
  { id, type:'heading'|'text'|'chart'|'map', role?, title?, text?,        // text/heading
    qKey?, kind?, viz?, breakdown?, summary?, comment? }                  // chart/map
] }
```
Chart `qKey` scheme (shared Analysis↔Report): `gap`, `trust`, `single:<key>`,
`multi:<key>`, `likert:<key>`. `kind` ∈ `gap|mean|pct`. Blocks reorder via native
HTML5 drag-and-drop; the whole doc auto-saves server-side on every edit.

---

## 3. API surface (all under one Express app)

**Auth**: `GET /auth/login`, `GET /auth/callback`, `GET /auth/me`, `POST /auth/logout`
(Google OAuth; forces account chooser).

**Core data**: `GET /api/data`, `GET /api/survey/:id`, `POST /api/refresh`,
`GET /api/location-meta`.

**QA**: `POST /api/qa/approve`, `POST /api/qa/unapprove`.

**Notes / Tasks / Payments**: `GET|POST /api/notes`, `DELETE /api/notes/:id`,
`GET|POST /api/tasks`, `DELETE /api/tasks/:id`, `POST /api/tasks/parse-email`,
`GET /api/payments`, `POST /api/payments/coordination`,
`DELETE /api/payments/coordination/:id`, `POST /api/payments/save`.

**Security**: `GET /api/security-alerts/active`, `/history`, `POST /…/backfill`.

**WhatsApp**: `GET|POST /api/whatsapp/webhook`, `POST /api/notify/test`.

**Analysis + Report** (all gated by `requireAnalyst`):
`GET /api/analysis`, `GET /api/analysis/responses` (per-respondent full data by
`field` or `qKey`), `POST /api/analysis/qualitative` (thematic analysis),
`POST /api/analysis/wordcloud` (English theme cloud), `GET /api/analysis/prompts`
(technique presets), `POST /api/analysis/summarize` (per-chart AI summary; accepts
`feedback` for analyst-steered regeneration), `POST /api/analysis/ask` (free-text
question → best indicator + chart plan), `GET|PUT /api/analysis/report`,
`POST /api/analysis/report/blocks`, `/exec-summary`, `/section`.

---

## 4. Auth & access control

- **Google OAuth** (`GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`). Session cookie via
  `express-session` (`SESSION_SECRET`).
- **`isAllowed(email)`** gate: `ALLOWED_DOMAIN` and/or explicit `ALLOWED_EMAILS`.
- Middleware tiers: **`requireAuth`** (any logged-in allowed user) →
  **`requireTeam`** (payments/team, `requireTeam`) → **`requireAnalyst`**
  (`ANALYST_EMAILS`, default `ralph@influeanswers.com`; gates all Analysis + Report) →
  **`requireQAApprover`** (`QA_APPROVER_EMAILS`).
- Client mirrors this: `Dashboard.jsx` shows Analysis/Report tabs only when the user's
  email is in `ANALYST_ALLOWED_EMAILS` (currently `ralph@influeanswers.com`).
- **Local dev bypass**: double-guarded `DEV_AUTH_BYPASS` (only when `NODE_ENV!=production`
  AND `DEV_AUTH_BYPASS=1`), used by `dev.sh`.

---

## 5. Integrations & background jobs

- **Google Drive** — service account (`GOOGLE_SERVICE_ACCOUNT_JSON` env in prod; local
  `pipeline/.secrets/service-account.json`). Fetches the newest name-matched workbook.
- **WhatsApp (Meta Cloud API)** — `META_WA_TOKEN`, `META_WA_PHONE_ID`. Sends templated
  messages on QA pass + accepted-survey notifications. Template params are sanitized
  (no newlines — fixes error #132018). Manager phones via `*_PHONE` env vars.
- **Telegram security monitor** — gramJS `TelegramClient` + `StringSession`
  (`TELEGRAM_API_ID/HASH/SESSION`). **This is a BotFather bot** (`InflueAnswers_bot`),
  not a user account — the session was minted from the bot token via
  `client.start({botAuthToken})`. Polls public channels for conflict keywords → security alerts.
- **Anthropic Claude** — `@anthropic-ai/sdk`, model `claude-opus-4-8`, adaptive thinking,
  streaming, `output_config` json_schema for structured tasks. `maxRetries:4`,
  in-memory content-hash caches (`summaryCache`, `qualCache`, `wordcloudCache`).
- **Cron** — `*/3 * * * *` (every 3 min): refresh cache, run QA/anomaly notifications,
  check security news.

---

## 6. AI Analysis + Report suite (Phase 1 finale)

- **Results explorer** — every indicator charted, disaggregable by any of 6 dimensions,
  viz options (bar/column/pie/table), per-chart AI summary, CSV/print export.
- **Multi-angle summaries** — each chart summarized across overall + every disaggregation
  (`makeProfile()`), framed by a fixed study objective; 3 prompt-technique presets
  (rigorous/executive/narrative) + custom, shared Analysis↔Report via localStorage.
- **Analyst feedback loop** — "✎ Refine with feedback" regenerates a summary steering on
  the analyst's note (server `feedback` field, cached separately).
- **Ask the data** — free-text research question → Claude maps it to the best indicator
  (+breakdown+chart type, constrained to a fixed qKey enum so it can't hallucinate) →
  client charts it → grounded written answer → pushable to the report.
- **Qualitative** — thematic analysis of 7 narrative fields (themes, sentiment, verbatim
  quotes with translation) + an **English theme cloud** (deterministic term frequencies
  feed Claude as a hint; output is weighted English *themes*, not word-for-word).
- **Report builder** — block document (heading/text/chart/map), drag-reorder, AI drafting
  (intro/methodology/exec-summary/section), auto exec-summary, PDF (print) / Word (docx) /
  NotebookLM (Markdown handoff) export. Auto-saves server-side.
- **Analyze all / Push all** — bulk summarize + bulk push to report (4-way concurrency).

---

## 7. Data privacy posture (client-defensible)

- **No names collected** — survey ID numbers only. Client is disclosed to respondents at
  the start of each interview (consent confirmed).
- **Charts / Ask-the-data / summaries** send **aggregates only**. **Qualitative + theme
  cloud** send verbatims, now passed through **`scrubText()`** (strips phone-shaped digit
  runs, emails, links) before leaving the server.
- **Human always in the loop** (AI drafts; analyst edits before use). **Purpose-limited**;
  caches are in-memory keyed by content hash, not a data lake.
- **Contract basis** (verified 2026-07-01): Anthropic's **DPA (with SCCs)** is auto-incorporated
  into the Commercial Terms — already in force, view/download at
  `anthropic.com/legal/data-processing-addendum` (no Console setting for it).
  **No-training clause** is in the **Commercial Terms §B**: *"Anthropic may not train
  models on Customer Content from Services"* (Customer Content = Inputs + Outputs; "may
  not" = prohibition). Reinforced by **DPA §B.2–B.3** (process only per documented
  instructions; no use beyond specified purposes; no combining data).
- **Open action**: ZDR (Zero Data Retention) is Enterprise-only, request via
  `privacy@anthropic.com` — nice-to-have, not a blocker. Download + file both PDFs; route
  past whoever owns data protection at GTS. See memory `lebanon-dashboard-ai-privacy`.
- A user-facing **disclaimer on the Analysis + Report pages was requested and is the next
  UI task** (see §10).

---

## 8. Environment variables (Railway prod)

```
# Auth / session
GOOGLE_CLIENT_ID  GOOGLE_CLIENT_SECRET  GOOGLE_REDIRECT_URI
SESSION_SECRET  ALLOWED_DOMAIN  ALLOWED_EMAILS  CLIENT_URL
ANALYST_EMAILS  QA_APPROVER_EMAILS
# Data source
GOOGLE_SERVICE_ACCOUNT_JSON  DRIVE_FOLDER_ID  WORKBOOK_NAME_MATCH  DATA_DIR
# AI
ANTHROPIC_API_KEY
# WhatsApp
META_WA_TOKEN  META_WA_PHONE_ID  WHATSAPP_WEBHOOK_VERIFY_TOKEN
SURVEY_ACCEPTED_TEMPLATE  SURVEY_ACCEPTED_TEMPLATE_LANG  SURVEY_ALERT_MAX_AGE_HOURS
# Telegram (bot session)
TELEGRAM_API_ID  TELEGRAM_API_HASH  TELEGRAM_SESSION
# Manager phones
RALPH_PHONE  MOE_PHONE  AHMAD_PHONE  ALAA_PHONE  NISRINE_PHONE  TONI_PHONE
# Runtime
NODE_ENV  PORT  DEV_AUTH_BYPASS (local only)
```

---

## 9. Ops, gotchas & conventions

- **Deploy = commit + push to `main`.** Railway redeploys in ~2 min. Nothing is live otherwise.
- **Never commit `pipeline/`** — it holds the gitignored Drive service-account key and
  source data. Never `git add pipeline/`.
- **Timezone**: `toISO()` handles Excel serial dates → naive Beirut wall-clock strings
  (no `Z`), else `fmtBeirutText` adds +3h. Don't reintroduce `.toISOString()` on serials.
- **AI caches are keyed by `field::fetchedAt`** — summaries generated before a code change
  keep returning the old shape until the next data refresh. Bump a cache version if a
  changed output shape must show immediately.
- **npm registry + Google Drive are often blocked in the sandbox** → local preview
  frequently unusable; rely on `npm run build` verification + Railway for live render.
- **Verify, don't assume identities** (memory `ralph-verify-names`) and **the Telegram
  monitor is a bot, not a user account** (memory `telegram-bot-setup`) — two lessons learned.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## 10. Phase 1 — milestone status

**Done:** full ops dashboard (overview/progress/locations/enumerators/QA/map/security/
team/payments) · WhatsApp + Telegram integrations · timezone + template bugfixes ·
mobile-responsive · **complete AI Analysis suite** (explorer, disaggregation, multi-angle
summaries, prompt techniques, analyst feedback, Ask-the-data, qualitative theming, theme
cloud, geographic map) · **interactive Report builder** (blocks, drag-reorder, AI drafting,
auto exec-summary, PDF/Word/NotebookLM export) · privacy scrub + documented DPA posture.

**Open threads carried into Phase 2:**
1. **Privacy disclaimer on the Analysis + Report pages** — requested, not yet built
   (draft text ready in §7; make it print-friendly so it lands in exported reports).
2. **ZDR request** to Anthropic (Enterprise-gated; optional).
3. **AI cache-version bump** if changed output shapes must appear before a data refresh.
4. Data-staleness watch on Moe's-laptop upload (see memory `lebanon-dashboard`).

---

## 11. Phase 2 — launch pad (to be defined)

Starting point for the next phase — fill in with Ralph's goals. Candidate directions
already implied by Phase 1: automated/scheduled report generation, cross-question
correlation analysis, longitudinal/wave comparison, client-facing (GTS) read-only report
sharing, deeper geographic analytics, and the pending privacy-disclaimer + DPA paperwork.

> **Next step agreed with Ralph:** finish this handover, then kick off Phase 2.
