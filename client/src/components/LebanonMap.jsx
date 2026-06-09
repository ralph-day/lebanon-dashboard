import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

// ── Area → approximate lat/lng center + radius (km) ───────────────────────
const AREA_ZONES = {
  // Arabic
  'بيروت':    { lat: 33.890, lng: 35.502, r: 8 },
  'الضاحية':  { lat: 33.845, lng: 35.508, r: 6 },
  'جنوب':     { lat: 33.200, lng: 35.350, r: 30 },
  'الجنوب':   { lat: 33.200, lng: 35.350, r: 30 },
  'بعلبك':    { lat: 34.004, lng: 36.212, r: 12 },
  'البقاع':   { lat: 33.750, lng: 35.950, r: 35 },
  'النبطية':  { lat: 33.378, lng: 35.484, r: 10 },
  'صيدا':     { lat: 33.563, lng: 35.370, r: 8 },
  'صور':      { lat: 33.272, lng: 35.203, r: 8 },
  'زحلة':     { lat: 33.847, lng: 35.902, r: 10 },
  'طرابلس':   { lat: 34.437, lng: 35.833, r: 10 },
  'عكار':     { lat: 34.550, lng: 36.130, r: 15 },
  'كسروان':   { lat: 33.975, lng: 35.650, r: 12 },
  'المتن':    { lat: 33.880, lng: 35.600, r: 12 },
  'الشوف':    { lat: 33.620, lng: 35.550, r: 15 },
  'عاليه':    { lat: 33.760, lng: 35.600, r: 10 },
  // English
  'Beirut':   { lat: 33.890, lng: 35.502, r: 8 },
  'South':    { lat: 33.200, lng: 35.350, r: 30 },
  'Bekaa':    { lat: 33.750, lng: 35.950, r: 35 },
  'Nabatieh': { lat: 33.378, lng: 35.484, r: 10 },
  'Sidon':    { lat: 33.563, lng: 35.370, r: 8 },
  'Tyre':     { lat: 33.272, lng: 35.203, r: 8 },
  'Baalbek':  { lat: 34.004, lng: 36.212, r: 12 },
  'Zahle':    { lat: 33.847, lng: 35.902, r: 10 },
  'Tripoli':  { lat: 34.437, lng: 35.833, r: 10 },
  'Akkar':    { lat: 34.550, lng: 36.130, r: 15 },
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

// Pulsing red zone overlay for a single affected area
function AlertZone({ zone, label }) {
  const [opacity, setOpacity] = useState(0.35)
  const dir = useRef(1)

  useEffect(() => {
    const id = setInterval(() => {
      setOpacity(o => {
        const next = o + dir.current * 0.03
        if (next >= 0.5) { dir.current = -1; return 0.5 }
        if (next <= 0.15) { dir.current = 1; return 0.15 }
        return next
      })
    }, 80)
    return () => clearInterval(id)
  }, [])

  return (
    <Circle
      center={[zone.lat, zone.lng]}
      radius={zone.r * 1000}
      pathOptions={{
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: opacity,
        weight: 2,
        dashArray: '6 4',
      }}
    >
      <Popup>
        <div style={{ fontWeight: 700, color: '#ef4444', fontSize: 13 }}>
          ⚠️ تنبيه أمني — {label}
        </div>
      </Popup>
    </Circle>
  )
}

export default function LebanonMap({ locations }) {
  const mapped = locations.filter(l => l.lat && l.lng)
  const [activeAlerts, setActiveAlerts] = useState([])

  // Poll active security alerts every 60 seconds
  useEffect(() => {
    const load = () =>
      fetch('/api/security-alerts/active', { credentials: 'include' })
        .then(r => r.json())
        .then(setActiveAlerts)
        .catch(() => {})
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  // Collect unique zones to highlight
  const alertZones = []
  const seen = new Set()
  for (const alert of activeAlerts) {
    for (const area of alert.areas || []) {
      const zone = AREA_ZONES[area]
      if (zone && !seen.has(area)) {
        seen.add(area)
        alertZones.push({ zone, label: area })
      }
    }
  }

  const hasAlerts = alertZones.length > 0

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Security alert banner */}
      {hasAlerts && (
        <div className="px-4 py-2 bg-red-600 text-white text-sm font-semibold flex items-center gap-2 animate-pulse">
          🚨 تنبيه أمني نشط — المناطق المتأثرة:{' '}
          {[...seen].join(' · ')}
        </div>
      )}

      {/* Legend */}
      <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-4">
        <span className="text-sm font-semibold text-slate-700">Survey Locations</span>
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />≥90% done</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />50–89%</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />1–49%</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-slate-400 inline-block" />Not started</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-purple-600 inline-block" />Palestinian camp</span>
          {hasAlerts && (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block opacity-70" />
              Security alert zone
            </span>
          )}
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

        {/* Red pulsing zone overlays for active alerts */}
        {alertZones.map(({ zone, label }) => (
          <AlertZone key={label} zone={zone} label={label} />
        ))}

        {/* Survey location markers */}
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
