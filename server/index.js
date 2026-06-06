require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { google } = require('googleapis');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { ENUMERATOR_ASSIGNMENTS } = require('./enumeratorConfig');
const { LOCATION_MAP, REGION_ORDER, GROUP_ORDER } = require('./locationConfig');

const app = express();
const PORT = process.env.PORT || 3001;
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || '1DGavGDKXsZby7cmUtOK6jn9w9CJyiJyW';

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ── Google OAuth ──────────────────────────────────────────────────────────────
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/callback'
);

const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN || '';

function isAllowed(email) {
  if (ALLOWED_DOMAIN && email.endsWith('@' + ALLOWED_DOMAIN)) return true;
  if (ALLOWED_EMAILS.includes(email)) return true;
  return false;
}

app.get('/auth/login', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
  });
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  try {
    const { tokens } = await oauth2Client.getToken(req.query.code);
    oauth2Client.setCredentials(tokens);
    const people = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await people.userinfo.get();
    if (!isAllowed(data.email)) {
      return res.redirect((process.env.CLIENT_URL || 'http://localhost:5173') + '/login?error=unauthorized');
    }
    req.session.user = { email: data.email, name: data.name, picture: data.picture };
    res.redirect(process.env.CLIENT_URL || 'http://localhost:5173');
  } catch (e) {
    console.error('Auth error:', e.message);
    res.redirect((process.env.CLIENT_URL || 'http://localhost:5173') + '/login?error=auth_failed');
  }
});

app.get('/auth/me', (req, res) => {
  if (req.session.user) return res.json(req.session.user);
  res.status(401).json({ error: 'Not authenticated' });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// ── Data cache ────────────────────────────────────────────────────────────────
let cache = { data: null, fetchedAt: null };
const CACHE_TTL_MS = 15 * 60 * 1000;

// ── QA Approvals (persist to disk so overrides survive restarts) ──────────────
const APPROVALS_PATH = path.join(__dirname, 'qa_approvals.json');
let approvedIds = new Set();
try {
  if (fs.existsSync(APPROVALS_PATH)) {
    const saved = JSON.parse(fs.readFileSync(APPROVALS_PATH, 'utf8'));
    approvedIds = new Set(saved);
    console.log(`Loaded ${approvedIds.size} QA approval overrides`);
  }
} catch (e) { console.error('Could not load approvals:', e.message); }

function saveApprovals() {
  try { fs.writeFileSync(APPROVALS_PATH, JSON.stringify([...approvedIds])); } catch (e) { console.error('Could not save approvals:', e.message); }
}

function applyApprovals(qaRows) {
  return qaRows.map(r => {
    if (approvedIds.has(r.id)) {
      return { ...r, status: 'Accepted', qaStatus: '✅ PASS', approvedByManager: true };
    }
    return r;
  });
}

async function getDriveAuth() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    return auth;
  }
  // Fallback: use OAuth client (user must be authenticated)
  return oauth2Client;
}

async function fetchLatestExcel() {
  const auth = await getDriveAuth();
  const drive = google.drive({ version: 'v3', auth });

  const list = await drive.files.list({
    q: `'${DRIVE_FOLDER_ID}' in parents and mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' and trashed=false`,
    orderBy: 'modifiedTime desc',
    pageSize: 1,
    fields: 'files(id, name, modifiedTime)',
  });

  if (!list.data.files.length) throw new Error('No Excel file found in Drive folder');

  const file = list.data.files[0];
  const destPath = path.join(__dirname, 'tmp_data.xlsx');

  const dest = fs.createWriteStream(destPath);
  const dl = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'stream' });
  await new Promise((resolve, reject) => {
    dl.data.pipe(dest);
    dl.data.on('end', resolve);
    dl.data.on('error', reject);
  });

  return { path: destPath, filename: file.name, modifiedTime: file.modifiedTime };
}

function parseExcel(filePath) {
  const wb = XLSX.readFile(filePath);

  const sheet = (name) => {
    if (!wb.SheetNames.includes(name)) return [];
    return XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
  };

  const tracker = sheet('Target_Tracker');
  const enumSummary = sheet('Enumerator_Summary');
  const qaDashboard = sheet('QA_Dashboard');
  const qaSections = sheet('QA_ByGroupSection');
  const rawData = sheet('data');

  // Per-location rejection counts from the raw data sheet
  const rejByLoc = {};
  rawData.forEach(r => {
    const loc = r.loc_4 || r['Fixed Location'] || '';
    const status = r.SurveyStatus_New || '';
    if (!loc) return;
    if (!rejByLoc[loc]) rejByLoc[loc] = 0;
    if (status && status !== 'Accepted') rejByLoc[loc]++;
  });
  const dashboardSheet = XLSX.utils.sheet_to_json(wb.Sheets['Dashboard'] || wb.Sheets[wb.SheetNames[0]], { header: 1 });

  // Parse overview from Dashboard sheet
  // Find the values row dynamically (contains numbers for target/remaining)
  const overviewRow = dashboardSheet.find(row =>
    row && typeof row[4] === 'number' && row[4] > 100 && typeof row[7] === 'number'
  ) || dashboardSheet.find(row =>
    row && typeof row[1] === 'number' && row[1] > 0
  ) || dashboardSheet[4] || [];
  const overview = {
    totalLocations: overviewRow[1] || 0,
    totalTarget: overviewRow[4] || 0,
    remaining: overviewRow[7] || 0,
    completedToday: overviewRow[10] || 0,
    totalCompleted: (overviewRow[4] || 0) - (overviewRow[7] || 0),
  };

  // Location tracker — enriched with proper names
  const locations = tracker.map(r => {
    const code = r.location || r.loc_4 || '';
    const cfg = LOCATION_MAP[code] || {};
    const regionIdx = REGION_ORDER.indexOf(cfg.region || '');
    const groupIdx  = GROUP_ORDER.indexOf(cfg.group || '');
    return {
      code,
      location: cfg.name || code.replace(/_/g, ' '),
      group: cfg.group || cfg.district || (r.loc_3 || '').replace(/_/g, ' '),
      region: cfg.region || (r.loc_2 || '').replace(/_/g, ' '),
      district: cfg.district || (r.loc_3 || '').replace(/_/g, ' '),
      type: cfg.type || 'Lebanese',
      target: r.target || 0,
      completed: r.Completed || 0,
      accepted: r.Accepted || 0,
      remaining: r['Actual Remaining'] || 0,
      pctComplete: r.Pct_Complete || 0,
      status: r.Status || '',
      palestinian: r.Palestinian || 0,
      lebanese: r.Lebanese || 0,
      syrian: r.Syrian || 0,
      rejected: rejByLoc[code] || 0,
      men: r.man || 0,
      women: r.woman || 0,
      locationOn: r.LocationOn || 0,
      lat: cfg.lat || null,
      lng: cfg.lng || null,
      regionOrder: regionIdx >= 0 ? regionIdx : 99,
      groupOrder: groupIdx >= 0 ? groupIdx : 99,
    };
  }).sort((a, b) => a.regionOrder - b.regionOrder || a.location.localeCompare(b.location));

  // Enumerators
  const enumerators = enumSummary.map(r => ({
    name: r.NameCode || '',
    totalSurveys: Number(r.Total_Surveys) || 0,
    avgDuration: r.Avg_Duration != null ? parseFloat(r.Avg_Duration) : null,
    minDuration: r.Min_Duration != null ? parseFloat(r.Min_Duration) : null,
    maxDuration: r.Max_Duration != null ? parseFloat(r.Max_Duration) : null,
    tooFast: r.Too_Fast || 0,
    tooSlow: r.Too_Slow || 0,
    appLeftOpen: r.App_Left_Open || 0,
    missingGPS: r.Missing_GPS || 0,
    lastSubmission: r.Last_Submission ? (typeof r.Last_Submission === 'number' ? new Date((r.Last_Submission - 25569) * 86400 * 1000).toISOString() : String(r.Last_Submission)) : null,
    qualityPct: r['Quality_%'] || null,
  }));

  // QA flags summary
  const qaRows = qaDashboard.map(r => ({
    id: r.instanceID || '',
    name: r.NameCode || '',
    status: r.SurveyStatus_New || '',
    qaStatus: r.QA_Status || '',
    submissionDate: r.SubmissionDate ? (typeof r.SubmissionDate === 'number' ? new Date((r.SubmissionDate - 25569) * 86400 * 1000).toISOString() : String(r.SubmissionDate)) : null,
    appTime: r.apptimemint || 0,
    fullTime: r['Full Time All Sections'] || 0,
    tooFast: r.FLAG_TooFast || '',
    tooSlow: r.FLAG_TooSlow || '',
    appLeftOpen: r.FLAG_AppLeftOpen || '',
    belowRange: r.FLAG_BelowRange || '',
    missingGPS: r.FLAG_MissingGPS || '',
    totalFlags: r.Total_Flags || 0,
    gap: r.GAP || '',
    timeRange: r['time range accepted'] || '',
    locationOn: r.LocationOn || '',
  }));

  const qaPass = qaRows.filter(r => r.qaStatus === '✅ PASS').length;
  const qaReview = qaRows.filter(r => r.qaStatus === '⚠️ REVIEW').length;
  const qaFail = qaRows.filter(r => r.qaStatus === '❌ FAIL').length;
  const qaRejected = qaRows.filter(r => r.status && r.status !== 'Accepted').length;

  // Section timing averages per enumerator
  const sectionFields = ['time_demo', 'time_priorities', 'time_mutualaid', 'time_access_trust', 'time_expectations', 'time_info', 'time_future'];
  const timingMap = {};
  qaSections.forEach(r => {
    const name = r.NameCode;
    if (!timingMap[name]) timingMap[name] = { name, counts: {}, sums: {} };
    sectionFields.forEach(f => {
      const raw = r[f];
      if (!raw) return;
      const mins = typeof raw === 'number' ? raw : parseFloat(String(raw).split(' ')[0]);
      if (isNaN(mins)) return;
      timingMap[name].sums[f] = (timingMap[name].sums[f] || 0) + mins;
      timingMap[name].counts[f] = (timingMap[name].counts[f] || 0) + 1;
    });
  });
  const sectionTimings = Object.values(timingMap).map(e => {
    const avgs = {};
    sectionFields.forEach(f => {
      avgs[f] = e.counts[f] ? +(e.sums[f] / e.counts[f]).toFixed(2) : 0;
    });
    return { name: e.name, ...avgs };
  });

  // Nationality totals
  const natTotals = locations.reduce((acc, l) => {
    acc.palestinian += l.palestinian;
    acc.lebanese += l.lebanese;
    acc.syrian += l.syrian;
    return acc;
  }, { palestinian: 0, lebanese: 0, syrian: 0 });

  // Gender totals
  const genderTotals = locations.reduce((acc, l) => {
    acc.men += l.men;
    acc.women += l.women;
    return acc;
  }, { men: 0, women: 0 });

  // ── Active enumerators (last 4 hours) ────────────────────────────────────
  const now = Date.now();
  const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
  const recentByName = {};
  qaRows.forEach(r => {
    if (!r.submissionDate) return;
    const ts = new Date(r.submissionDate).getTime();
    if (now - ts <= FOUR_HOURS_MS) {
      if (!recentByName[r.name]) recentByName[r.name] = { count: 0, lastSeen: null };
      recentByName[r.name].count++;
      if (!recentByName[r.name].lastSeen || ts > new Date(recentByName[r.name].lastSeen).getTime()) {
        recentByName[r.name].lastSeen = r.submissionDate;
      }
    }
  });
  const activeEnumerators = Object.entries(recentByName).map(([name, v]) => ({ name, ...v }));

  // ── Today's submissions per enumerator ────────────────────────────────────
  // Lebanon = UTC+3
  // Working day starts at 8 AM Lebanon (UTC+3)
  const todayLb = new Date(Date.now() + 3 * 3600000);
  const lbHour = todayLb.getUTCHours();
  if (lbHour < 8) todayLb.setUTCDate(todayLb.getUTCDate() - 1); // before 8 AM = still yesterday's day
  todayLb.setUTCHours(8, 0, 0, 0);
  const todayStart = new Date(todayLb.getTime() - 3 * 3600000);
  const todayByName = {};
  qaRows.forEach(r => {
    if (!r.submissionDate) return;
    const ts = new Date(r.submissionDate).getTime();
    if (ts >= todayStart.getTime()) {
      if (!todayByName[r.name]) todayByName[r.name] = { accepted: 0, rejected: 0, total: 0 };
      todayByName[r.name].total++;
      if (r.status === 'Accepted') todayByName[r.name].accepted++;
      else if (r.status && r.status !== 'Accepted') todayByName[r.name].rejected++;
    }
  });

  // ── Enumerator assignments ────────────────────────────────────────────────
  const enumCompletedMap = {};
  enumerators.forEach(e => { enumCompletedMap[e.name] = e.totalSurveys; });

  const phoneByName = {};
  ENUMERATOR_ASSIGNMENTS.forEach(e => {
    const fullName = Object.keys(enumCompletedMap).find(n => n.includes(`(${e.code})`)) || e.name;
    phoneByName[fullName] = e.phone || null;
  });

  const assignments = ENUMERATOR_ASSIGNMENTS.map(e => {
    const fullName = Object.keys(enumCompletedMap).find(n => n.includes(`(${e.code})`)) || e.name;
    const completed = enumCompletedMap[fullName] || 0;
    const totalTarget = e.locations.reduce((s, l) => s + l.target, 0);
    const isActive = !!recentByName[fullName];
    const lastSeen = enumerators.find(en => en.name.includes(`(${e.code})`))?.lastSubmission || null;
    return {
      code: e.code, name: e.name, fullName, entity: e.entity,
      governorate: e.governorate, locations: e.locations,
      totalTarget, completed, remaining: Math.max(0, totalTarget - completed),
      pct: totalTarget > 0 ? +(completed / totalTarget * 100).toFixed(1) : 0,
      isActive, lastSeen, recentCount: recentByName[fullName]?.count || 0,
      todayAccepted: todayByName[fullName]?.accepted || 0,
      todayTotal: todayByName[fullName]?.total || 0,
    };
  });

  // ── Anomalies (active enumerators only) ───────────────────────────────────
  const activeNames = new Set(Object.keys(recentByName));
  const anomalyMap = {};
  const addAnomaly = (name, severity, type, detail, submissionDate) => {
    if (!activeNames.has(name)) return;
    // Only show issues from the last 4 hours
    if (submissionDate) {
      const ts = new Date(submissionDate).getTime();
      if (now - ts > FOUR_HOURS_MS) return;
    }
    if (!anomalyMap[name]) anomalyMap[name] = { name, phone: phoneByName[name] || null, critical: [], warnings: [] };
    const entry = { type, detail, submissionDate };
    if (severity === 'critical') anomalyMap[name].critical.push(entry);
    else anomalyMap[name].warnings.push(entry);
  };

  qaRows.filter(r => r.qaStatus === '❌ FAIL').forEach(r => {
    const flagList = [r.tooFast, r.belowRange, r.missingGPS].filter(f => f && f.startsWith('✗')).join(', ');
    addAnomaly(r.name, 'critical', 'Failed Survey', `Rejected — ${flagList || `${r.totalFlags} flag(s)`}`, r.submissionDate);
  });
  qaRows.filter(r => r.tooFast === '✗ Too Fast').forEach(r => {
    addAnomaly(r.name, 'warning', 'Too Fast', `Completed in ${parseFloat(r.fullTime || 0).toFixed(1)} min — below minimum`, r.submissionDate);
  });
  qaRows.filter(r => r.missingGPS === '✗ Missing GPS').forEach(r => {
    addAnomaly(r.name, 'warning', 'Missing GPS', 'No location data recorded', r.submissionDate);
  });

  const queryAllRules = sheet('Query_All_Rules');
  queryAllRules.forEach(r => {
    const score = Number(r.Suspicion_Score) || 0;
    if (score === 0) return;
    const name = r.NameCode || '';
    const submissionDate = r.SubmissionDate ? (typeof r.SubmissionDate === 'number' ? new Date((r.SubmissionDate - 25569) * 86400 * 1000).toISOString() : String(r.SubmissionDate)) : null;
    const flagDetails = [];
    const sectionMap = { FLAG_StraightLine_Trust: 'Trust', FLAG_StraightLine_Perception: 'Perception', FLAG_StraightLine_Expect: 'Expectations' };
    Object.entries(sectionMap).forEach(([col, label]) => {
      const val = String(r[col] || '');
      if (val.startsWith('✗')) {
        const m = val.match(/\((\S+) repeated (\d+)x\)/);
        flagDetails.push(m ? `Gave same answer (${m[1]}) ${m[2]}× in ${label}` : `Straightlining in ${label}`);
      }
    });
    const extreme = String(r.FLAG_HighExtremeRate || '');
    if (extreme.startsWith('✗')) { const pct = extreme.match(/(\d+)%/)?.[1]; flagDetails.push(`${pct || 'High'}% extreme answers`); }
    const level = String(r.Suspicion_Level || '');
    const detail = flagDetails.length > 0 ? `[${level.replace(/[^a-zA-Z\s]/g, '').trim()}] ${flagDetails.join(' · ')}` : `Suspicion score ${score}`;
    addAnomaly(name, score >= 3 ? 'critical' : 'warning', 'Suspicious Pattern', detail, submissionDate);
  });

  const anomalies = Object.values(anomalyMap).map(a => {
    const allItems = [...a.critical, ...a.warnings];
    const latestTs = allItems.reduce((max, item) => { const ts = item.submissionDate ? new Date(item.submissionDate).getTime() : 0; return ts > max ? ts : max; }, 0);
    return { ...a, totalIssues: a.critical.length + a.warnings.length, latestAt: latestTs ? new Date(latestTs).toISOString() : null };
  }).sort((a, b) => b.critical.length - a.critical.length || b.totalIssues - a.totalIssues);

  return {
    overview, locations, enumerators, assignments, activeEnumerators, anomalies,
    qa: { rows: qaRows.slice(0, 1000), pass: qaPass, review: qaReview, fail: qaFail, rejected: qaRejected },
    sectionTimings, natTotals, genderTotals,
  };
}

async function refreshCache() {
  try {
    const { path: filePath, filename, modifiedTime } = await fetchLatestExcel();
    const parsed = parseExcel(filePath);
    cache = { data: { ...parsed, filename, modifiedTime }, fetchedAt: new Date().toISOString() };
    console.log(`[${new Date().toISOString()}] Data refreshed from: ${filename}`);
  } catch (err) {
    console.error('Cache refresh error:', err.message);
  }
}

// ── API routes ────────────────────────────────────────────────────────────────
app.get('/api/data', requireAuth, async (req, res) => {
  if (!cache.data || !cache.fetchedAt || Date.now() - new Date(cache.fetchedAt).getTime() > CACHE_TTL_MS) {
    await refreshCache();
  }
  if (!cache.data) return res.status(503).json({ error: 'Data not available yet' });
  // Apply manager approval overrides to QA rows
  const approvedRows = applyApprovals(cache.data.qa.rows);
  const pass     = approvedRows.filter(r => r.qaStatus === '✅ PASS').length;
  const review   = approvedRows.filter(r => r.qaStatus === '⚠️ REVIEW').length;
  const fail     = approvedRows.filter(r => r.qaStatus === '❌ FAIL').length;
  const rejected = approvedRows.filter(r => r.status && r.status !== 'Accepted').length;
  res.json({ ...cache.data, qa: { ...cache.data.qa, rows: approvedRows, pass, review, fail, rejected }, fetchedAt: cache.fetchedAt });
});

app.post('/api/refresh', requireAuth, async (req, res) => {
  await refreshCache();
  if (!cache.data) return res.status(503).json({ error: 'Refresh failed' });
  res.json({ ok: true, fetchedAt: cache.fetchedAt });
});

// Approve a failed survey (manager override)
app.post('/api/qa/approve', requireAuth, (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing id' });
  approvedIds.add(id);
  saveApprovals();
  console.log(`[QA Override] ${req.session.user.email} approved survey: ${id}`);
  res.json({ ok: true, id });
});

// Undo an approval
app.post('/api/qa/unapprove', requireAuth, (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing id' });
  approvedIds.delete(id);
  saveApprovals();
  res.json({ ok: true, id });
});

// Serve built client in production
if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '../client/dist');
  app.use(express.static(clientBuild));
  app.use((req, res) => res.sendFile(path.join(clientBuild, 'index.html')));
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
