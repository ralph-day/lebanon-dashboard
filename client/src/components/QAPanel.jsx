import { useState } from 'react'

const QA_STYLE = {
  '✅ PASS': 'bg-emerald-100 text-emerald-700',
  '⚠️ REVIEW': 'bg-yellow-100 text-yellow-700',
  '❌ FAIL': 'bg-red-100 text-red-700',
}

const FLAG_ICON = {
  '✗ Too Fast': '⚡ Too Fast',
  '✗ Too Slow': '🐢 Too Slow',
  '✗ App Left Open': '📱 App Open',
  '✗ Below Range': '📉 Below Range',
  '✗ Missing GPS': '📍 No GPS',
}

function FlagBadge({ value }) {
  if (!value || value === '✓ OK') return null
  const label = FLAG_ICON[value] || value
  return (
    <span className="inline-block bg-red-50 border border-red-200 text-red-600 text-xs px-1.5 py-0.5 rounded mr-1 mb-1 whitespace-nowrap">
      {label}
    </span>
  )
}

export default function QAPanel({ qa }) {
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')

  const total = qa.pass + qa.review + qa.fail

  const filtered = qa.rows.filter(r => {
    const matchFilter = filter === 'All' || r.qaStatus === filter
    const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const statCards = [
    { label: '✅ Pass', value: qa.pass, pct: total ? Math.round((qa.pass / total) * 100) : 0, color: 'emerald' },
    { label: '⚠️ Review', value: qa.review, pct: total ? Math.round((qa.review / total) * 100) : 0, color: 'yellow' },
    { label: '❌ Fail', value: qa.fail, pct: total ? Math.round((qa.fail / total) * 100) : 0, color: 'red' },
  ]

  const colorMap = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    red: 'bg-red-50 border-red-200 text-red-700',
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {statCards.map(c => (
          <div key={c.label} className={`rounded-xl border p-4 text-center ${colorMap[c.color]}`}>
            <p className="text-2xl font-bold">{c.value}</p>
            <p className="text-sm font-medium mt-0.5">{c.label}</p>
            <p className="text-xs opacity-60 mt-0.5">{c.pct}% of total</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search enumerator…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
        />
        {['All', '✅ PASS', '⚠️ REVIEW', '❌ FAIL'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
              filter === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {f}
          </button>
        ))}
        <span className="text-sm text-slate-400 self-center">{filtered.length} surveys</span>
      </div>

      {/* QA table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">Enumerator</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Date</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">App Time</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Survey Time</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Flags</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Status</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Issues</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center text-slate-400 py-8">No surveys match this filter</td></tr>
              )}
              {filtered.map((row, i) => (
                <tr key={i} className={`hover:bg-slate-50 ${row.totalFlags >= 2 ? 'bg-red-50/40' : ''}`}>
                  <td className="px-4 py-2.5 font-medium text-slate-800 text-xs whitespace-nowrap">{row.name}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500 text-center whitespace-nowrap">
                    {row.submissionDate ? new Date(row.submissionDate).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-center text-slate-600">{row.appTime?.toFixed(1) ?? '—'} min</td>
                  <td className="px-3 py-2.5 text-xs text-center text-slate-600">{row.fullTime?.toFixed(1) ?? '—'} min</td>
                  <td className="px-3 py-2.5 text-center">
                    {row.totalFlags > 0
                      ? <span className="bg-red-100 text-red-700 text-xs font-bold rounded-full w-5 h-5 inline-flex items-center justify-center">{row.totalFlags}</span>
                      : <span className="text-emerald-500 text-xs">✓</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${QA_STYLE[row.qaStatus] || 'bg-slate-100 text-slate-500'}`}>
                      {row.qaStatus}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    <FlagBadge value={row.tooFast} />
                    <FlagBadge value={row.tooSlow} />
                    <FlagBadge value={row.appLeftOpen} />
                    <FlagBadge value={row.belowRange} />
                    <FlagBadge value={row.missingGPS} />
                    {row.gap && row.gap !== 'OK' && (
                      <span className="inline-block bg-orange-50 border border-orange-200 text-orange-600 text-xs px-1.5 py-0.5 rounded mr-1 mb-1">
                        {row.gap}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-400 text-center">Showing most recent 50 surveys. Full history available in the Excel export.</p>
    </div>
  )
}
