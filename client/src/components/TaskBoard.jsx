import { useState, useEffect } from 'react'

const TEAM = ['Nisrine Khoory', 'Moe Issa', 'Ahmad Zaazou', 'Ralph Baydoun', 'Unassigned']

const PRIORITIES = {
  high:   { label: 'High',   color: 'bg-red-100 text-red-700 border-red-200' },
  medium: { label: 'Medium', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  low:    { label: 'Low',    color: 'bg-slate-100 text-slate-600 border-slate-200' },
}

// Task types specific to this Lebanon Emergency Response Perception Study project
const TASK_TYPES = [
  { key: 'data_quality',     label: 'Data Quality',      color: 'bg-red-50 text-red-600 border-red-200',        dot: 'bg-red-400' },
  { key: 'field_ops',        label: 'Field Operations',  color: 'bg-orange-50 text-orange-600 border-orange-200', dot: 'bg-orange-400' },
  { key: 'enumerator',       label: 'Enumerator Issue',  color: 'bg-amber-50 text-amber-700 border-amber-200',   dot: 'bg-amber-400' },
  { key: 'coordination',     label: 'Coordination',      color: 'bg-blue-50 text-blue-600 border-blue-200',      dot: 'bg-blue-400' },
  { key: 'payment',          label: 'Payment',           color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-400' },
  { key: 'reporting',        label: 'Reporting',         color: 'bg-violet-50 text-violet-600 border-violet-200', dot: 'bg-violet-400' },
  { key: 'training',         label: 'Training',          color: 'bg-sky-50 text-sky-600 border-sky-200',         dot: 'bg-sky-400' },
  { key: 'technical',        label: 'Technical',         color: 'bg-slate-100 text-slate-600 border-slate-300',  dot: 'bg-slate-400' },
  { key: 'general',          label: 'General',           color: 'bg-gray-100 text-gray-500 border-gray-200',     dot: 'bg-gray-400' },
]
const TYPE_MAP = Object.fromEntries(TASK_TYPES.map(t => [t.key, t]))

const COLUMNS = [
  { key: 'todo',       label: 'To Do',       color: 'bg-slate-100', header: 'bg-slate-200 text-slate-700' },
  { key: 'inprogress', label: 'In Progress', color: 'bg-blue-50',   header: 'bg-blue-200 text-blue-800'  },
  { key: 'done',       label: 'Done',        color: 'bg-emerald-50',header: 'bg-emerald-200 text-emerald-800' },
]

// Render description: lines starting with - or • become bullet points
function Description({ text }) {
  if (!text) return null
  const lines = text.split('\n').filter(l => l.trim())
  return (
    <div className="text-xs text-slate-500 space-y-0.5 border-t border-slate-100 pt-2 mt-1">
      {lines.map((line, i) => {
        const isBullet = /^[-•*]/.test(line.trim())
        const content  = isBullet ? line.trim().replace(/^[-•*]\s*/, '') : line
        return isBullet
          ? <div key={i} className="flex items-start gap-1.5"><span className="text-slate-300 mt-0.5 shrink-0">•</span><span>{content}</span></div>
          : <p key={i}>{content}</p>
      })}
    </div>
  )
}

function TypeBadge({ typeKey }) {
  if (!typeKey) return null
  const t = TYPE_MAP[typeKey]
  if (!t) return null
  return (
    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full border ${t.color}`}>{t.label}</span>
  )
}

function TaskCard({ task, onStatusChange, onDelete }) {
  const pri = PRIORITIES[task.priority] || PRIORITIES.medium
  const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done'
  const hasDesc = !!task.description?.trim()

  return (
    <div className={`bg-white rounded-xl border shadow-sm space-y-2 ${overdue ? 'border-red-300' : 'border-slate-200'}`}>
      <div className="p-3 space-y-2">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-slate-800 leading-snug flex-1">{task.title}</p>
          <button onClick={() => onDelete(task.id)} className="text-slate-200 hover:text-red-400 transition-colors text-xs shrink-0 mt-0.5">✕</button>
        </div>

        {/* Description — always visible */}
        {hasDesc && <Description text={task.description} />}

        {/* Linked entity */}
        {task.linkedEntity && (
          <p className="text-xs text-blue-500 truncate">🔗 {task.linkedEntity}</p>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <TypeBadge typeKey={task.type} />
          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full border ${pri.color}`}>{pri.label}</span>
          {task.assignee && task.assignee !== 'Unassigned' && (
            <span className="text-[11px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded-full">
              👤 {task.assignee.split(' ')[0]}
            </span>
          )}
          {task.dueDate && (
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full border ${overdue ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
              📅 {new Date(task.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
            </span>
          )}
        </div>

        <p className="text-[10px] text-slate-400">By {task.createdBy} · {new Date(task.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</p>
      </div>

      {/* Move buttons */}
      <div className="flex gap-1 px-3 pb-2 border-t border-slate-100 pt-2">
        {COLUMNS.filter(c => c.key !== task.status).map(c => (
          <button key={c.key} onClick={() => onStatusChange(task.id, c.key)}
            className="flex-1 text-[11px] text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded px-1 py-0.5 transition-colors border border-transparent hover:border-blue-200">
            → {c.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Import from Email modal ───────────────────────────────────────────────────
function ImportEmailModal({ onClose, onImport }) {
  const [emailText, setEmailText] = useState('')
  const [parsing, setParsing]     = useState(false)
  const [preview, setPreview]     = useState(null)
  const [error, setError]         = useState(null)
  const [selected, setSelected]   = useState(new Set())

  async function handleParse() {
    if (!emailText.trim()) return
    setParsing(true); setError(null); setPreview(null)
    try {
      const res = await fetch('/api/tasks/parse-email', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Parse failed')
      setPreview(data.tasks)
      setSelected(new Set(data.tasks.map((_, i) => i)))
    } catch (e) {
      setError(e.message)
    } finally { setParsing(false) }
  }

  function toggleSelect(i) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800">📧 Import Tasks from Email</h3>
            <p className="text-xs text-slate-400 mt-0.5">Paste a client or supervisor email — Claude will extract action items as tasks</p>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-600 text-lg">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {!preview ? (
            <>
              <textarea
                autoFocus
                rows={10}
                placeholder="Paste the email here…"
                value={emailText}
                onChange={e => setEmailText(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono"
              />
              {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex justify-end">
                <button onClick={handleParse} disabled={parsing || !emailText.trim()}
                  className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 font-medium flex items-center gap-2">
                  {parsing
                    ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Analysing…</>
                    : '✨ Extract Tasks'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">{preview.length} task{preview.length !== 1 ? 's' : ''} found — select which to create:</p>
                <button onClick={() => setPreview(null)} className="text-xs text-slate-400 hover:underline">← Paste different email</button>
              </div>

              <div className="space-y-3">
                {preview.map((t, i) => {
                  const tp   = TYPE_MAP[t.type] || TYPE_MAP.general
                  const pri  = PRIORITIES[t.priority] || PRIORITIES.medium
                  const sel  = selected.has(i)
                  return (
                    <div key={i}
                      onClick={() => toggleSelect(i)}
                      className={`rounded-xl border p-3 cursor-pointer transition-all ${sel ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white opacity-60'}`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${sel ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                          {sel && <span className="text-white text-[10px] font-bold">✓</span>}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <p className="text-sm font-semibold text-slate-800">{t.title}</p>
                          {t.description && (
                            <div className="text-xs text-slate-500 space-y-0.5">
                              {t.description.split('\n').filter(l => l.trim()).map((line, j) => {
                                const isBullet = /^[-•]/.test(line.trim())
                                return isBullet
                                  ? <div key={j} className="flex gap-1.5"><span className="text-slate-300">•</span><span>{line.replace(/^[-•]\s*/, '')}</span></div>
                                  : <p key={j}>{line}</p>
                              })}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full border ${tp.color}`}>{tp.label}</span>
                            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full border ${pri.color}`}>{pri.label}</span>
                            {t.assignee && t.assignee !== 'Unassigned' && (
                              <span className="text-[11px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded-full">
                                👤 {t.assignee.split(' ')[0]}
                              </span>
                            )}
                            {t.linkedEntity && (
                              <span className="text-[11px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full">🔗 {t.linkedEntity}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                <p className="text-xs text-slate-400">{selected.size} of {preview.length} selected</p>
                <button
                  disabled={selected.size === 0}
                  onClick={() => onImport(preview.filter((_, i) => selected.has(i)))}
                  className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 font-medium">
                  Create {selected.size} Task{selected.size !== 1 ? 's' : ''}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TaskBoard({ currentUser }) {
  const [tasks, setTasks]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [filterType, setFilterType] = useState('all')
  const [form, setForm] = useState({
    title: '', description: '', type: 'general',
    assignee: 'Unassigned', priority: 'medium', dueDate: '', linkedEntity: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/tasks', { credentials: 'include' })
      .then(r => r.json()).then(setTasks).finally(() => setLoading(false))
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const task = await res.json()
      setTasks(prev => [task, ...prev])
      setForm({ title: '', description: '', type: 'general', assignee: 'Unassigned', priority: 'medium', dueDate: '', linkedEntity: '' })
      setShowForm(false)
    } finally { setSaving(false) }
  }

  async function handleStatusChange(id, status) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const updated = await res.json()
    setTasks(prev => prev.map(t => t.id === id ? updated : t))
  }

  async function handleDelete(id) {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE', credentials: 'include' })
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  async function handleImport(importedTasks) {
    const created = []
    for (const t of importedTasks) {
      const res = await fetch('/api/tasks', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...t, status: 'todo' }),
      })
      created.push(await res.json())
    }
    setTasks(prev => [...created, ...prev])
    setShowImport(false)
  }

  const filteredTasks = filterType === 'all' ? tasks : tasks.filter(t => t.type === filterType)

  const todoCount       = tasks.filter(t => t.status === 'todo').length
  const inProgressCount = tasks.filter(t => t.status === 'inprogress').length
  const doneCount       = tasks.filter(t => t.status === 'done').length

  // Only show type filters that have at least one task
  const activeTypes = TASK_TYPES.filter(tp => tasks.some(t => t.type === tp.key))

  return (
    <div className="space-y-5">

      {showImport && <ImportEmailModal onClose={() => setShowImport(false)} onImport={handleImport} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Team Task Board</h2>
          <p className="text-xs text-slate-400 mt-0.5">{todoCount} to do · {inProgressCount} in progress · {doneCount} done</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowImport(true); setShowForm(false) }}
            className="text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg transition-colors font-medium flex items-center gap-1.5"
          >
            📧 Import from Email
          </button>
          <button
            onClick={() => setShowForm(v => !v)}
            className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-medium"
          >
            {showForm ? '✕ Cancel' : '+ New Task'}
          </button>
        </div>
      </div>

      {/* Type filter chips — only shown when there are typed tasks */}
      {activeTypes.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setFilterType('all')}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${filterType === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
          >
            All ({tasks.length})
          </button>
          {activeTypes.map(tp => {
            const count = tasks.filter(t => t.type === tp.key).length
            return (
              <button key={tp.key}
                onClick={() => setFilterType(filterType === tp.key ? 'all' : tp.key)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors flex items-center gap-1.5 ${filterType === tp.key ? `${tp.color} font-bold` : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                <span className={`w-2 h-2 rounded-full ${tp.dot}`} />
                {tp.label} ({count})
              </button>
            )
          })}
        </div>
      )}

      {/* New task form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">New Task</p>

          {/* Title */}
          <input
            required
            placeholder="Task title…"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Description */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Description / Notes <span className="text-slate-300">(start lines with - for bullet points)</span></label>
            <textarea
              rows={3}
              placeholder={"- Key point one\n- Key point two\nOr just plain text…"}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </div>

          {/* Fields grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {TASK_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Assign to</label>
              <select value={form.assignee} onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {TEAM.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Due date</label>
              <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Link (optional)</label>
              <input placeholder="e.g. AZ01, Bchamoun…" value={form.linkedEntity} onChange={e => setForm(f => ({ ...f, linkedEntity: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving || !form.title.trim()}
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors font-medium">
              {saving ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
      )}

      {/* Kanban columns */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {COLUMNS.map(col => {
            const colTasks = filteredTasks.filter(t => t.status === col.key)
            return (
              <div key={col.key} className={`${col.color} rounded-xl p-3 space-y-3 min-h-[200px]`}>
                <div className={`${col.header} rounded-lg px-3 py-1.5 flex items-center justify-between`}>
                  <span className="text-xs font-bold uppercase tracking-wide">{col.label}</span>
                  <span className="text-xs font-bold">{colTasks.length}</span>
                </div>
                {colTasks.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">No tasks</p>
                )}
                {colTasks.map(task => (
                  <TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} onDelete={handleDelete} />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
