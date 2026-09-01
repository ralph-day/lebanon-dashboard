import { useEffect, useMemo, useState, useRef, createContext, useContext } from 'react'
import NotesBubble from './NotesBubble'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
  PieChart, Pie,
} from 'recharts'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

// Client (H2H / Ground Truth) brand palette — led by their primary teal.
const PALETTE = ['#00CEA4', '#DD3160', '#537080', '#94CEBA', '#E39399', '#00A88A', '#AAAAAA', '#DAE1D9']
const SECTION_ORDER = ['Demographics', 'Priorities & Coping', 'Community & Aid', 'Trust', 'Information', 'Future Outlook']
const SMALL_N = 20 // warn when a disaggregated cell is below this
const PIE_MAX = 6  // single-choice questions with <= this many options render as a donut (overall view)

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

// Standalone aggregations over an arbitrary grouping ([{key,rows}]) — used to
// build the multi-angle profile (overall + each disaggregation) for AI summaries.
function aggSingle(groups, ind) {
  const cats = groups.map(g => g.key)
  const totals = {}
  groups.forEach(g => g.rows.forEach(r => { const v = r.v[ind.key]; if (v != null) totals[v] = (totals[v] || 0) + 1 }))
  let opts = Object.keys(totals)
  if (ind.order) opts = ind.order.filter(o => totals[o] != null).concat(opts.filter(o => !ind.order.includes(o)))
  else opts.sort((a, b) => totals[b] - totals[a])
  const lbl = v => (ind.valueLabels && ind.valueLabels[v]) || prettify(v)
  const rows = opts.map(o => { const row = { name: lbl(o) }; groups.forEach(g => { const den = g.rows.filter(r => r.v[ind.key] != null).length; const cnt = g.rows.filter(r => String(r.v[ind.key]) === o).length; row[g.key] = den ? Math.round(cnt / den * 1000) / 10 : 0 }); return row })
  return { series: cats, rows }
}
function aggMulti(groups, m) {
  const cats = groups.map(g => g.key)
  const rows = m.members.map(mem => { const row = { name: mem.label, _t: 0 }; groups.forEach(g => { const cnt = g.rows.filter(r => r.v[mem.col] === 1).length; row[g.key] = g.rows.length ? Math.round(cnt / g.rows.length * 1000) / 10 : 0; row._t += cnt }); return row }).sort((a, b) => b._t - a._t)
  rows.forEach(r => delete r._t)
  return { series: cats, rows }
}
function aggMean(groups, cols) {
  const cats = groups.map(g => g.key)
  const rows = cols.map(c => { const row = { name: c.label }; groups.forEach(g => { let s = 0, k = 0; g.rows.forEach(r => { const v = r.v[c.col]; if (typeof v === 'number') { s += v; k++ } }); row[g.key] = k ? Math.round(s / k * 100) / 100 : 0 }); return row })
  return { series: cats, rows }
}

// Map a 1–5 mean to a red→amber→green fill.
function scaleColor(v) {
  const t = Math.max(0, Math.min(1, (v - 1) / 4))
  const hue = t * 120 // 0=red, 120=green
  return `hsl(${hue}, 70%, 45%)`
}

// Graduated-symbol map: one bubble per location, colored by an indicator's mean
// (1–5) and sized by respondent count, at each location's GPS centroid.
function MapSection({ respondents, meta, mapBoxClass = 'h-[340px]' }) {
  const metricGroups = useMemo(() => [
    { group: 'Wellbeing', items: meta.likert.map(l => ({ col: l.key, label: l.label })) },
    { group: 'Trust in actors', items: meta.trust.actors.map(a => ({ col: a.col, label: a.label })) },
    { group: 'Experience (accountability)', items: meta.gap.dims.map(g => ({ col: `perception_${g.suffix}`, label: g.label })) },
  ], [meta])
  const [metric, setMetric] = useState(metricGroups[0]?.items[0]?.col)
  const activeLabel = metricGroups.flatMap(g => g.items).find(i => i.col === metric)?.label || ''

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
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <p className="text-sm font-semibold text-slate-700">Mapping: <span className="text-blue-600">{activeLabel}</span></p>
          <span className="text-xs text-slate-400">{locs.length} locations · bubble size = sample, color = mean (1–5)</span>
        </div>
        {/* Creative metric picker: grouped pills, all visible (no inner scroll) */}
        <div className="no-print space-y-1.5 mb-3">
          {metricGroups.map(g => (
            <div key={g.group} className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 w-full sm:w-auto sm:mr-1">{g.group}</span>
              {g.items.map(it => (
                <button key={it.col} onClick={() => setMetric(it.col)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${metric === it.col ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
                  {it.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className={`${mapBoxClass} rounded-lg overflow-hidden relative z-0 isolate`}>
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
// Data-protection & AI-use disclaimer, shown on the Analysis and Report pages
// and included in printed/exported output.
function DataDisclaimer({ variant = 'analysis' }) {
  const what = variant === 'report' ? 'report' : 'analysis'
  return (
    <div className="print-card bg-slate-50 border border-slate-100 rounded-xl p-4 text-[11px] leading-relaxed text-slate-500">
      <p className="font-semibold text-slate-600 mb-1">Data protection &amp; responsible AI use</p>
      <p>
        This {what} is produced with AI assistance (Anthropic&rsquo;s Claude) under human review — a researcher reviews and edits every AI-generated output before it is used. The survey collects <strong>no respondent names</strong> (survey ID numbers only), and the client is disclosed to every respondent at the start of the interview. Charts and summaries are generated from <strong>aggregated, de-identified statistics</strong>; open-text answers are automatically scrubbed of phone numbers, emails and links before processing, and no personal identifiers or contact details are transmitted.
      </p>
      <p className="mt-1.5">
        AI processing is governed by Anthropic&rsquo;s Data Processing Addendum (incorporated into its Commercial Terms of Service, with Standard Contractual Clauses for international transfers). Under the Commercial Terms (Section&nbsp;B), <strong>Anthropic is not permitted to train its models on Customer Content</strong> — the inputs submitted to the service and the outputs it returns. The DPA (Sections&nbsp;B.2&ndash;B.3) further restricts processing to the customer&rsquo;s documented instructions and specified business purposes, and prohibits combining the data with data from other sources. Data is used solely for this study.
      </p>
    </div>
  )
}

// Tag-style word cloud: font size + colour scale with each term's weight.
function WordCloud({ items, rtl }) {
  if (!items || !items.length) return <p className="text-sm text-slate-400 py-6 text-center">No terms to show.</p>
  const ws = items.map(i => i.weight)
  const max = Math.max(...ws), min = Math.min(...ws)
  const t = w => (max === min ? 0.5 : (w - min) / (max - min))
  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 p-4 min-h-[8rem]">
      {items.map((it, i) => (
        <span key={i} title={`weight ${it.weight}`} className="font-semibold leading-tight"
          style={{ fontSize: `${12 + t(it.weight) * 30}px`, color: `hsl(${222 - t(it.weight) * 190}, 68%, ${58 - t(it.weight) * 18}%)` }}>
          {it.text}
        </span>
      ))}
    </div>
  )
}

function QualitativeSection({ fields }) {
  const ctx = useContext(AnalysisCtx)
  const [active, setActive] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [cache, setCache] = useState({}) // field -> result
  const [dataModal, setDataModal] = useState(null) // 'loading' | { label, rows }
  // Word cloud (respondents' own words) — Arabic / English / English themes.
  const [wc, setWc] = useState({}) // field -> wordcloud result
  const [wcOpen, setWcOpen] = useState(false)
  const [wcLoading, setWcLoading] = useState(false)
  const [wcErr, setWcErr] = useState(null)

  if (!fields || !fields.length) return null

  const loadWordcloud = (field) => {
    setWcOpen(true); setWcErr(null)
    if (wc[field]) return
    setWcLoading(true)
    fetch('/api/analysis/wordcloud', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field }) })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Word cloud failed'); return d })
      .then(d => setWc(c => ({ ...c, [field]: d })))
      .catch(e => setWcErr(e.message))
      .finally(() => setWcLoading(false))
  }

  const showFullData = (field, label) => {
    setDataModal('loading')
    loadResponses({ field })
      .then(d => setDataModal({ label: d.label || label, rows: d.responses || [] }))
      .catch(() => { setDataModal(null); alert('Could not load full data') })
  }

  const run = (field) => {
    setActive(field); setError(null); setWcOpen(false)
    if (cache[field]) return
    setLoading(true)
    fetch('/api/analysis/qualitative', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field }),
    })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Analysis failed'); return d })
      .then(d => { setCache(c => ({ ...c, [field]: d })); ctx?.registerQual(field, d) })
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
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-400">{result.n} responses analyzed · GTS-accepted sample</p>
              <div className="flex items-center gap-2 no-print">
                <button onClick={() => (wcOpen ? setWcOpen(false) : loadWordcloud(active))}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${wcOpen ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-200 text-slate-600 hover:border-violet-300'}`}>☁ Theme cloud</button>
                <button onClick={() => showFullData(active, result.label)}
                  className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-blue-300">⊞ Show full data</button>
                {ctx && <NotesBubble entityType="analysisGraph" entityId={`qual:${active}`} entityLabel={`Qualitative: ${result.label}`}
                  allNotes={ctx.allNotes} onNoteAdded={ctx.addNote} onNoteDeleted={ctx.deleteNote} currentUser={ctx.user} />}
              </div>
            </div>
            <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">{result.analysis.summary}</p>

            {wcOpen && (
              <div className="border border-violet-100 bg-violet-50/30 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-700">Theme cloud — what people are expressing</p>
                <p className="text-xs text-slate-400 mb-1">Thematic meaning grouped into themes (size = prevalence), not a word-for-word translation.</p>
                {wcLoading && (
                  <div className="flex items-center gap-3 py-8 justify-center text-slate-500 text-sm">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-violet-600" /> Extracting themes…
                  </div>
                )}
                {wcErr && <p className="text-sm text-red-600 py-2">{wcErr}</p>}
                {!wcLoading && !wcErr && wc[active] && <WordCloud items={wc[active].themes} />}
              </div>
            )}
            {ctx && ctx.allNotes.filter(n => n.entityType === 'analysisGraph' && n.entityId === `qual:${active}`).map(nt => (
              <p key={nt.id} className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2"><span className="text-slate-400">{nt.author}:</span> {nt.text}</p>
            ))}

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

      <FullDataModal data={dataModal} onClose={() => setDataModal(null)} />
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

// Donut chart for single-choice questions with few options (overall view only).
function Donut({ rows, seriesKey }) {
  const data = rows.map(r => ({ name: r.name, value: r[seriesKey] }))
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, 150 + data.length * 18)}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={82} paddingAngle={1}
          label={({ value }) => `${value}%`} labelLine={false}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip formatter={v => `${v}%`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

// Vertical column chart.
function Column({ rows, series, domain, unit = '%' }) {
  const grouped = series.length > 1
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 56 }} barCategoryGap={grouped ? 12 : 6}>
        <CartesianGrid vertical={false} stroke="#eef2f7" />
        <XAxis dataKey="name" fontSize={10} angle={-30} textAnchor="end" interval={0} height={70} stroke="#94a3b8" />
        <YAxis domain={domain || [0, 'dataMax']} tickFormatter={v => (unit === '%' ? `${v}%` : v)} fontSize={11} stroke="#94a3b8" />
        <Tooltip formatter={v => (unit === '%' ? `${v}%` : v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        {grouped && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, i) => (
          <Bar key={s} dataKey={s} fill={PALETTE[i % PALETTE.length]} radius={[3, 3, 0, 0]} maxBarSize={grouped ? 28 : 44}>
            {!grouped && rows.map((_, ri) => <Cell key={ri} fill={PALETTE[ri % PALETTE.length]} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// Data table view.
function DataTable({ rows, series, unit = '%' }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-slate-500 border-b border-slate-100"><th className="text-left py-1.5 pr-2 font-medium">Category</th>{series.map(s => <th key={s} className="text-right py-1.5 px-2 font-medium">{s}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-slate-50"><td className="py-1.5 pr-2 text-slate-700">{r.name}</td>{series.map(s => <td key={s} className="text-right py-1.5 px-2 text-slate-800 tabular-nums">{r[s]}{unit === '%' && r[s] != null ? '%' : ''}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

// Dispatcher: render rows/series in the chosen visualization.
function ChartView({ type, rows, series, domain, unit, rowH }) {
  if (type === 'column') return <Column rows={rows} series={series} domain={domain} unit={unit} />
  if (type === 'pie') return <Donut rows={rows} seriesKey={series[0]} />
  if (type === 'table') return <DataTable rows={rows} series={series} unit={unit} />
  return <HBar rows={rows} series={series} domain={domain} unit={unit} rowH={rowH} />
}

// ── Client (H2H / Ground Truth) house style ──────────────────────────────────
// Their scale questions are diverging 100%-stacked horizontal bars in this exact
// palette. Segments run: no-answer, 1(low)…5(high).
const H2H = { dk: '#AAAAAA', s1: '#DD3160', s2: '#E39399', s3: '#DAE1D9', s4: '#94CEBA', s5: '#00CEA4', label: '#537080' }
const H2H_SEGS = ['dk', 's1', 's2', 's3', 's4', 's5']
const H2H_TEXT = { dk: '#ffffff', s1: '#ffffff', s2: '#7a3742', s3: '#537080', s4: '#2f5a4a', s5: '#ffffff' }
const H2H_LABELS = { dk: 'No answer', s1: 'Not at all', s2: 'A little', s3: 'Somewhat', s4: 'Mostly', s5: 'Fully' }

// Diverging stacked-bar renderer (client house style). `rows` = one entry per
// group: { name, n, dk, s1..s5 } as percentages that sum to ~100.
function DivergingBar({ rows, labels = H2H_LABELS }) {
  const multi = rows.length > 1
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={i}>
          {multi && <div className="text-[11px] mb-0.5" style={{ color: H2H.label }}>{r.name} <span className="text-slate-400">n={r.n}</span></div>}
          <div className="flex w-full h-7 rounded overflow-hidden">
            {H2H_SEGS.map(s => (r[s] > 0 ? (
              <div key={s} style={{ width: `${r[s]}%`, background: H2H[s] }}
                className="flex items-center justify-center border-r border-white last:border-r-0" title={`${labels[s]}: ${r[s]}%`}>
                {r[s] >= 8 && <span className="text-[10px] font-medium" style={{ color: H2H_TEXT[s] }}>{r[s]}%</span>}
              </div>
            ) : null))}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
        {H2H_SEGS.map(s => (
          <span key={s} className="inline-flex items-center gap-1 text-[10px]" style={{ color: H2H.label }}>
            <span className="w-2.5 h-2.5 inline-block rounded-sm" style={{ background: H2H[s] }} />{labels[s]}
          </span>
        ))}
      </div>
    </div>
  )
}

// Fetch the per-respondent full data for any question (open-text by `field`,
// closed by `qKey`), used by the "Show full data" modal.
function loadResponses(params) {
  const qs = params.field ? `field=${encodeURIComponent(params.field)}` : `qKey=${encodeURIComponent(params.qKey)}`
  return fetch(`/api/analysis/responses?${qs}`, { credentials: 'include' }).then(r => r.ok ? r.json() : Promise.reject(new Error('failed')))
}
const waLink = phone => { const d = String(phone || '').replace(/\D/g, ''); return d ? `https://wa.me/${d.startsWith('961') ? d : '961' + d}` : null }
function downloadResponsesCsv(dm) {
  const esc = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const lines = [['Survey #', 'Survey code', 'Enumerator', 'Phone', 'Location', 'Origin (governorate)', 'Date', 'Gender', 'Age', 'Answer'].join(',')]
  dm.rows.forEach((r, i) => lines.push([i + 1, r.surveyCode, r.enumerator, r.enumeratorPhone, r.area, r.origin, r.date, r.gender, r.age, r.text].map(esc).join(',')))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url
  a.download = `${String(dm.label).replace(/[^\w -]+/g, '').trim() || 'responses'}-responses.csv`
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}
// Shared full-data table modal. `data` is null | 'loading' | { label, rows }.
function FullDataModal({ data, onClose }) {
  if (!data) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-xl">
          <h3 className="font-semibold text-slate-800 text-sm">{data === 'loading' ? 'Loading…' : `Full responses — ${data.label} (${data.rows.length})`}</h3>
          <div className="flex items-center gap-3">
            {data !== 'loading' && <button onClick={() => downloadResponsesCsv(data)} className="text-xs text-slate-500 hover:text-blue-600">⤓ CSV</button>}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
          </div>
        </div>
        {data === 'loading' ? <p className="p-10 text-center text-slate-400 text-sm">Loading…</p> : (
          <div className="overflow-auto max-h-[75vh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th><th className="px-3 py-2 font-medium">Survey</th><th className="px-3 py-2 font-medium">Enumerator</th>
                  <th className="px-3 py-2 font-medium">Location</th><th className="px-3 py-2 font-medium">Origin</th><th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Gender</th><th className="px-3 py-2 font-medium">Age</th><th className="px-3 py-2 font-medium">Answer</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-50 align-top">
                    <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap font-mono">{r.surveyCode}</td>
                    <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">
                      {r.enumerator}
                      {waLink(r.enumeratorPhone) && <a href={waLink(r.enumeratorPhone)} target="_blank" rel="noreferrer" title={`WhatsApp ${r.enumerator} (${r.enumeratorPhone})`}
                        className="ml-1.5 inline-flex items-center bg-[#25D366] text-white text-[10px] font-semibold rounded px-1.5 py-0.5 align-middle hover:opacity-90">WA</a>}
                    </td>
                    <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{r.area}</td>
                    <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{r.origin}</td>
                    <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-1.5 text-slate-700">{r.gender}</td>
                    <td className="px-3 py-1.5 text-slate-700">{r.age}</td>
                    <td className="px-3 py-1.5 text-slate-800 min-w-[16rem]" dir="auto">{r.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// Shared state for per-graph AI summaries + team notes + a registry the report
// generator iterates over.
const AnalysisCtx = createContext(null)

// Per-graph footer: AI summary button + team notes. `graph` carries the chart
// metadata ({ key, title, breakdown, series, rows, kind }).
function GraphTools({ graph }) {
  const ctx = useContext(AnalysisCtx)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [refineOpen, setRefineOpen] = useState(false)
  const [fb, setFb] = useState('')

  // Register/refresh this graph's metadata so the report can summarize it.
  useEffect(() => { ctx?.registerGraph(graph) }) // eslint-disable-line
  if (!ctx) return null

  const summary = ctx.summaries[graph.key]
  const run = async (feedback = '') => {
    setLoading(true); setError(null)
    try { await ctx.summarizeGraph(graph, feedback) } catch (e) { setError(e.message) } finally { setLoading(false) }
  }
  const applyFeedback = async () => {
    if (!fb.trim()) return
    await run(fb.trim()); setRefineOpen(false)
  }
  const myNotes = ctx.allNotes.filter(n => n.entityType === 'analysisGraph' && n.entityId === graph.key)

  return (
    <div className="mt-3 border-t border-slate-100 pt-2 space-y-2">
      <div className="flex items-center gap-2 no-print flex-wrap">
        <button onClick={() => run()} disabled={loading}
          className="text-xs px-2.5 py-1 rounded-lg border border-violet-200 text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-50">
          ✦ {loading ? 'Working…' : summary ? 'Re-summarize' : 'AI summary'}
        </button>
        {summary && (
          <button onClick={() => setRefineOpen(o => !o)} disabled={loading}
            className="text-xs px-2.5 py-1 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50">
            ✎ Refine with feedback
          </button>
        )}
        <NotesBubble entityType="analysisGraph" entityId={graph.key} entityLabel={graph.title}
          allNotes={ctx.allNotes} onNoteAdded={ctx.addNote} onNoteDeleted={ctx.deleteNote} currentUser={ctx.user} />
        {myNotes.length > 0 && <span className="text-xs text-slate-400">{myNotes.length} note{myNotes.length > 1 ? 's' : ''}</span>}
      </div>
      {refineOpen && (
        <div className="no-print flex items-start gap-2">
          <textarea value={fb} onChange={e => setFb(e.target.value)} rows={2} autoFocus
            placeholder="Tell the AI how to revise — e.g. 'focus on the gender gap', 'be more concise', 'flag the Akkar outlier'…"
            className="flex-1 text-xs border border-blue-200 rounded-lg p-2 resize-none focus:outline-none focus:border-blue-400" />
          <button onClick={applyFeedback} disabled={loading || !fb.trim()}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap">
            {loading ? '…' : 'Regenerate'}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {summary && <p className="text-xs text-slate-700 bg-violet-50 rounded-lg p-2 whitespace-pre-wrap break-words"><span className="text-violet-500 font-medium">✦ AI:</span> {summary}</p>}
      {myNotes.length > 0 && (
        <div className="space-y-1">
          {myNotes.map(nt => (
            <p key={nt.id} className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2">
              <span className="text-slate-400">{nt.author}:</span> {nt.text}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

const VIZ_LABEL = { bar: 'Bar', column: 'Column', pie: 'Pie', table: 'Table', distribution: 'H2H distribution' }
function Card({ title, n, note, csv, graph, viz, onPush, onShowData, pushed, children }) {
  // Public (no-login) pages provide no ctx: hide report-push and raw-data tools.
  const cardCtx = useContext(AnalysisCtx)
  if (!cardCtx) { onPush = null; onShowData = null }
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
      {(viz || onPush || onShowData) && (
        <div className="no-print flex items-center gap-2 mb-2 flex-wrap">
          {viz && (
            <label className="flex items-center gap-1 text-xs text-slate-500">Visualize
              <select value={viz.type} onChange={e => viz.setType(e.target.value)}
                className="text-xs border border-slate-200 rounded-md px-2 py-0.5 bg-white text-slate-700">
                {viz.options.map(o => <option key={o} value={o}>{VIZ_LABEL[o]}</option>)}
              </select>
            </label>
          )}
          {onShowData && (
            <button onClick={onShowData} className="text-xs px-2 py-0.5 rounded-md border border-slate-200 text-slate-500 hover:border-blue-300">⊞ Data</button>
          )}
          {onPush && (
            <button onClick={onPush}
              className="ml-auto text-xs px-2.5 py-0.5 rounded-md border border-violet-200 text-violet-600 hover:bg-violet-50 transition-colors">
              {pushed ? '✓ Pushed' : '⤴ Push to report'}
            </button>
          )}
        </div>
      )}
      {note && <p className="text-xs text-amber-600 mb-2">{note}</p>}
      {children}
      {graph && <GraphTools graph={graph} />}
    </div>
  )
}

export default function AnalysisPanel({ user, publicMode = false }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [dimKey, setDimKey] = useState('') // '' = no breakdown
  const [allNotes, setAllNotes] = useState([])
  const [summaries, setSummaries] = useState({}) // graphKey -> summary text
  const [vizByKey, setVizByKey] = useState({})   // graphKey -> chart type
  const [pushedKey, setPushedKey] = useState('') // transient "pushed ✓"
  const graphsRef = useRef(new Map()) // graphKey -> latest meta (for the report)
  // Prompt technique (shared with the report via localStorage).
  const [presets, setPresets] = useState([])
  const [promptStyle, setPromptStyle] = useState('rigorous')
  const [promptCustom, setPromptCustom] = useState('')
  const [promptOpen, setPromptOpen] = useState(false)
  const [aiAllBusy, setAiAllBusy] = useState(false)
  const [aiProgress, setAiProgress] = useState(null)
  const [pushedAll, setPushedAll] = useState(false)
  const [dataModal, setDataModal] = useState(null) // 'loading' | { label, rows }
  // Ask the data (free-text research question → chart + grounded answer)
  const [askQ, setAskQ] = useState('')
  const [askBusy, setAskBusy] = useState(false)
  const [askErr, setAskErr] = useState('')
  const [ask, setAsk] = useState(null) // { plan, chart, answer, answering, answerErr }

  const showDataQ = (qKey, label) => {
    setDataModal('loading')
    loadResponses({ qKey }).then(d => setDataModal({ label: d.label || label, rows: d.responses || [] })).catch(() => { setDataModal(null); alert('Could not load full data') })
  }

  const pushChart = async (meta) => {
    try {
      const block = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type: 'chart', qKey: meta.qKey, title: meta.title, kind: meta.kind, viz: meta.viz, breakdown: dimKey, summary: summaries[meta.qKey] || '', comment: '' }
      const res = await fetch('/api/analysis/report/blocks', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block }) })
      if (!res.ok) throw new Error('Failed')
      setPushedKey(meta.qKey); setTimeout(() => setPushedKey(''), 2000)
    } catch { alert('Could not push to report') }
  }

  useEffect(() => {
    fetch(publicMode ? '/api/public/analysis' : '/api/analysis', publicMode ? {} : { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Failed to load analysis data'); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
    if (!publicMode) fetch('/api/notes', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setAllNotes).catch(() => {})
  }, [publicMode])

  // Persist AI summaries across the session (per data version), so leaving and
  // returning to the tab doesn't lose them or force a re-generate.
  useEffect(() => {
    if (!data?.fetchedAt) return
    try { const raw = localStorage.getItem(`an-sum::${data.fetchedAt}`); if (raw) setSummaries(JSON.parse(raw)) } catch { /* ignore */ }
  }, [data?.fetchedAt])
  useEffect(() => {
    if (!data?.fetchedAt) return
    try { localStorage.setItem(`an-sum::${data.fetchedAt}`, JSON.stringify(summaries)) } catch { /* ignore */ }
  }, [summaries, data?.fetchedAt])

  // Prompt techniques: load presets + persisted choice (shared with the report).
  useEffect(() => {
    if (publicMode) return
    fetch('/api/analysis/prompts', { credentials: 'include' }).then(r => r.ok ? r.json() : { presets: [] }).then(d => setPresets(d.presets || [])).catch(() => {})
    try { const raw = localStorage.getItem('analysis-prompt'); if (raw) { const p = JSON.parse(raw); setPromptStyle(p.style || 'rigorous'); setPromptCustom(p.custom || '') } } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem('analysis-prompt', JSON.stringify({ style: promptStyle, custom: promptCustom })) } catch { /* ignore */ }
  }, [promptStyle, promptCustom])

  // Context: notes CRUD, per-graph AI summaries, and a registry the report uses.
  const summarizeGraph = async (graph, feedback = '') => {
    // Prefer the multi-angle profile (overall + every breakdown); fall back to
    // the single current-view rows for charts without a profile (e.g. the map).
    const base = graph.makeProfile
      ? { title: graph.title, kind: graph.kind, views: graph.makeProfile() }
      : { title: graph.title, kind: graph.kind, series: graph.series, rows: graph.rows }
    const res = await fetch('/api/analysis/summarize', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...base, style: promptStyle, customInstructions: promptCustom, feedback }),
    })
    const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Summary failed')
    setSummaries(s => ({ ...s, [graph.key]: d.summary }))
    return d.summary
  }
  // Analyze every chart at once (4-way concurrency, with progress).
  const analyzeAll = async () => {
    setAiAllBusy(true)
    const metas = [...graphsRef.current.values()]
    const queue = metas.filter(m => !summaries[m.key])
    let done = 0; setAiProgress({ done: 0, total: queue.length })
    const worker = async () => { while (queue.length) { const m = queue.shift(); try { await summarizeGraph(m) } catch { /* keep going */ } setAiProgress({ done: ++done, total: queue.length + done }) } }
    await Promise.all([worker(), worker(), worker(), worker()])
    setAiAllBusy(false); setAiProgress(null)
  }
  // Push every chart to the report at once (carries existing summaries).
  const pushAll = async () => {
    const metas = [...graphsRef.current.values()]
    if (!metas.length) return
    const blocks = metas.map(m => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${m.key}`, type: 'chart', qKey: m.key, title: m.title, kind: m.kind, viz: vizByKey[m.key] || 'bar', breakdown: dimKey, summary: summaries[m.key] || '', comment: '' }))
    try {
      const res = await fetch('/api/analysis/report/blocks', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blocks }) })
      if (!res.ok) throw new Error('Failed')
      setPushedAll(true); setTimeout(() => setPushedAll(false), 2500)
    } catch { alert('Could not push to report') }
  }
  const [reportBusy, setReportBusy] = useState(false)
  const [reportProgress, setReportProgress] = useState(null)
  const [qualResults, setQualResults] = useState({}) // field -> qualitative result

  // AI-summarize every registered chart (4-way concurrency, shows progress).
  const ensureSummaries = async () => {
    const metas = [...graphsRef.current.values()]
    const queue = metas.filter(m => !summaries[`${m.key}::${m.breakdown || ''}`])
    let done = 0; setReportProgress({ done: 0, total: queue.length })
    const worker = async () => { while (queue.length) { const m = queue.shift(); try { await summarizeGraph(m) } catch { /* keep going */ } setReportProgress({ done: ++done, total: queue.length || done }) } }
    await Promise.all([worker(), worker(), worker(), worker()])
    setReportProgress(null)
    return metas
  }

  // PDF: summarize then print (print CSS keeps charts + summaries + notes).
  const generateReport = async () => {
    setReportBusy(true)
    try { await ensureSummaries() } finally { setReportBusy(false) }
    setTimeout(() => window.print(), 500)
  }

  // Word: summarize then build an editable .docx (headings, AI summaries,
  // team notes, data tables, qualitative themes).
  const exportWord = async () => {
    setReportBusy(true)
    try {
      const metas = await ensureSummaries()
      const docx = await import('docx')
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType } = docx
      const notesFor = key => allNotes.filter(n => n.entityType === 'analysisGraph' && n.entityId === key)
      const children = [
        new Paragraph({ text: 'Lebanon Emergency Response Perception Study 2026', heading: HeadingLevel.TITLE }),
        new Paragraph({ children: [new TextRun({ text: `Results report · ${data.n} accepted surveys · ${dimKey ? `Broken down by ${dimLabel}` : 'Overall'} · ${new Date().toLocaleDateString()}`, italics: true, color: '666666' })] }),
        new Paragraph({ text: '' }),
      ]
      for (const m of metas) {
        children.push(new Paragraph({ text: m.title + (m.breakdown && m.breakdown !== 'location' ? ` — by ${m.breakdown}` : ''), heading: HeadingLevel.HEADING_2 }))
        const sum = summaries[`${m.key}::${m.breakdown || ''}`]
        if (sum) children.push(new Paragraph({ children: [new TextRun({ text: 'AI summary: ', bold: true, color: '6D28D9' }), new TextRun(sum)] }))
        notesFor(m.key).forEach(nt => children.push(new Paragraph({ children: [new TextRun({ text: `Note — ${nt.author}: `, bold: true }), new TextRun(nt.text)] })))
        const cols = ['Category', ...m.series]
        const headRow = new TableRow({ children: cols.map(c => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(c), bold: true })] })] })) })
        const bodyRows = (m.rows || []).slice(0, 60).map(r => new TableRow({ children: [String(r.name), ...m.series.map(s => r[s] == null ? '' : String(r[s]) + (m.kind === 'pct' ? '%' : ''))].map(v => new TableCell({ children: [new Paragraph(String(v))] })) }))
        children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headRow, ...bodyRows] }))
        children.push(new Paragraph({ text: '' }))
      }
      const qkeys = Object.keys(qualResults)
      if (qkeys.length) {
        children.push(new Paragraph({ text: 'Qualitative — open-text themes', heading: HeadingLevel.HEADING_1 }))
        for (const f of qkeys) {
          const q = qualResults[f]
          children.push(new Paragraph({ text: q.label, heading: HeadingLevel.HEADING_2 }))
          if (q.analysis?.summary) children.push(new Paragraph(q.analysis.summary))
          ;(q.analysis?.themes || []).forEach(t => {
            children.push(new Paragraph({ children: [new TextRun({ text: `${t.label} (${Math.round((t.share || 0) * 100)}%, ${t.sentiment}): `, bold: true }), new TextRun(t.description || '')] }))
            ;(t.quotes || []).slice(0, 2).forEach(qt => children.push(new Paragraph({ alignment: AlignmentType.START, children: [new TextRun({ text: `“${qt.original}” — ${qt.translation || ''}`, italics: true, color: '555555' })] })))
          })
        }
      }
      const blob = await Packer.toBlob(new Document({ sections: [{ children }] }))
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url
      a.download = `Lebanon-Analysis-Report-${dimKey ? dimLabel + '-' : ''}${new Date().toISOString().slice(0, 10)}.docx`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } finally { setReportBusy(false) }
  }

  const ctxValue = {
    user, allNotes, summaries, qualResults,
    registerQual: (field, result) => setQualResults(q => ({ ...q, [field]: result })),
    addNote: n => setAllNotes(p => [n, ...p]),
    deleteNote: id => setAllNotes(p => p.filter(n => n.id !== id)),
    summarizeGraph,
    registerGraph: meta => graphsRef.current.set(meta.key, meta),
  }

  // Split respondents into breakdown groups (or one "All" group).
  const groups = useMemo(() => {
    if (!data) return []
    if (!dimKey) return [{ key: 'All', rows: data.respondents }]
    const m = {}
    data.respondents.forEach(r => { const c = r.d[dimKey]; if (c == null) return; (m[c] = m[c] || []).push(r) })
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length).map(([key, rows]) => ({ key, rows }))
  }, [data, dimKey])

  const cats = groups.map(g => g.key)

  // Group respondents by any dimension key (used for the multi-angle profile).
  const groupsBy = (dk) => {
    if (!dk) return [{ key: 'All', rows: data.respondents }]
    const m = {}
    data.respondents.forEach(r => { const c = r.d[dk]; if (c == null) return; (m[c] = m[c] || []).push(r) })
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length).map(([key, rows]) => ({ key, rows }))
  }
  // Build the full profile for one indicator: overall + every disaggregation.
  const buildViews = (kind, ind) => {
    const dks = [{ key: '', label: 'Overall' }, ...data.dimensions]
    return dks.map(d => {
      const g = groupsBy(d.key)
      const res = kind === 'single' ? aggSingle(g, ind) : kind === 'multi' ? aggMulti(g, ind) : aggMean(g, ind)
      return { label: d.key ? `By ${d.label}` : 'Overall', series: res.series, rows: res.rows }
    })
  }

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

  // Likert distribution for the client (H2H) diverging bar: one row per group,
  // % at each 1–5 point plus a "no answer" bucket, over the group's full N.
  const likertDist = (col) => groups.map(g => {
    const c = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, dk: 0 }
    g.rows.forEach(r => { const v = r.v[col]; if (typeof v === 'number' && v >= 1 && v <= 5) c[v]++; else c.dk++ })
    const tot = g.rows.length
    const p = x => (tot ? Math.round((x / tot) * 1000) / 10 : 0)
    return { name: g.key, n: tot, dk: p(c.dk), s1: p(c[1]), s2: p(c[2]), s3: p(c[3]), s4: p(c[4]), s5: p(c[5]) }
  })

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

  // ---- Expectation-gap (flagship) ----
  // Overall: Experience vs Expectation (two series). With a breakdown active:
  // the gap size (expectation − experience) per dimension, one bar per group.
  const r2 = v => Math.round(v * 100) / 100
  const gapMeanOf = (rows, col) => { let s = 0, k = 0; rows.forEach(r => { const v = r.v[col]; if (typeof v === 'number') { s += v; k++ } }); return k ? s / k : null }
  const dimLabel = data.dimensions.find(d => d.key === dimKey)?.label || ''
  const gapRows = !dimKey
    ? meta.gap.dims.map(g => {
        const exp = gapMeanOf(data.respondents, 'perception_' + g.suffix) || 0
        const expect = gapMeanOf(data.respondents, 'expect_' + g.suffix) || 0
        return { name: g.label, Experience: r2(exp), Expectation: r2(expect), _gap: expect - exp }
      }).sort((a, b) => b._gap - a._gap)
    : meta.gap.dims.map(g => {
        const row = { name: g.label, _gap: 0 }
        groups.forEach(grp => {
          const exp = gapMeanOf(grp.rows, 'perception_' + g.suffix)
          const expect = gapMeanOf(grp.rows, 'expect_' + g.suffix)
          const gap = (exp != null && expect != null) ? expect - exp : 0
          row[grp.key] = r2(gap); row._gap += gap
        })
        return row
      }).sort((a, b) => b._gap - a._gap)
  const gapSeries = dimKey ? cats : ['Experience', 'Expectation']
  // Dimension order shared across all small-multiple panels (sorted by overall gap).
  const gapDimOrder = meta.gap.dims
    .map(g => ({ suffix: g.suffix, label: g.label, _gap: (gapMeanOf(data.respondents, 'expect_' + g.suffix) || 0) - (gapMeanOf(data.respondents, 'perception_' + g.suffix) || 0) }))
    .sort((a, b) => b._gap - a._gap)
  const gapPanelRows = rows => gapDimOrder.map(d => ({
    name: d.label,
    Experience: r2(gapMeanOf(rows, 'perception_' + d.suffix) || 0),
    Expectation: r2(gapMeanOf(rows, 'expect_' + d.suffix) || 0),
  }))
  // Multi-angle profile for the gap question: overall experience-vs-expectation,
  // then gap size per group for each disaggregation.
  const gapMakeProfile = () => {
    const dks = [{ key: '', label: 'Overall' }, ...data.dimensions]
    return dks.map(d => {
      const g = groupsBy(d.key)
      if (!d.key) return { label: 'Overall (experience vs expectation)', series: ['Experience', 'Expectation'], rows: gapPanelRows(data.respondents) }
      return {
        label: `Gap by ${d.label}`, series: g.map(x => x.key),
        rows: gapDimOrder.map(dim => { const row = { name: dim.label }; g.forEach(x => { const ex = gapMeanOf(x.rows, 'perception_' + dim.suffix); const exp = gapMeanOf(x.rows, 'expect_' + dim.suffix); row[x.key] = (ex != null && exp != null) ? r2(exp - ex) : 0 }); return row }),
      }
    })
  }

  // Resolve an Ask-the-data plan (qKey + breakdown) into a renderable chart,
  // reusing the same aggregation the section cards use.
  const resolveAsk = (plan) => {
    const bd = groupsBy(plan.breakdown || '')
    const multi = bd.length > 1
    const q = plan.qKey
    if (q === 'gap') return { title: 'Expectation gap (experience vs expectation)', kind: 'gap', rows: gapPanelRows(data.respondents), series: ['Experience', 'Expectation'], domain: [1, 5], unit: '', chartType: 'bar', makeProfile: gapMakeProfile }
    if (q === 'trust') { const a = aggMean(bd, meta.trust.actors); return { title: meta.trust.label, kind: 'mean', rows: a.rows, series: a.series, domain: [1, 5], unit: '', chartType: plan.chartType === 'pie' ? 'bar' : plan.chartType, makeProfile: () => buildViews('mean', meta.trust.actors) } }
    const [pfx, key] = q.includes(':') ? [q.slice(0, q.indexOf(':')), q.slice(q.indexOf(':') + 1)] : [q, '']
    if (pfx === 'single') { const s = meta.single.find(x => x.key === key); if (!s) return null; const a = aggSingle(bd, s); return { title: s.label, kind: 'pct', rows: a.rows, series: a.series, unit: '%', chartType: (plan.chartType === 'pie' && multi) ? 'bar' : plan.chartType, makeProfile: () => buildViews('single', s) } }
    if (pfx === 'multi') { const m = meta.multi.find(x => x.key === key); if (!m) return null; const a = aggMulti(bd, m); return { title: m.label, kind: 'pct', rows: a.rows, series: a.series, unit: '%', chartType: plan.chartType === 'pie' ? 'bar' : plan.chartType, makeProfile: () => buildViews('multi', m) } }
    if (pfx === 'likert') { const l = meta.likert.find(x => x.key === key); if (!l) return null; const cols = [{ col: l.key, label: l.label }]; const a = aggMean(bd, cols); return { title: l.label, kind: 'mean', rows: a.rows, series: a.series, domain: [1, 5], unit: '', chartType: plan.chartType === 'pie' ? 'bar' : plan.chartType, makeProfile: () => buildViews('mean', cols) } }
    return null
  }
  const runAsk = async () => {
    const q = askQ.trim(); if (q.length < 3) return
    setAskBusy(true); setAskErr(''); setAsk(null)
    try {
      const res = await fetch('/api/analysis/ask', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q }) })
      const plan = await res.json(); if (!res.ok) throw new Error(plan.error || 'Failed')
      const chart = (plan.canAnswer && plan.qKey) ? resolveAsk(plan) : null
      if (!chart) { setAsk({ plan, chart: null }); setAskBusy(false); return }
      setAsk({ plan, chart, answering: true })
      setAskBusy(false)
      try {
        const base = { title: chart.title, kind: chart.kind, views: chart.makeProfile() }
        const feedback = `The analyst asked this research question: "${q}". Answer it directly and specifically using the data in 2–4 sentences, then note the single most important difference across subgroups.`
        const ar = await fetch('/api/analysis/summarize', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...base, style: promptStyle, customInstructions: promptCustom, feedback }) })
        const ad = await ar.json(); if (!ar.ok) throw new Error(ad.error || 'Answer failed')
        setAsk(a => ({ ...a, answer: ad.summary, answering: false }))
      } catch (e) { setAsk(a => ({ ...a, answering: false, answerErr: e.message })) }
    } catch (e) { setAskErr(e.message); setAskBusy(false) }
  }
  const pushAskToReport = async (a) => {
    try {
      const block = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type: 'chart', qKey: a.plan.qKey, title: a.chart.title, kind: a.chart.kind, viz: a.chart.chartType, breakdown: a.plan.breakdown || '', summary: a.answer || '', comment: '' }
      const res = await fetch('/api/analysis/report/blocks', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block }) })
      if (!res.ok) throw new Error('Failed')
      setAsk(x => ({ ...x, pushed: true })); setTimeout(() => setAsk(x => x ? { ...x, pushed: false } : x), 2000)
    } catch { alert('Could not push to report') }
  }

  return (
   <AnalysisCtx.Provider value={publicMode ? null : ctxValue}>
    <div className="space-y-5">
      {/* Print-only report header */}
      <div className="hidden print:block mb-2">
        <h1 className="text-xl font-bold text-slate-800">Lebanon Emergency Response Perception Study 2026</h1>
        <p className="text-sm text-slate-500">Results report · {data.n} accepted surveys · {dimKey ? `Broken down by ${dimLabel}` : 'Overall'} · Generated {new Date().toLocaleDateString()}</p>
      </div>
      {/* Controls */}
      <div className="bg-white rounded-xl border border-slate-100 p-4 sticky top-[97px] z-10">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Results Analysis</p>
            <p className="text-xs text-slate-400">{data.n} accepted surveys · GTS-verified sample</p>
          </div>
          {!publicMode && <div className="no-print ml-auto flex items-center gap-2 flex-wrap">
            <button onClick={() => setPromptOpen(o => !o)}
              className="text-sm rounded-lg px-3 py-1.5 border border-slate-200 bg-white text-slate-600 hover:border-violet-300">
              ⚙ Prompt: {promptStyle === 'custom' ? 'Custom' : (presets.find(p => p.id === promptStyle)?.label || 'Rigorous analyst')}
            </button>
            <button onClick={analyzeAll} disabled={aiAllBusy}
              className="text-sm rounded-lg px-3 py-1.5 bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-60">
              {aiAllBusy ? `✦ Analyzing ${aiProgress?.done || 0}/${aiProgress?.total || 0}…` : '✦ Analyze all'}
            </button>
            <button onClick={pushAll}
              className="text-sm rounded-lg px-3 py-1.5 border border-violet-200 text-violet-600 hover:bg-violet-50 transition-colors">
              {pushedAll ? '✓ Pushed all' : '⤴ Push all to report'}
            </button>
            <a href="#report" className="text-sm rounded-lg px-3 py-1.5 bg-slate-800 text-white hover:bg-slate-700 transition-colors">Report →</a>
          </div>}
        </div>

        {/* Prompt techniques panel */}
        {promptOpen && (
          <div className="no-print mb-3 border border-violet-100 bg-violet-50/40 rounded-lg p-3 space-y-2">
            <p className="text-xs text-slate-500">Analysis technique — the study objective & multi-angle framing are always included; this controls the output style. Applies to every AI summary (here and in the report).</p>
            <div className="flex flex-wrap gap-2">
              {presets.map(p => (
                <button key={p.id} onClick={() => setPromptStyle(p.id)} title={p.description}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${promptStyle === p.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>{p.label}</button>
              ))}
              <button onClick={() => { if (!promptCustom) setPromptCustom(presets.find(p => p.id === promptStyle)?.instructions || ''); setPromptStyle('custom') }}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${promptStyle === 'custom' ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>Custom</button>
            </div>
            <p className="text-xs text-slate-500">{promptStyle === 'custom' ? 'Your custom instructions:' : (presets.find(p => p.id === promptStyle)?.description || '')}</p>
            {promptStyle === 'custom' ? (
              <textarea value={promptCustom} onChange={e => setPromptCustom(e.target.value)} rows={6}
                className="w-full text-xs text-slate-700 border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-violet-300" placeholder="Write your own analysis instructions…" />
            ) : (
              <pre className="text-xs text-slate-600 whitespace-pre-wrap bg-white border border-slate-100 rounded-lg p-2 max-h-48 overflow-y-auto">{presets.find(p => p.id === promptStyle)?.instructions || ''}</pre>
            )}
          </div>
        )}

        {/* Breakdown as selectable tags, applied to every question below */}
        <div className="no-print flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 mr-1">Break down by</span>
          {[{ key: '', label: 'Overall' }, ...data.dimensions].map(d => (
            <button key={d.key || 'all'} onClick={() => setDimKey(d.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${dimKey === d.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ask the data — free-text research question → chart + grounded answer */}
      {!publicMode && <section className="no-print bg-gradient-to-br from-violet-50 to-blue-50 rounded-xl border border-violet-100 p-4">
        <div className="flex items-center gap-2 mb-1"><span className="text-violet-600">✦</span><h3 className="text-sm font-bold text-slate-800">Ask the data</h3></div>
        <p className="text-xs text-slate-500 mb-2">Ask any research question in plain language — Claude finds the right indicator, charts it, and writes the answer from the survey.</p>
        <div className="flex items-start gap-2">
          <textarea value={askQ} onChange={e => setAskQ(e.target.value)} rows={2}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runAsk() }}
            placeholder="e.g. Which actors do people trust least? Do Syrians feel less in control than Lebanese? Where are the biggest accountability gaps?"
            className="flex-1 text-sm border border-violet-200 rounded-lg p-2 resize-none focus:outline-none focus:border-violet-400" />
          <button onClick={runAsk} disabled={askBusy || askQ.trim().length < 3}
            className="text-sm px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 whitespace-nowrap">
            {askBusy ? 'Thinking…' : 'Ask'}
          </button>
        </div>
        {askErr && <p className="text-xs text-red-600 mt-2">{askErr}</p>}
        {ask && (
          <div className="mt-3 bg-white rounded-lg border border-slate-100 p-3">
            {ask.chart ? (
              <>
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <h4 className="text-sm font-semibold text-slate-800">{ask.chart.title}{ask.plan.breakdown ? ` · by ${data.dimensions.find(d => d.key === ask.plan.breakdown)?.label || ask.plan.breakdown}` : ''}</h4>
                  <button onClick={() => pushAskToReport(ask)}
                    className="text-xs px-2.5 py-0.5 rounded-md border border-violet-200 text-violet-600 hover:bg-violet-50 whitespace-nowrap">
                    {ask.pushed ? '✓ Pushed' : '⤴ Push to report'}
                  </button>
                </div>
                <ChartView type={ask.chart.chartType} rows={ask.chart.rows} series={ask.chart.series} domain={ask.chart.domain} unit={ask.chart.unit} />
                {ask.answering && <p className="text-xs text-slate-400 mt-2 animate-pulse">Writing the answer…</p>}
                {ask.answer && <p className="text-sm text-slate-700 bg-violet-50 rounded-lg p-3 mt-2 whitespace-pre-wrap break-words"><span className="text-violet-500 font-medium">✦ Answer:</span> {ask.answer}</p>}
                {ask.answerErr && <p className="text-xs text-red-600 mt-2">{ask.answerErr}</p>}
              </>
            ) : (
              <p className="text-sm text-slate-600"><span className="text-slate-400">No matching chart —</span> {ask.plan.rationale || 'This question can’t be answered from the available indicators.'}</p>
            )}
          </div>
        )}
      </section>}

      {/* Flagship: expectation gap */}
      <section>
        <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
          <span className="w-1.5 h-4 bg-blue-600 rounded-full inline-block" /> Expectation Gap — experience vs expectation
          {dimKey && <span className="text-xs font-normal text-slate-400">· side-by-side by {dimLabel}</span>}
        </h3>
        {!dimKey ? (
          <Card title="What people experience vs what they expect (1–5)" n={data.n}
            csv={{ rows: gapRows, series: ['Experience', 'Expectation'] }}
            onPush={() => pushChart({ qKey: 'gap', title: 'Expectation gap (experience vs expectation)', kind: 'gap', viz: 'bar' })} pushed={pushedKey === 'gap'} onShowData={() => showDataQ('gap', 'Expectation gap (experience vs expectation)')}
            note="Sorted by largest gap. A wide gap = people expect far more than they currently receive.">
            <HBar rows={gapRows} series={['Experience', 'Expectation']} domain={[1, 5]} unit="" rowH={30} />
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {groups.map(g => {
              const rows = gapPanelRows(g.rows)
              return (
                <Card key={g.key} title={`${g.key} · experience vs expectation`} n={g.rows.length}
                  csv={{ rows, series: ['Experience', 'Expectation'] }}>
                  <HBar rows={rows} series={['Experience', 'Expectation']} domain={[1, 5]} unit="" rowH={24} />
                </Card>
              )
            })}
          </div>
        )}
        {/* One AI summary + notes for the whole expectation-gap question */}
        <div className="print-card bg-white rounded-xl border border-slate-100 px-4 pb-3 mt-3">
          <GraphTools graph={{ key: 'gap', title: 'Expectation gap (experience vs expectation)', kind: 'gap', makeProfile: gapMakeProfile }} />
        </div>
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
                const { rows, n } = meanData(meta.trust.actors); const k = 'trust'; const vt = vizByKey[k] || 'bar'
                return <Card key="trust" title={meta.trust.label + ' (mean 1–5)'} n={n} note={smallNote} csv={{ rows, series: cats }}
                  viz={{ type: vt, setType: t => setVizByKey(v => ({ ...v, [k]: t })), options: ['bar', 'column', 'table'] }}
                  onPush={() => pushChart({ qKey: k, title: meta.trust.label, kind: 'mean', viz: vt })} pushed={pushedKey === k} onShowData={() => showDataQ(k, meta.trust.label)}
                  graph={{ key: k, title: meta.trust.label, kind: 'mean', makeProfile: () => buildViews('mean', meta.trust.actors) }}>
                  <ChartView type={vt} rows={rows} series={cats} domain={[1, 5]} unit="" />
                </Card>
              })()}
              {multis.map(m => { const { rows, n } = multiData(m); const k = `multi:${m.key}`; const vt = vizByKey[k] || 'bar'; return (
                <Card key={m.key} title={m.label} n={n} note={smallNote} csv={{ rows, series: cats }}
                  viz={{ type: vt, setType: t => setVizByKey(v => ({ ...v, [k]: t })), options: ['bar', 'column', 'table'] }}
                  onPush={() => pushChart({ qKey: k, title: m.label, kind: 'pct', viz: vt })} pushed={pushedKey === k} onShowData={() => showDataQ(k, m.label)}
                  graph={{ key: k, title: m.label, kind: 'pct', makeProfile: () => buildViews('multi', m) }}>
                  <ChartView type={vt} rows={rows} series={cats} unit="%" />
                </Card>
              )})}
              {singles.map(s => { const { rows, n } = singleData(s); const k = `single:${s.key}`
                const opts = !dimKey ? ['bar', 'column', 'pie', 'table'] : ['bar', 'column', 'table']
                const vt = vizByKey[k] || (!dimKey && rows.length <= PIE_MAX ? 'pie' : 'bar')
                return (
                <Card key={s.key} title={s.label} n={n} note={smallNote} csv={{ rows, series: cats }}
                  viz={{ type: vt, setType: t => setVizByKey(v => ({ ...v, [k]: t })), options: opts }}
                  onPush={() => pushChart({ qKey: k, title: s.label, kind: 'pct', viz: vt })} pushed={pushedKey === k} onShowData={() => showDataQ(k, s.label)}
                  graph={{ key: k, title: s.label, kind: 'pct', makeProfile: () => buildViews('single', s) }}>
                  <ChartView type={vt} rows={rows} series={cats} unit="%" />
                </Card>
              )})}
              {likerts.map(l => { const k = `likert:${l.key}`; const vt = vizByKey[k] || 'distribution'; const isDist = vt === 'distribution'
                const { rows, n } = meanData([{ col: l.key, label: l.label }])
                return (
                <Card key={l.key} title={l.label + (isDist ? ' (distribution)' : ' (mean 1–5)')} n={n} note={smallNote} csv={{ rows, series: cats }}
                  viz={{ type: vt, setType: t => setVizByKey(v => ({ ...v, [k]: t })), options: ['bar', 'column', 'table', 'distribution'] }}
                  onPush={() => pushChart({ qKey: k, title: l.label, kind: 'mean', viz: vt })} pushed={pushedKey === k} onShowData={() => showDataQ(k, l.label)}
                  graph={{ key: k, title: l.label, kind: 'mean', makeProfile: () => buildViews('mean', [{ col: l.key, label: l.label }]) }}>
                  {isDist
                    ? <DivergingBar rows={likertDist(l.key)} />
                    : <ChartView type={vt} rows={rows} series={cats} domain={[1, 5]} unit="" rowH={30} />}
                </Card>
              )})}
            </div>
          </section>
        )
      })}

      <MapSection respondents={data.respondents} meta={meta} />

      {!publicMode && <QualitativeSection fields={meta.qualitative} />}

      {!publicMode && <ResponsesBrowser fields={meta.openText} />}

      <DataDisclaimer variant="analysis" />
      <FullDataModal data={dataModal} onClose={() => setDataModal(null)} />
    </div>
   </AnalysisCtx.Provider>
  )
}

// Shared primitives reused by the Report builder.
// Header for the public (no sign-in) share pages — IA brand, no account controls.
export function PublicShellHeader({ subtitle }) {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
        <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
          <span className="text-white text-sm font-bold">IA</span>
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-slate-800 leading-tight tracking-wide uppercase truncate">
            Communities Know Best — {subtitle} — InflueAnswers
          </h1>
          <p className="text-xs text-slate-400 truncate">Emergency Response Perception Study 2026 · Lebanon</p>
        </div>
      </div>
    </header>
  )
}

export { PALETTE, scaleColor, HBar, Donut, Column, DataTable, ChartView, MapSection, DataDisclaimer, aggSingle, aggMulti, aggMean }
