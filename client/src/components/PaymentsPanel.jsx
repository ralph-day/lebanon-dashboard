import { useState, useEffect, useMemo } from 'react'

const STATUS_OPTS = ['Pending', 'Partial', 'Paid']
const STATUS_STYLE = {
  Paid:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  Partial: 'bg-amber-100 text-amber-700 border-amber-200',
  Pending: 'bg-slate-100 text-slate-500 border-slate-200',
}

const PARTICIPANT_RATE  = 8   // $8 paid to each respondent on the spot
const FORECAST_ENUM_RATE = 5  // $5/survey forecast rate for remaining sample
const TOTAL_TARGET      = 1000

function currency(n) {
  const num = parseFloat(n) || 0
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function StatusSelect({ status, onChange }) {
  const cls = STATUS_STYLE[status] || STATUS_STYLE.Pending
  return (
    <select value={status} onChange={e => onChange(e.target.value)}
      className={`text-xs font-semibold px-2 py-0.5 rounded-full border cursor-pointer focus:outline-none ${cls}`}>
      {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
    </select>
  )
}

function EditableCell({ value, onSave, prefix = '', type = 'number', placeholder = '0' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  function commit() {
    setEditing(false)
    if (draft !== value) onSave(draft)
  }

  if (editing) return (
    <input autoFocus type={type} value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      className="w-24 border border-blue-400 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      placeholder={placeholder} />
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

// Collapsible accordion section
function Section({ title, subtitle, badge, badgeColor = 'bg-slate-100 text-slate-600', defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-800">{title}</span>
          {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
          {badge !== undefined && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
          )}
        </div>
        <span className={`text-slate-400 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && <div className="border-t border-slate-100">{children}</div>}
    </div>
  )
}

export default function PaymentsPanel({ enumerators = [], qaRows = [], currentUser }) {
  const [payments, setPayments] = useState({ enumerators: [], coordination: [], flatFees: [], saveLog: [] })
  const [loading, setLoading]   = useState(true)
  const [savingCheckpoint, setSavingCheckpoint] = useState(false)
  const [showLog, setShowLog]   = useState(false)

  useEffect(() => {
    fetch('/api/payments', { credentials: 'include' })
      .then(r => r.json()).then(setPayments).finally(() => setLoading(false))
  }, [])

  // Pre-index QA rows by enumerator code
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

  const enumRows = useMemo(() => enumerators
    .filter(e => /\(\w+\)/.test(e.name))
    .map(e => {
      const code   = e.name.match(/\((\w+)\)/)?.[1] || e.name
      const stored = payments.enumerators.find(p => p.code === code) || {}
      const myRows = qaByCode[code] || []
      const accepted = myRows.filter(r => (r.status || '').trim().toLowerCase() === 'accepted').length
      const rejected = myRows.filter(r => { const s = (r.status || '').trim().toLowerCase(); return s && s !== 'accepted' }).length
      const participantCost = (e.totalSurveys || 0) * PARTICIPANT_RATE
      const rate      = parseFloat(stored.ratePerSurvey) || 0
      const otherCosts = parseFloat(stored.otherCosts)   || 0
      const owed      = (accepted * rate) + otherCosts
      const paid      = parseFloat(stored.amountPaid)    || 0
      const status    = stored.statusOverride || (
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
    setPayments(prev => ({ ...prev, enumerators: [...prev.enumerators.filter(e => e.code !== code), updated] }))
  }

  async function patchFlatFee(id, patch) {
    const res = await fetch(`/api/payments/flat-fee/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) return
    const updated = await res.json()
    setPayments(prev => ({ ...prev, flatFees: prev.flatFees.map(f => f.id === id ? updated : f) }))
  }

  async function saveCheckpoint() {
    setSavingCheckpoint(true)
    try {
      const res = await fetch('/api/payments/save', { method: 'POST', credentials: 'include' })
      if (!res.ok) return
      const { saveLog } = await res.json()
      setPayments(prev => ({ ...prev, saveLog }))
    } finally { setSavingCheckpoint(false) }
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const enumTotalOwed        = enumRows.reduce((s, r) => s + r.owed, 0)
  const enumTotalPaid        = enumRows.reduce((s, r) => s + r.paid, 0)
  const totalParticipantCost = enumRows.reduce((s, r) => s + r.participantCost, 0)
  const totalAccepted        = enumRows.reduce((s, r) => s + r.accepted, 0)

  const flatFees     = payments.flatFees || []
  const flatTotalOwed = flatFees.reduce((s, f) => s + (parseFloat(f.amount) || 0), 0)
  const flatTotalPaid = flatFees.reduce((s, f) => s + (parseFloat(f.amountPaid) || 0), 0)

  const grandTotalOwed = enumTotalOwed + flatTotalOwed
  const grandTotalPaid = enumTotalPaid + flatTotalPaid

  // ── Forecast ──────────────────────────────────────────────────────────────
  const remaining            = Math.max(0, TOTAL_TARGET - totalAccepted)
  const forecastParticipant  = remaining * PARTICIPANT_RATE
  const forecastEnum         = remaining * FORECAST_ENUM_RATE
  const forecastTotal        = forecastParticipant + forecastEnum

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>

  return (
    <div className="space-y-4">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Payments</h2>
          <p className="text-xs text-slate-400 mt-0.5">Budget tracking for the Lebanon Emergency Response Perception Study</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={saveCheckpoint} disabled={savingCheckpoint}
            className="flex items-center gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg transition-colors">
            {savingCheckpoint ? '…' : '💾'} Save
          </button>
          {(payments.saveLog?.length > 0) && (
            <div className="relative">
              <button onClick={() => setShowLog(v => !v)}
                className="text-xs text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg px-3 py-2 transition-colors whitespace-nowrap">
                Last saved by <strong>{payments.saveLog[0].savedBy}</strong> · {new Date(payments.saveLog[0].savedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </button>
              {showLog && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 w-72 p-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Save History</p>
                  {payments.saveLog.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-slate-600">
                      <span className="font-medium">{s.savedBy}</span>
                      <span className="text-slate-400">{new Date(s.savedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Grand total summary cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Total Budget</p>
          <p className="text-2xl font-bold text-slate-800">{currency(grandTotalOwed)}</p>
          <p className="text-xs text-slate-400 mt-0.5">enumerators + fees</p>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4 text-center">
          <p className="text-xs text-emerald-600 uppercase tracking-wide mb-1">Total Paid</p>
          <p className="text-2xl font-bold text-emerald-700">{currency(grandTotalPaid)}</p>
          <p className="text-xs text-emerald-500 mt-0.5">{currency(grandTotalOwed - grandTotalPaid)} remaining</p>
        </div>
        <div className="bg-purple-50 rounded-xl border border-purple-100 p-4 text-center">
          <p className="text-xs text-purple-600 uppercase tracking-wide mb-1">Participant Cost</p>
          <p className="text-2xl font-bold text-purple-700">{currency(totalParticipantCost)}</p>
          <p className="text-xs text-purple-400 mt-0.5">{totalAccepted + enumRows.reduce((s,r)=>s+r.rejected,0)} surveys × $8</p>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-100 p-4 text-center">
          <p className="text-xs text-amber-600 uppercase tracking-wide mb-1">Forecast Remaining</p>
          <p className="text-2xl font-bold text-amber-700">{currency(forecastTotal)}</p>
          <p className="text-xs text-amber-500 mt-0.5">{remaining} surveys left</p>
        </div>
      </div>

      {/* ── Section 1: Enumerators ────────────────────────────────────────────── */}
      <Section
        title="Enumerators"
        subtitle={`${enumRows.length} field staff`}
        badge={currency(enumTotalOwed) + ' owed'}
        badgeColor="bg-slate-100 text-slate-600"
      >
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100">
          <p className="text-xs text-slate-400">Click <strong>Rate / Survey</strong> to set each enumerator's rate · Rate applies to <strong>accepted</strong> surveys only · Participant cost = total surveys × $8</p>
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
                  <td className="px-3 py-3 text-center"><span className="font-semibold text-emerald-600">{r.accepted}</span></td>
                  <td className="px-3 py-3 text-center">
                    {r.rejected > 0 ? <span className="font-semibold text-red-500">{r.rejected}</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="font-semibold text-purple-600">{currency(r.participantCost)}</span>
                    {r.rejected > 0 && <span className="block text-xs text-red-400 mt-0.5">incl. {currency(r.rejected * PARTICIPANT_RATE)} rejected</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <EditableCell value={r.rate} prefix="$" onSave={v => patchEnum(r.code, { ratePerSurvey: parseFloat(v) || 0 })} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <EditableCell value={r.otherCosts} prefix="$" onSave={v => patchEnum(r.code, { otherCosts: parseFloat(v) || 0 })} />
                  </td>
                  <td className="px-3 py-3 text-center font-semibold text-slate-700">
                    {r.owed > 0 ? currency(r.owed) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <EditableCell value={r.paid} prefix="$" onSave={v => patchEnum(r.code, { amountPaid: parseFloat(v) || 0 })} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <StatusSelect status={r.status} onChange={v => patchEnum(r.code, { statusOverride: v })} />
                  </td>
                  <td className="px-3 py-3">
                    <EditableCell value={r.notes} type="text" placeholder="Add note…" onSave={v => patchEnum(r.code, { notes: v })} />
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
                <td className="px-3 py-3" />
                <td className="px-3 py-3" />
                <td className="px-3 py-3 text-center font-bold text-slate-800">{currency(enumTotalOwed)}</td>
                <td className="px-3 py-3 text-center font-bold text-emerald-700">{currency(enumTotalPaid)}</td>
                <td className="px-3 py-3" />
                <td className="px-3 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>

      {/* ── Section 2: Fixed Fees ─────────────────────────────────────────────── */}
      <Section
        title="Fixed Fees"
        subtitle="Organisation & coordinator flat fees"
        badge={currency(flatTotalOwed) + ' total'}
        badgeColor="bg-blue-50 text-blue-600"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Name</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Role</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Fee</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Amount Paid</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Balance</th>
                <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Status</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2.5">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {flatFees.map(f => {
                const owed    = parseFloat(f.amount)     || 0
                const paid    = parseFloat(f.amountPaid) || 0
                const balance = owed - paid
                return (
                  <tr key={f.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800">{f.name}</td>
                    <td className="px-3 py-3 text-xs text-slate-500">{f.role}</td>
                    <td className="px-3 py-3 text-center font-semibold text-slate-700">
                      <EditableCell value={owed} prefix="$" onSave={v => patchFlatFee(f.id, { amount: parseFloat(v) || 0 })} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <EditableCell value={paid} prefix="$" onSave={v => patchFlatFee(f.id, { amountPaid: parseFloat(v) || 0 })} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      {balance > 0
                        ? <span className="font-semibold text-amber-600">{currency(balance)}</span>
                        : balance < 0
                          ? <span className="font-semibold text-blue-500">{currency(Math.abs(balance))} over</span>
                          : <span className="text-emerald-500 font-semibold text-xs">✓ Settled</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <StatusSelect status={f.status || 'Pending'} onChange={v => patchFlatFee(f.id, { status: v })} />
                    </td>
                    <td className="px-3 py-3">
                      <EditableCell value={f.notes || ''} type="text" placeholder="Add note…" onSave={v => patchFlatFee(f.id, { notes: v })} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
              <tr>
                <td colSpan={2} className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Total</td>
                <td className="px-3 py-3 text-center font-bold text-slate-800">{currency(flatTotalOwed)}</td>
                <td className="px-3 py-3 text-center font-bold text-emerald-700">{currency(flatTotalPaid)}</td>
                <td className="px-3 py-3 text-center font-bold text-amber-600">{currency(flatTotalOwed - flatTotalPaid)}</td>
                <td colSpan={2} className="px-3 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>

      {/* ── Section 3: Forecast ──────────────────────────────────────────────── */}
      <Section
        title="Forecast — Remaining Sample"
        subtitle={`${totalAccepted} / ${TOTAL_TARGET} collected`}
        badge={remaining > 0 ? `${remaining} left` : '✓ Target reached'}
        badgeColor={remaining > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}
        defaultOpen={remaining > 0}
      >
        <div className="p-5 space-y-4">
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>{totalAccepted} accepted</span>
              <span>Target: {TOTAL_TARGET}</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, (totalAccepted / TOTAL_TARGET) * 100).toFixed(1)}%` }} />
            </div>
            <p className="text-xs text-slate-400 mt-1">{((totalAccepted / TOTAL_TARGET) * 100).toFixed(1)}% complete · {remaining} surveys remaining</p>
          </div>

          {remaining > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-purple-50 rounded-xl border border-purple-100 p-4 text-center">
                  <p className="text-xs text-purple-600 uppercase tracking-wide mb-1">Participant Cost</p>
                  <p className="text-xl font-bold text-purple-700">{currency(forecastParticipant)}</p>
                  <p className="text-xs text-purple-400 mt-1">{remaining} × $8/respondent</p>
                </div>
                <div className="bg-blue-50 rounded-xl border border-blue-100 p-4 text-center">
                  <p className="text-xs text-blue-600 uppercase tracking-wide mb-1">Enumerator Cost</p>
                  <p className="text-xl font-bold text-blue-700">{currency(forecastEnum)}</p>
                  <p className="text-xs text-blue-400 mt-1">{remaining} × $5/survey</p>
                </div>
                <div className="bg-amber-50 rounded-xl border border-amber-100 p-4 text-center">
                  <p className="text-xs text-amber-600 uppercase tracking-wide mb-1">Total Additional Cost</p>
                  <p className="text-xl font-bold text-amber-700">{currency(forecastTotal)}</p>
                  <p className="text-xs text-amber-400 mt-1">participants + enumerators</p>
                </div>
              </div>
              <p className="text-xs text-slate-400 bg-slate-50 rounded-lg p-3">
                <strong>Forecast assumptions:</strong> $8 per participant (on the spot) · $5 per accepted survey for enumerators · Additional costs not included yet — add once confirmed.
              </p>
            </>
          ) : (
            <div className="text-center py-6 text-emerald-600 font-semibold">
              🎉 Sample target of {TOTAL_TARGET} reached!
            </div>
          )}
        </div>
      </Section>

    </div>
  )
}
