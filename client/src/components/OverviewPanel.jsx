import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import AnomalyAlerts from './AnomalyAlerts'
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

function DailyProgress({ assignments, qaRows, navigate }) {
  const [offset, setOffset] = useState(0) // 0 = today, -1 = yesterday, etc.

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
    // match to assignment by name containing code
    const assignment = assignments.find(a => r.name.includes(`(${a.code})`))
    if (!assignment) return
    if (!statsByCode[assignment.code]) statsByCode[assignment.code] = { accepted: 0, rejected: 0, total: 0 }
    statsByCode[assignment.code].total++
    if (r.status === 'Accepted') statsByCode[assignment.code].accepted++
    else if (r.status && r.status !== 'Accepted') statsByCode[assignment.code].rejected++
  })

  const rows = assignments
    .map(a => ({ ...a, dayAccepted: statsByCode[a.code]?.accepted || 0, dayRejected: statsByCode[a.code]?.rejected || 0, dayTotal: statsByCode[a.code]?.total || 0 }))
    .filter(a => a.dayTotal > 0)
    .sort((a, b) => b.dayAccepted - a.dayAccepted)

  const totalAccepted = rows.reduce((s, a) => s + a.dayAccepted, 0)

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      {/* Header with date navigator */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-800">Progress by Enumerator</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => setOffset(o => o - 1)} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center text-sm">←</button>
          <span className={`text-sm font-semibold px-3 py-1 rounded-lg ${offset === 0 ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{label}</span>
          <button onClick={() => setOffset(o => Math.min(o + 1, 0))} disabled={offset === 0} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center text-sm disabled:opacity-30">→</button>
        </div>
      </div>

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
                  <span className="text-sm font-bold text-emerald-600">+{a.dayAccepted}</span>
                  <span className="text-xs text-slate-400">accepted</span>
                  {a.dayRejected > 0 && <span className="text-xs text-red-400 ml-1">({a.dayRejected} rejected)</span>}
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
    </div>
  )
}

export default function OverviewPanel({ data }) {
  const navigate = useNavigate()
  const { overview, natTotals, genderTotals, qa, locations, assignments = [], activeEnumerators = [], anomalies = [] } = data

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

  return (
    <div className="space-y-6">

      {/* ── Anomaly Alerts ────────────────────────────────────────────────── */}
      <AnomalyAlerts anomalies={anomalies} />

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

      {/* ── Daily Progress ────────────────────────────────────────────────── */}
      <DailyProgress assignments={assignments} qaRows={data.qa?.rows || []} navigate={navigate} />

      {/* ── Big numbers ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Surveys" value={totalCompleted.toLocaleString()} sub={`Target: ${overview.totalTarget.toLocaleString()}`} color="blue" />
        <StatCard label="Completed Today" value={overview.completedToday} sub="accepted submissions" color="green" />
        <StatCard label="Remaining" value={overview.remaining.toLocaleString()} sub="surveys to collect" color="amber" />
        <StatCard label="Locations" value={overview.totalLocations} sub="survey areas" color="slate" />
      </div>

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
