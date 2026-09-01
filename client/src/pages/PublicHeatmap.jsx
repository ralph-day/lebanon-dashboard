import { useEffect, useState } from 'react'
import { MapSection, PublicShellHeader } from '../components/AnalysisPanel'

// Public, shareable geographic view — the analysis map alone, no sign-in.
// Indicator chips + bubble map (size = sample, color = mean 1–5).
export default function PublicHeatmap() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/public/analysis')
      .then(r => { if (!r.ok) throw new Error('Data unavailable'); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
  }, [])

  return (
    <div className="min-h-screen bg-slate-50">
      <PublicShellHeader subtitle="Geographic View" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {error && (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-500">
            The map is being refreshed — try again in a minute.
          </div>
        )}
        {!data && !error && (
          <div className="bg-white rounded-xl border border-slate-200 p-10 flex flex-col items-center gap-3 text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600" />
            <p className="text-sm">Loading the geographic view…</p>
          </div>
        )}
        {data && <MapSection respondents={data.respondents} meta={data.meta} mapBoxClass="h-[560px]" />}
        <p className="text-xs text-slate-400 max-w-2xl">
          Aggregated results by sampling location — bubble size reflects sample size, color the mean score (1–5).
          No individual responses or personal data are shown on this page.
        </p>
      </main>
    </div>
  )
}
