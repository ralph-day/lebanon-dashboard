import { useState, useMemo } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const STATUS_COLOR = {
  accepted:  '#22c55e',   // green
  rejected:  '#ef4444',   // red
  pending:   '#f59e0b',   // amber
  '':        '#94a3b8',   // slate (unknown)
}

function dotColor(point) {
  if (point.duplicate) return '#f97316'        // orange — duplicate household
  return STATUS_COLOR[point.status] || STATUS_COLOR['']
}

function dotLabel(point) {
  if (point.duplicate) return '⚠ Duplicate household'
  if (point.status === 'accepted') return '✅ Accepted'
  if (point.status === 'rejected') return '❌ Rejected'
  return '⏳ Pending / Unknown'
}

export default function MapPanel({ gpsPoints = [] }) {
  const [filterEnum,   setFilterEnum]   = useState('all')
  const [filterLoc,    setFilterLoc]    = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [dupOnly,      setDupOnly]      = useState(false)

  const enumerators = useMemo(() => ['all', ...new Set(gpsPoints.map(p => p.enumerator).filter(Boolean))], [gpsPoints])
  const locations   = useMemo(() => ['all', ...new Set(gpsPoints.map(p => p.location).filter(Boolean))],   [gpsPoints])

  const visible = useMemo(() => gpsPoints.filter(p => {
    if (filterEnum   !== 'all' && p.enumerator !== filterEnum)   return false
    if (filterLoc    !== 'all' && p.location   !== filterLoc)    return false
    if (filterStatus !== 'all' && p.status     !== filterStatus) return false
    if (dupOnly && !p.duplicate) return false
    return true
  }), [gpsPoints, filterEnum, filterLoc, filterStatus, dupOnly])

  const dupCount = useMemo(() => gpsPoints.filter(p => p.duplicate).length, [gpsPoints])

  // Lebanon centre
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
          { label: 'Total GPS points', value: gpsPoints.length, color: 'bg-blue-50 text-blue-700' },
          { label: 'Accepted',         value: gpsPoints.filter(p => p.status === 'accepted').length, color: 'bg-green-50 text-green-700' },
          { label: 'Rejected',         value: gpsPoints.filter(p => p.status === 'rejected').length, color: 'bg-red-50 text-red-700' },
          { label: 'Duplicate flags',  value: dupCount,         color: 'bg-orange-50 text-orange-700' },
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
      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
        {[
          { color: '#22c55e', label: 'Accepted' },
          { color: '#ef4444', label: 'Rejected' },
          { color: '#f59e0b', label: 'Pending / Unknown' },
          { color: '#f97316', label: 'Duplicate household (≤15 m)' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-slate-200" style={{ height: 520 }}>
        <MapContainer center={CENTER} zoom={ZOOM} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {visible.map((p, i) => (
            <CircleMarker
              key={p.id || i}
              center={[p.lat, p.lng]}
              radius={p.duplicate ? 8 : 6}
              pathOptions={{
                color: dotColor(p),
                fillColor: dotColor(p),
                fillOpacity: 0.85,
                weight: p.duplicate ? 2 : 1,
              }}
            >
              <Popup>
                <div className="text-sm space-y-1 min-w-[180px]">
                  <p className="font-semibold text-slate-800">{dotLabel(p)}</p>
                  <hr className="border-slate-200" />
                  {p.enumerator && <p><span className="text-slate-500">Enumerator:</span> {p.enumerator}</p>}
                  {p.location   && <p><span className="text-slate-500">Location:</span> {p.location}</p>}
                  {p.date       && <p><span className="text-slate-500">Date:</span> {new Date(p.date).toLocaleDateString()}</p>}
                  {p.accuracy != null && <p><span className="text-slate-500">GPS accuracy:</span> {p.accuracy} m</p>}
                  {p.altitude  != null && <p><span className="text-slate-500">Altitude:</span> {p.altitude} m</p>}
                  <p className="text-xs text-slate-400">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</p>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  )
}
