# Lebanon Emergency Response Perception Study — Operations Dashboard

**Live URL:** https://dashboard.influeanswers.com  
**Hosted on:** Railway (server + static client build served together)  
**Repository:** github.com/ralph-day/lebanon-dashboard

---

## 1. What This Is

A real-time field operations dashboard for the **Lebanon Emergency Response Perception Study 2026**, run by **Influeanswers** in partnership with **Jafra** and overseen by **Ground Truth Solutions**.

The study collects ~1,000+ surveys across 40+ locations in Lebanon (Beirut, Mount Lebanon, North, South, Bekaa) via mobile enumerators using SurveyCTO. This dashboard gives the project team a live view of:

- How many surveys have been collected vs. target, per location and per enumerator
- Real-time data quality flags (too fast, missing GPS, straightlining, suspicious patterns)
- Which enumerators are active in the last 4 hours and their individual performance
- Task management for the project team
- Payment tracking for enumerators and coordination staff
- AI-powered conversion of client emails into actionable tasks

**Who uses it:**
| Person | Role | Access Level |
|--------|------|-------------|
| Ralph Baydoun | Project Manager / Developer | Full admin |
| Nisrine Khoory | Field Coordinator | Full access (team + QA) |
| Moe Issa (infomgmtreportofficer@gmail.com) | Info Management / QA Approver | QA approval + full access |
| Ahmad Zaazou | Field Staff | Team access |

---

## 2. How Data Flows

```
SurveyCTO (mobile app)
        ↓  (syncs automatically)
Google Drive Folder
        ↓  (every 15 minutes OR manual refresh)
Node.js Server (/api/refresh)
        ↓  (parses Excel via ExcelJS)
In-memory cache
        ↓  (served to browser)
React Dashboard
```

### The Excel File

The server reads a single `.xlsx` file from a Google Drive folder (`DRIVE_FOLDER_ID`). It always picks the **most recently modified** file in the folder. The file contains these sheets:

| Sheet | Purpose |
|-------|---------|
| `Dashboard` | Top-level overview numbers (total target, remaining, completed today) |
| `Target_Tracker` | Per-location completion stats |
| `Enumerator_Summary` | Per-enumerator totals, durations, quality % |
| `QA_Dashboard` | One row per survey submission with QA flags |
| `QA_ByGroupSection` | Per-enumerator per-section timing averages |
| `Query_All_Rules` | Suspicion scores (straightlining, extreme answers) |
| `data` | Raw submission data (SurveyStatus_New, location codes) |

The Excel is read with **ExcelJS** (async). All cell values are normalized through a `resolveCellValue()` helper that unwraps formula results, rich text, and Date objects. Dates are converted to ISO strings via `toISO()`.

---

## 3. Architecture

### Directory Structure

```
lebanon-dashboard/
├── server/                     # Node.js / Express backend
│   ├── index.js                # Main server — all routes, auth, data parsing
│   ├── enumeratorConfig.js     # Enumerator assignments, targets, deadlines, phone numbers
│   ├── locationConfig.js       # Location code → name/region/district/lat-lng mapping
│   ├── dev-mock.js             # (Dev only) mock data server, not used in production
│   ├── qa_approvals.json       # Persisted QA override approvals (auto-created)
│   ├── notes.json              # Persisted inline notes (auto-created)
│   ├── tasks.json              # Persisted task board tasks (auto-created)
│   ├── payments.json           # Persisted payment records (auto-created)
│   ├── .env                    # Local environment variables (never commit)
│   └── package.json
│
├── client/                     # React 18 + Vite frontend
│   ├── src/
│   │   ├── App.jsx             # Root: auth check, routing
│   │   ├── pages/
│   │   │   ├── Login.jsx       # Google OAuth login page
│   │   │   ├── Dashboard.jsx   # Main dashboard shell + tab routing
│   │   │   └── EnumeratorProfile.jsx  # Public enumerator profile page
│   │   └── components/
│   │       ├── OverviewPanel.jsx       # Overview tab
│   │       ├── LocationPanel.jsx       # Locations tab with map
│   │       ├── EnumeratorProgress.jsx  # Field Progress tab
│   │       ├── EnumeratorPanel.jsx     # Enumerators tab + detail subpage
│   │       ├── QAPanel.jsx             # Data Quality tab
│   │       ├── AnomalyAlerts.jsx       # Real-time anomaly alerts widget
│   │       ├── TaskBoard.jsx           # Team → Task Board tab
│   │       ├── PaymentsPanel.jsx       # Team → Payments tab
│   │       ├── LebanonMap.jsx          # Leaflet map component
│   │       └── NotesBubble.jsx         # Inline notes widget (used everywhere)
│   └── package.json
│
└── package.json                # Root — scripts to run both server + client
```

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 18 + Vite | Fast dev builds, component-based |
| Styling | TailwindCSS v4 | Utility-first, no separate CSS files |
| Charts | Recharts | Bar/line charts, minimal config |
| Maps | React-Leaflet + OpenStreetMap | Free, no API key needed |
| Backend | Node.js + Express 5 | Simple REST API |
| Auth | Google OAuth 2.0 + express-session | Single sign-on, no passwords |
| Excel parsing | ExcelJS | Handles complex cells (formulas, rich text, dates) |
| AI features | Anthropic Claude API (claude-3-5-sonnet) | Email → tasks conversion |
| Rate limiting | express-rate-limit | Prevents API abuse |
| Deployment | Railway | Single service, automatic deploys from GitHub |

---

## 4. Authentication

### How Login Works

1. User visits the dashboard → sees Google "Sign in" button
2. Browser navigates to `/auth/login`
3. Server generates a random **CSRF state token**, stores it in the session, redirects to Google OAuth
4. User approves → Google redirects to `/auth/callback?code=...&state=...`
5. Server validates the state token (CSRF check), exchanges code for tokens, fetches user profile
6. Server checks email against `ALLOWED_EMAILS` / `ALLOWED_DOMAIN`
7. If allowed: stores `{ email, name, picture }` in `req.session.user`, redirects to dashboard

### Access Control

Set in Railway environment variables:
- `ALLOWED_EMAILS` — comma-separated list of individual emails that can log in
- `ALLOWED_DOMAIN` — allow any email at this domain (e.g. `influeanswers.com`)

Additional role: **QA Approver** — set via `QA_APPROVER_EMAILS` env var. Only these users can approve/reject flagged surveys server-side.

### Session

- `express-session` with **MemoryStore** (in-memory — sessions are lost on server restart/redeploy)
- Session cookie: `httpOnly`, `sameSite: lax`, `secure` in production
- `app.set('trust proxy', 1)` — required because Railway terminates SSL at its reverse proxy
- 24-hour session lifetime
- **Important:** every Railway deploy clears all sessions. Users must sign in again after a deploy.

---

## 5. API Endpoints

All `/api/*` routes require authentication (`requireAuth` middleware). All state-mutating routes check `res.ok` on the client before updating UI state.

### Data

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/data` | Returns full parsed dashboard data. Uses 15-min cache; refreshes from Drive on cache miss |
| POST | `/api/refresh` | Force-refresh from Google Drive (rate limited: 6/min per user) |

### Auth

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/auth/login` | Initiates Google OAuth flow |
| GET | `/auth/callback` | OAuth redirect handler — validates state, sets session |
| GET | `/auth/me` | Returns `{ email, name, picture }` if logged in, 401 otherwise |
| POST | `/auth/logout` | Destroys session + clears cookie |

### Notes (inline annotations)

Notes can be attached to any entity (location, enumerator, survey). They persist to `notes.json`.

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/notes` | All notes |
| POST | `/api/notes` | Create note — body: `{ entityType, entityId, entityLabel, text }` |
| DELETE | `/api/notes/:id` | Delete — only author or QA approver |

### Tasks

Tasks persist to `tasks.json`. Valid types: `data_quality`, `field_ops`, `enumerator`, `coordination`, `payment`, `reporting`, `training`, `technical`, `general`. Valid statuses: `todo`, `inprogress`, `done`.

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/tasks` | All tasks |
| POST | `/api/tasks` | Create task — body: `{ title, description, type, assignee, priority, dueDate, linkedEntity }` |
| PATCH | `/api/tasks/:id` | Update any field (field allowlist enforced) |
| DELETE | `/api/tasks/:id` | Delete — only creator (by email) or QA approver |

### Email → Tasks (AI)

Requires `ANTHROPIC_API_KEY` env var and sufficient Anthropic API credits.

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/tasks/parse-email` | Body: `{ emailText }` (max 8000 chars). Returns `{ tasks: [...] }` — array of task objects to preview before creating |

The Claude prompt uses **system/user role separation** to prevent prompt injection: the email content goes in the user role, the extraction instructions stay in the system role.

### QA Approvals

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/qa/approve` | Body: `{ id }` — marks survey as approved override. QA approver only |
| POST | `/api/qa/unapprove` | Body: `{ id }` — removes approval. QA approver only |

Approvals persist to `qa_approvals.json` and survive server restarts.

### Payments

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/payments` | All payment records |
| PATCH | `/api/payments/enumerator/:code` | Update enumerator payment — body: `{ ratePerSurvey, amountPaid, notes, statusOverride }` |
| POST | `/api/payments/coordination` | Create coordination payment — body: `{ name, role, amount, period, notes }` |
| PATCH | `/api/payments/coordination/:id` | Update — body: `{ amountPaid, status, notes }` |
| DELETE | `/api/payments/coordination/:id` | Delete — QA approver only |

---

## 6. Dashboard Tabs

### Overview
- High-level stats: total collected, target, remaining, completed today (orange badge)
- Nationality breakdown (Palestinian / Lebanese / Syrian)
- Gender breakdown
- **Anomaly Alerts** — active enumerators with QA flags in the last 4 hours. Shows critical (red) vs. warning (yellow) issues with WhatsApp contact button
- Inline notes

### Field Progress
- Progress bars per enumerator vs. their assigned targets
- Deadline countdown per location
- Today's accepted/rejected count per enumerator

### Locations
- Table of all locations: target, completed, accepted, remaining, % complete, status
- Grouped by region/district
- Rejected survey count
- Interactive Leaflet map with colour-coded markers (green = on target, yellow = behind, red = critical)
- Inline notes per location

### Enumerators
- Bar chart: surveys per enumerator
- Performance table: surveys, avg/min/max duration, missing GPS, last submission
- WhatsApp contact button per row
- **Click any row** → Enumerator detail subpage:
  - Stat cards: total surveys, avg duration, missing GPS, quality %
  - Assignment progress bars with deadlines
  - Survey quality breakdown (all surveys: pass/review/fail)
  - Recent 15 survey durations bar chart (orange = flagged too fast)
  - Section timing cards vs. minimum thresholds
- Section timing heatmap (all enumerators vs. minimums)

### Data Quality
- QA flags table: each row is one survey submission
- Columns: enumerator, status, location, QA status, duration, flags (too fast, too slow, app left open, missing GPS, below range)
- Filter by status / enumerator
- QA approvers can click to approve (override) flagged surveys
- Approval persists across server restarts

### Team → Task Board
- Kanban-style board: Todo / In Progress / Done columns
- Create tasks with: title, description, type, assignee, priority, due date, linked entity
- Filter tasks by type (chips shown dynamically based on existing task types)
- Task cards show description always-visible (bullet points for lines starting with `-`)
- **📧 Import from Email** — paste a client/supervisor email → Claude extracts all action items as tasks → preview with checkboxes → bulk create

### Team → Payments
- **Enumerator Payments**: auto-calculates owed (surveys × rate/survey), tracks paid, shows balance and status (Pending / Partial / Paid)
- **Coordination Payments**: track fixed payments for coordination staff
- Summary cards: total owed, paid, outstanding across all categories

---

## 7. Configuration Files

### `server/enumeratorConfig.js`

Defines the 10 enumerators on the project with:
- `code` — short ID matching the SurveyCTO `(CODE)` suffix in `NameCode` (e.g. `AZ01`)
- `name` — full name
- `phone` — Lebanese mobile number (without country code). Read from `ENUMERATOR_PHONES` env var first; falls back to hardcoded values
- `entity` — implementing partner (e.g. `Jafra`)
- `governorate`, `district`
- `locations` — array of `{ name, target, deadline }` assignments

**To update phone numbers without changing code:** set `ENUMERATOR_PHONES` in Railway as a JSON object:
```
ENUMERATOR_PHONES={"AZ01":"71797612","MK10":"81748316","AM06":"71646552",...}
```

### `server/locationConfig.js`

Maps SurveyCTO location codes (e.g. `camp_shatila`) to display metadata:
- `name` — human-readable location name
- `group` — display group for the dashboard (e.g. `Camps`, `Beirut`, `Chouf`)
- `region` — governorate-level region
- `district` — district name
- `type` — `Palestinian` or `Lebanese` (used for map colour)
- `target` — survey target for that location
- `lat`, `lng` — coordinates for the map marker

---

## 8. Data Persistence

The server uses **flat JSON files** for all mutable state. There is no database. Files are written atomically (write to `.tmp` then `fs.renameSync`) to prevent corruption on crash.

| File | Contains | Auto-created |
|------|---------|-------------|
| `server/qa_approvals.json` | Array of approved survey instanceIDs | Yes |
| `server/notes.json` | Array of note objects | Yes |
| `server/tasks.json` | Array of task objects | Yes |
| `server/payments.json` | `{ enumerators: [...], coordination: [...] }` | Yes |

**Warning:** Railway's filesystem is ephemeral. These files persist across normal restarts but are wiped if Railway recreates the container (e.g. on scaling or infrastructure changes). For long-term persistence, consider mounting a Railway Volume or migrating to a hosted Postgres/Redis instance.

---

## 9. Environment Variables

Set all of these in Railway → Service → Variables.

| Variable | Required | Description |
|----------|----------|-------------|
| `SESSION_SECRET` | ✅ Yes | Long random string for signing session cookies. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `GOOGLE_CLIENT_ID` | ✅ Yes | From Google Cloud Console → OAuth 2.0 credentials |
| `GOOGLE_CLIENT_SECRET` | ✅ Yes | From Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | ✅ Yes | Must be `https://dashboard.influeanswers.com/auth/callback` in production |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | ✅ Yes | Full JSON content of the service account key file (for Drive access) |
| `DRIVE_FOLDER_ID` | ✅ Yes | Google Drive folder ID containing the Excel data files |
| `CLIENT_URL` | ✅ Yes | `https://dashboard.influeanswers.com` in production |
| `ALLOWED_EMAILS` | ✅ Yes | Comma-separated emails allowed to log in |
| `QA_APPROVER_EMAILS` | ✅ Yes | Emails that can approve QA surveys (comma-separated) |
| `ANTHROPIC_API_KEY` | For email parsing | From console.anthropic.com. Without this, the Import from Email button will return a 503 |
| `ALLOWED_DOMAIN` | Optional | Allow all emails at a domain (e.g. `influeanswers.com`) |
| `ENUMERATOR_PHONES` | Optional | JSON object to override hardcoded phone numbers in source |
| `NODE_ENV` | Set by Railway | Set to `production` automatically |
| `PORT` | Set by Railway | Set automatically — do not hardcode |

---

## 10. Running Locally

### Prerequisites
- Node.js 18+
- A `.env` file in `server/` (copy from `server/.env.example`)
- Google OAuth credentials with `http://localhost:3001/auth/callback` as an authorised redirect URI

### Start both server and client

```bash
# From project root
npm run dev
# OR
./start-dev.sh
```

This runs:
- Server on `http://localhost:3001`
- Vite dev server on `http://localhost:5173` (proxies `/api` and `/auth` to :3001)

### Start client only (with mock data)

```bash
./start-vite-only.sh
```

Uses `server/dev-mock.js` for fake data without needing Drive/OAuth credentials.

---

## 11. Deployment (Railway)

The app is deployed as a **single Railway service**. The server builds the React client (`npm run build`) and serves it as static files from `client/dist/`.

### How a deploy works

1. Push to `main` branch on GitHub
2. Railway detects the push and triggers a build
3. Build command: `cd client && npm install && npm run build` (compiles React to `client/dist/`)
4. Start command: `cd server && npm install && node index.js`
5. Server starts, picks up env vars, serves both the API and the static React build
6. **All in-memory sessions are wiped** — users must sign in again

### After a deploy

- All logged-in users will see a redirect to the login page on their next API call (handled gracefully by the app)
- Data (tasks, notes, payments, QA approvals) persists IF Railway kept the same container; may be lost on full redeployment

---

## 12. Known Limitations & Future Improvements

| Issue | Impact | Suggested Fix |
|-------|--------|--------------|
| MemoryStore sessions | Lost on every deploy; no horizontal scaling | Add `connect-redis` with a Railway Redis instance |
| Flat-file JSON persistence | Data lost if Railway recreates container | Migrate to Railway Postgres + a simple ORM |
| Per-location enumerator progress | Detail page shows estimated split, not actual | Aggregate per-location counts from `data` sheet on server |
| Excel always re-downloaded | Bandwidth cost even if file hasn't changed | Compare `modifiedTime` before downloading |
| No test suite | Regressions only caught manually | Add Vitest for client + Jest/Supertest for server |
| Phone numbers in source code | Git history exposure | Set `ENUMERATOR_PHONES` env var and remove hardcoded fallbacks |

---

## 13. Security Notes

- **Google OAuth** with CSRF state token — login flow is CSRF-protected
- **Session cookies** — `httpOnly`, `sameSite: lax`, `secure` in production, 24h lifetime
- **Input validation** — all write endpoints enforce field allowlists and length caps
- **Rate limiting** — `/api/data` (30 req/min), `/api/refresh` (6/min), `/api/tasks/parse-email` (20/10min)
- **QA approvals** — enforced server-side via `requireQAApprover` middleware, not just UI-gated
- **AI prompt injection** — email content goes in `user` role only; instructions in `system` role
- **Atomic writes** — all JSON files written via `.tmp` + `rename` to prevent corruption
- **CORS** — explicit origin allowlist, no wildcard
- **Body size cap** — 50 KB on all routes; 8 000 char additional cap on email parse

---

## 14. Key People & Contacts

| Name | Role | Email |
|------|------|-------|
| Ralph Baydoun | Developer + Project Manager | ralph@influeanswers.com |
| Nisrine Khoory | Field Coordinator (Jafra) | nisrinekhoory@gmail.com |
| Moe Issa | Info Management / QA | infomgmtreportofficer@gmail.com |
| Kai Kamei | Client — Ground Truth Solutions | kai.kamei@groundtruthsolutions.org |

---

*Last updated: June 2026*
