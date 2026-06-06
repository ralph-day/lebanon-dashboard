import { useState, useEffect, useCallback } from 'react'
import OverviewPanel from '../components/OverviewPanel'
import LocationPanel from '../components/LocationPanel'
import EnumeratorPanel from '../components/EnumeratorPanel'
import EnumeratorProgress from '../components/EnumeratorProgress'
import QAPanel from '../components/QAPanel'
import TaskBoard from '../components/TaskBoard'

const REFRESH_INTERVAL = 15 * 60 * 1000
const TABS = ['Overview', 'Field Progress', 'Locations', 'Enumerators', 'Data Quality', 'Team']
const QA_ALLOWED_EMAIL = 'infomgmtreportofficer@gmail.com'

export default function Dashboard({ user, onLogout }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const canApproveQA = user?.email === QA_ALLOWED_EMAIL
  const [activeTab, setActiveTab] = useState('Overview')
  const [notes, setNotes]         = useState([])

  useEffect(() => {
    fetch('/api/notes', { credentials: 'include' }).then(r => r.json()).then(setNotes).catch(() => {})
  }, [])
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    try {
      const r = await fetch('/api/data', { credentials: 'include' })
      if (!r.ok) throw new Error('Failed to load data')
      const json = await r.json()
      setData(json)
      setError(null)
      setCountdown(REFRESH_INTERVAL / 1000)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const interval = setInterval(() => fetchData(), REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchData])

  useEffect(() => {
    const tick = setInterval(() => setCountdown(c => c > 0 ? c - 1 : REFRESH_INTERVAL / 1000), 1000)
    return () => clearInterval(tick)
  }, [])

  const handleLogout = async () => {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' })
    onLogout()
  }

  const mins = Math.floor(countdown / 60)
  const secs = String(countdown % 60).padStart(2, '0')

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">IA</span>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-800 leading-tight">Lebanon Survey Dashboard</h1>
              <p className="text-xs text-slate-400">Emergency Response Perception Study 2026</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {data && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
                Refreshes in {mins}:{secs}
              </div>
            )}
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {refreshing ? 'Refreshing…' : '↻ Refresh now'}
            </button>
            <div className="flex items-center gap-2">
              {user.picture && <img src={user.picture} alt="" className="w-7 h-7 rounded-full" />}
              <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                Sign out
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-0 border-t border-slate-100">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
            <p className="text-slate-500 text-sm">Loading data from Google Drive…</p>
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-700 font-medium">Failed to load data</p>
            <p className="text-red-500 text-sm mt-1">{error}</p>
            <button onClick={() => fetchData(true)} className="mt-3 text-sm text-red-600 underline">Try again</button>
          </div>
        )}

        {data && !loading && (
          <>
            {activeTab === 'Overview'      && <OverviewPanel data={data} notes={notes} onNoteAdded={n => setNotes(p => [n, ...p])} onNoteDeleted={id => setNotes(p => p.filter(n => n.id !== id))} />}
            {activeTab === 'Field Progress'&& <EnumeratorProgress assignments={data.assignments || []} />}
            {activeTab === 'Locations'     && <LocationPanel locations={data.locations} notes={notes} onNoteAdded={n => setNotes(p => [n, ...p])} onNoteDeleted={id => setNotes(p => p.filter(n => n.id !== id))} />}
            {activeTab === 'Enumerators'   && <EnumeratorPanel enumerators={data.enumerators} sectionTimings={data.sectionTimings} notes={notes} onNoteAdded={n => setNotes(p => [n, ...p])} onNoteDeleted={id => setNotes(p => p.filter(n => n.id !== id))} />}
            {activeTab === 'Data Quality'  && <QAPanel qa={data.qa} canApprove={canApproveQA} notes={notes} onNoteAdded={n => setNotes(p => [n, ...p])} onNoteDeleted={id => setNotes(p => p.filter(n => n.id !== id))} />}
            {activeTab === 'Team'          && <TaskBoard currentUser={user} />}
          </>
        )}
      </main>

      {data && (
        <footer className="max-w-7xl mx-auto px-4 sm:px-6 py-4 text-xs text-slate-400 flex justify-between">
          <span>File: {data.filename}</span>
          <span>Last updated: {data.fetchedAt ? new Date(data.fetchedAt).toLocaleString() : '—'}</span>
        </footer>
      )}
    </div>
  )
}
