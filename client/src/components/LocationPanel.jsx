import { useState } from 'react'
import LebanonMap from './LebanonMap'

const REGION_ORDER = ['Beirut', 'Mount Lebanon', 'North', 'South', 'Bekaa', 'Akkar']

const STATUS_STYLE = {
  'On Track':   'bg-emerald-100 text-emerald-700',
  'In Progress':'bg-yellow-100 text-yellow-700',
  'Started':    'bg-orange-100 text-orange-700',
  'Not Started':'bg-slate-100 text-slate-500',
  'Completed':  'bg-blue-100 text-blue-700',
}

function getStatusLabel(status) {
  if (!status) return 'Not Started'
  return status.replace(/[^\w\s]/g, '').trim() || 'Not Started'
}

function ProgressBar({ pct }) {
  const w = Math.min(Math.round((pct || 0) * 100), 100)
  const color = w >= 90 ? 'bg-emerald-500' : w >= 50 ? 'bg-blue-500' : w > 0 ? 'bg-amber-400' : 'bg-slate-200'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${w}%` }} />
      </div>
      <span className="text-xs text-slate-500 w-8 text-right">{w}%</span>
    </div>
  )
}

function TypeBadge({ type }) {
  if (type === 'Palestinian') {
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Palestinian Camp</span>
  }
  return null
}

export default function LocationPanel({ locations }) {
  const [search, setSearch] = useState('')
  const [filterRegion, setFilterRegion] = useState('All')
  const [filterDistrict, setFilterDistrict] = useState('All')
  const [filterType, setFilterType] = useState('All')
  const [sortBy, setSortBy] = useState('accepted')
  const [sortDir, setSortDir] = useState('desc')
  const [showMap, setShowMap] = useState(true)

  // Get unique regions in defined order
  const presentRegions = REGION_ORDER.filter(r => locations.some(l => l.region === r))
  const regions = ['All', ...presentRegions]

  // Get districts for the selected region
  const presentDistricts = [...new Set(
    locations
      .filter(l => filterRegion === 'All' || l.region === filterRegion)
      .map(l => l.district)
      .filter(Boolean)
  )].sort()
  const districts = ['All', ...presentDistricts]

  const filtered = locations
    .filter(l => {
      const q = search.toLowerCase()
      const matchSearch = !q || l.location.toLowerCase().includes(q) || l.district.toLowerCase().includes(q)
      const matchRegion = filterRegion === 'All' || l.region === filterRegion
      const matchDistrict = filterDistrict === 'All' || l.district === filterDistrict
      const matchType = filterType === 'All' || l.type === filterType
      return matchSearch && matchRegion && matchDistrict && matchType
    })
    .sort((a, b) => {
      let av, bv
      if (sortBy === 'region') {
        av = (REGION_ORDER.indexOf(a.region) * 1000) + a.location
        bv = (REGION_ORDER.indexOf(b.region) * 1000) + b.location
        return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
      }
      av = a[sortBy] ?? 0
      bv = b[sortBy] ?? 0
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir(col === 'pctComplete' ? 'desc' : 'asc') }
  }

  const th = (label, col) => (
    <th
      className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5 cursor-pointer hover:text-slate-700 whitespace-nowrap select-none"
      onClick={() => toggleSort(col)}
    >
      {label}{sortBy === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )

  // Summary stats
  const totalTarget = filtered.reduce((s, l) => s + l.target, 0)
  const totalAccepted = filtered.reduce((s, l) => s + l.accepted, 0)
  const palestinianCount = filtered.filter(l => l.type === 'Palestinian').length
  const lebaneseCount = filtered.filter(l => l.type === 'Lebanese').length

  // When sorting by accepted, flatten to single "All" group; otherwise group by region
  const isSortingByCompletion = sortBy === 'accepted' || sortBy === 'pctComplete'
  const grouped = {}
  if (isSortingByCompletion) {
    grouped['All Regions'] = filtered
  } else {
    filtered.forEach(l => {
      if (!grouped[l.region]) grouped[l.region] = []
      grouped[l.region].push(l)
    })
  }
  const orderedRegions = isSortingByCompletion
    ? ['All Regions']
    : REGION_ORDER.filter(r => grouped[r])

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search location…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
        />
        <select
          value={filterRegion}
          onChange={e => { setFilterRegion(e.target.value); setFilterDistrict('All') }}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {regions.map(r => <option key={r}>{r}</option>)}
        </select>

        <select
          value={filterDistrict}
          onChange={e => setFilterDistrict(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {districts.map(d => <option key={d}>{d}</option>)}
        </select>

        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option>All</option>
          <option>Lebanese</option>
          <option>Palestinian</option>
        </select>

        {/* Sort by completion toggle */}
        <button
          onClick={() => {
            if (sortBy === 'accepted') {
              setSortDir(d => d === 'desc' ? 'asc' : 'desc')
            } else {
              setSortBy('accepted')
              setSortDir('desc')
            }
          }}
          className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors ${
            sortBy === 'accepted'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Sort: Completed {sortBy === 'accepted' ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
        </button>

        {/* Map toggle */}
        <button
          onClick={() => setShowMap(v => !v)}
          className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors ${
            showMap ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          🗺 {showMap ? 'Hide Map' : 'Show Map'}
        </button>

        <div className="flex items-center gap-3 text-xs text-slate-500 ml-1">
          <span className="font-medium text-slate-700">{filtered.length} locations</span>
          {lebaneseCount > 0 && <span>{lebaneseCount} Lebanese</span>}
          {palestinianCount > 0 && <span className="text-purple-600">{palestinianCount} Palestinian camps</span>}
        </div>
      </div>

      {/* Map */}
      {showMap && <LebanonMap locations={filtered} />}

      {/* Summary bar */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-3 flex flex-wrap gap-6 text-sm">
        <div><span className="text-slate-500">Showing target:</span> <span className="font-semibold text-slate-800">{totalTarget.toLocaleString()}</span></div>
        <div><span className="text-slate-500">Accepted:</span> <span className="font-semibold text-emerald-600">{totalAccepted.toLocaleString()}</span></div>
        <div><span className="text-slate-500">Remaining:</span> <span className="font-semibold text-amber-600">{(totalTarget - totalAccepted).toLocaleString()}</span></div>
        <div><span className="text-slate-500">Completion:</span> <span className="font-semibold text-blue-600">{totalTarget > 0 ? Math.round(totalAccepted / totalTarget * 100) : 0}%</span></div>
      </div>

      {/* Table — grouped by region */}
      {orderedRegions.map(region => (
        <div key={region} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Region header */}
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-700">
              {region === 'All Regions' ? 'All Locations — sorted by completion' : region}
            </span>
            <span className="text-xs text-slate-400">{grouped[region].length} locations</span>
            {region !== 'All Regions' && grouped[region].some(l => l.type === 'Palestinian') && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-600">
                incl. Palestinian camps
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100">
                <tr>
                  {th('Location', 'location')}
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2 whitespace-nowrap">District</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2 whitespace-nowrap">Nationality</th>
                  {th('Target', 'target')}
                  {th('Accepted', 'accepted')}
                  {th('Remaining', 'remaining')}
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2">Progress</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2">Status</th>
                  {th('Men', 'men')}
                  {th('Women', 'women')}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {grouped[region].map((loc, i) => {
                  const label = getStatusLabel(loc.status)
                  const statusClass = Object.entries(STATUS_STYLE).find(([k]) => label.includes(k))?.[1] || 'bg-slate-100 text-slate-500'
                  const isPalestinian = loc.type === 'Palestinian'
                  return (
                    <tr key={i} className={`hover:bg-slate-50 transition-colors ${isPalestinian ? 'bg-purple-50/30' : ''}`}>
                      <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                        {loc.location}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 text-xs">{loc.district}</td>
                      <td className="px-3 py-2.5">
                        {isPalestinian
                          ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Palestinian</span>
                          : <span className="text-xs text-slate-400">Lebanese</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 text-center">{loc.target}</td>
                      <td className="px-3 py-2.5 text-emerald-600 font-medium text-center">{loc.accepted}</td>
                      <td className="px-3 py-2.5 text-slate-500 text-center">{loc.remaining}</td>
                      <td className="px-3 py-2.5 min-w-28"><ProgressBar pct={loc.pctComplete} /></td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusClass}`}>{label}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-blue-600">{loc.men || '—'}</td>
                      <td className="px-3 py-2.5 text-center text-pink-500">{loc.women || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-sm">No locations match your filters</div>
      )}

      {/* Palestinian camp legend */}
      <div className="text-xs text-slate-400 flex items-center gap-2 px-1">
        <span className="w-2.5 h-2.5 rounded-full bg-purple-200 inline-block" />
        200 surveys reserved for Palestinian camps: Baddawi, Nahr el Bared, Burj el-Barajne, Shatila
      </div>
    </div>
  )
}
