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

// ── Main component ─────────────────────────────────────────────────────────
export default function MapPanel({ gpsPoints = [] }) {
  useEffect(injectStyle, [])

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

  return (
    <div className="space-y-4">

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
