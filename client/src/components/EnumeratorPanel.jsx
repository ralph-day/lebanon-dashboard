import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import NotesBubble from './NotesBubble'
import SurveyDetailModal from './SurveyDetailModal'

const SECTIONS = [
  { key: 'time_demo',         label: 'Demographics', min: 3 },
  { key: 'time_priorities',   label: 'Priorities',   min: 2.5 },
  { key: 'time_mutualaid',    label: 'Mutual Aid',   min: 1.5 },
  { key: 'time_access_trust', label: 'Trust',        min: 2 },
  { key: 'time_expectations', label: 'Expectations', min: 5 },
  { key: 'time_info',         label: 'Info',         min: 1 },
  { key: 'time_future',       label: 'Future',       min: 1 },
]

function QualityBadge({ pct }) {
  if (pct == null) return <span className="text-slate-300 text-xs">—</span>
  const n = parseFloat(pct)
  const color = n >= 90 ? 'bg-emerald-100 text-emerald-700' : n >= 70 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>{n.toFixed(0)}%</span>
}

function SectionCell({ value, min }) {
  const isFast = value > 0 && value < min
  return (
    <td className={`px-2 py-2.5 text-xs text-center ${isFast ? 'text-red-500 font-semibold' : 'text-slate-600'}`}>
      {value > 0 ? value.toFixed(1) : '—'}
      {isFast && <span title="Below minimum" className="ml-0.5">⚠</span>}
    </td>
  )
}

// ── Enumerator detail subpage ─────────────────────────────────────────────────
const DATE_RANGES = [
  { key: 'all',     label: 'All time' },
  { key: 'today',   label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d',      label: 'Last 7 days' },
  { key: '30d',     label: 'Last 30 days' },
]

function EnumeratorDetail({ enumerator: e, timing, qaRows, assignment, onBack }) {
  const allRows = qaRows.filter(r => r.name === e.name)
  const [dateRange, setDateRange] = useState('all')

  const myRows = useMemo(() => {
    if (dateRange === 'all') return allRows
    const now = new Date()
    let start, end
    if (dateRange === 'today') {
      start = new Date(now); start.setHours(0,0,0,0)
      end = new Date(start); end.setDate(end.getDate() + 1)
    } else if (dateRange === 'yesterday') {
      end = new Date(now); end.setHours(0,0,0,0)
      start = new Date(end); start.setDate(start.getDate() - 1)
    } else {
      const days = dateRange === '7d' ? 7 : 30
      end = new Date(now)
      start = new Date(now); start.setDate(start.getDate() - days)
    }
    return allRows.filter(r => {
      if (!r.submissionDate) return false
      const ts = new Date(r.submissionDate).getTime()
      return ts >= start.getTime() && ts < end.getTime()
    })
  }, [allRows, dateRange])

  // Match Data Quality tab: classify by automated qaStatus (PASS/REVIEW/FAIL)
  const pass    = myRows.filter(r => r.qaStatus === '✅ PASS').length
  const review  = myRows.filter(r => r.qaStatus === '⚠️ REVIEW').length
  const fail    = myRows.filter(r => r.qaStatus === '❌ FAIL').length
  const pending = myRows.length - pass - fail - review
  const total50 = myRows.length || 1

  const missingGPSCount = myRows.filter(r => r.missingGPS === '✗ Missing GPS').length
  const durations = myRows.filter(r => r.appTime > 0).map(r => r.appTime)
  const avgDurationFiltered = durations.length > 0 ? durations.reduce((s, v) => s + v, 0) / durations.length : null
  const qualityPctFiltered = myRows.length > 0 ? (pass / myRows.length) * 100 : null

  // Recent 15 survey durations for bar chart
  const recentDurations = myRows
    .filter(r => r.appTime > 0)
    .slice(-15)
    .map((r, i) => ({
      idx: i + 1,
      mins: parseFloat((r.appTime || 0).toFixed(1)),
      flag: r.tooFast === '✗ Too Fast',
    }))

  const codeMatch = e.name.match(/\((\w+)\)/)
  const code = codeMatch ? codeMatch[1] : ''

  const [showAllSurveys, setShowAllSurveys] = useState(false)
  const [selectedSurveyId, setSelectedSurveyId] = useState(null)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h2 className="text-lg font-semibold text-slate-800">{e.name.split('(')[0].trim()}</h2>
        {code && <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{code}</span>}
        {assignment?.isActive && (
          <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full">
            Active · +{assignment.recentCount} last 4h
          </span>
        )}
        {e.phone && (
          <a href={`https://wa.me/961${e.phone}`} target="_blank" rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white font-medium transition-colors">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            WhatsApp
          </a>
        )}
      </div>

      {/* Date range filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 font-medium">Filter:</span>
        <div className="flex gap-1.5 flex-wrap">
          {DATE_RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setDateRange(r.key)}
              className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${dateRange === r.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >{r.label}</button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Surveys', value: dateRange === 'all' ? e.totalSurveys : myRows.length, color: 'text-blue-600' },
          { label: 'Avg Duration', value: dateRange === 'all' ? (e.avgDuration != null ? `${parseFloat(e.avgDuration).toFixed(1)} min` : '—') : (avgDurationFiltered != null ? `${avgDurationFiltered.toFixed(1)} min` : '—'), color: 'text-slate-700' },
          { label: 'Missing GPS', value: dateRange === 'all' ? (e.missingGPS ?? 0) : missingGPSCount, color: (dateRange === 'all' ? e.missingGPS : missingGPSCount) > 0 ? 'text-red-500' : 'text-emerald-500', bg: (dateRange === 'all' ? e.missingGPS : missingGPSCount) > 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100' },
          { label: 'Quality', value: dateRange === 'all' ? (e.qualityPct != null ? `${parseFloat(e.qualityPct).toFixed(0)}%` : '—') : (qualityPctFiltered != null ? `${qualityPctFiltered.toFixed(0)}%` : '—'), color: (dateRange === 'all' ? e.qualityPct : qualityPctFiltered) >= 90 ? 'text-emerald-600' : (dateRange === 'all' ? e.qualityPct : qualityPctFiltered) >= 70 ? 'text-yellow-600' : 'text-red-500' },
        ].map(s => (
          <div
            key={s.label}
            className={`bg-white rounded-xl border p-4 ${s.bg || 'border-slate-200'} ${s.label === 'Total Surveys' ? 'cursor-pointer hover:bg-slate-50' : ''}`}
            onClick={s.label === 'Total Surveys' ? () => setShowAllSurveys(true) : undefined}
            title={s.label === 'Total Surveys' ? 'Click to view all surveys' : undefined}
          >
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Assignment progress */}
      {assignment && assignment.locations?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">Assignment Progress</h3>
          {assignment.locations.map((loc, i) => {
            const locCompleted = Math.round((assignment.completed / assignment.locations.length))
            const pct = loc.target > 0 ? Math.min(100, Math.round(locCompleted / loc.target * 100)) : 0
            const deadline = loc.deadline ? new Date(loc.deadline) : null
            const daysLeft = deadline ? Math.ceil((deadline - Date.now()) / 86400000) : null
            return (
              <div key={i} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">{loc.name}</span>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>{loc.target} target</span>
                    {daysLeft != null && (
                      <span className={daysLeft <= 1 ? 'text-red-500 font-semibold' : daysLeft <= 3 ? 'text-orange-500 font-medium' : 'text-slate-400'}>
                        {daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? 'Due today' : `${Math.abs(daysLeft)}d overdue`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
          <div className="flex gap-6 text-sm pt-1">
            <span>Completed: <strong className="text-blue-600">{assignment.completed}</strong></span>
            <span>Target: <strong className="text-slate-700">{assignment.totalTarget}</strong></span>
            <span>Remaining: <strong className="text-slate-700">{assignment.remaining}</strong></span>
            <span>Progress: <strong className="text-blue-600">{assignment.pct}%</strong></span>
          </div>
        </div>
      )}

      {/* Quality + recent durations */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Survey Quality last 50 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Survey Quality ({myRows.length} surveys)</h3>
          <div className="flex gap-5 mb-4 flex-wrap">
            {[
              { label: 'Pass',    value: pass,    color: 'text-emerald-600', icon: '✅' },
              { label: 'Review',  value: review,  color: 'text-yellow-600',  icon: '⚠️' },
              { label: 'Fail',    value: fail,    color: 'text-red-600',     icon: '❌' },
              ...(pending > 0 ? [{ label: 'Pending', value: pending, color: 'text-slate-400', icon: '⏳' }] : []),
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500">{s.icon} {s.label}</p>
                <p className="text-xs text-slate-400">{Math.round(s.value / total50 * 100)}%</p>
              </div>
            ))}
          </div>
          <div className="flex rounded-full overflow-hidden h-2">
            <div className="bg-emerald-400 transition-all" style={{ width: `${pass / total50 * 100}%` }} />
            <div className="bg-yellow-400 transition-all" style={{ width: `${review / total50 * 100}%` }} />
            <div className="bg-red-400 transition-all" style={{ width: `${fail / total50 * 100}%` }} />
            <div className="bg-slate-200 transition-all" style={{ width: `${pending / total50 * 100}%` }} />
          </div>
        </div>

        {/* Recent survey durations */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Recent Survey Durations</h3>
          {recentDurations.length > 0 ? (
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={recentDurations} margin={{ left: -20, right: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="idx" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} unit="m" />
                <Tooltip formatter={(v) => [`${v} min`, 'Duration']} />
                <Bar dataKey="mins" radius={[3, 3, 0, 0]}>
                  {recentDurations.map((d, i) => (
                    <Cell key={i} fill={d.flag ? '#f59e0b' : '#22c55e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-slate-400 text-center py-8">No duration data available</p>
          )}
        </div>
      </div>

      {/* Section durations */}
      {timing && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Avg Section Duration vs Minimum</h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
            {SECTIONS.map(s => {
              const val = timing[s.key] || 0
              const isFast = val > 0 && val < s.min
              return (
                <div key={s.key} className={`rounded-lg p-3 border text-center ${isFast ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                  <p className="text-xs text-slate-500 mb-1">{s.label}</p>
                  <p className={`text-lg font-bold ${isFast ? 'text-red-500' : 'text-slate-700'}`}>
                    {val > 0 ? `${val.toFixed(1)}m` : '—'}
                  </p>
                  <p className={`text-xs mt-0.5 ${isFast ? 'text-red-400' : 'text-slate-400'}`}>
                    min {s.min}m {isFast ? '⚠️' : '✓'}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showAllSurveys && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/40 overflow-y-auto" onClick={() => setShowAllSurveys(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-xl">
              <h3 className="font-bold text-slate-800 text-base">All Surveys — {e.name.split('(')[0].trim()} ({myRows.length})</h3>
              <button onClick={() => setShowAllSurveys(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>
            <div className="p-3 space-y-1.5 max-h-[70vh] overflow-y-auto">
              {myRows.map((r, i) => (
                <div
                  key={r.id || i}
                  className={`border border-slate-100 rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-3 ${r.id ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                  onClick={() => r.id && setSelectedSurveyId(r.id)}
                  title={r.id ? 'Click to view full survey' : undefined}
                >
                  <div className="min-w-0">
                    <p className="font-mono text-slate-500 truncate">{r.id ? r.id.replace(/^uuid:/, '') : '—'}</p>
                    <p className="text-slate-500">{r.locationName || r.district || '—'}</p>
                  </div>
                  <div className="text-right shrink-0 text-slate-400">
                    {r.submissionDate && <p>{new Date(r.submissionDate).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
                    <p className={
                      r.qaStatus === '✅ PASS' ? 'text-emerald-600 font-medium' :
                      r.qaStatus === '❌ FAIL' ? 'text-red-500 font-medium' :
                      r.qaStatus === '⚠️ REVIEW' ? 'text-amber-600 font-medium' : 'font-medium'
                    }>{r.qaStatus || '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <SurveyDetailModal surveyId={selectedSurveyId} onClose={() => setSelectedSurveyId(null)} />
    </div>
  )
}

// ── Main panel (list view) ────────────────────────────────────────────────────
export default function EnumeratorPanel({ enumerators, sectionTimings, assignments = [], qaRows = [], notes = [], onNoteAdded, onNoteDeleted }) {
  const [selected, setSelected] = useState(null)
  const sorted = [...enumerators].sort((a, b) => new Date(b.lastSubmission || 0) - new Date(a.lastSubmission || 0))

  function enumStatus(e) {
    const codeMatch = e.name.match(/\((\w+)\)/)
    const code = codeMatch ? codeMatch[1] : ''
    const a = assignments.find(x => x.code === code)
    if (!a && e.totalSurveys === 0) return { label: 'Not Started', cls: 'bg-slate-100 text-slate-400' }
    if (a?.isActive)     return { label: '● Active',     cls: 'bg-emerald-100 text-emerald-700' }
    const pct = a?.pct || 0
    if (pct >= 1)        return { label: 'Complete',     cls: 'bg-blue-100 text-blue-700' }
    if (pct >= 0.75)     return { label: 'On Track',     cls: 'bg-cyan-100 text-cyan-700' }
    if (pct >= 0.3)      return { label: 'In Progress',  cls: 'bg-amber-100 text-amber-700' }
    if (e.totalSurveys > 0) return { label: 'Behind',   cls: 'bg-red-100 text-red-600' }
    return { label: 'Not Started', cls: 'bg-slate-100 text-slate-400' }
  }

  // Build chart data
  const chartData = sorted.map(e => ({
    name: e.name.split('(')[0].trim(),
    surveys: e.totalSurveys,
  }))

  const timingMap = {}
  sectionTimings.forEach(t => { timingMap[t.name] = t })

  // If an enumerator is selected, show the detail subpage
  if (selected) {
    const e = selected
    const timing = timingMap[e.name] || null
    const codeMatch = e.name.match(/\((\w+)\)/)
    const code = codeMatch ? codeMatch[1] : ''
    const assignment = assignments.find(a => a.code === code) || null
    return (
      <EnumeratorDetail
        enumerator={e}
        timing={timing}
        qaRows={qaRows}
        assignment={assignment}
        onBack={() => setSelected(null)}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Bar chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Surveys Collected per Enumerator</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => [v, 'Surveys']} />
            <Bar dataKey="surveys" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Enumerator table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">Enumerator Performance</h3>
        </div>
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">Enumerator</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Status</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Surveys</th>
                <th className="text-center text-xs font-semibold text-emerald-600 uppercase tracking-wide px-3 py-2.5">Accepted</th>
                <th className="text-center text-xs font-semibold text-red-500 uppercase tracking-wide px-3 py-2.5">Rejected</th>
                <th className="text-center text-xs font-semibold text-amber-600 uppercase tracking-wide px-3 py-2.5">Not Available</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Remaining</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Avg (min)</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Min</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Max</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">GPS Anomaly</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Last Submission</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((e, i) => (
                <tr
                  key={i}
                  className="hover:bg-blue-50 cursor-pointer transition-colors"
                  onClick={() => setSelected(e)}
                >
                  <td className="px-4 py-2.5 font-medium text-slate-800 flex items-center gap-2">
                    {e.name}
                    <svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </td>
                  <td className="px-3 py-2.5 text-center" onClick={ev => ev.stopPropagation()}>
                    {(() => { const s = enumStatus(e); return <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${s.cls}`}>{s.label}</span> })()}
                  </td>
                  <td className="px-3 py-2.5 text-center text-blue-600 font-semibold">{e.surveys}</td>
                  <td className="px-3 py-2.5 text-center font-semibold text-emerald-600">{e.accepted || <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2.5 text-center font-semibold">
                    {e.rejected > 0 ? <span className="text-red-500">{e.rejected}</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center font-semibold">
                    {e.notAvailable > 0 ? <span className="text-amber-600">{e.notAvailable}</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center font-semibold">
                    {(() => {
                      const code = (e.name.match(/\((\w+)\)/) || [])[1]
                      const a = assignments.find(x => x.code === code)
                      if (!a || a.totalTarget === 0) return <span className="text-slate-300">—</span>
                      if (a.remaining > 0) return <span className="text-orange-600">{a.remaining}</span>
                      if (a.remaining < 0) return <span className="text-red-500">{a.remaining}</span>
                      return <span className="text-emerald-600">0</span>
                    })()}
                  </td>
                  <td className="px-3 py-2.5 text-center text-slate-600">{e.avgDuration != null ? parseFloat(e.avgDuration).toFixed(1) : '—'}</td>
                  <td className="px-3 py-2.5 text-center text-slate-500">{e.minDuration != null ? parseFloat(e.minDuration).toFixed(1) : '—'}</td>
                  <td className="px-3 py-2.5 text-center text-slate-500">{e.maxDuration != null ? parseFloat(e.maxDuration).toFixed(1) : '—'}</td>
                  <td className="px-3 py-2.5 text-center">
                    {e.missingGPS > 0
                      ? <span className="text-red-500 font-medium">{e.missingGPS}</span>
                      : <span className="text-emerald-500">0</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs text-slate-400">
                    {e.lastSubmission && typeof e.lastSubmission === 'string' && e.lastSubmission.includes('-')
                      ? new Date(e.lastSubmission).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
                      : e.lastSubmission ? String(e.lastSubmission).substring(0, 16) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-center" onClick={ev => ev.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      {e.phone && (
                        <a
                          href={`https://wa.me/961${e.phone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`WhatsApp ${e.phone}`}
                          className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white transition-colors shrink-0"
                        >
                          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" xmlns="http://www.w3.org/2000/svg">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                        </a>
                      )}
                      <NotesBubble entityType="enumerator" entityId={e.name} entityLabel={e.name} allNotes={notes} onNoteAdded={onNoteAdded} onNoteDeleted={onNoteDeleted} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section timing heatmap */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Avg Section Duration (minutes)</h3>
          <span className="text-xs text-red-500">⚠ = below minimum threshold</span>
        </div>
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">Enumerator</th>
                {SECTIONS.map(s => (
                  <th key={s.key} className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-2 py-2.5 whitespace-nowrap">
                    {s.label}
                    <div className="font-normal text-slate-400 normal-case">min {s.min}m</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sectionTimings.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap text-xs">{row.name}</td>
                  {SECTIONS.map(s => (
                    <SectionCell key={s.key} value={row[s.key] || 0} min={s.min} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
