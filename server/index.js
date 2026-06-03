require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { google } = require('googleapis');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

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
  const dashboardSheet = XLSX.utils.sheet_to_json(wb.Sheets['Dashboard'] || wb.Sheets[wb.SheetNames[0]], { header: 1 });

  // Parse overview from Dashboard sheet
  const overviewRow = dashboardSheet[4] || [];
  const overview = {
    totalLocations: overviewRow[1] || 0,
    totalTarget: overviewRow[4] || 0,
    remaining: overviewRow[7] || 0,
    completedToday: overviewRow[10] || 0,
    totalCompleted: (overviewRow[4] || 0) - (overviewRow[7] || 0),
  };

  // Location tracker
  const locations = tracker.map(r => ({
    location: r.location || r.loc_4 || '',
    region: r.loc_2 || '',
    district: r.loc_3 || '',
    target: r.target || 0,
    completed: r.Completed || 0,
    accepted: r.Accepted || 0,
    remaining: r['Actual Remaining'] || 0,
    pctComplete: r.Pct_Complete || 0,
    status: r.Status || '',
    palestinian: r.Palestinian || 0,
    lebanese: r.Lebanese || 0,
    syrian: r.Syrian || 0,
    rejectedGTS: r['Rejected by GTS'] || 0,
    rejectedNationality: r['Rejected because of nationality'] || 0,
    men: r.man || 0,
    women: r.woman || 0,
    locationOn: r.LocationOn || 0,
  }));

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

  return {
    overview,
    locations,
    enumerators,
    qa: { rows: qaRows.slice(0, 50), pass: qaPass, review: qaReview, fail: qaFail },
    sectionTimings,
    natTotals,
    genderTotals,
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
  res.json({ ...cache.data, fetchedAt: cache.fetchedAt });
});

app.post('/api/refresh', requireAuth, async (req, res) => {
  await refreshCache();
  if (!cache.data) return res.status(503).json({ error: 'Refresh failed' });
  res.json({ ok: true, fetchedAt: cache.fetchedAt });
});

// Serve built client in production
if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '../client/dist');
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => res.sendFile(path.join(clientBuild, 'index.html')));
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
