import AnalysisPanel, { PublicShellHeader } from '../components/AnalysisPanel'

// Public, shareable analysis page — no sign-in, no AI tools, no report push,
// no raw-response browser. Charts + geographic view over the PII-free dataset.
export default function PublicAnalysis() {
  return (
    <div className="min-h-screen bg-slate-50">
      <PublicShellHeader subtitle="Dashboard Analysis" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <AnalysisPanel publicMode />
      </main>
    </div>
  )
}
