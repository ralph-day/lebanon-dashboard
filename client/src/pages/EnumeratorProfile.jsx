import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'

const SECTIONS = [
  { key: 'time_demo',         label: 'Demographics', min: 3 },
  { key: 'time_priorities',   label: 'Priorities',   min: 2.5 },
  { key: 'time_mutualaid',    label: 'Mutual Aid',   min: 1.5 },
  { key: 'time_access_trust', label: 'Trust',        min: 2 },
  { key: 'time_expectations', label: 'Expectations', min: 5 },
  { key: 'time_info',         label: 'Info',         min: 1 },
  { key: 'time_future',       label: 'Future',       min: 1 },
]

function StatBox({ label, value, sub, color = 'slate' }) {
  const colors = {
    blue:    'bg-blue-50 text-blue-700 border-blue-100',
    green:   'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber:   'bg-amber-50 text-amber-700 border-amber-100',
    red:     'bg-red-50 text-red-700 border-red-100',
    slate:   'bg-slate-50 text-slate-700 border-slate-100',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-60">{label}</p>
      <p className="text-2xl font-bold mt-0.5">{value ?? '—'}</p>
      {sub && <p className="text-xs mt-0.5 opacity-60">{sub}</p>}
    </div>
  )
}

export default function EnumeratorProfile({ data }) {
  const { code } = useParams()
  const navigate = useNavigate()

  const assignment = data?.assignments?.find(a => a.code === code)
  const enumerator = data?.enumerators?.find(e => e.name.includes(`(${code})`))
  const sectionTiming = data?.sectionTimings?.find(s => s.name.includes(`(${code})`))
  const qaRows = data?.qa?.rows?.filter(r => r.name.includes(`(${code})`)) || []
  const anomalies = data?.anomalies?.find(a => a.name.includes(`(${code})`))

  if (!assignment && !enumerator) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-500">Enumerator not found</p>
          <button onClick={() => navigate('/')} className="mt-3 text-blue-500 text-sm underline">Back to dashboard</button>
        </div>
      </div>
    )
  }

  const name = assignment?.name || enumerator?.name || code
  const phone = data?.assignments?.find(a => a.code === code)?.phone || null

  // QA breakdown
  const pass = qaRows.filter(r => r.qaStatus === '✅ PASS').length
  const review = qaRows.filter(r => r.qaStatus === '⚠️ REVIEW').length
  const fail = qaRows.filter(r => r.qaStatus === '❌ FAIL').length
  const total = qaRows.length

  // Section timing radar data
  const radarData = SECTIONS.map(s => ({
    section: s.label,
    avg: sectionTiming?.[s.key] || 0,
    min: s.min,
  }))

  // Recent submissions bar chart
  const recentBars = qaRows.slice(0, 15).reverse().map((r, i) => ({
    i: i + 1,
    mins: parseFloat(r.fullTime || 0).toFixed(1),
    status: r.qaStatus,
  }))

  const barColor = (status) => {
    if (status === '✅ PASS') return '#10b981'
    if (status === '⚠️ REVIEW') return '#f59e0b'
    return '#ef4444'
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-slate-600 text-sm">← Back</button>
          <div className="flex items-center gap-3 flex-1">
            <div className={`w-3 h-3 rounded-full ${assignment?.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'}`} />
            <h1 className="text-base font-semibold text-slate-800">{name}</h1>
            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded">{code}</span>
            {assignment?.isActive && (
              <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                Active · +{assignment.recentCount} last 4h
              </span>
            )}
          </div>
          {phone && (
            <a href={`tel:+961${phone}`} className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 rounded-lg transition-colors">
              📞 {phone}
            </a>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Overview stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatBox label="Total Surveys" value={enumerator?.totalSurveys || assignment?.completed} color="blue" />
          <StatBox label="Avg Duration" value={enumerator?.avgDuration != null ? `${parseFloat(enumerator.avgDuration).toFixed(1)} min` : '—'} color="slate" />
          <StatBox label="Missing GPS" value={enumerator?.missingGPS ?? '—'} color={enumerator?.missingGPS > 0 ? 'amber' : 'green'} />
          <StatBox label="Quality" value={enumerator?.qualityPct != null ? `${parseFloat(enumerator.qualityPct).toFixed(0)}%` : '—'} color="slate" />
        </div>

        {/* Assignment progress */}
        {assignment && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Assignment Progress</h3>
            <div className="space-y-3">
              {assignment.locations.map((loc, i) => {
                const dl = new Date(loc.deadline)
                const daysLeft = Math.ceil((dl - Date.now()) / 86400000)
                const dlColor = daysLeft < 0 ? 'text-red-600' : daysLeft <= 2 ? 'text-amber-600' : 'text-emerald-600'
                return (
                  <div key={i} className="flex items-center gap-4">
                    <span className="text-sm text-slate-700 w-48 shrink-0">{loc.name}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(assignment.pct, 100)}%` }} />
                    </div>
                    <span className="text-xs text-slate-500 w-20 text-right">{loc.target} target</span>
                    <span className={`text-xs font-medium w-20 text-right ${dlColor}`}>
                      {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex gap-6 text-sm">
              <span className="text-slate-500">Completed: <strong className="text-emerald-600">{assignment.completed}</strong></span>
              <span className="text-slate-500">Target: <strong className="text-slate-700">{assignment.totalTarget}</strong></span>
              <span className="text-slate-500">Remaining: <strong className="text-amber-600">{assignment.remaining}</strong></span>
              <span className="text-slate-500">Progress: <strong className="text-blue-600">{assignment.pct}%</strong></span>
            </div>
          </div>
        )}

        {/* QA summary + recent surveys */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Survey Quality (last 50)</h3>
            <div className="flex gap-4">
              {[['✅ Pass', pass, '#10b981'], ['⚠️ Review', review, '#f59e0b'], ['❌ Fail', fail, '#ef4444']].map(([label, val, color]) => (
                <div key={label} className="text-center flex-1">
                  <p className="text-2xl font-bold" style={{ color }}>{val}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                  <p className="text-xs text-slate-400">{total > 0 ? Math.round(val / total * 100) : 0}%</p>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <div className="flex h-2 rounded-full overflow-hidden">
                <div style={{ width: `${total > 0 ? pass/total*100 : 0}%`, background: '#10b981' }} />
                <div style={{ width: `${total > 0 ? review/total*100 : 0}%`, background: '#f59e0b' }} />
                <div style={{ width: `${total > 0 ? fail/total*100 : 0}%`, background: '#ef4444' }} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Recent Survey Durations</h3>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={recentBars} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="i" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} unit="m" />
                <Tooltip formatter={(v) => [`${v} min`, 'Duration']} />
                <Bar dataKey="mins" radius={[3, 3, 0, 0]}>
                  {recentBars.map((r, i) => <Cell key={i} fill={barColor(r.status)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Section timing */}
        {sectionTiming && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Avg Section Duration vs Minimum</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {SECTIONS.map(s => {
                const val = sectionTiming[s.key] || 0
                const isFast = val > 0 && val < s.min
                return (
                  <div key={s.key} className={`rounded-lg p-3 border ${isFast ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                    <p className="text-xs text-slate-500">{s.label}</p>
                    <p className={`text-lg font-bold ${isFast ? 'text-red-600' : 'text-slate-700'}`}>{val.toFixed(1)}m</p>
                    <p className={`text-xs ${isFast ? 'text-red-400' : 'text-slate-400'}`}>min {s.min}m {isFast ? '⚠️' : '✓'}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Active anomalies */}
        {anomalies && anomalies.totalIssues > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-red-700 mb-3">Active Issues (last 4h)</h3>
            <div className="space-y-2">
              {[...anomalies.critical, ...anomalies.warnings].map((issue, i) => (
                <div key={i} className="bg-white border border-red-100 rounded-lg px-3 py-2 flex items-start gap-2 text-xs">
                  <span className="shrink-0">{anomalies.critical.includes(issue) ? '🔴' : '🟡'}</span>
                  <div className="flex-1">
                    <span className="font-semibold">{issue.type}</span>
                    <span className="mx-1 text-slate-400">·</span>
                    <span className="text-slate-600">{issue.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
