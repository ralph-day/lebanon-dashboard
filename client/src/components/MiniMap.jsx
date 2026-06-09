import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

// Reuse the blink style injection from MapPanel (idempotent)
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

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Compact map of today's surveys, with blinking latest-per-enumerator dots.
 * Intended to be placed in the Overview section beside DailyProgress.
 */
export default function MiniMap({ gpsPoints = [] }) {
  useEffect(injectStyle, [])

  const today = todayStr()
  const TWO_HOURS = 2 * 60 * 60 * 1000
  const now = Date.now()

  // Filter to today's points
  const todayPoints = gpsPoints.filter(p => {
    if (!p.date) return false
    return new Date(p.date).toISOString().slice(0, 10) === today
  })

  // Find latest per enumerator within 2h
  const latestByEnum = {}
  gpsPoints.forEach(p => {
    if (!p.date || !p.enumerator) return
    const t = new Date(p.date).getTime()
    if (!latestByEnum[p.enumerator] || t > latestByEnum[p.enumerator].t)
      latestByEnum[p.enumerator] = { id: p.id, t }
  })
  const blinkingIds = new Set(
    Object.values(latestByEnum)
      .filter(({ t }) => now - t <= TWO_HOURS)
      .map(({ id }) => id)
  )

  const accepted = todayPoints.filter(p => p.status === 'accepted').length
  const rejected = todayPoints.filter(p => p.status === 'rejected').length
  const dups     = todayPoints.filter(p => p.duplicate).length

  const CENTER = [33.85, 35.86]

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Today's Field Map</h3>
          <p className="text-xs text-slate-400 mt-0.5">{todayPoints.length} GPS surveys recorded today</p>
        </div>
        <div className="flex gap-2 text-xs font-semibold">
          <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full">{accepted} ✓</span>
          <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded-full">{rejected} ✗</span>
          {dups > 0 && <span className="bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">{dups} dup</span>}
        </div>
      </div>

      {todayPoints.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-slate-400 py-10">
          <span className="text-3xl mb-2">🗺</span>
          <p className="text-sm">No GPS surveys recorded today</p>
        </div>
      ) : (
        <div style={{ height: 280 }}>
          <MapContainer center={CENTER} zoom={9} zoomControl={false} attributionControl={false}
            style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {todayPoints.map((p, i) => {
              const isBlink = blinkingIds.has(p.id)
              return (
                <CircleMarker
                  key={p.id || i}
                  center={[p.lat, p.lng]}
                  radius={isBlink ? 8 : p.duplicate ? 7 : 5}
                  pathOptions={{
                    color:       dotColor(p),
                    fillColor:   dotColor(p),
                    fillOpacity: 0.85,
                    weight:      isBlink ? 3 : 1,
                    className:   isBlink ? 'dot-blink' : '',
                  }}
                >
                  <Popup>
                    <div className="text-xs space-y-0.5 min-w-[150px]">
                      {isBlink && <p className="text-blue-600 font-semibold">⚡ Latest by {p.enumerator}</p>}
                      {p.enumerator && <p><span className="text-slate-500">By:</span> {p.enumerator}</p>}
                      {p.location   && <p><span className="text-slate-500">Area:</span> {p.location}</p>}
                      {p.date       && <p><span className="text-slate-500">Time:</span> {new Date(p.date).toLocaleTimeString()}</p>}
                      {p.accuracy != null && <p><span className="text-slate-500">Accuracy:</span> {p.accuracy} m</p>}
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
          { color: '#ef4444', label: 'Rejected'  },
          { color: '#f97316', label: 'Duplicate' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: color }} />
            {label}
          </span>
        ))}
        {blinkingIds.size > 0 && (
          <span className="flex items-center gap-1 text-blue-500 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 dot-blink inline-block" />
            Live (blinking)
          </span>
        )}
      </div>
    </div>
  )
}
