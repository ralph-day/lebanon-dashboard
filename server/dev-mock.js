// Local dev server using the real Excel file (no Google Drive needed)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const XLSX = require('xlsx');
const path = require('path');
const { ENUMERATOR_ASSIGNMENTS } = require('./enumeratorConfig');
const { LOCATION_MAP, REGION_ORDER } = require('./locationConfig');

const app = express();
const PORT = 3001;

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(session({
  secret: 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Auto-login in dev mode
app.use((req, res, next) => {
  if (!req.session.user) {
    req.session.user = { email: 'dev@influeanswers.com', name: 'Dev User', picture: null };
  }
  next();
});

const DEV_USER = { email: 'dev@influeanswers.com', name: 'Dev User', picture: null };
app.get('/auth/me', (req, res) => res.json(DEV_USER));
app.get('/auth/login', (req, res) => res.redirect(process.env.CLIENT_URL || 'http://localhost:5173'));
app.post('/auth/logout', (req, res) => res.json({ ok: true }));

const EXCEL_PATH = process.env.DEV_EXCEL_PATH || path.join(__dirname, '../Lebanon 2026 - Analysis.xlsx');

function parseExcel(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheet = (name) => wb.SheetNames.includes(name) ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null }) : [];

  const tracker = sheet('Target_Tracker');
  const enumSummary = sheet('Enumerator_Summary');
  const qaDashboard = sheet('QA_Dashboard');
  const qaSections = sheet('QA_ByGroupSection');
  const queryAllRules = sheet('Query_All_Rules');
  const dashboardSheet = XLSX.utils.sheet_to_json(wb.Sheets['Dashboard'], { header: 1 });

  const overviewRow = dashboardSheet[4] || [];
  const overview = {
    totalLocations: overviewRow[1] || 0,
    totalTarget: overviewRow[4] || 0,
    remaining: overviewRow[7] || 0,
    completedToday: overviewRow[10] || 0,
    totalCompleted: (overviewRow[4] || 0) - (overviewRow[7] || 0),
  };

  const locations = tracker.map(r => {
    const code = r.location || '';
    const cfg = LOCATION_MAP[code] || {};
    // Determine sort order by region
    const regionIdx = REGION_ORDER.indexOf(cfg.region || '');
    return {
      code,
      location: cfg.name || code.replace(/_/g, ' '),
      region: cfg.region || (r.loc_2 || '').replace(/_/g, ' '),
      district: cfg.district || (r.loc_3 || '').replace(/_/g, ' '),
      type: cfg.type || 'Lebanese',
      configTarget: cfg.target || 0,
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
      lat: cfg.lat || null,
      lng: cfg.lng || null,
      regionOrder: regionIdx >= 0 ? regionIdx : 99,
    };
  }).sort((a, b) => a.regionOrder - b.regionOrder || a.location.localeCompare(b.location));

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
    sectionFields.forEach(f => { avgs[f] = e.counts[f] ? +(e.sums[f] / e.counts[f]).toFixed(2) : 0; });
    return { name: e.name, ...avgs };
  });

  const natTotals = locations.reduce((acc, l) => {
    acc.palestinian += l.palestinian; acc.lebanese += l.lebanese; acc.syrian += l.syrian;
    return acc;
  }, { palestinian: 0, lebanese: 0, syrian: 0 });

  const genderTotals = locations.reduce((acc, l) => {
    acc.men += l.men; acc.women += l.women; return acc;
  }, { men: 0, women: 0 });

  // ── Active enumerators (submissions in last 4 hours) ──────────────────────
  const now = Date.now();
  const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
  const recentByName = {};
  qaRows.forEach(r => {
    if (!r.submissionDate) return;
    const ts = new Date(r.submissionDate).getTime();
    if (now - ts <= FOUR_HOURS_MS) {
      if (!recentByName[r.name]) recentByName[r.name] = { count: 0, lastSeen: null, location: r.locationOn };
      recentByName[r.name].count++;
      if (!recentByName[r.name].lastSeen || ts > new Date(recentByName[r.name].lastSeen).getTime()) {
        recentByName[r.name].lastSeen = r.submissionDate;
        recentByName[r.name].location = r.locationOn;
      }
    }
  });
  const activeEnumerators = Object.entries(recentByName).map(([name, v]) => ({ name, ...v }));

  // ── Enumerator assignments enriched with completion data ──────────────────
  const completedByName = {};
  qaRows.forEach(r => {
    if (r.status === 'Accepted') {
      completedByName[r.name] = (completedByName[r.name] || 0) + 1;
    }
  });
  // Also count from full tracker using enumerator summary
  const enumCompletedMap = {};
  enumerators.forEach(e => { enumCompletedMap[e.name] = e.totalSurveys; });

  const assignments = ENUMERATOR_ASSIGNMENTS.map(e => {
    const fullName = Object.keys(enumCompletedMap).find(n => n.includes(`(${e.code})`)) || e.name;
    const completed = enumCompletedMap[fullName] || 0;
    const totalTarget = e.locations.reduce((s, l) => s + l.target, 0);
    const isActive = !!recentByName[fullName];
    const lastSeen = enumerators.find(en => en.name.includes(`(${e.code})`))?.lastSubmission || null;
    return {
      code: e.code,
      name: e.name,
      fullName,
      entity: e.entity,
      governorate: e.governorate,
      locations: e.locations,
      totalTarget,
      completed,
      remaining: Math.max(0, totalTarget - completed),
      pct: totalTarget > 0 ? +(completed / totalTarget * 100).toFixed(1) : 0,
      isActive,
      lastSeen,
      recentCount: recentByName[fullName]?.count || 0,
    };
  });

  // ── Phone lookup from config ──────────────────────────────────────────────
  const phoneByCode = {};
  ENUMERATOR_ASSIGNMENTS.forEach(e => { phoneByCode[e.code] = e.phone || null; });
  const phoneByName = {};
  ENUMERATOR_ASSIGNMENTS.forEach(e => {
    const fullName = Object.keys(enumCompletedMap).find(n => n.includes(`(${e.code})`)) || e.name;
    phoneByName[fullName] = e.phone || null;
  });

  // ── Compute anomalies — ACTIVE enumerators only ────────────────────────────
  const anomalyMap = {};
  const activeNames = new Set(Object.keys(recentByName)); // only active (last 4h)

  const addAnomaly = (name, severity, type, detail, submissionDate, instanceId) => {
    if (!activeNames.has(name)) return; // skip inactive enumerators
    if (!anomalyMap[name]) anomalyMap[name] = { name, phone: phoneByName[name] || null, critical: [], warnings: [] };
    const entry = { type, detail, submissionDate, instanceId };
    if (severity === 'critical') anomalyMap[name].critical.push(entry);
    else anomalyMap[name].warnings.push(entry);
  };

  // Failed surveys
  qaRows.filter(r => r.qaStatus === '❌ FAIL').forEach(r => {
    const flagList = [r.tooFast, r.belowRange, r.missingGPS].filter(f => f && f.startsWith('✗')).join(', ');
    addAnomaly(r.name, 'critical', 'Failed Survey', `Rejected — ${flagList || `${r.totalFlags} flag(s)`}`, r.submissionDate, r.id);
  });

  // Too fast
  qaRows.filter(r => r.tooFast === '✗ Too Fast').forEach(r => {
    addAnomaly(r.name, 'warning', 'Too Fast', `Completed in ${parseFloat(r.fullTime || 0).toFixed(1)} min — below minimum allowed`, r.submissionDate, r.id);
  });

  // Missing GPS
  qaRows.filter(r => r.missingGPS === '✗ Missing GPS').forEach(r => {
    addAnomaly(r.name, 'warning', 'Missing GPS', 'No location data recorded for this submission', r.submissionDate, r.id);
  });

  // Suspicious patterns — from Query_All_Rules
  queryAllRules.forEach(r => {
    const score = Number(r.Suspicion_Score) || 0;
    if (score === 0) return;
    const name = r.NameCode || '';
    const submissionDate = r.SubmissionDate
      ? (typeof r.SubmissionDate === 'number' ? new Date((r.SubmissionDate - 25569) * 86400 * 1000).toISOString() : String(r.SubmissionDate))
      : null;

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
    if (extreme.startsWith('✗')) {
      const pct = extreme.match(/(\d+)%/)?.[1];
      flagDetails.push(`${pct || 'High'}% of answers were extreme (only 1s or 5s)`);
    }

    const level = String(r.Suspicion_Level || '');
    const detail = flagDetails.length > 0
      ? `[${level.replace(/[^a-zA-Z\s]/g, '').trim()}] ${flagDetails.join(' · ')}`
      : `Suspicion score ${score} · ${r.Overall_Status || ''}`;

    const severity = level.includes('High') || score >= 3 ? 'critical' : 'warning';
    addAnomaly(name, severity, 'Suspicious Pattern', detail, submissionDate, r.instanceID);
  });

  // Enrich anomalies with most recent timestamp
  const anomalies = Object.values(anomalyMap).map(a => {
    const allItems = [...a.critical, ...a.warnings];
    const latestTs = allItems.reduce((max, item) => {
      const ts = item.submissionDate ? new Date(item.submissionDate).getTime() : 0;
      return ts > max ? ts : max;
    }, 0);
    return {
      ...a,
      totalIssues: a.critical.length + a.warnings.length,
      latestAt: latestTs ? new Date(latestTs).toISOString() : null,
    };
  }).sort((a, b) => b.critical.length - a.critical.length || b.totalIssues - a.totalIssues);

  return { overview, locations, enumerators, assignments, activeEnumerators, anomalies, qa: { rows: qaRows.slice(0, 50), pass: qaPass, review: qaReview, fail: qaFail }, sectionTimings, natTotals, genderTotals };
}

app.get('/api/data', (_req, res) => {
  try {
    const data = parseExcel(EXCEL_PATH);
    res.json({ ...data, filename: path.basename(EXCEL_PATH), fetchedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/refresh', (req, res) => res.json({ ok: true, fetchedAt: new Date().toISOString() }));

app.listen(PORT, () => console.log(`Dev mock server on http://localhost:${PORT}`));
