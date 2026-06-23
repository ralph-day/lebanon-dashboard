import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts'

const PALETTE = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d']
const SECTION_ORDER = ['Demographics', 'Priorities & Coping', 'Community & Aid', 'Trust', 'Information', 'Future Outlook']
const SMALL_N = 20 // warn when a disaggregated cell is below this

const prettify = s => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()

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

function Card({ title, n, note, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        {n != null && <span className="text-xs text-slate-400 shrink-0">n = {n}</span>}
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
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-slate-500">Break down by</label>
          <select value={dimKey} onChange={e => setDimKey(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700">
            <option value="">— None (overall) —</option>
            {data.dimensions.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </div>
      </div>

      {/* Flagship: expectation gap */}
      <section>
        <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
          <span className="w-1.5 h-4 bg-blue-600 rounded-full inline-block" /> Expectation Gap — experience vs expectation
        </h3>
        <Card title="What people experience vs what they expect (1–5)" n={data.n}
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
                return <Card key="trust" title={meta.trust.label + ' (mean 1–5)'} n={n} note={smallNote}>
                  <HBar rows={rows} series={cats} domain={[1, 5]} unit="" />
                </Card>
              })()}
              {multis.map(m => { const { rows, n } = multiData(m); return (
                <Card key={m.key} title={m.label} n={n} note={smallNote}>
                  <HBar rows={rows} series={cats} unit="%" />
                </Card>
              )})}
              {singles.map(s => { const { rows, n } = singleData(s); return (
                <Card key={s.key} title={s.label} n={n} note={smallNote}>
                  <HBar rows={rows} series={cats} unit="%" />
                </Card>
              )})}
              {likerts.map(l => { const { rows, n } = meanData([{ col: l.key, label: l.label }]); return (
                <Card key={l.key} title={l.label + ' (mean 1–5)'} n={n} note={smallNote}>
                  <HBar rows={rows} series={cats} domain={[1, 5]} unit="" rowH={30} />
                </Card>
              )})}
            </div>
          </section>
        )
      })}
    </div>
  )
}
