import { useState } from 'react'
import NotesBubble from './NotesBubble'

const QA_STYLE = {
  '✅ PASS': 'bg-emerald-100 text-emerald-700',
  '⚠️ REVIEW': 'bg-yellow-100 text-yellow-700',
  '❌ FAIL': 'bg-red-100 text-red-700',
}

// Human-readable labels for SurveyStatus_New rejection codes
const REJECTION_LABELS = {
  'too_short':                    { label: 'Too Short',                color: 'bg-orange-100 text-orange-700 border-orange-200' },
  'wrong_nationality':            { label: 'Wrong Nationality',        color: 'bg-purple-100 text-purple-700 border-purple-200' },
  'itp':                          { label: 'In The Pipeline',          color: 'bg-blue-100 text-blue-700 border-blue-200' },
  'too_close':                    { label: 'Too Close (GPS)',          color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  'testing':                      { label: 'Test Submission',          color: 'bg-slate-100 text-slate-600 border-slate-200' },
  'respondent is not displaced':  { label: 'Not Displaced',            color: 'bg-red-100 text-red-700 border-red-200' },
}

function RejectionBadge({ status }) {
  if (!status) return null
  const key = status.trim().toLowerCase()
  if (key === 'accepted') return null
  const cfg = REJECTION_LABELS[key] || { label: status, color: 'bg-red-100 text-red-700 border-red-200' }
  return (
    <span className={`inline-block border text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.color}`}>
      🚫 {cfg.label}
    </span>
  )
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

export default function QAPanel({ qa: initialQa, canApprove = false, notes = [], onNoteAdded, onNoteDeleted }) {
  const [filter, setFilter]               = useState('All')
  const [searchName, setSearchName]       = useState('')
  const [searchDistrict, setSearchDistrict] = useState('All')
  const [searchLocation, setSearchLocation] = useState('All')
  const [dateFrom, setDateFrom]           = useState('')
  const [dateTo, setDateTo]               = useState('')
  const [rows, setRows]               = useState(initialQa.rows)
  const [approving, setApproving]     = useState(null)

  const pass     = rows.filter(r => r.qaStatus === '✅ PASS').length
  const review   = rows.filter(r => r.qaStatus === '⚠️ REVIEW').length
  const fail     = rows.filter(r => r.qaStatus === '❌ FAIL').length
  const rejected = rows.filter(r => (r.status || '').trim().toLowerCase() !== 'accepted').length
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

  // Unique sorted districts from all rows
  const allDistricts = ['All', ...Array.from(new Set(rows.map(r => r.district).filter(Boolean))).sort()]

  // Locations available for the selected district
  const allLocations = searchDistrict === 'All'
    ? []
    : ['All', ...Array.from(new Set(
        rows.filter(r => r.district === searchDistrict).map(r => r.locationName).filter(Boolean)
      )).sort()]

  const filtered = rows.filter(r => {
    const matchFilter   = filter === 'All'
      || (filter === '__REJECTED__'
          ? ((r.status || '').trim().toLowerCase() !== 'accepted' && (r.status || '').trim() !== '')
          : r.qaStatus === filter)
    const matchName     = !searchName || r.name.toLowerCase().includes(searchName.toLowerCase())
    const matchDistrict = searchDistrict === 'All' || r.district === searchDistrict
    const matchLocation = searchDistrict === 'All' || searchLocation === 'All' || r.locationName === searchLocation
    const ts = r.submissionDate ? new Date(r.submissionDate) : null
    const matchFrom = !dateFrom || (ts && ts >= new Date(dateFrom))
    const matchTo   = !dateTo   || (ts && ts <= new Date(dateTo + 'T23:59:59'))
    return matchFilter && matchName && matchDistrict && matchLocation && matchFrom && matchTo
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
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        {/* Status filter buttons */}
        <div className="flex flex-wrap gap-2 items-center">
          {['All', '✅ PASS', '⚠️ REVIEW', '❌ FAIL', '__REJECTED__'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                filter === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {f === '__REJECTED__' ? '🚫 Rejected' : f}
            </button>
          ))}
          <span className="text-sm text-slate-400 ml-auto">{filtered.length} surveys</span>
        </div>

        {/* Search row */}
        <div className="flex flex-wrap gap-2">
          {/* Enumerator name */}
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs text-slate-400 mb-1 block">Enumerator</label>
            <input
              type="text"
              placeholder="Search name…"
              value={searchName}
              onChange={e => setSearchName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* District */}
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs text-slate-400 mb-1 block">District</label>
            <select
              value={searchDistrict}
              onChange={e => { setSearchDistrict(e.target.value); setSearchLocation('All') }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {allDistricts.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>

          {/* Location sub-filter — only shown when a district is selected */}
          {searchDistrict !== 'All' && allLocations.length > 1 && (
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs text-slate-400 mb-1 block">Location</label>
              <select
                value={searchLocation}
                onChange={e => setSearchLocation(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {allLocations.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
          )}

          {/* Date from */}
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs text-slate-400 mb-1 block">From date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date to */}
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs text-slate-400 mb-1 block">To date</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Today shortcut */}
          <div className="flex items-end">
            {(() => {
              const todayStr = new Date(Date.now() + 3*60*60*1000).toISOString().slice(0, 10)
              const isToday = dateFrom === todayStr && dateTo === todayStr
              return (
                <button
                  onClick={() => { const t = todayStr; setDateFrom(t); setDateTo(t) }}
                  className={`text-xs border rounded-lg px-3 py-2 transition-colors whitespace-nowrap font-semibold ${
                    isToday
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'text-blue-600 border-blue-200 hover:bg-blue-50'
                  }`}
                >
                  Today
                </button>
              )
            })()}
          </div>

          {/* Clear filters — always visible */}
          <div className="flex items-end">
            <button
              onClick={() => { setSearchName(''); setSearchDistrict('All'); setSearchLocation('All'); setDateFrom(''); setDateTo('') }}
              className={`text-xs border rounded-lg px-3 py-2 transition-colors whitespace-nowrap ${
                (searchName || searchDistrict !== 'All' || searchLocation !== 'All' || dateFrom || dateTo)
                  ? 'text-red-500 border-red-200 hover:bg-red-50'
                  : 'text-slate-300 border-slate-200 cursor-default'
              }`}
            >
              ✕ Remove filters
            </button>
          </div>
        </div>
      </div>

      {/* Rejected view explanation banner */}
      {filter === '__REJECTED__' && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <span className="text-lg leading-none mt-0.5">🚫</span>
          <div>
            <span className="font-semibold">Rejected surveys</span> — these were excluded based on the <code className="bg-red-100 px-1 rounded text-xs">SurveyStatus_New</code> column in the data sheet. The reason (Too Short, Wrong Nationality, etc.) is the rejection cause. The QA grade shown below it reflects the QA system separately.
          </div>
        </div>
      )}

      {/* QA table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto -mx-0">
          <table className="w-full text-sm" style={{ minWidth: '700px' }}>
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 whitespace-nowrap">Enumerator</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">District</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">Date</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">App Time</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">Survey Time</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Flags</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">{filter === '__REJECTED__' ? 'Rejection Reason' : 'Status'}</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Issues</th>
                {canApprove && <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr><td colSpan={canApprove ? 9 : 8} className="text-center text-slate-400 py-8">No surveys match this filter</td></tr>
              )}
              {filtered.map((row, i) => (
                <tr key={i} className={`hover:bg-slate-50 transition-colors ${
                  row.approvedByManager ? 'bg-emerald-50/40' :
                  row.totalFlags >= 2 ? 'bg-red-50/40' : ''
                }`}>
                  <td className="px-4 py-2.5 font-medium text-slate-800 text-xs whitespace-nowrap">{row.name}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{row.district || '—'}</td>
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
                      {filter === '__REJECTED__'
                        ? <RejectionBadge status={row.status} />
                        : <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${QA_STYLE[row.qaStatus] || 'bg-slate-100 text-slate-500'}`}>{row.qaStatus}</span>
                      }
                      {filter === '__REJECTED__' && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${QA_STYLE[row.qaStatus] || 'bg-slate-100 text-slate-500'}`}>{row.qaStatus}</span>
                      )}
                      {row.approvedByManager && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap">⚠ Previously Failed</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    <div className="flex flex-wrap gap-1 items-center">
                      <FlagBadge value={row.tooFast} />
                      <FlagBadge value={row.tooSlow} />
                      <FlagBadge value={row.appLeftOpen} />
                      <FlagBadge value={row.belowRange} />
                      <FlagBadge value={row.missingGPS} />
                      {row.gap && row.gap !== 'OK' && (
                        <span className="inline-block bg-orange-50 border border-orange-200 text-orange-600 text-xs px-1.5 py-0.5 rounded">
                          {row.gap}
                        </span>
                      )}
                      {row.id && <NotesBubble entityType="survey" entityId={row.id} entityLabel={`${row.name} · ${row.submissionDate ? new Date(row.submissionDate).toLocaleDateString('en-GB') : ''}`} allNotes={notes} onNoteAdded={onNoteAdded} onNoteDeleted={onNoteDeleted} />}
                    </div>
                  </td>
                  {canApprove && (
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
                  )}
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
