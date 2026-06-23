import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const PALETTE = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d']
const SECTION_ORDER = ['Demographics', 'Priorities & Coping', 'Community & Aid', 'Trust', 'Information', 'Future Outlook']
const SMALL_N = 20 // warn when a disaggregated cell is below this

const prettify = s => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()

// Build CSV text from chart rows (first column = category name, then one column
// per breakdown series) and trigger a download.
const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
function downloadCsv(filename, rows, series) {
  const head = ['Category', ...series]
  const lines = [head.map(csvCell).join(',')]
  rows.forEach(r => lines.push([r.name, ...series.map(s => r[s])].map(csvCell).join(',')))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${filename.replace(/[^\w\- ]+/g, '').trim() || 'chart'}.csv`
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}

const SENT_COLOR = { positive: 'bg-emerald-100 text-emerald-700', neutral: 'bg-slate-100 text-slate-600', negative: 'bg-red-100 text-red-700', mixed: 'bg-amber-100 text-amber-700' }

// Map a 1–5 mean to a red→amber→green fill.
function scaleColor(v) {
  const t = Math.max(0, Math.min(1, (v - 1) / 4))
  const hue = t * 120 // 0=red, 120=green
  return `hsl(${hue}, 70%, 45%)`
}

// Graduated-symbol map: one bubble per location, colored by an indicator's mean
// (1–5) and sized by respondent count, at each location's GPS centroid.
function MapSection({ respondents, meta }) {
  const metricOpts = useMemo(() => [
    ...meta.likert.map(l => ({ col: l.key, label: l.label })),
    ...meta.trust.actors.map(a => ({ col: a.col, label: `Trust: ${a.label}` })),
    ...meta.gap.dims.map(g => ({ col: `perception_${g.suffix}`, label: `Experienced: ${g.label}` })),
  ], [meta])
  const [metric, setMetric] = useState(metricOpts[0]?.col)

  const locs = useMemo(() => {
    const m = {}
    respondents.forEach(r => {
      const L = r.d.loc
      if (!L || r.d.lat == null || r.d.lng == null) return
      const o = (m[L] = m[L] || { lat: 0, lng: 0, c: 0, vals: [] })
      o.lat += r.d.lat; o.lng += r.d.lng; o.c++
      const v = r.v[metric]; if (typeof v === 'number') o.vals.push(v)
    })
    return Object.entries(m).map(([loc, o]) => ({
      loc, lat: o.lat / o.c, lng: o.lng / o.c, n: o.vals.length,
      mean: o.vals.length ? o.vals.reduce((a, b) => a + b, 0) / o.vals.length : null,
    })).filter(x => x.mean != null && Number.isFinite(x.lat) && Number.isFinite(x.lng))
  }, [respondents, metric])

  const maxN = Math.max(1, ...locs.map(l => l.n))
  const radius = n => 6 + Math.sqrt(n / maxN) * 20

  return (
    <section>
      <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
        <span className="w-1.5 h-4 bg-blue-600 rounded-full inline-block" /> Geographic view
      </h3>
      <div className="print-card bg-white rounded-xl border border-slate-100 p-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <label className="text-xs text-slate-500 no-print">Metric</label>
          <select value={metric} onChange={e => setMetric(e.target.value)}
            className="no-print text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 max-w-full">
            {metricOpts.map(o => <option key={o.col} value={o.col}>{o.label}</option>)}
          </select>
          <span className="text-xs text-slate-400 ml-auto">{locs.length} locations · bubble size = sample, color = mean (1–5)</span>
        </div>
        <div className="h-96 rounded-lg overflow-hidden">
          <MapContainer center={[33.85, 35.9]} zoom={8} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
            <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {locs.map(l => (
              <CircleMarker key={l.loc} center={[l.lat, l.lng]} radius={radius(l.n)}
                pathOptions={{ color: scaleColor(l.mean), fillColor: scaleColor(l.mean), fillOpacity: 0.7, weight: 1 }}>
                <Popup>
                  <div className="text-xs">
                    <p className="font-semibold">{l.loc}</p>
                    <p>Mean: {l.mean.toFixed(2)} / 5</p>
                    <p>n = {l.n}</p>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
          <span>Low (1)</span>
          <div className="h-2 flex-1 rounded-full" style={{ background: 'linear-gradient(to right, hsl(0,70%,45%), hsl(60,70%,45%), hsl(120,70%,45%))' }} />
          <span>High (5)</span>
        </div>
      </div>
    </section>
  )
}

// Raw browser: read every answer to an open-text question verbatim, in the
// language it was written. No AI — just the responses.
function ResponsesBrowser({ fields }) {
  const [field, setField] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [cache, setCache] = useState({})

  if (!fields || !fields.length) return null

  const load = (f) => {
    setField(f); setError(null)
    if (!f || cache[f]) return
    setLoading(true)
    fetch(`/api/analysis/responses?field=${encodeURIComponent(f)}`, { credentials: 'include' })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed to load'); return d })
      .then(d => setCache(c => ({ ...c, [f]: d })))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  const result = field && cache[field]

  return (
    <section>
      <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
        <span className="w-1.5 h-4 bg-slate-400 rounded-full inline-block" /> All open-text responses (original language)
      </h3>
      <div className="print-card bg-white rounded-xl border border-slate-100 p-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <label className="text-xs text-slate-500 no-print">Question</label>
          <select value={field} onChange={e => load(e.target.value)}
            className="no-print text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 max-w-full">
            <option value="">— Select a question —</option>
            {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          {result && <span className="text-xs text-slate-400 ml-auto">{result.n} responses</span>}
        </div>

        {loading && <p className="text-sm text-slate-400 py-6 text-center">Loading responses…</p>}
        {error && <p className="text-sm text-red-600 py-3">{error}</p>}
        {!field && !loading && <p className="text-sm text-slate-400 py-3">Pick a question to read every answer verbatim.</p>}

        {result && !loading && (
          <div className="max-h-[28rem] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
            {result.responses.map((r, i) => (
              <div key={i} className="px-3 py-2 text-xs">
                <p className="text-slate-800 whitespace-pre-wrap" dir="auto">{r.text}</p>
                {(r.location || r.nationality) && (
                  <p className="text-slate-400 mt-0.5">{[r.location, r.nationality].filter(Boolean).join(' · ')}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// Qualitative (Claude) analysis of one open-text field. Self-contained: fetches
// on demand (the API call can take ~30–90s), caches per field in local state.
function QualitativeSection({ fields }) {
  const [active, setActive] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [cache, setCache] = useState({}) // field -> result

  if (!fields || !fields.length) return null

  const run = (field) => {
    setActive(field); setError(null)
    if (cache[field]) return
    setLoading(true)
    fetch('/api/analysis/qualitative', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field }),
    })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Analysis failed'); return d })
      .then(d => setCache(c => ({ ...c, [field]: d })))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  const result = active && cache[active]
  const s = result?.analysis?.sentiment

  return (
    <section>
      <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
        <span className="w-1.5 h-4 bg-violet-500 rounded-full inline-block" /> Qualitative — open-text themes <span className="text-xs font-normal text-violet-500">✦ AI</span>
      </h3>
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <div className="flex flex-wrap gap-2 mb-3 no-print">
          {fields.map(f => (
            <button key={f.key} onClick={() => run(f.key)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${active === f.key ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center gap-3 py-10 justify-center text-slate-500 text-sm">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-600" />
            Reading responses and coding themes… (this can take up to a minute)
          </div>
        )}
        {error && <p className="text-sm text-red-600 py-3">{error}</p>}
        {!active && !loading && <p className="text-sm text-slate-400 py-3">Pick a question above to extract themes, sentiment, and representative quotes from the open-text answers.</p>}

        {result && !loading && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400">{result.n} responses analyzed · GTS-accepted sample</p>
            <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">{result.analysis.summary}</p>

            {s && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Overall sentiment</p>
                <div className="flex h-3 rounded-full overflow-hidden">
                  <div style={{ width: `${Math.round((s.positive || 0) * 100)}%` }} className="bg-emerald-400" title={`Positive ${Math.round((s.positive || 0) * 100)}%`} />
                  <div style={{ width: `${Math.round((s.neutral || 0) * 100)}%` }} className="bg-slate-300" title={`Neutral ${Math.round((s.neutral || 0) * 100)}%`} />
                  <div style={{ width: `${Math.round((s.negative || 0) * 100)}%` }} className="bg-red-400" title={`Negative ${Math.round((s.negative || 0) * 100)}%`} />
                </div>
                <div className="flex gap-3 text-xs text-slate-500 mt-1">
                  <span>● Positive {Math.round((s.positive || 0) * 100)}%</span>
                  <span>● Neutral {Math.round((s.neutral || 0) * 100)}%</span>
                  <span>● Negative {Math.round((s.negative || 0) * 100)}%</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {result.analysis.themes.map((t, i) => (
                <div key={i} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h4 className="text-sm font-semibold text-slate-800">{t.label}</h4>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${SENT_COLOR[t.sentiment] || SENT_COLOR.neutral}`}>{t.sentiment}</span>
                      <span className="text-xs text-slate-400">{Math.round((t.share || 0) * 100)}%</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 mb-2">{t.description}</p>
                  <div className="space-y-1.5">
                    {(t.quotes || []).map((q, j) => (
                      <div key={j} className="text-xs border-l-2 border-violet-200 pl-2">
                        <p className="text-slate-700" dir="auto">“{q.original}”</p>
                        {q.translation && q.translation !== q.original && <p className="text-slate-400 italic">{q.translation}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// Horizontal bar chart — one series per breakdown category.
function HBar({ rows, series, domain, unit = '%', rowH = 26 }) {
  const grouped = series.length > 1
  const height = Math.max(90, rows.length * (grouped ? rowH * Math.min(series.length, 4) * 0.7 + 10 : rowH) + 30)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart layout="vertical" data={rows} margin={{ left: 6, right: 28, top: 4, bottom: 4 }} barCategoryGap={grouped ? 10 : 6}>
        <CartesianGrid horizontal={false} stroke="#eef2f7" />
        <XAxis type="number" domain={domain || [0, 'dataMax']} tickFormatter={v => (unit === '%' ? `${v}%` : v)} fontSize={11} stroke="#94a3b8" />
        <YAxis type="category" dataKey="name" width={168} fontSize={11} tick={{ fill: '#475569' }} interval={0} />
        <Tooltip formatter={v => (unit === '%' ? `${v}%` : v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        {grouped && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, i) => (
          <Bar key={s} dataKey={s} fill={PALETTE[i % PALETTE.length]} radius={[0, 3, 3, 0]} maxBarSize={grouped ? 16 : 22}>
            {!grouped && rows.map((_, ri) => <Cell key={ri} fill={PALETTE[ri % PALETTE.length]} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function Card({ title, n, note, csv, children }) {
  return (
    <div className="print-card bg-white rounded-xl border border-slate-100 p-4">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        <div className="flex items-center gap-2 shrink-0">
          {n != null && <span className="text-xs text-slate-400">n = {n}</span>}
          {csv && (
            <button onClick={() => downloadCsv(title, csv.rows, csv.series)}
              title="Download data as CSV"
              className="no-print text-xs text-slate-400 hover:text-blue-600 transition-colors">⤓ CSV</button>
          )}
        </div>
      </div>
      {note && <p className="text-xs text-amber-600 mb-2">{note}</p>}
      {children}
    </div>
  )
}

export default function AnalysisPanel() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [dimKey, setDimKey] = useState('') // '' = no breakdown

  useEffect(() => {
    fetch('/api/analysis', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Failed to load analysis data'); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
  }, [])

  // Split respondents into breakdown groups (or one "All" group).
  const groups = useMemo(() => {
    if (!data) return []
    if (!dimKey) return [{ key: 'All', rows: data.respondents }]
    const m = {}
    data.respondents.forEach(r => { const c = r.d[dimKey]; if (c == null) return; (m[c] = m[c] || []).push(r) })
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length).map(([key, rows]) => ({ key, rows }))
  }, [data, dimKey])

  const cats = groups.map(g => g.key)

  // ---- aggregation helpers (memoized via the functions closing over groups) ----
  const singleData = (ind) => {
    const totals = {}
    groups.forEach(g => g.rows.forEach(r => { const v = r.v[ind.key]; if (v != null) totals[v] = (totals[v] || 0) + 1 }))
    let opts = Object.keys(totals)
    if (ind.order) opts = ind.order.filter(o => totals[o] != null).concat(opts.filter(o => !ind.order.includes(o)))
    else opts.sort((a, b) => totals[b] - totals[a])
    const lbl = v => (ind.valueLabels && ind.valueLabels[v]) || prettify(v)
    const rows = opts.map(o => {
      const row = { name: lbl(o) }
      groups.forEach(g => {
        const denom = g.rows.filter(r => r.v[ind.key] != null).length
        const cnt = g.rows.filter(r => String(r.v[ind.key]) === o).length
        row[g.key] = denom ? Math.round((cnt / denom) * 1000) / 10 : 0
      })
      return row
    })
    const n = Object.values(totals).reduce((a, b) => a + b, 0)
    return { rows, n }
  }

  const multiData = (m) => {
    const rows = m.members.map(mem => {
      const row = { name: mem.label, _t: 0 }
      groups.forEach(g => {
        const cnt = g.rows.filter(r => r.v[mem.col] === 1).length
        row[g.key] = g.rows.length ? Math.round((cnt / g.rows.length) * 1000) / 10 : 0
        row._t += cnt
      })
      return row
    }).sort((a, b) => b._t - a._t)
    return { rows, n: data.respondents.length }
  }

  const meanData = (cols) => {
    // cols: [{col,label}] -> one row each, mean (1–5) per category
    const rows = cols.map(c => {
      const row = { name: c.label, _t: 0 }
      groups.forEach(g => {
        let s = 0, k = 0
        g.rows.forEach(r => { const v = r.v[c.col]; if (typeof v === 'number') { s += v; k++ } })
        row[g.key] = k ? Math.round((s / k) * 100) / 100 : 0
        row._t += s
      })
      return row
    })
    let nTot = 0
    cols.forEach(c => groups.forEach(g => g.rows.forEach(r => { if (typeof r.v[c.col] === 'number') nTot++ })))
    return { rows: rows.sort((a, b) => b._t - a._t), n: cols.length === 1 ? Math.round(nTot) : null }
  }

  // small-n warning when breaking down
  const smallNote = dimKey && groups.some(g => g.rows.length < SMALL_N)
    ? `Some ${data?.dimensions.find(d => d.key === dimKey)?.label.toLowerCase()} groups have few respondents (n < ${SMALL_N}) — interpret with care.`
    : null

  if (error) return <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">{error}</div>
  if (!data) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      <p className="text-slate-500 text-sm">Computing analysis…</p>
    </div>
  )

  const { meta } = data

  // ---- Expectation-gap (flagship), always computed overall ----
  const gapRows = meta.gap.dims.map(g => {
    const mean = col => { let s = 0, k = 0; data.respondents.forEach(r => { const v = r.v[col]; if (typeof v === 'number') { s += v; k++ } }); return k ? s / k : 0 }
    const exp = mean('perception_' + g.suffix), expect = mean('expect_' + g.suffix)
    return { name: g.label, Experience: Math.round(exp * 100) / 100, Expectation: Math.round(expect * 100) / 100, _gap: expect - exp }
  }).sort((a, b) => b._gap - a._gap)

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="bg-white rounded-xl border border-slate-100 p-4 flex flex-wrap items-center gap-3 sticky top-[97px] z-10">
        <div>
          <p className="text-sm font-semibold text-slate-800">Results Analysis</p>
          <p className="text-xs text-slate-400">{data.n} accepted surveys · GTS-verified sample</p>
        </div>
        <div className="ml-auto flex items-center gap-2 no-print">
          <label className="text-xs text-slate-500">Break down by</label>
          <select value={dimKey} onChange={e => setDimKey(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700">
            <option value="">— None (overall) —</option>
            {data.dimensions.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
          <button onClick={() => window.print()}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600 hover:border-blue-300 transition-colors">
            ⎙ Print / PDF
          </button>
        </div>
      </div>

      {/* Flagship: expectation gap */}
      <section>
        <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
          <span className="w-1.5 h-4 bg-blue-600 rounded-full inline-block" /> Expectation Gap — experience vs expectation
        </h3>
        <Card title="What people experience vs what they expect (1–5)" n={data.n}
          csv={{ rows: gapRows, series: ['Experience', 'Expectation'] }}
          note="Sorted by largest gap. A wide gap = people expect far more than they currently receive.">
          <HBar rows={gapRows} series={['Experience', 'Expectation']} domain={[1, 5]} unit="" rowH={30} />
        </Card>
      </section>

      {/* Sectioned indicators */}
      {SECTION_ORDER.map(section => {
        const singles = meta.single.filter(s => s.section === section)
        const likerts = meta.likert.filter(l => l.section === section)
        const multis = meta.multi.filter(m => m.section === section)
        const showTrust = section === 'Trust'
        if (!singles.length && !likerts.length && !multis.length && !showTrust) return null
        return (
          <section key={section}>
            <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-slate-300 rounded-full inline-block" /> {section}
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {showTrust && (() => {
                const { rows, n } = meanData(meta.trust.actors)
                return <Card key="trust" title={meta.trust.label + ' (mean 1–5)'} n={n} note={smallNote} csv={{ rows, series: cats }}>
                  <HBar rows={rows} series={cats} domain={[1, 5]} unit="" />
                </Card>
              })()}
              {multis.map(m => { const { rows, n } = multiData(m); return (
                <Card key={m.key} title={m.label} n={n} note={smallNote} csv={{ rows, series: cats }}>
                  <HBar rows={rows} series={cats} unit="%" />
                </Card>
              )})}
              {singles.map(s => { const { rows, n } = singleData(s); return (
                <Card key={s.key} title={s.label} n={n} note={smallNote} csv={{ rows, series: cats }}>
                  <HBar rows={rows} series={cats} unit="%" />
                </Card>
              )})}
              {likerts.map(l => { const { rows, n } = meanData([{ col: l.key, label: l.label }]); return (
                <Card key={l.key} title={l.label + ' (mean 1–5)'} n={n} note={smallNote} csv={{ rows, series: cats }}>
                  <HBar rows={rows} series={cats} domain={[1, 5]} unit="" rowH={30} />
                </Card>
              )})}
            </div>
          </section>
        )
      })}

      <MapSection respondents={data.respondents} meta={meta} />

      <QualitativeSection fields={meta.qualitative} />

      <ResponsesBrowser fields={meta.openText} />
    </div>
  )
}
