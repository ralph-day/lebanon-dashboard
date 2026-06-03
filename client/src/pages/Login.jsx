export default function Login() {
  const params = new URLSearchParams(window.location.search)
  const error = params.get('error')

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6">

      {/* Card */}
      <div className="w-full max-w-sm text-center">

        {/* Logo */}
        <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-white text-base font-bold tracking-tight">IA</span>
        </div>

        <h1 className="text-xl font-semibold text-white mb-1">Dashboard</h1>
        <p className="text-slate-500 text-sm mb-8">Team access only</p>

        {error === 'unauthorized' && (
          <div className="mb-5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm text-left">
            Your account is not authorized. Contact Ralph.
          </div>
        )}
        {error === 'auth_failed' && (
          <div className="mb-5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm text-left">
            Sign-in failed. Please try again.
          </div>
        )}

        <a
          href="/auth/login"
          className="flex items-center justify-center gap-3 w-full bg-white hover:bg-slate-100 text-slate-800 font-semibold rounded-xl px-5 py-3.5 transition-colors text-sm"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </a>

      </div>

      {/* Footer */}
      <p className="absolute bottom-6 text-slate-700 text-xs">Influeanswers · Lebanon 2026</p>
    </div>
  )
}
