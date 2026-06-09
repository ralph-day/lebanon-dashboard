import { useEffect, useState } from 'react'

const SOURCE_LABEL = {
  mtvlebanonews: 'MTV Lebanon',
  nna_agencies:  'NNA',
  bintjbeilorg:  'Bint Jbeil',
}

function timeAgo(ms) {
  const diff = Date.now() - ms
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function countdown(expiresAt) {
  const ms = expiresAt - Date.now()
  if (ms <= 0) return null
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

function AlertCard({ alert }) {
  const [cd, setCd] = useState(() => countdown(alert.expiresAt))
  const isActive = Date.now() < alert.expiresAt

  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => setCd(countdown(alert.expiresAt)), 1000)
    return () => clearInterval(id)
  }, [alert.expiresAt, isActive])

  return (
    <div className={`rounded-xl border p-4 ${isActive ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-white'}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          {isActive && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white animate-pulse">
              🔴 ACTIVE
            </span>
          )}
          <span className="text-xs text-slate-400 font-medium">
            {SOURCE_LABEL[alert.source] || alert.source} · {timeAgo(alert.triggeredAt)}
          </span>
        </div>
        {isActive && cd && (
          <span className="text-xs font-mono text-red-500 font-semibold shrink-0">
            {cd} left
          </span>
        )}
      </div>

      <p className="text-sm font-semibold text-slate-800 leading-snug mb-3" dir="rtl">
        {alert.title}
      </p>

      {alert.areas?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {alert.areas.map(a => (
            <span key={a} className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
              📍 {a}
            </span>
          ))}
        </div>
      )}

      {alert.keywords?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {alert.keywords.map(k => (
            <span key={k} className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-500">
              {k}
            </span>
          ))}
        </div>
      )}

      {alert.link && (
        <a href={alert.link} target="_blank" rel="noreferrer"
           className="mt-3 inline-block text-xs text-blue-500 hover:underline">
          View source →
        </a>
      )}
    </div>
  )
}

export default function SecurityAlertsPanel() {
  const [active,  setActive]  = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    Promise.all([
      fetch('/api/security-alerts/active',  { credentials: 'include' }).then(r => r.json()),
      fetch('/api/security-alerts/history', { credentials: 'include' }).then(r => r.json()),
    ]).then(([a, h]) => {
      setActive(a)
      setHistory(h)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [])

  const allAlerts = history.length > 0 ? history : active

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Security Alerts</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Monitoring MTV Lebanon · NNA · Bint Jbeil — every 3 minutes
          </p>
        </div>
        <button onClick={load}
          className="text-xs text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors">
          ↻ Refresh
        </button>
      </div>

      {/* Active alert banner */}
      {active.length > 0 && (
        <div className="rounded-xl bg-red-600 text-white p-4 flex items-center gap-3 animate-pulse">
          <span className="text-2xl">🚨</span>
          <div>
            <p className="font-bold text-sm">
              {active.length} active evacuation {active.length === 1 ? 'alert' : 'alerts'}
            </p>
            <p className="text-xs opacity-85 mt-0.5">
              Affected areas: {[...new Set(active.flatMap(a => a.areas))].join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* No alerts */}
      {!loading && allAlerts.length === 0 && (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-10 text-center">
          <p className="text-3xl mb-3">✅</p>
          <p className="font-semibold text-slate-700">No security alerts in the last 24 hours</p>
          <p className="text-sm text-slate-400 mt-1">System is actively monitoring Telegram channels</p>
        </div>
      )}

      {/* Alert list */}
      {loading && (
        <div className="text-center py-12 text-slate-400 text-sm">Loading...</div>
      )}

      <div className="space-y-3">
        {allAlerts.map((alert, i) => (
          <AlertCard key={alert.link + alert.triggeredAt + i} alert={alert} />
        ))}
      </div>

      {/* Monitoring status */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Monitoring Channels</p>
        <div className="flex flex-wrap gap-2">
          {[
            { name: 'MTV Lebanon', handle: '@mtvlebanonews', color: 'bg-blue-50 text-blue-700 border-blue-100' },
            { name: 'NNA',         handle: '@nna_agencies',  color: 'bg-green-50 text-green-700 border-green-100' },
            { name: 'Bint Jbeil',  handle: '@bintjbeilorg',  color: 'bg-amber-50 text-amber-700 border-amber-100' },
          ].map(ch => (
            <div key={ch.handle} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${ch.color}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
              {ch.name}
              <span className="opacity-50 font-normal">{ch.handle}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
