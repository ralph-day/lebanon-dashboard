import { useEffect, useState } from 'react'

function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatValue(v) {
  if (v === true || v === 1 || v === '1') return 'Yes'
  if (v === false || v === 0 || v === '0') return 'No'
  return String(v)
}

export default function SurveyDetailModal({ surveyId, onClose }) {
  const [detail, setDetail] = useState(null)
  const [error, setError]   = useState(null)
  const [openSections, setOpenSections] = useState(new Set())

  useEffect(() => {
    if (!surveyId) return
    setDetail(null)
    setError(null)
    fetch(`/api/survey/${encodeURIComponent(surveyId)}`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(r.status === 404 ? 'Survey not found' : 'Failed to load survey'); return r.json() })
      .then(d => {
        setDetail(d)
        // Open all sections that have answers by default
        setOpenSections(new Set(d.sections.filter(s => s.answerCount > 0).map(s => s.key)))
      })
      .catch(e => setError(e.message))
  }, [surveyId])

  if (!surveyId) return null

  const toggleSection = key => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const mapUrl = detail?.gps?.lat && detail?.gps?.lng
    ? `https://www.google.com/maps?q=${detail.gps.lat},${detail.gps.lng}`
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/40 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full my-8" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-xl z-10">
          <div>
            <h2 className="font-bold text-slate-800 text-base">Survey Detail</h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5 break-all">{surveyId}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none shrink-0">✕</button>
        </div>

        {error && (
          <div className="p-5 text-sm text-red-600">{error}</div>
        )}

        {!detail && !error && (
          <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
        )}

        {detail && (
          <div className="p-5 space-y-4">
            {/* Meta info */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-slate-400 mb-0.5">Enumerator</p>
                <p className="font-semibold text-slate-800">{detail.meta.name || '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-slate-400 mb-0.5">Status</p>
                <p className="font-semibold text-slate-800">{detail.meta.status || '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-slate-400 mb-0.5">Location</p>
                <p className="font-semibold text-slate-800">{detail.meta.location || '—'}</p>
                <p className="text-slate-400">{[detail.meta.district, detail.meta.region].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-slate-400 mb-0.5">Submitted</p>
                <p className="font-semibold text-slate-800">{fmtDateTime(detail.meta.submissionDate)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-slate-400 mb-0.5">Start → End</p>
                <p className="font-semibold text-slate-800">{fmtDateTime(detail.meta.start)}</p>
                <p className="font-semibold text-slate-800">{fmtDateTime(detail.meta.end)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-slate-400 mb-0.5">App Time / Survey Time</p>
                <p className="font-semibold text-slate-800">
                  {detail.meta.appTime != null ? `${Number(detail.meta.appTime).toFixed(1)} min` : '—'}
                  {' / '}
                  {detail.meta.fullTime != null ? `${Number(detail.meta.fullTime).toFixed(1)} min` : '—'}
                </p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-slate-400 mb-0.5">GPS Coordinates</p>
                {detail.gps.lat && detail.gps.lng ? (
                  <>
                    <p className="font-semibold text-slate-800">{detail.gps.lat.toFixed(6)}, {detail.gps.lng.toFixed(6)}</p>
                    <p className="text-slate-400">
                      {detail.gps.accuracy != null && `±${detail.gps.accuracy} m`}
                      {detail.gps.altitude != null && ` · alt ${detail.gps.altitude} m`}
                    </p>
                    {mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">View on map →</a>}
                  </>
                ) : <p className="font-semibold text-slate-800">—</p>}
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-slate-400 mb-0.5">Device</p>
                <p className="font-semibold text-slate-800 break-all">{detail.meta.deviceId || '—'}</p>
              </div>
              {detail.meta.enumeratorPhone && (
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-slate-400 mb-0.5">Phone</p>
                  <p className="font-semibold text-slate-800">{detail.meta.enumeratorPhone}</p>
                </div>
              )}
            </div>

            {/* Sections */}
            <div className="space-y-2">
              {detail.sections.map(sec => {
                const isOpen = openSections.has(sec.key)
                return (
                  <div key={sec.key} className="border border-slate-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleSection(sec.key)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                    >
                      <span className="text-sm font-semibold text-slate-700">{sec.label}</span>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        {sec.timeMinutes != null && <span>{sec.timeMinutes.toFixed(2)} min</span>}
                        <span className="bg-slate-200 text-slate-600 rounded-full px-1.5 py-0.5">{sec.answerCount}</span>
                        <span>{isOpen ? '▲' : '▼'}</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="divide-y divide-slate-100">
                        {sec.answerCount === 0 && (
                          <p className="text-xs text-slate-400 px-3 py-2">No answers recorded for this section</p>
                        )}
                        {sec.answers.map(a => (
                          <div key={a.key} className="flex items-start gap-3 px-3 py-1.5 text-xs">
                            <span className="text-slate-500 w-1/2 shrink-0">{a.label}</span>
                            <span className="text-slate-800 font-medium flex-1 break-words">{formatValue(a.value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
