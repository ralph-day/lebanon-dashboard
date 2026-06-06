import { useState, useMemo } from 'react'
import LebanonMap from './LebanonMap'
import NotesBubble from './NotesBubble'

const REGION_ORDER = ['Beirut', 'Mount Lebanon', 'North', 'South', 'Bekaa', 'Akkar']
const GROUP_ORDER  = ['Camps', 'Beirut', 'Aley', 'Chouf', 'Jbeil', 'Kesrwane', 'El Batroun', 'North', 'Saida', 'Rachaya', 'West Beqaa', 'Zahle', 'Akkar']

function ProgressBar({ pct }) {
  const w = Math.min(Math.round((pct || 0) * 100), 100)
  const color = w >= 90 ? 'bg-emerald-500' : w >= 50 ? 'bg-blue-500' : w > 0 ? 'bg-amber-400' : 'bg-slate-200'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${w}%` }} />
      </div>
      <span className="text-xs text-slate-500 w-8 text-right shrink-0">{w}%</span>
    </div>
  )
}

function StatusBadge({ status }) {
  const s = (status || '').replace(/[^\w\s]/g, '').trim()
  const map = {
    'On Track':    'bg-emerald-100 text-emerald-700',
    'In Progress': 'bg-yellow-100 text-yellow-700',
    'Started':     'bg-orange-100 text-orange-700',
    'Not Started': 'bg-slate-100 text-slate-500',
    'Completed':   'bg-blue-100 text-blue-700',
  }
  const cls = Object.entries(map).find(([k]) => s.includes(k))?.[1] || 'bg-slate-100 text-slate-500'
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{s || 'Unknown'}</span>
}

export default function LocationPanel({ locations, notes = [], onNoteAdded, onNoteDeleted }) {
  const [filterRegion, setFilterRegion] = useState('All')
  const [filterType, setFilterType]     = useState('All')
  const [search, setSearch]             = useState('')
  const [showMap, setShowMap]           = useState(false)
  const [expandedDistricts, setExpandedDistricts] = useState(new Set())
  const [sortBy, setSortBy]             = useState('accepted') // accepted | region
  const [sortDir, setSortDir]           = useState('desc')

  const toggleDistrict = (key) => setExpandedDistricts(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  const expandAll = () => setExpandedDistricts(new Set(Object.keys(grouped)))
  const collapseAll = () => setExpandedDistricts(new Set())

  // Filter
  const filtered = locations.filter(l => {
    const q = search.toLowerCase()
    return (filterRegion === 'All' || l.region === filterRegion) &&
           (filterType   === 'All' || l.type   === filterType) &&
           (!q || l.location.toLowerCase().includes(q) || l.district.toLowerCase().includes(q))
  })

  // Group by region → district
  const grouped = useMemo(() => {
    const g = {}
    filtered.forEach(l => {
      const grp = l.group || l.district || 'Other'
      if (!g[grp]) g[grp] = { group: grp, region: l.region || '', locations: [] }
      g[grp].locations.push(l)
    })
    return g
  }, [filtered])

  // Aggregate district-level stats
  const districtRows = useMemo(() => {
    return Object.entries(grouped).map(([key, { group, region, locations }]) => {
      const target   = locations.reduce((s, l) => s + (l.target || 0), 0)
      const accepted = locations.reduce((s, l) => s + (l.accepted || 0), 0)
      const remaining= locations.reduce((s, l) => s + (l.remaining || 0), 0)
      const pct      = target > 0 ? accepted / target : 0
      const hasPalestinian = locations.some(l => l.type === 'Palestinian')
      const groupOrder = GROUP_ORDER.indexOf(group)
      return { key, group, region, locations, target, accepted, remaining, pct, hasPalestinian, groupOrder }
    }).sort((a, b) => {
      if (sortBy === 'accepted') return sortDir === 'desc' ? b.accepted - a.accepted : a.accepted - b.accepted
      return (a.groupOrder - b.groupOrder) || a.group.localeCompare(b.group)
    })
  }, [grouped, sortBy, sortDir])

  const regions = ['All', ...REGION_ORDER.filter(r => locations.some(l => l.region === r))]
  const totalTarget   = filtered.reduce((s, l) => s + (l.target || 0), 0)
  const totalAccepted = filtered.reduce((s, l) => s + (l.accepted || 0), 0)

  return (
    <div className="space-y-4">

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-40" />

        <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          {regions.map(r => <option key={r}>{r}</option>)}
        </select>

        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option>All</option>
          <option>Lebanese</option>
          <option>Palestinian</option>
        </select>

        <button onClick={() => { setSortBy('accepted'); setSortDir(d => d === 'desc' ? 'asc' : 'desc') }}
          className={`text-xs px-3 py-2 rounded-lg border transition-colors ${sortBy === 'accepted' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
          Sort: Completed {sortBy === 'accepted' ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
        </button>

        <button onClick={() => { setSortBy('region'); setSortDir('asc') }}
          className={`text-xs px-3 py-2 rounded-lg border transition-colors ${sortBy === 'region' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
          Sort: Region
        </button>

        <button onClick={() => setShowMap(v => !v)}
          className={`text-xs px-3 py-2 rounded-lg border transition-colors ${showMap ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
          🗺 {showMap ? 'Hide Map' : 'Show Map'}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={expandAll} className="text-xs text-blue-500 hover:underline">Expand all</button>
          <span className="text-slate-300">|</span>
          <button onClick={collapseAll} className="text-xs text-slate-400 hover:underline">Collapse all</button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-3 flex flex-wrap gap-6 text-sm">
        <span className="text-slate-500">Showing: <strong className="text-slate-800">{districtRows.length} districts</strong> · {filtered.length} locations</span>
        <span className="text-slate-500">Target: <strong className="text-slate-800">{totalTarget.toLocaleString()}</strong></span>
        <span className="text-slate-500">Accepted: <strong className="text-emerald-600">{totalAccepted.toLocaleString()}</strong></span>
        <span className="text-slate-500">Remaining: <strong className="text-amber-600">{(totalTarget - totalAccepted).toLocaleString()}</strong></span>
        <span className="text-slate-500">Completion: <strong className="text-blue-600">{totalTarget > 0 ? Math.round(totalAccepted / totalTarget * 100) : 0}%</strong></span>
      </div>

      {/* Map */}
      {showMap && <LebanonMap locations={filtered} />}

      {/* District-grouped table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-13 gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide" style={{gridTemplateColumns:'2fr repeat(4,1fr) 2fr 1fr 1fr'}}>
          <div>District / Location</div>
          <div className="text-center">Target</div>
          <div className="text-center">Accepted</div>
          <div className="text-center">Remaining</div>
          <div className="text-center text-red-400">Rejected</div>
          <div>Progress</div>
          <div className="text-center">Status</div>
        </div>

        {districtRows.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">No locations match your filters</div>
        )}

        {districtRows.map(({ key, group, region, locations, target, accepted, remaining, pct, hasPalestinian }) => {
          const isExpanded = expandedDistricts.has(key)
          const rejected = locations.reduce((s, l) => s + (l.rejected || 0), 0)
          const gridStyle = {gridTemplateColumns:'2fr repeat(4,1fr) 2fr 1fr 1fr'}
          return (
            <div key={key} className="border-b border-slate-100 last:border-0">
              {/* District row */}
              <button onClick={() => toggleDistrict(key)}
                className="w-full grid gap-2 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                style={gridStyle}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-slate-400 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 text-sm">{group}</span>
                      {hasPalestinian && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full shrink-0">Camp</span>}
                    </div>
                    <span className="text-xs text-slate-400">{locations.length} location{locations.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="text-center self-center font-medium text-slate-700">{target}</div>
                <div className="text-center self-center font-semibold text-emerald-600">{accepted}</div>
                <div className="text-center self-center text-slate-500">{remaining}</div>
                <div className="text-center self-center">
                  {rejected > 0 ? <span className="text-sm font-semibold text-red-500">{rejected}</span> : <span className="text-slate-300 text-sm">—</span>}
                </div>
                <div className="self-center"><ProgressBar pct={pct} /></div>
                <div className="self-center text-center">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    pct >= 1 ? 'bg-blue-100 text-blue-700' :
                    pct >= 0.9 ? 'bg-emerald-100 text-emerald-700' :
                    pct >= 0.5 ? 'bg-yellow-100 text-yellow-700' :
                    pct > 0 ? 'bg-orange-100 text-orange-700' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {pct >= 1 ? 'Complete' : pct >= 0.9 ? 'On Track' : pct >= 0.5 ? 'In Progress' : pct > 0 ? 'Started' : 'Not Started'}
                  </span>
                </div>
              </button>

              {/* Sub-locality rows */}
              {isExpanded && (
                <div className="bg-slate-50 border-t border-slate-100">
                  <div className="grid gap-2 px-4 py-1.5 border-b border-slate-200 text-xs text-slate-400 uppercase tracking-wide" style={gridStyle}>
                    <div className="pl-6">Location</div>
                    <div className="text-center">Target</div>
                    <div className="text-center">Accepted</div>
                    <div className="text-center">Remaining</div>
                    <div className="text-center text-red-300">Rejected</div>
                    <div>Progress</div>
                    <div className="text-center">Status</div>
                  </div>
                  {locations.map((loc, i) => {
                    const locRejected = loc.rejected || 0
                    return (
                      <div key={i} className={`grid gap-2 px-4 py-2.5 border-b border-slate-100 last:border-0 hover:bg-white transition-colors ${loc.type === 'Palestinian' ? 'bg-purple-50/30' : ''}`} style={gridStyle}>
                        <div className="pl-6 flex items-center gap-2 min-w-0">
                          <span className="text-sm text-slate-700 truncate">{loc.location}</span>
                          {loc.type === 'Palestinian' && <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full shrink-0">Palestinian</span>}
                          <NotesBubble entityType="location" entityId={loc.code} entityLabel={loc.location} allNotes={notes} onNoteAdded={onNoteAdded} onNoteDeleted={onNoteDeleted} />
                        </div>
                        <div className="text-center text-sm text-slate-600">{loc.target}</div>
                        <div className="text-center text-sm font-medium text-emerald-600">{loc.accepted}</div>
                        <div className="text-center text-sm text-slate-500">{loc.remaining}</div>
                        <div className="text-center text-sm self-center">
                          {locRejected > 0 ? <span className="font-semibold text-red-500">{locRejected}</span> : <span className="text-slate-300">—</span>}
                        </div>
                        <div className="self-center"><ProgressBar pct={loc.pctComplete} /></div>
                        <div className="self-center text-center"><StatusBadge status={loc.status} /></div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <p className="text-xs text-slate-400 flex items-center gap-2 px-1">
        <span className="w-2.5 h-2.5 rounded-full bg-purple-200 inline-block" />
        200 surveys reserved for Palestinian camps: Baddawi, Nahr el Bared, Burj el-Barajne, Shatila
      </p>
    </div>
  )
}
