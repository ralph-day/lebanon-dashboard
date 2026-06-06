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

export default function QAPanel({ qa: initialQa }) {
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState(initialQa.rows)
  const [approving, setApproving] = useState(null) // id being processed

  const pass     = rows.filter(r => r.qaStatus === '✅ PASS').length
  const review   = rows.filter(r => r.qaStatus === '⚠️ REVIEW').length
  const fail     = rows.filter(r => r.qaStatus === '❌ FAIL').length
  const rejected = rows.filter(r => (r.status || '').trim().toLowerCase().includes('reject')).length
  const total    = rows.length

  const statCards = [
    { label: 'Pass',             icon: '✅', key: '✅ PASS',    value: pass,     pct: total ? Math.round((pass / total) * 100) : 0,
      bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', activeBg: 'bg-emerald-500' },
    { label: 'Review',           icon: '⚠️', key: '⚠️ REVIEW', value: review,   pct: total ? Math.round((review / total) * 100) : 0,
      bg: 'bg-yellow-50 border-yellow-200',   text: 'text-yellow-700',  activeBg: 'bg-yellow-500'  },
    { label: 'Review Immediately', icon: '🚨', key: '❌ FAIL',  value: fail,     pct: total ? Math.round((fail / total) * 100) : 0,
      bg: 'bg-red-50 border-red-200',         text: 'text-red-700',     activeBg: 'bg-red-600'     },
    { label: 'Rejected',         icon: '🚫', key: '__REJECTED__',        value: rejected, pct: total ? Math.round((rejected / total) * 100) : 0,
      bg: 'bg-red-50 border-red-300',         text: 'text-red-800',     activeBg: 'bg-red-700'     },
  ]

  const filtered = rows.filter(r => {
    const matchFilter = filter === 'All'
      || (filter === '__REJECTED__' ? (r.status || '').trim().toLowerCase().includes('reject') : r.qaStatus === filter)
    const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  async function handleApprove(row) {
    if (!row.id) return
    setApproving(row.id)
    try {
      const res = await fetch('/api/qa/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: row.id }),
      })
      if (!res.ok) throw new Error('Failed')
      // Optimistically update local state
      setRows(prev => prev.map(r =>
        r.id === row.id ? { ...r, status: 'Accepted', qaStatus: '✅ PASS', approvedByManager: true } : r
      ))
    } catch (e) {
      alert('Could not approve survey. Please try again.')
    } finally {
      setApproving(null)
    }
  }

  async function handleUnapprove(row) {
    if (!row.id) return
    setApproving(row.id)
    try {
      const res = await fetch('/api/qa/unapprove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: row.id }),
      })
      if (!res.ok) throw new Error('Failed')
      // Revert local state — restore original qaStatus stored in row
      setRows(prev => prev.map(r =>
        r.id === row.id ? { ...r, status: r._origStatus || '', qaStatus: '❌ FAIL', approvedByManager: false } : r
      ))
    } catch (e) {
      alert('Could not undo approval. Please try again.')
    } finally {
      setApproving(null)
    }
  }

  return (
    <div className="space-y-5">

      {/* Clickable summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map(c => {
          const isActive = filter === c.key
          return (
            <button
              key={c.key}
              onClick={() => setFilter(isActive ? 'All' : c.key)}
              className={`rounded-xl border p-4 text-center transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
                isActive ? `${c.activeBg} border-transparent shadow-md` : `${c.bg} ${c.text} hover:shadow-sm`
              }`}
            >
              <p className={`text-3xl font-bold ${isActive ? 'text-white' : ''}`}>{c.value}</p>
              <p className={`text-sm font-medium mt-0.5 ${isActive ? 'text-white' : ''}`}>{c.icon} {c.label}</p>
              <p className={`text-xs mt-0.5 ${isActive ? 'text-white/70' : 'opacity-60'}`}>{c.pct}% of total</p>
              {isActive && <p className="text-xs mt-1.5 text-white/80 font-medium">Click to clear ✕</p>}
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search enumerator…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
        />
        {['All', '✅ PASS', '⚠️ REVIEW', '❌ FAIL', '__REJECTED__'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
              filter === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {f === '__REJECTED__' ? '🚫 Rejected' : f}
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
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center text-slate-400 py-8">No surveys match this filter</td></tr>
              )}
              {filtered.map((row, i) => (
                <tr key={i} className={`hover:bg-slate-50 transition-colors ${
                  row.approvedByManager ? 'bg-emerald-50/40' :
                  row.totalFlags >= 2 ? 'bg-red-50/40' : ''
                }`}>
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
                    <div className="flex flex-col items-center gap-0.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${QA_STYLE[row.qaStatus] || 'bg-slate-100 text-slate-500'}`}>
                        {row.qaStatus}
                      </span>
                      {row.approvedByManager && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap">⚠ Previously Failed</span>
                      )}
                    </div>
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
                  <td className="px-3 py-2.5 text-center">
                    {row.approvedByManager ? (
                      <button
                        onClick={() => handleUnapprove(row)}
                        disabled={approving === row.id}
                        className="text-xs text-slate-400 hover:text-red-500 underline transition-colors disabled:opacity-40 whitespace-nowrap"
                      >
                        {approving === row.id ? '…' : 'Undo'}
                      </button>
                    ) : row.qaStatus === '❌ FAIL' ? (
                      <button
                        onClick={() => handleApprove(row)}
                        disabled={approving === row.id || !row.id}
                        title={!row.id ? 'No survey ID — cannot approve' : 'Mark as Accepted'}
                        className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap font-medium"
                      >
                        {approving === row.id ? 'Approving…' : '✓ Approve'}
                      </button>
                    ) : (
                      <span className="text-slate-200 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-400 text-center">
        Approvals by manager are saved and persist across data refreshes. Click a card above to filter by status.
      </p>
    </div>
  )
}
