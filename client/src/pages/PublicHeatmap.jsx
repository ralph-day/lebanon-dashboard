import { useEffect, useState } from 'react'
import LebanonMap from '../components/LebanonMap'

// Public, shareable heat-map page — no sign-in. Shows aggregated per-location
// survey progress only (served by /api/public/heatmap, strict whitelist).
export default function PublicHeatmap() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/public/heatmap')
      .then(r => { if (!r.ok) throw new Error('Data unavailable'); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
  }, [])

  const pct = data?.totals?.target ? Math.round((data.totals.accepted / data.totals.target) * 100) : 0

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-800">Lebanon Survey Coverage</h1>
            <p className="text-xs text-slate-500">Live field-collection heat map · InflueAnswers</p>
          </div>
          {data && (
            <div className="ml-auto flex gap-6 text-right">
              <Stat label="Locations" value={data.totals.locations} />
              <Stat label="Target" value={data.totals.target.toLocaleString()} />
              <Stat label="Accepted" value={data.totals.accepted.toLocaleString()} accent />
              <Stat label="Progress" value={`${pct}%`} />
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {error && (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-500">
            The map is being refreshed — try again in a minute.
          </div>
        )}
        {!data && !error && (
          <div className="bg-white rounded-xl border border-slate-200 p-10 flex flex-col items-center gap-3 text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600" />
            <p className="text-sm">Loading live coverage…</p>
          </div>
        )}
        {data && <LebanonMap locations={data.locations} publicView />}

        <p className="text-xs text-slate-400 max-w-2xl">
          Aggregated field-collection progress across {data?.totals?.locations || '—'} sampling locations.
          Figures update as surveys are accepted. No individual responses or personal data are shown on this page.
          {data?.fetchedAt && <> Last refresh: {new Date(data.fetchedAt).toLocaleString()}.</>}
        </p>
      </main>
    </div>
  )
}

function Stat({ label, value, accent }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`text-lg font-bold ${accent ? 'text-emerald-600' : 'text-slate-800'}`}>{value}</p>
    </div>
  )
}
