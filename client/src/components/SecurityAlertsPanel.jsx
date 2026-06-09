import { useEffect, useState, useMemo } from 'react'

const SOURCE_LABEL = {
  mtvlebanonews: 'MTV Lebanon',
  bintjbeilnews: 'Bint Jbeil',
}

const ALL_AREAS = [
  'بيروت','الضاحية','جنوب','الجنوب','بعلبك','البقاع','النبطية',
  'صيدا','صور','زحلة','طرابلس','عكار','كسروان','المتن','الشوف','عاليه',
  'Beirut','South','Bekaa','Nabatieh','Sidon','Tyre','Baalbek','Zahle','Tripoli','Akkar',
]

function timeAgo(ms) {
  const diff = Date.now() - ms
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  return `${d}d ago`
}

function fmtDate(ms) {
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function countdown(expiresAt) {
  const ms = expiresAt - Date.now()
  if (ms <= 0) return null
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

function AlertCard({ alert }) {
  const [cd, setCd] = useState(() => countdown(alert.expiresAt))
  const isActive = alert.expiresAt && Date.now() < alert.expiresAt

  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => setCd(countdown(alert.expiresAt)), 1000)
    return () => clearInterval(id)
  }, [alert.expiresAt, isActive])

  return (
    <div className={`rounded-xl border p-4 ${isActive ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-white'}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {isActive && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white animate-pulse">
              🔴 ACTIVE
            </span>
          )}
          <span className="text-xs text-slate-400 font-medium">
            {SOURCE_LABEL[alert.source] || alert.source}
          </span>
          <span className="text-xs text-slate-300">·</span>
          <span className="text-xs text-slate-400">{fmtDate(alert.triggeredAt)} · {timeAgo(alert.triggeredAt)}</span>
          {alert.backfilled && (
            <span className="text-xs text-slate-300 italic">backfilled</span>
          )}
        </div>
        {isActive && cd && (
          <span className="text-xs font-mono text-red-500 font-semibold shrink-0">
            {cd} left
          </span>
        )}
      </div>

      <p className="text-sm font-semibold text-slate-800 leading-snug mb-3" dir="rtl">
        {alert.title}
      </p>

      {alert.areas?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {alert.areas.map(a => (
            <span key={a} className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
              📍 {a}
            </span>
          ))}
        </div>
      )}

      {alert.keywords?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {alert.keywords.map(k => (
            <span key={k} className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-500">
              {k}
            </span>
          ))}
        </div>
      )}

      {alert.link && (
        <a href={alert.link} target="_blank" rel="noreferrer"
           className="mt-3 inline-block text-xs text-blue-500 hover:underline">
          View on Telegram →
        </a>
      )}
    </div>
  )
}

export default function SecurityAlertsPanel() {
  const [active,   setActive]   = useState([])
  const [history,  setHistory]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillDone, setBackfillDone] = useState(false)

  // Filters
  const [filterSource, setFilterSource] = useState('all')
  const [filterArea,   setFilterArea]   = useState('all')
  const [filterFrom,   setFilterFrom]   = useState('')
  const [filterTo,     setFilterTo]     = useState('')
  const [search,       setSearch]       = useState('')

  const load = () => {
    Promise.all([
      fetch('/api/security-alerts/active',  { credentials: 'include' }).then(r => r.json()),
      fetch('/api/security-alerts/history', { credentials: 'include' }).then(r => r.json()),
    ]).then(([a, h]) => {
      setActive(a)
      setHistory(h)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [])

  const triggerBackfill = async () => {
    setBackfilling(true)
    await fetch('/api/security-alerts/backfill', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ since: '2026-05-20' }),
    })
    // Poll until history grows
    let attempts = 0
    const poll = setInterval(() => {
      fetch('/api/security-alerts/history', { credentials: 'include' })
        .then(r => r.json())
        .then(h => {
          setHistory(h)
          attempts++
          if (h.some(a => a.backfilled) || attempts > 40) {
            clearInterval(poll)
            setBackfilling(false)
            setBackfillDone(true)
          }
        })
    }, 3000)
  }

  // Apply filters
  const filtered = useMemo(() => {
    return history.filter(a => {
      if (filterSource !== 'all' && a.source !== filterSource) return false
      if (filterArea   !== 'all' && !a.areas?.includes(filterArea)) return false
      if (filterFrom && a.triggeredAt < new Date(filterFrom).getTime()) return false
      if (filterTo   && a.triggeredAt > new Date(filterTo).getTime() + 86400000) return false
      if (search && !a.title.includes(search) && !a.keywords?.some(k => k.includes(search))) return false
      return true
    })
  }, [history, filterSource, filterArea, filterFrom, filterTo, search])

  const hasActiveAlerts = active.length > 0
  const hasFilters = filterSource !== 'all' || filterArea !== 'all' || filterFrom || filterTo || search

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Security Alerts</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Monitoring MTV Lebanon · Bint Jbeil — every 3 minutes
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!backfillDone && !history.some(a => a.backfilled) && (
            <button onClick={triggerBackfill} disabled={backfilling}
              className="text-xs bg-slate-800 text-white rounded-lg px-3 py-1.5 font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors">
              {backfilling ? '⏳ Fetching history...' : '📥 Load history since May 20'}
            </button>
          )}
          {(backfillDone || history.some(a => a.backfilled)) && (
            <span className="text-xs text-emerald-600 font-medium">✅ History loaded</span>
          )}
          <button onClick={load}
            className="text-xs text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Active alert banner */}
      {hasActiveAlerts && (
        <div className="rounded-xl bg-red-600 text-white p-4 flex items-center gap-3">
          <span className="text-2xl animate-bounce">🚨</span>
          <div>
            <p className="font-bold text-sm">
              {active.length} active evacuation {active.length === 1 ? 'alert' : 'alerts'}
            </p>
            <p className="text-xs opacity-85 mt-0.5">
              Affected areas: {[...new Set(active.flatMap(a => a.areas))].join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* Stats row */}
      {history.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-100 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-slate-800">{history.length}</p>
            <p className="text-xs text-slate-400 mt-1">Total incidents</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{active.length}</p>
            <p className="text-xs text-slate-400 mt-1">Active now</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-slate-800">
              {[...new Set(history.flatMap(a => a.areas))].length}
            </p>
            <p className="text-xs text-slate-400 mt-1">Areas affected</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <input
            type="text" placeholder="Search headlines or keywords..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-48 text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          {/* Source */}
          <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none">
            <option value="all">All sources</option>
            <option value="mtvlebanonews">MTV Lebanon</option>
            <option value="bintjbeilnews">Bint Jbeil</option>
          </select>
          {/* Area */}
          <select value={filterArea} onChange={e => setFilterArea(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none">
            <option value="all">All areas</option>
            {ALL_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">From</label>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">To</label>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none" />
          </div>
          {hasFilters && (
            <button onClick={() => { setFilterSource('all'); setFilterArea('all'); setFilterFrom(''); setFilterTo(''); setSearch('') }}
              className="text-xs text-red-500 hover:text-red-700">
              ✕ Clear filters
            </button>
          )}
          <span className="text-xs text-slate-400 ml-auto">
            {filtered.length} of {history.length} incidents
          </span>
        </div>
      </div>

      {/* No alerts */}
      {!loading && history.length === 0 && (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-10 text-center">
          <p className="text-3xl mb-3">✅</p>
          <p className="font-semibold text-slate-700">No security alerts recorded</p>
          <p className="text-sm text-slate-400 mt-1">Use "Load history since May 20" to backfill past incidents</p>
        </div>
      )}

      {!loading && history.length > 0 && filtered.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">No alerts match your filters</div>
      )}

      {loading && (
        <div className="text-center py-12 text-slate-400 text-sm">Loading...</div>
      )}

      {/* Alert list */}
      <div className="space-y-3">
        {filtered.map((alert, i) => (
          <AlertCard key={(alert._id || alert.link) + i} alert={alert} />
        ))}
      </div>

      {/* Monitoring status */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Monitoring Channels</p>
        <div className="flex flex-wrap gap-2">
          {[
            { name: 'MTV Lebanon', handle: '@mtvlebanonews', color: 'bg-blue-50 text-blue-700 border-blue-100' },
            { name: 'Bint Jbeil',  handle: '@bintjbeilnews', color: 'bg-amber-50 text-amber-700 border-amber-100' },
          ].map(ch => (
            <div key={ch.handle} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${ch.color}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
              {ch.name}
              <span className="opacity-50 font-normal">{ch.handle}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
