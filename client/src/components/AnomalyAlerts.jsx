import { useState } from 'react'

// submissionDate is naive Lebanon wall-clock digits (UTC+3, no zone). Parse as
// UTC then subtract 3h to get the real instant — independent of the viewer's timezone.
function realMs(isoStr) {
  if (!isoStr) return null
  const hasZone = /[zZ]$|[+-]\d\d:?\d\d$/.test(isoStr)
  const ms = Date.parse(hasZone ? isoStr : isoStr + 'Z')
  return isNaN(ms) ? null : ms - 3 * 3600000
}

function timeAgo(isoStr) {
  const ms = realMs(isoStr)
  if (ms == null) return '—'
  const mins = Math.max(0, Math.floor((Date.now() - ms) / 60000))
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m ago`
  return `${Math.floor(mins / 1440)}d ago`
}

// Exact Lebanon wall-clock time of submission, e.g. "16 Jun 18:42".
function lebanonTime(isoStr) {
  if (!isoStr) return '—'
  const hasZone = /[zZ]$|[+-]\d\d:?\d\d$/.test(isoStr)
  const d = new Date(hasZone ? isoStr : isoStr + 'Z')
  return isNaN(d) ? '—' : d.toLocaleString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
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

function IssueModal({ enumeratorName, issue, onClose }) {
  if (!issue) return null
  const style = TYPE_LABEL[issue.type] || { icon: '⚠', cls: 'bg-slate-100 text-slate-600 border-slate-200' }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{style.icon}</span>
            <div>
              <p className="font-bold text-slate-800 text-sm">{issue.type}</p>
              <p className="text-xs text-slate-400">{enumeratorName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>
        <div className={`text-sm border rounded-lg px-3 py-2 ${style.cls}`}>
          {issue.detail}
        </div>
        <p className="text-xs text-slate-400 mt-3">Submitted: {lebanonTime(issue.submissionDate)} ({timeAgo(issue.submissionDate)})</p>
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-lg">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AnomalyAlerts({ anomalies = [], navigate, onOpenSurvey }) {
  const [expanded, setExpanded] = useState(null)
  const [dismissed, setDismissed] = useState(new Set())
  const [activeIssue, setActiveIssue] = useState(null)

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
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 rounded-t-lg"
                onClick={() => {
                  const code = a.name.match(/\((\w+)\)/)?.[1]
                  if (code) navigate?.(`/enumerator/${code}`)
                }}
                title="View enumerator stats"
              >
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
                  <p className="text-xs text-slate-400 mt-0.5">Latest issue: {lebanonTime(a.latestAt)} ({timeAgo(a.latestAt)})</p>
                </div>

                {/* Phone + WhatsApp CTAs */}
                {a.phone && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={`tel:+961${a.phone}`}
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 rounded-lg transition-colors"
                    >
                      📞 {a.phone}
                    </a>
                    <a
                      href={`https://wa.me/961${a.phone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1.5 text-xs font-semibold bg-[#25D366] hover:bg-[#1ebe5d] text-white px-3 py-2 rounded-lg transition-colors"
                      title="Message on WhatsApp"
                    >
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                      WA
                    </a>
                  </div>
                )}

                {/* Expand + dismiss */}
                <button
                  onClick={e => { e.stopPropagation(); setExpanded(isExpanded ? null : a.name) }}
                  className="text-xs text-slate-400 hover:text-slate-600 shrink-0 px-1"
                >
                  {isExpanded ? '▲' : '▼'}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setDismissed(s => new Set([...s, a.name])) }}
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
                      <div
                        key={i}
                        onClick={e => {
                          e.stopPropagation()
                          if (issue.id && onOpenSurvey) onOpenSurvey(issue.id)
                          else setActiveIssue({ enumeratorName: a.name.split('(')[0].trim(), issue })
                        }}
                        className={`flex items-start gap-2 text-xs border rounded-lg px-3 py-2 cursor-pointer hover:opacity-80 ${style.cls}`}
                        title={issue.id ? 'Click to view section-by-section timing' : undefined}
                      >
                        <span className="shrink-0 mt-0.5">{style.icon}</span>
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold">{issue.type}</span>
                          <span className="mx-1.5 text-current opacity-40">·</span>
                          <span>{issue.detail}</span>
                          {issue.id && (
                            <span className="ml-1.5 font-mono opacity-60">#{issue.id.replace(/^uuid:/, '').slice(0, 8)}</span>
                          )}
                        </div>
                        <span className="shrink-0 opacity-60 whitespace-nowrap" title={timeAgo(issue.submissionDate)}>{lebanonTime(issue.submissionDate)}</span>
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

      <IssueModal
        enumeratorName={activeIssue?.enumeratorName}
        issue={activeIssue?.issue}
        onClose={() => setActiveIssue(null)}
      />
    </div>
  )
}
