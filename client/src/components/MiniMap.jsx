import { useState, useMemo, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

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

// Lebanon timezone offset: UTC+3
function toLebanonDateStr(isoStr) {
  if (!isoStr) return null
  const d = new Date(isoStr)
  if (isNaN(d)) return null
  // Shift to Lebanon time (UTC+3) then extract date
  const lb = new Date(d.getTime() + 3 * 60 * 60 * 1000)
  return lb.toISOString().slice(0, 10)
}

// Fly to a point when selectedPoint changes
function FlyToPoint({ point }) {
  const map = useMap()
  useEffect(() => {
    if (point) map.flyTo([point.lat, point.lng], 16, { duration: 1 })
  }, [point])
  return null
}

function todayLebanonStr() {
  return toLebanonDateStr(new Date().toISOString())
}

// Recompute same-day duplicates — only flag if two surveys on the SAME date are ≤15m apart
const DUPLICATE_M = 15
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}
function computeSameDayDuplicates(points) {
  const ids = new Set()
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (haversineM(points[i].lat, points[i].lng, points[j].lat, points[j].lng) <= DUPLICATE_M) {
        ids.add(points[i].id)
        ids.add(points[j].id)
      }
    }
  }
  return ids
}

export default function MiniMap({ gpsPoints = [] }) {
  useEffect(injectStyle, [])

  const [filterEnum,    setFilterEnum]   = useState('all')
  const [filterStatus,  setFilterStatus] = useState('all') // 'all' | 'accepted' | 'rejected'
  const [showTooClose,  setShowTooClose] = useState(false)
  const [selectedPoint, setSelectedPoint] = useState(null)

  // React-driven blink toggle
  const [blinkOn, setBlinkOn] = useState(true)
  useEffect(() => {
    const t = setInterval(() => setBlinkOn(v => !v), 700)
    return () => clearInterval(t)
  }, [])

  const today = todayLebanonStr()
  const TWO_HOURS = 2 * 60 * 60 * 1000
  const now = Date.now()

  // Find the most recent date that has GPS data — fall back if today has none
  const activeDate = useMemo(() => {
    const hasToday = gpsPoints.some(p => toLebanonDateStr(p.date) === today)
    if (hasToday) return today
    // find latest date in dataset
    const dates = gpsPoints
      .map(p => toLebanonDateStr(p.date))
      .filter(Boolean)
      .sort()
    return dates[dates.length - 1] || today
  }, [gpsPoints, today])

  const isToday = activeDate === today

  // Enumerator list from active-date points
  const enumerators = useMemo(() => {
    const names = gpsPoints
      .filter(p => toLebanonDateStr(p.date) === activeDate)
      .map(p => p.enumerator)
      .filter(Boolean)
    return ['all', ...new Set(names)]
  }, [gpsPoints, activeDate])

  // Points for the active date — recompute duplicates within this date only
  const datePoints = useMemo(() => {
    const pts = gpsPoints.filter(p => toLebanonDateStr(p.date) === activeDate)
    const sameDayDupIds = computeSameDayDuplicates(pts)
    // Return points with corrected duplicate flag (same-day only)
    return pts.map(p => ({ ...p, duplicate: sameDayDupIds.has(p.id) }))
  }, [gpsPoints, activeDate])

  const visiblePoints = useMemo(() => {
    let pts = filterEnum === 'all' ? datePoints : datePoints.filter(p => p.enumerator === filterEnum)
    if (filterStatus !== 'all') pts = pts.filter(p => p.status === filterStatus)
    return pts
  }, [datePoints, filterEnum, filterStatus])

  // Blink: most-recent per enumerator within 2 h (across ALL data, not just today)
  const blinkingIds = useMemo(() => {
    const latestByEnum = {}
    gpsPoints.forEach(p => {
      if (!p.date || !p.enumerator) return
      const t = new Date(p.date).getTime()
      if (!latestByEnum[p.enumerator] || t > latestByEnum[p.enumerator].t)
        latestByEnum[p.enumerator] = { id: p.id, t }
    })
    return new Set(
      Object.values(latestByEnum)
        .filter(({ t }) => now - t <= TWO_HOURS)
        .map(({ id }) => id)
    )
  }, [gpsPoints])

  // Counts always reflect the enumerator filter but NOT the status filter (so chips stay visible)
  const basePoints = filterEnum === 'all' ? datePoints : datePoints.filter(p => p.enumerator === filterEnum)
  const accepted  = basePoints.filter(p => p.status === 'accepted').length
  const rejected  = basePoints.filter(p => p.status === 'rejected').length
  const tooClose  = basePoints.filter(p => p.duplicate).length

  const CENTER = [33.85, 35.86]

  const dateLabel = isToday
    ? 'Today'
    : new Date(activeDate + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex flex-wrap items-start justify-between gap-2 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Field Map
            <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${isToday ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
              {dateLabel}
            </span>
            {!isToday && <span className="ml-1 text-xs text-slate-400">(most recent data)</span>}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{visiblePoints.length} GPS surveys</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Enumerator filter */}
          <select
            value={filterEnum}
            onChange={e => { setFilterEnum(e.target.value); setFilterStatus('all') }}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-700 bg-white"
          >
            {enumerators.map(e => (
              <option key={e} value={e}>{e === 'all' ? 'All enumerators' : e}</option>
            ))}
          </select>
          {/* Stat chips */}
          <div className="flex gap-1.5 text-xs font-semibold">
            <button
              onClick={() => setFilterStatus(s => s === 'accepted' ? 'all' : 'accepted')}
              className={`px-2 py-0.5 rounded-full transition-colors border ${
                filterStatus === 'accepted'
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-green-50 text-green-700 border-transparent hover:bg-green-100'
              }`}
            >{accepted} accepted</button>
            <button
              onClick={() => setFilterStatus(s => s === 'rejected' ? 'all' : 'rejected')}
              className={`px-2 py-0.5 rounded-full transition-colors border ${
                filterStatus === 'rejected'
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-red-50 text-red-600 border-transparent hover:bg-red-100'
              }`}
            >{rejected} rejected</button>
            {tooClose > 0 && (
              <button
                onClick={() => setShowTooClose(v => !v)}
                className={`px-2 py-0.5 rounded-full font-semibold text-xs transition-colors border ${
                  showTooClose
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100'
                }`}
              >
                ⚠ {tooClose} too close
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Too-close summary panel */}
      {showTooClose && (
        <div className="border-t border-orange-100 bg-orange-50 px-4 py-3">
          <p className="text-xs font-semibold text-orange-700 mb-2">⚠ Surveys too close to another interview (≤15 m)</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {visiblePoints.filter(p => p.duplicate).map((p, i) => {
              const isSelected = selectedPoint?.id === p.id
              return (
                <div
                  key={p.id || i}
                  onClick={() => { setSelectedPoint(p); setShowTooClose(true) }}
                  className={`rounded-lg px-3 py-2 border text-xs flex items-start justify-between gap-3 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-orange-100 border-orange-400 ring-1 ring-orange-400'
                      : 'bg-white border-orange-100 hover:bg-orange-50'
                  }`}
                >
                  <div>
                    <p className="font-semibold text-slate-800">{p.enumerator || '—'}</p>
                    <p className="text-slate-500">{p.location || '—'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {p.date && <p className="text-slate-400">{new Date(p.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
                    {p.accuracy != null && <p className="text-slate-400">±{p.accuracy} m</p>}
                    <p className="text-orange-500 font-medium mt-0.5">📍 Show on map</p>
                  </div>
                </div>
              )
            })}
            {visiblePoints.filter(p => p.duplicate).length === 0 && (
              <p className="text-xs text-slate-400">No flagged surveys for current filter</p>
            )}
          </div>
        </div>
      )}

      {visiblePoints.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-slate-400 py-10">
          <span className="text-3xl mb-2">🗺</span>
          <p className="text-sm">No GPS surveys found</p>
        </div>
      ) : (
        <div style={{ height: 300 }}>
          <MapContainer center={CENTER} zoom={9} zoomControl={false} attributionControl={false}
            style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FlyToPoint point={selectedPoint} />
            {visiblePoints.map((p, i) => {
              const isBlink    = blinkingIds.has(p.id)
              const isSelected = selectedPoint?.id === p.id
              return (
                <CircleMarker
                  key={p.id || i}
                  center={[p.lat, p.lng]}
                  radius={isSelected ? 11 : isBlink ? 9 : p.duplicate ? 7 : 5}
                  pathOptions={{
                    color:       isSelected ? '#fff' : isBlink ? '#3b82f6' : dotColor(p),
                    fillColor:   isBlink ? '#3b82f6' : dotColor(p),
                    fillOpacity: isBlink ? (blinkOn ? 0.95 : 0.1) : 0.9,
                    weight:      isSelected ? 4 : isBlink ? 3 : 1,
                  }}
                >
                  <Popup>
                    <div className="text-xs space-y-0.5 min-w-[160px]">
                      {isBlink && <p className="text-blue-600 font-semibold">⚡ Latest by {p.enumerator}</p>}
                      {p.duplicate && (
                        <p className="text-orange-600 font-semibold">⚠ Too close to another interview (≤15 m)</p>
                      )}
                      {p.enumerator && <p><span className="text-slate-500">Enumerator:</span> {p.enumerator}</p>}
                      {p.location   && <p><span className="text-slate-500">Area:</span> {p.location}</p>}
                      {p.date       && <p><span className="text-slate-500">Time:</span> {new Date(p.date).toLocaleTimeString()}</p>}
                      {p.accuracy != null && <p><span className="text-slate-500">GPS accuracy:</span> {p.accuracy} m</p>}
                    </div>
                  </Popup>
                </CircleMarker>
              )
            })}
          </MapContainer>
        </div>
      )}

      {/* Legend */}
      <div className="px-4 py-2 border-t border-slate-100 flex flex-wrap gap-3 text-xs text-slate-500 shrink-0">
        {[
          { color: '#22c55e', label: 'Accepted' },
          { color: '#ef4444', label: 'Rejected' },
          { color: '#f97316', label: 'Too close to another interview (≤15 m)' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: color }} />
            {label}
          </span>
        ))}
        {blinkingIds.size > 0 && (
          <span className="flex items-center gap-1 text-blue-500 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse inline-block" />
            Blue pulsing = live (within last 2 h)
          </span>
        )}
      </div>
    </div>
  )
}
