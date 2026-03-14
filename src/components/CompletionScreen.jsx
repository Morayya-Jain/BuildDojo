function CompletionScreen({ onBackToDashboard, onStartNew }) {
  return (
    <main className="p-4 max-w-2xl mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Project Completed</h1>
      <p>You finished every task in this roadmap. Nice work.</p>
      <div className="flex gap-2">
        <button type="button" className="border px-3 py-2" onClick={onBackToDashboard}>
          Back to dashboard
        </button>
        <button type="button" className="border px-3 py-2" onClick={onStartNew}>
          Start a new project
        </button>
      </div>
    </main>
  )
}

export default CompletionScreen
