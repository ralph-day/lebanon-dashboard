import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const SECTIONS = [
  { key: 'time_demo', label: 'Demographics', min: 3 },
  { key: 'time_priorities', label: 'Priorities', min: 2.5 },
  { key: 'time_mutualaid', label: 'Mutual Aid', min: 1.5 },
  { key: 'time_access_trust', label: 'Access & Trust', min: 2 },
  { key: 'time_expectations', label: 'Expectations', min: 5 },
  { key: 'time_info', label: 'Information', min: 1 },
  { key: 'time_future', label: 'Future', min: 1 },
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

export default function EnumeratorPanel({ enumerators, sectionTimings }) {
  const sorted = [...enumerators].sort((a, b) => b.totalSurveys - a.totalSurveys)

  // Build chart data: surveys per enumerator
  const chartData = sorted.map(e => ({
    name: e.name.split('(')[0].trim(),
    surveys: e.totalSurveys,
    avg: e.avgDuration,
  }))

  // Merge timing into enumerator list
  const timingMap = {}
  sectionTimings.forEach(t => { timingMap[t.name] = t })

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
            <Tooltip formatter={(v, n) => [v, n === 'surveys' ? 'Surveys' : 'Avg Duration (min)']} />
            <Bar dataKey="surveys" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Enumerator table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">Enumerator Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">Enumerator</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Surveys</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Avg (min)</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Min</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Max</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Missing GPS</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Quality</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Last Submission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((e, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{e.name}</td>
                  <td className="px-3 py-2.5 text-center text-blue-600 font-semibold">{e.totalSurveys}</td>
                  <td className="px-3 py-2.5 text-center text-slate-600">{e.avgDuration != null ? parseFloat(e.avgDuration).toFixed(1) : '—'}</td>
                  <td className="px-3 py-2.5 text-center text-slate-500">{e.minDuration != null ? parseFloat(e.minDuration).toFixed(1) : '—'}</td>
                  <td className="px-3 py-2.5 text-center text-slate-500">{e.maxDuration != null ? parseFloat(e.maxDuration).toFixed(1) : '—'}</td>
                  <td className="px-3 py-2.5 text-center">
                    {e.missingGPS > 0
                      ? <span className="text-red-500 font-medium">{e.missingGPS}</span>
                      : <span className="text-emerald-500">0</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center"><QualityBadge pct={e.qualityPct} /></td>
                  <td className="px-3 py-2.5 text-center text-xs text-slate-400">
                    {e.lastSubmission && typeof e.lastSubmission === 'string' && e.lastSubmission.includes('-')
                      ? new Date(e.lastSubmission).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
                      : e.lastSubmission ? String(e.lastSubmission).substring(0, 16) : '—'}
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
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
