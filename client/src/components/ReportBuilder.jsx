import { useEffect, useMemo, useRef, useState } from 'react'
import { HBar, Donut, MapSection, aggSingle, aggMulti, aggMean } from './AnalysisPanel'

const SECTION_ORDER = ['Demographics', 'Priorities & Coping', 'Community & Aid', 'Trust', 'Information', 'Future Outlook']
const r2 = v => Math.round(v * 100) / 100

// Editable text that prints cleanly: a textarea on screen, a paragraph in print.
function EditableText({ value, onChange, placeholder, rows = 4, className = '' }) {
  return (
    <>
      <textarea value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        className={`no-print w-full text-sm text-slate-700 border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-blue-300 ${className}`} />
      <div className="hidden print:block whitespace-pre-wrap text-sm text-slate-800">{value || ''}</div>
    </>
  )
}

export default function ReportBuilder({ user }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [report, setReport] = useState(null) // { breakdown, intro, methodology, summaries{}, comments{}, mapSummary, execSummary }
  const [busy, setBusy] = useState('') // key currently generating
  const [saved, setSaved] = useState(true)
  const loadedRef = useRef(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/analysis', { credentials: 'include' }).then(r => { if (!r.ok) throw new Error('Failed to load analysis data'); return r.json() }),
      fetch('/api/analysis/report', { credentials: 'include' }).then(r => r.ok ? r.json() : {}),
    ]).then(([d, rep]) => {
      setData(d)
      setReport({ breakdown: '', intro: '', methodology: '', summaries: {}, comments: {}, mapSummary: '', execSummary: '', ...rep })
    }).catch(e => setError(e.message))
  }, [])

  // Debounced auto-save.
  useEffect(() => {
    if (!report) return
    if (!loadedRef.current) { loadedRef.current = true; return }
    setSaved(false)
    const t = setTimeout(() => {
      fetch('/api/analysis/report', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) })
        .then(() => setSaved(true)).catch(() => {})
    }, 900)
    return () => clearTimeout(t)
  }, [report])

  const set = (patch) => setReport(r => ({ ...r, ...patch }))
  const setSummary = (k, v) => setReport(r => ({ ...r, summaries: { ...r.summaries, [k]: v } }))
  const setComment = (k, v) => setReport(r => ({ ...r, comments: { ...r.comments, [k]: v } }))

  const groupsBy = (dk) => {
    if (!dk) return [{ key: 'All', rows: data.respondents }]
    const m = {}
    data.respondents.forEach(r => { const c = r.d[dk]; if (c == null) return; (m[c] = m[c] || []).push(r) })
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length).map(([key, rows]) => ({ key, rows }))
  }
  const buildViews = (kind, ind) => {
    const dks = [{ key: '', label: 'Overall' }, ...data.dimensions]
    return dks.map(d => { const g = groupsBy(d.key); const res = kind === 'single' ? aggSingle(g, ind) : kind === 'multi' ? aggMulti(g, ind) : aggMean(g, ind); return { label: d.key ? `By ${d.label}` : 'Overall', series: res.series, rows: res.rows } })
  }
  const gapMeanOf = (rows, col) => { let s = 0, k = 0; rows.forEach(r => { const v = r.v[col]; if (typeof v === 'number') { s += v; k++ } }); return k ? s / k : null }

  if (error) return <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">{error}</div>
  if (!data || !report) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /><p className="text-slate-500 text-sm">Loading report…</p></div>
  )

  const meta = data.meta
  const dimLabel = data.dimensions.find(d => d.key === report.breakdown)?.label || ''
  const gapDimOrder = meta.gap.dims.map(g => ({ ...g, _gap: (gapMeanOf(data.respondents, 'expect_' + g.suffix) || 0) - (gapMeanOf(data.respondents, 'perception_' + g.suffix) || 0) })).sort((a, b) => b._gap - a._gap)
  const gapPanelRows = rows => gapDimOrder.map(d => ({ name: d.label, Experience: r2(gapMeanOf(rows, 'perception_' + d.suffix) || 0), Expectation: r2(gapMeanOf(rows, 'expect_' + d.suffix) || 0) }))

  // Ordered findings (gap first, then by section).
  const questions = []
  questions.push({ key: 'gap', title: 'Expectation gap (experience vs expectation)', kind: 'gap', section: 'Expectation Gap' })
  SECTION_ORDER.forEach(section => {
    if (section === 'Trust') questions.push({ key: 'trust', title: meta.trust.label, kind: 'mean', cols: meta.trust.actors, section })
    meta.multi.filter(m => m.section === section).forEach(m => questions.push({ key: `multi:${m.key}`, title: m.label, kind: 'multi', ind: m, section }))
    meta.single.filter(s => s.section === section).forEach(s => questions.push({ key: `single:${s.key}`, title: s.label, kind: 'single', ind: s, section }))
    meta.likert.filter(l => l.section === section).forEach(l => questions.push({ key: `likert:${l.key}`, title: l.label, kind: 'mean', cols: [{ col: l.key, label: l.label }], section }))
  })

  const groups = groupsBy(report.breakdown)
  const cats = groups.map(g => g.key)

  const renderChart = (q) => {
    if (q.kind === 'gap') {
      if (cats.length === 1) return <HBar rows={gapPanelRows(groups[0].rows)} series={['Experience', 'Expectation']} domain={[1, 5]} rowH={26} />
      return <div className="grid md:grid-cols-2 gap-3">{groups.map(g => <div key={g.key}><p className="text-xs font-semibold text-slate-600 mb-1">{g.key} · n={g.rows.length}</p><HBar rows={gapPanelRows(g.rows)} series={['Experience', 'Expectation']} domain={[1, 5]} rowH={22} /></div>)}</div>
    }
    if (q.kind === 'mean') { const { rows, series } = aggMean(groups, q.cols); return <HBar rows={rows} series={series} domain={[1, 5]} /> }
    if (q.kind === 'multi') { const { rows, series } = aggMulti(groups, q.ind); return <HBar rows={rows} series={series} unit="%" /> }
    const { rows, series } = aggSingle(groups, q.ind)
    return (!report.breakdown && rows.length <= 6) ? <Donut rows={rows} seriesKey="All" /> : <HBar rows={rows} series={series} unit="%" />
  }

  const profileOf = (q) => {
    if (q.kind === 'gap') {
      const dks = [{ key: '', label: 'Overall' }, ...data.dimensions]
      return dks.map(d => {
        const g = groupsBy(d.key)
        if (!d.key) return { label: 'Overall (experience vs expectation)', series: ['Experience', 'Expectation'], rows: gapPanelRows(data.respondents) }
        return { label: `Gap by ${d.label}`, series: g.map(x => x.key), rows: gapDimOrder.map(dim => { const row = { name: dim.label }; g.forEach(x => { const ex = gapMeanOf(x.rows, 'perception_' + dim.suffix); const exp = gapMeanOf(x.rows, 'expect_' + dim.suffix); row[x.key] = (ex != null && exp != null) ? r2(exp - ex) : 0 }); return row }) }
      })
    }
    return buildViews(q.kind, q.kind === 'mean' ? q.cols : q.ind)
  }
  const aiKind = q => q.kind === 'gap' ? 'gap' : q.kind === 'mean' ? 'mean' : 'pct'

  const genSummary = async (q) => {
    setBusy(q.key)
    try {
      const res = await fetch('/api/analysis/summarize', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: q.title, kind: aiKind(q), views: profileOf(q) }) })
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Summary failed')
      setSummary(q.key, d.summary)
    } catch (e) { alert(e.message) } finally { setBusy('') }
  }

  const draftSection = async (section) => {
    setBusy(section)
    try {
      const facts = section === 'methodology'
        ? `Accepted (GTS-verified) sample size: ${data.n} surveys. Locations covered: ${meta.single ? '' : ''}${data.respondents ? new Set(data.respondents.map(r => r.d.loc).filter(Boolean)).size : ''} localities. Disaggregation dimensions analysed: ${data.dimensions.map(d => d.label).join(', ')}. Nationalities: Lebanese, Palestinian, Syrian. The questionnaire covers priorities/coping, community & aid, trust, information access, expectations vs experience (AAP), and future outlook.`
        : `An Accountability to Affected Populations perception study in Lebanon. Accepted sample: ${data.n} surveys across ${new Set(data.respondents.map(r => r.d.loc).filter(Boolean)).size} localities.`
      const res = await fetch('/api/analysis/report/section', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section, facts }) })
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Draft failed')
      set({ [section === 'intro' ? 'intro' : 'methodology']: d.text })
    } catch (e) { alert(e.message) } finally { setBusy('') }
  }

  const genExec = async () => {
    setBusy('exec')
    try {
      const findings = questions.map(q => ({ title: q.title, summary: report.summaries[q.key] })).filter(f => f.summary)
      if (!findings.length) throw new Error('Generate some question summaries first.')
      const res = await fetch('/api/analysis/report/exec-summary', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ findings }) })
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Failed')
      set({ execSummary: d.summary })
    } catch (e) { alert(e.message) } finally { setBusy('') }
  }

  // Map cross-metric summary: locations × key metrics.
  const mapViews = () => {
    const locGroups = groupsBy('district')
    const cols = [...meta.likert.map(l => ({ col: l.key, label: l.label })), ...meta.trust.actors.slice(0, 4).map(a => ({ col: a.col, label: 'Trust: ' + a.label }))]
    // group by loc instead of district for granularity
    const byLoc = {}
    data.respondents.forEach(r => { const L = r.d.loc; if (!L) return; (byLoc[L] = byLoc[L] || []).push(r) })
    const series = cols.map(c => c.label)
    const rows = Object.entries(byLoc).map(([loc, rs]) => { const row = { name: loc }; cols.forEach(c => { let s = 0, k = 0; rs.forEach(r => { const v = r.v[c.col]; if (typeof v === 'number') { s += v; k++ } }); row[c.label] = k ? r2(s / k) : 0 }); return row })
    return [{ label: 'Mean score (1–5) by location × metric', series, rows }]
  }
  const genMapSummary = async () => {
    setBusy('map')
    try {
      const res = await fetch('/api/analysis/summarize', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Geographic patterns across wellbeing and trust', kind: 'mean', views: mapViews() }) })
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Failed')
      set({ mapSummary: d.summary })
    } catch (e) { alert(e.message) } finally { setBusy('') }
  }

  const exportWord = async () => {
    setBusy('word')
    try {
      const docx = await import('docx')
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx
      const paras = []
      const push = (text, opts) => paras.push(new Paragraph({ ...opts, ...(opts?.heading ? { text } : { children: [new TextRun(text)] }) }))
      const block = txt => String(txt || '').split(/\n+/).filter(Boolean).forEach(p => push(p))
      push('Lebanon Emergency Response Perception Study 2026', { heading: HeadingLevel.TITLE })
      push(`Results report · ${data.n} accepted surveys · ${new Date().toLocaleDateString()}`, {})
      push('Introduction', { heading: HeadingLevel.HEADING_1 }); block(report.intro)
      push('Methodology', { heading: HeadingLevel.HEADING_1 }); block(report.methodology)
      push('Findings', { heading: HeadingLevel.HEADING_1 })
      questions.forEach(q => {
        push(q.title, { heading: HeadingLevel.HEADING_2 })
        if (report.summaries[q.key]) block(report.summaries[q.key])
        if (report.comments[q.key]) paras.push(new Paragraph({ children: [new TextRun({ text: 'Analyst note: ', bold: true }), new TextRun(report.comments[q.key])] }))
      })
      push('Geographic patterns', { heading: HeadingLevel.HEADING_2 }); block(report.mapSummary)
      push('Executive summary', { heading: HeadingLevel.HEADING_1 }); block(report.execSummary)
      const blob = await Packer.toBlob(new Document({ sections: [{ children: paras }] }))
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `Lebanon-Report-${new Date().toISOString().slice(0, 10)}.docx`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch (e) { alert(e.message) } finally { setBusy('') }
  }

  const AiBtn = ({ onClick, k, label }) => (
    <button onClick={onClick} disabled={!!busy} className="no-print text-xs px-2.5 py-1 rounded-lg border border-violet-200 text-violet-600 hover:bg-violet-50 disabled:opacity-50">
      ✦ {busy === k ? 'Working…' : label}
    </button>
  )

  let lastSection = null

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Toolbar */}
      <div className="no-print bg-white rounded-xl border border-slate-100 p-4 flex flex-wrap items-center gap-3 sticky top-[97px] z-10">
        <div>
          <p className="text-sm font-semibold text-slate-800">Report builder</p>
          <p className="text-xs text-slate-400">{saved ? 'All changes saved' : 'Saving…'} · auto-saved</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 mr-1">Breakdown</span>
          {[{ key: '', label: 'Overall' }, ...data.dimensions].map(d => (
            <button key={d.key || 'all'} onClick={() => set({ breakdown: d.key })}
              className={`text-xs px-2.5 py-1 rounded-full border ${report.breakdown === d.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>{d.label}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => window.print()} className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 hover:border-blue-300">⎙ PDF</button>
          <button onClick={exportWord} disabled={!!busy} className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 hover:border-blue-300 disabled:opacity-50">⬇ Word</button>
        </div>
      </div>

      {/* Document */}
      <div className="bg-white rounded-xl border border-slate-100 p-6 space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-800">Lebanon Emergency Response Perception Study 2026</h1>
          <p className="text-sm text-slate-500">Results report · {data.n} accepted surveys · {report.breakdown ? `Broken down by ${dimLabel}` : 'Overall'}</p>
        </header>

        <section>
          <div className="flex items-center gap-2 mb-1"><h2 className="text-lg font-bold text-slate-800">Introduction</h2><AiBtn onClick={() => draftSection('intro')} k="intro" label="Draft with AI" /></div>
          <EditableText value={report.intro} onChange={v => set({ intro: v })} placeholder="Write the introduction, or draft it with AI…" rows={6} />
        </section>

        <section>
          <div className="flex items-center gap-2 mb-1"><h2 className="text-lg font-bold text-slate-800">Methodology</h2><AiBtn onClick={() => draftSection('methodology')} k="methodology" label="Draft with AI" /></div>
          <EditableText value={report.methodology} onChange={v => set({ methodology: v })} placeholder="Describe the methodology, or draft it with AI…" rows={6} />
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-800 mb-2">Findings</h2>
          <div className="space-y-6">
            {questions.map(q => {
              const head = q.section !== lastSection ? (lastSection = q.section) : null
              return (
                <div key={q.key} className="print-card space-y-2">
                  {head && <h3 className="text-sm font-bold text-blue-700 border-b border-slate-100 pb-1">{head}</h3>}
                  <h4 className="text-sm font-semibold text-slate-800">{q.title}</h4>
                  {renderChart(q)}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-violet-500 font-medium">✦ AI summary</span>
                    <AiBtn onClick={() => genSummary(q)} k={q.key} label={report.summaries[q.key] ? 'Regenerate' : 'Generate'} />
                  </div>
                  <EditableText value={report.summaries[q.key]} onChange={v => setSummary(q.key, v)} placeholder="AI summary will appear here — generate, then edit freely…" rows={3} />
                  <EditableText value={report.comments[q.key]} onChange={v => setComment(q.key, v)} placeholder="Analyst comment (optional)…" rows={2} className="bg-amber-50/40" />
                </div>
              )
            })}
          </div>
        </section>

        <section className="print-card">
          <h2 className="text-lg font-bold text-slate-800 mb-2">Geographic patterns</h2>
          <MapSection respondents={data.respondents} meta={meta} />
          <div className="flex items-center gap-2 mt-2"><span className="text-xs text-violet-500 font-medium">✦ AI</span><AiBtn onClick={genMapSummary} k="map" label={report.mapSummary ? 'Regenerate' : 'Analyze across metrics'} /></div>
          <EditableText value={report.mapSummary} onChange={v => set({ mapSummary: v })} placeholder="AI geographic analysis across metrics will appear here…" rows={3} />
        </section>

        <section className="print-card">
          <div className="flex items-center gap-2 mb-1"><h2 className="text-lg font-bold text-slate-800">Executive summary</h2><AiBtn onClick={genExec} k="exec" label="Generate from findings" /></div>
          <EditableText value={report.execSummary} onChange={v => set({ execSummary: v })} placeholder="Generate an executive summary from the question findings, then edit…" rows={6} />
        </section>
      </div>
    </div>
  )
}
