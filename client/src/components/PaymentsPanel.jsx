import { useState, useEffect, useMemo } from 'react'

const STATUS_OPTS = ['Pending', 'Partial', 'Paid']
const STATUS_STYLE = {
  Paid:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  Partial: 'bg-amber-100 text-amber-700 border-amber-200',
  Pending: 'bg-slate-100 text-slate-500 border-slate-200',
}

function currency(n) {
  const num = parseFloat(n) || 0
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function StatusBadge({ status }) {
  const cls = STATUS_STYLE[status] || STATUS_STYLE.Pending
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{status || 'Pending'}</span>
}

// Inline editable cell
function EditableCell({ value, onSave, prefix = '', type = 'number', placeholder = '0' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  function commit() {
    setEditing(false)
    if (draft !== value) onSave(draft)
  }

  if (editing) return (
    <input
      autoFocus
      type={type}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      className="w-24 border border-blue-400 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      placeholder={placeholder}
    />
  )

  const display = type === 'text'
    ? (value ? value : <span className="text-slate-300">—</span>)
    : (parseFloat(value) > 0 ? prefix + parseFloat(value).toFixed(2) : <span className="text-slate-300">—</span>)

  return (
    <button onClick={() => { setDraft(value); setEditing(true) }}
      className="text-sm text-slate-700 hover:text-blue-600 hover:underline cursor-pointer text-left">
      {display}
    </button>
  )
}

const PARTICIPANT_RATE = 8   // $8 paid to each respondent on the spot
const DEFAULT_ENUM_RATE = 7  // $7 per accepted survey for the enumerator

export default function PaymentsPanel({ enumerators = [], qaRows = [], currentUser }) {
  const [payments, setPayments] = useState({ enumerators: [], coordination: [] })
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('enumerators')
  const [showCoordForm, setShowCoordForm] = useState(false)
  const [coordForm, setCoordForm] = useState({ name: '', role: '', amount: '', period: '', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/payments', { credentials: 'include' })
      .then(r => r.json()).then(setPayments).finally(() => setLoading(false))
  }, [])

  // Pre-index QA rows by enumerator code once — avoids re-filtering 2000 rows per enumerator per render
  const qaByCode = useMemo(() => {
    const map = {}
    qaRows.forEach(r => {
      const code = r.name?.match(/\((\w+)\)/)?.[1] || ''
      if (!code) return
      if (!map[code]) map[code] = []
      map[code].push(r)
    })
    return map
  }, [qaRows])

  // Merge enumerator list with stored payment data
  // Filter out Excel placeholder rows (no enumerator code in parentheses)
  const enumRows = useMemo(() => enumerators
    .filter(e => /\(\w+\)/.test(e.name))
    .map(e => {
      const code = e.name.match(/\((\w+)\)/)?.[1] || e.name
      const stored = payments.enumerators.find(p => p.code === code) || {}

      const myRows = qaByCode[code] || []
      const accepted = myRows.filter(r => (r.status || '').trim().toLowerCase() === 'accepted').length
      const rejected = myRows.filter(r => { const s = (r.status || '').trim().toLowerCase(); return s && s !== 'accepted' }).length
      const participantCost = (e.totalSurveys || 0) * PARTICIPANT_RATE

      const rate = parseFloat(stored.ratePerSurvey) || 0
      const otherCosts = parseFloat(stored.otherCosts) || 0
      const owed = (accepted * rate) + otherCosts   // survey earnings + any extra costs
      const paid = parseFloat(stored.amountPaid) || 0

      const status = stored.statusOverride || (
        paid === 0 && owed === 0 ? 'Pending'
        : paid >= owed && owed > 0 ? 'Paid'
        : paid > 0 ? 'Partial' : 'Pending'
      )
      return { name: e.name, code, accepted, rejected, participantCost, rate, otherCosts, owed, paid, status, notes: stored.notes || '' }
    }), [enumerators, qaByCode, payments])

  async function patchEnum(code, patch) {
    const res = await fetch(`/api/payments/enumerator/${code}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) return
    const updated = await res.json()
    setPayments(prev => {
      const list = prev.enumerators.filter(e => e.code !== code)
      return { ...prev, enumerators: [...list, updated] }
    })
  }

  async function createCoord(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/payments/coordination', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coordForm),
      })
      if (!res.ok) return
      const entry = await res.json()
      setPayments(prev => ({ ...prev, coordination: [...prev.coordination, entry] }))
      setCoordForm({ name: '', role: '', amount: '', period: '', notes: '' })
      setShowCoordForm(false)
    } finally { setSaving(false) }
  }

  async function patchCoord(id, patch) {
    const res = await fetch(`/api/payments/coordination/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) return
    const updated = await res.json()
    setPayments(prev => ({ ...prev, coordination: prev.coordination.map(e => e.id === id ? updated : e) }))
  }

  async function deleteCoord(id) {
    if (!confirm('Delete this payment record?')) return
    const res = await fetch(`/api/payments/coordination/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) return
    setPayments(prev => ({ ...prev, coordination: prev.coordination.filter(e => e.id !== id) }))
  }

  // Summary totals
  const enumTotalOwed        = enumRows.reduce((s, r) => s + r.owed, 0)
  const enumTotalPaid        = enumRows.reduce((s, r) => s + r.paid, 0)
  const totalParticipantCost = enumRows.reduce((s, r) => s + r.participantCost, 0)

  const coordTotalOwed = payments.coordination.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const coordTotalPaid = payments.coordination.reduce((s, r) => s + (parseFloat(r.amountPaid) || 0), 0)
  const coordBalance   = coordTotalOwed - coordTotalPaid

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Payments</h2>
          <p className="text-xs text-slate-400 mt-0.5">Track enumerator and coordination payments</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setActiveSection('enumerators')}
            className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors ${activeSection === 'enumerators' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            Enumerators
          </button>
          <button onClick={() => setActiveSection('coordination')}
            className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors ${activeSection === 'coordination' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            Coordination
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {activeSection === 'enumerators' && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Total Owed</p>
            <p className="text-2xl font-bold text-slate-800">{currency(enumTotalOwed)}</p>
          </div>
          <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4 text-center">
            <p className="text-xs text-emerald-600 uppercase tracking-wide mb-1">Total Paid</p>
            <p className="text-2xl font-bold text-emerald-700">{currency(enumTotalPaid)}</p>
          </div>
          <div className="bg-purple-50 rounded-xl border border-purple-100 p-4 text-center">
            <p className="text-xs text-purple-600 uppercase tracking-wide mb-1">Participant Cost</p>
            <p className="text-2xl font-bold text-purple-700">{currency(totalParticipantCost)}</p>
          </div>
        </div>
      )}

      {activeSection === 'coordination' && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Total Budget</p>
            <p className="text-2xl font-bold text-slate-800">{currency(coordTotalOwed)}</p>
          </div>
          <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4 text-center">
            <p className="text-xs text-emerald-600 uppercase tracking-wide mb-1">Total Paid</p>
            <p className="text-2xl font-bold text-emerald-700">{currency(coordTotalPaid)}</p>
          </div>
          <div className={`rounded-xl border p-4 text-center ${coordBalance > 0 ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-200'}`}>
            <p className={`text-xs uppercase tracking-wide mb-1 ${coordBalance > 0 ? 'text-amber-600' : 'text-slate-400'}`}>Outstanding</p>
            <p className={`text-2xl font-bold ${coordBalance > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{currency(coordBalance)}</p>
          </div>
        </div>
      )}

      {/* ── Enumerators table ─────────────────────────────────────────────────── */}
      {activeSection === 'enumerators' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <p className="text-xs text-slate-400">Click <strong>Rate / Survey</strong> to set each enumerator's rate manually · Rate is per <strong>accepted</strong> survey · Participant cost = total surveys × $8/respondent</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 900 }}>
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">Enumerator</th>
                  <th className="text-center text-xs font-semibold text-emerald-600 uppercase tracking-wide px-3 py-2.5">Accepted</th>
                  <th className="text-center text-xs font-semibold text-red-500 uppercase tracking-wide px-3 py-2.5">Rejected</th>
                  <th className="text-center text-xs font-semibold text-purple-600 uppercase tracking-wide px-3 py-2.5">Part. Cost</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Rate / Survey</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Other Costs</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Total Owed</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Amount Paid</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Status</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {enumRows.map(r => (
                  <tr key={r.code} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                    {/* Accepted */}
                    <td className="px-3 py-3 text-center">
                      <span className="font-semibold text-emerald-600">{r.accepted}</span>
                    </td>
                    {/* Rejected */}
                    <td className="px-3 py-3 text-center">
                      {r.rejected > 0
                        ? <span className="font-semibold text-red-500">{r.rejected}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    {/* Participant cost */}
                    <td className="px-3 py-3 text-center">
                      <span className="font-semibold text-purple-600">{currency(r.participantCost)}</span>
                      {r.rejected > 0 && (
                        <span className="block text-xs text-red-400 mt-0.5">
                          incl. {currency(r.rejected * PARTICIPANT_RATE)} rejected
                        </span>
                      )}
                    </td>
                    {/* Rate */}
                    <td className="px-3 py-3 text-center">
                      <EditableCell value={r.rate} prefix="$"
                        onSave={v => patchEnum(r.code, { ratePerSurvey: parseFloat(v) || 0 })} />
                    </td>
                    {/* Other costs */}
                    <td className="px-3 py-3 text-center">
                      <EditableCell value={r.otherCosts} prefix="$"
                        onSave={v => patchEnum(r.code, { otherCosts: parseFloat(v) || 0 })} />
                    </td>
                    {/* Total owed */}
                    <td className="px-3 py-3 text-center font-semibold text-slate-700">
                      {r.owed > 0 ? currency(r.owed) : <span className="text-slate-300">—</span>}
                    </td>
                    {/* Amount paid */}
                    <td className="px-3 py-3 text-center">
                      <EditableCell value={r.paid} prefix="$"
                        onSave={v => patchEnum(r.code, { amountPaid: parseFloat(v) || 0 })} />
                    </td>
                    {/* Status */}
                    <td className="px-3 py-3 text-center">
                      <select value={r.status}
                        onChange={e => patchEnum(r.code, { statusOverride: e.target.value })}
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full border cursor-pointer focus:outline-none ${STATUS_STYLE[r.status]}`}>
                        {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    {/* Notes */}
                    <td className="px-3 py-3">
                      <EditableCell value={r.notes} type="text" placeholder="Add note…"
                        onSave={v => patchEnum(r.code, { notes: v })} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Total</td>
                  <td className="px-3 py-3 text-center font-bold text-emerald-600">{enumRows.reduce((s,r)=>s+r.accepted,0)}</td>
                  <td className="px-3 py-3 text-center font-bold text-red-500">{enumRows.reduce((s,r)=>s+r.rejected,0) || '—'}</td>
                  <td className="px-3 py-3 text-center font-bold text-purple-700">{currency(totalParticipantCost)}</td>
                  <td className="px-3 py-3" />{/* rate */}
                  <td className="px-3 py-3" />{/* other costs */}
                  <td className="px-3 py-3 text-center font-bold text-slate-800">{currency(enumTotalOwed)}</td>
                  <td className="px-3 py-3 text-center font-bold text-emerald-700">{currency(enumTotalPaid)}</td>
                  <td className="px-3 py-3" />{/* status */}
                  <td className="px-3 py-3" />{/* notes */}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Coordination table ───────────────────────────────────────────────── */}
      {activeSection === 'coordination' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowCoordForm(v => !v)}
              className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-medium">
              {showCoordForm ? '✕ Cancel' : '+ Add Person'}
            </button>
          </div>

          {showCoordForm && (
            <form onSubmit={createCoord} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-700">New Coordination Payment</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Name</label>
                  <input required value={coordForm.name} onChange={e => setCoordForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Nisrine Khoory"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Role</label>
                  <input value={coordForm.role} onChange={e => setCoordForm(f => ({ ...f, role: e.target.value }))}
                    placeholder="e.g. Field Coordinator"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Amount ($)</label>
                  <input type="number" required value={coordForm.amount} onChange={e => setCoordForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Period</label>
                  <input value={coordForm.period} onChange={e => setCoordForm(f => ({ ...f, period: e.target.value }))}
                    placeholder="e.g. June 2026"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Notes</label>
                  <input value={coordForm.notes} onChange={e => setCoordForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Optional"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={saving}
                  className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 font-medium">
                  {saving ? 'Adding…' : 'Add Record'}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {payments.coordination.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">No coordination payment records yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 700 }}>
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">Name</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Role</th>
                      <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Period</th>
                      <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Amount</th>
                      <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Paid</th>
                      <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Balance</th>
                      <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.coordination.map(r => {
                      const owed    = parseFloat(r.amount) || 0
                      const paid    = parseFloat(r.amountPaid) || 0
                      const balance = owed - paid
                      const status  = r.status || (paid >= owed && owed > 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Pending')
                      return (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                          <td className="px-3 py-3 text-slate-500 text-xs">{r.role || '—'}</td>
                          <td className="px-3 py-3 text-center text-xs text-slate-500">{r.period || '—'}</td>
                          <td className="px-3 py-3 text-center font-semibold text-slate-700">{currency(owed)}</td>
                          <td className="px-3 py-3 text-center">
                            <EditableCell value={paid} prefix="$"
                              onSave={v => patchCoord(r.id, { amountPaid: parseFloat(v) || 0 })} />
                          </td>
                          <td className="px-3 py-3 text-center">
                            {balance > 0
                              ? <span className="font-semibold text-amber-600">{currency(balance)}</span>
                              : balance < 0
                                ? <span className="font-semibold text-blue-500">{currency(Math.abs(balance))} over</span>
                                : <span className="text-emerald-500 font-semibold">✓ Settled</span>}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <select value={status}
                              onChange={e => patchCoord(r.id, { status: e.target.value })}
                              className={`text-xs font-semibold px-2 py-0.5 rounded-full border cursor-pointer focus:outline-none ${STATUS_STYLE[status]}`}>
                              {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <button onClick={() => deleteCoord(r.id)} className="text-slate-200 hover:text-red-400 text-xs transition-colors">✕</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
