import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

function deadlineStatus(deadlineStr) {
  if (!deadlineStr) return { label: 'TBD', cls: 'bg-slate-100 text-slate-500', daysLeft: null }
  const diff = Math.ceil((new Date(deadlineStr) - Date.now()) / 86400000)
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, cls: 'bg-red-100 text-red-700', daysLeft: diff }
  if (diff === 0) return { label: 'Due today', cls: 'bg-red-100 text-red-700', daysLeft: diff }
  if (diff <= 2) return { label: `${diff}d left`, cls: 'bg-amber-100 text-amber-700', daysLeft: diff }
  return { label: `${diff}d left`, cls: 'bg-emerald-100 text-emerald-700', daysLeft: diff }
}

function ProgressBar({ pct }) {
  const w = Math.min(Math.round(pct || 0), 100)
  const color = w >= 90 ? 'bg-emerald-500' : w >= 50 ? 'bg-blue-500' : w > 0 ? 'bg-amber-400' : 'bg-slate-200'
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 bg-slate-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${w}%` }} />
      </div>
      <span className="text-xs text-slate-500 w-8 text-right shrink-0">{w}%</span>
    </div>
  )
}

export default function EnumeratorProgress({ assignments = [] }) {
  const navigate = useNavigate()
  const [filterEnum, setFilterEnum] = useState('All')
  const [filterLocality, setFilterLocality] = useState('All')
  const [expandedEnum, setExpandedEnum] = useState(null)

  const allLocalities = ['All', ...new Set(assignments.flatMap(a => a.locations.map(l => l.name)))]
  const allEnumerators = ['All', ...assignments.map(a => `${a.name} (${a.code})`)]

  // Filter assignments
  const filtered = assignments
    .filter(a => filterEnum === 'All' || `${a.name} (${a.code})` === filterEnum)
    .map(a => ({
      ...a,
      locations: filterLocality === 'All' ? a.locations : a.locations.filter(l => l.name === filterLocality),
    }))
    .filter(a => a.locations.length > 0)
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return b.isActive - a.isActive
      // sort by earliest deadline
      const da = a.locations[0]?.deadline || '9999'
      const db = b.locations[0]?.deadline || '9999'
      return da.localeCompare(db)
    })

  const formatDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'TBD'

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={filterEnum}
          onChange={e => setFilterEnum(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {allEnumerators.map(e => <option key={e}>{e}</option>)}
        </select>
        <select
          value={filterLocality}
          onChange={e => setFilterLocality(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {allLocalities.map(l => <option key={l}>{l}</option>)}
        </select>
        <span className="text-sm text-slate-400">{filtered.length} enumerator{filtered.length !== 1 ? 's' : ''}</span>
        {(filterEnum !== 'All' || filterLocality !== 'All') && (
          <button onClick={() => { setFilterEnum('All'); setFilterLocality('All') }} className="text-xs text-blue-500 hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {filtered.map(a => {
          const isExpanded = expandedEnum === a.code
          // Earliest deadline across locations
          const deadlines = a.locations.map(l => l.deadline).filter(Boolean).sort()
          const nearestDeadline = deadlines[0] || null
          const dl = deadlineStatus(nearestDeadline)

          return (
            <div
              key={a.code}
              className={`bg-white rounded-xl border transition-all ${a.isActive ? 'border-emerald-300 shadow-sm shadow-emerald-100' : 'border-slate-200'}`}
            >
              {/* Header row */}
              <button
                className="w-full text-left px-5 py-4"
                onClick={() => setExpandedEnum(isExpanded ? null : a.code)}
              >
                <div className="flex items-center gap-3">
                  {/* Active pulse */}
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${a.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'}`} />

                  {/* Name + code */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/enumerator/${a.code}`) }} className="font-semibold text-slate-800 text-sm hover:text-blue-600 transition-colors">{a.name}</button>
                      <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{a.code}</span>
                      {a.isActive && (
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                          Active · +{a.recentCount} last 4h
                        </span>
                      )}
                    {a.todayAccepted > 0 && (
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                          +{a.todayAccepted} today
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{(() => {
                      const districts = [...new Set(a.locations.map(l => l.district).filter(Boolean))]
                      return districts.length ? districts.join(' · ') : a.governorate
                    })()} · {a.locations.length} location{a.locations.length > 1 ? 's' : ''}</p>
                  </div>

                  {/* Completed stat */}
                  <div className="hidden sm:flex flex-col items-center shrink-0 w-16">
                    <span className="text-xl font-bold text-emerald-600">{a.completed}</span>
                    <span className="text-xs text-slate-400">done</span>
                  </div>

                  {/* Target stat */}
                  <div className="hidden sm:flex flex-col items-center shrink-0 w-16">
                    <span className="text-xl font-bold text-slate-700">{a.totalTarget}</span>
                    <span className="text-xs text-slate-400">target</span>
                  </div>

                  {/* Remaining stat */}
                  <div className="hidden sm:flex flex-col items-center shrink-0 w-16">
                    <span className={`text-xl font-bold ${a.remaining > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>{a.remaining}</span>
                    <span className="text-xs text-slate-400">left</span>
                  </div>

                  {/* Progress bar */}
                  <div className="hidden sm:flex flex-col items-end gap-1 w-32 shrink-0">
                    <ProgressBar pct={a.pct} />
                    <span className="text-xs text-slate-500">{a.pct}%</span>
                  </div>

                  {/* Deadline badge */}
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${dl.cls}`}>
                    {nearestDeadline ? formatDate(nearestDeadline) : 'TBD'}
                  </span>

                  {/* Chevron */}
                  <span className="text-slate-400 text-xs shrink-0">{isExpanded ? '▲' : '▼'}</span>
                </div>

                {/* Mobile progress */}
                <div className="sm:hidden mt-2 flex gap-4 items-center">
                  <span className="text-sm font-bold text-emerald-600">{a.completed} done</span>
                  <span className="text-sm text-slate-500">/ {a.totalTarget} target</span>
                  <span className={`text-sm font-bold ${a.remaining > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>{a.remaining} left</span>
                </div>
                <div className="sm:hidden mt-1">
                  <ProgressBar pct={a.pct} />
                </div>
              </button>

              {/* Expanded location breakdown */}
              {isExpanded && (
                <div className="border-t border-slate-100 px-5 pb-4">
                  <table className="w-full text-sm mt-3">
                    <thead>
                      <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                        <th className="pb-2">Location</th>
                        <th className="pb-2">District</th>
                        <th className="pb-2 text-center">Target</th>
                        <th className="pb-2 text-center">Deadline</th>
                        <th className="pb-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {a.locations.map((loc, i) => {
                        const s = deadlineStatus(loc.deadline)
                        return (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="py-2.5 font-medium text-slate-700">{loc.name}</td>
                            <td className="py-2.5 text-slate-500">{loc.district || a.district || '—'}</td>
                            <td className="py-2.5 text-center text-slate-600">{loc.target}</td>
                            <td className="py-2.5 text-center text-slate-600">{formatDate(loc.deadline)}</td>
                            <td className="py-2.5 text-center">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 text-xs font-semibold text-slate-600">
                        <td className="pt-2">Total</td>
                        <td className="pt-2 text-center">{a.totalTarget}</td>
                        <td className="pt-2 text-center">—</td>
                        <td className="pt-2 text-center">{a.remaining} remaining</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">No enumerators match your filters</div>
        )}
      </div>
    </div>
  )
}
