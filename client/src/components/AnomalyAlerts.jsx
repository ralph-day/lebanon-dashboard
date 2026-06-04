import { useState } from 'react'

function timeAgo(isoStr) {
  if (!isoStr) return '—'
  const mins = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m ago`
  return new Date(isoStr).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function SeverityIcon({ type }) {
  if (type === 'critical') return <span className="text-base">🔴</span>
  return <span className="text-base">🟡</span>
}

const TYPE_LABEL = {
  'Failed Survey':       { icon: '❌', cls: 'bg-red-100 text-red-700 border-red-200' },
  'Suspicious Pattern':  { icon: '🕵️', cls: 'bg-red-100 text-red-700 border-red-200' },
  'Too Fast':            { icon: '⚡', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  'Missing GPS':         { icon: '📍', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
}

export default function AnomalyAlerts({ anomalies = [] }) {
  const [expanded, setExpanded] = useState(null)
  const [dismissed, setDismissed] = useState(new Set())

  const visible = anomalies.filter(a => !dismissed.has(a.name))
  const criticalCount = visible.filter(a => a.critical.length > 0).length
  const totalCount = visible.length

  if (totalCount === 0) return (
    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3">
      <span className="text-emerald-500 text-lg">✓</span>
      <p className="text-sm text-emerald-700 font-medium">No anomalies detected — all enumerators within expected parameters</p>
    </div>
  )

  return (
    <div className={`rounded-xl border ${criticalCount > 0 ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
      {/* Header */}
      <div className="px-5 py-3 flex items-center gap-3 border-b border-current border-opacity-20">
        <span className="text-xl">{criticalCount > 0 ? '🚨' : '⚠️'}</span>
        <div className="flex-1">
          <p className={`font-bold text-sm ${criticalCount > 0 ? 'text-red-800' : 'text-amber-800'}`}>
            {criticalCount > 0
              ? `${criticalCount} enumerator${criticalCount > 1 ? 's' : ''} need${criticalCount === 1 ? 's' : ''} immediate attention`
              : `${totalCount} enumerator${totalCount > 1 ? 's' : ''} with warnings`}
          </p>
          <p className={`text-xs mt-0.5 ${criticalCount > 0 ? 'text-red-600' : 'text-amber-600'}`}>
            Contact them directly — issues detected in submitted surveys
          </p>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${criticalCount > 0 ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'}`}>
          {visible.reduce((s, a) => s + a.totalIssues, 0)} issues
        </span>
      </div>

      {/* Enumerator alert cards */}
      <div className="divide-y divide-current divide-opacity-10 px-3 pb-3 pt-2 space-y-2">
        {visible.map(a => {
          const isExpanded = expanded === a.name
          const hasCritical = a.critical.length > 0
          const allIssues = [...a.critical, ...a.warnings]

          return (
            <div key={a.name} className={`rounded-lg border bg-white ${hasCritical ? 'border-red-200' : 'border-amber-200'}`}>
              {/* Card header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-lg shrink-0">{hasCritical ? '🔴' : '🟡'}</span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800 text-sm">{a.name.split('(')[0].trim()}</span>
                    <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                      {a.name.match(/\((\w+)\)/)?.[1] || ''}
                    </span>
                    {hasCritical && (
                      <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                        {a.critical.length} critical
                      </span>
                    )}
                    {a.warnings.length > 0 && (
                      <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        {a.warnings.length} warning{a.warnings.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">Latest issue: {timeAgo(a.latestAt)}</p>
                </div>

                {/* Expand + dismiss */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : a.name)}
                  className="text-xs text-slate-400 hover:text-slate-600 shrink-0 px-1"
                >
                  {isExpanded ? '▲' : '▼'}
                </button>
                <button
                  onClick={() => setDismissed(s => new Set([...s, a.name]))}
                  className="text-xs text-slate-300 hover:text-slate-500 shrink-0"
                  title="Dismiss"
                >✕</button>
              </div>

              {/* Expanded issue list */}
              {isExpanded && (
                <div className="border-t border-slate-100 px-4 pb-3 pt-2 space-y-1.5">
                  {allIssues.slice(0, 8).map((issue, i) => {
                    const style = TYPE_LABEL[issue.type] || { icon: '⚠', cls: 'bg-slate-100 text-slate-600 border-slate-200' }
                    return (
                      <div key={i} className={`flex items-start gap-2 text-xs border rounded-lg px-3 py-2 ${style.cls}`}>
                        <span className="shrink-0 mt-0.5">{style.icon}</span>
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold">{issue.type}</span>
                          <span className="mx-1.5 text-current opacity-40">·</span>
                          <span>{issue.detail}</span>
                        </div>
                        <span className="shrink-0 opacity-60 whitespace-nowrap">{timeAgo(issue.submissionDate)}</span>
                      </div>
                    )
                  })}
                  {allIssues.length > 8 && (
                    <p className="text-xs text-slate-400 text-center pt-1">+{allIssues.length - 8} more issues — see Data Quality tab</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {dismissed.size > 0 && (
        <div className="px-5 pb-3 text-center">
          <button onClick={() => setDismissed(new Set())} className="text-xs text-slate-400 hover:text-slate-600 underline">
            Restore {dismissed.size} dismissed alert{dismissed.size > 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  )
}
