import { useState, useEffect } from 'react'

const TEAM = ['Nisrine Khoory', 'Moe Issa', 'Ahmad Zaazou', 'Ralph Baydoun', 'Unassigned']
const PRIORITIES = { high: { label: 'High', color: 'bg-red-100 text-red-700 border-red-200' }, medium: { label: 'Medium', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' }, low: { label: 'Low', color: 'bg-slate-100 text-slate-600 border-slate-200' } }
const COLUMNS = [
  { key: 'todo',        label: 'To Do',       color: 'bg-slate-100', header: 'bg-slate-200 text-slate-700' },
  { key: 'inprogress',  label: 'In Progress',  color: 'bg-blue-50',   header: 'bg-blue-200 text-blue-800'  },
  { key: 'done',        label: 'Done',         color: 'bg-emerald-50',header: 'bg-emerald-200 text-emerald-800' },
]

function TaskCard({ task, onStatusChange, onDelete }) {
  const pri = PRIORITIES[task.priority] || PRIORITIES.medium
  const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done'
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-3 shadow-sm space-y-2 ${overdue ? 'border-red-300' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-800 leading-snug flex-1">{task.title}</p>
        <button onClick={() => onDelete(task.id)} className="text-slate-200 hover:text-red-400 transition-colors text-xs shrink-0 mt-0.5">✕</button>
      </div>

      {task.linkedEntity && (
        <p className="text-xs text-blue-500 truncate">🔗 {task.linkedEntity}</p>
      )}

      <div className="flex flex-wrap gap-1.5 items-center">
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

      {/* Move buttons */}
      <div className="flex gap-1 pt-1 border-t border-slate-100">
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

export default function TaskBoard({ currentUser }) {
  const [tasks, setTasks]     = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]       = useState({ title: '', assignee: 'Unassigned', priority: 'medium', dueDate: '', linkedEntity: '' })
  const [saving, setSaving]   = useState(false)

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
      setForm({ title: '', assignee: 'Unassigned', priority: 'medium', dueDate: '', linkedEntity: '' })
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

  const todoCount      = tasks.filter(t => t.status === 'todo').length
  const inProgressCount= tasks.filter(t => t.status === 'inprogress').length
  const doneCount      = tasks.filter(t => t.status === 'done').length

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Team Task Board</h2>
          <p className="text-xs text-slate-400 mt-0.5">{todoCount} to do · {inProgressCount} in progress · {doneCount} done</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-medium"
        >
          {showForm ? '✕ Cancel' : '+ New Task'}
        </button>
      </div>

      {/* New task form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">New Task</p>
          <input
            required
            placeholder="Task title…"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
              <input placeholder="e.g. HI04, Bchamoun…" value={form.linkedEntity} onChange={e => setForm(f => ({ ...f, linkedEntity: e.target.value }))}
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

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {COLUMNS.map(col => {
            const colTasks = tasks.filter(t => t.status === col.key)
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
