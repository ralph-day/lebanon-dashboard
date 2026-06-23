import { useEffect, useMemo, useRef, useState } from 'react'
import { HBar, ChartView, MapSection, aggSingle, aggMulti, aggMean } from './AnalysisPanel'

const r2 = v => Math.round(v * 100) / 100
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

function EditableText({ value, onChange, placeholder, rows = 4, className = '' }) {
  return (
    <>
      <textarea value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        className={`no-print w-full text-sm text-slate-700 border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-blue-300 ${className}`} />
      <div className="hidden print:block whitespace-pre-wrap text-sm text-slate-800">{value || ''}</div>
    </>
  )
}

// Module-level (stable identity) so editable fields keep focus across renders.
function AiBtn({ onClick, busy, k, label }) {
  return <button onClick={onClick} disabled={!!busy} className="no-print text-xs px-2.5 py-1 rounded-lg border border-violet-200 text-violet-600 hover:bg-violet-50 disabled:opacity-50">✦ {busy === k ? 'Working…' : label}</button>
}
function Block({ block, dragId, onReorder, onDelete, children }) {
  return (
    <div onDragOver={e => e.preventDefault()} onDrop={() => onReorder(block.id)}
      className="print-card group relative bg-white rounded-xl border border-slate-100 p-4">
      <div className="absolute -left-3 top-4 no-print opacity-0 group-hover:opacity-100 transition-opacity">
        <span draggable onDragStart={() => { dragId.current = block.id }} onDragEnd={() => { dragId.current = null }}
          title="Drag to reorder" className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 select-none">⠿</span>
      </div>
      <button onClick={() => onDelete(block.id)} title="Remove block"
        className="no-print absolute right-3 top-3 text-slate-300 hover:text-red-500 text-sm opacity-0 group-hover:opacity-100">✕</button>
      {children}
    </div>
  )
}

export default function ReportBuilder({ user }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [report, setReport] = useState(null) // { blocks: [] }
  const [busy, setBusy] = useState('')
  const [saved, setSaved] = useState(true)
  const dragId = useRef(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/analysis', { credentials: 'include' }).then(r => { if (!r.ok) throw new Error('Failed to load analysis data'); return r.json() }),
      fetch('/api/analysis/report', { credentials: 'include' }).then(r => r.ok ? r.json() : {}),
    ]).then(([d, rep]) => {
      setData(d)
      let blocks = Array.isArray(rep.blocks) ? rep.blocks : null
      if (!blocks || !blocks.length) {
        blocks = [
          { id: uid(), type: 'text', role: 'intro', title: 'Introduction', text: '' },
          { id: uid(), type: 'text', role: 'methodology', title: 'Methodology', text: '' },
          { id: uid(), type: 'text', role: 'exec', title: 'Executive summary', text: '' },
        ]
      }
      setReport({ ...rep, blocks })
    }).catch(e => setError(e.message))
  }, [])

  useEffect(() => {
    if (!report) return
    if (!loadedRef.current) { loadedRef.current = true; return }
    setSaved(false)
    const t = setTimeout(() => {
      fetch('/api/analysis/report', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) }).then(() => setSaved(true)).catch(() => {})
    }, 900)
    return () => clearTimeout(t)
  }, [report])

  const setBlocks = fn => setReport(r => ({ ...r, blocks: fn(r.blocks) }))
  const updateBlock = (id, patch) => setBlocks(bs => bs.map(b => b.id === id ? { ...b, ...patch } : b))
  const deleteBlock = id => setBlocks(bs => bs.filter(b => b.id !== id))
  const addBlock = block => setBlocks(bs => [...bs, block])
  const reorderTo = targetId => setBlocks(bs => {
    const from = bs.findIndex(b => b.id === dragId.current); const to = bs.findIndex(b => b.id === targetId)
    if (from < 0 || to < 0 || from === to) return bs
    const next = [...bs]; const [m] = next.splice(from, 1); next.splice(to, 0, m); return next
  })

  // ---- data helpers ----
  const groupsBy = (dk) => {
    if (!data) return []
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
  if (!data || !report) return <div className="flex flex-col items-center justify-center py-24 gap-3"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /><p className="text-slate-500 text-sm">Loading report…</p></div>

  const meta = data.meta
  const gapDimOrder = meta.gap.dims.map(g => ({ ...g, _gap: (gapMeanOf(data.respondents, 'expect_' + g.suffix) || 0) - (gapMeanOf(data.respondents, 'perception_' + g.suffix) || 0) })).sort((a, b) => b._gap - a._gap)
  const gapPanelRows = rows => gapDimOrder.map(d => ({ name: d.label, Experience: r2(gapMeanOf(rows, 'perception_' + d.suffix) || 0), Expectation: r2(gapMeanOf(rows, 'expect_' + d.suffix) || 0) }))

  const resolveQ = (qKey) => {
    if (qKey === 'gap') return { kind: 'gap' }
    if (qKey === 'trust') return { kind: 'mean', cols: meta.trust.actors }
    const [t, key] = qKey.split(':')
    if (t === 'multi') return { kind: 'multi', ind: meta.multi.find(m => m.key === key) }
    if (t === 'single') return { kind: 'single', ind: meta.single.find(s => s.key === key) }
    if (t === 'likert') return { kind: 'mean', cols: [{ col: key, label: (meta.likert.find(l => l.key === key) || {}).label || key }] }
    return null
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

  const genChartSummary = async (block) => {
    const q = resolveQ(block.qKey); if (!q) return
    setBusy(block.id)
    try {
      const res = await fetch('/api/analysis/summarize', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: block.title, kind: aiKind(q), views: profileOf(q) }) })
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Failed')
      updateBlock(block.id, { summary: d.summary })
    } catch (e) { alert(e.message) } finally { setBusy('') }
  }
  const draftText = async (block) => {
    setBusy(block.id)
    try {
      if (block.role === 'exec') {
        const findings = report.blocks.filter(b => b.type === 'chart' && b.summary).map(b => ({ title: b.title, summary: b.summary }))
        if (!findings.length) throw new Error('Generate some chart summaries first.')
        const res = await fetch('/api/analysis/report/exec-summary', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ findings }) })
        const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Failed'); updateBlock(block.id, { text: d.summary })
      } else {
        const locs = new Set(data.respondents.map(r => r.d.loc).filter(Boolean)).size
        const facts = block.role === 'methodology'
          ? `Accepted (GTS-verified) sample: ${data.n} surveys across ${locs} localities. Disaggregation dimensions: ${data.dimensions.map(d => d.label).join(', ')}. Nationalities: Lebanese, Palestinian, Syrian. Topics: priorities/coping, community & aid, trust, information access, expectations vs experience (AAP), future outlook.`
          : `An Accountability to Affected Populations perception study in Lebanon. Accepted sample: ${data.n} surveys across ${locs} localities.`
        const res = await fetch('/api/analysis/report/section', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: block.role, facts }) })
        const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Failed'); updateBlock(block.id, { text: d.text })
      }
    } catch (e) { alert(e.message) } finally { setBusy('') }
  }
  const mapViews = () => {
    const cols = [...meta.likert.map(l => ({ col: l.key, label: l.label })), ...meta.trust.actors.slice(0, 4).map(a => ({ col: a.col, label: 'Trust: ' + a.label }))]
    const byLoc = {}; data.respondents.forEach(r => { const L = r.d.loc; if (!L) return; (byLoc[L] = byLoc[L] || []).push(r) })
    const series = cols.map(c => c.label)
    const rows = Object.entries(byLoc).map(([loc, rs]) => { const row = { name: loc }; cols.forEach(c => { let s = 0, k = 0; rs.forEach(r => { const v = r.v[c.col]; if (typeof v === 'number') { s += v; k++ } }); row[c.label] = k ? r2(s / k) : 0 }); return row })
    return [{ label: 'Mean (1–5) by location × metric', series, rows }]
  }
  const genMapSummary = async (block) => {
    setBusy(block.id)
    try {
      const res = await fetch('/api/analysis/summarize', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Geographic patterns across wellbeing and trust', kind: 'mean', views: mapViews() }) })
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Failed'); updateBlock(block.id, { summary: d.summary })
    } catch (e) { alert(e.message) } finally { setBusy('') }
  }

  const renderChart = (block) => {
    const q = resolveQ(block.qKey); if (!q) return <p className="text-xs text-red-500">Unknown chart: {block.qKey}</p>
    const groups = groupsBy(block.breakdown)
    if (q.kind === 'gap') {
      if (groups.length === 1) return <HBar rows={gapPanelRows(groups[0].rows)} series={['Experience', 'Expectation']} domain={[1, 5]} rowH={26} />
      return <div className="grid md:grid-cols-2 gap-3">{groups.map(g => <div key={g.key}><p className="text-xs font-semibold text-slate-600 mb-1">{g.key} · n={g.rows.length}</p><HBar rows={gapPanelRows(g.rows)} series={['Experience', 'Expectation']} domain={[1, 5]} rowH={22} /></div>)}</div>
    }
    const cats = groups.map(g => g.key)
    const res = q.kind === 'multi' ? aggMulti(groups, q.ind) : q.kind === 'single' ? aggSingle(groups, q.ind) : aggMean(groups, q.cols)
    const unit = q.kind === 'mean' ? '' : '%'; const domain = q.kind === 'mean' ? [1, 5] : undefined
    return <ChartView type={block.viz || 'bar'} rows={res.rows} series={cats} domain={domain} unit={unit} />
  }
  const vizOptionsFor = (block) => {
    const q = resolveQ(block.qKey)
    if (!q || q.kind === 'gap') return []
    if (q.kind === 'single') return block.breakdown ? ['bar', 'column', 'table'] : ['bar', 'column', 'pie', 'table']
    return ['bar', 'column', 'table']
  }

  const exportWord = async () => {
    setBusy('word')
    try {
      const docx = await import('docx')
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx
      const paras = []
      const block = txt => String(txt || '').split(/\n+/).filter(Boolean).forEach(p => paras.push(new Paragraph(p)))
      paras.push(new Paragraph({ text: 'Lebanon Emergency Response Perception Study 2026', heading: HeadingLevel.TITLE }))
      paras.push(new Paragraph(`Results report · ${data.n} accepted surveys · ${new Date().toLocaleDateString()}`))
      report.blocks.forEach(b => {
        if (b.type === 'heading') paras.push(new Paragraph({ text: b.text || '', heading: HeadingLevel.HEADING_1 }))
        else if (b.type === 'text') { paras.push(new Paragraph({ text: b.title || 'Section', heading: HeadingLevel.HEADING_1 })); block(b.text) }
        else if (b.type === 'chart') { paras.push(new Paragraph({ text: b.title || '', heading: HeadingLevel.HEADING_2 })); block(b.summary); if (b.comment) paras.push(new Paragraph({ children: [new TextRun({ text: 'Analyst note: ', bold: true }), new TextRun(b.comment)] })) }
        else if (b.type === 'map') { paras.push(new Paragraph({ text: 'Geographic patterns', heading: HeadingLevel.HEADING_2 })); block(b.summary) }
      })
      const blob = await Packer.toBlob(new Document({ sections: [{ children: paras }] }))
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `Lebanon-Report-${new Date().toISOString().slice(0, 10)}.docx`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch (e) { alert(e.message) } finally { setBusy('') }
  }

  const wrapProps = { dragId, onReorder: reorderTo, onDelete: deleteBlock }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Toolbar */}
      <div className="no-print bg-white rounded-xl border border-slate-100 p-4 flex flex-wrap items-center gap-3 sticky top-[97px] z-10">
        <div>
          <p className="text-sm font-semibold text-slate-800">Report builder</p>
          <p className="text-xs text-slate-400">{saved ? 'All changes saved' : 'Saving…'} · drag ⠿ to reorder · push charts from Analysis</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => addBlock({ id: uid(), type: 'heading', text: 'New section' })} className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-blue-300">+ Heading</button>
          <button onClick={() => addBlock({ id: uid(), type: 'text', title: 'Section', text: '' })} className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-blue-300">+ Paragraph</button>
          <button onClick={() => addBlock({ id: uid(), type: 'map', summary: '' })} className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-blue-300">+ Map</button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => window.print()} className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 hover:border-blue-300">⎙ PDF</button>
          <button onClick={exportWord} disabled={!!busy} className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 hover:border-blue-300 disabled:opacity-50">⬇ Word</button>
        </div>
      </div>

      <header className="px-2">
        <h1 className="text-2xl font-bold text-slate-800">Lebanon Emergency Response Perception Study 2026</h1>
        <p className="text-sm text-slate-500">Results report · {data.n} accepted surveys</p>
      </header>

      {report.blocks.length === 0 && <p className="text-sm text-slate-400 px-2">No blocks yet. Add a section above, or push charts from the Analysis tab.</p>}

      <div className="space-y-4">
        {report.blocks.map(b => {
          if (b.type === 'heading') return (
            <Block key={b.id} block={b} {...wrapProps}>
              <input value={b.text || ''} onChange={e => updateBlock(b.id, { text: e.target.value })} placeholder="Section heading"
                className="no-print w-full text-lg font-bold text-slate-800 focus:outline-none" />
              <h2 className="hidden print:block text-lg font-bold text-slate-800">{b.text}</h2>
            </Block>
          )
          if (b.type === 'text') return (
            <Block key={b.id} block={b} {...wrapProps}>
              <div className="flex items-center gap-2 mb-1">
                {b.role ? <h2 className="text-lg font-bold text-slate-800">{b.title}</h2>
                  : <input value={b.title || ''} onChange={e => updateBlock(b.id, { title: e.target.value })} placeholder="Section title" className="no-print text-lg font-bold text-slate-800 focus:outline-none" />}
                {b.role === 'intro' && <AiBtn busy={busy} onClick={() => draftText(b)} k={b.id} label="Draft with AI" />}
                {b.role === 'methodology' && <AiBtn busy={busy} onClick={() => draftText(b)} k={b.id} label="Draft with AI" />}
                {b.role === 'exec' && <AiBtn busy={busy} onClick={() => draftText(b)} k={b.id} label="Generate from findings" />}
              </div>
              <EditableText value={b.text} onChange={v => updateBlock(b.id, { text: v })} placeholder="Write here…" rows={6} />
            </Block>
          )
          if (b.type === 'map') return (
            <Block key={b.id} block={b} {...wrapProps}>
              <h2 className="text-lg font-bold text-slate-800 mb-2">Geographic patterns</h2>
              <MapSection respondents={data.respondents} meta={meta} />
              <div className="flex items-center gap-2 mt-2"><span className="text-xs text-violet-500 font-medium">✦ AI</span><AiBtn busy={busy} onClick={() => genMapSummary(b)} k={b.id} label={b.summary ? 'Regenerate' : 'Analyze across metrics'} /></div>
              <EditableText value={b.summary} onChange={v => updateBlock(b.id, { summary: v })} placeholder="AI geographic analysis…" rows={3} />
            </Block>
          )
          // chart block
          const opts = vizOptionsFor(b)
          return (
            <Block key={b.id} block={b} {...wrapProps}>
              <h4 className="text-sm font-semibold text-slate-800 mb-1">{b.title}</h4>
              <div className="no-print flex items-center gap-1.5 mb-2 flex-wrap">
                <span className="text-[10px] uppercase text-slate-400 mr-1">View</span>
                {opts.map(o => <button key={o} onClick={() => updateBlock(b.id, { viz: o })} className={`text-xs px-2 py-0.5 rounded-md border ${(b.viz || 'bar') === o ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>{o[0].toUpperCase() + o.slice(1)}</button>)}
                <span className="text-[10px] uppercase text-slate-400 ml-2 mr-1">Breakdown</span>
                <select value={b.breakdown || ''} onChange={e => updateBlock(b.id, { breakdown: e.target.value })} className="text-xs border border-slate-200 rounded-md px-2 py-0.5 bg-white text-slate-600">
                  <option value="">Overall</option>
                  {data.dimensions.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </div>
              {renderChart(b)}
              <div className="flex items-center gap-2 mt-2"><span className="text-xs text-violet-500 font-medium">✦ AI summary</span><AiBtn busy={busy} onClick={() => genChartSummary(b)} k={b.id} label={b.summary ? 'Regenerate' : 'Generate'} /></div>
              <EditableText value={b.summary} onChange={v => updateBlock(b.id, { summary: v })} placeholder="AI summary — generate, then edit…" rows={3} />
              <EditableText value={b.comment} onChange={v => updateBlock(b.id, { comment: v })} placeholder="Analyst comment (optional)…" rows={2} className="bg-amber-50/40" />
            </Block>
          )
        })}
      </div>
    </div>
  )
}
