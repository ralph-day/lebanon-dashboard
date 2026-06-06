import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import EnumeratorProfile from './pages/EnumeratorProfile'

// Global authenticated fetch — automatically logs the user out on any 401
export function authFetch(url, opts = {}, onUnauth) {
  return fetch(url, { credentials: 'include', ...opts }).then(r => {
    if (r.status === 401 && onUnauth) { onUnauth(); return r; }
    return r;
  });
}

function EnumeratorProfileWrapper({ onLogout }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    fetch('/api/data', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .catch(() => {})
  }, [])
  if (!data) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )
  return <EnumeratorProfile data={data} />
}

function App() {
  const [user, setUser] = useState(undefined) // undefined = loading

  const handleUnauth = useCallback(() => setUser(null), [])

  useEffect(() => {
    fetch('/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(u => setUser(u))
      .catch(() => setUser(null))
  }, [])

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login onLogin={setUser} />} />
        <Route path="/enumerator/:code" element={user ? <EnumeratorProfileWrapper onLogout={handleUnauth} /> : <Navigate to="/login" />} />
        <Route path="/*" element={user ? <Dashboard user={user} onLogout={handleUnauth} onUnauth={handleUnauth} /> : <Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
