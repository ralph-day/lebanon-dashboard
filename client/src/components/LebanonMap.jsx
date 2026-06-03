import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const REGION_COLORS = {
  'Beirut':        '#3b82f6',
  'Mount Lebanon': '#10b981',
  'North':         '#f59e0b',
  'South':         '#ef4444',
  'Bekaa':         '#8b5cf6',
  'Akkar':         '#06b6d4',
}

function markerColor(loc) {
  if (loc.type === 'Palestinian') return '#7c3aed'
  const pct = loc.pctComplete ? loc.pctComplete * 100 : 0
  if (pct >= 90) return '#10b981'
  if (pct >= 50) return '#3b82f6'
  if (pct > 0)   return '#f59e0b'
  return '#94a3b8'
}

function markerRadius(target) {
  if (target >= 70) return 14
  if (target >= 40) return 11
  if (target >= 20) return 8
  return 6
}

// Fit map to markers when filter changes
function FitBounds({ locations }) {
  const map = useMap()
  useEffect(() => {
    const pts = locations.filter(l => l.lat && l.lng).map(l => [l.lat, l.lng])
    if (pts.length > 0) {
      try { map.fitBounds(pts, { padding: [40, 40], maxZoom: 11 }) } catch (_) {}
    }
  }, [locations, map])
  return null
}

export default function LebanonMap({ locations }) {
  const mapped = locations.filter(l => l.lat && l.lng)

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Legend */}
      <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-4">
        <span className="text-sm font-semibold text-slate-700">Survey Locations</span>
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />≥90% done</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />50–89%</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />1–49%</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-slate-400 inline-block" />Not started</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-purple-600 inline-block" />Palestinian camp</span>
        </div>
        <span className="ml-auto text-xs text-slate-400">Circle size = target</span>
      </div>

      <MapContainer
        center={[33.85, 35.85]}
        zoom={8}
        style={{ height: '480px', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds locations={mapped} />
        {mapped.map((loc, i) => {
          const pct = loc.pctComplete ? Math.round(loc.pctComplete * 100) : 0
          const color = markerColor(loc)
          const radius = markerRadius(loc.target)
          return (
            <CircleMarker
              key={i}
              center={[loc.lat, loc.lng]}
              radius={radius}
              pathOptions={{
                fillColor: color,
                fillOpacity: 0.85,
                color: '#fff',
                weight: 1.5,
              }}
            >
              <Popup>
                <div style={{ minWidth: 160 }}>
                  <p style={{ fontWeight: 700, marginBottom: 4, fontSize: 13 }}>{loc.location}</p>
                  <p style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>{loc.region} · {loc.district}</p>
                  {loc.type === 'Palestinian' && (
                    <span style={{ background: '#ede9fe', color: '#7c3aed', fontSize: 10, padding: '2px 6px', borderRadius: 9999, fontWeight: 600 }}>
                      Palestinian Camp
                    </span>
                  )}
                  <table style={{ fontSize: 12, marginTop: 8, width: '100%' }}>
                    <tbody>
                      <tr><td style={{ color: '#94a3b8', paddingRight: 8 }}>Target</td><td style={{ fontWeight: 600 }}>{loc.target}</td></tr>
                      <tr><td style={{ color: '#94a3b8' }}>Accepted</td><td style={{ fontWeight: 600, color: '#10b981' }}>{loc.accepted}</td></tr>
                      <tr><td style={{ color: '#94a3b8' }}>Remaining</td><td style={{ fontWeight: 600, color: '#f59e0b' }}>{loc.remaining}</td></tr>
                      <tr><td style={{ color: '#94a3b8' }}>Progress</td><td style={{ fontWeight: 600, color: color }}>{pct}%</td></tr>
                    </tbody>
                  </table>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>
    </div>
  )
}
