import { useState, useMemo, useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

// ── CSS injected once for the blinking animation ───────────────────────────
const BLINK_STYLE = `
@keyframes blink-dot {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.15; }
}
.dot-blink { animation: blink-dot 1s ease-in-out infinite; }
`

function injectStyle() {
  if (document.getElementById('map-blink-style')) return
  const el = document.createElement('style')
  el.id = 'map-blink-style'
  el.textContent = BLINK_STYLE
  document.head.appendChild(el)
}

// ── Helpers ────────────────────────────────────────────────────────────────
const STATUS_COLOR = {
  accepted: '#22c55e',
  rejected: '#ef4444',
  pending:  '#f59e0b',
  '':       '#94a3b8',
}

function dotColor(p) {
  if (p.duplicate) return '#f97316'
  return STATUS_COLOR[p.status] || STATUS_COLOR['']
}

function dotLabel(p) {
  if (p.duplicate) return '⚠ Too close to another interview (≤15 m)'
  if (p.status === 'accepted') return '✅ Accepted'
  if (p.status === 'rejected') return '❌ Rejected'
  return '⏳ Pending / Unknown'
}

// Use Lebanon timezone (UTC+3) for all date comparisons
function toDateStr(dateVal) {
  if (!dateVal) return null
  const d = new Date(dateVal)
  if (isNaN(d)) return null
  const lb = new Date(d.getTime() + 3 * 60 * 60 * 1000)
  return lb.toISOString().slice(0, 10)
}

function todayStr() {
  const lb = new Date(Date.now() + 3 * 60 * 60 * 1000)
  return lb.toISOString().slice(0, 10)
}

const LB_OFFSET = 3 * 60 * 60 * 1000
function toLbDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d)) return null
  return new Date(d.getTime() + LB_OFFSET).toISOString().slice(0, 10)
}

// Recompute duplicates within a subset of points only (same-day scope)
const DUP_M = 15
function haversineMp(lat1, lng1, lat2, lng2) {
  const R = 6371000, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}
// Returns Map of id → array of paired point ids (with distance)
function sameScopeDuplicates(points) {
  const ids = new Set()
  const pairs = new Map() // id → [{id, enumerator, date, location, dist}]
  for (let i = 0; i < points.length; i++) {
    for (let j = i+1; j < points.length; j++) {
      const d = haversineMp(points[i].lat, points[i].lng, points[j].lat, points[j].lng)
      if (d <= DUP_M) {
        ids.add(points[i].id); ids.add(points[j].id)
        if (!pairs.has(points[i].id)) pairs.set(points[i].id, [])
        if (!pairs.has(points[j].id)) pairs.set(points[j].id, [])
        pairs.get(points[i].id).push({ ...points[j], dist: Math.round(d) })
        pairs.get(points[j].id).push({ ...points[i], dist: Math.round(d) })
      }
    }
  }
  return { ids, pairs }
}

// ── GPS Audit Table ────────────────────────────────────────────────────────
function AuditTable({ gpsPoints }) {
  const [sortKey,  setSortKey]  = useState('date')
  const [sortDir,  setSortDir]  = useState('desc')
  const [auditDate, setAuditDate] = useState(() => toLbDate(new Date().toISOString()))
  const [search,   setSearch]   = useState('')

  // Find most recent date if today empty
  const availableDate = useMemo(() => {
    const today = toLbDate(new Date().toISOString())
    const hasToday = gpsPoints.some(p => toLbDate(p.date) === today)
    if (hasToday) return today
    const dates = [...new Set(gpsPoints.map(p => toLbDate(p.date)).filter(Boolean))].sort()
    return dates[dates.length - 1] || today
  }, [gpsPoints])

  // Default to most recent date on mount
  useState(() => { setAuditDate(availableDate) })

  const rows = useMemo(() => {
    const q = search.toLowerCase()
    const dayPts = gpsPoints.filter(p => toLbDate(p.date) === auditDate)
    // Same-day flag (for the ⚠ badge)
    const { ids: dupIds } = sameScopeDuplicates(dayPts)

    // Cross-date pairing: for each survey today, find ALL surveys in the full
    // dataset (any date) that are within 15m — so we know if it's a repeat visit
    const allOther = gpsPoints // compare against everything
    return dayPts.map(p => {
      const paired = allOther
        .filter(o => o.id !== p.id)
        .map(o => ({ ...o, dist: Math.round(haversineMp(p.lat, p.lng, o.lat, o.lng)) }))
        .filter(o => o.dist <= DUP_M)
        .sort((a, b) => a.dist - b.dist)
      return { ...p, duplicate: dupIds.has(p.id) || paired.length > 0, pairedWith: paired }
    })
      .filter(p => {
        if (q && !`${p.enumerator} ${p.location} ${p.status}`.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        let va = a[sortKey] ?? ''
        let vb = b[sortKey] ?? ''
        if (sortKey === 'date') { va = a.date || ''; vb = b.date || '' }
        if (sortKey === 'accuracy') { va = a.accuracy ?? 9999; vb = b.accuracy ?? 9999 }
        if (sortKey === 'duplicate') { va = a.duplicate ? 1 : 0; vb = b.duplicate ? 1 : 0 }
        if (va < vb) return sortDir === 'asc' ? -1 : 1
        if (va > vb) return sortDir === 'asc' ? 1 : -1
        return 0
      })
  }, [gpsPoints, auditDate, sortKey, sortDir, search])

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const SortTh = ({ k, label }) => (
    <th onClick={() => toggleSort(k)}
      className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-800 select-none whitespace-nowrap">
      {label} {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  const tooClose = rows.filter(p => p.duplicate).length
  const accepted = rows.filter(p => p.status === 'accepted').length
  const rejected = rows.filter(p => p.status === 'rejected').length

  return (
    <div className="space-y-4">
      {/* Audit controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Audit date</span>
        <input type="date" value={auditDate} onChange={e => setAuditDate(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 bg-white" />
        <input type="text" placeholder="Search enumerator, location…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white w-56" />
        <div className="flex gap-2 ml-auto text-xs font-semibold">
          <span className="bg-green-50 text-green-700 px-2 py-1 rounded-lg">{accepted} accepted</span>
          <span className="bg-red-50 text-red-600 px-2 py-1 rounded-lg">{rejected} rejected</span>
          {tooClose > 0 && <span className="bg-orange-50 text-orange-600 px-2 py-1 rounded-lg">⚠ {tooClose} too close</span>}
          <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">{rows.length} total</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No GPS data for {auditDate}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <SortTh k="enumerator" label="Enumerator" />
                  <SortTh k="location"   label="Location" />
                  <SortTh k="date"       label="Time" />
                  <SortTh k="status"     label="Status" />
                  <SortTh k="accuracy"   label="GPS Accuracy" />
                  <SortTh k="duplicate"  label="Flag" />
                  <th className="py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">Paired with</th>
                  <th className="py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">Coordinates</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((p, i) => {
                  const time = p.date ? new Date(p.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'
                  return (
                    <tr key={p.id || i} className={`text-sm hover:bg-slate-50 transition-colors ${p.duplicate ? 'bg-orange-50/40' : ''}`}>
                      <td className="py-2.5 px-3 font-medium text-slate-800">{p.enumerator || '—'}</td>
                      <td className="py-2.5 px-3 text-slate-600">{p.location || '—'}</td>
                      <td className="py-2.5 px-3 text-slate-500 tabular-nums">{time}</td>
                      <td className="py-2.5 px-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          p.status === 'accepted' ? 'bg-green-100 text-green-700' :
                          p.status === 'rejected' ? 'bg-red-100 text-red-600' :
                          'bg-slate-100 text-slate-500'
                        }`}>{p.status || 'unknown'}</span>
                      </td>
                      <td className={`py-2.5 px-3 tabular-nums text-sm font-medium ${
                        p.accuracy == null ? 'text-slate-400' :
                        p.accuracy <= 5 ? 'text-green-600' :
                        p.accuracy <= 15 ? 'text-amber-600' : 'text-red-500'
                      }`}>
                        {p.accuracy != null ? `±${p.accuracy} m` : '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        {p.duplicate
                          ? <span className="text-xs font-semibold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">⚠ Too close</span>
                          : <span className="text-xs text-slate-300">—</span>
                        }
                      </td>
                      <td className="py-2.5 px-3">
                        {p.pairedWith?.length > 0 ? (
                          <div className="space-y-0.5">
                            {p.pairedWith.map((pw, k) => {
                              const pwDate = toLbDate(pw.date)
                              const pwTime = pw.date ? new Date(pw.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '?'
                              const isSameDay = pwDate === auditDate
                              const dateLabel = isSameDay
                                ? `Today ${pwTime}`
                                : `${pwDate} ${pwTime}`
                              return (
                                <div key={k} className={`text-xs rounded px-1.5 py-0.5 whitespace-nowrap font-medium ${
                                  isSameDay
                                    ? 'text-orange-700 bg-orange-50'
                                    : 'text-red-700 bg-red-50'
                                }`}>
                                  {pw.enumerator?.split('(')[0]?.trim() || '?'} · {dateLabel} · {pw.dist}m away
                                </div>
                              )
                            })}
                          </div>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-400 tabular-nums">
                        {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function MapPanel({ gpsPoints = [] }) {
  useEffect(injectStyle, [])

  const [view, setView] = useState('map') // 'map' | 'audit'

  // Blink toggle — drives opacity via React state instead of CSS class
  const [blinkOn, setBlinkOn] = useState(true)
  useEffect(() => {
    const t = setInterval(() => setBlinkOn(v => !v), 700)
    return () => clearInterval(t)
  }, [])

  // Filters
  const [filterEnum,   setFilterEnum]   = useState('all')
  const [filterLoc,    setFilterLoc]    = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [dupOnly,      setDupOnly]      = useState(false)
  const [dateMode,     setDateMode]     = useState('all')   // 'today' | 'last7' | 'all' | 'custom'
  const [customDate,   setCustomDate]   = useState(todayStr)

  // Blinking: most-recent point per enumerator if within 2 h
  const blinkingIds = useMemo(() => {
    const TWO_HOURS = 2 * 60 * 60 * 1000
    const now = Date.now()
    const latest = {}
    gpsPoints.forEach(p => {
      if (!p.date || !p.enumerator) return
      const t = new Date(p.date).getTime()
      if (!latest[p.enumerator] || t > latest[p.enumerator].t)
        latest[p.enumerator] = { id: p.id, t }
    })
    return new Set(
      Object.values(latest)
        .filter(({ t }) => now - t <= TWO_HOURS)
        .map(({ id }) => id)
    )
  }, [gpsPoints])

  const enumerators = useMemo(() => ['all', ...new Set(gpsPoints.map(p => p.enumerator).filter(Boolean))], [gpsPoints])
  const locations   = useMemo(() => ['all', ...new Set(gpsPoints.map(p => p.location).filter(Boolean))],   [gpsPoints])

  const visible = useMemo(() => {
    const today   = todayStr()
    const last7   = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)

    return gpsPoints.filter(p => {
      if (filterEnum   !== 'all' && p.enumerator !== filterEnum)   return false
      if (filterLoc    !== 'all' && p.location   !== filterLoc)    return false
      if (filterStatus !== 'all' && p.status     !== filterStatus) return false
      if (dupOnly && !p.duplicate) return false

      const ds = toDateStr(p.date)
      if (dateMode === 'today'  && ds !== today)   return false
      if (dateMode === 'last7'  && ds < last7)     return false
      if (dateMode === 'custom' && ds !== customDate) return false

      return true
    })
  }, [gpsPoints, filterEnum, filterLoc, filterStatus, dupOnly, dateMode, customDate])

  const dupCount = useMemo(() => gpsPoints.filter(p => p.duplicate).length, [gpsPoints])

  const CENTER = [33.85, 35.86]
  const ZOOM   = 9

  if (!gpsPoints.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <span className="text-4xl mb-3">🗺</span>
        <p className="font-medium">No GPS data available</p>
        <p className="text-sm mt-1">Upload data with gps-Latitude / gps-Longitude columns</p>
      </div>
    )
  }

  if (view === 'audit') return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-slate-200 pb-0">
        {[['map', '🗺 Map'], ['audit', '📋 GPS Audit']].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${view === v ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>
      <AuditTable gpsPoints={gpsPoints} />
    </div>
  )

  return (
    <div className="space-y-4">

      {/* View switcher */}
      <div className="flex gap-2 border-b border-slate-200 pb-0">
        {[['map', '🗺 Map'], ['audit', '📋 GPS Audit']].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${view === v ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total GPS points', value: gpsPoints.length,                                    color: 'bg-blue-50 text-blue-700'   },
          { label: 'Accepted',         value: gpsPoints.filter(p => p.status === 'accepted').length, color: 'bg-green-50 text-green-700' },
          { label: 'Rejected',         value: gpsPoints.filter(p => p.status === 'rejected').length, color: 'bg-red-50 text-red-700'    },
          { label: 'Duplicate flags',  value: dupCount,                                             color: 'bg-orange-50 text-orange-700'},
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-xl p-3 ${color}`}>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs font-medium mt-0.5 opacity-80">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap gap-3 items-center">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Filters</span>

        {/* Date presets */}
        <div className="flex items-center gap-1">
          {[['all', 'All time'], ['today', 'Today'], ['last7', 'Last 7d']].map(([mode, lbl]) => (
            <button key={mode} onClick={() => setDateMode(mode)}
              className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors border ${
                dateMode === mode
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >{lbl}</button>
          ))}
          <input
            type="date"
            value={customDate}
            onChange={e => { setCustomDate(e.target.value); setDateMode('custom') }}
            className={`text-xs border rounded-lg px-2 py-1.5 text-slate-700 bg-white transition-colors ${
              dateMode === 'custom' ? 'border-blue-400 ring-1 ring-blue-200' : 'border-slate-200'
            }`}
          />
        </div>

        <select value={filterEnum} onChange={e => setFilterEnum(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 bg-white">
          {enumerators.map(e => <option key={e} value={e}>{e === 'all' ? 'All enumerators' : e}</option>)}
        </select>

        <select value={filterLoc} onChange={e => setFilterLoc(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 bg-white">
          {locations.map(l => <option key={l} value={l}>{l === 'all' ? 'All locations' : l}</option>)}
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 bg-white">
          <option value="all">All statuses</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="pending">Pending</option>
          <option value="">Unknown</option>
        </select>

        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" checked={dupOnly} onChange={e => setDupOnly(e.target.checked)}
            className="rounded border-slate-300 accent-orange-500" />
          <span className="font-medium text-orange-600">Duplicates only</span>
          {dupCount > 0 && <span className="bg-orange-100 text-orange-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">{dupCount}</span>}
        </label>

        <span className="ml-auto text-xs text-slate-400">{visible.length} point{visible.length !== 1 ? 's' : ''} shown</span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-600 items-center">
        {[
          { color: '#22c55e', label: 'Accepted' },
          { color: '#ef4444', label: 'Rejected' },
          { color: '#f59e0b', label: 'Pending / Unknown' },
          { color: '#f97316', label: 'Too close to another interview (≤15 m)' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: color }} />
            {label}
          </span>
        ))}
        {blinkingIds.size > 0 && (
          <span className="flex items-center gap-1.5 text-blue-600 font-medium">
            <span className="w-3 h-3 rounded-full inline-block bg-blue-500 animate-pulse" />
            Blue pulsing = latest survey by enumerator (within 2 h)
          </span>
        )}
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-slate-200" style={{ height: 540 }}>
        <MapContainer center={CENTER} zoom={ZOOM} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {visible.map((p, i) => {
            const isBlink = blinkingIds.has(p.id)
            return (
              <CircleMarker
                key={p.id || i}
                center={[p.lat, p.lng]}
                radius={isBlink ? 10 : p.duplicate ? 8 : 6}
                pathOptions={{
                  color:       isBlink ? '#3b82f6' : dotColor(p),
                  fillColor:   isBlink ? '#3b82f6' : dotColor(p),
                  fillOpacity: isBlink ? (blinkOn ? 0.95 : 0.1) : 0.85,
                  weight:      isBlink ? 3 : p.duplicate ? 2 : 1,
                }}
              >
                <Popup>
                  <div className="text-sm space-y-1 min-w-[190px]">
                    <p className="font-semibold text-slate-800">{dotLabel(p)}</p>
                    {isBlink && <p className="text-xs text-blue-600 font-medium">⚡ Latest survey by this enumerator</p>}
                    <hr className="border-slate-200" />
                    {p.enumerator && <p><span className="text-slate-500">Enumerator:</span> {p.enumerator}</p>}
                    {p.location   && <p><span className="text-slate-500">Location:</span> {p.location}</p>}
                    {p.date       && <p><span className="text-slate-500">Date:</span> {new Date(p.date).toLocaleString()}</p>}
                    {p.accuracy != null && <p><span className="text-slate-500">GPS accuracy:</span> {p.accuracy} m</p>}
                    {p.altitude  != null && <p><span className="text-slate-500">Altitude:</span> {p.altitude} m</p>}
                    <p className="text-xs text-slate-400">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</p>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}
        </MapContainer>
      </div>
    </div>
  )
}
