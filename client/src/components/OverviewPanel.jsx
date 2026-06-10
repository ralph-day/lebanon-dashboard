import { useState, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import AnomalyAlerts from './AnomalyAlerts'
import MiniMap from './MiniMap'
import SurveyDetailModal from './SurveyDetailModal'
import { useNavigate } from 'react-router-dom'

const NAT_COLORS = { Palestinian: '#3b82f6', Lebanese: '#10b981', Syrian: '#f59e0b' }

function StatCard({ label, value, sub, color = 'blue' }) {
  const colors = {
    blue:  'bg-blue-50 text-blue-700 border-blue-100',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-100',
  }
  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  )
}

function ActiveBadge({ name, code, lastSeen, recentCount, isActive, onClick }) {
  const mins = lastSeen ? Math.floor((Date.now() - new Date(lastSeen).getTime()) / 60000) : null
  const timeLabel = mins == null ? '—' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ${mins % 60}m ago`
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${isActive ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
    >
      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800 truncate hover:text-blue-600">{name.split('(')[0].trim()}</p>
        <p className="text-xs text-slate-400">{timeLabel}</p>
      </div>
      {isActive && (
        <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full whitespace-nowrap">
          +{recentCount} today
        </span>
      )}
    </div>
  )
}

function DailyProgress({ assignments, qaRows, gpsPoints = [], navigate, onHighlightEnumerator }) {
  const [offset, setOffset]           = useState(0) // 0 = today, -1 = yesterday, etc.
  const [showAccepted, setShowAccepted] = useState(false)
  const [showRejected, setShowRejected] = useState(false)
  const [showQaFail, setShowQaFail] = useState(false)
  const [selectedSurveyId, setSelectedSurveyId] = useState(null)

  // Day = 8 AM Lebanon (UTC+3) to 8 AM next day
  const LEBANON_OFFSET_MS = 3 * 60 * 60 * 1000
  const DAY_START_HOUR = 8 // 8 AM Lebanon
  const lbNow = new Date(Date.now() + LEBANON_OFFSET_MS)
  // If before 8 AM Lebanon, we're still in "yesterday's" working day
  const lbHour = lbNow.getUTCHours()
  const effectiveOffset = offset + (lbHour < DAY_START_HOUR ? -1 : 0)
  const lbDay = new Date(lbNow)
  lbDay.setUTCDate(lbDay.getUTCDate() + effectiveOffset)
  lbDay.setUTCHours(DAY_START_HOUR, 0, 0, 0)
  const dayStart = new Date(lbDay.getTime() - LEBANON_OFFSET_MS)        // 8 AM LB → UTC
  const dayEnd   = new Date(lbDay.getTime() - LEBANON_OFFSET_MS + 86400000 - 1) // next 8 AM

  const label = offset === 0 ? 'Today' : offset === -1 ? 'Yesterday'
    : lbDay.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  // Compute per-enumerator stats for selected day from qaRows
  const statsByCode = {}
  qaRows.forEach(r => {
    if (!r.submissionDate) return
    const ts = new Date(r.submissionDate).getTime()
    if (ts < dayStart.getTime() || ts > dayEnd.getTime()) return
    const assignment = assignments.find(a => r.name.includes(`(${a.code})`))
    if (!assignment) return
    if (!statsByCode[assignment.code]) statsByCode[assignment.code] = { accepted: 0, rejected: 0, qaFail: 0, total: 0 }
    statsByCode[assignment.code].total++
    const st = (r.status || '').trim().toLowerCase()
    if (st === 'accepted') statsByCode[assignment.code].accepted++
    else if (st) statsByCode[assignment.code].rejected++
    // QA fail = automated quality check failed (separate from supervisor rejection)
    if (r.qaStatus === '❌ FAIL') statsByCode[assignment.code].qaFail++
  })

  const rows = assignments
    .map(a => ({
      ...a,
      dayAccepted: statsByCode[a.code]?.accepted || 0,
      dayRejected: statsByCode[a.code]?.rejected || 0,
      dayQaFail:   statsByCode[a.code]?.qaFail   || 0,
      dayTotal:    statsByCode[a.code]?.total     || 0,
    }))
    .filter(a => a.dayTotal > 0)
    .sort((a, b) => b.dayAccepted - a.dayAccepted)

  // Individual qaRows for the selected day (for dropdowns)
  const dayQaRows = qaRows.filter(r => {
    if (!r.submissionDate) return false
    const ts = new Date(r.submissionDate).getTime()
    return ts >= dayStart.getTime() && ts <= dayEnd.getTime()
  })
  const dayAcceptedRows = dayQaRows.filter(r => (r.status || '').trim().toLowerCase() === 'accepted')
  const dayRejectedRows = dayQaRows.filter(r => {
    const st = (r.status || '').trim().toLowerCase()
    return st && st !== 'accepted'
  })
  const dayQaFailRows = dayQaRows.filter(r => r.qaStatus === '❌ FAIL')

  // totalAccepted uses gpsPoints with Lebanon midnight-to-midnight boundary —
  // identical to the field map's date filter — so both numbers always agree.
  // The per-row breakdown (qaRows) may be a subset; the header shows the full truth.
  const lbDateStr = lbDay.toISOString().slice(0, 10) // YYYY-MM-DD in Lebanon time
  const totalAccepted = gpsPoints.length > 0
    ? gpsPoints.filter(p => {
        if (!p.date || p.status !== 'accepted') return false
        const lb = new Date(new Date(p.date).getTime() + LEBANON_OFFSET_MS)
        return lb.toISOString().slice(0, 10) === lbDateStr
      }).length
    : rows.reduce((s, a) => s + a.dayAccepted, 0) // fallback if no gpsPoints

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      {/* Header with date navigator */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-800">Progress by Enumerator</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => setOffset(o => o - 1)} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center text-sm">←</button>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold px-3 py-1 rounded-lg ${offset === 0 ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{label}</span>
            {rows.length > 0 && (
              <div className="flex gap-1.5">
                <button
                  onClick={() => { setShowAccepted(v => !v); setShowRejected(false) }}
                  className={`text-sm font-bold px-3 py-1 rounded-lg border transition-colors ${showAccepted ? 'bg-green-600 text-white border-green-600' : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'}`}
                >{totalAccepted} accepted</button>
                {dayRejectedRows.length > 0 && (
                  <button
                    onClick={() => { setShowRejected(v => !v); setShowAccepted(false) }}
                    className={`text-sm font-bold px-3 py-1 rounded-lg border transition-colors ${showRejected ? 'bg-red-600 text-white border-red-600' : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'}`}
                  >{dayRejectedRows.length} rejected</button>
                )}
              </div>
            )}
          </div>
          <button onClick={() => setOffset(o => Math.min(o + 1, 0))} disabled={offset === 0} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center text-sm disabled:opacity-30">→</button>
        </div>
      </div>

      {/* Accepted dropdown */}
      {showAccepted && dayAcceptedRows.length > 0 && (
        <div className="mb-3 border border-green-100 rounded-lg bg-green-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-green-700 mb-2">✅ Accepted surveys — {label}</p>
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {dayAcceptedRows.map((r, i) => (
              <div
                key={r.id || i}
                className={`bg-white border border-green-100 rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-3 ${r.id ? 'cursor-pointer hover:bg-green-50' : ''}`}
                onClick={() => r.id && setSelectedSurveyId(r.id)}
                title={r.id ? 'Click to view full survey' : undefined}
              >
                <div>
                  <p className="font-semibold text-slate-800">{r.name || '—'}</p>
                  <p className="text-slate-500">{r.locationName || r.district || '—'}</p>
                  {r.id && <p className="text-slate-400 font-mono mt-0.5">{r.id.replace(/^uuid:/, '').slice(0, 8)}…</p>}
                </div>
                <div className="text-right shrink-0 text-slate-400">
                  {r.submissionDate && <p>{new Date(r.submissionDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
                  <p className="text-green-600 font-medium">{r.qaStatus || '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rejected dropdown */}
      {showRejected && dayRejectedRows.length > 0 && (
        <div className="mb-3 border border-red-100 rounded-lg bg-red-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-red-700 mb-2">🚫 Rejected surveys — {label}</p>
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {dayRejectedRows.map((r, i) => (
              <div key={r.id || i} className="bg-white border border-red-100 rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800">{r.name || '—'}</p>
                  <p className="text-slate-500">{r.locationName || r.district || '—'}</p>
                </div>
                <div className="text-right shrink-0 text-slate-400">
                  {r.submissionDate && <p>{new Date(r.submissionDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
                  <p className="text-red-500 font-medium">{(r.status || '').trim() || 'rejected'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* QA Fail dropdown */}
      {showQaFail && dayQaFailRows.length > 0 && (
        <div className="mb-3 border border-amber-100 rounded-lg bg-amber-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-amber-700 mb-2">⚠️ QA fail surveys — {label}</p>
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {dayQaFailRows.map((r, i) => (
              <div
                key={r.id || i}
                className={`bg-white border border-amber-100 rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-3 ${r.id ? 'cursor-pointer hover:bg-amber-100' : ''}`}
                onClick={() => r.id && setSelectedSurveyId(r.id)}
                title={r.id ? 'Click to view full survey' : undefined}
              >
                <div>
                  <p className="font-semibold text-slate-800">{r.name || '—'}</p>
                  <p className="text-slate-500">{r.locationName || r.district || '—'}</p>
                  {r.id && <p className="text-slate-400 font-mono mt-0.5">{r.id.replace(/^uuid:/, '').slice(0, 8)}…</p>}
                </div>
                <div className="text-right shrink-0 text-slate-400">
                  {r.submissionDate && <p>{new Date(r.submissionDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
                  <p className="text-amber-600 font-medium">{r.qaStatus || '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">No submissions recorded for {label.toLowerCase()}</p>
      ) : (
        <>
          <div className="space-y-2.5">
            {rows.map(a => (
              <div key={a.code} className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 rounded-lg px-2 py-1.5 transition-colors" onClick={() => navigate(`/enumerator/${a.code}`)}>
                <span className="text-sm font-medium text-slate-700 w-36 shrink-0 truncate">{a.name}</span>
                <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">{a.code}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${a.totalTarget > 0 ? Math.min(a.completed / a.totalTarget * 100, 100) : 0}%` }} />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className="text-sm font-bold text-emerald-600 hover:underline"
                    title="Show on map"
                    onClick={e => {
                      e.stopPropagation()
                      if (a.dayAccepted > 0) onHighlightEnumerator?.(`${a.name} (${a.code})`, lbDateStr)
                    }}
                  >+{a.dayAccepted}</span>
                  <span className="text-xs text-slate-400">accepted</span>
                  {a.dayRejected > 0 && (
                    <span className="text-xs font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded ml-1" title="Rejected by supervisor">
                      {a.dayRejected} rejected
                    </span>
                  )}
                  {a.dayQaFail > 0 && (
                    <span
                      className="text-xs font-semibold text-amber-600 bg-amber-50 hover:bg-amber-100 px-1.5 py-0.5 rounded ml-1 cursor-pointer"
                      title="Failed automated QA quality check — click to view"
                      onClick={e => { e.stopPropagation(); setShowQaFail(v => !v); setShowAccepted(false); setShowRejected(false) }}
                    >
                      {a.dayQaFail} QA fail
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between text-xs text-slate-400">
            <span>Total accepted: <span className="font-semibold text-slate-600">{totalAccepted}</span></span>
            <span>{rows.length} enumerator{rows.length !== 1 ? 's' : ''} active</span>
          </div>
        </>
      )}
      <SurveyDetailModal surveyId={selectedSurveyId} onClose={() => setSelectedSurveyId(null)} />
    </div>
  )
}

const LEBANON_OFFSET_MS = 3 * 60 * 60 * 1000

function toLbDateStr(isoStr) {
  if (!isoStr) return null
  const d = new Date(isoStr)
  if (isNaN(d)) return null
  return new Date(d.getTime() + LEBANON_OFFSET_MS).toISOString().slice(0, 10)
}

function DateHistoryStrip({ qaRows = [], gpsPoints = [] }) {
  // Build list of unique dates that have data, sorted desc
  const dates = useMemo(() => {
    const seen = new Set()
    ;[...qaRows, ...gpsPoints].forEach(r => {
      const d = toLbDateStr(r.submissionDate || r.date)
      if (d) seen.add(d)
    })
    return [...seen].sort().reverse()
  }, [qaRows, gpsPoints])

  const todayStr = toLbDateStr(new Date().toISOString())
  const [selected, setSelected] = useState(null) // null = no date selected

  // Stats for the selected date
  const dayStats = useMemo(() => {
    if (!selected) return null
    const dayGps = gpsPoints.filter(p => toLbDateStr(p.date) === selected)
    const accepted = dayGps.filter(p => p.status === 'accepted').length
    const rejected = dayGps.filter(p => p.status === 'rejected').length
    const pending  = dayGps.filter(p => p.status === 'pending').length
    const total    = dayGps.length

    const dayQa = qaRows.filter(r => toLbDateStr(r.submissionDate) === selected)
    const pass   = dayQa.filter(r => r.qaStatus === '✅ PASS').length
    const review = dayQa.filter(r => r.qaStatus === '⚠️ REVIEW').length
    const fail   = dayQa.filter(r => r.qaStatus === '❌ FAIL').length

    // Unique enumerators active that day
    const enums = new Set(dayGps.map(p => p.enumerator).filter(Boolean))

    return { accepted, rejected, pending, total, pass, review, fail, enums: enums.size }
  }, [selected, qaRows, gpsPoints])

  if (dates.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">📅 Daily History</h3>
        {selected && (
          <button onClick={() => setSelected(null)} className="text-xs text-slate-400 hover:text-slate-600">
            Clear
          </button>
        )}
      </div>

      {/* Date chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {dates.map(d => {
          const isToday    = d === todayStr
          const isSelected = d === selected
          const label = isToday ? 'Today' : new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          return (
            <button
              key={d}
              onClick={() => setSelected(isSelected ? null : d)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-600'
                  : isToday
                    ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Day breakdown */}
      {selected && dayStats && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-emerald-700">{dayStats.accepted}</p>
            <p className="text-xs text-emerald-600 mt-0.5">Accepted</p>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{dayStats.rejected}</p>
            <p className="text-xs text-red-500 mt-0.5">Rejected</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-slate-700">{dayStats.total}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total GPS</p>
          </div>
          <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-purple-700">{dayStats.enums}</p>
            <p className="text-xs text-purple-600 mt-0.5">Enumerators</p>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-700">{dayStats.pass}</p>
            <p className="text-xs text-green-600 mt-0.5">QA Pass</p>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-amber-700">{dayStats.review}</p>
            <p className="text-xs text-amber-600 mt-0.5">QA Review</p>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-red-700">{dayStats.fail}</p>
            <p className="text-xs text-red-500 mt-0.5">QA Fail</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-700">
              {dayStats.total > 0 ? Math.round(dayStats.accepted / dayStats.total * 100) : 0}%
            </p>
            <p className="text-xs text-blue-600 mt-0.5">Accept Rate</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function OverviewPanel({ data }) {
  const navigate = useNavigate()
  const { overview, natTotals, genderTotals, qa, locations, assignments = [], activeEnumerators = [], anomalies = [], gpsPoints = [] } = data

  const totalCompleted = overview.totalTarget - overview.remaining
  const pct = overview.totalTarget > 0 ? Math.round((totalCompleted / overview.totalTarget) * 100) : 0

  const natData = [
    { name: 'Palestinian', value: natTotals.palestinian },
    { name: 'Lebanese',    value: natTotals.lebanese },
    { name: 'Syrian',      value: natTotals.syrian },
  ].filter(d => d.value > 0)

  const qaData = [
    { name: 'Pass',   value: qa.pass,   fill: '#10b981' },
    { name: 'Review', value: qa.review, fill: '#f59e0b' },
    { name: 'Fail',   value: qa.fail,   fill: '#ef4444' },
  ]

  const genderData = [
    { name: 'Men',   value: genderTotals.men,   fill: '#3b82f6' },
    { name: 'Women', value: genderTotals.women, fill: '#ec4899' },
  ]

  const statusCounts = locations.reduce((acc, l) => {
    const s = (l.status || '').replace(/[^\w\s]/g, '').trim() || 'Unknown'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})

  // Sort assignments: active first, then by pct desc
  const sortedAssignments = [...assignments].sort((a, b) => {
    if (a.isActive !== b.isActive) return b.isActive - a.isActive
    return b.pct - a.pct
  })

  const activeCount = assignments.filter(a => a.isActive).length

  const [highlight, setHighlight] = useState(null) // { enumerator, date }

  return (
    <div className="space-y-6">

      {/* ── Anomaly Alerts ────────────────────────────────────────────────── */}
      <AnomalyAlerts anomalies={anomalies} navigate={navigate} />

      {/* ── Active Field Team ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Field Team Status</h3>
            <p className="text-xs text-slate-400 mt-0.5">Submissions in the last 4 hours</p>
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${activeCount > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {activeCount} / {assignments.length} active
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {sortedAssignments.map(a => (
            <ActiveBadge
              key={a.code}
              code={a.code}
              name={`${a.name} (${a.code})`}
              lastSeen={a.lastSeen}
              recentCount={a.recentCount}
              isActive={a.isActive}
              onClick={() => navigate(`/enumerator/${a.code}`)}
            />
          ))}
        </div>
      </div>

      {/* ── Daily Progress + Mini Map ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <DailyProgress assignments={assignments} qaRows={data.qa?.rows || []} gpsPoints={gpsPoints} navigate={navigate} onHighlightEnumerator={(enumerator, date) => setHighlight({ enumerator, date })} />
        <MiniMap gpsPoints={gpsPoints} highlight={highlight} />
      </div>

      {/* ── Big numbers ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Surveys" value={totalCompleted.toLocaleString()} sub={`Target: ${overview.totalTarget.toLocaleString()}`} color="blue" />
        <StatCard label="Completed Today" value={overview.completedToday} sub="accepted submissions" color="green" />
        <StatCard label="Remaining" value={overview.remaining.toLocaleString()} sub="surveys to collect" color="amber" />
        <StatCard label="Locations" value={overview.totalLocations} sub="survey areas" color="slate" />
      </div>

      {/* ── Daily History Strip ───────────────────────────────────────────── */}
      <DateHistoryStrip qaRows={qa.rows || []} gpsPoints={gpsPoints} />

      {/* ── Progress bar ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-slate-700">Overall Progress</span>
          <span className="text-sm font-bold text-blue-600">{pct}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-4">
          <div className="bg-blue-600 h-4 rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <div className="flex justify-between text-xs text-slate-400 mt-1.5">
          <span>{totalCompleted.toLocaleString()} collected</span>
          <span>{overview.totalTarget.toLocaleString()} total target</span>
        </div>
      </div>

      {/* ── Charts row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Respondents by Nationality</h3>
          <ResponsiveContainer width="100%" height={170}>
            <PieChart>
              <Pie data={natData} cx="50%" cy="50%" innerRadius={45} outerRadius={68} dataKey="value" paddingAngle={3}>
                {natData.map(e => <Cell key={e.name} fill={NAT_COLORS[e.name] || '#94a3b8'} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 mt-1">
            {natData.map(d => (
              <span key={d.name} className="flex items-center gap-1 text-xs text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: NAT_COLORS[d.name] }} />{d.name}: {d.value}
              </span>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Survey Quality Status</h3>
          <ResponsiveContainer width="100%" height={170}>
            <PieChart>
              <Pie data={qaData} cx="50%" cy="50%" innerRadius={45} outerRadius={68} dataKey="value" paddingAngle={3}>
                {qaData.map(e => <Cell key={e.name} fill={e.fill} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 mt-1">
            {qaData.map(d => (
              <span key={d.name} className="flex items-center gap-1 text-xs text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.fill }} />{d.name}: {d.value}
              </span>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Gender Breakdown</h3>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={genderData} layout="vertical" margin={{ left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={50} />
              <Tooltip />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {genderData.map(e => <Cell key={e.name} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 mt-1">
            {genderData.map(d => (
              <span key={d.name} className="flex items-center gap-1 text-xs text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.fill }} />{d.name}: {d.value}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Location status summary ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Location Status Summary</h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries(statusCounts).map(([status, count]) => (
            <div key={status} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 text-sm">
              <span>{status}</span>
              <span className="bg-slate-200 text-slate-700 rounded-full px-2 py-0.5 text-xs font-medium">{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
