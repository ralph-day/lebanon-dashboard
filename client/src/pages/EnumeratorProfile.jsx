import { useParams, useNavigate } from 'react-router-dom'
import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import SurveyDetailModal from '../components/SurveyDetailModal'

// ✗-flags on a QA row → readable list
function flagsOf(r) {
  return [r.tooFast, r.tooSlow, r.appLeftOpen, r.belowRange, r.missingGPS]
    .filter(f => f && String(f).startsWith('✗'))
    .map(f => String(f).replace('✗ ', ''))
    .join(', ') || '—'
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d) ? '—' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

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
    blue:  'bg-blue-50 text-blue-700 border-blue-100',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    red:   'bg-red-50 text-red-700 border-red-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-100',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-60">{label}</p>
      <p className="text-2xl font-bold mt-0.5">{value ?? '—'}</p>
      {sub && <p className="text-xs mt-0.5 opacity-60">{sub}</p>}
    </div>
  )
}

const barColor = (status) => {
  if (status === '✅ PASS') return '#10b981'
  if (status === '⚠️ REVIEW') return '#f59e0b'
  return '#ef4444'
}

// Lebanon timezone date string
function toLbDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d)) return null
  return new Date(d.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export default function EnumeratorProfile({ data }) {
  const { code } = useParams()
  const navigate = useNavigate()

  // Date filter state
  const [dateMode,   setDateMode]   = useState('all')  // 'all' | 'today' | 'last7' | 'custom'
  const [customDate, setCustomDate] = useState(() => toLbDate(new Date().toISOString()))
  const [qaFilter,   setQaFilter]   = useState(null)   // '✅ PASS' | '⚠️ REVIEW' | '❌ FAIL' | null
  const [selectedSurveyId, setSelectedSurveyId] = useState(null)

  const assignment   = data?.assignments?.find(a => a.code === code)
  const enumerator   = data?.enumerators?.find(e => e.name.includes(`(${code})`))
  const sectionTiming = data?.sectionTimings?.find(s => s.name.includes(`(${code})`))
  const allQaRows    = data?.qa?.rows?.filter(r => r.name.includes(`(${code})`)) || []
  const anomalies    = data?.anomalies?.find(a => a.name.includes(`(${code})`))

  // All unique dates this enumerator has submissions
  const allDates = useMemo(() => {
    const s = new Set(allQaRows.map(r => toLbDate(r.submissionDate)).filter(Boolean))
    return [...s].sort().reverse()
  }, [allQaRows])

  // Apply date filter to qaRows
  const qaRows = useMemo(() => {
    const todayLb = toLbDate(new Date().toISOString())
    const last7   = toLbDate(new Date(Date.now() - 6 * 86400000).toISOString())
    return allQaRows.filter(r => {
      const ds = toLbDate(r.submissionDate)
      if (dateMode === 'today')  return ds === todayLb
      if (dateMode === 'last7')  return ds >= last7
      if (dateMode === 'custom') return ds === customDate
      return true // 'all'
    })
  }, [allQaRows, dateMode, customDate])

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

  const name  = assignment?.name || enumerator?.name || code
  const phone = data?.assignments?.find(a => a.code === code)?.phone || null

  // QA breakdown (filtered)
  const pass   = qaRows.filter(r => r.qaStatus === '✅ PASS').length
  const review = qaRows.filter(r => r.qaStatus === '⚠️ REVIEW').length
  const fail   = qaRows.filter(r => r.qaStatus === '❌ FAIL').length
  const rejected = qaRows.filter(r => (r.status || '').trim().toLowerCase() === 'rejected').length
  const total  = qaRows.length

  // Flag frequency across the filtered period — what's driving the failures
  const flagCounts = {}
  qaRows.forEach(r => {
    [['Too Fast', r.tooFast], ['Too Slow', r.tooSlow], ['Below Range', r.belowRange], ['Missing GPS', r.missingGPS], ['App Left Open', r.appLeftOpen]]
      .forEach(([lbl, v]) => { if (v && String(v).startsWith('✗')) flagCounts[lbl] = (flagCounts[lbl] || 0) + 1 })
  })
  const flagList = Object.entries(flagCounts).sort((a, b) => b[1] - a[1])

  // Recent survey bars (last 20 in filtered set)
  const recentBars = [...qaRows]
    .sort((a, b) => new Date(a.submissionDate) - new Date(b.submissionDate))
    .slice(-20)
    .map((r, i) => ({
      i: i + 1,
      mins: parseFloat(r.fullTime || 0).toFixed(1),
      status: r.qaStatus,
      date: r.submissionDate ? new Date(r.submissionDate).toLocaleString() : '',
      surveyStatus: r.status || '',
    }))

  // Daily breakdown table
  const dailyStats = useMemo(() => {
    const byDate = {}
    allQaRows.forEach(r => {
      const ds = toLbDate(r.submissionDate)
      if (!ds) return
      if (!byDate[ds]) byDate[ds] = { date: ds, total: 0, accepted: 0, rejected: 0, qaPass: 0, qaReview: 0, qaFail: 0 }
      byDate[ds].total++
      const st = (r.status || '').trim().toLowerCase()
      if (st === 'accepted') byDate[ds].accepted++
      else if (st) byDate[ds].rejected++
      if (r.qaStatus === '✅ PASS')   byDate[ds].qaPass++
      if (r.qaStatus === '⚠️ REVIEW') byDate[ds].qaReview++
      if (r.qaStatus === '❌ FAIL')   byDate[ds].qaFail++
    })
    return Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date))
  }, [allQaRows])

  // Date filter label
  const filterLabel = {
    all:    'All time',
    today:  'Today',
    last7:  'Last 7 days',
    custom: customDate,
  }[dateMode]

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
            <a href={`tel:+961${phone}`}
              className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 rounded-lg transition-colors">
              📞 {phone}
            </a>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Date filter bar ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Showing</span>
          {[['all', 'All time'], ['today', 'Today'], ['last7', 'Last 7 days']].map(([mode, lbl]) => (
            <button key={mode} onClick={() => setDateMode(mode)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                dateMode === mode
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}>
              {lbl}
            </button>
          ))}
          <input type="date" value={customDate}
            onChange={e => { setCustomDate(e.target.value); setDateMode('custom') }}
            className={`text-xs border rounded-lg px-2 py-1.5 text-slate-700 bg-white transition-colors ${
              dateMode === 'custom' ? 'border-blue-400 ring-1 ring-blue-200' : 'border-slate-200'
            }`}
          />
          <span className="ml-auto text-xs text-slate-400">
            {total} survey{total !== 1 ? 's' : ''} · {filterLabel}
          </span>
        </div>

        {/* ── Overview stats (all-time from server) ────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatBox label="Total Surveys" value={enumerator?.totalSurveys || assignment?.completed} sub="all time" color="blue" />
          <StatBox label="Avg Duration"  value={enumerator?.avgDuration != null ? `${parseFloat(enumerator.avgDuration).toFixed(1)} min` : '—'} color="slate" />
          <StatBox label="Missing GPS"   value={enumerator?.missingGPS ?? '—'} color={enumerator?.missingGPS > 0 ? 'amber' : 'green'} />
          <StatBox label="Quality"       value={enumerator?.qualityPct != null ? `${parseFloat(enumerator.qualityPct).toFixed(0)}%` : '—'} sub="all time" color="slate" />
        </div>

        {/* ── Assignment progress ───────────────────────────────────────────── */}
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

        {/* ── Quality for selected period ───────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Survey Quality</h3>
            <p className="text-xs text-slate-400 mb-4">{filterLabel} · {total} surveys</p>
            {total === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No surveys for this period</p>
            ) : (
              <>
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4 flex items-baseline justify-between">
                  <span className="text-xs font-medium text-blue-700 uppercase tracking-wide">Total filled — {filterLabel}</span>
                  <span className="text-2xl font-bold text-blue-700">{total}</span>
                </div>
                <div className="flex gap-4 mb-4">
                  {[['✅ Pass', pass, '#10b981', '✅ PASS'], ['⚠️ Review', review, '#f59e0b', '⚠️ REVIEW'], ['❌ QA Fail', fail, '#ef4444', '❌ FAIL']].map(([label, val, color, statusKey]) => (
                    <button
                      key={label}
                      onClick={() => setQaFilter(qaFilter === statusKey ? null : statusKey)}
                      className={`text-center flex-1 rounded-lg py-1.5 border transition-colors ${qaFilter === statusKey ? 'bg-slate-100 border-slate-300' : 'border-transparent hover:bg-slate-50'}`}
                      title={`Show ${label} surveys`}
                    >
                      <p className="text-2xl font-bold" style={{ color }}>{val}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                      <p className="text-xs text-slate-400">{total > 0 ? Math.round(val / total * 100) : 0}%</p>
                    </button>
                  ))}
                </div>
                {rejected > 0 && (
                  <div className="bg-red-50 rounded-lg px-3 py-2 text-xs text-red-700 font-medium mb-3">
                    ⛔ {rejected} survey{rejected !== 1 ? 's' : ''} rejected by GTS
                  </div>
                )}
                {flagList.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-slate-400 mb-1.5">Most common flags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {flagList.map(([lbl, n]) => (
                        <span key={lbl} className="text-xs bg-red-50 border border-red-200 text-red-600 rounded-full px-2 py-0.5">{lbl} · {n}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex h-2 rounded-full overflow-hidden">
                  <div style={{ width: `${total > 0 ? pass/total*100 : 0}%`,   background: '#10b981' }} />
                  <div style={{ width: `${total > 0 ? review/total*100 : 0}%`, background: '#f59e0b' }} />
                  <div style={{ width: `${total > 0 ? fail/total*100 : 0}%`,   background: '#ef4444' }} />
                </div>
              </>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Survey Durations</h3>
            <p className="text-xs text-slate-400 mb-3">{filterLabel} · last {recentBars.length} shown</p>
            {recentBars.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No surveys for this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={recentBars} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="i" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="m" />
                  <Tooltip formatter={(v, n, p) => [`${v} min · ${p.payload.date}`, 'Duration']} />
                  <Bar dataKey="mins" radius={[3, 3, 0, 0]}>
                    {recentBars.map((r, i) => <Cell key={i} fill={barColor(r.status)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Filtered survey list (Pass / Review / QA Fail) ────────────────── */}
        {qaFilter && (() => {
          const list = qaRows
            .filter(r => r.qaStatus === qaFilter)
            .sort((a, b) => new Date(b.submissionDate) - new Date(a.submissionDate))
          const heading = qaFilter === '✅ PASS' ? 'Passed' : qaFilter === '⚠️ REVIEW' ? 'Review' : 'QA Failed'
          return (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">{heading} surveys — {filterLabel} ({list.length})</h3>
                <button onClick={() => setQaFilter(null)} className="text-xs text-slate-400 hover:text-slate-600">✕ clear</button>
              </div>
              {list.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No {heading.toLowerCase()} surveys for this period</p>
              ) : (
                <div className="space-y-1.5 max-h-[28rem] overflow-y-auto">
                  {list.map((r, i) => (
                    <div
                      key={r.id || i}
                      onClick={() => r.id && setSelectedSurveyId(r.id)}
                      className={`border border-slate-100 rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-3 ${r.id ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                      title={r.id ? 'Click to view full survey (section-by-section timing)' : undefined}
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-slate-500">#{(r.id || '').replace(/^uuid:/, '').slice(0, 8) || '—'}</p>
                        <p className="text-slate-600 mt-0.5">Flags: <span className="text-red-500">{flagsOf(r)}</span></p>
                      </div>
                      <div className="text-right shrink-0 text-slate-400">
                        <p>{fmtDateTime(r.submissionDate)}</p>
                        <p className="mt-0.5">uploaded</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        {/* ── Section timing (all-time averages from server) ────────────────── */}
        {sectionTiming && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Avg Section Duration vs Minimum</h3>
            <p className="text-xs text-slate-400 mb-4">All-time averages</p>
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

        {/* ── Daily breakdown table ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Daily Submission Log</h3>
          {dailyStats.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No submission history</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 border-b border-slate-100">
                    <th className="text-left pb-2 font-medium">Date</th>
                    <th className="text-right pb-2 font-medium">Total</th>
                    <th className="text-right pb-2 font-medium text-emerald-600">Accepted</th>
                    <th className="text-right pb-2 font-medium text-red-500">Rejected</th>
                    <th className="text-right pb-2 font-medium text-emerald-600">QA Pass</th>
                    <th className="text-right pb-2 font-medium text-amber-500">Review</th>
                    <th className="text-right pb-2 font-medium text-red-500">QA Fail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {dailyStats.map(d => {
                    const isToday = d.date === toLbDate(new Date().toISOString())
                    return (
                      <tr key={d.date}
                        onClick={() => { setCustomDate(d.date); setDateMode('custom') }}
                        className={`cursor-pointer hover:bg-slate-50 transition-colors ${
                          dateMode === 'custom' && customDate === d.date ? 'bg-blue-50' : ''
                        }`}>
                        <td className="py-2 font-medium text-slate-700">
                          {d.date}
                          {isToday && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">today</span>}
                        </td>
                        <td className="py-2 text-right text-slate-600">{d.total}</td>
                        <td className="py-2 text-right font-semibold text-emerald-600">{d.accepted || '—'}</td>
                        <td className="py-2 text-right font-semibold text-red-500">{d.rejected || '—'}</td>
                        <td className="py-2 text-right text-emerald-600">{d.qaPass || '—'}</td>
                        <td className="py-2 text-right text-amber-500">{d.qaReview || '—'}</td>
                        <td className="py-2 text-right font-semibold text-red-500">{d.qaFail || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="text-xs text-slate-400 mt-3">Click a row to filter the quality view to that day</p>
            </div>
          )}
        </div>

        {/* ── Active anomalies ──────────────────────────────────────────────── */}
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

        <SurveyDetailModal surveyId={selectedSurveyId} onClose={() => setSelectedSurveyId(null)} />
      </main>
    </div>
  )
}
