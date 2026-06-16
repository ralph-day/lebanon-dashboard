import { useState, useMemo, useEffect, useRef } from 'react'
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

// ── Rejected surveys subpage ──────────────────────────────────────────────────
function RejectedDetail({ locationName, rows, onBack }) {
  // GTS rejections — match the Rejected count, which comes from GTS_Match_Comment
  const rejected = rows.filter(r => String(r.gtsMatch || '').startsWith('Rejected'))
    .sort((a, b) => new Date(b.submissionDate) - new Date(a.submissionDate))

  const flags = r => [r.tooFast, r.belowRange, r.missingGPS]
    .filter(f => f && f.startsWith('✗'))
    .map(f => f.replace('✗ ', ''))
    .join(' · ') || '—'

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h2 className="text-lg font-semibold text-slate-800">{locationName}</h2>
        <span className="text-xs font-semibold bg-red-100 text-red-600 px-2.5 py-0.5 rounded-full">{rejected.length} rejected</span>
      </div>

      {rejected.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-sm">No rejected surveys found for this location</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 700 }}>
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">Enumerator</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Date</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Duration (min)</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">QA Status</th>
                  <th className="text-left text-xs font-semibold text-red-500 uppercase tracking-wide px-3 py-2.5">Flags / Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rejected.map((r, i) => (
                  <tr key={i} className="hover:bg-red-50/40">
                    <td className="px-4 py-3 font-medium text-slate-800">{r.name || '—'}</td>
                    <td className="px-3 py-3 text-center text-xs text-slate-500">
                      {r.submissionDate ? new Date(r.submissionDate).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-3 py-3 text-center text-slate-600">
                      {r.fullTime ? parseFloat(r.fullTime).toFixed(1) : r.appTime ? parseFloat(r.appTime).toFixed(1) : '—'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        r.qaStatus === '❌ FAIL' ? 'bg-red-100 text-red-700' :
                        r.qaStatus === '⚠️ REVIEW' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>{r.qaStatus || 'Rejected'}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">{flags(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// Inline editable responsible field
function ResponsibleCell({ code, value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(value || '')
  const inputRef              = useRef(null)

  function commit() {
    setEditing(false)
    if (draft !== (value || '')) onSave(draft)
  }

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  if (editing) return (
    <input
      ref={inputRef}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) } }}
      placeholder="e.g. Ahmad Z., Hanan I."
      className="w-full border border-blue-400 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
    />
  )

  return (
    <button onClick={() => { setDraft(value || ''); setEditing(true) }}
      className="text-left w-full text-xs text-slate-600 hover:text-blue-600 hover:underline cursor-pointer leading-tight">
      {value ? value : <span className="text-slate-300 italic">Add names…</span>}
    </button>
  )
}

export default function LocationPanel({ locations, qaRows = [], notes = [], onNoteAdded, onNoteDeleted }) {
  const [filterRegion, setFilterRegion] = useState('All')
  const [filterType, setFilterType]     = useState('All')
  const [search, setSearch]             = useState('')
  const [locationMeta, setLocationMeta] = useState({})
  const [rejectedDetail, setRejectedDetail] = useState(null) // { locationName, rows }

  useEffect(() => {
    fetch('/api/location-meta', { credentials: 'include' })
      .then(r => r.ok ? r.json() : {})
      .then(setLocationMeta)
      .catch(() => {})
  }, [])

  async function saveResponsible(code, responsible) {
    const res = await fetch(`/api/location-meta/${code}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responsible }),
    })
    if (res.ok) {
      setLocationMeta(prev => ({ ...prev, [code]: { ...(prev[code] || {}), responsible } }))
    }
  }
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
  const totalRemaining = filtered.reduce((s, l) => s + (l.remaining || 0), 0)

  // Rejected detail subpage
  if (rejectedDetail) {
    return <RejectedDetail
      locationName={rejectedDetail.locationName}
      rows={rejectedDetail.rows}
      onBack={() => setRejectedDetail(null)}
    />
  }

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
        <span className="text-slate-500">Remaining: <strong className="text-amber-600">{totalRemaining.toLocaleString()}</strong></span>
        <span className="text-slate-500">Completion: <strong className="text-blue-600">{totalTarget > 0 ? Math.round(totalAccepted / totalTarget * 100) : 0}%</strong></span>
      </div>

      {/* Map */}
      {showMap && <LebanonMap locations={filtered} />}

      {/* District-grouped table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="grid gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide" style={{gridTemplateColumns:'2fr repeat(5,1fr) 2fr 1fr 1fr 2fr'}}>
          <div>District / Location</div>
          <div className="text-center">Target</div>
          <div className="text-center">Accepted</div>
          <div className="text-center">Remaining</div>
          <div className="text-center text-red-400">Rejected</div>
          <div className="text-center text-amber-400">Not Available</div>
          <div>Progress</div>
          <div className="text-center">Status</div>
          <div></div>
          <div>Enumerator Responsible</div>
        </div>

        {districtRows.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">No locations match your filters</div>
        )}

        {districtRows.map(({ key, group, region, locations, target, accepted, remaining, pct, hasPalestinian }) => {
          const isExpanded = expandedDistricts.has(key)
          const rejected = locations.reduce((s, l) => s + (l.rejected || 0), 0)
          const notAvailable = locations.reduce((s, l) => s + (l.notAvailable || 0), 0)
          const gridStyle = {gridTemplateColumns:'2fr repeat(5,1fr) 2fr 1fr 1fr 2fr'}
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
                <div className="text-center self-center" onClick={e => { if (rejected > 0) { e.stopPropagation(); const districtRows = qaRows.filter(r => locations.some(l => l.location === r.locationName)); setRejectedDetail({ locationName: group, rows: districtRows }) } }}>
                  {rejected > 0
                    ? <span className="text-sm font-semibold text-red-500 underline decoration-dotted cursor-pointer hover:text-red-700">{rejected}</span>
                    : <span className="text-slate-300 text-sm">—</span>}
                </div>
                <div className="text-center self-center">
                  {notAvailable > 0
                    ? <span className="text-sm font-semibold text-amber-600">{notAvailable}</span>
                    : <span className="text-slate-300 text-sm">—</span>}
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
                <div /><div />
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
                    <div className="text-center text-amber-300">Not Available</div>
                    <div>Progress</div>
                    <div className="text-center">Status</div>
                    <div></div>
                    <div>Enumerator Responsible</div>
                  </div>
                  {locations.map((loc, i) => {
                    const locRejected = loc.rejected || 0
                    const locNotAvailable = loc.notAvailable || 0
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
                        <div className="text-center text-sm self-center"
                          onClick={e => { if (locRejected > 0) { e.stopPropagation(); setRejectedDetail({ locationName: loc.location, rows: qaRows.filter(r => r.locationName === loc.location) }) } }}>
                          {locRejected > 0
                            ? <span className="font-semibold text-red-500 underline decoration-dotted cursor-pointer hover:text-red-700">{locRejected}</span>
                            : <span className="text-slate-300">—</span>}
                        </div>
                        <div className="text-center text-sm self-center">
                          {locNotAvailable > 0
                            ? <span className="font-semibold text-amber-600">{locNotAvailable}</span>
                            : <span className="text-slate-300">—</span>}
                        </div>
                        <div className="self-center"><ProgressBar pct={loc.pctComplete} /></div>
                        <div className="self-center text-center">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            loc.pctComplete >= 1 ? 'bg-blue-100 text-blue-700' :
                            loc.pctComplete >= 0.9 ? 'bg-emerald-100 text-emerald-700' :
                            loc.pctComplete >= 0.5 ? 'bg-yellow-100 text-yellow-700' :
                            loc.pctComplete > 0 ? 'bg-orange-100 text-orange-700' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {loc.pctComplete >= 1 ? 'Complete' : loc.pctComplete >= 0.9 ? 'On Track' : loc.pctComplete >= 0.5 ? 'In Progress' : loc.pctComplete > 0 ? 'Started' : 'Not Started'}
                          </span>
                        </div>
                        <div></div>
                        <div className="self-center">
                          <ResponsibleCell
                            code={loc.code}
                            value={locationMeta[loc.code]?.responsible || ''}
                            onSave={v => saveResponsible(loc.code, v)}
                          />
                        </div>
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
