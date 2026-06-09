import { useState, useMemo, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
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

function todayLebanonStr() {
  return toLebanonDateStr(new Date().toISOString())
}

export default function MiniMap({ gpsPoints = [] }) {
  useEffect(injectStyle, [])

  const [filterEnum, setFilterEnum] = useState('all')

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

  // Points for display
  const datePoints = useMemo(() =>
    gpsPoints.filter(p => toLebanonDateStr(p.date) === activeDate),
    [gpsPoints, activeDate]
  )

  const visiblePoints = useMemo(() =>
    filterEnum === 'all' ? datePoints : datePoints.filter(p => p.enumerator === filterEnum),
    [datePoints, filterEnum]
  )

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

  const accepted  = visiblePoints.filter(p => p.status === 'accepted').length
  const rejected  = visiblePoints.filter(p => p.status === 'rejected').length
  const tooClose  = visiblePoints.filter(p => p.duplicate).length

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
            onChange={e => setFilterEnum(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-700 bg-white"
          >
            {enumerators.map(e => (
              <option key={e} value={e}>{e === 'all' ? 'All enumerators' : e}</option>
            ))}
          </select>
          {/* Stat chips */}
          <div className="flex gap-1.5 text-xs font-semibold">
            <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full">{accepted} accepted</span>
            <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded-full">{rejected} rejected</span>
            {tooClose > 0 && (
              <span className="bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">⚠ {tooClose} too close</span>
            )}
          </div>
        </div>
      </div>

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
            {visiblePoints.map((p, i) => {
              const isBlink = blinkingIds.has(p.id)
              return (
                <CircleMarker
                  key={p.id || i}
                  center={[p.lat, p.lng]}
                  radius={isBlink ? 9 : p.duplicate ? 7 : 5}
                  pathOptions={{
                    color:       isBlink ? '#3b82f6' : dotColor(p),
                    fillColor:   isBlink ? '#3b82f6' : dotColor(p),
                    fillOpacity: isBlink ? (blinkOn ? 0.95 : 0.1) : 0.85,
                    weight:      isBlink ? 3 : 1,
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
