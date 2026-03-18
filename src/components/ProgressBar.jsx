import { memo } from 'react'

function ProgressBar({ completedCount, totalCount }) {
  const percent = totalCount ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <section className="border-b border-slate-200 bg-white px-4 py-3 md:px-6">
      <p className="text-sm text-slate-600">
        Progress: {completedCount} of {totalCount} tasks complete ({percent}%)
      </p>
      <div className="mt-2 h-1.5 w-full max-w-72 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
      </div>
    </section>
  )
}

export default memo(ProgressBar)
