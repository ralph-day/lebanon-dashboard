import { useState, useEffect, useRef } from 'react'

export default function NotesBubble({ entityType, entityId, entityLabel, allNotes, onNoteAdded, onNoteDeleted, currentUser }) {
  const [open, setOpen]     = useState(false)
  const [text, setText]     = useState('')
  const [saving, setSaving] = useState(false)
  const [pos, setPos]       = useState(null)
  const ref = useRef(null)
  const btnRef = useRef(null)

  const myNotes = allNotes.filter(n => n.entityType === entityType && n.entityId === entityId)

  // Open the popup positioned (fixed) just below the button, clamped to the
  // viewport so it never overflows off-screen regardless of where the bubble is.
  const W = 288
  function openPopup() {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) {
      const left = Math.min(Math.max(8, r.left), window.innerWidth - W - 8)
      const top = Math.min(r.bottom + 6, window.innerHeight - 80)
      setPos({ top, left })
    }
    setOpen(true)
  }

  // Close on outside click or scroll
  useEffect(() => {
    if (!open) return
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', handler)
    window.addEventListener('scroll', onScroll, true)
    return () => { document.removeEventListener('mousedown', handler); window.removeEventListener('scroll', onScroll, true) }
  }, [open])

  async function handleAdd(e) {
    e.preventDefault()
    if (!text.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ entityType, entityId, entityLabel, text }),
      })
      const note = await res.json()
      onNoteAdded(note)
      setText('')
    } finally { setSaving(false) }
  }

  async function handleDelete(id) {
    await fetch(`/api/notes/${id}`, { method: 'DELETE', credentials: 'include' })
    onNoteDeleted(id)
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        ref={btnRef}
        onClick={e => { e.stopPropagation(); open ? setOpen(false) : openPopup() }}
        className={`inline-flex items-center gap-1 text-xs rounded-full px-1.5 py-0.5 transition-colors ${
          myNotes.length > 0
            ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
            : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'
        }`}
        title={myNotes.length > 0 ? `${myNotes.length} note${myNotes.length > 1 ? 's' : ''}` : 'Add note'}
      >
        💬{myNotes.length > 0 && <span className="font-semibold">{myNotes.length}</span>}
      </button>

      {open && pos && (
        <div
          className="z-50 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-3 space-y-2"
          style={{ position: 'fixed', top: pos.top, left: pos.left }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-1 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-700 truncate max-w-[200px]">{entityLabel}</p>
            <button onClick={() => setOpen(false)} className="text-slate-300 hover:text-slate-500 text-sm">✕</button>
          </div>

          {/* Existing notes */}
          {myNotes.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-1">No notes yet</p>
          )}
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {myNotes.map(n => (
              <div key={n.id} className="bg-slate-50 rounded-lg px-2.5 py-2 text-xs group relative">
                <p className="text-slate-700 pr-5">{n.text}</p>
                <p className="text-slate-400 mt-0.5">{n.author} · {new Date(n.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                <button
                  onClick={() => handleDelete(n.id)}
                  className="absolute top-1.5 right-1.5 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                >✕</button>
              </div>
            ))}
          </div>

          {/* Add note */}
          <form onSubmit={handleAdd} className="flex gap-1.5 pt-1 border-t border-slate-100">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Add a note…"
              className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <button
              type="submit"
              disabled={saving || !text.trim()}
              className="bg-blue-600 text-white text-xs px-2.5 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              {saving ? '…' : 'Add'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
