import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

function App() {
  const [user, setUser] = useState(undefined) // undefined = loading

  useEffect(() => {
    fetch('/api/data', { credentials: 'include' })
      .then(() => {})
      .catch(() => {})
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
        <Route path="/*" element={user ? <Dashboard user={user} onLogout={() => setUser(null)} /> : <Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
